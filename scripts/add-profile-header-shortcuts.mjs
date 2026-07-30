import pg from 'pg'

/**
 * Adds a nullable `header_shortcuts text[]` column to `profiles`. This stores a
 * per-user ordered list of catalogue keys pinned as micro-icon shortcuts in the
 * main app header. NULL/empty = no header shortcuts pinned.
 *
 * Independent from `dashboard_shortcuts` (the home "Quick links" cards) so the
 * two can be configured separately.
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
    ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS header_shortcuts text[];
  `)

  console.log('header_shortcuts column ensured on profiles.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => client.end())
