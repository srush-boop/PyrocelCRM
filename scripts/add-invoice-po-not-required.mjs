import pg from 'pg'

const url = (process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || '').replace(
  /[?&]sslmode=[^&]*/g,
  '',
)
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

await client.connect()
try {
  await client.query(`
    alter table public.invoices
      add column if not exists po_not_required boolean not null default false;
  `)
  console.log('invoices: po_not_required added')
} finally {
  await client.end()
}
