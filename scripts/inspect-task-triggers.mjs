import pg from 'pg'

const rawUrl =
  process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL || ''
if (!rawUrl) {
  console.error('No Postgres connection string found.')
  process.exit(1)
}
const url = rawUrl.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/[?&]$/, '')

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()

  // Trigger functions whose body mentions the blocking message.
  const { rows: fns } = await client.query(`
    SELECT p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE pg_get_functiondef(p.oid) ILIKE '%cannot be reassigned%'
  `)
  console.log('=== Trigger functions mentioning "cannot be reassigned" ===')
  for (const f of fns) {
    console.log(`\n--- FUNCTION ${f.proname} ---\n${f.def}`)
  }
  if (fns.length === 0) console.log('  (none found)')

  // Which triggers on tasks use those functions.
  const { rows: trigs } = await client.query(`
    SELECT t.tgname, c.relname AS table_name, p.proname AS func,
           pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal
      AND c.relname = 'tasks'
    ORDER BY t.tgname
  `)
  console.log('\n=== Triggers on public.tasks ===')
  for (const t of trigs) {
    console.log(`  ${t.tgname} -> ${t.func}\n     ${t.def}`)
  }

  await client.end()
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
