import express from 'express';
import { query, pool } from '../local/db.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

// Tables synced in dependency order (parents before children).
// display: column used as the human-readable label in the change log
const SYNC_TABLES = [
  { name: 'barangay_table',      pk: 'barangay_id', display: 'barangay_name',    softDelete: false },
  { name: 'vet_table',           pk: 'vet_id',       display: 'vet_name',         softDelete: false },
  { name: 'owner_table',         pk: 'owner_id',     display: 'owner_name',       softDelete: true  },
  { name: 'pet_table',           pk: 'pet_id',       display: 'pet_name',         softDelete: true  },
  { name: 'drive_session_table', pk: 'session_id',   display: 'session_date',     softDelete: false },
  { name: 'approval_id_table',   pk: 'approval_id',  display: 'approval_code',    softDelete: false },
  { name: 'vaccine_table',       pk: 'vaccine_id',   display: 'vaccine_details',  softDelete: true  },
];

/* ── Pending records for a single table ──────────────────────── */
router.get('/pending/:table', requireAuth, async (req, res, next) => {
  try {
    const cfg = SYNC_TABLES.find((t) => t.name === req.params.table);
    if (!cfg) return res.status(400).json({ error: 'Unknown table' });

    const logResult = await query('SELECT last_sync_at FROM sync_log WHERE id = 1').catch(() => ({ rows: [] }));
    const since = logResult.rows[0]?.last_sync_at ?? null;
    const { name, softDelete } = cfg;

    const active = since
      ? (await query(`SELECT * FROM ${name} WHERE updated_at > $1 ${softDelete ? 'AND deleted_at IS NULL' : ''} ORDER BY updated_at DESC LIMIT 50`, [since])).rows
      : (await query(`SELECT * FROM ${name} ${softDelete ? 'WHERE deleted_at IS NULL' : ''} ORDER BY updated_at DESC LIMIT 50`)).rows;

    const deleted = (softDelete && since)
      ? (await query(`SELECT * FROM ${name} WHERE updated_at > $1 AND deleted_at IS NOT NULL ORDER BY updated_at DESC LIMIT 20`, [since])).rows
      : [];

    res.json({ table: name, since, active, deleted });
  } catch (err) { next(err); }
});

/* ── General change log (all tables) ────────────────────────── */
router.get('/log', requireAuth, async (req, res, next) => {
  try {
    const logResult = await query('SELECT last_sync_at FROM sync_log WHERE id = 1').catch(() => ({ rows: [] }));
    const since = logResult.rows[0]?.last_sync_at ?? null;

    const entries = [];

    for (const { name, pk, display, softDelete } of SYNC_TABLES) {
      const notDel = softDelete ? 'AND deleted_at IS NULL' : '';

      const active = since
        ? (await query(`SELECT ${pk} AS pk_val, ${display} AS label, updated_at FROM ${name} WHERE updated_at > $1 ${notDel} ORDER BY updated_at DESC LIMIT 20`, [since])).rows
        : (await query(`SELECT ${pk} AS pk_val, ${display} AS label, updated_at FROM ${name} ${softDelete ? 'WHERE deleted_at IS NULL' : ''} ORDER BY updated_at DESC LIMIT 20`)).rows;

      for (const r of active) {
        entries.push({ table: name, pk_val: r.pk_val, label: r.label, type: 'upsert', at: r.updated_at });
      }

      if (softDelete && since) {
        const deleted = (await query(`SELECT ${pk} AS pk_val, ${display} AS label, updated_at FROM ${name} WHERE updated_at > $1 AND deleted_at IS NOT NULL ORDER BY updated_at DESC LIMIT 10`, [since])).rows;
        for (const r of deleted) {
          entries.push({ table: name, pk_val: r.pk_val, label: r.label, type: 'delete', at: r.updated_at });
        }
      }
    }

    entries.sort((a, b) => new Date(b.at) - new Date(a.at));
    res.json({ since, total: entries.length, entries: entries.slice(0, 100) });
  } catch (err) { next(err); }
});

