// Adds a reason field for when a non-recurring call is completed WITHOUT an
// on-site client signature. The engineer is forced to explain why (e.g. "no
// client representative on site"), and the reason is shown on the report.
//
// Run: node --env-file-if-exists=/vercel/share/.env.project scripts/add-task-result-signature-waiver.mjs
// DDL needs the non-pooling connection.
import pg from 'pg'

const connectionString = process.env.POSTGRES_URL_NON_POOLING
if (!connectionString) {
  console.error('[v0] Missing POSTGRES_URL_NON_POOLING')
  process.exit(1)
}

const client = new pg.Client({ connectionString: connectionString.replace(/[?&]sslmode=[^&]+/, '') })

async function main() {
  await client.connect()
  await client.query(`
    ALTER TABLE task_results
      ADD COLUMN IF NOT EXISTS client_signature_waived_reason text;
  `)
  console.log('[v0] Added task_results.client_signature_waived_reason')
}

main()
  .catch((err) => {
    console.error('[v0] Migration failed:', err)
    process.exit(1)
  })
  .finally(() => client.end())
