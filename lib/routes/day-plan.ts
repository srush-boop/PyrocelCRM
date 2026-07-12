/**
 * Pure day-plan maths for the route map planner. NO server-only dependencies so
 * it can run on the client — this is what lets the timeline recompute ETAs
 * instantly when the user drags stops into a new order (using a driving matrix
 * fetched once from the server).
 *
 * Anchor rule (per requirements): the CDO is assumed to ARRIVE at the first site
 * at a fixed time (default 08:30). The required leave-home time is back-
 * calculated from the home→first-site drive. Lunch (the day's `break_minutes`)
 * is inserted as its own timeline row when the running clock first crosses a
 * lunch window. The day ends back at home.
 */

export interface DayPlanServiceInput {
  id: string
  label: string
  minutes: number
  learned: boolean
  sampleSize: number
}

export interface DayPlanStopInput {
  id: string
  name: string
  postcode: string | null
  /** Σ of this stop's on-route service estimates. */
  onSiteMinutes: number
  services: DayPlanServiceInput[]
}

export interface WorkingDay {
  /** 24h "HH:MM". */
  start: string
  end: string
  breakMinutes: number
}

export interface DayPlanOptions {
  /** Fixed arrival at the first site, "HH:MM". Default "08:30". */
  firstArrival?: string
  /** Lunch is taken once the clock crosses this time, "HH:MM". Default "12:00". */
  lunchFrom?: string
  workingDay?: WorkingDay | null
}

export type TimelineRowKind = 'leave-home' | 'travel' | 'site' | 'lunch' | 'return-home'

export interface TimelineRow {
  kind: TimelineRowKind
  /** Minutes from midnight. */
  startMin: number
  endMin: number
  // site rows only:
  stopId?: string
  stopName?: string
  postcode?: string | null
  onSiteMinutes?: number
  services?: DayPlanServiceInput[]
  // travel rows only:
  miles?: number
  driveMinutes?: number
  approximate?: boolean
}

export interface DayPlan {
  rows: TimelineRow[]
  leaveHomeMin: number
  dayEndMin: number
  totalDriveMinutes: number
  totalOnSiteMinutes: number
  totalMiles: number
  lunchMinutes: number
  /** Contracted finish (from working hours) in minutes, or null. */
  contractedEndMin: number | null
  /** dayEnd − contractedEnd, minutes. Positive = overrun. Null if no hours. */
  endDeltaMin: number | null
}

/** "HH:MM" → minutes from midnight. Returns null for blank/invalid. */
export function parseClock(value: string | null | undefined): number | null {
  if (!value) return null
  const m = value.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null
  return h * 60 + min
}

