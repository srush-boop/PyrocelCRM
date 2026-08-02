// Adds on-demand forms + approval workflow to the Internal Tasks module.
//
// Templates gain a `task_kind` ('recurring' | 'on_demand') plus approval config
// (requires_approval, approval_manager, approval_user_ids). On-demand forms are
// launched by any user at will (never scheduled by the cron).
//
// Instances gain approval tracking (approval_status, approver_ids snapshot,
// approved_by/at, approval_note) and their scheduling columns are made NULLABLE
// so on-demand submissions carry no period/deadline. Postgres treats NULLs as
// distinct in the unique(template_id,user_id,period_start) key, so a user can
// submit the same on-demand form many times.
//
// DDL requires the non-pooled connection (pooled POSTGRES_URL throws InitPostgres).
import pg from 'pg'

const url = (process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || '').replace(
  /[?&]sslmode=[^&]+/,
  '',
)
if (!url) {
  console.error('Missing POSTGRES_URL_NON_POOLING / POSTGRES_URL')
  process.exit(1)
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()
  console.log('[migrate] connected')

  await client.query('begin')
  try {
    // --- Templates: form type + approval config ---
    await client.query(`
      alter table internal_task_templates
        add column if not exists task_kind text not null default 'recurring',
        add column if not exists requires_approval boolean not null default false,
        add column if not exists approval_manager boolean not null default false,
        add column if not exists approval_user_ids uuid[] not null default '{}'::uuid[]
    `)
    // Constrain task_kind values (drop-then-add for idempotency).
    await client.query(`
      alter table internal_task_templates
        drop constraint if exists internal_task_templates_task_kind_check
    `)
    await client.query(`
      alter table internal_task_templates
        add constraint internal_task_templates_task_kind_check
        check (task_kind in ('recurring', 'on_demand'))
    `)

    // --- Instances: allow no schedule for on-demand + approval tracking ---
    await client.query(`
      alter table internal_task_instances
        alter column period_start drop not null,
        alter column period_end drop not null,
        alter column due_at drop not null
    `)
    await client.query(`
      alter table internal_task_instances
        add column if not exists approval_status text,
        add column if not exists approver_ids uuid[] not null default '{}'::uuid[],
        add column if not exists approved_by uuid references profiles(id) on delete set null,
        add column if not exists approved_at timestamptz,
        add column if not exists approval_note text
    `)
    await client.query(`
      alter table internal_task_instances
        drop constraint if exists internal_task_instances_approval_status_check
    `)
    await client.query(`
      alter table internal_task_instances
        add constraint internal_task_instances_approval_status_check
        check (approval_status is null or approval_status in ('pending', 'approved', 'rejected'))
    `)
    // Fast lookup for an approver's pending queue.
    await client.query(`
      create index if not exists internal_task_instances_approver_ids_idx
        on internal_task_instances using gin (approver_ids)
    `)

    // --- RLS: approvers can read + decide instances routed to them ---
    await client.query(`
      drop policy if exists internal_task_instances_select_approver on internal_task_instances
    `)
    await client.query(`
      create policy internal_task_instances_select_approver on internal_task_instances
        for select using (auth.uid() = any(approver_ids))
    `)
    await client.query(`
      drop policy if exists internal_task_instances_update_approver on internal_task_instances
    `)
    await client.query(`
      create policy internal_task_instances_update_approver on internal_task_instances
        for update using (auth.uid() = any(approver_ids))
        with check (auth.uid() = any(approver_ids))
    `)
    // Approvers can view attachments (e.g. receipts) on instances routed to them.
    await client.query(`
      drop policy if exists internal_task_attachments_select_approver on internal_task_attachments
    `)
    await client.query(`
      create policy internal_task_attachments_select_approver on internal_task_attachments
        for select using (
          exists (
            select 1 from internal_task_instances i
            where i.id = internal_task_attachments.instance_id
              and auth.uid() = any(i.approver_ids)
          )
        )
    `)

    await client.query('commit')
    console.log('[migrate] done')
  } catch (err) {
    await client.query('rollback')
    throw err
  }
}

main()
  .catch((err) => {
    console.error('[migrate] failed:', err.message)
    process.exitCode = 1
  })
  .finally(() => client.end())
