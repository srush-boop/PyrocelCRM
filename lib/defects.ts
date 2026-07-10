import type { ChecklistResult, DefectStatus } from '@/lib/types/database'

// A single failed checklist line, used for interrogation and quote scope prefill.
export interface FailedChecklistItem {
  item_id: string
  label: string
  notes?: string
}

// Extract the failed pass/fail items from a report's checklist results.
// A failure is a 'pass_fail' item explicitly marked passed === false.
// Advisory items are deliberately excluded — they are not failures.
export function getFailedChecklistItems(
  results: ChecklistResult[] | null | undefined,
): FailedChecklistItem[] {
  if (!Array.isArray(results)) return []
  return results
    .filter((r) => r.type === 'pass_fail' && r.passed === false && !r.advisory)
    .map((r) => ({ item_id: r.item_id, label: r.label, notes: r.notes }))
}

// Extract advisory items — pass/fail items flagged as worth noting but not
// failures. These are surfaced in the defects log for review alongside failures.
export function getAdvisoryChecklistItems(
  results: ChecklistResult[] | null | undefined,
): FailedChecklistItem[] {
  if (!Array.isArray(results)) return []
  return results
    .filter((r) => r.type === 'pass_fail' && r.advisory === true)
    .map((r) => ({ item_id: r.item_id, label: r.label, notes: r.notes }))
}

// Build a human-readable scope-of-works block from failed items, suitable for
// prefilling a remedial quote's notes/description.
export function buildRemedialScope(
  failedItems: FailedChecklistItem[],
  opts: { reference?: string | null; siteName?: string | null } = {},
): string {
  const lines: string[] = []
  lines.push('Remedial works required following inspection.')
  if (opts.siteName) lines.push(`Site: ${opts.siteName}`)
  if (opts.reference) lines.push(`Report reference: ${opts.reference}`)
  lines.push('')
  lines.push('Defects identified:')
  failedItems.forEach((item, i) => {
    lines.push(`${i + 1}. ${item.label}${item.notes ? ` — ${item.notes}` : ''}`)
  })
  return lines.join('\n')
}

export const DEFECT_STATUS_LABELS: Record<DefectStatus, string> = {
  open: 'Open',
  quoted: 'Quoted',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
}
