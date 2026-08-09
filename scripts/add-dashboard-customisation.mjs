// Adds per-user dashboard customisation columns to `profiles`:
//   - dashboard_hidden_tiles  text[]  : titles of built-in module tiles the
//                                       user has hidden from their dashboard.
//   - dashboard_custom_tiles  jsonb   : user-created shortcut tiles, an array of
//                                       { id, label, href, color } objects.
//   - dashboard_shortcut_colors jsonb : { shortcutKey: hex } colour coding for
//                                       the "Quick links" shortcut cards.
//
// All are additive and nullable/defaulted, so existing rows are unaffected.
// DDL needs the non-pooled connection (pooled POSTGRES_URL throws InitPostgres).
import pg from 'pg'

const url = (process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || '').replace(
  /[?&]sslmode=[^&]+/,
  '',
)

if (!url) {
  console.error('No POSTGRES_URL_NON_POOLING / POSTGRES_URL in environment.')
  process.exit(1)
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()
  console.log('Connected. Adding dashboard customisation columns…')

  await client.query(`
    ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS dashboard_hidden_tiles text[],
      ADD COLUMN IF NOT EXISTS dashboard_custom_tiles jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS dashboard_shortcut_colors jsonb NOT NULL DEFAULT '{}'::jsonb;
  `)

  console.log('Done. Columns added (idempotent).')
  await client.end()
}

main().catch(async (err) => {
  console.error('Migration failed:', err)
  try {
    await client.end()
  } catch {}
  process.exit(1)
})