/* ── Internet / Supabase reachability check ──────────────────── */
router.get('/connectivity', async (_req, res) => {
  const url = process.env.SUPABASE_URL;
  if (!url) return res.json({ online: false, reason: 'SUPABASE_URL not set' });
  try {
    const t0 = Date.now();
    const r  = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: process.env.SUPABASE_ANON_KEY ?? '' },
      signal:  AbortSignal.timeout(4000),
    });
    res.json({ online: true, latency_ms: Date.now() - t0, status: r.status });
  } catch (err) {
    res.json({ online: false, reason: err.message });
  }
});

/* ── Status ───────────────────────────────────────────────────── */
router.get('/status', requireAuth, async (req, res, next) => {
  try {
    const log = await query(
      `SELECT last_sync_at, last_attempt_at, synced_by, records_synced, status
       FROM sync_log WHERE id = 1`,
    ).catch(() => ({ rows: [] }));

    const lastSync = log.rows[0] ?? null;
    const since    = lastSync?.last_sync_at ?? null;

    // Count ALL changed rows since last sync — both active (upserts) and
    // soft-deleted (pending hard-deletes in Supabase).
    const tableCounts = await Promise.all(
      SYNC_TABLES.map(async ({ name, softDelete }) => {
        const { rows } = since
          ? await query(
              `SELECT COUNT(*)::int AS n FROM ${name}
               WHERE updated_at > $1`,
              [since],
            )
          : await query(
              // First sync: only count active rows (deletions don't exist yet)
              `SELECT COUNT(*)::int AS n FROM ${name}
               ${softDelete ? 'WHERE deleted_at IS NULL' : ''}`,
            );
        return { name, pending_count: rows[0].n };
      }),
    );

    res.json({
      supabase_url:  process.env.SUPABASE_URL ?? null,
      connected:     !!supabaseAdmin,
      tables:        tableCounts,
      last_sync:     lastSync,
      is_first_sync: !since,
    });
  } catch (err) { next(err); }
});

