import pg from 'pg'

const url = (process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || '').replace(
  /[?&]sslmode=[^&]*/g,
  '',
)
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

await client.connect()
try {
  await client.query(`
    alter table public.sites
      add column if not exists requires_po_recurring boolean not null default false;
  `)
  console.log('sites: requires_po_recurring added')
} finally {
  await client.end()
}
