/**
 * Gives every site a human-readable reference number (e.g. SITE-00001).
 *
 * Mirrors the task reference convention: the number is assigned automatically
 * by a BEFORE INSERT trigger from a dedicated sequence, and locked once set so
 * it can never change. Unlike task references, site references are NOT
 * year-scoped -- a site is a long-lived entity, so it keeps one stable
 * reference for its whole life.
 *
 * Existing sites are backfilled in creation order (created_at, then id) so the
 * oldest site gets the lowest number, and the sequence is advanced past the
 * highest assigned value so new inserts continue cleanly.
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

  // 1. Column (nullable for now; backfilled + enforced below).
  await client.query(
    `alter table sites add column if not exists reference_number text`,
  )
  console.log('[v0] Added sites.reference_number')

  // 2. Dedicated sequence for site references.
  await client.query(`create sequence if not exists site_reference_seq`)

  // 3. Backfill existing rows in creation order, so older sites get lower
  //    numbers. Idempotent: only touches rows without a reference.
  await client.query(`
    with ordered as (
      select id, row_number() over (order by created_at nulls last, id) as rn
      from sites
      where reference_number is null
    )
    update sites s
    set reference_number = 'SITE-' || lpad(o.rn::text, 5, '0')
    from ordered o
    where s.id = o.id
  `)
  console.log('[v0] Backfilled existing site references')

  // 4. Advance the sequence past the highest number currently in use so the
  //    trigger never collides with a backfilled value.
  await client.query(`
    select setval(
      'site_reference_seq',
      greatest(
        (
          select coalesce(
            max((regexp_replace(reference_number, '\\D', '', 'g'))::bigint),
            0
          )
          from sites
          where reference_number ~ '^SITE-\\d+$'
        ),
        1
      )
    )
  `)
  console.log('[v0] Advanced site_reference_seq past existing references')

  // 5. Auto-assign trigger: fill reference_number on insert when not provided.
  await client.query(`
    create or replace function set_site_reference()
    returns trigger
    language plpgsql
    as $$
    begin
      if new.reference_number is null or new.reference_number = '' then
        new.reference_number := 'SITE-' || lpad(nextval('site_reference_seq')::text, 5, '0');
      end if;
      return new;
    end;
    $$
  `)
  await client.query(`drop trigger if exists set_site_reference on sites`)
  await client.query(`
    create trigger set_site_reference
    before insert on sites
    for each row
    execute function set_site_reference()
  `)
  console.log('[v0] Installed set_site_reference insert trigger')

  // 6. Lock the reference once set: it must never change after creation.
  await client.query(`
    create or replace function lock_site_reference()
    returns trigger
    language plpgsql
    as $$
    begin
      if old.reference_number is not null and new.reference_number is distinct from old.reference_number then
        new.reference_number := old.reference_number;
      end if;
      return new;
    end;
    $$
  `)
  await client.query(`drop trigger if exists lock_site_reference on sites`)
  await client.query(`
    create trigger lock_site_reference
    before update on sites
    for each row
    execute function lock_site_reference()
  `)
  console.log('[v0] Installed lock_site_reference update trigger')

  // 7. Enforce uniqueness now that every row has a value.
  await client.query(`
    create unique index if not exists idx_sites_reference_number
    on sites (reference_number)
  `)
  console.log('[v0] Added unique index on sites.reference_number')

  await client.end()
  console.log('[v0] Site reference migration complete')
}

main().catch((err) => {
  console.error('[v0] migration failed:', err)
  process.exit(1)
})
