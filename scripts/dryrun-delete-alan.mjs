// Dry-run of deleting the Alan Wood engineer account, inside a rolled-back
// transaction, to surface the exact Postgres error that GoTrue hits.
import pg from 'pg'

const ALAN_ENGINEER_ID = 'c4859e28-9a5b-4309-ae74-c2be779571b6'

const rawUrl =
  process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL || ''
if (!rawUrl) {
  console.error('No Postgres connection string found.')
  process.exit(1)
}
const connectionString = rawUrl.replace(/([?&])sslmode=[^&]*/i, '$1').replace(/[?&]$/, '')

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })

async function attempt(label, sql) {
  await client.query('BEGIN')
  try {
    await client.query(sql, [ALAN_ENGINEER_ID])
    console.log(`  ${label}: OK (would succeed)`)
  } catch (e) {
    console.log(`  ${label}: FAILS -> ${e.message}`)
    if (e.detail) console.log(`      detail: ${e.detail}`)
    if (e.table) console.log(`      table:  ${e.table}`)
    if (e.constraint) console.log(`      constraint: ${e.constraint}`)
  } finally {
    await client.query('ROLLBACK')
  }
}

async function main() {
  await client.connect()
  console.log('=== Dry-run: delete profiles row (rolled back) ===')
  await attempt('DELETE FROM profiles', 'DELETE FROM public.profiles WHERE id = $1')

  console.log('\n=== Dry-run: delete auth.users row (what GoTrue does, rolled back) ===')
  await attempt('DELETE FROM auth.users', 'DELETE FROM auth.users WHERE id = $1')

  console.log('\n=== Dry-run: delete profile THEN auth.users (handler order, rolled back) ===')
  await client.query('BEGIN')
  try {
    await client.query('DELETE FROM public.profiles WHERE id = $1', [ALAN_ENGINEER_ID])
    await client.query('DELETE FROM auth.users WHERE id = $1', [ALAN_ENGINEER_ID])
    console.log('  combined: OK (would succeed)')
  } catch (e) {
    console.log(`  combined: FAILS -> ${e.message}`)
    if (e.detail) console.log(`      detail: ${e.detail}`)
    if (e.table) console.log(`      table:  ${e.table}`)
    if (e.constraint) console.log(`      constraint: ${e.constraint}`)
  } finally {
    await client.query('ROLLBACK')
  }

  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
