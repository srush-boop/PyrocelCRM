import type { PanelFieldDef, SystemPanel } from '@/lib/types/database'

// Format a single panel field value for display, respecting its type.
export function formatPanelFieldValue(
  def: PanelFieldDef,
  value: string | number | boolean | null | undefined,
): string {
  if (value === null || value === undefined || value === '') return '—'
  if (def.field_type === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

// Panel fields to show in a compact summary (active defs, ordered).
export function orderedActiveDefs(defs: PanelFieldDef[]): PanelFieldDef[] {
  return [...defs].filter((d) => d.active).sort((a, b) => a.position - b.position)
}

// A short one-line summary of a panel's key attributes for list rows.
export function panelSummaryLine(panel: SystemPanel, defs: PanelFieldDef[]): string {
  const parts: string[] = []
  for (const def of orderedActiveDefs(defs).slice(0, 3)) {
    const val = panel.field_values?.[def.field_key]
    if (val !== null && val !== undefined && val !== '') {
      parts.push(`${def.label}: ${formatPanelFieldValue(def, val)}`)
    }
  }
  return parts.join(' · ')
}
