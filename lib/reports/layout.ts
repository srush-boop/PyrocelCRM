import type { ReportBlock, ReportBlockType, ReportTemplate } from '@/lib/types/database'

/**
 * Shared, framework-agnostic model for the per-service report designer.
 *
 * A report is: an always-on branded masthead header, a DESIGNABLE body made of
 * ordered blocks, and an always-on compliance footer. This module owns the body
 * model — the default layouts (which reproduce the original hardcoded order when
 * a template has no custom `layout`), block metadata for the editor, a factory
 * for new blocks, {{variable}} interpolation for author text, and the
 * template-merge/resolution rules (service-specific → global default → builtin).
 */

// Data blocks pull from the live task result; custom blocks carry authored
// content. The masthead + footer are NOT blocks.
export const DATA_BLOCK_TYPES: ReportBlockType[] = [
  'meta_grid',
  'status_ribbon',
  'summary_kpis',
  'results',
  'engineer_notes',
  'photos',
  'engineer_signature',
  'client_signoff',
]

export const CUSTOM_BLOCK_TYPES: ReportBlockType[] = [
  'heading',
  'text',
  'image',
  'spacer',
  'page_break',
]

// Sections that render a numbered heading (1, 2, 3…). Numbering is assigned in
// document order to the numbered sections that actually render, so reordering
// the layout renumbers them and empty sections leave no gap.
export const NUMBERED_BLOCK_TYPES = new Set<ReportBlockType>([
  'results',
  'engineer_notes',
  'photos',
])

export interface BlockMeta {
  label: string
  description: string
  kind: 'data' | 'custom'
}

export const BLOCK_META: Record<ReportBlockType, BlockMeta> = {
  meta_grid: {
    label: 'Details grid',
    description: 'Reference, site, engineer, address, service, visit.',
    kind: 'data',
  },
  status_ribbon: {
    label: 'Overall result ribbon',
    description: 'The prominent pass/fail/partial outcome banner.',
    kind: 'data',
  },
  summary_kpis: {
    label: 'Summary KPIs & chart',
    description: 'Pass-rate stat cards and the results breakdown chart.',
    kind: 'data',
  },
  results: {
    label: 'Results table',
    description: 'The full checklist / asset inspection table.',
    kind: 'data',
  },
  engineer_notes: {
    label: 'Engineer notes',
    description: "The engineer's free-text notes (hidden when empty).",
    kind: 'data',
  },
  photos: {
    label: 'Photographic evidence',
    description: 'Photos captured during the visit (hidden when none).',
    kind: 'data',
  },
  engineer_signature: {
    label: 'Engineer signature',
    description: 'The signing engineer / signatory block.',
    kind: 'data',
  },
  client_signoff: {
    label: 'Client sign-off',
    description: "On-site representative's signature (non-recurring calls).",
    kind: 'data',
  },
  heading: {
    label: 'Heading',
    description: 'A custom section heading.',
    kind: 'custom',
  },
  text: {
    label: 'Text',
    description: 'A custom paragraph. Supports {{variables}}.',
    kind: 'custom',
  },
  image: {
    label: 'Image',
    description: 'A custom image with an optional caption.',
    kind: 'custom',
  },
  spacer: {
    label: 'Spacer',
    description: 'Vertical whitespace.',
    kind: 'custom',
  },
  page_break: {
    label: 'Page break',
    description: 'Forces the next content onto a new printed page.',
    kind: 'custom',
  },
}

// Author text tokens that interpolate against live (or sample) data.
export const REPORT_TEXT_VARIABLES: { token: string; label: string }[] = [
  { token: 'site.name', label: 'Site name' },
  { token: 'site.address', label: 'Site address' },
  { token: 'client.name', label: 'Client name' },
  { token: 'engineer', label: 'Engineer name' },
  { token: 'service', label: 'Service name' },
  { token: 'visit', label: 'Visit type' },
  { token: 'reference', label: 'Report reference' },
  { token: 'date', label: 'Report date' },
  { token: 'company.name', label: 'Company name' },
]

