import pg from 'pg'

const { Client } = pg

const rawUrl =
  process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL || ''
const url = rawUrl.replace(/([?&])sslmode=[^&]*/i, '$1').replace(/[?&]$/, '')

async function main() {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()

  // 1. Triggers on the tasks table.
  const trg = await client.query(`
    SELECT tgname, pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'tasks' AND NOT t.tgisinternal
    ORDER BY tgname
  `)
  console.log('=== Triggers on public.tasks ===')
  for (const r of trg.rows) console.log(`\n[${r.tgname}]\n${r.def}`)

  // 2. Any function whose body mentions the blocking phrase.
  const fns = await client.query(`
    SELECT n.nspname AS schema, p.proname AS name, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE pg_get_functiondef(p.oid) ILIKE '%cannot be reassigned%'
  `)
  console.log('\n\n=== Functions containing "cannot be reassigned" ===')
  for (const r of fns.rows) console.log(`\n--- ${r.schema}.${r.name} ---\n${r.def}`)

  await client.end()
}

main().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