/* ── Push local → Supabase ────────────────────────────────────── */
router.post('/push', requireAuth, async (req, res, next) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Supabase not configured — check SUPABASE_URL and SUPABASE_SERVICE_KEY in .env' });
  }

  // Get last sync time for incremental push
  const logResult = await query(
    `SELECT last_sync_at FROM sync_log WHERE id = 1`,
  ).catch(() => ({ rows: [] }));
  const since = logResult.rows[0]?.last_sync_at ?? null;

  const results = [];
  let totalSynced = 0;

  try {
    // ── Pass 1: upsert active records (forward order) ──────────
    const upsertResults = {};
    for (const { name, pk, softDelete } of SYNC_TABLES) {
      const activeRows = since
        ? (await query(`SELECT * FROM ${name} WHERE updated_at > $1 ${softDelete ? 'AND deleted_at IS NULL' : ''}`, [since])).rows
        : (await query(`SELECT * FROM ${name} ${softDelete ? 'WHERE deleted_at IS NULL' : ''}`)).rows;

      if (activeRows.length > 0) {
        const { error } = await supabaseAdmin
          .from(name)
          .upsert(activeRows, { onConflict: pk });
        if (error) {
          results.push({ table: name, synced: 0, status: 'error', error: error.message });
          upsertResults[name] = { ok: false, count: 0 };
          continue;
        }
        totalSynced += activeRows.length;
      }
      upsertResults[name] = { ok: true, count: activeRows.length };
    }

    // ── Pass 2: hard-delete soft-deleted rows from Supabase ─────────
    const deletedPetIds   = (await query(`SELECT pet_id   FROM pet_table   WHERE deleted_at IS NOT NULL`)).rows.map(r => r.pet_id);
    const deletedOwnerIds = (await query(`SELECT owner_id FROM owner_table WHERE deleted_at IS NOT NULL`)).rows.map(r => r.owner_id);
    const deletedVaxIds   = (await query(`SELECT vaccine_id FROM vaccine_table WHERE deleted_at IS NOT NULL`)).rows.map(r => r.vaccine_id);

    // 1. Vaccines — delete by vaccine_id AND by pet_id of any deleted pet.
    //    The pet_id sweep catches vaccines that exist in Supabase but whose
    //    local soft-delete was never cascaded (e.g. after a pull).
    if (deletedPetIds.length > 0) {
      const { error } = await supabaseAdmin.from('vaccine_table').delete().in('pet_id', deletedPetIds);
      if (error) results.push({ table: 'vaccine_table', synced: upsertResults['vaccine_table']?.count ?? 0, status: 'error', error: `delete: ${error.message}` });
    }
    if (deletedVaxIds.length > 0) {
      await supabaseAdmin.from('vaccine_table').delete().in('vaccine_id', deletedVaxIds);
    }

    // 2. Pets — safe now that their vaccines are gone
    if (deletedPetIds.length > 0) {
      const { error } = await supabaseAdmin.from('pet_table').delete().in('pet_id', deletedPetIds);
      if (error) {
        results.push({ table: 'pet_table', synced: upsertResults['pet_table']?.count ?? 0, status: 'error', error: `delete: ${error.message}` });
      } else {
        totalSynced += deletedPetIds.length;
      }
    }

    // 3. Owners
    if (deletedOwnerIds.length > 0) {
      const { error } = await supabaseAdmin.from('owner_table').delete().in('owner_id', deletedOwnerIds);
      if (error) {
        results.push({ table: 'owner_table', synced: upsertResults['owner_table']?.count ?? 0, status: 'error', error: `delete: ${error.message}` });
      } else {
        totalSynced += deletedOwnerIds.length;
      }
    }

    // Consolidate results for tables not already pushed as errors
    for (const { name, softDelete } of SYNC_TABLES) {
      if (results.find((r) => r.table === name)) continue;
      const u = upsertResults[name] ?? { ok: true, count: 0 };
      results.push({ table: name, synced: u.count, status: u.count === 0 && !softDelete ? 'empty' : 'ok' });
    }

    const hasErrors    = results.some((r) => r.status === 'error');
    const overallStatus = hasErrors ? 'partial' : 'ok';

    if (!hasErrors) {
      // Full success — advance the cursor so next sync only picks up new changes
      await query(
        `INSERT INTO sync_log
           (id, last_sync_at, last_attempt_at, synced_by, records_synced, status)
         VALUES (1, NOW(), NOW(), $1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET
           last_sync_at    = NOW(),
           last_attempt_at = NOW(),
           synced_by       = $1,
           records_synced  = $2,
           status          = $3`,
        [req.user.id, totalSynced, overallStatus],
      );
    } else {
      // Partial / error — record the attempt but DO NOT advance last_sync_at.
      // Failed records still have updated_at > last_sync_at so they stay pending.
      await query(
        `INSERT INTO sync_log
           (id, last_attempt_at, synced_by, records_synced, status)
         VALUES (1, NOW(), $1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET
           last_attempt_at = NOW(),
           synced_by       = $1,
           records_synced  = $2,
           status          = $3`,
        [req.user.id, totalSynced, overallStatus],
      );
    }

    res.json({ status: overallStatus, results, total_synced: totalSynced });
  } catch (err) { next(err); }
});

