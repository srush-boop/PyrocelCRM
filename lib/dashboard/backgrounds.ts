/**
 * Dashboard background presets. Each preset maps to a CSS class defined in
 * app/globals.css (the `.dash-bg-*` rules). Patterns are built from theme tokens
 * via `color-mix`, so they adapt automatically to light and dark mode and stay
 * on-brand (Pyrocel red, no purple).
 *
 * The stored value on `profiles.dashboard_background` is the preset `key`.
 * `null`/unknown resolves to "none" (the default clean background).
 */
export type DashboardBackground = {
  /** Stable key persisted on the profile. */
  key: string
  /** Human friendly label shown in the picker. */
  label: string
  /** Short description of the look. */
  description: string
  /** CSS class applied to the full-bleed background layer ("" for none). */
  className: string
}

export const DASHBOARD_BACKGROUNDS: DashboardBackground[] = [
  {
    key: 'none',
    label: 'Clean',
    description: 'No pattern',
    className: '',
  },
  {
    key: 'grid',
    label: 'Graph',
    description: 'Fine engineering grid',
    className: 'dash-bg-grid',
  },
  {
    key: 'dots',
    label: 'Dot matrix',
    description: 'Subtle dotted field',
    className: 'dash-bg-dots',
  },
  {
    key: 'blueprint',
    label: 'Blueprint',
    description: 'Brand-tinted plan grid',
    className: 'dash-bg-blueprint',
  },
  {
    key: 'glow',
    label: 'Aurora',
    description: 'Soft brand glow',
    className: 'dash-bg-glow',
  },
  {
    key: 'mesh',
    label: 'Circuit',
    description: 'Dotted grid with glow',
    className: 'dash-bg-mesh',
  },
]

const BY_KEY = new Map(DASHBOARD_BACKGROUNDS.map((b) => [b.key, b]))

/** Set of valid keys for server-side validation. */
export const DASHBOARD_BACKGROUND_KEYS = new Set(DASHBOARD_BACKGROUNDS.map((b) => b.key))

/**
 * Resolve a stored preference to a preset, falling back to "none" for
 * null/unknown values.
 */
export function resolveDashboardBackground(key: string | null | undefined): DashboardBackground {
  if (key && BY_KEY.has(key)) return BY_KEY.get(key)!
  return BY_KEY.get('none')!
}
