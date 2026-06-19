import type { Damper, DamperInspection, DamperResult } from '@/lib/types/database'

export const DAMPER_SERVICE_NAME = 'Fire & Smoke Damper Testing'

/** Detects whether a service type is the fire & smoke damper service. */
export function isDamperService(name?: string | null): boolean {
  if (!name) return false
  return name.trim().toLowerCase() === DAMPER_SERVICE_NAME.toLowerCase()
}

/**
 * Generate a unique-ish damper URN.
 * Format: FD-XXXXXX (6 char base32 from time + random) so labels stay short.
 */
export function generateUrn(prefix = 'FD'): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' // Crockford base32 (no I,L,O,U)
  let out = ''
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return `${prefix}-${out}`
}

export const DAMPER_TYPE_LABELS: Record<string, string> = {
  fire: 'Fire Damper',
  smoke: 'Smoke Damper',
  fire_smoke: 'Fire/Smoke Damper',
}

export const RESULT_LABELS: Record<DamperResult, string> = {
  pass: 'Pass',
  fail: 'Fail',
  remedial: 'Remedial',
  na: 'N/A',
}

export interface DamperSummary {
  total: number
  tested: number
  notTested: number
  passed: number
  failed: number
  remedial: number
  na: number
  accessible: number
  inaccessible: number
  passRate: number
}

/**
 * Compute summary metrics for a report from the dampers and the
 * inspections recorded against a given task.
 */
export function computeSummary(
  dampers: Damper[],
  inspections: DamperInspection[],
): DamperSummary {
  const total = dampers.length
  const byDamper = new Map<string, DamperInspection>()
  for (const insp of inspections) {
    // keep the latest inspection per damper for this task set
    const existing = byDamper.get(insp.damper_id)
    if (!existing || insp.inspection_date > existing.inspection_date) {
      byDamper.set(insp.damper_id, insp)
    }
  }

  let passed = 0
  let failed = 0
  let remedial = 0
  let na = 0
  let accessible = 0
  let inaccessible = 0

  for (const insp of byDamper.values()) {
    switch (insp.overall_result) {
      case 'pass':
        passed++
        break
      case 'fail':
        failed++
        break
      case 'remedial':
        remedial++
        break
      case 'na':
        na++
        break
    }
    if (insp.accessible) accessible++
    else inaccessible++
  }

  const tested = byDamper.size
  const notTested = Math.max(0, total - tested)
  const assessed = passed + failed + remedial
  const passRate = assessed > 0 ? Math.round((passed / assessed) * 100) : 0

  return {
    total,
    tested,
    notTested,
    passed,
    failed,
    remedial,
    na,
    accessible,
    inaccessible,
    passRate,
  }
}

export const RESULT_COLORS: Record<DamperResult, string> = {
  pass: '#16a34a',
  fail: '#dc2626',
  remedial: '#d97706',
  na: '#6b7280',
}
