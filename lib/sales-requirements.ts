// Shared client-side shapes + metadata for the client-request compliance
// matrix used by the quote builder and the quote view.

export type RequirementStatus = 'included' | 'partial' | 'excluded' | 'query'

export interface DraftRequirement {
  key: string
  category: string | null
  requirement: string
  our_response: string
  status: RequirementStatus
}

export interface RequirementSourceInfo {
  source_type: 'paste' | 'file'
  file_name: string | null
  file_url: string | null
  mime_type: string | null
  raw_text: string | null
  summary: string | null
}

export const REQUIREMENT_STATUS_META: Record<
  RequirementStatus,
  { label: string; short: string; badgeClass: string }
> = {
  included: {
    label: 'Included',
    short: 'Included',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  partial: {
    label: 'Partially met',
    short: 'Partial',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  excluded: {
    label: 'Excluded',
    short: 'Excluded',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
  },
  query: {
    label: 'Query raised',
    short: 'Query',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-200',
  },
}

export const REQUIREMENT_STATUSES: RequirementStatus[] = [
  'included',
  'partial',
  'excluded',
  'query',
]

export function isRequirementStatus(v: string): v is RequirementStatus {
  return (REQUIREMENT_STATUSES as string[]).includes(v)
}
