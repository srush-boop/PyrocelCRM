// Lets a nominated line manager (profiles.manager_id) read + action their direct
// reports' recurring internal-task instances, so missed-task escalations work
// for non-admin/office managers. Admin/office already covered by
// is_quality_manager(). Idempotent.
import pg from 'pg'

const url = (process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || '').replace(
  /[?&]sslmode=[^&]+/,
  '',
)
if (!url) {
  console.error('POSTGRES_URL_NON_POOLING / POSTGRES_URL not set')
  process.exit(1)
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()

  // SECURITY DEFINER helper: does the current user line-manage `target`?
  await client.query(`
    create or replace function manages_user(target uuid)
    returns boolean
    language sql
    stable
    security definer
    set search_path = public
    as $$
      select exists (
        select 1 from profiles p
        where p.id = target and p.manager_id = auth.uid()
      )
    $$
  `)

  await client.query(`drop policy if exists internal_task_instances_select_line_mgr on internal_task_instances`)
  await client.query(`
    create policy internal_task_instances_select_line_mgr
      on internal_task_instances for select
      using (manages_user(user_id))
  `)

  await client.query(`drop policy if exists internal_task_instances_update_line_mgr on internal_task_instances`)
  await client.query(`
    create policy internal_task_instances_update_line_mgr
      on internal_task_instances for update
      using (manages_user(user_id))
      with check (manages_user(user_id))
  `)

  console.log('OK: line-manager RLS policies + manages_user() added')
  await client.end()
}

main().catch(async (e) => {
  console.error(e)
  await client.end().catch(() => {})
  process.exit(1)
})
