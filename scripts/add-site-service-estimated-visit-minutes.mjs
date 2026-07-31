/**
 * Adds a per-visit estimated time (minutes) to each site_service.
 *
 * This is the authoritative "estimated time taken" for a recurring call at a
 * specific site. It is editable per service; site/system views aggregate the
 * sum. A suggested default is derived in the app from the visit's value, the
 * relevant hourly cost (CDO vs engineer) and the department target margin.
 *
 * Nullable: null means "not set" so the UI can fall back to the suggestion /
 * service-setup expected time.
 *
 * DDL needs the non-pooled connection (pooled POSTGRES_URL throws InitPostgres).
 */
import pg from 'pg'

const url = process.env.POSTGRES_URL_NON_POOLING
if (!url) {
  console.error('POSTGRES_URL_NON_POOLING is not set')
  process.exit(1)
}

const client = new pg.Client({
  connectionString: url.replace(/[?&]sslmode=[^&]+/, ''),
  ssl: { rejectUnauthorized: false },
})

async function main() {
  await client.connect()
  await client.query(
    `alter table site_services
       add column if not exists estimated_visit_minutes integer`,
  )
  console.log('[v0] Added site_services.estimated_visit_minutes')
  await client.end()
}

main().catch((err) => {
  console.error('[v0] migration failed:', err)
  process.exit(1)
})
