import type { McpResult } from '@/lib/types/database'

export const MCP_SERVICE_NAME = 'Weekly Fire Alarm Testing'

/** Detects whether a service type is the weekly fire alarm testing service. */
export function isFireAlarmService(name?: string | null): boolean {
  if (!name) return false
  return name.trim().toLowerCase() === MCP_SERVICE_NAME.toLowerCase()
}

/**
 * Generate a unique-ish MCP URN.
 * Format: MCP-XXXXXX (6 char Crockford base32) so labels stay short.
 */
export function generateMcpUrn(prefix = 'MCP'): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' // Crockford base32 (no I,L,O,U)
  let out = ''
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return `${prefix}-${out}`
}

/** Common manual call point test key types (engineers can also type their own). */
export const TEST_KEY_TYPES = [
  'Standard reset key',
  'Triangular key',
  'Allen / hex key',
  'Glass element',
  'Plastic resettable element',
  'No key required',
]

export const MCP_RESULT_LABELS: Record<McpResult, string> = {
  pass: 'Pass',
  fail: 'Fail',
  remedial: 'Remedial',
  na: 'N/A',
}

export const MCP_RESULT_VARIANT: Record<McpResult, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  pass: 'default',
  fail: 'destructive',
  remedial: 'secondary',
  na: 'outline',
}
