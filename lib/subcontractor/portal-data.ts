import 'server-only'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types/database'

// Shared shape for a call surfaced in the subcontractor portal. Deliberately
// flat and free of any internal-only fields (costs, margins, etc.).
export interface PortalCall {
  id: string
  status: string
  scheduledDate: string | null
  siteName: string | null
  sitePostcode: string | null
  clientName: string | null
  serviceName: string | null
  systemTypeName: string | null
  isEmergency: boolean
  isRemedial: boolean
  assignedEngineerId: string | null
  assignedEngineerName: string | null
}

export interface SubcontractorContext {
  profile: Profile
  supplierId: string
  isLead: boolean
}

// Open (not-yet-completed) call statuses. Completed/cancelled calls drop off the
// active lists but can still appear in history-oriented views if needed.
const OPEN_STATUSES = ['pending', 'in_progress', 'paused']

/**
 * Resolve the signed-in subcontractor's portal context, or redirect. Enforces
 * that the account is an active subcontractor linked to a company (supplier).
 */
export async function getSubcontractorContext(): Promise<SubcontractorContext> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = data as Profile | null
  if (!profile) redirect('/auth/login')
  if (profile.role !== 'subcontractor') redirect('/dashboard')
  // A subcontractor with no company link can't be scoped to any work.
  if (!profile.supplier_id) redirect('/auth/login?error=no-company')

  return {
    profile,
    supplierId: profile.supplier_id,
    isLead: profile.is_subcontractor_lead === true,
  }
}

// Map a raw task row (with embeds) to the flat PortalCall shape.
function toPortalCall(t: any): PortalCall {
  const site = t.site_service?.site
  return {
    id: t.id,
    status: t.status,
    scheduledDate: t.scheduled_date ?? null,
    siteName: site?.name ?? null,
    sitePostcode: site?.postcode ?? null,
    clientName: site?.client?.name ?? null,
    serviceName: t.site_service?.service_type?.name ?? null,
    systemTypeName: t.site_service?.service_type?.system_type?.name ?? null,
    isEmergency: !!t.is_emergency,
    isRemedial: !!t.is_remedial,
    assignedEngineerId: t.assigned_engineer_id ?? null,
    assignedEngineerName: t.assigned_engineer?.full_name ?? null,
  }
}

// Shared select for portal calls. `!inner` on site_service means only calls
// whose service is allocated to a subcontractor company come back, and lets us
// filter the parent task by the embedded subcontractor_id.
const CALL_SELECT = `
  id, status, scheduled_date, is_emergency, is_remedial, assigned_engineer_id,
  assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(id, full_name),
  site_service:site_services!inner(
    subcontractor_id,
    site:sites(id, name, postcode, client:clients(id, name)),
    service_type:service_types(id, name, system_type:system_types(id, name))
  )
`

/**
 * Calls to show on the portal home. A lead sees every open call for a service
 * allocated to their company; a worker sees only open calls assigned to them
 * (still constrained to their company's allocated services).
 */
export async function getMyCalls(ctx: SubcontractorContext): Promise<PortalCall[]> {
  const supabase = await createClient()
  let query = supabase
    .from('tasks')
    .select(CALL_SELECT)
    .eq('site_service.subcontractor_id', ctx.supplierId)
    .in('status', OPEN_STATUSES)
    .order('scheduled_date', { ascending: true })

  if (!ctx.isLead) query = query.eq('assigned_engineer_id', ctx.profile.id)

  const { data } = await query
  return (data ?? []).map(toPortalCall)
}

/**
 * Future works: every future-dated call for a service allocated to the company
 * (regardless of who it's assigned to), for planning. Leads and workers both
 * see the full company picture here per the agreed scope.
 */
export async function getFutureWorks(ctx: SubcontractorContext): Promise<PortalCall[]> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase
    .from('tasks')
    .select(CALL_SELECT)
    .eq('site_service.subcontractor_id', ctx.supplierId)
    .in('status', OPEN_STATUSES)
    .gte('scheduled_date', today)
    .order('scheduled_date', { ascending: true })
  return (data ?? []).map(toPortalCall)
}

export interface CompanyWorker {
  id: string
  fullName: string | null
  email: string
  isLead: boolean
  openCallCount: number
}

/**
 * All login accounts in the subcontractor's company (leads + workers), with a
 * count of the open calls currently assigned to each. Used for the reassign
 * picker and the Workers page.
 */
export async function getCompanyWorkers(ctx: SubcontractorContext): Promise<CompanyWorker[]> {
  const supabase = await createClient()
  const { data: workers } = await supabase
    .from('profiles')
    .select('id, full_name, email, is_subcontractor_lead')
    .eq('supplier_id', ctx.supplierId)
    .eq('role', 'subcontractor')
    .eq('status', 'active')
    .order('is_subcontractor_lead', { ascending: false })
    .order('full_name', { ascending: true })

  const list = workers ?? []
  if (list.length === 0) return []

  // One grouped count query for open calls assigned to these workers.
  const ids = list.map((w) => w.id)
  const { data: openCalls } = await supabase
    .from('tasks')
    .select('assigned_engineer_id')
    .in('assigned_engineer_id', ids)
    .in('status', OPEN_STATUSES)

  const counts = new Map<string, number>()
  for (const row of openCalls ?? []) {
    const id = (row as any).assigned_engineer_id as string | null
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  return list.map((w) => ({
    id: w.id,
    fullName: w.full_name,
    email: w.email,
    isLead: w.is_subcontractor_lead === true,
    openCallCount: counts.get(w.id) ?? 0,
  }))
}
