import pg from 'pg'

const url = process.env.POSTGRES_URL_NON_POOLING.replace(/[?&]sslmode=[^&]*/, '')
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()

await client.query(`
  alter table public.part_requests
    add column if not exists collected_qty integer not null default 0,
    add column if not exists collected_at timestamptz,
    add column if not exists collected_by uuid references public.profiles(id) on delete set null,
    add column if not exists to_location_id uuid references public.stock_locations(id) on delete set null,
    add column if not exists resolution_note text;

  alter table public.part_requests drop constraint if exists part_requests_status_check;
  alter table public.part_requests add constraint part_requests_status_check
    check (status = any (array['pending','approved','collected','declined','cancelled']));

  create index if not exists idx_part_requests_open on public.part_requests (created_at desc)
    where status in ('pending','approved');
`)

console.log('part_requests collection columns added')
await client.end()