/* ── Mirror status (lightweight — count + max updated_at per table) ─ */
router.get('/mirror-status', requireAuth, async (req, res, next) => {
  if (!supabaseAdmin) return res.json({ reachable: false, mirrored: false, reason: 'Supabase not configured' });
  try {
    const tables = [];
    let totalDiffs = 0;

    for (const { name, pk, softDelete } of SYNC_TABLES) {
      // Local: active rows only + newest updated_at
      const localRes = await query(
        `SELECT COUNT(*)::int AS cnt, MAX(updated_at) AS newest
         FROM ${name} ${softDelete ? 'WHERE deleted_at IS NULL' : ''}`,
      );
      const localCnt    = localRes.rows[0].cnt;
      const localNewest = localRes.rows[0].newest;

      // Supabase: active rows only (mirror deleted_at filter so counts match)
      const sbQuery = supabaseAdmin.from(name).select('*', { count: 'exact', head: true });
      if (softDelete) sbQuery.is('deleted_at', null);
      const { count: sbCount, error: countErr } = await sbQuery;
      if (countErr) { tables.push({ name, error: countErr.message }); continue; }

      const newestQuery = supabaseAdmin.from(name).select(`updated_at`).order('updated_at', { ascending: false }).limit(1);
      if (softDelete) newestQuery.is('deleted_at', null);
      const { data: newestData, error: newestErr } = await newestQuery;
      if (newestErr) { tables.push({ name, error: newestErr.message }); continue; }

      const sbNewest  = newestData?.[0]?.updated_at ?? null;
      const countDiff = (sbCount ?? 0) !== localCnt;
      const newerInSb = sbNewest && localNewest
        ? new Date(sbNewest) > new Date(localNewest)
        : (sbNewest && !localNewest);

      const hasChanges = countDiff || newerInSb;
      if (hasChanges) totalDiffs++;

      tables.push({
        name,
        local_count:       localCnt,
        supabase_count:    sbCount ?? 0,
        local_newest:      localNewest,
        supabase_newest:   sbNewest,
        count_diff:        countDiff,
        newer_in_supabase: newerInSb,
        in_sync:           !hasChanges,
      });
    }

    res.json({
      reachable:   true,
      mirrored:    totalDiffs === 0,
      total_diffs: totalDiffs,
      checked_at:  new Date().toISOString(),
      tables,
    });
  } catch (err) { next(err); }
});

/* ── Compare local ↔ Supabase ────────────────────────────────────── */
router.get('/compare', requireAuth, async (req, res, next) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured' });
  try {
    const results = [];

    for (const { name, pk, display, softDelete } of SYNC_TABLES) {
      // Local rows (all, including soft-deleted so we can detect them)
      const localRows = (await query(
        `SELECT ${pk} AS pk_val, ${display} AS label, updated_at ${softDelete ? ', deleted_at' : ''} FROM ${name}`,
      )).rows;

      // Supabase rows
      const { data: sbRows, error } = await supabaseAdmin
        .from(name)
        .select(`${pk}, ${display}, updated_at`);

      if (error) {
        results.push({ table: name, error: error.message });
        continue;
      }

      const localMap = new Map(localRows.map((r) => [String(r.pk_val), r]));
      const sbMap    = new Map((sbRows ?? []).map((r) => [String(r[pk]), r]));

      const local_only    = []; // active locally, missing from Supabase
      const supabase_only = []; // in Supabase, not in local
      const diverged      = []; // in both but updated_at differs

      for (const [pkv, lr] of localMap) {
        if (softDelete && lr.deleted_at) continue; // ignore local soft-deletes
        if (!sbMap.has(pkv)) {
          local_only.push({ pk_val: pkv, label: lr.label, updated_at: lr.updated_at });
        } else {
          const sbr    = sbMap.get(pkv);
          const diff_ms = Math.abs(new Date(lr.updated_at) - new Date(sbr.updated_at));
          if (diff_ms > 1000) {
            diverged.push({
              pk_val:               pkv,
              label:                lr.label,
              local_updated_at:     lr.updated_at,
              supabase_updated_at:  sbr.updated_at,
              newer:                new Date(lr.updated_at) > new Date(sbr.updated_at) ? 'local' : 'supabase',
            });
          }
        }
      }

      for (const [pkv, sbr] of sbMap) {
        const lr = localMap.get(pkv);
        if (!lr || (softDelete && lr.deleted_at)) {
          supabase_only.push({ pk_val: pkv, label: sbr[display], updated_at: sbr.updated_at });
        }
      }

      results.push({
        table:          name,
        local_count:    localRows.filter((r) => !softDelete || !r.deleted_at).length,
        supabase_count: (sbRows ?? []).length,
        local_only,
        supabase_only,
        diverged,
        in_sync: local_only.length === 0 && supabase_only.length === 0 && diverged.length === 0,
      });
    }

    const total_diffs = results.reduce(
      (s, t) => s + (t.local_only?.length ?? 0) + (t.supabase_only?.length ?? 0) + (t.diverged?.length ?? 0), 0,
    );
    res.json({ results, total_diffs, checked_at: new Date().toISOString() });
  } catch (err) { next(err); }
});

