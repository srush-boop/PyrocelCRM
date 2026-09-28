import pg from 'pg'

const url = (process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || '').replace(
  /[?&]sslmode=[^&]*/g,
  '',
)
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

await client.connect()
try {
  await client.query(`
    alter table public.lone_worker_sessions
      add column if not exists shift_end_prompted_at timestamptz,
      add column if not exists shift_extended_count integer not null default 0;
  `)
  console.log('lone_worker_sessions: shift_end_prompted_at + shift_extended_count added')
} finally {
  await client.end()
}
