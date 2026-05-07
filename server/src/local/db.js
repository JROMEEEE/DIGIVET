import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE || 'DIGIVETDB',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[local-db] idle client error:', err.message);
});

export async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  if (process.env.NODE_ENV !== 'production') {
    const ms = Date.now() - start;
    console.log(`[local-db] ${ms}ms · rows=${result.rowCount} · ${text.split('\n')[0].slice(0, 80)}`);
  }
  return result;
}

export async function bootstrapSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log(`[local-db] schema bootstrapped against ${process.env.PGDATABASE || 'DIGIVETDB'}`);
}

export const dbInfo = {
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE || 'DIGIVETDB',
  user: process.env.PGUSER || 'postgres',
};
