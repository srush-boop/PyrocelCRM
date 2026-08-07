// Adds the "route form uploads to Purchase Invoices" flag on templates, plus a
// simple Outstanding -> Complete processing status on each submission that the
// office actions from the Purchase Invoices workspace.
//
// DDL needs the non-pooled connection (pooled POSTGRES_URL throws InitPostgres).
import pg from 'pg'

const url = (process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || '').replace(
  /[?&]sslmode=[^&]+/,
  '',
)

if (!url) {
  console.error('No POSTGRES_URL_NON_POOLING / POSTGRES_URL in env')
  process.exit(1)
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

const statements = [
  // Template-level opt-in: only flagged forms surface in Purchase Invoices.
  `alter table internal_task_templates
     add column if not exists route_to_purchasing boolean not null default false`,

  // Per-submission processing status for the Purchase Invoices workspace.
  // NULL is treated as 'outstanding'; the only other value is 'complete'.
  `alter table internal_task_instances
     add column if not exists purchasing_status text`,
  `alter table internal_task_instances
     add column if not exists purchasing_completed_at timestamptz`,
  `alter table internal_task_instances
     add column if not exists purchasing_completed_by uuid references profiles(id)`,

  // Guard the allowed values.
  `do $$ begin
     if not exists (
       select 1 from pg_constraint where conname = 'internal_task_instances_purchasing_status_chk'
     ) then
       alter table internal_task_instances
         add constraint internal_task_instances_purchasing_status_chk
         check (purchasing_status is null or purchasing_status in ('outstanding','complete'));
     end if;
   end $$;`,

  // Speeds up the flagged-template lookup used by the section.
  `create index if not exists idx_itt_route_to_purchasing
     on internal_task_templates(route_to_purchasing) where route_to_purchasing`,
]

try {
  await client.connect()
  for (const sql of statements) {
    console.log('Running:', sql.split('\n')[0].trim(), '…')
    await client.query(sql)
  }
  console.log('\n✅ Form-document purchasing migration complete.')
} catch (err) {
  console.error('❌ Migration failed:', err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