/** Replace {{token}} occurrences with values from `vars` (unknown → blank). */
export function interpolateReportText(
  content: string,
  vars: Record<string, string>,
): string {
  return content.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) =>
    key in vars ? vars[key] : '',
  )
}

function defaultProps(type: ReportBlockType): Record<string, unknown> | undefined {
  switch (type) {
    case 'heading':
      return { content: 'Section heading', level: 1 }
    case 'text':
      return { content: '' }
    case 'image':
      return { imageUrl: '', caption: '' }
    case 'spacer':
      return { size: 'md' }
    default:
      return undefined
  }
}

/** Build a fresh block with a stable id and sensible default props. */
export function createReportBlock(type: ReportBlockType): ReportBlock {
  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `blk_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    type,
    enabled: true,
    props: defaultProps(type),
  }
}

// Fixed-id default block (id === type is unique within a default layout, so keys
// stay stable across renders without generating UUIDs on the server).
function defBlock(type: ReportBlockType): ReportBlock {
  return { id: type, type, enabled: true, props: defaultProps(type) }
}

/** The generic service report's original section order, as a block array. */
export const DEFAULT_SERVICE_LAYOUT: ReportBlock[] = [
  defBlock('meta_grid'),
  defBlock('status_ribbon'),
  defBlock('summary_kpis'),
  defBlock('results'),
  defBlock('engineer_notes'),
  defBlock('photos'),
  defBlock('engineer_signature'),
  defBlock('client_signoff'),
]

/**
 * Damper / extinguisher asset reports' original section order. Asset reports
 * fold their whole inspection body (summary charts, remedials, detail table,
 * per-asset detail) into the `results` block, and have no separate engineer
 * notes / photos / client sign-off sections.
 */
export const DEFAULT_ASSET_LAYOUT: ReportBlock[] = [
  defBlock('meta_grid'),
  defBlock('status_ribbon'),
  defBlock('summary_kpis'),
  defBlock('results'),
  defBlock('engineer_signature'),
]

export type ReportKind = 'service' | 'asset'

export function defaultLayoutFor(kind: ReportKind): ReportBlock[] {
  return kind === 'asset' ? DEFAULT_ASSET_LAYOUT : DEFAULT_SERVICE_LAYOUT
}

/**
 * Resolve the effective layout for a template: its own `layout` if set, else the
 * built-in default for the report kind. Only enabled blocks are returned, in
 * order.
 */
export function resolveLayout(
  template: ReportTemplate | null | undefined,
  kind: ReportKind,
): ReportBlock[] {
  const layout = template?.layout ?? defaultLayoutFor(kind)
  return layout.filter((b) => b.enabled !== false)
}

/**
 * Merge a service-specific template row over the company-wide default row.
 * Field-by-field: specific value wins, else the default's, else null/builtin.
 * Returns null only when BOTH inputs are null (caller then uses pure builtins).
 */
export function resolveTemplate(
  specific: ReportTemplate | null | undefined,
  globalDefault: ReportTemplate | null | undefined,
): ReportTemplate | null {
  if (!specific && !globalDefault) return null
  const pick = <K extends keyof ReportTemplate>(key: K): ReportTemplate[K] => {
    const s = specific?.[key]
    if (s !== null && s !== undefined) return s as ReportTemplate[K]
    const d = globalDefault?.[key]
    if (d !== null && d !== undefined) return d as ReportTemplate[K]
    return (specific?.[key] ?? globalDefault?.[key] ?? null) as ReportTemplate[K]
  }
  const base = specific ?? globalDefault!
  return {
    id: base.id,
    service_type_id: specific?.service_type_id ?? null,
    name: pick('name'),
    company_name: pick('company_name'),
    logo_url: pick('logo_url'),
    header_color: pick('header_color'),
    footer_text: pick('footer_text'),
    include_signature:
      specific?.include_signature ?? globalDefault?.include_signature ?? true,
    sections: {
      ...(globalDefault?.sections ?? {}),
      ...(specific?.sections ?? {}),
    },
    layout: specific?.layout ?? globalDefault?.layout ?? null,
  }
}
