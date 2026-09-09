import pg from 'pg'

/**
 * Adds `questions_snapshot jsonb` to `internal_task_instances`.
 *
 * On completion, a submission stores the template's questions/blocks exactly as
 * they were at submit time, so later edits to the template never retroactively
 * change what a completed submission asked. Null on drafts and on legacy rows
 * completed before this column existed (the UI falls back to the template's
 * current questions for those).
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
    ALTER TABLE internal_task_instances
    ADD COLUMN IF NOT EXISTS questions_snapshot jsonb;
  `)

  console.log('questions_snapshot column ensured on internal_task_instances.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => client.end())
