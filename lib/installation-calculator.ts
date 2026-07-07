/**
 * Installation pricing engine — a faithful port of the customer's Excel
 * "Projects Installation Workbook v2.8" (sheets: 1.INSTALL FIRE, 2.INSTALL FIRE).
 *
 * The workbook estimates a fire-alarm installation from device counts and
 * cable / containment quantities, and prices them three ways ("schedule of
 * rates"):
 *   - Erect Only      — labour only.
 *   - Supply Only      — materials only (nett + material mark-up %).
 *   - Supply & Erect  — labour + materials.
 *
 * Verified constants / worked values from the source file:
 *   - Labour sell rate £43/hr (Sheet 2 C-rate); labour cost £36.07/hr is shown
 *     for margin only. FIRE PANELS: 1 × 4h × £43 = £172.
 *   - SOFTSKIN 2C 1.5mm, 1500 m @ 0.08 h/m: labour 120h × £43 = £5,160;
 *     material 1500 × £1.17 = £1,755; supply & erect = £6,915.
 *
 * All functions are pure so results are deterministic and can be unit-checked
 * against the spreadsheet.
 */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Round a metre quantity up to the nearest 100 m, as the workbook does. */
export function roundUpTo100(metres: number): number {
  const m = Number(metres) || 0
  if (m <= 0) return 0
  return Math.ceil(m / 100) * 100
}

// ---------------------------------------------------------------------------
// Rate configuration (seeded from the workbook; overridable via Settings)
// ---------------------------------------------------------------------------

/** A fitted device priced on labour only (the equipment supply is spec'd
 *  separately). Sheet 1 "DEVICES" block. */
export interface InstallDevice {
  key: string
  label: string
  /** Install hours per unit. Sheet 1 col D. */
  installHours: number
}

export type CableGroup = 'loop' | 'network' | 'other'

/** A cable type with install-hours per metre by fixing method and a nett £/m.
 *  Sheet 1 "CABLE" block. */
export interface InstallCable {
  key: string
  label: string
  group: CableGroup
  /** Install hours per metre fixed to fabric. Sheet 1 col D (fabric row). */
  fabricHours: number
  /** Install hours per metre on tray/basket. */
  trayHours: number
  /** Install hours per metre in duct (optional). */
  ductHours?: number
  /** Nett material cost per metre. Sheet 1 col G. */
  nettPerM: number
  /** Auto-calc metres = deviceCount × metresPerDevice, rounded up to 100 m. */
  metresPerDevice?: number
}

/** A containment / fixing / sundry item priced per unit (labour + material).
 *  Sheet 1 "CONTAINMENT" and "FIXINGS & SUNDRIES" blocks. */
export interface InstallMaterial {
  key: string
  label: string
  /** Install hours per unit. */
  installHours: number
  /** Nett material cost per unit. */
  nettPer: number
  /** Unit label shown on the quote (m, each, box, …). */
  unit: string
}

/** Overtime day-rate reference table (Sheet 1 header). Reference only — not
 *  used in the estimate maths, but editable and displayed. */
export interface OvertimeRate {
  label: string
  normal: number
  satAm: number
  satPm: number
  sun: number
}

export interface InstallationRates {
  /** Labour sell rate £/hr. Sheet 2 C-rate. */
  labourSell: number
  /** Labour cost £/hr (margin display only). */
  labourCost: number
  /** Material mark-up applied to nett supply prices (0 = sell at nett).
   *  Sheet 2 "SUPPLY ONLY %". */
  materialMarkup: number
  /** Default metres of loop cable per device for auto-calc. Sheet 1 "m/point". */
  defaultMetresPerDevice: number
  /** Default proportion of cable run on tray (0–1). Sheet 1 "% On Tray". */
  defaultTrayFraction: number

  devices: InstallDevice[]
  cables: InstallCable[]
  containment: InstallMaterial[]
  sundries: InstallMaterial[]
  overtime: OvertimeRate[]
}

// --- Seed catalogs (from the workbook) -------------------------------------

