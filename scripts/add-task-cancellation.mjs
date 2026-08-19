import pg from 'pg'

/**
 * Call cancellation with a forced reason.
 *
 * Office/admin can cancel an open call, but the reason is mandatory (enforced in
 * the server action + UI). These audit columns capture WHY, WHO and WHEN:
 *   - tasks.cancellation_reason — free-text reason (required at cancel time)
 *   - tasks.cancelled_by        — the staff member who cancelled (profiles.id)
 *   - tasks.cancelled_at        — when it was cancelled
 *
 * All nullable — legacy/open calls simply have them null. The `cancelled`
 * status itself already exists in the TaskStatus enum.
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
    ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
      ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS cancellation_reason text;
  `)

  console.log('Task cancellation columns ensured.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => client.end())
