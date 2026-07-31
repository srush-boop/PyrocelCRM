import type { SupabaseClient } from '@supabase/supabase-js'
import type { RecurringFrequency, RecurringTiming } from '@/lib/types/database'
import {
  RECURRING_FREQUENCY_LABELS,
  RECURRING_TIMING_LABELS,
  annualOccurrences,
  fullAnnualValuePence,
  formatCoveragePeriod,
  nextDueDate,
  systemServiceLabel,
} from '@/lib/billing/recurring'

// A forward-looking schedule of a client's active recurring charges: what will
// be invoiced, when, for how much, grouped by billing account. Used by both the
// client "Recurring billing" dialog and the downloadable schedule PDF, so the
// numbers always match.

export interface ScheduleRow {
  id: string
  description: string
  systemService: string | null
  frequency: RecurringFrequency
  frequencyLabel: string
  timing: RecurringTiming
  timingLabel: string
  quantity: number
  unitPricePence: number
  /** Amount billed each occurrence (unit × qty). */
  perOccurrencePence: number
  /** Full annualised value of the charge. */
  annualValuePence: number
  /** Next date this charge is scheduled to be invoiced (YYYY-MM-DD). */
  nextDueDate: string
  /** Human label for the period the next occurrence covers. */
  coveragePeriod: string
}

export interface ScheduleAccountGroup {
  accountId: string
  accountName: string
  accountStatus: string | null
  sageAccountRef: string | null
  rows: ScheduleRow[]
  annualValuePence: number
}

export interface ClientRecurringSchedule {
  groups: ScheduleAccountGroup[]
  totalAnnualValuePence: number
  chargeCount: number
}

interface ScheduleChargeRow {
  id: string
  description: string
  unit_price_pence: number
  quantity: number | string
  frequency: string
  timing: string
  start_date: string | null
  last_invoiced_date: string | null
  billing_account: {
    id: string
    name: string
    status: string | null
    sage_account_ref: string | null
    client_id: string | null
  } | null
  site_service: {
    service_type: { name: string | null } | null
    site_system: { name: string | null; system_type: { name: string | null } | null } | null
  } | null
}

/** Shape raw charge rows into an account-grouped schedule. Pure. */
export function buildScheduleFromRows(rows: ScheduleChargeRow[]): ClientRecurringSchedule {
  const groups = new Map<string, ScheduleAccountGroup>()

  for (const r of rows) {
    if (!r.billing_account) continue
    const frequency = r.frequency as RecurringFrequency
    const timing = r.timing as RecurringTiming
    const qty = typeof r.quantity === 'string' ? Number.parseFloat(r.quantity) : r.quantity
    const q = qty || 1
    const perOccurrencePence = Math.round(r.unit_price_pence * q)
    const annualValuePence = fullAnnualValuePence({
      unit_price_pence: r.unit_price_pence,
      quantity: q,
      frequency,
    })
    const due = nextDueDate({
      frequency,
      last_invoiced_date: r.last_invoiced_date,
      start_date: r.start_date,
    })

    const row: ScheduleRow = {
      id: r.id,
      description: r.description,
      systemService: systemServiceLabel({
        systemName: r.site_service?.site_system?.name,
        systemTypeName: r.site_service?.site_system?.system_type?.name,
        serviceName: r.site_service?.service_type?.name,
      }),
      frequency,
      frequencyLabel: RECURRING_FREQUENCY_LABELS[frequency] ?? r.frequency,
      timing,
      timingLabel: RECURRING_TIMING_LABELS[timing] ?? r.timing,
      quantity: q,
      unitPricePence: r.unit_price_pence,
      perOccurrencePence,
      annualValuePence,
      nextDueDate: due,
      coveragePeriod: formatCoveragePeriod({ frequency, timing }, due),
    }

    let group = groups.get(r.billing_account.id)
    if (!group) {
      group = {
        accountId: r.billing_account.id,
        accountName: r.billing_account.name,
        accountStatus: r.billing_account.status,
        sageAccountRef: r.billing_account.sage_account_ref,
        rows: [],
        annualValuePence: 0,
      }
      groups.set(r.billing_account.id, group)
    }
    group.rows.push(row)
    group.annualValuePence += annualValuePence
  }

  const groupList = Array.from(groups.values()).sort((a, b) =>
    a.accountName.localeCompare(b.accountName),
  )
  for (const g of groupList) {
    g.rows.sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate) || a.description.localeCompare(b.description))
  }

  return {
    groups: groupList,
    totalAnnualValuePence: groupList.reduce((sum, g) => sum + g.annualValuePence, 0),
    chargeCount: groupList.reduce((sum, g) => sum + g.rows.length, 0),
  }
}

/**
 * Fetch and shape a client's active recurring charges into a billing schedule.
 * `supabase` may be any server-side client (RLS or service role).
 */
export async function loadClientRecurringSchedule(
  supabase: SupabaseClient,
  clientId: string,
): Promise<ClientRecurringSchedule> {
  const { data } = await supabase
    .from('recurring_charges')
    .select(
      `
      id, description, unit_price_pence, quantity, frequency, timing,
      start_date, last_invoiced_date,
      billing_account:billing_accounts!inner(id, name, status, sage_account_ref, client_id),
      site_service:site_services(
        service_type:service_types(name),
        site_system:site_systems(name, system_type:system_types(name))
      )
    `,
    )
    .eq('active', true)
    .eq('billing_account.client_id', clientId)

  return buildScheduleFromRows((data ?? []) as unknown as ScheduleChargeRow[])
}
