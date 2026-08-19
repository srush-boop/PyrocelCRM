// Links subcontractor login accounts to a subcontractor company (suppliers row)
// and marks which accounts are the "lead" for that company. This powers the
// Subcontractor Portal: the lead sees all calls for services allocated to their
// company and can re-issue them to their workers; a plain worker only sees the
// calls assigned directly to them.
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

  // The subcontractor company this login belongs to (lead AND every worker
  // share the same supplier_id). Nullable: only subcontractor accounts use it.
  await client.query(`
    ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL
  `)

  // The lead can view all company works + reassign to workers + manage uploads.
  await client.query(`
    ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS is_subcontractor_lead boolean NOT NULL DEFAULT false
  `)

  // Helpful index for the "all logins in this company" lookups.
  await client.query(`
    CREATE INDEX IF NOT EXISTS profiles_supplier_id_idx ON profiles (supplier_id)
  `)

  const { rows } = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name IN ('supplier_id', 'is_subcontractor_lead')
    ORDER BY column_name
  `)
  console.log('profiles subcontractor columns:')
  for (const r of rows) console.log(`  ${r.column_name} (${r.data_type}, nullable=${r.is_nullable})`)

  await client.end()
  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
