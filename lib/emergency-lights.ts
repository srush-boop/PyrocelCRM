import type { EmergencyLightResult } from '@/lib/types/database'

export const EMERGENCY_LIGHT_SERVICE_NAME = 'Emergency Lighting'

/** Detects whether a service type is the emergency lighting service. */
export function isEmergencyLightService(name?: string | null): boolean {
  if (!name) return false
  return name.trim().toLowerCase().includes('emergency light')
}

/**
 * Generate a unique-ish emergency light URN.
 * Format: EL-XXXXXX (6 char Crockford base32) so labels stay short.
 */
export function generateEmergencyLightUrn(prefix = 'EL'): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' // Crockford base32 (no I,L,O,U)
  let out = ''
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return `${prefix}-${out}`
}

/** Common emergency light fitting types (engineers can also type their own). */
export const FITTING_TYPES = [
  'Maintained',
  'Non-maintained',
  'Self-contained',
  'Central battery',
  'Exit sign / signage',
  'Bulkhead',
  'Twin spot',
  'Recessed downlight',
]

/**
 * The standard emergency lighting inspection checklist (BS 5266 style).
 * Each item is scored pass / fail / na per fitting.
 */
export interface EmergencyLightCheckItem {
  id: string
  label: string
}

export const EMERGENCY_LIGHT_CHECKLIST: EmergencyLightCheckItem[] = [
  { id: 'illuminates', label: 'Illuminates on test' },
  { id: 'duration', label: 'Maintains full rated duration' },
  { id: 'charging', label: 'Charging indicator (LED) healthy' },
  { id: 'lamp_clean', label: 'Lamp/diffuser clean and undamaged' },
  { id: 'fixing_secure', label: 'Fitting securely mounted' },
  { id: 'signage_visible', label: 'Signage correct and visible' },
  { id: 'no_obstruction', label: 'No obstructions to illumination' },
]

export const EMERGENCY_LIGHT_RESULT_LABELS: Record<EmergencyLightResult, string> = {
  pass: 'Pass',
  fail: 'Fail',
  remedial: 'Remedial',
  na: 'N/A',
}

export const EMERGENCY_LIGHT_RESULT_VARIANT: Record<
  EmergencyLightResult,
  'default' | 'destructive' | 'secondary' | 'outline'
> = {
  pass: 'default',
  fail: 'destructive',
  remedial: 'secondary',
  na: 'outline',
}
