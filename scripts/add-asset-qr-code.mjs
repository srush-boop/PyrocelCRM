// Adds a nullable `qr_code` alias column to each system-asset register so
// engineers can link a pre-existing physical QR sticker to an asset (kept
// alongside the app-generated `urn`, never replacing it). A partial unique
// index per table stops the same physical code being linked to two assets.
//
// DDL must use the NON-pooling connection — the pooled POSTGRES_URL throws
// InitPostgres on DDL in this project (see memory).
import pg from 'pg'

const connectionString = process.env.POSTGRES_URL_NON_POOLING
if (!connectionString) {
  console.error('[v0] POSTGRES_URL_NON_POOLING is not set')
  process.exit(1)
}

// Supabase presents a self-signed cert in its chain; `pg` treats sslmode=require
// as verify-full and rejects it. Strip the sslmode param and disable strict
// verification (see query-tools memory gotcha).
const client = new pg.Client({
  connectionString: connectionString.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/[?&]$/, ''),
  ssl: { rejectUnauthorized: false },
})

const TABLES = ['dampers', 'extinguishers', 'emergency_lights', 'mcps']

async function main() {
  await client.connect()
  for (const table of TABLES) {
    await client.query(`ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS qr_code text;`)
    // Case-insensitive uniqueness, ignoring NULLs (unassigned assets).
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${table}_qr_code_unique
         ON public.${table} (lower(qr_code))
         WHERE qr_code IS NOT NULL;`,
    )
    console.log(`[v0] ${table}: qr_code column + unique index ready`)
  }
  await client.end()
  console.log('[v0] Done.')
}

main().catch((err) => {
  console.error('[v0] Migration failed:', err)
  process.exit(1)
})
