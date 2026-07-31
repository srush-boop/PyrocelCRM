import pg from 'pg'

/**
 * Call time estimates feature.
 *
 * 1. `tasks.attend_time_minutes` — the time we would like the engineer to allow
 *    to attend site (captured when raising ANY call). Defaults are applied in
 *    the app (0.5 hr) — the column is nullable so legacy rows stay untouched.
 * 2. `tasks.expected_on_site_minutes` — the expected time on site captured when
 *    raising a call.
 * 3. `service_visit_types.expected_minutes` — the manually-entered expected time
 *    to complete a visit of this type, used as the tile "approximate time to
 *    complete" fallback when there isn't enough completed history to learn from.
 * 4. `service_types.expected_visit_minutes` — a service-level default expected
 *    time, used when a service has no per-visit override (e.g. single-visit
 *    services with no visit types configured).
 *
 * All columns are nullable integers (minutes). No backfill required.
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
      ADD COLUMN IF NOT EXISTS attend_time_minutes integer,
      ADD COLUMN IF NOT EXISTS expected_on_site_minutes integer;
  `)

  await client.query(`
    ALTER TABLE service_visit_types
      ADD COLUMN IF NOT EXISTS expected_minutes integer;
  `)

  await client.query(`
    ALTER TABLE service_types
      ADD COLUMN IF NOT EXISTS expected_visit_minutes integer;
  `)

  console.log('Call time estimate columns ensured.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => client.end())
