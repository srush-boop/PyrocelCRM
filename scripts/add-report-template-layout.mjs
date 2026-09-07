// Extends report_templates for the per-service report designer.
//
//  - `layout jsonb`  : an ordered array of report body blocks. NULL means "use
//                      the built-in default layout", so every existing row keeps
//                      rendering exactly as before.
//  - a partial unique index guaranteeing at most ONE global-default row
//    (service_type_id IS NULL). The existing UNIQUE(service_type_id) constraint
//    treats NULLs as distinct, so it does NOT prevent multiple null rows — this
//    index does. Per-service uniqueness is still covered by that constraint.
//
// service_type_id is already nullable in this database (a null row = the
// company-wide default that service types inherit).
//
// Uses `pg` with the non-pooling connection (DDL + the project convention).
import pg from 'pg'

const raw = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
if (!raw) {
  console.error('POSTGRES_URL_NON_POOLING is not set')
  process.exit(1)
}
// Strip sslmode so our explicit ssl object governs TLS (Supabase self-signed).
const connectionString = raw
  .replace(/([?&])sslmode=[^&]*/i, (_m, sep) => (sep === '?' ? '?' : ''))
  .replace(/[?&]$/, '')

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
})

try {
  await client.connect()
  await client.query(`alter table public.report_templates add column if not exists layout jsonb`)
  // Ensure service_type_id is nullable (already is here, but keep idempotent).
  await client.query(`alter table public.report_templates alter column service_type_id drop not null`)
  await client.query(`
    create unique index if not exists report_templates_single_default_idx
      on public.report_templates ((service_type_id is null))
      where service_type_id is null
  `)
  console.log('OK: report_templates.layout + single-default index ensured')
} catch (err) {
  console.error('Migration failed:', err)
  process.exitCode = 1
} finally {
  await client.end()
}