/* ── Pull Supabase → local ───────────────────────────────────────── */
router.post('/pull', requireAuth, async (req, res, next) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured' });

  const results   = [];
  let totalPulled = 0;

  try {
    // Pre-load local column names per table so we never reference a column
    // that exists in Supabase but not locally (e.g. pending_password).
    const localCols = {};
    for (const { name } of SYNC_TABLES) {
      const { rows } = await query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [name],
      );
      localCols[name] = new Set(rows.map((r) => r.column_name));
    }

    for (const { name, pk, softDelete } of SYNC_TABLES) {
      // Fetch full rows from Supabase
      const { data: sbRows, error } = await supabaseAdmin.from(name).select('*');
      if (error) {
        results.push({ table: name, upserted: 0, deleted: 0, status: 'error', error: error.message });
        continue;
      }

      const sbPKs  = new Set((sbRows ?? []).map((r) => String(r[pk])));

      let upserted = 0;
      let deleted  = 0;

      // ── Apply each Supabase row to local ──────────────────────
      const rowErrors = [];
      for (const row of sbRows ?? []) {
        // Only keep columns that exist locally — drops Supabase-only extras
        const safeCols = Object.keys(row).filter(
          (c) => localCols[name].has(c) && c !== 'updated_at',
        );
        const allCols = [pk, ...safeCols.filter((c) => c !== pk)];
        const allVals = allCols.map((c) => row[c]);
        const holders = allCols.map((_, i) => `$${i + 1}`).join(', ');
        const sets    = allCols.filter((c) => c !== pk).map((c) => `${c} = EXCLUDED.${c}`).join(', ');

        try {
          await query(
            `INSERT INTO ${name} (${allCols.join(', ')})
             VALUES (${holders})
             ON CONFLICT (${pk}) DO UPDATE SET ${sets}`,
            allVals,
          );
          upserted++;
        } catch (rowErr) {
          rowErrors.push(`#${row[pk]}: ${rowErr.message}`);
        }
      }

      // ── Remove rows that no longer exist in Supabase ──────────
      if (softDelete) {
        const { rows: activeLocal } = await query(
          `SELECT ${pk} FROM ${name} WHERE deleted_at IS NULL`,
        );
        const onlyLocal = activeLocal.map((r) => String(r[pk])).filter((v) => !sbPKs.has(v));
        if (onlyLocal.length > 0) {
          // Cascade: if removing pets, also soft-delete their vaccines
          if (name === 'pet_table') {
            await query(
              `UPDATE vaccine_table SET deleted_at = NOW()
               WHERE pet_id = ANY($1::int[]) AND deleted_at IS NULL`,
              [onlyLocal],
            );
          }
          await query(
            `UPDATE ${name} SET deleted_at = NOW()
             WHERE ${pk} = ANY($1::int[]) AND deleted_at IS NULL`,
            [onlyLocal],
          );
          deleted = onlyLocal.length;
        }
      } else {
        const { rows: allLocal } = await query(`SELECT ${pk} FROM ${name}`);
        const onlyLocal = allLocal.map((r) => String(r[pk])).filter((v) => !sbPKs.has(v));
        if (onlyLocal.length > 0) {
          await query(`DELETE FROM ${name} WHERE ${pk} = ANY($1::int[])`, [onlyLocal]);
          deleted = onlyLocal.length;
        }
      }

      totalPulled += upserted + deleted;
      results.push({
        table:    name,
        upserted,
        deleted,
        status:   rowErrors.length > 0 ? 'partial' : 'ok',
        errors:   rowErrors.length > 0 ? rowErrors : undefined,
      });
    }

    // Advance last_sync_at so trigger-bumped updated_at values don't show as pending
    await query(
      `INSERT INTO sync_log (id, last_sync_at, last_pull_at, status)
       VALUES (1, NOW(), NOW(), 'ok')
       ON CONFLICT (id) DO UPDATE SET
         last_sync_at = NOW(), last_pull_at = NOW(), status = 'ok'`,
    );

    res.json({ status: 'ok', results, total_pulled: totalPulled });
  } catch (err) { next(err); }
});

export default router;
