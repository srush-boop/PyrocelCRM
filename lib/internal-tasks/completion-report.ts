// ============================================================================
// Internal Tasks — monthly completion report (pure aggregation + HTML render)
// Builds a manager-facing summary for a month: which recurring tasks were
// allocated vs completed, which users have outstanding tasks (grouped), and a
// roll-up of every flagged (failed/advisory) item. No I/O here so it stays
// unit-testable; the server action supplies the resolved data.
// ============================================================================

export interface ReportUser {
  id: string
  name: string
}

export interface CompletionReportTemplateRow {
  templateId: string
  templateName: string
  allocated: number
  completed: number
  /** Allocated users who have NOT completed it this month. */
  missing: ReportUser[]
}

export interface CompletionReportFlag {
  userName: string
  templateName: string
  label: string
  state: 'Fail' | 'Advisory'
  answer: string
  /** The submitter's note/comment on this flagged item, if any. */
  note?: string
}

export interface CompletionReport {
  monthLabel: string
  templates: CompletionReportTemplateRow[]
  /** Users with ≥1 outstanding task, each with the list of tasks they owe. */
  nonCompleters: { id: string; name: string; missing: string[] }[]
  flags: CompletionReportFlag[]
  totalAllocated: number
  totalCompleted: number
}

export interface BuildCompletionReportInput {
  monthLabel: string
  templates: { id: string; name: string }[]
  /** Allocated (assigned) users per template id. */
  allocationByTemplate: Record<string, ReportUser[]>
  /** Set of user ids who completed the template this month, per template id. */
  completedByTemplate: Record<string, Set<string>>
  flags: CompletionReportFlag[]
}

export function buildCompletionReport(input: BuildCompletionReportInput): CompletionReport {
  const templates: CompletionReportTemplateRow[] = []
  const nonCompleterMap = new Map<string, { id: string; name: string; missing: string[] }>()
  let totalAllocated = 0
  let totalCompleted = 0

  for (const t of input.templates) {
    const allocated = input.allocationByTemplate[t.id] ?? []
    const done = input.completedByTemplate[t.id] ?? new Set<string>()
    const missing = allocated.filter((u) => !done.has(u.id))
    const completedCount = allocated.length - missing.length

    totalAllocated += allocated.length
    totalCompleted += completedCount

    templates.push({
      templateId: t.id,
      templateName: t.name,
      allocated: allocated.length,
      completed: completedCount,
      missing,
    })

    for (const u of missing) {
      const entry = nonCompleterMap.get(u.id) ?? { id: u.id, name: u.name, missing: [] }
      entry.missing.push(t.name)
      nonCompleterMap.set(u.id, entry)
    }
  }

  // Most-outstanding users first, then alphabetical.
  const nonCompleters = Array.from(nonCompleterMap.values()).sort(
    (a, b) => b.missing.length - a.missing.length || a.name.localeCompare(b.name),
  )

  return {
    monthLabel: input.monthLabel,
    templates: templates.sort((a, b) => a.templateName.localeCompare(b.templateName)),
    nonCompleters,
    flags: input.flags,
    totalAllocated,
    totalCompleted,
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Renders the completion report as a self-contained HTML email body. */
export function renderCompletionReportHtml(report: CompletionReport): string {
  const pct =
    report.totalAllocated > 0
      ? Math.round((report.totalCompleted / report.totalAllocated) * 100)
      : 100

  const nonCompleterBlock =
    report.nonCompleters.length === 0
      ? `<p style="margin:0 0 16px;color:#16a34a">Everyone has completed their allocated tasks. 🎉</p>`
      : `
        <h3 style="margin:16px 0 8px">Outstanding by person (${report.nonCompleters.length})</h3>
        <ul style="margin:0 0 16px;padding-left:18px">
          ${report.nonCompleters
            .map(
              (u) =>
                `<li><strong>${esc(u.name)}</strong> — ${u.missing.length} outstanding: ${esc(
                  u.missing.join(', '),
                )}</li>`,
            )
            .join('')}
        </ul>`

  const templateRows = report.templates
    .map(
      (t) => `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(t.templateName)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${t.completed}/${t.allocated}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee">${
            t.missing.length ? esc(t.missing.map((u) => u.name).join(', ')) : '—'
          }</td>
        </tr>`,
    )
    .join('')

  const flagsBlock =
    report.flags.length === 0
      ? `<p style="margin:0;color:#666">No items were flagged this month.</p>`
      : `
        <ul style="margin:0;padding-left:18px">
          ${report.flags
            .map(
              (f) =>
                `<li><strong>${esc(f.state)}</strong> — ${esc(f.templateName)}: ${esc(
                  f.label,
                )}${f.answer ? ` [${esc(f.answer)}]` : ''} <span style="color:#666">(${esc(
                  f.userName,
                )})</span>${
                  f.note
                    ? `<br/><span style="color:#666;font-style:italic">“${esc(f.note)}”</span>`
                    : ''
                }</li>`,
            )
            .join('')}
        </ul>`

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.5;max-width:640px">
      <h2 style="margin:0 0 4px">Internal tasks — completion report</h2>
      <p style="margin:0 0 16px;color:#666">${esc(report.monthLabel)}</p>

      <div style="padding:12px 16px;background:#f4f4f5;border-radius:8px;margin:0 0 16px">
        <strong>${report.totalCompleted} of ${report.totalAllocated}</strong> allocated tasks completed
        (${pct}%).
      </div>

      ${nonCompleterBlock}

      <h3 style="margin:16px 0 8px">By task</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 16px">
        <thead>
          <tr>
            <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #ddd">Task</th>
            <th style="padding:6px 8px;text-align:center;border-bottom:2px solid #ddd">Completed</th>
            <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #ddd">Outstanding</th>
          </tr>
        </thead>
        <tbody>${templateRows}</tbody>
      </table>

      <h3 style="margin:16px 0 8px">Flagged items (${report.flags.length})</h3>
      ${flagsBlock}

      <p style="margin:16px 0 0;color:#666;font-size:12px">
        Sent automatically by PyrocelCRM Internal Tasks.
      </p>
    </div>`
}
