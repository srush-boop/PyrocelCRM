import pg from 'pg'

const url = (process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || '')
  .replace(/[?&]sslmode=[^&]*/g, '')
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

await client.connect()
try {
  await client.query(`
    alter table public.company_info
      add column if not exists bank_name text,
      add column if not exists bank_account_name text,
      add column if not exists bank_sort_code text,
      add column if not exists bank_account_number text,
      add column if not exists bank_iban text,
      add column if not exists bank_bic text;
  `)
  console.log('company_info bank details columns ready')
} finally {
  await client.end()
}
