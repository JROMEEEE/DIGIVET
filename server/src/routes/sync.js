import express from 'express';
import { query } from '../local/db.js';
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
    for (const { name, pk, softDelete } of SYNC_TABLES) {

      // ── 1. Upsert active records ───────────────────────────
      const activeRows = since
        ? (await query(`SELECT * FROM ${name} WHERE updated_at > $1 ${softDelete ? 'AND deleted_at IS NULL' : ''}`, [since])).rows
        : (await query(`SELECT * FROM ${name} ${softDelete ? 'WHERE deleted_at IS NULL' : ''}`)).rows;

      let upsertOk = true;
      if (activeRows.length > 0) {
        const { error } = await supabaseAdmin
          .from(name)
          .upsert(activeRows, { onConflict: pk });
        if (error) {
          results.push({ table: name, synced: 0, status: 'error', error: error.message });
          upsertOk = false;
        } else {
          totalSynced += activeRows.length;
        }
      }

      // ── 2. Hard-delete soft-deleted rows from Supabase ─────
      let deleteOk = true;
      if (softDelete && upsertOk) {
        const deletedRows = since
          ? (await query(`SELECT ${pk} FROM ${name} WHERE updated_at > $1 AND deleted_at IS NOT NULL`, [since])).rows
          : [];

        if (deletedRows.length > 0) {
          const ids = deletedRows.map((r) => r[pk]);
          const { error } = await supabaseAdmin
            .from(name)
            .delete()
            .in(pk, ids);
          if (error) {
            results.push({ table: name, synced: activeRows.length, status: 'error', error: `delete: ${error.message}` });
            deleteOk = false;
          } else {
            totalSynced += deletedRows.length;
          }
        }
      }

      if (upsertOk && deleteOk) {
        results.push({
          table: name,
          synced: activeRows.length,
          status: activeRows.length === 0 && !softDelete ? 'empty' : 'ok',
        });
      }
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

export default router;
