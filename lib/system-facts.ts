// A curated, keyless set of "did you know" facts about the fire & life-safety
// systems the company services. One is surfaced on the engineer home each day,
// selected deterministically by the day of the year so it changes daily but
// stays stable for everyone on the same date.

export const SYSTEM_FACTS: string[] = [
  'Fire dampers should be drop-tested at least annually, and every 12 months is the standard interval under BS 9999. Spring-operated dampers can weaken over time, so a clean test today prevents a stuck damper in a real fire.',
  'Emergency lighting must provide a minimum of 1 lux along the centre line of an escape route under BS 5266. A quick check of a dim fitting can be the difference between an orderly and a chaotic evacuation.',
  'A fire alarm system should be serviced at least twice a year under BS 5839-1. Splitting visits roughly six months apart keeps every device on a healthy inspection rhythm.',
  'Automatic Opening Vents (AOVs) clear smoke from stairwells and corridors, keeping escape routes usable. Their control panels and actuators need regular functional testing, not just a visual glance.',
  'Portable fire extinguishers require an annual "basic" service and an extended service every 5 years (10 for CO2). Checking the pressure gauge and pin takes seconds but is easy to skip.',
  'Sprinkler systems can control a fire before the brigade even arrives. Gauges, valves and alarm test connections should be checked routinely — a closed valve is a silent failure.',
  'Dry riser outlets must be tested annually and pressure-tested every 5 years. A corroded or missing outlet cap is a common, easily-fixed fault found on site.',
  'Fire doors are engineered to hold back fire and smoke, but only if the gaps, seals and closers are intact. A propped-open fire door defeats the entire compartmentation strategy.',
  'Smoke detectors lose sensitivity as dust builds up inside the chamber. Regular cleaning reduces false alarms, which are a leading cause of occupants ignoring real alerts.',
  'Emergency lighting needs a short monthly function test and a full-duration (usually 3-hour) test annually. The annual test proves the batteries actually last the rated time.',
  'Fire suppression in kitchens (wet chemical systems) tackles high-temperature oil fires that water would spread. Nozzles must be kept clear of grease to fire correctly.',
  'Aspirating smoke detection (ASD) draws air through pipework to sample for smoke, giving very early warning in data centres and warehouses. Airflow faults are the most common issue to look for.',
  'Fire alarm call points should be tested in rotation so that over a year every single one has been activated at least once. Rotating the test point each visit keeps the coverage honest.',
  'Magnetic door holders release fire doors automatically when the alarm sounds. Testing the release as part of the alarm test confirms the whole cause-and-effect chain works.',
  'Smoke control damper actuators have a finite number of operations in them. Logging each test helps predict end-of-life before a failure on the day it matters.',
  'A fire alarm log book is a legal expectation, not just good practice. Recording tests, faults and false alarms on site protects both the client and the engineer.',
  'CO2 extinguishers are weighed rather than pressure-gauged to confirm their charge, because they have no usable gauge. A drop in weight means gas has leaked away.',
  'Emergency voice communication (EVC) systems let a fire warden speak to refuge points and disabled occupants. Handsets and the master panel need routine call-round testing.',
  'Fire curtains descend to form barriers in open-plan spaces. Their guides and bottom bars must be free of obstruction so they seal fully when triggered.',
  'Battery-backed devices across fire systems degrade fastest in hot plant rooms. Noting ambient conditions during a service helps explain premature battery faults.',
]

export function getDailyFact(date = new Date()): string {
  const start = new Date(date.getFullYear(), 0, 0)
  const diff = date.getTime() - start.getTime()
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24))
  return SYSTEM_FACTS[dayOfYear % SYSTEM_FACTS.length]
}
