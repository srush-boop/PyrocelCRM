// Shared shapes for the calls map. Kept in a plain (non-'use server') module so
// both the server actions and client components can import them safely — a
// 'use server' file may only export async functions.
import type { ExpectedDuration } from '@/lib/task-duration'

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
}
