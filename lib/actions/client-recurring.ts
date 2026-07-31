'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types/database'
import {
  getRecurringDue,
  createInvoiceFromRecurringCharges,
  type RecurringDueGroup,
} from '@/lib/actions/recurring-invoices'
import {
  loadClientRecurringSchedule,
  type ClientRecurringSchedule,
} from '@/lib/billing/recurring-schedule'

async function requireManager() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' as const }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  const role = (profile as Pick<Profile, 'id' | 'role'> | null)?.role
  if (role !== 'admin' && role !== 'office') {
    return { error: 'Not authorised' as const }
  }
  return { supabase, userId: user.id }
}

export interface ClientRecurringOverview {
  schedule: ClientRecurringSchedule
  due: RecurringDueGroup[]
  dueTotalPence: number
  dueChargeCount: number
}

/**
 * Everything the client "Recurring billing" dialog needs: the full forward
 * schedule of active recurring charges, plus the subset that is due to be
 * invoiced now (grouped by billing account, ready for bulk raising).
 */
export async function getClientRecurringOverview(
  clientId: string,
): Promise<{ error: string | null; overview?: ClientRecurringOverview }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }
  const { supabase } = ctx

  if (!clientId) return { error: 'A client is required' }

  const [schedule, due] = await Promise.all([
    loadClientRecurringSchedule(supabase, clientId),
    getRecurringDue(clientId),
  ])

  const dueTotalPence = due.reduce((sum, g) => sum + g.totalPence, 0)
  const dueChargeCount = due.reduce((sum, g) => sum + g.charges.length, 0)

  return { error: null, overview: { schedule, due, dueTotalPence, dueChargeCount } }
}

export interface BulkRecurringResult {
  invoiceIds: string[]
  raisedGroups: number
  skippedOnHold: number
  failures: { accountName: string; error: string }[]
}

/**
 * Raise recurring invoices in bulk for every due charge belonging to a client.
 * Each billing-account + group_key cluster becomes its own draft invoice (the
 * existing per-account raiser handles per_visit + lifecycle gating + stamping
 * last_invoiced_date). Accounts that are on hold (suspended/dead) are skipped.
 */
export async function bulkInvoiceClientRecurring(
  clientId: string,
): Promise<{ error: string | null; result?: BulkRecurringResult }> {
  const ctx = await requireManager()
  if ('error' in ctx) return { error: ctx.error ?? 'Not authorised' }

  if (!clientId) return { error: 'A client is required' }

  const due = await getRecurringDue(clientId)
  if (due.length === 0) {
    return { error: 'There are no recurring charges due to be invoiced for this client.' }
  }

  const result: BulkRecurringResult = {
    invoiceIds: [],
    raisedGroups: 0,
    skippedOnHold: 0,
    failures: [],
  }

  for (const group of due) {
    if (group.onHold) {
      result.skippedOnHold += 1
      continue
    }
    const chargeIds = group.charges.map((c) => c.id)
    if (chargeIds.length === 0) continue

    const res = await createInvoiceFromRecurringCharges(group.accountId, chargeIds)
    if (res.error) {
      result.failures.push({ accountName: group.accountName, error: res.error })
      continue
    }
    result.raisedGroups += 1
    if (res.invoiceId) result.invoiceIds.push(res.invoiceId)
  }

  revalidatePath('/dashboard/invoices')
  revalidatePath('/dashboard/clients')
  return { error: null, result }
}
