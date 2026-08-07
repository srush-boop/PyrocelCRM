// Adds manager-escalation tracking to recurring internal-task instances.
// When an assigned user misses a recurring task (due_at passed, not completed),
// it surfaces to their manager on the Approvals page as a notification. The
// manager can send a reminder (stamped in escalation_reminded_at) or dismiss the
// escalation (escalation_dismissed_at/by), which removes it from their list.
import pg from 'pg'

const url = (process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || '').replace(
  /[?&]sslmode=[^&]+/,
  '',
)
if (!url) {
  console.error('POSTGRES_URL_NON_POOLING / POSTGRES_URL not set')
  process.exit(1)
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()
  await client.query(`
    alter table internal_task_instances
      add column if not exists escalation_reminded_at timestamptz,
      add column if not exists escalation_dismissed_at timestamptz,
      add column if not exists escalation_dismissed_by uuid references profiles(id)
  `)
  // Partial index for the manager escalation query (open, not-dismissed rows).
  await client.query(`
    create index if not exists idx_iti_open_escalations
      on internal_task_instances (due_at)
      where escalation_dismissed_at is null and status <> 'completed'
  `)
  console.log('OK: escalation dismissal/reminder columns added')
  await client.end()
}

main().catch(async (e) => {
  console.error(e)
  await client.end().catch(() => {})
  process.exit(1)
})
