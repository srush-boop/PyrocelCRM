import pg from 'pg'

const url = (process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || '').replace(
  /[?&]sslmode=[^&]*/,
  '',
)
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

await client.connect()
await client.query(`alter table public.purchase_invoices add column if not exists department_code text`)
console.log('purchase_invoices.department_code ready')
await client.end()