export const DEFAULT_INSTALL_DEVICES: InstallDevice[] = [
  { key: 'firePanel', label: 'Fire panel', installHours: 4 },
  { key: 'loop', label: 'Loop', installHours: 0.25 },
  { key: 'repeater', label: 'Repeater panel', installHours: 1 },
  { key: 'flushingKit', label: 'Flushing kit', installHours: 0.5 },
  { key: 'manualCallPoint', label: 'Manual callpoint', installHours: 0.5 },
  { key: 'sensor', label: 'Sensor', installHours: 0.25 },
  { key: 'sounder', label: 'Sounder', installHours: 0.5 },
  { key: 'interface', label: 'Interface', installHours: 0.75 },
  { key: 'doorHolder', label: 'Door holder', installHours: 0.5 },
  { key: 'mainsInterface', label: 'Mains interface', installHours: 1 },
  { key: 'psu', label: 'PSU', installHours: 0.5 },
  { key: 'aspirationPanel', label: 'Aspiration panel', installHours: 4 },
  { key: 'led', label: 'L.E.D. (½ point)', installHours: 0.25 },
  { key: 'redcare', label: 'Redcare', installHours: 2 },
  { key: 'psuMainsIf', label: 'PSU / Mains I/F', installHours: 1 },
]

export const DEFAULT_INSTALL_CABLES: InstallCable[] = [
  // Loop cables
  {
    key: 'enhanced2c',
    label: 'AEI Firetec Enhanced 2C 1.5mm (loop)',
    group: 'loop',
    fabricHours: 0.08,
    trayHours: 0.04,
    ductHours: 0.08,
    nettPerM: 1.18,
    metresPerDevice: 10,
  },
  {
    key: 'fp400_3c_loop',
    label: 'FP400 3 core (loop)',
    group: 'loop',
    fabricHours: 0.1,
    trayHours: 0.08,
    ductHours: 0.06,
    nettPerM: 2.25,
  },
  {
    key: 'fp500_3c_loop',
    label: 'FP500 3 core (loop)',
    group: 'loop',
    fabricHours: 0.1,
    trayHours: 0.08,
    ductHours: 0.06,
    nettPerM: 4.7,
  },
  // Network cables
  {
    key: 'enhanced4c',
    label: 'AEI Firetec Enhanced 4C 1.5mm (network)',
    group: 'network',
    fabricHours: 0.08,
    trayHours: 0.06,
    nettPerM: 2.95,
    metresPerDevice: 0,
  },
  {
    key: 'fp400_3c_net',
    label: 'FP400 3C 1.5mm (network)',
    group: 'network',
    fabricHours: 0.1,
    trayHours: 0.08,
    ductHours: 0.06,
    nettPerM: 2.45,
  },
  {
    key: 'fp600_3c_net',
    label: 'FP600 3C 1.5mm (network)',
    group: 'network',
    fabricHours: 0.1,
    trayHours: 0.08,
    ductHours: 0.06,
    nettPerM: 2.99,
  },
  // Other cables
  {
    key: 'micc2c',
    label: 'MICC 2C 1.5mm',
    group: 'other',
    fabricHours: 0.1,
    trayHours: 0.8,
    nettPerM: 3.25,
  },
  {
    key: 'micc4c',
    label: 'MICC 4C 1.5mm',
    group: 'other',
    fabricHours: 0.1,
    trayHours: 0.08,
    nettPerM: 5.95,
  },
  {
    key: 'te25',
    label: '2C 2.5mm T&E per metre',
    group: 'other',
    fabricHours: 0.08,
    trayHours: 0.08,
    nettPerM: 0.49,
  },
  {
    key: 'te15',
    label: '2C 1.5mm T&E per metre',
    group: 'other',
    fabricHours: 0.08,
    trayHours: 0.08,
    nettPerM: 0.61,
  },
]

