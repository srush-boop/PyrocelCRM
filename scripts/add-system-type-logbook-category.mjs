// Adds a master-level `logbook_category` to system_types so the Fire Safety Log
// Book can classify each system as fire / security / other and render them in
// separate sections (instead of guessing from the free-text service name, which
// mislabelled "Annual Intruder Alarm Maintenance" as a fire alarm).
//
// DDL needs the non-pooled connection (pooled POSTGRES_URL throws InitPostgres),
// and Supabase's self-signed cert means we must strip sslmode + relax verify.
import pg from 'pg'

const raw = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
if (!raw) {
  console.error('Missing POSTGRES_URL_NON_POOLING / POSTGRES_URL')
  process.exit(1)
}

const client = new pg.Client({
  connectionString: raw.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/[?&]$/, ''),
  ssl: { rejectUnauthorized: false },
})

async function main() {
  await client.connect()

  await client.query(`
    ALTER TABLE system_types
      ADD COLUMN IF NOT EXISTS logbook_category text NOT NULL DEFAULT 'fire'
  `)

  // Constrain to the three known values (idempotent: drop + recreate).
  await client.query(`ALTER TABLE system_types DROP CONSTRAINT IF EXISTS system_types_logbook_category_check`)
  await client.query(`
    ALTER TABLE system_types
      ADD CONSTRAINT system_types_logbook_category_check
      CHECK (logbook_category IN ('fire', 'security', 'other'))
  `)

  // Backfill sensible defaults by code (only rows still on the default 'fire',
  // so re-runs never clobber a manual reclassification).
  const security = ['INTR', 'CCTV', 'AC', 'ACCESS']
  const other = ['REM-MON', 'REMMON']
  await client.query(
    `UPDATE system_types SET logbook_category = 'security'
       WHERE logbook_category = 'fire' AND upper(coalesce(code, '')) = ANY($1::text[])`,
    [security],
  )
  await client.query(
    `UPDATE system_types SET logbook_category = 'other'
       WHERE logbook_category = 'fire' AND upper(coalesce(code, '')) = ANY($1::text[])`,
    [other],
  )
  // Name-based fallback for security systems that have no/blank code.
  await client.query(`
    UPDATE system_types SET logbook_category = 'security'
      WHERE logbook_category = 'fire'
        AND (lower(name) LIKE '%intruder%'
          OR lower(name) LIKE '%cctv%'
          OR lower(name) LIKE '%access control%')
  `)

  const { rows } = await client.query(
    `SELECT name, code, logbook_category FROM system_types ORDER BY logbook_category, name`,
  )
  console.log('system_types classification:')
  for (const r of rows) console.log(`  ${r.logbook_category.padEnd(9)} ${r.code ?? '-'}  ${r.name}`)

  await client.end()
  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
