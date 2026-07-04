// Risk scoring helpers for the 5x5 RAMS risk matrix.

export const LIKELIHOOD_LABELS: Record<number, string> = {
  1: 'Rare',
  2: 'Unlikely',
  3: 'Possible',
  4: 'Likely',
  5: 'Almost Certain',
}

export const SEVERITY_LABELS: Record<number, string> = {
  1: 'Negligible',
  2: 'Minor',
  3: 'Moderate',
  4: 'Major',
  5: 'Catastrophic',
}

export type RiskBand = 'low' | 'medium' | 'high' | 'critical'

export function riskScore(likelihood: number, severity: number): number {
  return likelihood * severity
}

export function riskBand(score: number): RiskBand {
  if (score >= 15) return 'critical'
  if (score >= 10) return 'high'
  if (score >= 5) return 'medium'
  return 'low'
}

export const RISK_BAND_LABEL: Record<RiskBand, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
}

// Tailwind classes for each band (badge-style).
export const RISK_BAND_CLASS: Record<RiskBand, string> = {
  low: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  critical: 'bg-red-100 text-red-800 border-red-200',
}

// Solid colour used for the matrix cells and PDF rendering.
export function riskCellColor(score: number): string {
  const band = riskBand(score)
  switch (band) {
    case 'critical':
      return '#dc2626'
    case 'high':
      return '#ea580c'
    case 'medium':
      return '#f59e0b'
    default:
      return '#10b981'
  }
}

// The default PPE catalogue offered in the wizard.
export const PPE_OPTIONS: string[] = [
  'Safety Helmet',
  'Safety Boots',
  'Hi-Vis Vest',
  'Safety Gloves',
  'Safety Glasses',
  'Ear Protection',
  'Dust Mask / RPE',
  'Face Shield',
  'Fall Arrest Harness',
  'Cut Resistant Gloves',
  'Knee Pads',
  'Overalls',
]

export const HAZARD_CATEGORIES: string[] = [
  'Working at Height',
  'Electrical',
  'Manual Handling',
  'Slips, Trips & Falls',
  'Fire',
  'Hazardous Substances',
  'Noise',
  'Dust',
  'Confined Spaces',
  'Machinery',
  'Environmental',
  'System Specific',
  'General',
]

export const RAMS_STATUS_META: Record<
  string,
  { label: string; className: string }
> = {
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground border-border' },
  pending_approval: {
    label: 'Pending Approval',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  approved: {
    label: 'Approved',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800 border-red-200' },
  archived: { label: 'Archived', className: 'bg-slate-100 text-slate-700 border-slate-200' },
}
