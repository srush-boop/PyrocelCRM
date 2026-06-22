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