export const DEFAULT_INSTALL_CONTAINMENT: InstallMaterial[] = [
  { key: 'yt2', label: 'YT2 25×16mm trunking per metre', installHours: 0.06, nettPer: 1.03, unit: 'm' },
  { key: 'yt2clip', label: 'D-Line metal F-clip for YT2', installHours: 0.01, nettPer: 0.5, unit: 'each' },
  { key: 'yt3', label: 'YT3 38×16mm trunking per metre', installHours: 0.12, nettPer: 1.8, unit: 'm' },
  { key: 'yt4', label: 'YT4 40×25mm trunking per metre', installHours: 0.12, nettPer: 8.35, unit: 'm' },
  { key: 'trunk100', label: '100×100mm trunking per metre', installHours: 0.12, nettPer: 10.37, unit: 'm' },
  { key: 'bends', label: 'Trunking bends', installHours: 0.1, nettPer: 1.41, unit: 'each' },
  { key: 'pvcConduit25', label: '25mm PVC conduit (3m)', installHours: 0.1, nettPer: 3.7, unit: 'length' },
  { key: 'pvcDrawBox', label: '25mm PVC conduit draw-in box', installHours: 0.1, nettPer: 0.68, unit: 'each' },
  { key: 'pvcCoupler', label: '25mm PVC coupler', installHours: 0.02, nettPer: 0.58, unit: 'each' },
  { key: 'galvConduit25', label: '25mm galv conduit (3.75m)', installHours: 0.3, nettPer: 7.95, unit: 'length' },
  { key: 'galvSaddle', label: '25mm galv conduit saddle', installHours: 0.1, nettPer: 0.3, unit: 'each' },
  { key: 'besaBox', label: '25mm CONLOCK BESA box', installHours: 0.12, nettPer: 2.8, unit: 'each' },
  { key: 'unistrut41x41', label: 'Slotted Unistrut 41×41mm per metre (3m)', installHours: 0.25, nettPer: 4.33, unit: 'm' },
  { key: 'unistrut41x21', label: 'Slotted Unistrut 41×21mm per metre', installHours: 0.25, nettPer: 3.84, unit: 'm' },
  { key: 'threadedRod8', label: '8mm threaded rod per metre', installHours: 0.1, nettPer: 0.55, unit: 'm' },
  { key: 'trayLight', label: '3" galv light-duty tray & fittings per metre', installHours: 0.2, nettPer: 5.78, unit: 'm' },
  { key: 'trayHeavy', label: '3" galv heavy-duty tray & fittings per metre', installHours: 0.2, nettPer: 17, unit: 'm' },
]

export const DEFAULT_INSTALL_SUNDRIES: InstallMaterial[] = [
  { key: 'redGland', label: 'Red compression glands', installHours: 0.01, nettPer: 0.18, unit: 'each' },
  { key: 'galvBox', label: 'Galvanised boxes', installHours: 0.08, nettPer: 1.25, unit: 'each' },
  { key: 'tieWrap', label: 'Tie wraps', installHours: 0.01, nettPer: 0.15, unit: 'each' },
  { key: 'gripple1m', label: 'Gripple kit 1m (Zipclip)', installHours: 0.15, nettPer: 2.36, unit: 'each' },
  { key: 'gripple2m', label: 'Gripple kit 2m (Zipclip)', installHours: 0.15, nettPer: 2.51, unit: 'each' },
  { key: 'linian', label: 'Linian clips 9-12mm', installHours: 0.01, nettPer: 0.22, unit: 'each' },
  { key: 'armouredGland', label: 'Armoured glands (2 pkt)', installHours: 0.25, nettPer: 3.95, unit: 'pkt' },
  { key: 'cableCleat', label: 'Cable cleats & fixings', installHours: 0.07, nettPer: 0.15, unit: 'each' },
  { key: 'metalTieWrap', label: 'Metal tie wraps', installHours: 0.02, nettPer: 0.06, unit: 'each' },
]

