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

    // All FK columns pointing at profiles(id) or auth.users(id), via pg_catalog
    // so cross-schema (auth) references resolve correctly.
    const { rows: fks } = await client.query(`
      SELECT
        con.conname                      AS constraint_name,
        src_ns.nspname                   AS table_schema,
        src.relname                      AS table_name,
        src_col.attname                  AS column_name,
        tgt_ns.nspname                   AS ref_schema,
        tgt.relname                      AS ref_table,
        tgt_col.attname                  AS ref_column,
        con.confdeltype                  AS delete_rule
      FROM pg_constraint con
      JOIN pg_class src        ON src.oid = con.conrelid
      JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace
      JOIN pg_class tgt        ON tgt.oid = con.confrelid
      JOIN pg_namespace tgt_ns ON tgt_ns.oid = tgt.relnamespace
      JOIN pg_attribute src_col ON src_col.attrelid = con.conrelid AND src_col.attnum = con.conkey[1]
      JOIN pg_attribute tgt_col ON tgt_col.attrelid = con.confrelid AND tgt_col.attnum = con.confkey[1]
      WHERE con.contype = 'f'
        AND tgt_col.attname = 'id'
        AND (
          (tgt.relname = 'profiles')
          OR (tgt.relname = 'users' AND tgt_ns.nspname = 'auth')
        )
      ORDER BY src_ns.nspname, src.relname, src_col.attname
    `)

    // confdeltype codes → human labels.
    const DEL = { a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' }

    for (const fk of fks) {
      const tbl = `${fk.table_schema}.${fk.table_name}`
      try {
        const { rows: cnt } = await client.query(
          `SELECT count(*)::int AS n FROM ${tbl} WHERE "${fk.column_name}" = $1`,
          [p.id],
        )
        if (cnt[0].n > 0) {
          // Contradiction check: a SET NULL rule against a NOT NULL column will
          // abort the whole parent delete when Postgres tries to null it.
          let flag = ''
          if (fk.delete_rule === 'n') {
            const { rows: col } = await client.query(
              `SELECT is_nullable FROM information_schema.columns
               WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
              [fk.table_schema, fk.table_name, fk.column_name],
            )
            if (col[0]?.is_nullable === 'NO') flag = '  <<< NOT NULL — BLOCKS DELETE'
          }
          console.log(
            `  ${tbl}.${fk.column_name} -> ${fk.ref_schema}.${fk.ref_table}  [ON DELETE ${DEL[fk.delete_rule] || fk.delete_rule}]  rows=${cnt[0].n}${flag}`,
          )
        }
      } catch (e) {
        console.log(`  (skip ${tbl}.${fk.column_name}: ${e.message})`)
      }
    }
  }

  // Also surface any triggers on auth.users / profiles that could abort a delete.
  const { rows: triggers } = await client.query(`
    SELECT event_object_schema AS schema, event_object_table AS tbl,
           trigger_name, event_manipulation AS event, action_timing AS timing
    FROM information_schema.triggers
    WHERE (event_object_table = 'users' AND event_object_schema = 'auth')
       OR (event_object_table = 'profiles' AND event_object_schema = 'public')
    ORDER BY schema, tbl, trigger_name
  `)
  console.log('\n=== Triggers on auth.users / public.profiles ===')
  for (const t of triggers) {
    console.log(`  ${t.schema}.${t.tbl}  ${t.timing} ${t.event}  ${t.trigger_name}`)
  }
  if (triggers.length === 0) console.log('  (none)')

  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
