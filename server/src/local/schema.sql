-- DIGIVET local schema bootstrap (DIGIVETDB).
-- Idempotent: safe to run on every server boot.
-- Adds auto-increment sequences to the existing *_table primary-key columns
-- so INSERTs don't have to provide IDs manually.

-- Create drive_session_table before sequence setup so the DO block can attach to it.
CREATE TABLE IF NOT EXISTS drive_session_table (
  session_id   INT  PRIMARY KEY,
  barangay_id  INT  NOT NULL,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE
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

-- Add new columns to vaccine_table (idempotent).
-- session_id links a vaccination to a barangay drive session (nullable = office visit with no session).
-- is_office_visit distinguishes clinic visits from on-site drive vaccinations.
ALTER TABLE vaccine_table ADD COLUMN IF NOT EXISTS session_id      INT;
ALTER TABLE vaccine_table ADD COLUMN IF NOT EXISTS is_office_visit BOOL NOT NULL DEFAULT FALSE;
