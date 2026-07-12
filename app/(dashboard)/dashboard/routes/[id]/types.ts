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
