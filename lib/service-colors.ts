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

/**
 * Expanded palette for personalising the main dashboard — used for both module
 * tile colours and shortcut colour-coding. Wider than SERVICE_COLOR_OPTIONS
 * (which stays constrained/on-brand for service-type setup) and includes the
 * full spectrum plus purple/violet and pink, which are fine for personal use.
 */
export const TILE_COLOR_OPTIONS: ServiceColorOption[] = [
  { value: PYROCEL_RED, label: 'Pyrocel Red' },
  { value: '#e11d48', label: 'Rose' },
  { value: '#db2777', label: 'Pink' },
  { value: '#ea580c', label: 'Orange' },
  { value: '#d97706', label: 'Amber' },
  { value: '#ca8a04', label: 'Gold' },
  { value: '#65a30d', label: 'Lime' },
  { value: '#16a34a', label: 'Green' },
  { value: '#059669', label: 'Emerald' },
  { value: '#0d9488', label: 'Teal' },
  { value: '#0891b2', label: 'Cyan' },
  { value: '#0284c7', label: 'Sky' },
  { value: '#2563eb', label: 'Blue' },
  { value: '#4f46e5', label: 'Indigo' },
  { value: '#7c3aed', label: 'Violet' },
  { value: '#9333ea', label: 'Purple' },
  { value: '#475569', label: 'Slate' },
  { value: '#0f172a', label: 'Charcoal' },
]

/** Returns the label for a stored tile colour value, if it matches a preset. */
export function getTileColorLabel(value?: string | null): string | undefined {
  if (!value) return undefined
  return TILE_COLOR_OPTIONS.find((c) => c.value.toLowerCase() === value.toLowerCase())?.label
}
