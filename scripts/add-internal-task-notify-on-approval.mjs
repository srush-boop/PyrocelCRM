import pg from 'pg'

/**
 * Adds `notify_on_approval_user_ids text[]` to `internal_task_templates`.
 *
 * When an approval-required form is APPROVED, these nominated profile ids (e.g.
 * a finance / payroll group) receive an in-app notification. Per-form setting;
 * empty = notify no one beyond the submitter.
 */
const { Client } = pg

// Supabase's pooled URL includes sslmode=require which node-postgres' verify-full
// rejects against the self-signed chain; strip it and disable strict verify.
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
    ADD COLUMN IF NOT EXISTS notify_on_approval_user_ids text[] NOT NULL DEFAULT '{}';
  `)

  console.log('notify_on_approval_user_ids column ensured on internal_task_templates.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => client.end())
