import type {
  ChecklistCalculation,
  ChecklistItem,
  ChecklistResult,
} from '@/lib/types/database'

// Pure, dependency-free helpers shared by the checklist builder, the engineer
// execution UI, the rendered report, and (later) the emailed report so a
// calculation/choice answer is computed and formatted identically everywhere.

// Coerce a checklist answer value to a finite number, or null when it is not
// numeric (blank text, a boolean, an array, etc.).
export function numericValue(v: ChecklistResult['value']): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const t = v.trim()
    if (t === '') return null
    const n = Number(t)
    return Number.isNaN(n) ? null : n
  }
  return null
}

// Compute a calculation item's value from the current set of results. Only the
// referenced `number` items feed it; N/A and non-numeric answers are skipped.
// Returns null when there is nothing to compute (so the UI can show a dash).
export function computeCalculation(
  calc: ChecklistCalculation | undefined,
  results: ChecklistResult[],
): number | null {
  if (!calc || calc.itemIds.length === 0) return calc?.op === 'count' ? 0 : null
  const byId = new Map(results.map((r) => [r.item_id, r]))
  const nums: number[] = []
  for (const id of calc.itemIds) {
    const row = byId.get(id)
    if (!row || row.na) continue
    const n = numericValue(row.value)
    if (n !== null) nums.push(n)
  }
  if (calc.op === 'count') return nums.length
  if (nums.length === 0) return null
  switch (calc.op) {
    case 'sum':
      return nums.reduce((a, b) => a + b, 0)
    case 'average':
      return nums.reduce((a, b) => a + b, 0) / nums.length
    case 'min':
      return Math.min(...nums)
    case 'max':
      return Math.max(...nums)
    default:
      return null
  }
}

// Human label for a calculation operation (used in builder + report captions).
export function calculationOpLabel(op: ChecklistCalculation['op']): string {
  switch (op) {
    case 'sum':
      return 'Sum'
    case 'average':
      return 'Average'
    case 'min':
      return 'Minimum'
    case 'max':
      return 'Maximum'
    case 'count':
      return 'Count of answered'
    default:
      return op
  }
}

// Format a computed calculation value for display. Whole numbers stay whole;
// fractional results are shown to two decimals. Null renders as an em dash.
export function formatCalculationValue(n: number | null): string {
  if (n === null) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

// The suggested answer configured for a chosen option, if any.
export function suggestionForOption(
  item: Pick<ChecklistItem, 'optionSuggestions'>,
  option: string,
): string | undefined {
  const s = item.optionSuggestions?.[option]
  return s && s.trim() ? s : undefined
}

// Render a choice answer (single string or multi-select array) for display.
export function formatChoiceValue(value: ChecklistResult['value']): string {
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—'
  if (typeof value === 'string') return value.trim() ? value : '—'
  return value == null ? '—' : String(value)
}
