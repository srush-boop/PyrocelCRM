'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getFailedChecklistItems } from '@/lib/defects'
import type { ChecklistResult, DefectStatus } from '@/lib/types/database'

async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, ok: false as const, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'office'].includes(profile.role)) {
    return { supabase, ok: false as const, error: 'Not authorised' }
  }
  return { supabase, ok: true as const }
}

// Link a newly-created remedial quote to its defect and move the defect to
// 'quoted'. Called from the quote builder after a quote is saved from a defect.
export async function linkDefectToQuote(defectId: string, quoteId: string) {
  const auth = await requireStaff()
  if (!auth.ok) return { ok: false, error: auth.error }

  const { error } = await auth.supabase
    .from('defects')
    .update({ quote_id: quoteId, status: 'quoted', updated_at: new Date().toISOString() })
    .eq('id', defectId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/dashboard/defects')
  revalidatePath(`/dashboard/defects/${defectId}`)
  return { ok: true }
}

// Raise a chargeable remedial call directly from a defect at the review stage.
// The call inherits the defect's originating service (defect.task → its
// site_service) so it books against the right service; when the originating task
// has no service it falls back to anchoring the call to the defect's site. The
// office picks the engineer + scheduled date up front. Notes are seeded from the
// defect reference and its failed checks so the attending engineer has context.
export async function createRemedialCallFromDefect(
  defectId: string,
  input: { engineerId: string; scheduledDate: string },
): Promise<{ ok: boolean; taskId?: string; error?: string }> {
  const auth = await requireStaff()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase } = auth

  const engineerId = input.engineerId?.trim()
  const scheduledDate = input.scheduledDate?.trim()
  if (!engineerId) return { ok: false, error: 'Choose an engineer' }
  if (!scheduledDate) return { ok: false, error: 'Choose a date' }

  // Load the defect + its originating task/result to resolve the service.
  const { data: defect } = await supabase
    .from('defects')
    .select(
      `id, reference_number, site_id, client_id, task_id,
       task_result:task_results(checklist_results),
       task:tasks!defects_task_id_fkey(id, site_service_id, site_id, service_type_id, system_type_id)`,
    )
    .eq('id', defectId)
    .maybeSingle()

  if (!defect) return { ok: false, error: 'Defect not found' }
  const d = defect as any
  const originTask = Array.isArray(d.task) ? d.task[0] : d.task

  const siteServiceId: string | null = originTask?.site_service_id ?? null
  // Anchor to a site when we can't map to a service (site_service.site is the
  // preferred anchor, falling back to the defect's / origin task's site).
  const siteId: string | null = siteServiceId
    ? null
    : d.site_id ?? originTask?.site_id ?? null

  if (!siteServiceId && !siteId) {
    return { ok: false, error: 'Cannot resolve a site or service for this defect' }
  }

  // Seed notes from the defect reference + its failed checks.
  const results = (Array.isArray(d.task_result) ? d.task_result[0] : d.task_result)
    ?.checklist_results as ChecklistResult[] | undefined
  const failed = getFailedChecklistItems(results ?? [])
  const noteLines = [
    `Remedial works from defect ${d.reference_number ?? ''}`.trim() + '.',
  ]
  if (failed.length > 0) {
    noteLines.push('', 'Failed checks:')
    for (const f of failed) {
      noteLines.push(`- ${f.label}${f.notes ? ` — ${f.notes}` : ''}`)
    }
  }

  const row: Record<string, unknown> = {
    client_id: d.client_id ?? null,
    assigned_engineer_id: engineerId,
    assigned_at: new Date().toISOString(),
    scheduled_date: scheduledDate,
    status: 'pending',
    is_remedial: true,
    source_defect_id: defectId,
    chargeable: true,
    charge_reason: 'manual',
    notes: noteLines.join('\n'),
  }
  if (siteServiceId) {
    row.site_service_id = siteServiceId
  } else {
    row.site_id = siteId
    row.service_type_id = originTask?.service_type_id ?? null
    row.system_type_id = originTask?.system_type_id ?? null
  }

  const { data: inserted, error } = await supabase
    .from('tasks')
    .insert(row)
    .select('id')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  const newTaskId = (inserted as { id: string } | null)?.id ?? null

  // Carry the parts from the defect's originating inspection call over to the
  // new remedial call so the engineer arrives with the required parts planned.
  // These are plan-only copies — no stock is deducted until the call is worked.
  if (newTaskId && originTask?.id) {
    const { data: sourceParts } = await supabase
      .from('call_parts')
      .select('part_id, quantity, unit_cost_pence, sale_unit_price_pence, chargeable, notes')
      .eq('task_id', originTask.id)

    const partRows = ((sourceParts ?? []) as Array<{
      part_id: string
      quantity: number | null
      unit_cost_pence: number | null
      sale_unit_price_pence: number | null
      chargeable: boolean | null
      notes: string | null
    }>).map((p) => ({
      task_id: newTaskId,
      part_id: p.part_id,
      quantity: p.quantity ?? 1,
      unit_cost_pence: p.unit_cost_pence ?? null,
      sale_unit_price_pence: p.sale_unit_price_pence ?? null,
      chargeable: p.chargeable ?? true,
      notes: `Carried over from defect ${d.reference_number ?? ''}`.trim(),
      added_by: null,
    }))

    if (partRows.length > 0) {
      const { error: partsError } = await supabase.from('call_parts').insert(partRows)
      if (partsError) console.log('[v0] createRemedialCallFromDefect parts copy error:', partsError.message)
    }
  }

  revalidatePath('/dashboard/defects')
  revalidatePath(`/dashboard/defects/${defectId}`)
  revalidatePath('/dashboard/schedule')
  return { ok: true, taskId: newTaskId ?? undefined }
}

// Manually set a defect's lifecycle status (resolve / dismiss / reopen).
export async function setDefectStatus(defectId: string, status: DefectStatus) {
  const auth = await requireStaff()
  if (!auth.ok) return { ok: false, error: auth.error }

  const { error } = await auth.supabase
    .from('defects')
    .update({
      status,
      resolved_at: status === 'resolved' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', defectId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/dashboard/defects')
  revalidatePath(`/dashboard/defects/${defectId}`)
  return { ok: true }
}
