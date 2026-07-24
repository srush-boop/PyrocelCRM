// One-off migration: give routes an explicit day_of_week so the visiting day is
// a real, stored part of a route rather than being parsed from its name.
//
// Convention: 0 = Sunday … 6 = Saturday (matches lib/calendar.ts parseRouteWeekday
// and lib/routes/route-schedule.ts WEEKDAY_NAMES). NULL = no fixed day.
//
// Run: node --env-file-if-exists=/vercel/share/.env.project scripts/add-route-day-of-week.mjs
import pg from 'pg'

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
if (!url) {
  console.error('[v0] No POSTGRES_URL(_NON_POOLING) in env')
  process.exit(1)
}

// Supabase's pooled/verify-full URL trips pg's self-signed cert check — strip
// sslmode and force a permissive TLS mode (same workaround as the query runner).
const clean = url.replace(/[?&]sslmode=[^&]*/g, '')
const client = new pg.Client({ connectionString: clean, ssl: { rejectUnauthorized: false } })

const WEEKDAYS = [
  ['sunday', 0],
  ['monday', 1],
  ['tuesday', 2],
  ['wednesday', 3],
  ['thursday', 4],
  ['friday', 5],
  ['saturday', 6],
]

async function main() {
  await client.connect()

  await client.query(`
    ALTER TABLE routes
    ADD COLUMN IF NOT EXISTS day_of_week smallint
    CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6))
  `)
  console.log('[v0] day_of_week column ensured')

  // Backfill from the legacy naming convention ("Friday 01" => Friday) only where
  // no explicit day has been set yet.
  for (const [name, idx] of WEEKDAYS) {
    const res = await client.query(
      `UPDATE routes SET day_of_week = $1
       WHERE day_of_week IS NULL AND position($2 in lower(name)) > 0`,
      [idx, name],
    )
    if (res.rowCount) console.log(`[v0] backfilled ${res.rowCount} route(s) -> ${name}`)
  }

  const { rows } = await client.query(
    `SELECT count(*)::int AS total, count(day_of_week)::int AS with_day FROM routes`,
  )
  console.log(`[v0] routes: ${rows[0].with_day}/${rows[0].total} now have a day_of_week`)

  await client.end()
}

main().catch((err) => {
  console.error('[v0] migration failed:', err)
  process.exit(1)
})
