import pg from 'pg'

/**
 * Internal Tasks: configurable monthly due date + multiple submissions.
 *
 * 1) Monthly due-date rule columns on internal_task_templates:
 *    - monthly_due_rule ('period_end' | 'day_of_month' | 'weekday_of_month')
 *    - monthly_due_day     (1..31, for 'day_of_month')
 *    - monthly_due_week    ('first'|'second'|'third'|'fourth'|'last')
 *    - monthly_due_weekday (0=Sun..6=Sat, for 'weekday_of_month')
 *    Lets an admin set e.g. "due on the 1st" or "the last Monday of the month".
 *    Existing rows default to 'period_end' → identical behaviour to before.
 *
 * 2) allow_multiple flag on internal_task_templates: when true a user may submit
 *    extra instances for the same period after the scheduled one is complete.
 *
 * 3) An `attempt` column on internal_task_instances (0 = scheduled instance,
 *    1..N = user-initiated extras) folded into the uniqueness key so the
 *    idempotent generator (attempt 0) still can't duplicate, while extras are
 *    allowed. The old 3-column unique constraint is replaced with a 4-column one
 *    so supabase-js upsert (full-index inference) keeps working.
 */
const { Client } = pg

const rawUrl =
  process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL || ''
if (!rawUrl) {
  console.error('No POSTGRES_URL / DATABASE_URL in environment')
  process.exit(1)
}
const connectionString = rawUrl.replace(/[?&]sslmode=[^&]+/, '')
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()

  await client.query(`
    ALTER TABLE internal_task_templates
      ADD COLUMN IF NOT EXISTS monthly_due_rule text NOT NULL DEFAULT 'period_end',
      ADD COLUMN IF NOT EXISTS monthly_due_day int,
      ADD COLUMN IF NOT EXISTS monthly_due_week text,
      ADD COLUMN IF NOT EXISTS monthly_due_weekday int,
      ADD COLUMN IF NOT EXISTS allow_multiple boolean NOT NULL DEFAULT false;
  `)

  await client.query(`
    ALTER TABLE internal_task_instances
      ADD COLUMN IF NOT EXISTS attempt int NOT NULL DEFAULT 0;
  `)

  // Replace any unique constraint that keys on period_start with a 4-column
  // version that also includes attempt, so extra submissions don't collide.
  await client.query(`
    DO $$
    DECLARE r record;
    BEGIN
      FOR r IN
        SELECT c.conname
        FROM pg_constraint c
        WHERE c.conrelid = 'internal_task_instances'::regclass
          AND c.contype = 'u'
          AND EXISTS (
            SELECT 1 FROM unnest(c.conkey) k
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
            WHERE a.attname = 'period_start'
          )
      LOOP
        EXECUTE format('ALTER TABLE internal_task_instances DROP CONSTRAINT %I', r.conname);
      END LOOP;
    END $$;
  `)

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'internal_task_instances'::regclass
          AND conname = 'internal_task_instances_template_user_period_attempt_key'
      ) THEN
        ALTER TABLE internal_task_instances
          ADD CONSTRAINT internal_task_instances_template_user_period_attempt_key
          UNIQUE (template_id, user_id, period_start, attempt);
      END IF;
    END $$;
  `)

  console.log('Internal task recurrence + multiple-submission schema ensured.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => client.end())
