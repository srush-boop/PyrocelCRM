import type { SupabaseClient } from '@supabase/supabase-js'
import type { InternalTaskTemplate, InternalTaskAnswer, Profile } from '@/lib/types/database'
import { resolveAssigneeIds } from './schedule'
import {
  buildCompletionReport,
  type CompletionReport,
  type CompletionReportFlag,
  type ReportUser,
} from './completion-report'

// Computes the monthly completion report for a calendar month. Kept out of the
// 'use server' actions file so BOTH the manager action (session client) and the
// cron (admin client) can call it with their own Supabase client. `monthStart`
// is the first day of the target month (UTC). Recurring tasks only.
export async function computeCompletionReport(
  client: SupabaseClient,
  monthStart: Date,
  // Optional: restrict the report to a single recurring task/form template.
  templateId?: string,
): Promise<CompletionReport> {
  const y = monthStart.getUTCFullYear()
  const m = monthStart.getUTCMonth()
  const startISO = new Date(Date.UTC(y, m, 1)).toISOString()
  const endISO = new Date(Date.UTC(y, m + 1, 1)).toISOString()
  const monthLabel = new Date(Date.UTC(y, m, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  const [{ data: templates }, { data: candidates }] = await Promise.all([
    client.from('internal_task_templates').select('*').eq('active', true).eq('task_kind', 'recurring'),
    client
      .from('profiles')
      .select('id, full_name, role, department_id, status')
      .eq('status', 'active')
      .neq('role', 'client'),
  ])

  const tpls = ((templates ?? []) as InternalTaskTemplate[]).filter(
    (t) => !templateId || t.id === templateId,
  )
  const cands = (candidates ?? []) as Array<
    Pick<Profile, 'id' | 'full_name' | 'role' | 'department_id' | 'status'>
  >
  const nameById = new Map(cands.map((c) => [c.id, c.full_name ?? 'Unknown']))
  const templateName = new Map(tpls.map((t) => [t.id, t.name]))
  const recurringIds = new Set(tpls.map((t) => t.id))

  const { data: rows } = await client
    .from('internal_task_instances')
    .select('user_id, template_id, answers, completed_at')
    .eq('status', 'completed')
    .gte('completed_at', startISO)
    .lt('completed_at', endISO)

  const completedByTemplate: Record<string, Set<string>> = {}
  const flags: CompletionReportFlag[] = []
  for (const r of (rows ?? []) as Array<{
    user_id: string
    template_id: string
    answers: InternalTaskAnswer[] | null
  }>) {
    if (!recurringIds.has(r.template_id)) continue
    ;(completedByTemplate[r.template_id] ??= new Set()).add(r.user_id)
    for (const a of r.answers ?? []) {
      if (a.passed === false || a.advisory === true) {
        const answer =
          a.type === 'yes_no' || a.type === 'choice'
            ? Array.isArray(a.value)
              ? (a.value as string[]).join(', ')
              : String(a.value ?? '')
            : ''
        flags.push({
          userName: nameById.get(r.user_id) ?? 'Unknown',
          templateName: templateName.get(r.template_id) ?? 'Task',
          label: a.label,
          state: a.passed === false ? 'Fail' : 'Advisory',
          answer,
          note: (a.notes ?? '').trim() || undefined,
        })
      }
    }
  }

  const allocationByTemplate: Record<string, ReportUser[]> = {}
  for (const t of tpls) {
    const ids = resolveAssigneeIds(t, cands)
    allocationByTemplate[t.id] = ids.map((id) => ({ id, name: nameById.get(id) ?? 'Unknown' }))
  }

  return buildCompletionReport({
    monthLabel,
    templates: tpls.map((t) => ({ id: t.id, name: t.name })),
    allocationByTemplate,
    completedByTemplate,
    flags,
  })
}
