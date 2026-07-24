import pg from 'pg'

const rawUrl =
  process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL || ''

// pg's verify-full rejects Supabase's self-signed cert; strip sslmode and
// disable strict verification for this one-off diagnostic.
const url = rawUrl.replace(/\?sslmode=[^&]*/, '').replace(/&sslmode=[^&]*/, '')

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()

  // 1) Find the account(s) matching Alan Wood.
  const { rows: profiles } = await client.query(
    `SELECT id, email, full_name, role, status FROM profiles
     WHERE lower(email) LIKE '%alan%wood%'
        OR lower(email) LIKE '%awood%'
        OR lower(full_name) LIKE '%alan%wood%'`,
  )
  console.log('=== Matching profiles ===')
  console.log(JSON.stringify(profiles, null, 2))

  if (profiles.length === 0) {
    console.log('No matching profiles found.')
    await client.end()
    return
  }

  // 2) Check auth.users rows too.
  const { rows: authUsers } = await client.query(
    `SELECT id, email FROM auth.users
     WHERE lower(email) LIKE '%alan%wood%' OR lower(email) LIKE '%awood%'`,
  )
  console.log('\n=== Matching auth.users ===')
  console.log(JSON.stringify(authUsers, null, 2))

  // 3) For each matching profile id, find every table + column that references
  //    it via a foreign key, and count how many rows point at this id.
  for (const p of profiles) {
    console.log(`\n=== References to profile ${p.email} (${p.id}) ===`)

    // All FK columns pointing at profiles(id) or auth.users(id).
    const { rows: fks } = await client.query(`
      SELECT
        tc.table_schema,
        tc.table_name,
        kcu.column_name,
        ccu.table_schema AS ref_schema,
        ccu.table_name   AS ref_table,
        rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ((ccu.table_name = 'profiles' AND ccu.column_name = 'id')
          OR (ccu.table_name = 'users' AND ccu.ref_schema = 'auth'))
      ORDER BY tc.table_name, kcu.column_name
    `)

    for (const fk of fks) {
      const tbl = `${fk.table_schema}.${fk.table_name}`
      try {
        const { rows: cnt } = await client.query(
          `SELECT count(*)::int AS n FROM ${tbl} WHERE "${fk.column_name}" = $1`,
          [p.id],
        )
        if (cnt[0].n > 0) {
          console.log(
            `  ${tbl}.${fk.column_name} -> ${fk.ref_table}  [ON DELETE ${fk.delete_rule}]  rows=${cnt[0].n}`,
          )
        }
      } catch (e) {
        console.log(`  (skip ${tbl}.${fk.column_name}: ${e.message})`)
      }
    }
  }

  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
