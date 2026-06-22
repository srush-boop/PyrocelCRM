import {
  Wind,
  FireExtinguisher,
  Lightbulb,
  BellRing,
  Droplets,
  ClipboardCheck,
  type LucideIcon,
} from 'lucide-react'

/**
 * Maps a service type to a modern, recognisable icon so each report
 * is easily identifiable at a glance. Matching is keyword based and
 * case-insensitive so it stays robust as service type names evolve.
 */
export function getServiceIcon(serviceTypeName?: string | null): LucideIcon {
  const name = (serviceTypeName || '').toLowerCase()

  if (name.includes('damper')) return Wind
  if (name.includes('extinguisher')) return FireExtinguisher
  if (name.includes('emergency') || name.includes('light')) return Lightbulb
  if (name.includes('alarm')) return BellRing
  if (name.includes('flush') || name.includes('outlet') || name.includes('water')) return Droplets

  return ClipboardCheck
}
