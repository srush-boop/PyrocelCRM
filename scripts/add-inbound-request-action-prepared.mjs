import pg from 'pg'

/**
 * Adds `action_prepared_at` to `inbound_requests`. This backs AI-prepared
 * OPERATIONAL actions (book a reactive call, prepare a priced quote, log a
 * chase-up): at triage the AI researches real data and drafts the action
 * parameters into `suggested_actions[0].payload`; `action_prepared_at` marks the
 * request as "ready for a human to confirm & execute".
 *
 * The richer parameters (quote lines, call date/urgency/notes, chase note) live
 * in the existing `suggested_actions` jsonb payload — no new columns needed for
 * those. This one timestamp is NULLABLE and RLS-neutral (existing admin/office
 * policy on the table applies).
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
    ALTER TABLE inbound_requests
      ADD COLUMN IF NOT EXISTS action_prepared_at timestamptz;
  `)

  console.log('inbound_requests action_prepared_at column ensured.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => client.end())
