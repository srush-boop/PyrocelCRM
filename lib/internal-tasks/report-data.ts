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

// Computes a completion report over an ARBITRARY window [start, end) rather than
// a calendar month, driven by the instances actually DUE in that window (so the
// "expected responses" reflect the real cadence). Powers the configurable
// scheduled reports. Recurring tasks/forms only. `templateId` optionally scopes
// to a single template. `periodLabel` is the heading shown in the report/email.
export async function computeScheduledReport(
  client: SupabaseClient,
  opts: { start: Date; end: Date; periodLabel: string; templateId?: string | null },
): Promise<CompletionReport> {
  const startISO = opts.start.toISOString()
  const endISO = opts.end.toISOString()

  const [{ data: templates }, { data: profiles }] = await Promise.all([
    client.from('internal_task_templates').select('id, name').eq('task_kind', 'recurring'),
    client.from('profiles').select('id, full_name'),
  ])

  const tpls = ((templates ?? []) as Array<{ id: string; name: string }>).filter(
    (t) => !opts.templateId || t.id === opts.templateId,
  )
  const tplIds = new Set(tpls.map((t) => t.id))
  const nameById = new Map(
    ((profiles ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [
      p.id,
      p.full_name ?? 'Unknown',
    ]),
  )
  const templateName = new Map(tpls.map((t) => [t.id, t.name]))

  // Every instance whose deadline falls in the reporting window — this is the
  // set of "expected responses" for the period.
  const { data: rows } = await client
    .from('internal_task_instances')
    .select('user_id, template_id, status, answers, due_at')
    .gte('due_at', startISO)
    .lt('due_at', endISO)

  const allocationByTemplate: Record<string, ReportUser[]> = {}
  const completedByTemplate: Record<string, Set<string>> = {}
  const seenAllocation: Record<string, Set<string>> = {}
  const flags: CompletionReportFlag[] = []

  for (const r of (rows ?? []) as Array<{
    user_id: string
    template_id: string
    status: string
    answers: InternalTaskAnswer[] | null
  }>) {
    if (!tplIds.has(r.template_id)) continue
    const seen = (seenAllocation[r.template_id] ??= new Set())
    if (!seen.has(r.user_id)) {
      seen.add(r.user_id)
      ;(allocationByTemplate[r.template_id] ??= []).push({
        id: r.user_id,
        name: nameById.get(r.user_id) ?? 'Unknown',
      })
    }
    if (r.status === 'completed') {
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
  }

  // Only include templates that actually had expected responses in the window,
  // so an empty daily/weekly report is concise.
  const activeTemplates = tpls.filter((t) => (allocationByTemplate[t.id]?.length ?? 0) > 0)

  return buildCompletionReport({
    monthLabel: opts.periodLabel,
    templates: activeTemplates.map((t) => ({ id: t.id, name: t.name })),
    allocationByTemplate,
    completedByTemplate,
    flags,
  })
}
