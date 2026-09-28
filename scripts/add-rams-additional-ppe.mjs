import pg from 'pg'

const url = (process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || '')
  .replace(/[?&]sslmode=[^&]*/g, '')
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

await client.connect()
try {
  await client.query(`
    alter table public.rams_documents
      add column if not exists additional_ppe text[] not null default '{}'::text[];
  `)
  console.log('rams_documents.additional_ppe ready')
} finally {
  await client.end()
}
