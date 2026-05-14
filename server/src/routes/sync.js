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
  // user_profile: push-only (UUID PK, excluded from pull/mirror).
  // strip removes local-only auth columns before sending to Supabase.
  {
    name: 'user_profile', pk: 'id', display: 'display_name', softDelete: false,
    strip: (row) => { const { local_password_hash, ...rest } = row; return rest; },
    mirrorSkip: true,
  },
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
router.get('/connectivity', requireAuth, async (_req, res) => {
  const url = process.env.SUPABASE_URL;
  if (!url) return res.json({ online: false });
  try {
    const t0 = Date.now();
    const r  = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: process.env.SUPABASE_ANON_KEY ?? '' },
      signal:  AbortSignal.timeout(4000),
    });
    res.json({ online: true, latency_ms: Date.now() - t0, status: r.status });
  } catch {
    res.json({ online: false });
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

    // Only tell the client whether Supabase is configured — never expose the full URL
    const rawUrl = process.env.SUPABASE_URL ?? null;
    const maskedUrl = rawUrl ? rawUrl.replace(/https:\/\/([^.]+).*/, 'https://[project].supabase.co') : null;

    res.json({
      supabase_url:  maskedUrl,
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

  const results = [];
  let totalSynced = 0;

  try {
    // Fetch cursor INSIDE try so any DB failure is caught and reported.
    const logResult = await query(`SELECT last_sync_at FROM sync_log WHERE id = 1`).catch(() => ({ rows: [] }));
    const since = logResult.rows[0]?.last_sync_at ?? null;

    if (!since) console.warn('[sync/push] No last_sync_at — full table scan (first push or reset)');
    // ── Pass 1: upsert active records (forward order) ──────────
    const upsertResults = {};
    for (const { name, pk, softDelete, strip } of SYNC_TABLES) {
      const activeRows = since
        ? (await query(`SELECT * FROM ${name} WHERE updated_at > $1 ${softDelete ? 'AND deleted_at IS NULL' : ''}`, [since])).rows
        : (await query(`SELECT * FROM ${name} ${softDelete ? 'WHERE deleted_at IS NULL' : ''}`)).rows;

      if (activeRows.length > 0) {
        const payload = strip ? activeRows.map(strip) : activeRows;
        const { error } = await supabaseAdmin
          .from(name)
          .upsert(payload, { onConflict: pk });
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
    // Scope to updated_at > last_sync so we don't re-send deletes that
    // were already processed by a previous push.
    const sinceFilter = since
      ? `WHERE deleted_at IS NOT NULL AND updated_at > '${since}'`
      : `WHERE deleted_at IS NOT NULL`;

    const deletedPetIds   = (await query(`SELECT pet_id    FROM pet_table    ${sinceFilter}`)).rows.map(r => r.pet_id);
    const deletedOwnerIds = (await query(`SELECT owner_id  FROM owner_table  ${sinceFilter}`)).rows.map(r => r.owner_id);
    const deletedVaxIds   = (await query(`SELECT vaccine_id FROM vaccine_table ${sinceFilter}`)).rows.map(r => r.vaccine_id);

    // Cascade order: vaccines → pets → owners
    // Each step also sweeps by parent ID so orphaned Supabase rows can't block deletes.

    // 1. Vaccines — sweep by pet_id (covers all pets/owners being deleted)
    if (deletedPetIds.length > 0) {
      await supabaseAdmin.from('vaccine_table').delete().in('pet_id', deletedPetIds);
    }
    // Also cascade vaccines for deleted owners (fetch their pets from Supabase)
    if (deletedOwnerIds.length > 0) {
      const { data: ownerPets } = await supabaseAdmin.from('pet_table').select('pet_id').in('owner_id', deletedOwnerIds);
      const ownerPetIds = (ownerPets ?? []).map(r => r.pet_id);
      if (ownerPetIds.length > 0) {
        await supabaseAdmin.from('vaccine_table').delete().in('pet_id', ownerPetIds);
      }
    }
    if (deletedVaxIds.length > 0) {
      await supabaseAdmin.from('vaccine_table').delete().in('vaccine_id', deletedVaxIds);
    }

    // 2. Pets — sweep by owner_id so Supabase-side orphan pets can't block owner deletes
    if (deletedOwnerIds.length > 0) {
      await supabaseAdmin.from('pet_table').delete().in('owner_id', deletedOwnerIds);
    }
    if (deletedPetIds.length > 0) {
      const { error } = await supabaseAdmin.from('pet_table').delete().in('pet_id', deletedPetIds);
      if (error) {
        results.push({ table: 'pet_table', synced: upsertResults['pet_table']?.count ?? 0, status: 'error', error: `delete: ${error.message}` });
      } else {
        totalSynced += deletedPetIds.length;
      }
    }

    // 3. Owners — safe now that their pets are gone
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

    // Baseline = MAX(last_sync_at, last_pull_at) so that:
    //   • After push  → Supabase trigger bumps are within the 60 s grace window
    //   • After pull  → the edit we just pulled is before the baseline → no false "Supabase newer"
    const logRow = (await query('SELECT last_sync_at, last_pull_at FROM sync_log WHERE id = 1').catch(() => ({ rows: [] }))).rows[0];
    const lastSyncAt = logRow?.last_sync_at ?? null;
    const lastPullAt = logRow?.last_pull_at ?? null;
    const baselineAt = (lastSyncAt && lastPullAt)
      ? (new Date(lastSyncAt) > new Date(lastPullAt) ? lastSyncAt : lastPullAt)
      : (lastSyncAt ?? lastPullAt ?? null);

    for (const { name, pk, softDelete, mirrorSkip } of SYNC_TABLES) {
      if (mirrorSkip) continue;
      // Local: active rows only + newest updated_at
      const localRes = await query(
        `SELECT COUNT(*)::int AS cnt, MAX(updated_at) AS newest
         FROM ${name} ${softDelete ? 'WHERE deleted_at IS NULL' : ''}`,
      );
      const localCnt    = localRes.rows[0].cnt;
      const localNewest = localRes.rows[0].newest;

      // Supabase: single query for count + newest (halves API calls vs two separate queries)
      const sbQ = supabaseAdmin
        .from(name)
        .select('updated_at', { count: 'exact' })
        .order('updated_at', { ascending: false })
        .limit(1);
      if (softDelete) sbQ.is('deleted_at', null);
      const { data: sbData, count: sbCount, error: sbErr } = await sbQ;
      if (sbErr) { tables.push({ name, error: sbErr.message }); continue; }

      const sbNewest  = sbData?.[0]?.updated_at ?? null;
      // Only flag count_diff when Supabase has MORE rows than local.
      // Local having more means there are pending pushes — the push counter handles that.
      const countDiff = (sbCount ?? 0) > localCnt;

      // "Supabase has newer data" = Supabase has a row updated AFTER the baseline + 60 s.
      // The 60 s grace period absorbs Supabase's own set_updated_at() trigger firing
      // on our push, and the baseline shifts to last_pull_at after a pull so just-pulled
      // edits don't keep showing as "newer".
      const baseline = baselineAt
        ? new Date(new Date(baselineAt).getTime() + 60_000).toISOString()
        : null;
      const newerInSb = sbNewest
        ? baseline
          ? new Date(sbNewest) > new Date(baseline)
          : true
        : false;

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
  const client    = await pool.connect();

  try {
    // Pre-load local column names per table so we never reference a column
    // that exists in Supabase but not locally (e.g. pending_password).
    const localCols = {};
    for (const { name } of SYNC_TABLES) {
      const { rows } = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [name],
      );
      localCols[name] = new Set(rows.map((r) => r.column_name));
    }

    // Wrap all upserts in one transaction with app.pulling = 'true' so the
    // set_updated_at() trigger skips bumping updated_at for pulled rows.
    // This preserves Supabase's original timestamps so nothing shows as
    // pending-push after the pull.
    await client.query('BEGIN');
    await client.query("SET LOCAL app.pulling = 'true'");

    // user_profile uses UUID PK — the ::int[] casts in the pull deletion logic
    // would fail, so exclude it from pull. It syncs via syncRecord() on write.
    const PULL_TABLES = SYNC_TABLES.filter((t) => t.name !== 'user_profile');

    for (const { name, pk, softDelete } of PULL_TABLES) {
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
          await client.query(
            `INSERT INTO ${name} (${allCols.join(', ')})
             VALUES (${holders})
             ON CONFLICT (${pk}) DO UPDATE SET ${sets}`,
            allVals,
          );
          upserted++;
        } catch (rowErr) {
          // FK / unique violations are structural — log and skip the row.
          // Other errors (connection, timeout) bubble up and abort the transaction.
          const isConstraintErr = ['23000','23001','23502','23503','23505','23514'].includes(rowErr.code);
          if (isConstraintErr) {
            rowErrors.push(`#${row[pk]}: ${rowErr.message}`);
            // Savepoint so the transaction stays valid after a constraint error
            await client.query('SAVEPOINT sp_row').catch(() => {});
          } else {
            throw rowErr;
          }
        }
      }

      // ── Remove rows that no longer exist in Supabase ──────────
      if (softDelete) {
        const { rows: activeLocal } = await client.query(
          `SELECT ${pk} FROM ${name} WHERE deleted_at IS NULL`,
        );
        const onlyLocal = activeLocal.map((r) => String(r[pk])).filter((v) => !sbPKs.has(v));
        if (onlyLocal.length > 0) {
          if (name === 'pet_table') {
            await client.query(
              `UPDATE vaccine_table SET deleted_at = NOW()
               WHERE pet_id = ANY($1::int[]) AND deleted_at IS NULL`,
              [onlyLocal],
            );
          }
          await client.query(
            `UPDATE ${name} SET deleted_at = NOW()
             WHERE ${pk} = ANY($1::int[]) AND deleted_at IS NULL`,
            [onlyLocal],
          );
          deleted = onlyLocal.length;
        }
      } else {
        const { rows: allLocal } = await client.query(`SELECT ${pk} FROM ${name}`);
        const onlyLocal = allLocal.map((r) => String(r[pk])).filter((v) => !sbPKs.has(v));
        if (onlyLocal.length > 0) {
          await client.query(`DELETE FROM ${name} WHERE ${pk} = ANY($1::int[])`, [onlyLocal]);
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

    await client.query('COMMIT');

    // Only advance last_pull_at — never touch last_sync_at here.
    // last_sync_at is a push-only cursor; advancing it during a pull would
    // hide locally pending records from the push counter.
    await query(
      `INSERT INTO sync_log (id, last_pull_at) VALUES (1, NOW())
       ON CONFLICT (id) DO UPDATE SET last_pull_at = NOW()`,
    );

    res.json({ status: 'ok', results, total_pulled: totalPulled });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

export default router;
