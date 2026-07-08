// Shared shapes for the calls map. Kept in a plain (non-'use server') module so
// both the server actions and client components can import them safely — a
// 'use server' file may only export async functions.
import type { ExpectedDuration } from '@/lib/task-duration'
import type { Discipline } from '@/lib/types/database'

export interface MapCall {
  taskId: string
  status: string
  scheduledDate: string | null
  bookedStartTime: string | null
  assignedEngineerId: string | null
  assignedEngineerName: string | null
  serviceTypeId: string | null
  serviceTypeName: string | null
  systemTypeName: string | null
  visitTypeName: string | null
  siteId: string
  siteName: string
  postcode: string | null
  clientName: string | null
  latitude: number
  longitude: number
  // 'overdue' | 'due-soon' | 'scheduled' | 'unscheduled' — drives marker colour.
  urgency: 'overdue' | 'due-soon' | 'scheduled' | 'unscheduled'
  expected: ExpectedDuration
  // Reactive / emergency call metadata.
  isEmergency: boolean
  // KPI deadline (ISO) — "attend by". Null for scheduled PPM calls.
  respondBy: string | null
  // The call type name (service type), used in the popup/candidate header.
  callTypeName: string | null
  // Required discipline inferred from the system type, for skill matching.
  requiredDiscipline: Discipline | null
}

export interface MapEngineer {
  id: string
  name: string
  // Inferred current position (site of latest activity), if any.
  latitude: number | null
  longitude: number | null
  lastSeenLabel: string | null
  // Home anchor (route start/finish), if geocoded.
  homeLatitude: number | null
  homeLongitude: number | null
  homePostcode: string | null
  // Count of the engineer's booked calls today (for the panel).
  bookedTodayCount: number
  // Trade / skill, drives marker colour-coding + dispatch skill matching.
  discipline: Discipline | null
  // Human-readable role + department, for the popup and department filter.
  roleLabel: string | null
  departmentName: string | null
  // True when on approved leave today (incl. partial day) — dimmed + excluded
  // from dispatch candidates.
  onLeave: boolean
  leaveReason: string | null
}

export interface MapSite {
  id: string
  name: string
  postcode: string | null
  latitude: number
  longitude: number
}

export interface CallsMapData {
  calls: MapCall[]
  engineers: MapEngineer[]
  sites: MapSite[]
}

export interface RouteStop {
  kind: 'home' | 'call'
  label: string
  siteName: string | null
  latitude: number
  longitude: number
  bookedStartTime: string | null
  legMiles: number // straight-line miles from the previous stop
}

export interface EngineerRoute {
  engineerId: string
  engineerName: string
  date: string
  stops: RouteStop[]
  totalMiles: number
  hasHome: boolean
  // Real driving polyline ([lat,lng] pairs) from OSRM; empty when unavailable.
  geometry: [number, number][]
  // Total driving time in minutes (OSRM) — null when only straight-line known.
  drivingMinutes: number | null
  // True when the geometry/time is a straight-line fallback, not a road route.
  approximate: boolean
}

/**
 * A candidate engineer for dispatching a specific call, ranked by skill match
 * then driving ETA. Produced by `getDispatchCandidates`.
 */
export interface DispatchCandidate {
  engineerId: string
  engineerName: string
  discipline: Discipline | null
  roleLabel: string | null
  departmentName: string | null
  // Straight-line miles from the engineer's position to the call.
  distanceMiles: number
  // Driving distance/time to the call (OSRM, or straight-line fallback).
  drivingMiles: number
  drivingMinutes: number
  approximate: boolean
  // True when the engineer's discipline matches the call's required discipline.
  skillMatch: boolean
  // The origin used for routing ('current' activity position or 'home').
  originKind: 'current' | 'home'
  // Driving route polyline to the call, for drawing on the map.
  geometry: [number, number][]
  lastSeenLabel: string | null
  bookedTodayCount: number
}
