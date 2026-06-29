// Helpers for the quote "Not required" per-section feature.
//
// When a user marks a quote section as "Not required", we record it in the
// system's conditional_values using two reserved keys (so we don't need a schema
// change):
//   __omitted_sections : JSON array of section ids the user switched off. Used
//                        to restore the toggle state when re-opening the builder.
//   __omitted_keys     : JSON array of element_keys belonging to those sections.
//                        Used by the print/quote document to exclude those answers.
//
// Answers themselves are kept in conditional_values so toggling a section back on
// restores everything; they are simply hidden from the printed quote.

export const OMITTED_SECTIONS_KEY = '__omitted_sections'
export const OMITTED_KEYS_KEY = '__omitted_keys'

// Reserved keys never render as quote answers.
export const RESERVED_CONDITIONAL_KEYS = [OMITTED_SECTIONS_KEY, OMITTED_KEYS_KEY]

type ConditionalValue = string | number | boolean

function parseStringArray(value: ConditionalValue | undefined | null): string[] {
  if (typeof value !== 'string' || !value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export function getOmittedSectionIds(
  values: Record<string, ConditionalValue> | null | undefined,
): string[] {
  return parseStringArray(values?.[OMITTED_SECTIONS_KEY])
}

export function getOmittedElementKeys(
  values: Record<string, ConditionalValue> | null | undefined,
): string[] {
  return parseStringArray(values?.[OMITTED_KEYS_KEY])
}

// True when a conditional_values key should never be rendered on the quote:
// it's one of the reserved bookkeeping keys, or it belongs to an omitted section.
export function isHiddenConditionalKey(
  key: string,
  omittedKeys: Set<string>,
): boolean {
  if (RESERVED_CONDITIONAL_KEYS.includes(key)) return true
  return omittedKeys.has(key)
}
