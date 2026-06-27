import { createAdminClient } from '@/lib/supabase/admin'

// Marks calendar entries that were imported from the gov.uk bank holiday feed.
const SOURCE = 'uk-bank-holiday'
// We import the England & Wales division.
const DIVISION = 'england-and-wales'
const FEED_URL = 'https://www.gov.uk/bank-holidays.json'
// Don't refetch the feed more than once per this window.
const REFRESH_INTERVAL_MS = 1000 * 60 * 60 * 24 * 14 // 14 days

interface GovUkEvent {
  title: string
  date: string // yyyy-mm-dd
  notes: string
  bunting: boolean
}
interface GovUkDivision {
  division: string
  events: GovUkEvent[]
}
type GovUkResponse = Record<string, GovUkDivision>

let lastSyncAttempt = 0

/**
 * Imports UK (England & Wales) bank holidays into calendar_entries as
 * company-wide, public, all-day entries under the "Bank Holiday" entry type.
 *
 * Idempotent: entries are upserted on (source, source_uid) so repeated runs
 * never create duplicates. Throttled in-process so the gov.uk feed is fetched
 * at most once per REFRESH_INTERVAL_MS regardless of page loads.
 */
export async function syncUkBankHolidays(): Promise<void> {
  const now = Date.now()
  if (now - lastSyncAttempt < REFRESH_INTERVAL_MS) return
  lastSyncAttempt = now

  try {
    const admin = createAdminClient()

    // Find (or create) the "Bank Holiday" entry type to colour the entries.
    let entryTypeId: string | null = null
    const { data: existingType } = await admin
      .from('calendar_entry_types')
      .select('id')
      .ilike('name', 'Bank Holiday')
      .maybeSingle()

    if (existingType) {
      entryTypeId = (existingType as { id: string }).id
    } else {
      const { data: created } = await admin
        .from('calendar_entry_types')
        .insert({ name: 'Bank Holiday', color: '#10b981', sort_order: 4 })
        .select('id')
        .single()
      entryTypeId = (created as { id: string } | null)?.id ?? null
    }
    if (!entryTypeId) return

    const res = await fetch(FEED_URL, { next: { revalidate: 60 * 60 * 24 } })
    if (!res.ok) return
    const feed = (await res.json()) as GovUkResponse
    const division = feed[DIVISION]
    if (!division?.events?.length) return

    // Only import holidays from this year onward to keep the table tidy.
    const cutoffYear = new Date().getFullYear()
    const rows = division.events
      .filter((e) => Number(e.date.slice(0, 4)) >= cutoffYear)
      .map((e) => ({
        entry_type_id: entryTypeId,
        user_id: null,
        title: e.title,
        // All-day, single-day holiday.
        start_at: `${e.date}T00:00:00Z`,
        end_at: `${e.date}T23:59:00Z`,
        all_day: true,
        is_public: true,
        notes: e.notes || null,
        created_by: null,
        source: SOURCE,
        source_uid: e.date,
      }))

    if (rows.length === 0) return

    await admin
      .from('calendar_entries')
      .upsert(rows, { onConflict: 'source,source_uid', ignoreDuplicates: false })
  } catch {
    // Network/parse errors are non-fatal — the calendar still renders. Allow a
    // retry on the next load by clearing the throttle.
    lastSyncAttempt = 0
  }
}
