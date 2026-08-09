// Adds saved + shared grid views: per-user saved filter presets for the main
// list grids (Calls, Quotes, Chargeable, Follow-ups) with an optional per-grid
// default, plus the ability to capture a filter and send it to another user
// with a note and a back-and-forth comment thread.
//
// Tables:
//   saved_grid_views          - a user's own saved filter preset for a grid_key
//   shared_grid_views         - a filter snapshot sent from one user to another
//   shared_grid_view_comments - discussion thread on a shared view
//
// RLS: saved views are private to their owner. Shared views + their comments are
// visible to the sender and recipient only.
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
    // --- saved_grid_views ---------------------------------------------------
    await client.query(`
      create table if not exists saved_grid_views (
        id uuid primary key default gen_random_uuid(),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        user_id uuid not null references profiles(id) on delete cascade,
        grid_key text not null,
        name text not null,
        filters jsonb not null default '{}'::jsonb,
        is_default boolean not null default false
      )
    `)
    await client.query(
      `create index if not exists saved_grid_views_user_grid_idx on saved_grid_views (user_id, grid_key)`,
    )
    // At most one default per (user, grid).
    await client.query(
      `create unique index if not exists saved_grid_views_one_default_idx
         on saved_grid_views (user_id, grid_key) where is_default`,
    )

    // --- shared_grid_views --------------------------------------------------
    await client.query(`
      create table if not exists shared_grid_views (
        id uuid primary key default gen_random_uuid(),
        created_at timestamptz not null default now(),
        grid_key text not null,
        name text not null,
        filters jsonb not null default '{}'::jsonb,
        note text,
        sender_id uuid not null references profiles(id) on delete cascade,
        recipient_id uuid not null references profiles(id) on delete cascade,
        resolved boolean not null default false,
        read_at timestamptz
      )
    `)
    await client.query(
      `create index if not exists shared_grid_views_recipient_idx on shared_grid_views (recipient_id)`,
    )
    await client.query(
      `create index if not exists shared_grid_views_sender_idx on shared_grid_views (sender_id)`,
    )

    // --- shared_grid_view_comments -----------------------------------------
    await client.query(`
      create table if not exists shared_grid_view_comments (
        id uuid primary key default gen_random_uuid(),
        created_at timestamptz not null default now(),
        shared_view_id uuid not null references shared_grid_views(id) on delete cascade,
        author_id uuid not null references profiles(id) on delete cascade,
        body text not null
      )
    `)
    await client.query(
      `create index if not exists shared_grid_view_comments_view_idx on shared_grid_view_comments (shared_view_id)`,
    )

    // --- RLS ----------------------------------------------------------------
    await client.query(`alter table saved_grid_views enable row level security`)
    await client.query(`alter table shared_grid_views enable row level security`)
    await client.query(`alter table shared_grid_view_comments enable row level security`)

    // saved_grid_views: private to owner.
    await client.query(`drop policy if exists saved_grid_views_own on saved_grid_views`)
    await client.query(`
      create policy saved_grid_views_own on saved_grid_views
        for all using (user_id = auth.uid()) with check (user_id = auth.uid())
    `)

    // shared_grid_views: sender or recipient can read; sender inserts; either
    // participant can update (recipient marks read/resolved, sender edits).
    await client.query(`drop policy if exists shared_grid_views_participant_select on shared_grid_views`)
    await client.query(`
      create policy shared_grid_views_participant_select on shared_grid_views
        for select using (sender_id = auth.uid() or recipient_id = auth.uid())
    `)
    await client.query(`drop policy if exists shared_grid_views_sender_insert on shared_grid_views`)
    await client.query(`
      create policy shared_grid_views_sender_insert on shared_grid_views
        for insert with check (sender_id = auth.uid())
    `)
    await client.query(`drop policy if exists shared_grid_views_participant_update on shared_grid_views`)
    await client.query(`
      create policy shared_grid_views_participant_update on shared_grid_views
        for update using (sender_id = auth.uid() or recipient_id = auth.uid())
    `)
    await client.query(`drop policy if exists shared_grid_views_participant_delete on shared_grid_views`)
    await client.query(`
      create policy shared_grid_views_participant_delete on shared_grid_views
        for delete using (sender_id = auth.uid() or recipient_id = auth.uid())
    `)

    // comments: participants of the parent shared view.
    await client.query(
      `drop policy if exists shared_grid_view_comments_participant on shared_grid_view_comments`,
    )
    await client.query(`
      create policy shared_grid_view_comments_participant on shared_grid_view_comments
        for all using (
          exists (
            select 1 from shared_grid_views v
            where v.id = shared_view_id
              and (v.sender_id = auth.uid() or v.recipient_id = auth.uid())
          )
        ) with check (
          author_id = auth.uid() and exists (
            select 1 from shared_grid_views v
            where v.id = shared_view_id
              and (v.sender_id = auth.uid() or v.recipient_id = auth.uid())
          )
        )
    `)

    await client.query('commit')
    console.log('[migrate] done')
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('[migrate] failed:', err)
  process.exit(1)
})