/** Minutes from midnight → "HH:MM" (24h). Clamped to >= 0. */
export function formatClock(mins: number): string {
  const t = Math.max(0, Math.round(mins))
  const h = Math.floor(t / 60) % 24
  const m = t % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Driving legs for the CURRENT order, in minutes and miles:
 *  - `toFirst`      home → first stop
 *  - `between[i]`   stop i → stop i+1  (length = stops − 1)
 *  - `toHome`       last stop → home
 */
export interface RouteLegs {
  toFirstMinutes: number
  toFirstMiles: number
  betweenMinutes: number[]
  betweenMiles: number[]
  toHomeMinutes: number
  toHomeMiles: number
  approximate: boolean
}

const DEFAULT_FIRST_ARRIVAL = 8 * 60 + 30 // 08:30
const DEFAULT_LUNCH_FROM = 12 * 60 // 12:00

/**
 * Build the timeline + totals for an ordered list of located stops.
 * `stops` must already be in visit order and all have a location (the caller
 * excludes unlocated stops from the routed sequence).
 */
export function buildDayPlan(
  stops: DayPlanStopInput[],
  legs: RouteLegs,
  opts: DayPlanOptions = {},
): DayPlan {
  const firstArrival = parseClock(opts.firstArrival ?? '') ?? DEFAULT_FIRST_ARRIVAL
  const lunchFrom = parseClock(opts.lunchFrom ?? '') ?? DEFAULT_LUNCH_FROM
  const breakMinutes = opts.workingDay?.breakMinutes ?? 0
  const contractedEndMin = parseClock(opts.workingDay?.end)

  const rows: TimelineRow[] = []
  let totalDrive = 0
  let totalMiles = 0
  let totalOnSite = 0
  let lunchTaken = breakMinutes <= 0
  let lunchMinutes = 0

  const leaveHomeMin = firstArrival - legs.toFirstMinutes

  // Leave home + drive to first site.
  rows.push({ kind: 'leave-home', startMin: leaveHomeMin, endMin: leaveHomeMin })
  rows.push({
    kind: 'travel',
    startMin: leaveHomeMin,
    endMin: firstArrival,
    miles: legs.toFirstMiles,
    driveMinutes: legs.toFirstMinutes,
    approximate: legs.approximate,
  })
  totalDrive += legs.toFirstMinutes
  totalMiles += legs.toFirstMiles

  let clock = firstArrival

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i]
    const arrive = clock
    const depart = arrive + stop.onSiteMinutes
    totalOnSite += stop.onSiteMinutes
    rows.push({
      kind: 'site',
      startMin: arrive,
      endMin: depart,
      stopId: stop.id,
      stopName: stop.name,
      postcode: stop.postcode,
      onSiteMinutes: stop.onSiteMinutes,
      services: stop.services,
    })
    clock = depart

    // Take lunch after finishing the site during/after which noon passes.
    if (!lunchTaken && depart >= lunchFrom) {
      rows.push({ kind: 'lunch', startMin: clock, endMin: clock + breakMinutes })
      clock += breakMinutes
      lunchMinutes = breakMinutes
      lunchTaken = true
    }

    // Drive to the next stop.
    if (i < stops.length - 1) {
      const driveMin = legs.betweenMinutes[i] ?? 0
      const driveMi = legs.betweenMiles[i] ?? 0
      rows.push({
        kind: 'travel',
        startMin: clock,
        endMin: clock + driveMin,
        miles: driveMi,
        driveMinutes: driveMin,
        approximate: legs.approximate,
      })
      clock += driveMin
      totalDrive += driveMin
      totalMiles += driveMi
    }
  }

  // If lunch never triggered (short day / early finish), take it before heading home.
  if (!lunchTaken && breakMinutes > 0) {
    rows.push({ kind: 'lunch', startMin: clock, endMin: clock + breakMinutes })
    clock += breakMinutes
    lunchMinutes = breakMinutes
    lunchTaken = true
  }

  // Drive home.
  rows.push({
    kind: 'return-home',
    startMin: clock,
    endMin: clock + legs.toHomeMinutes,
    miles: legs.toHomeMiles,
    driveMinutes: legs.toHomeMinutes,
    approximate: legs.approximate,
  })
  clock += legs.toHomeMinutes
  totalDrive += legs.toHomeMinutes
  totalMiles += legs.toHomeMiles

  const dayEndMin = clock

  return {
    rows,
    leaveHomeMin,
    dayEndMin,
    totalDriveMinutes: totalDrive,
    totalOnSiteMinutes: totalOnSite,
    totalMiles: Math.round(totalMiles * 10) / 10,
    lunchMinutes,
    contractedEndMin,
    endDeltaMin: contractedEndMin != null ? dayEndMin - contractedEndMin : null,
  }
}

/**
 * Derive the current-order `RouteLegs` from a driving matrix. Point index 0 is
 * always HOME; stop `orderedStopIndices[k]` maps into the matrix at
 * `stopIndex + 1`. Recomputed client-side on every reorder — no network.
 */
export function legsFromMatrix(
  durations: number[][],
  distances: number[][],
  orderedStopIndices: number[],
  approximate: boolean,
): RouteLegs {
  const HOME = 0
  const mi = (a: number, b: number) => distances[a]?.[b] ?? 0
  const mn = (a: number, b: number) => durations[a]?.[b] ?? 0

  if (orderedStopIndices.length === 0) {
    return {
      toFirstMinutes: 0,
      toFirstMiles: 0,
      betweenMinutes: [],
      betweenMiles: [],
      toHomeMinutes: 0,
      toHomeMiles: 0,
      approximate,
    }
  }

  const first = orderedStopIndices[0] + 1
  const last = orderedStopIndices[orderedStopIndices.length - 1] + 1

  const betweenMinutes: number[] = []
  const betweenMiles: number[] = []
  for (let k = 0; k < orderedStopIndices.length - 1; k++) {
    const from = orderedStopIndices[k] + 1
    const to = orderedStopIndices[k + 1] + 1
    betweenMinutes.push(mn(from, to))
    betweenMiles.push(mi(from, to))
  }

  return {
    toFirstMinutes: mn(HOME, first),
    toFirstMiles: mi(HOME, first),
    betweenMinutes,
    betweenMiles,
    toHomeMinutes: mn(last, HOME),
    toHomeMiles: mi(last, HOME),
    approximate,
  }
}
