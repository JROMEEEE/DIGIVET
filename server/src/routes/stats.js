import express from 'express';
import { query } from '../local/db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const [vacRes, petRes, ownerRes, todayRes, topRes, sessionRes] = await Promise.all([
    query(`SELECT COUNT(*)::int AS count FROM vaccine_table WHERE deleted_at IS NULL`),
    query(`SELECT COUNT(*)::int AS count FROM pet_table    WHERE deleted_at IS NULL`),
    query(`SELECT COUNT(*)::int AS count FROM owner_table  WHERE deleted_at IS NULL`),
    query(`SELECT COUNT(*)::int AS count FROM vaccine_table
           WHERE vaccine_date = CURRENT_DATE AND deleted_at IS NULL`),
    query(`
      SELECT b.barangay_name, COUNT(v.vaccine_id)::int AS count
      FROM   vaccine_table v
      JOIN   pet_table p      ON p.pet_id      = v.pet_id     AND p.deleted_at IS NULL
      JOIN   owner_table o    ON o.owner_id    = p.owner_id   AND o.deleted_at IS NULL
      JOIN   barangay_table b ON b.barangay_id = o.barangay_id
      WHERE  v.deleted_at IS NULL
      GROUP  BY b.barangay_id, b.barangay_name
      ORDER  BY count DESC
      LIMIT  5
    `),
    query(`
      SELECT s.session_id, s.session_date, b.barangay_name
      FROM   drive_session_table s
      LEFT   JOIN barangay_table b ON b.barangay_id = s.barangay_id
      WHERE  s.session_date = CURRENT_DATE
      ORDER  BY s.session_id DESC
      LIMIT  1
    `),
  ]);

  const activeSession = sessionRes.rows[0] ?? null;

  let recentEntries = [];
  if (activeSession) {
    const recentRes = await query(
      `SELECT v.vaccine_id, v.vaccine_details,
              p.pet_name, p.pet_type,
              a.approval_code
       FROM   vaccine_table v
       LEFT   JOIN pet_table p         ON p.pet_id      = v.pet_id
       LEFT   JOIN approval_id_table a ON a.approval_id = v.approval_id
       WHERE  v.session_id = $1
         AND  v.deleted_at IS NULL
       ORDER  BY v.vaccine_id DESC
       LIMIT  8`,
      [activeSession.session_id],
    );
    recentEntries = recentRes.rows;
  }

  res.json({
    total_vaccinations: vacRes.rows[0].count,
    total_pets:         petRes.rows[0].count,
    total_owners:       ownerRes.rows[0].count,
    today_entries:      todayRes.rows[0].count,
    top_barangays:      topRes.rows,
    active_session:     activeSession,
    recent_entries:     recentEntries,
  });
});

export default router;
