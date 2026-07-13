import type { NominalCode } from '@/lib/types/database'

// Where a resolved nominal code came from, for surfacing an "auto from …" hint.
export type NominalSource = 'explicit' | 'department' | 'service_type' | null

export interface NominalResolution {
  nominalCodeId: string | null
  source: NominalSource
}

// Candidate code ids feeding the resolver. Order of preference is:
//   explicit (an override set directly on the item)
//   → department (first fallback, per the agreed order)
//   → service type (second fallback)
//   → none (caller must pick manually)
export interface NominalCandidates {
  explicitId?: string | null
  departmentId?: string | null
  serviceTypeId?: string | null
}

/**
 * Resolve which nominal code applies, following the agreed precedence:
 * explicit → department → service type. Returns the id plus the source it came
 * from so the UI can show an "auto from {source}" hint and flag unresolved
 * items. Purely deterministic; no I/O.
 */
export function resolveNominalCode(c: NominalCandidates): NominalResolution {
  if (c.explicitId) return { nominalCodeId: c.explicitId, source: 'explicit' }
  if (c.departmentId) return { nominalCodeId: c.departmentId, source: 'department' }
  if (c.serviceTypeId) return { nominalCodeId: c.serviceTypeId, source: 'service_type' }
  return { nominalCodeId: null, source: null }
}

export function nominalSourceLabel(source: NominalSource): string {
  switch (source) {
    case 'explicit':
      return 'set directly'
    case 'department':
      return 'from department'
    case 'service_type':
      return 'from service type'
    default:
      return 'not set'
  }
}

/** Build a quick id → "CODE — Name" lookup for rendering resolved codes. */
export function nominalCodeLabelMap(codes: NominalCode[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const c of codes) m.set(c.id, `${c.code} — ${c.name}`)
  return m
}

export function formatNominalCode(code: NominalCode | null | undefined): string {
  if (!code) return ''
  return `${code.code} — ${code.name}`
}