export const DEFAULT_INSTALL_OVERTIME: OvertimeRate[] = [
  { label: 'Install', normal: 52, satAm: 78, satPm: 78, sun: 104 },
  { label: 'Commissioning', normal: 62, satAm: 93, satPm: 93, sun: 124 },
  { label: 'Networked commissioning', normal: 72, satAm: 108, satPm: 108, sun: 144 },
]

export const DEFAULT_INSTALLATION_RATES: InstallationRates = {
  labourSell: 43,
  labourCost: 36.07,
  materialMarkup: 0,
  defaultMetresPerDevice: 10,
  defaultTrayFraction: 0.5,
  devices: DEFAULT_INSTALL_DEVICES,
  cables: DEFAULT_INSTALL_CABLES,
  containment: DEFAULT_INSTALL_CONTAINMENT,
  sundries: DEFAULT_INSTALL_SUNDRIES,
  overtime: DEFAULT_INSTALL_OVERTIME,
}

/**
 * Merge a partial rates object saved in company settings over the built-in
 * defaults. Absent keys fall back to DEFAULT_INSTALLATION_RATES; array catalogs
 * are only replaced when a non-empty array is provided.
 */
export function resolveInstallationRates(
  saved: Partial<InstallationRates> | null | undefined,
): InstallationRates {
  if (!saved || typeof saved !== 'object') return DEFAULT_INSTALLATION_RATES
  const pickArray = <T>(value: unknown, fallback: T[]): T[] =>
    Array.isArray(value) && value.length > 0 ? (value as T[]) : fallback
  return {
    ...DEFAULT_INSTALLATION_RATES,
    ...saved,
    devices: pickArray(saved.devices, DEFAULT_INSTALLATION_RATES.devices),
    cables: pickArray(saved.cables, DEFAULT_INSTALLATION_RATES.cables),
    containment: pickArray(saved.containment, DEFAULT_INSTALLATION_RATES.containment),
    sundries: pickArray(saved.sundries, DEFAULT_INSTALLATION_RATES.sundries),
    overtime: pickArray(saved.overtime, DEFAULT_INSTALLATION_RATES.overtime),
  }
}

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

export type PricingMode = 'erect' | 'supply' | 'combined'

export type InstallLineCategory = 'device' | 'cable' | 'containment' | 'sundry'

/** One priced line of the estimate, carrying all three pricing modes so the UI
 *  can switch without recalculating. */
export interface InstallationLine {
  key: string
  category: InstallLineCategory
  description: string
  /** Quantity + unit for display (e.g. 6 each, 300 m). */
  quantity: number
  unit: string
  /** Labour-only total for this line. */
  erect: number
  /** Materials-only total (nett × (1 + markup)). */
  supply: number
  /** Labour + materials. */
  combined: number
}

export interface CableEntry {
  cableKey: string
  /** Manual metre override; when null/absent, auto-calc from device count. */
  metres?: number | null
  /** Device count used for auto-calc (metres = count × metresPerDevice). */
  deviceCount?: number | null
  /** Proportion of the run on tray (0–1); defaults to rates.defaultTrayFraction. */
  trayFraction?: number | null
  /** Metres per device override for auto-calc. */
  metresPerDevice?: number | null
}

export interface InstallationInput {
  /** Device key -> quantity. */
  devices: Record<string, number>
  /** Cable runs to price. */
  cables: CableEntry[]
  /** Containment item key -> quantity. */
  containment: Record<string, number>
  /** Sundry item key -> quantity. */
  sundries: Record<string, number>
}

export interface InstallationResult {
  lines: InstallationLine[]
  totalErect: number
  totalSupply: number
  totalCombined: number
  /** Total labour hours across all lines (for reference). */
  totalHours: number
}

/** Resolve the metre quantity for a cable entry (manual override wins, else
 *  auto-calc: deviceCount × metresPerDevice rounded up to nearest 100 m). */
