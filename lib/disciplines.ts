import type { Discipline } from '@/lib/types/database'
import { Flame, Shield, Wrench, ClipboardCheck, HardHat, type LucideIcon } from 'lucide-react'

/**
 * Single source of truth for engineer disciplines (trades). Drives map marker
 * colour-coding + icons, admin badges and the skill match used when dispatching
 * a call to the best-placed engineer. Client-safe (no server imports).
 *
 * Colours are explicit hex values because they are painted onto Leaflet
 * markers/SVG on a canvas, which can't resolve CSS design tokens.
 */
export interface DisciplineMeta {
  key: Discipline
  label: string
  /** Marker / accent colour (hex, for canvas + inline styles). */
  color: string
  /** Foreground colour to use on top of `color`. */
  onColor: string
  /** Tailwind classes for a subtle badge in normal DOM. */
  badgeClass: string
  icon: LucideIcon
}

export const DISCIPLINES: DisciplineMeta[] = [
  {
    key: 'fire',
    label: 'Fire',
    color: '#dc2626',
    onColor: '#ffffff',
    badgeClass: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
    icon: Flame,
  },
  {
    key: 'security',
    label: 'Security',
    color: '#2563eb',
    onColor: '#ffffff',
    badgeClass: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
    icon: Shield,
  },
  {
    key: 'installer',
    label: 'Installer',
    color: '#d97706',
    onColor: '#ffffff',
    badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    icon: Wrench,
  },
  {
    key: 'cdo',
    label: 'CDO',
    color: '#0d9488',
    onColor: '#ffffff',
    badgeClass: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30',
    icon: ClipboardCheck,
  },
  {
    key: 'general',
    label: 'General',
    color: '#64748b',
    onColor: '#ffffff',
    badgeClass: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
    icon: HardHat,
  },
]

const BY_KEY = new Map<Discipline, DisciplineMeta>(DISCIPLINES.map((d) => [d.key, d]))

/** Resolve discipline metadata, always returning a value (falls back to general). */
export function disciplineMeta(key: Discipline | null | undefined): DisciplineMeta {
  return (key && BY_KEY.get(key)) || BY_KEY.get('general')!
}

/**
 * Infer the discipline a call needs from its system type name, so we can surface
 * the right-skilled engineers first when dispatching. Best-effort keyword match.
 */
export function disciplineForSystemType(name: string | null | undefined): Discipline | null {
  if (!name) return null
  const n = name.toLowerCase()
  if (/(fire|sprinkler|emergency light|dry riser|extinguisher|smoke|aov)/.test(n)) return 'fire'
  if (/(cctv|access|intruder|alarm|security|door entry|barrier|anpr)/.test(n)) return 'security'
  return null
}

/**
 * Map a department name to a discipline (used for seeding / display fallbacks).
 */
export function disciplineForDepartment(name: string | null | undefined): Discipline | null {
  if (!name) return null
  const n = name.toLowerCase()
  if (n.includes('fire')) return 'fire'
  if (n.includes('security') || n.includes('intruder') || n.includes('cctv')) return 'security'
  if (n.includes('cdo')) return 'cdo'
  if (n.includes('install')) return 'installer'
  return null
}
