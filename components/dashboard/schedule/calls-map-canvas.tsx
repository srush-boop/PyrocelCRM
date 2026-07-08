'use client'

import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { formatDuration } from '@/lib/task-duration'
import { formatDateUK } from '@/lib/utils'
import type {
  MapCall,
  MapEngineer,
  MapSite,
  EngineerRoute,
} from '@/app/(dashboard)/dashboard/schedule/map/actions'

// Marker colours (explicit hex so they render inside Leaflet-injected DOM,
// independent of Tailwind's class scanner).
const URGENCY_COLOR: Record<MapCall['urgency'], string> = {
  overdue: '#dc2626',
  'due-soon': '#f59e0b',
  scheduled: '#2563eb',
  unscheduled: '#6b7280',
}
const ENGINEER_COLOR = '#059669'

// Centre of Great Britain-ish, used as a sensible default view.
const DEFAULT_CENTER: [number, number] = [52.8, -1.8]
const DEFAULT_ZOOM = 6

function pinIcon(color: string, glyph = ''): L.DivIcon {
  return L.divIcon({
    className: 'calls-map-pin',
    html: `<span style="
      display:flex;align-items:center;justify-content:center;
      width:22px;height:22px;border-radius:9999px 9999px 9999px 0;
      background:${color};transform:rotate(-45deg);
      border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);
      color:#fff;font-size:11px;font-weight:700;">
      <span style="transform:rotate(45deg);line-height:1;">${glyph}</span>
    </span>`,
    iconSize: [22, 22],
    iconAnchor: [4, 22],
    popupAnchor: [7, -20],
  })
}

/** Imperatively pan/zoom when the user picks a site, or fit the route bounds. */
function MapController({
  focusSite,
  route,
}: {
  focusSite: MapSite | null
  route: EngineerRoute | null
}) {
  const map = useMap()

  useEffect(() => {
    if (focusSite) {
      map.flyTo([focusSite.latitude, focusSite.longitude], 13, { duration: 0.6 })
    }
  }, [focusSite, map])

  useEffect(() => {
    if (route && route.stops.length > 1) {
      const bounds = L.latLngBounds(route.stops.map((s) => [s.latitude, s.longitude] as [number, number]))
      map.flyToBounds(bounds, { padding: [48, 48], duration: 0.6 })
    }
  }, [route, map])

  return null
}

export function CallsMapCanvas({
  calls,
  engineers,
  route,
  focusSite,
}: {
  calls: MapCall[]
  engineers: MapEngineer[]
  route: EngineerRoute | null
  focusSite: MapSite | null
}) {
  const engineerIcon = useMemo(() => pinIcon(ENGINEER_COLOR, '\u2691'), [])
  const homeIcon = useMemo(() => pinIcon('#0f172a', 'H'), [])

  const routeLine = useMemo<[number, number][]>(
    () => (route ? route.stops.map((s) => [s.latitude, s.longitude] as [number, number]) : []),
    [route],
  )

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      className="h-full w-full"
      style={{ background: '#e5e7eb' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapController focusSite={focusSite} route={route} />

      {/* Call markers */}
      {calls.map((c) => (
        <Marker key={c.taskId} position={[c.latitude, c.longitude]} icon={pinIcon(URGENCY_COLOR[c.urgency])}>
          <Tooltip direction="top" offset={[0, -18]}>
            <span className="text-xs">
              <strong>{c.siteName}</strong>
              {' · '}~{formatDuration(c.expected.minutes)}
            </span>
          </Tooltip>
          <Popup>
            <div className="min-w-[200px] space-y-1 text-[13px] leading-snug">
              <p className="font-semibold">{c.siteName}</p>
              {c.clientName && <p className="text-muted-foreground">{c.clientName}</p>}
              <p>
                {[c.systemTypeName, c.serviceTypeName].filter(Boolean).join(' · ') || 'Service call'}
                {c.visitTypeName ? ` (${c.visitTypeName})` : ''}
              </p>
              <p>
                <strong>~{formatDuration(c.expected.minutes)}</strong> on site
                {c.expected.learned ? (
                  <span className="text-muted-foreground"> · avg of {c.expected.sampleSize}</span>
                ) : (
                  <span className="text-muted-foreground"> · estimate</span>
                )}
              </p>
              <p>
                {c.urgency === 'overdue' && <span style={{ color: URGENCY_COLOR.overdue }}>Overdue · </span>}
                {c.scheduledDate ? `Due ${formatDateUK(c.scheduledDate)}` : 'Unscheduled'}
              </p>
              <p className="text-muted-foreground">
                {c.assignedEngineerName ? `Assigned: ${c.assignedEngineerName}` : 'Unassigned'}
                {c.postcode ? ` · ${c.postcode}` : ''}
              </p>
              <a
                href={`/dashboard/tasks/${c.taskId}?from=/dashboard/schedule/map`}
                className="inline-block pt-1 font-medium text-primary underline"
              >
                Open call
              </a>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Engineer markers (positioned from latest activity) */}
      {engineers
        .filter((e) => e.latitude != null && e.longitude != null)
        .map((e) => (
          <Marker key={e.id} position={[e.latitude!, e.longitude!]} icon={engineerIcon}>
            <Tooltip direction="top" offset={[0, -18]}>
              <span className="text-xs">
                <strong>{e.name}</strong>
              </span>
            </Tooltip>
            <Popup>
              <div className="min-w-[180px] space-y-1 text-[13px] leading-snug">
                <p className="font-semibold">{e.name}</p>
                <p>{e.lastSeenLabel ?? 'No recent activity'}</p>
                <p className="text-muted-foreground">
                  {e.bookedTodayCount} booked call{e.bookedTodayCount === 1 ? '' : 's'} today
                </p>
              </div>
            </Popup>
          </Marker>
        ))}

      {/* Selected engineer route */}
      {routeLine.length > 1 && (
        <Polyline positions={routeLine} pathOptions={{ color: ENGINEER_COLOR, weight: 3, dashArray: '6 6' }} />
      )}
      {route?.stops.map((s, i) => (
        <Marker
          key={`${route.engineerId}-stop-${i}`}
          position={[s.latitude, s.longitude]}
          icon={s.kind === 'home' ? homeIcon : pinIcon(ENGINEER_COLOR, String(i))}
        >
          <Tooltip direction="top" offset={[0, -18]}>
            <span className="text-xs">
              {s.kind === 'home' ? 'Home' : `${s.label} · ${s.siteName ?? ''}`}
            </span>
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  )
}
