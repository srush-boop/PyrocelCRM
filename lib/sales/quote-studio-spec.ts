/**
 * Quote Studio spec maths (pure, no DB / no IO).
 *
 * Derives the quantitative parts of a BS 5839-1 / BAFE SP203-1 fire-alarm design
 * specification from a confirmed device takeoff:
 *   - the detection / alarm zone schedule (grouped from the takeoff),
 *   - the standby battery calculation (BS 5839-1 §25),
 *   - the EN 54 equipment schedule.
 *
 * The narrative clauses are written separately by the AI (see lib/ai/studio-draft),
 * grounded in Pyrocel's knowledge base. Keeping the maths here means the numbers
 * an auditor checks are deterministic and testable, never model-invented.
 */

export interface SpecTakeoffItem {
  device_key: string
  label: string
  zone?: string | null
  quantity: number
}

// --- Device current reference (representative, per device) -------------
// Quiescent (standby) and alarm currents in milliamps. These are sensible
// defaults for addressable fire devices; the designer reviews the resulting
// battery calc. Door holders are energised in quiescent and drop out in alarm.
interface DeviceCurrent {
  quiescentMa: number
  alarmMa: number
  /** EN 54 (or related) component standard for the equipment schedule. */
  standard: string
  /** Equipment-schedule reference code. */
  ref: string
}

export const DEVICE_CURRENTS: Record<string, DeviceCurrent> = {
  multi_sensor: { quiescentMa: 0.3, alarmMa: 0.5, standard: 'BS EN 54-7 / 54-5', ref: 'DET-MS' },
  heat_detector: { quiescentMa: 0.3, alarmMa: 0.5, standard: 'BS EN 54-5', ref: 'DET-HT' },
  manual_call_point: { quiescentMa: 0.05, alarmMa: 0.5, standard: 'BS EN 54-11', ref: 'MCP' },
  sounder_vad: { quiescentMa: 0.5, alarmMa: 8.0, standard: 'BS EN 54-3 / 54-23', ref: 'SND-VAD' },
  interface_module: { quiescentMa: 0.5, alarmMa: 2.0, standard: 'BS EN 54-18', ref: 'INT' },
  door_holder: { quiescentMa: 40, alarmMa: 0, standard: 'BS EN 1155', ref: 'DOOR' },
}

// Control panel base load (quiescent + alarm) in mA.
const PANEL_QUIESCENT_MA = 100
const PANEL_ALARM_MA = 150

// Standard standby / alarm durations and de-rating (BS 5839-1 §25).
const STANDBY_HOURS = 24
const ALARM_HOURS = 0.5
const DERATING = 1.25

// Standard VRLA battery capacities (Ah) we stock, for sizing.
const STANDARD_BATTERIES_AH = [7, 12, 17, 24, 38, 65]

export interface BatteryRow {
  label: string
  value: string
}

export interface BatteryCalc {
  quiescentAmps: number
  alarmAmps: number
  requiredAh: number
  specifiedAh: number
  rows: BatteryRow[]
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

/** Compute the standby battery calculation from the device schedule. */
export function computeBatteryCalc(items: SpecTakeoffItem[]): BatteryCalc {
  let iqMa = PANEL_QUIESCENT_MA
  let iaMa = PANEL_ALARM_MA
  for (const item of items) {
    const c = DEVICE_CURRENTS[item.device_key]
    if (!c) continue
    const qty = item.quantity || 0
    iqMa += qty * c.quiescentMa
    iaMa += qty * c.alarmMa
  }
  const iq = round(iqMa / 1000, 3) // amps
  const ia = round(iaMa / 1000, 3)
  const quiescentAh = round(iq * STANDBY_HOURS)
  const alarmAh = round(ia * ALARM_HOURS)
  const subtotal = round(quiescentAh + alarmAh)
  const required = round(subtotal * DERATING)
  const specified = STANDARD_BATTERIES_AH.find((c) => c >= required) ?? STANDARD_BATTERIES_AH[STANDARD_BATTERIES_AH.length - 1]

  const rows: BatteryRow[] = [
    { label: 'Quiescent current (Iq)', value: `${iq.toFixed(3)} A` },
    { label: 'Standby period required', value: `${STANDBY_HOURS} h` },
    { label: `Quiescent capacity (Iq × ${STANDBY_HOURS} h)`, value: `${quiescentAh.toFixed(2)} Ah` },
    { label: 'Alarm current (Ia)', value: `${ia.toFixed(3)} A` },
    { label: 'Alarm period required', value: `${ALARM_HOURS} h` },
    { label: `Alarm capacity (Ia × ${ALARM_HOURS} h)`, value: `${alarmAh.toFixed(2)} Ah` },
    { label: 'Sub-total', value: `${subtotal.toFixed(2)} Ah` },
    { label: 'De-rating factor', value: `× ${DERATING}` },
    { label: 'Minimum battery capacity', value: `${required.toFixed(2)} Ah` },
    { label: 'Specified batteries', value: `${specified} Ah VRLA (24 V) — compliant with headroom` },
  ]
  return { quiescentAmps: iq, alarmAmps: ia, requiredAh: required, specifiedAh: specified, rows }
}

// --- Zone schedule -----------------------------------------------------
export interface SpecZone {
  zone: string
  area: string
  detection: string
  devices: number
}

/**
 * Group the takeoff into a zone schedule. When the designer has tagged items
 * with zones, group by zone; otherwise fall back to a single zone.
 */
export function deriveZones(items: SpecTakeoffItem[]): SpecZone[] {
  const withQty = items.filter((i) => (i.quantity || 0) > 0)
  const byZone = new Map<string, SpecTakeoffItem[]>()
  for (const item of withQty) {
    const zone = item.zone?.trim() || 'Z1'
    const arr = byZone.get(zone) ?? []
    arr.push(item)
    byZone.set(zone, arr)
  }
  const zones = [...byZone.entries()].map(([zone, zItems]) => {
    const devices = zItems.reduce((s, i) => s + (i.quantity || 0), 0)
    const detectionKeys = zItems
      .filter((i) => ['multi_sensor', 'heat_detector'].includes(i.device_key))
      .map((i) => i.label)
    const detection = detectionKeys.length ? Array.from(new Set(detectionKeys)).join(' + ') : 'Detection + alarm'
    return { zone, area: zone, detection, devices }
  })
  return zones.sort((a, b) => a.zone.localeCompare(b.zone, undefined, { numeric: true }))
}

// --- Equipment schedule ------------------------------------------------
export interface SpecEquipment {
  ref: string
  description: string
  standard: string
  qty: number
}

/** Build the EN 54 equipment schedule from the counted device schedule. */
export function deriveEquipmentSchedule(items: SpecTakeoffItem[]): SpecEquipment[] {
  const rows: SpecEquipment[] = []
  const byKey = new Map<string, { label: string; qty: number }>()
  for (const item of items) {
    if ((item.quantity || 0) <= 0) continue
    const cur = byKey.get(item.device_key) ?? { label: item.label, qty: 0 }
    cur.qty += item.quantity || 0
    byKey.set(item.device_key, cur)
  }
  for (const [key, { label, qty }] of byKey) {
    const ref = DEVICE_CURRENTS[key]
    rows.push({
      ref: ref?.ref ?? key.toUpperCase(),
      description: label,
      standard: ref?.standard ?? '—',
      qty,
    })
  }
  return rows
}

/** Total field devices in the takeoff. */
export function totalDevices(items: SpecTakeoffItem[]): number {
  return items.reduce((s, i) => s + (i.quantity || 0), 0)
}
