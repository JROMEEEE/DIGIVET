import express from 'express';

const router = express.Router();
const R_API  = process.env.R_PLUMBER_URL ?? 'http://localhost:8000';

async function proxyToR(path, res) {
  try {
    const upstream = await fetch(`${R_API}${path}`, { signal: AbortSignal.timeout(5000) });
    const data = await upstream.json();
    res.status(upstream.ok ? 200 : upstream.status).json(data);
  } catch (err) {
    res.status(503).json({
      status:  'offline',
      error:   'R analytics engine is not reachable',
      detail:  err.message,
      hint:    'Run:  Rscript r-api/run.R  (or source run.R in RStudio)',
      r_url:   R_API,
    });
  }
}

router.get('/ping',    (_req, res) => proxyToR('/ping',    res));
router.get('/test-db', (_req, res) => proxyToR('/test-db', res));

router.get('/barangay-coverage', (req, res) => {
  const qs = new URLSearchParams();
  if (req.query.q)     qs.set('q',     req.query.q);
  if (req.query.limit) qs.set('limit', req.query.limit);
  const s = qs.toString();
  proxyToR(`/barangay-coverage${s ? '?' + s : ''}`, res);
});

export default router;
