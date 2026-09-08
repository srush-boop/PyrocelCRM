import type { ReportFilenamePattern } from '@/lib/types/database'

/**
 * Report PDF filename conventions.
 *
 * Clients want the attached report PDF named to their own convention, built from
 * CRM fields and specific to the site, system and service. This module owns the
 * token vocabulary, the tiered resolution of which pattern applies, and the
 * safe interpolation of a pattern into an actual filename.
 *
 * Resolution order (most specific wins):
 *   1. client + service   (this client, this service type)
 *   2. client default      (this client, service_type_id NULL)
 *   3. company + service   (client_id NULL, this service type)
 *   4. company default     (both NULL)
 *   5. built-in DEFAULT_FILENAME_PATTERN
 */

export const DEFAULT_FILENAME_PATTERN = '{site} - {system} - {service} - {date}'

export interface FilenameToken {
  token: string
  label: string
  /** Short description of what the token resolves to. */
  hint: string
}

// The tokens an author can use in a pattern. Order drives the settings UI chips.
export const FILENAME_TOKENS: FilenameToken[] = [
  { token: 'site', label: 'Site', hint: 'Site name' },
  { token: 'system', label: 'System', hint: 'System (e.g. Fire Alarm)' },
  { token: 'service', label: 'Service', hint: 'Service type name' },
  { token: 'visit', label: 'Visit', hint: 'Visit type (e.g. Annual)' },
  { token: 'client', label: 'Client', hint: 'Client name' },
  { token: 'reference', label: 'Reference', hint: 'Report reference number' },
  { token: 'date', label: 'Date', hint: 'Completion date (YYYY-MM-DD)' },
  { token: 'engineer', label: 'Engineer', hint: 'Engineer name' },
  { token: 'status', label: 'Status', hint: 'Overall result' },
]

/** The concrete field values a pattern is interpolated against. */
export interface FilenameVars {
  site?: string | null
  system?: string | null
  service?: string | null
  visit?: string | null
  client?: string | null
  reference?: string | null
  date?: string | null
  engineer?: string | null
  status?: string | null
}

/**
 * Choose the effective pattern string for a (client, service) pair from all
 * stored rows, honouring the tiered precedence. Returns the built-in default
 * when nothing matches.
 */
export function resolveFilenamePattern(
  patterns: ReportFilenamePattern[] | null | undefined,
  clientId: string | null | undefined,
  serviceTypeId: string | null | undefined,
): string {
  const rows = patterns ?? []
  const match = (
    cid: string | null,
    sid: string | null,
  ): string | undefined => {
    const row = rows.find(
      (r) =>
        (r.client_id ?? null) === cid &&
        (r.service_type_id ?? null) === sid &&
        typeof r.pattern === 'string' &&
        r.pattern.trim().length > 0,
    )
    return row?.pattern
  }

  const cid = clientId ?? null
  const sid = serviceTypeId ?? null

  return (
    (sid ? match(cid, sid) : undefined) ??
    (cid ? match(cid, null) : undefined) ??
    (sid ? match(null, sid) : undefined) ??
    match(null, null) ??
    DEFAULT_FILENAME_PATTERN
  )
}

// Characters that are unsafe or awkward in filenames across OSes / email clients.
const UNSAFE_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g

/** Collapse a single interpolated token value into a filename-safe fragment. */
function cleanFragment(value: string): string {
  return value
    .replace(UNSAFE_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Interpolate a pattern with `vars`, dropping tokens that resolve to nothing so
 * an empty field doesn't leave dangling separators (e.g. a reactive call with
 * no system shouldn't yield "Site -  - Service").
 */
export function interpolateFilename(
  pattern: string,
  vars: FilenameVars,
): string {
  const lookup: Record<string, string> = {}
  for (const [key, raw] of Object.entries(vars)) {
    lookup[key] = raw == null ? '' : cleanFragment(String(raw))
  }

  // Replace each {token}. Unknown tokens resolve to empty.
  let out = pattern.replace(/\{\s*([\w.]+)\s*\}/g, (_m, key: string) =>
    key in lookup ? lookup[key] : '',
  )

  // Strip unsafe characters across the whole assembled name — this also catches
  // literal separators an author typed into the pattern (e.g. "/").
  out = out.replace(UNSAFE_CHARS, ' ')

  // Tidy separators left behind by empty tokens: collapse a run of dash
  // separators (e.g. "A -  - B" from an empty middle token) to a single " - ",
  // then trim stray leading/trailing separators and whitespace.
  out = out
    .replace(/(\s*-\s*){2,}/g, ' - ')
    .replace(/^[\s\-_]+/, '')
    .replace(/[\s\-_]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()

  return out
}

/**
 * Build the final `.pdf` filename from a pattern + vars. Guarantees a non-empty,
 * length-capped name ending in `.pdf`.
 */
export function buildReportFilename(
  pattern: string,
  vars: FilenameVars,
): string {
  let base = interpolateFilename(pattern || DEFAULT_FILENAME_PATTERN, vars)
  if (!base) {
    base = interpolateFilename(DEFAULT_FILENAME_PATTERN, vars) || 'Service Report'
  }
  // Cap the base (before extension) to a sane length for email attachments.
  if (base.length > 180) base = base.slice(0, 180).trim()
  return `${base}.pdf`
}

/** Sample values used to preview a pattern in the settings UI. */
export const SAMPLE_FILENAME_VARS: FilenameVars = {
  site: 'Acme Tower',
  system: 'Fire Alarm',
  service: 'Annual Service',
  visit: 'Annual',
  client: 'Acme Property Ltd',
  reference: 'PYR-2026-000123',
  date: '2026-09-07',
  engineer: 'Sam Rivers',
  status: 'Pass',
}
