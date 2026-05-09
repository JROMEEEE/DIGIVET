-- DIGIVET local schema bootstrap (DIGIVETDB).
-- Idempotent: safe to run on every server boot.
-- Adds auto-increment sequences to the existing *_table primary-key columns
-- so INSERTs don't have to provide IDs manually.

-- Ensure tables that may not exist yet are created before the sequence loop.
CREATE TABLE IF NOT EXISTS drive_session_table (
  session_id   INT  PRIMARY KEY,
  barangay_id  INT  NOT NULL,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS user_table (
  user_id INT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS userinfo_table (
  userinfo_id INT PRIMARY KEY
);

DO $$
DECLARE
  rec RECORD;
  seq_name TEXT;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('barangay_table',       'barangay_id'),
      ('owner_table',          'owner_id'),
      ('pet_table',            'pet_id'),
      ('vet_table',            'vet_id'),
      ('userinfo_table',       'userinfo_id'),
      ('user_table',           'user_id'),
      ('vaccine_table',        'vaccine_id'),
      ('approval_id_table',    'approval_id'),
      ('drive_session_table',  'session_id')
    ) AS t(table_name, pk_col)
  LOOP
    -- Skip tables that don't exist so one missing table doesn't abort the whole block
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = rec.table_name
    ) THEN
      CONTINUE;
    END IF;

    seq_name := rec.table_name || '_' || rec.pk_col || '_seq';

    -- Create sequence if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = seq_name AND relkind = 'S') THEN
      EXECUTE format('CREATE SEQUENCE %I', seq_name);
    END IF;

    -- Attach sequence ownership to the column
    EXECUTE format('ALTER SEQUENCE %I OWNED BY %I.%I', seq_name, rec.table_name, rec.pk_col);

    -- Set column DEFAULT to nextval (only if it isn't already)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = rec.table_name
        AND column_name = rec.pk_col
        AND column_default LIKE 'nextval%'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN %I SET DEFAULT nextval(%L)',
        rec.table_name, rec.pk_col, seq_name
      );
    END IF;

    -- Sync sequence to current MAX(pk) so future inserts don't collide
    EXECUTE format(
      'SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I), 0) + 1, false)',
      seq_name, rec.pk_col, rec.table_name
    );
  END LOOP;
END $$;

-- user_profile: app-level user data, keyed by Supabase auth.users UUID.
-- When Supabase Auth is live, id comes from auth.users and local_* columns are dropped.
-- For local dev, id is auto-generated and local_email/local_password_hash act as temporary auth.
CREATE TABLE IF NOT EXISTS user_profile (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name        VARCHAR(255) NOT NULL,
  role                VARCHAR(10)  NOT NULL DEFAULT 'ADMIN',
  -- ↓ TEMPORARY local-dev-only columns — remove after Supabase Auth migration ↓
  local_email         VARCHAR(255) UNIQUE,
  local_password_hash TEXT,
  -- ↑ ─────────────────────────────────────────────────────────────────────── ↑
  created_at          TIMESTAMPTZ  DEFAULT NOW()
);

-- Add new columns to vaccine_table (idempotent).
ALTER TABLE vaccine_table ADD COLUMN IF NOT EXISTS session_id      INT;
ALTER TABLE vaccine_table ADD COLUMN IF NOT EXISTS is_office_visit BOOL NOT NULL DEFAULT FALSE;

-- ── updated_at: every table ───────────────────────────────────────
ALTER TABLE barangay_table      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE owner_table         ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE pet_table           ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE vet_table           ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE vaccine_table       ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE approval_id_table   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE drive_session_table ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE user_profile        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ── deleted_at: owner-linked tables (soft delete for sync safety) ─
ALTER TABLE owner_table   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE pet_table     ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE vaccine_table ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ── Sync log: single-row table tracking last push to Supabase ────
CREATE TABLE IF NOT EXISTS sync_log (
  id               INT         PRIMARY KEY DEFAULT 1,
  last_sync_at     TIMESTAMPTZ,          -- only set on FULL success (used as cursor)
  last_attempt_at  TIMESTAMPTZ,          -- set on every attempt (success or fail)
  synced_by        TEXT,
  records_synced   INT         DEFAULT 0,
  status           TEXT        DEFAULT 'never'  -- never | ok | partial | error
);
ALTER TABLE sync_log ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

-- ── Auto-update trigger function (shared by all tables) ───────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── Attach trigger to every table that has updated_at ─────────────
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'barangay_table', 'owner_table', 'pet_table', 'vet_table',
    'vaccine_table', 'approval_id_table', 'drive_session_table', 'user_profile'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN CONTINUE; END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at ON %I', tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_updated_at
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      tbl
    );
  END LOOP;
END $$;
