// Adds soft-cancellation columns to calendar_entries so annual-leave bookings
// can be cancelled while keeping the original record (who cancelled it, when
// and why). Non-leave entries are still hard-deleted, so their cancelled_at
// stays null and every "who's off" query that filters `cancelled_at is null`
// treats them normally.
//
// Requires the non-pooling connection (DDL fails over the pooled URL here).
import postgres from 'postgres'

const url = process.env.POSTGRES_URL_NON_POOLING
if (!url) {
  console.error('POSTGRES_URL_NON_POOLING is not set')
  process.exit(1)
}

const sql = postgres(url, { max: 1 })

try {
  await sql`
    alter table public.calendar_entries
      add column if not exists cancelled_at timestamptz,
      add column if not exists cancelled_by uuid references public.profiles(id),
      add column if not exists cancellation_reason text
  `
  await sql`
    create index if not exists calendar_entries_cancelled_at_idx
      on public.calendar_entries (cancelled_at)
      where cancelled_at is not null
  `
  console.log('OK: calendar_entries cancellation columns ensured')
} catch (err) {
  console.error('Migration failed:', err)
  process.exitCode = 1
} finally {
  await sql.end()
}
