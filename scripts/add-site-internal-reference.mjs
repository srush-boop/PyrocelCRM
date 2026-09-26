// Adds an editable "Internal Reference No" free-text field to sites.
//
// This mirrors the reference carried over from the legacy CRM. Unlike
// `sites.reference_number` (the system-assigned, locked SITE-00001 value), this
// column is user-editable and optional — offices paste in whatever reference
// the old system used so both can be searched side by side.
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
  console.log('[v0] Connected. Adding sites.internal_reference_no...')

  await client.query(`
    ALTER TABLE sites
    ADD COLUMN IF NOT EXISTS internal_reference_no text
  `)

  // Case-insensitive index so the free-text reference is quick to search.
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_sites_internal_reference_no
    ON sites (lower(internal_reference_no))
  `)

  console.log('[v0] Done. sites.internal_reference_no is ready.')
  await client.end()
}

main().catch(async (err) => {
  console.error('[v0] Migration failed:', err)
  try {
    await client.end()
  } catch {}
  process.exit(1)
})
