import type { WorkDayHours } from '@/lib/types/database'

/** A service on the route, with its learned on-site estimate. */
export interface RouteStopService {
  id: string
  label: string
  minutes: number
  learned: boolean
  sampleSize: number
  frequencyUnit: string | null
  frequencyValue: number | null
}

/** A site on the route (may group several on-route services). */
export interface RouteMapStop {
  siteId: string
  name: string
  postcode: string | null
  latitude: number | null
  longitude: number | null
  routePosition: number | null
  /** Σ of this site's on-route service estimates. */
  onSiteMinutes: number
  services: RouteStopService[]
  hasLocation: boolean
}

/** A selectable CDO with the data needed to anchor the day plan. */
export interface RouteEngineerOption {
  id: string
  name: string
  homePostcode: string | null
  homeLatitude: number | null
  homeLongitude: number | null
  workDayHours: WorkDayHours | null
}

export interface RouteDrivingMatrix {
  /** N×N minutes; index 0 = home, 1..n = located stops (see locatedStopIds). */
  durations: number[][]
  distances: number[][]
  approximate: boolean
}

export interface RouteMapData {
  routeId: string
  routeName: string
  routeColor: string | null
  assignedEngineerId: string | null
  /** Currently selected CDO (with home + working hours), or null. */
  engineer: RouteEngineerOption | null
  /** Stops in saved route_position order. */
  stops: RouteMapStop[]
  /** Located stop site-ids in the same order as matrix rows 1..n. */
  locatedStopIds: string[]
  /** Driving matrix over [home, ...locatedStops], or null if no home/coords. */
  matrix: RouteDrivingMatrix | null
  /** Engineer roster for the CDO picker. */
  engineers: RouteEngineerOption[]
}

/* ------------------------------------------------------------------ */
/* Phase 3 — completion analytics (actual vs planned)                 */
/* ------------------------------------------------------------------ */

/** A selectable past week that has completed visits on this route. */
export interface RouteWeekOption {
  /** ISO date (yyyy-mm-dd) of the Monday that starts the week. */
  weekStart: string
  /** Human label, e.g. "23 Jun – 29 Jun 2026". */
  label: string
  taskCount: number
  /** Distinct working days in the week with visits. */
  dayCount: number
}

/** One actual site visit, derived from a completed task's timestamps. */
export interface RouteActualVisit {
  siteId: string
  siteName: string
  postcode: string | null
  latitude: number | null
  longitude: number | null
  /** Planned visit position from sites.route_position (1-based), or null. */
  plannedPosition: number | null
  /** Actual visit position by check-in order (1-based). */
  actualPosition: number
  /** started_at ISO. */
  arrival: string
  /** completed_at ISO. */
  departure: string
  /** completed_at − started_at, minutes. */
  onSiteMinutes: number
  /** Learned/expected on-site minutes for comparison. */
  plannedMinutes: number
  /** next.started_at − this.completed_at (drive + idle), minutes; null on last. */
  gapToNextMinutes: number | null
  engineerName: string | null
}

export interface RouteActualsSummary {
  visitCount: number
  /** Sum of on-site minutes. */
  onSiteMinutes: number
  /** Sum of inter-site gaps (drive + idle). */
  gapMinutes: number
  /** First arrival → last departure span, minutes. */
  dayLengthMinutes: number
  /** First arrival ISO / last departure ISO (single-week only). */
  firstArrival: string | null
  lastDeparture: string | null
  /** Σ planned on-site minutes for the visited sites. */
  plannedOnSiteMinutes: number
  /** How many visits were out of planned order. */
  outOfOrderCount: number
}

export interface RouteActualsData {
  routeId: string
  /** Weeks available to inspect (most recent first). */
  weeks: RouteWeekOption[]
  /** 'week' = a single weekStart; 'average' = mean across `averagedWeeks`. */
  mode: 'week' | 'average'
  /** Selected week (mode='week') or null. */
  selectedWeek: string | null
  /** Number of weeks folded into an average (mode='average'). */
  averagedWeeks: number
  /** Ordered actual visits (single-week) or per-site averages (average mode). */
  visits: RouteActualVisit[]
  summary: RouteActualsSummary
  /** Home coords for the map anchor, if the CDO home is known. */
  home: { latitude: number; longitude: number } | null
  /** Actual driven-order polyline (home → visits → home); may be approximate. */
  polyline: [number, number][]
  polylineApproximate: boolean
}
