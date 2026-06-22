/**
 * Canonical Pyrocel brand red, used as the default colour scheme for fire
 * safety service types (fire alarms, extinguishers, dampers) and their reports.
 */
export const PYROCEL_RED = '#c8102e'

export interface ServiceColorOption {
  /** Hex value stored on the service type. */
  value: string
  /** Human friendly label shown in the picker. */
  label: string
}

/**
 * Preset colour schemes offered when setting up a service type. Pyrocel red is
 * first so it is the natural default for fire safety services. Purple/violet is
 * intentionally excluded to stay on-brand.
 */
export const SERVICE_COLOR_OPTIONS: ServiceColorOption[] = [
  { value: PYROCEL_RED, label: 'Pyrocel Red' },
  { value: '#ea580c', label: 'Orange' },
  { value: '#d97706', label: 'Amber' },
  { value: '#16a34a', label: 'Green' },
  { value: '#0d9488', label: 'Teal' },
  { value: '#2563eb', label: 'Blue' },
  { value: '#475569', label: 'Slate' },
  { value: '#0f172a', label: 'Charcoal' },
]

/** Returns the label for a stored colour value, if it matches a preset. */
export function getServiceColorLabel(value?: string | null): string | undefined {
  if (!value) return undefined
  return SERVICE_COLOR_OPTIONS.find((c) => c.value.toLowerCase() === value.toLowerCase())?.label
}
