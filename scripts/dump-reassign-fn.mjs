import pg from 'pg'

const rawUrl =
  process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL || ''
const url = rawUrl.replace(/([?&])sslmode=[^&]*/i, '$1').replace(/[?&]$/, '')

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()
  const { rows } = await client.query(`
    SELECT p.proname, pg_get_function_arguments(p.oid) AS args, p.prosrc
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname IN ('prevent_completed_task_reassignment', 'lock_task_reference')
    ORDER BY p.proname
  `)
  for (const r of rows) {
    console.log(`\n=== ${r.proname}(${r.args}) ===`)
    console.log(r.prosrc)
  }
  await client.end()
}

main().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
