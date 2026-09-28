// Adds client_checklist_items.per_site — a site-level question asked once per
// site visit instead of on every system/call. Marks existing asbestos-register
// items as site-level.
import pg from 'pg'

const url = (process.env.POSTGRES_URL_NON_POOLING || '').replace(/[?&]sslmode=[^&]*/, '')
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  await client.query(
    `alter table client_checklist_items add column if not exists per_site boolean not null default false`,
  )
  const res = await client.query(
    `update client_checklist_items set per_site = true where label ilike '%asbestos register%' and per_site = false`,
  )
  console.log(`per_site column ready; ${res.rowCount} asbestos item(s) marked site-level`)
} finally {
  await client.end()
}