export function resolveCableMetres(
  entry: CableEntry,
  cable: InstallCable,
  rates: InstallationRates,
): number {
  if (entry.metres != null && Number(entry.metres) > 0) {
    return Math.max(0, Number(entry.metres))
  }
  const count = Number(entry.deviceCount) || 0
  if (count <= 0) return 0
  const perDevice =
    entry.metresPerDevice != null && Number(entry.metresPerDevice) > 0
      ? Number(entry.metresPerDevice)
      : cable.metresPerDevice ?? rates.defaultMetresPerDevice
  return roundUpTo100(count * perDevice)
}

export function calcInstallation(
  input: InstallationInput,
  rates: InstallationRates = DEFAULT_INSTALLATION_RATES,
): InstallationResult {
  const lines: InstallationLine[] = []
  const sell = rates.labourSell
  const markup = 1 + (Number(rates.materialMarkup) || 0)
  let totalHours = 0

  const pushLine = (
    key: string,
    category: InstallLineCategory,
    description: string,
    quantity: number,
    unit: string,
    hours: number,
    material: number,
  ) => {
    if (quantity <= 0) return
    const erect = round2(hours * sell)
    const supply = round2(material * markup)
    totalHours += hours
    lines.push({
      key,
      category,
      description,
      quantity,
      unit,
      erect,
      supply,
      combined: round2(erect + supply),
    })
  }

  // Devices — labour only (equipment supply is spec'd separately).
  for (const device of rates.devices) {
    const qty = Number(input.devices?.[device.key]) || 0
    if (qty <= 0) continue
    pushLine(
      `device:${device.key}`,
      'device',
      device.label,
      qty,
      'each',
      qty * device.installHours,
      0,
    )
  }

  // Cables — labour split by fabric/tray fraction + material by nett £/m.
  input.cables?.forEach((entry, i) => {
    const cable = rates.cables.find((c) => c.key === entry.cableKey)
    if (!cable) return
    const metres = resolveCableMetres(entry, cable, rates)
    if (metres <= 0) return
    const trayFraction =
      entry.trayFraction != null
        ? Math.min(Math.max(Number(entry.trayFraction), 0), 1)
        : rates.defaultTrayFraction
    const trayMetres = round2(metres * trayFraction)
    const fabricMetres = round2(metres - trayMetres)
    const hours = fabricMetres * cable.fabricHours + trayMetres * cable.trayHours
    const material = metres * cable.nettPerM
    pushLine(`cable:${entry.cableKey}:${i}`, 'cable', cable.label, metres, 'm', hours, material)
  })

  // Containment.
  for (const item of rates.containment) {
    const qty = Number(input.containment?.[item.key]) || 0
    if (qty <= 0) continue
    pushLine(
      `containment:${item.key}`,
      'containment',
      item.label,
      qty,
      item.unit,
      qty * item.installHours,
      qty * item.nettPer,
    )
  }

  // Fixings & sundries.
  for (const item of rates.sundries) {
    const qty = Number(input.sundries?.[item.key]) || 0
    if (qty <= 0) continue
    pushLine(
      `sundry:${item.key}`,
      'sundry',
      item.label,
      qty,
      item.unit,
      qty * item.installHours,
      qty * item.nettPer,
    )
  }

  const totalErect = round2(lines.reduce((a, l) => a + l.erect, 0))
  const totalSupply = round2(lines.reduce((a, l) => a + l.supply, 0))
  const totalCombined = round2(lines.reduce((a, l) => a + l.combined, 0))
  return { lines, totalErect, totalSupply, totalCombined, totalHours: round2(totalHours) }
}

/** The total for a given pricing mode. */
export function totalForMode(result: InstallationResult, mode: PricingMode): number {
  if (mode === 'erect') return result.totalErect
  if (mode === 'supply') return result.totalSupply
  return result.totalCombined
}

/** The per-line value for a given pricing mode. */
export function lineValueForMode(line: InstallationLine, mode: PricingMode): number {
  if (mode === 'erect') return line.erect
  if (mode === 'supply') return line.supply
  return line.combined
}

export const PRICING_MODE_LABELS: Record<PricingMode, string> = {
  erect: 'Erect Only',
  supply: 'Supply Only',
  combined: 'Supply & Erect',
}
