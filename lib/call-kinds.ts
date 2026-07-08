import type { ServiceType } from '@/lib/types/database'

export type CallKind = ServiceType['call_kind']

// The three kinds of call/service type. Used by the service-type editor and
// table so the labels/descriptions stay consistent.
export const CALL_KIND_OPTIONS: {
  value: CallKind
  label: string
  description: string
}[] = [
  {
    value: 'recurring',
    label: 'Recurring (PPM)',
    description: 'Scheduled preventative maintenance visits with a compliance deadline.',
  },
  {
    value: 'reactive',
    label: 'Reactive / on-demand',
    description: 'Logged ad-hoc against a site with an "attend within X hours" KPI. Can be an emergency.',
  },
  {
    value: 'planned',
    label: 'Planned (one-off)',
    description: 'A scheduled one-off job (e.g. Commissioning). No deadline or KPI, never an emergency.',
  },
]

export const CALL_KIND_LABELS: Record<CallKind, string> = {
  recurring: 'Recurring',
  reactive: 'Reactive',
  planned: 'Planned',
}

// Resolve a service type's call kind, falling back to the legacy boolean flags
// for rows created before the call_kind column existed.
export function resolveCallKind(
  st: Pick<ServiceType, 'call_kind' | 'is_recurring'>,
): CallKind {
  return st.call_kind ?? (st.is_recurring ? 'recurring' : 'reactive')
}

// A call type spans multiple systems / uses per-system checklists only when it
// is non-recurring (reactive or planned). Recurring PPM stays single-system.
export function supportsMultiSystem(kind: CallKind): boolean {
  return kind !== 'recurring'
}

// Derive the legacy boolean flags kept in sync with call_kind for backward
// compatibility across the app.
export function callKindFlags(kind: CallKind, isEmergency: boolean) {
  return {
    call_kind: kind,
    is_recurring: kind === 'recurring',
    is_emergency: kind === 'reactive' ? isEmergency : false,
  }
}
