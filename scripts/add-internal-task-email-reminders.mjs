// Configurable reminder emails + line-manager escalation for internal tasks/forms.
//
//  - email_reminders: also email the assignee (not just in-app) for due-soon
//    and overdue reminders.
//  - overdue_repeat_days: once overdue, repeat the reminder every N days
//    (0 = only on the day it first goes overdue).
//  - overdue_notify_manager: also alert the assignee's line manager
//    (profiles.manager_id) when the task is overdue.
//  - notify_on_issue_manager: when a submission has any Fail/Advisory answer,
//    alert the submitter's line manager (in-app + email).
//
// DDL needs a direct (non-pooled) connection.
import pg from 'pg'

const connectionString = process.env.POSTGRES_URL_NON_POOLING
if (!connectionString) {
  console.error('[v0] POSTGRES_URL_NON_POOLING is not set')
  process.exit(1)
}

const client = new pg.Client({
  connectionString: connectionString.replace(/([?&])sslmode=[^&]+/, '$1').replace(/[?&]$/, ''),
  ssl: { rejectUnauthorized: false },
})

async function main() {
  await client.connect()
  console.log('[v0] Connected. Adding internal task reminder/escalation columns...')

  await client.query(`
    ALTER TABLE internal_task_templates
      ADD COLUMN IF NOT EXISTS email_reminders boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS overdue_repeat_days integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS overdue_notify_manager boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS notify_on_issue_manager boolean NOT NULL DEFAULT false
  `)

  await client.query(`
    ALTER TABLE internal_task_templates
      DROP CONSTRAINT IF EXISTS internal_task_templates_overdue_repeat_days_check
  `)
  await client.query(`
    ALTER TABLE internal_task_templates
      ADD CONSTRAINT internal_task_templates_overdue_repeat_days_check
      CHECK (overdue_repeat_days >= 0 AND overdue_repeat_days <= 90)
  `)

  console.log('[v0] Done.')
  await client.end()
}

main().catch(async (err) => {
  console.error('[v0] Migration failed:', err)
  try {
    await client.end()
  } catch {}
  process.exit(1)
})
