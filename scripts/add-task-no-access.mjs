import pg from 'pg'

/**
 * "No access" call outcome + office rearrange/rebook workflow.
 *
 * An engineer can return a call marked "no access" (attended but couldn't get
 * in). The outcome is stored on task_results.overall_status = 'no_access', but we
 * also denormalise a few fields onto tasks so the office queue can be built with
 * a single query and the report can state the reason without a join:
 *   - tasks.no_access_at            — when the engineer returned it (queue key)
 *   - tasks.no_access_reason        — free-text reason given by the engineer
 *   - tasks.no_access_resolved_at   — when the office actioned it
 *   - tasks.no_access_resolved_by   — the staff member who actioned it
 *   - tasks.no_access_resolution    — 'rearranged' | 'dismissed'
 *   - tasks.no_access_rebooked_task_id — the new call created when rearranging
 *
 * All nullable — a call is only in the no-access queue while
 * no_access_at IS NOT NULL AND no_access_resolved_at IS NULL.
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
    ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS no_access_at timestamptz,
      ADD COLUMN IF NOT EXISTS no_access_reason text,
      ADD COLUMN IF NOT EXISTS no_access_resolved_at timestamptz,
      ADD COLUMN IF NOT EXISTS no_access_resolved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS no_access_resolution text,
      ADD COLUMN IF NOT EXISTS no_access_rebooked_task_id uuid REFERENCES tasks(id) ON DELETE SET NULL;
  `)

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tasks_no_access_resolution_check'
      ) THEN
        ALTER TABLE tasks
          ADD CONSTRAINT tasks_no_access_resolution_check
          CHECK (no_access_resolution IS NULL OR no_access_resolution IN ('rearranged', 'dismissed'));
      END IF;
    END $$;
  `)

  // Partial index over the open no-access queue for a fast dashboard read.
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_tasks_no_access_open
      ON tasks (no_access_at)
      WHERE no_access_at IS NOT NULL AND no_access_resolved_at IS NULL;
  `)

  console.log('Task no-access columns, constraint and index ensured.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => client.end())
