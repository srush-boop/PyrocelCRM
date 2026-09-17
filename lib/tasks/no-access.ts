import type { SupabaseClient } from '@supabase/supabase-js'
import { computeNextScheduledDate, toDateString } from '@/lib/scheduling'

interface NoAccessTask {
  id: string
  site_service_id: string | null
  scheduled_date: string
}

/**
 * Shared completion cascade for a call an engineer returns as "no access" — they
 * attended but couldn't gain entry. Used by every execution flow (generic,
 * damper, extinguisher, emergency light, MCP) so the outcome is recorded
 * identically everywhere:
 *
 *  - task_results.overall_status = 'no_access' (+ the reason in engineer_notes)
 *  - tasks marked completed and stamped with no_access_at / no_access_reason so
 *    the office no-access queue can pick it up and the report can state it
 *  - last_service_date is deliberately NOT touched (the service wasn't done), but
 *    the projected next_service_date is still rolled forward for recurring calls
 *  - the completion report email is sent (best-effort) so the client/office are
 *    told access was denied
 *
 * The caller is responsible for the post-completion navigation (runExit).
 */
export async function completeCallNoAccess(
  supabase: SupabaseClient,
  opts: {
    task: NoAccessTask
    reason: string
    clientSignature?: string | null
    clientSignatureName?: string | null
  },
): Promise<void> {
  const reason = opts.reason.trim()
  const note = reason
    ? `No access — engineer could not gain entry to site. ${reason}`
    : 'No access — engineer could not gain entry to site.'
  const completedAt = new Date()
  const nowIso = completedAt.toISOString()

  const resultData = {
    task_id: opts.task.id,
    checklist_results: [
      {
        item_id: 'no_access',
        label: 'Site access',
        type: 'text',
        value: 'No access — engineer could not gain entry',
        passed: null,
        notes: reason,
      },
    ],
    overall_status: 'no_access',
    engineer_notes: note,
    client_signature: opts.clientSignature ?? null,
    client_signature_name: opts.clientSignatureName?.trim() || null,
    photos: [] as string[],
    updated_at: nowIso,
  }

  const { data: existing } = await supabase
    .from('task_results')
    .select('id')
    .eq('task_id', opts.task.id)
    .maybeSingle()
  if (existing) {
    await supabase
      .from('task_results')
      .update(resultData)
      .eq('id', (existing as { id: string }).id)
  } else {
    await supabase.from('task_results').insert(resultData)
  }

  await supabase
    .from('tasks')
    .update({
      status: 'completed',
      completed_at: nowIso,
      no_access_at: nowIso,
      no_access_reason: reason || null,
      updated_at: nowIso,
    })
    .eq('id', opts.task.id)

  // Roll the projected "next due" forward for recurring calls (service not done,
  // so last_service_date is left alone). Mirrors the normal completion cascade.
  if (opts.task.site_service_id) {
    const { data: ss } = await supabase
      .from('site_services')
      .select(
        'frequency_value, frequency_unit, anchor_next_to_schedule, active, site:sites!inner(status), service_type:service_types!inner(status)',
      )
      .eq('id', opts.task.site_service_id)
      .single()
    const siteRel = (ss as { site?: { status?: string } | { status?: string }[] } | null)?.site
    const siteStatus = Array.isArray(siteRel) ? siteRel[0]?.status : siteRel?.status
    const serviceRel = (ss as { service_type?: { status?: string } | { status?: string }[] } | null)
      ?.service_type
    const serviceStatus = Array.isArray(serviceRel) ? serviceRel[0]?.status : serviceRel?.status
    const serviceActive = (ss as { active?: boolean } | null)?.active !== false
    if (ss && serviceActive && siteStatus === 'live' && serviceStatus !== 'dead') {
      const nextDateStr = toDateString(
        computeNextScheduledDate(ss, { completedAt, scheduledDate: opts.task.scheduled_date }),
      )
      await supabase
        .from('site_services')
        .update({ next_service_date: nextDateStr })
        .eq('id', opts.task.site_service_id)
    }
  }

  // Best-effort completion report — tells the client/office access was denied.
  void fetch('/api/send-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: opts.task.id }),
    keepalive: true,
  }).catch((err) => console.log('[v0] No-access report email request error:', err))
}
