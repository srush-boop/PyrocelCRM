import type {
  Extinguisher,
  ExtinguisherInspection,
  ExtinguisherResult,
  ExtinguisherType,
  ExtinguisherServiceLevel,
  ExtinguisherPhotoCategory,
} from '@/lib/types/database'

export const EXTINGUISHER_SERVICE_NAME = 'Fire Extinguisher Servicing'

/** Detects whether a service type is the fire extinguisher servicing service. */
export function isExtinguisherService(name?: string | null): boolean {
  if (!name) return false
  return name.trim().toLowerCase() === EXTINGUISHER_SERVICE_NAME.toLowerCase()
}

/**
 * Generate a unique-ish extinguisher URN.
 * Format: FE-XXXXXX (6 char base32 from random) so labels stay short.
 */
export function generateUrn(prefix = 'FE'): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' // Crockford base32 (no I,L,O,U)
  let out = ''
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return `${prefix}-${out}`
}

export const EXTINGUISHER_TYPE_LABELS: Record<ExtinguisherType, string> = {
  water: 'Water',
  foam: 'Foam (AFFF)',
  co2: 'CO₂',
  powder: 'Dry Powder',
  wet_chemical: 'Wet Chemical',
  water_mist: 'Water Mist',
}

/** Short colour-coded band reference used on UK extinguisher bodies. */
export const EXTINGUISHER_TYPE_COLORS: Record<ExtinguisherType, string> = {
  water: '#dc2626', // red body
  foam: '#f5f5f4', // cream band
  co2: '#1f2937', // black band
  powder: '#2563eb', // blue band
  wet_chemical: '#eab308', // yellow band
  water_mist: '#ffffff', // white band
}

export const SERVICE_LEVEL_LABELS: Record<ExtinguisherServiceLevel, string> = {
  basic: 'Basic (annual)',
  extended: 'Extended (5 yr)',
  overhaul: 'Overhaul (10 yr)',
  recharge: 'Recharge / refill',
}

/** Required photo categories captured for each extinguisher inspection. */
export const PHOTO_CATEGORIES: { key: ExtinguisherPhotoCategory; label: string; hint: string }[] = [
  { key: 'as_found', label: 'Extinguisher as found', hint: 'Position and mounting before service' },
  { key: 'gauge', label: 'Pressure gauge', hint: 'Gauge reading in the operating band' },
  { key: 'label', label: 'Service label', hint: 'Service label / commissioning details' },
  { key: 'additional', label: 'Additional (comments / remedial)', hint: 'Any further evidence' },
]

export function emptyPhotoCategories(): Record<ExtinguisherPhotoCategory, string[]> {
  return { as_found: [], gauge: [], label: [], additional: [] }
}

export const RESULT_LABELS: Record<ExtinguisherResult, string> = {
  pass: 'Pass',
  fail: 'Fail',
  remedial: 'Remedial',
  na: 'N/A',
}

export interface ExtinguisherSummary {
  total: number
  serviced: number
  notServiced: number
  passed: number
  failed: number
  remedial: number
  na: number
  accessible: number
  inaccessible: number
  passRate: number
}

/**
 * Compute summary metrics for a report from the extinguishers and the
 * inspections recorded against a given task.
 */
export function computeSummary(
  extinguishers: Extinguisher[],
  inspections: ExtinguisherInspection[],
): ExtinguisherSummary {
  const total = extinguishers.length
  const byExtinguisher = new Map<string, ExtinguisherInspection>()
  for (const insp of inspections) {
    // keep the latest inspection per extinguisher for this task set
    const existing = byExtinguisher.get(insp.extinguisher_id)
    if (!existing || insp.inspection_date > existing.inspection_date) {
      byExtinguisher.set(insp.extinguisher_id, insp)
    }
  }

  let passed = 0
  let failed = 0
  let remedial = 0
  let na = 0
  let accessible = 0
  let inaccessible = 0

  for (const insp of byExtinguisher.values()) {
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

  const serviced = byExtinguisher.size
  const notServiced = Math.max(0, total - serviced)
  const assessed = passed + failed + remedial
  const passRate = assessed > 0 ? Math.round((passed / assessed) * 100) : 0

  return {
    total,
    serviced,
    notServiced,
    passed,
    failed,
    remedial,
    na,
    accessible,
    inaccessible,
    passRate,
  }
}

export const RESULT_COLORS: Record<ExtinguisherResult, string> = {
  pass: '#16a34a',
  fail: '#dc2626',
  remedial: '#d97706',
  na: '#6b7280',
}
