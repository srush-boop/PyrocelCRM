// One-off migration: add service_types.regulatory_compliance.
//
// Marks whether a service type is subject to regulatory compliance. When false,
// the type is kept in the client KPI tier but omitted from regulatory figures
// and the regulatory compliance chart. Defaults to true so existing behaviour
// is unchanged (every current service type is treated as regulatory).
//
// Run: node --env-file-if-exists=/vercel/share/.env.project scripts/add-service-type-regulatory-compliance.mjs
import pg from 'pg'

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
if (!url) {
  console.error('[v0] No POSTGRES_URL(_NON_POOLING) in env')
  process.exit(1)
}

// Supabase's pooled/verify-full URL trips pg's self-signed cert check — strip
// sslmode and force a permissive TLS mode (same workaround as the query runner).
const clean = url.replace(/[?&]sslmode=[^&]*/g, '')
const client = new pg.Client({ connectionString: clean, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()

  await client.query(`
    ALTER TABLE service_types
    ADD COLUMN IF NOT EXISTS regulatory_compliance boolean NOT NULL DEFAULT true
  `)
  console.log('[v0] regulatory_compliance column ensured (default true)')

  const { rows } = await client.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE regulatory_compliance)::int AS regulatory
       FROM service_types`,
  )
  console.log(
    `[v0] service_types: ${rows[0].regulatory}/${rows[0].total} subject to regulatory compliance`,
  )

  await client.end()
}

main().catch((err) => {
  console.error('[v0] migration failed:', err)
  process.exit(1)
})
