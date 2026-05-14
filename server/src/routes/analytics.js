import express from 'express';
import { query } from '../local/db.js';
import { sanitizeError } from '../lib/sanitizeError.js';

const router = express.Router();
const R_API  = process.env.R_PLUMBER_URL ?? 'http://localhost:8000';

async function proxyToR(path, res) {
  try {
    const upstream = await fetch(`${R_API}${path}`, { signal: AbortSignal.timeout(5000) });
    const data = await upstream.json();
    res.status(upstream.ok ? 200 : upstream.status).json(data);
  } catch {
    res.status(503).json({
      status: 'offline',
      error:  'R analytics engine is not reachable',
      hint:   'Run:  Rscript r-api/run.R  (or source run.R in RStudio)',
    });
  }
}

router.get('/ping',    (_req, res) => proxyToR('/ping',    res));
router.get('/test-db', (_req, res) => proxyToR('/test-db', res));

router.get('/clustering',         (_req, res) => proxyToR('/clustering',         res));

router.get('/all-barangays-classified', async (_req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        b.barangay_id,
        b.barangay_name,
        COUNT(DISTINCT p.pet_id)::int                                      AS total_pets,
        COUNT(DISTINCT CASE WHEN v.vaccine_id IS NOT NULL
                            THEN p.pet_id END)::int                        AS vaccinated_pets,
        COUNT(DISTINCT o.owner_id)::int                                    AS total_owners
      FROM barangay_table b
      LEFT JOIN owner_table   o ON o.barangay_id = b.barangay_id
      LEFT JOIN pet_table     p ON p.owner_id     = o.owner_id
      LEFT JOIN vaccine_table v ON v.pet_id       = p.pet_id
      GROUP BY b.barangay_id, b.barangay_name
      ORDER BY b.barangay_name
    `);

    const classified = rows.map((r) => {
      const coverage = r.total_pets > 0
        ? Math.round((r.vaccinated_pets / r.total_pets) * 100 * 10) / 10
        : null;
      let cluster = null;
      if (coverage !== null) {
        if (coverage < 60)  cluster = 'HIGH RISK';
        else if (coverage < 80) cluster = 'MODERATE RISK';
        else cluster = 'HEALTHY';
      }
      return { ...r, coverage_rate: coverage, cluster_label: cluster };
    });

    res.json({ status: 'ok', total: classified.length, barangays: classified });
  } catch (err) {
    console.error('[analytics] error:', err.message);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Direct DB query — no R needed
router.get('/barangay-risk-detail', async (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const summary = await query(
      `SELECT b.barangay_id, b.barangay_name,
              COUNT(DISTINCT p.pet_id)::int                                     AS total_pets,
              COUNT(DISTINCT CASE WHEN v.vaccine_id IS NOT NULL
                                  THEN p.pet_id END)::int                       AS vaccinated_pets,
              COUNT(DISTINCT o.owner_id)::int                                   AS total_owners
       FROM barangay_table b
       LEFT JOIN owner_table   o ON o.barangay_id = b.barangay_id
       LEFT JOIN pet_table     p ON p.owner_id     = o.owner_id
       LEFT JOIN vaccine_table v ON v.pet_id       = p.pet_id
       WHERE b.barangay_name = $1
       GROUP BY b.barangay_id, b.barangay_name`,
      [name],
    );

    const pets = await query(
      `SELECT p.pet_id, p.pet_name, p.pet_type, p.pet_age, p.pet_color,
              o.owner_name,
              COUNT(v.vaccine_id)::int          AS vaccination_count,
              MAX(v.vaccine_date)               AS last_vaccinated,
              (COUNT(v.vaccine_id) > 0)         AS is_vaccinated
       FROM pet_table     p
       JOIN owner_table   o ON o.owner_id     = p.owner_id
       JOIN barangay_table b ON b.barangay_id  = o.barangay_id
       LEFT JOIN vaccine_table v ON v.pet_id   = p.pet_id
       WHERE b.barangay_name = $1
       GROUP BY p.pet_id, p.pet_name, p.pet_type, p.pet_age, p.pet_color, o.owner_name
       ORDER BY is_vaccinated ASC, p.pet_name ASC`,
      [name],
    );

    res.json({ barangay: summary.rows[0] ?? null, pets: pets.rows });
  } catch (err) {
    console.error('[analytics] error:', err.message);
    res.status(500).json({ error: sanitizeError(err) });
  }
});
router.get('/pet-type-breakdown', (_req, res) => proxyToR('/pet-type-breakdown', res));

router.get('/pet-type-detail', (req, res) => {
  const qs = new URLSearchParams();
  if (req.query.type) qs.set('type', req.query.type);
  proxyToR(`/pet-type-detail?${qs}`, res);
});

router.get('/monthly-detail', (req, res) => {
  const qs = new URLSearchParams();
  if (req.query.month) qs.set('month', req.query.month);
  proxyToR(`/monthly-detail?${qs}`, res);
});

router.get('/monthly-trends', (req, res) => {
  const qs = new URLSearchParams();
  if (req.query.months) qs.set('months', req.query.months);
  const s = qs.toString();
  proxyToR(`/monthly-trends${s ? '?' + s : ''}`, res);
});

router.get('/barangay-coverage', (req, res) => {
  const qs = new URLSearchParams();
  if (req.query.q)     qs.set('q',     req.query.q);
  if (req.query.limit) qs.set('limit', req.query.limit);
  const s = qs.toString();
  proxyToR(`/barangay-coverage${s ? '?' + s : ''}`, res);
});



/* ── Top vets by vaccination count (pure SQL — no R needed) ─── */
router.get('/top-vets', async (_req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT
        v.vet_id,
        v.vet_name,
        COUNT(vac.vaccine_id)::int                                                       AS total,
        SUM(CASE WHEN vac.is_office_visit  THEN 1 ELSE 0 END)::int                      AS office,
        SUM(CASE WHEN NOT vac.is_office_visit THEN 1 ELSE 0 END)::int                   AS drive,
        ROUND(COUNT(vac.vaccine_id)::numeric /
          NULLIF(SUM(COUNT(vac.vaccine_id)) OVER (), 0) * 100, 1)::float                AS pct
      FROM vet_table v
      LEFT JOIN vaccine_table vac
        ON vac.vet_id = v.vet_id AND vac.deleted_at IS NULL
      GROUP BY v.vet_id, v.vet_name
      ORDER BY total DESC
      LIMIT 10
    `);
    res.json({ status: 'ok', data: rows });
  } catch (err) { next(err); }
});

export default router;
