// Adds the Purchase Invoices module: a document store for supplier (purchase)
// invoices with an approval-for-payment workflow. Admin/office only.
//
// Uploaders attach invoice files, allocate them against site/client/job/branch/
// nominal/department/supplier, assign an authoriser, and track them through
// awaiting_approval -> approved | rejected -> complete.
//
// RLS is a single is_staff() policy (feature is admin/office only); is_staff()
// already exists in the schema.
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
    await client.query(`
      create table if not exists purchase_invoices (
        id uuid primary key default gen_random_uuid(),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),

        -- Document
        name text not null,
        blob_pathname text not null,
        blob_url text,
        content_type text,
        size_bytes bigint,
        uploaded_by uuid references profiles(id) on delete set null,

        -- Allocation
        site_id uuid references sites(id) on delete set null,
        client_id uuid references clients(id) on delete set null,
        task_id uuid references tasks(id) on delete set null,
        job_id uuid references jobs(id) on delete set null,
        branch_id uuid references branches(id) on delete set null,
        nominal_code_id uuid references nominal_codes(id) on delete set null,
        department_id uuid references departments(id) on delete set null,
        supplier_id uuid references suppliers(id) on delete set null,
        supplier_ref text,
        notes text,
        is_prepayment boolean not null default false,

        -- Money / dates
        amount_pence integer,
        invoice_date date,
        due_date date,

        -- Approval
        authoriser_id uuid references profiles(id) on delete set null,
        status text not null default 'awaiting_approval',
        decided_by uuid references profiles(id) on delete set null,
        decided_at timestamptz,
        decision_notes text,
        completed_at timestamptz,
        completed_by uuid references profiles(id) on delete set null
      )
    `)

    // Constrain status values (drop-then-add for idempotency).
    await client.query(`
      alter table purchase_invoices
        drop constraint if exists purchase_invoices_status_check
    `)
    await client.query(`
      alter table purchase_invoices
        add constraint purchase_invoices_status_check
        check (status in ('awaiting_approval', 'approved', 'rejected', 'complete'))
    `)

    await client.query(
      `create index if not exists purchase_invoices_status_idx on purchase_invoices (status)`,
    )
    await client.query(
      `create index if not exists purchase_invoices_authoriser_idx on purchase_invoices (authoriser_id)`,
    )
    await client.query(
      `create index if not exists purchase_invoices_uploaded_by_idx on purchase_invoices (uploaded_by)`,
    )
    await client.query(
      `create index if not exists purchase_invoices_site_idx on purchase_invoices (site_id)`,
    )

    // Keep updated_at fresh.
    await client.query(`
      create or replace function set_purchase_invoice_updated_at()
      returns trigger as $$
      begin
        new.updated_at = now();
        return new;
      end;
      $$ language plpgsql
    `)
    await client.query(`
      drop trigger if exists purchase_invoices_set_updated_at on purchase_invoices
    `)
    await client.query(`
      create trigger purchase_invoices_set_updated_at
        before update on purchase_invoices
        for each row execute function set_purchase_invoice_updated_at()
    `)

    // RLS: staff-only (admin/office). is_staff() already exists.
    await client.query(`alter table purchase_invoices enable row level security`)
    await client.query(`
      drop policy if exists purchase_invoices_staff_all on purchase_invoices
    `)
    await client.query(`
      create policy purchase_invoices_staff_all on purchase_invoices
        for all using (is_staff()) with check (is_staff())
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
