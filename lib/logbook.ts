import type { LogbookEntryType } from '@/lib/types/database'

export interface LogbookEntryTypeMeta {
  value: LogbookEntryType
  label: string
  /** Relevant British Standard guidance reference shown to the user. */
  reference: string
  description: string
}

// BS 5839-1 (fire detection & alarm), BS 5266-1 (emergency lighting) routine
// occupier duties typically recorded in a fire safety log book.
export const LOGBOOK_ENTRY_TYPES: LogbookEntryTypeMeta[] = [
  {
    value: 'weekly_alarm_test',
    label: 'Weekly fire alarm test',
    reference: 'BS 5839-1',
    description: 'Operate a manual call point to test the fire alarm system (rotate call points weekly).',
  },
  {
    value: 'monthly_emergency_light_test',
    label: 'Emergency lighting test',
    reference: 'BS 5266-1',
    description: 'Monthly short-duration function test or annual full-duration test of emergency lighting.',
  },
  {
    value: 'fire_drill',
    label: 'Fire drill / evacuation',
    reference: 'RRO 2005',
    description: 'Record practice evacuations and findings.',
  },
  {
    value: 'false_alarm',
    label: 'False alarm / actuation',
    reference: 'BS 5839-1',
    description: 'Record any false alarm, its cause and action taken.',
  },
  {
    value: 'fault_defect',
    label: 'Fault / defect',
    reference: 'BS 5839-1',
    description: 'Record faults, defects and remedial action.',
  },
  {
    value: 'fire_door_check',
    label: 'Fire door / escape route check',
    reference: 'RRO 2005',
    description: 'Routine inspection of fire doors, signage and that escape routes are kept clear.',
  },
  {
    value: 'firefighting_equipment_check',
    label: 'Firefighting equipment check',
    reference: 'BS 5306',
    description: 'Monthly visual check of extinguishers, hose reels and other firefighting equipment.',
  },
  {
    value: 'staff_training',
    label: 'Staff training / instruction',
    reference: 'RRO 2005',
    description: 'Record fire safety training, inductions and instructions given to staff.',
  },
  {
    value: 'frs_visit',
    label: 'Fire & Rescue Service visit',
    reference: 'RRO 2005',
    description: 'Record visits, audits or correspondence from the Fire & Rescue Service.',
  },
  {
    value: 'note',
    label: 'General note',
    reference: '—',
    description: 'Any other event relevant to fire safety at the premises.',
  },
]

export function getLogbookEntryMeta(type: LogbookEntryType): LogbookEntryTypeMeta {
  return LOGBOOK_ENTRY_TYPES.find((t) => t.value === type) ?? LOGBOOK_ENTRY_TYPES[LOGBOOK_ENTRY_TYPES.length - 1]
}

export function logbookEntryLabel(type: LogbookEntryType): string {
  return getLogbookEntryMeta(type).label
}

// Top-level section a record belongs to. Mirrors system_types.logbook_category,
// set at master level. 'fire' is the default so untouched/legacy systems keep
// appearing in the fire safety section.
export type LogbookCategory = 'fire' | 'security' | 'other'

export const LOGBOOK_CATEGORY_LABELS: Record<LogbookCategory, string> = {
  fire: 'Fire safety',
  security: 'Security',
  other: 'Other',
}

// Order sections are rendered/printed in.
export const LOGBOOK_CATEGORY_ORDER: LogbookCategory[] = ['fire', 'security', 'other']

// Fire safety "systems" used to group/filter log book records so an occupier
// can quickly find everything relating to a particular asset type. 'security'
// and 'general' are catch-alls for the Security and Other sections.
export type LogbookSystemId =
  | 'fire_alarm'
  | 'emergency_lighting'
  | 'extinguishers'
  | 'dampers'
  | 'fire_doors'
  | 'fire_drill'
  | 'training'
  | 'security'
  | 'general'

export interface LogbookSystemMeta {
  id: LogbookSystemId
  label: string
}

export const LOGBOOK_SYSTEMS: LogbookSystemMeta[] = [
  { id: 'fire_alarm', label: 'Fire alarm' },
  { id: 'emergency_lighting', label: 'Emergency lighting' },
  { id: 'extinguishers', label: 'Fire extinguishers' },
  { id: 'dampers', label: 'Fire & smoke dampers' },
  { id: 'fire_doors', label: 'Fire doors & escape routes' },
  { id: 'fire_drill', label: 'Fire drills' },
  { id: 'training', label: 'Training' },
  { id: 'security', label: 'Security' },
  { id: 'general', label: 'General' },
]

/** Which section a given system id belongs to. */
export function categoryForSystem(id: LogbookSystemId): LogbookCategory {
  if (id === 'security') return 'security'
  if (id === 'general') return 'other'
  return 'fire'
}

export function getLogbookSystemMeta(id: LogbookSystemId): LogbookSystemMeta {
  return LOGBOOK_SYSTEMS.find((s) => s.id === id) ?? LOGBOOK_SYSTEMS[LOGBOOK_SYSTEMS.length - 1]
}

/** Map an occupier/staff entry type to its fire safety system. */
export function systemForEntryType(type: LogbookEntryType): LogbookSystemId {
  switch (type) {
    case 'weekly_alarm_test':
    case 'false_alarm':
      return 'fire_alarm'
    case 'monthly_emergency_light_test':
      return 'emergency_lighting'
    case 'fire_drill':
      return 'fire_drill'
    case 'fire_door_check':
      return 'fire_doors'
    case 'firefighting_equipment_check':
      return 'extinguishers'
    case 'staff_training':
      return 'training'
    default:
      return 'general'
  }
}

/** Infer the fire safety system from a (freeform) professional service name. */
export function systemForServiceName(name: string): LogbookSystemId {
  const n = name.toLowerCase()
  if (n.includes('extinguisher')) return 'extinguishers'
  if (n.includes('damper')) return 'dampers'
  if (n.includes('emergency') || n.includes('light')) return 'emergency_lighting'
  if (n.includes('alarm') || n.includes('detection') || n.includes('fire alarm')) return 'fire_alarm'
  if (n.includes('drill') || n.includes('evacuat')) return 'fire_drill'
  return 'general'
}

/**
 * Resolve the log book system for a professional service report using the
 * master-level system category first (authoritative) and only falling back to
 * name-guessing WITHIN the fire section. This is what stops e.g. "Annual
 * Intruder Alarm Maintenance" (a Security system) being mislabelled as a fire
 * alarm just because its name contains the word "alarm".
 */
export function systemForReport(input: {
  category?: LogbookCategory | null
  serviceName: string
}): LogbookSystemId {
  const category = input.category ?? 'fire'
  if (category === 'security') return 'security'
  if (category === 'other') return 'general'
  return systemForServiceName(input.serviceName)
}
