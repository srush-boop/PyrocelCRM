'use client'

import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polyline, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { formatDuration } from '@/lib/task-duration'
import { formatDateUK } from '@/lib/utils'
import { disciplineMeta } from '@/lib/disciplines'
import type {
  MapCall,
  MapEngineer,
  MapSite,
  EngineerRoute,
  DispatchCandidate,
} from '@/app/(dashboard)/dashboard/schedule/map/types'

// Marker colours (explicit hex so they render inside Leaflet-injected DOM,
// independent of Tailwind's class scanner).
const URGENCY_COLOR: Record<MapCall['urgency'], string> = {
  overdue: '#dc2626',
  'due-soon': '#f59e0b',
  scheduled: '#2563eb',
  unscheduled: '#6b7280',
}

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

// A round engineer marker tinted by discipline, so trades are distinguishable
// at a glance. Dimmed (semi-transparent, dashed) when the engineer is on leave.
function engineerIcon(color: string, glyph: string, dim: boolean): L.DivIcon {
  return L.divIcon({
    className: 'calls-map-engineer',
    html: `<span style="
      display:flex;align-items:center;justify-content:center;
      width:26px;height:26px;border-radius:9999px;
      background:${color};opacity:${dim ? 0.4 : 1};
      border:${dim ? '2px dashed #fff' : '2px solid #fff'};
      box-shadow:0 1px 4px rgba(0,0,0,.4);
      color:#fff;font-size:13px;line-height:1;">${glyph}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  })
}

// Emergency call marker: a coloured pin sat inside an animated pulsing halo.
function emergencyIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: 'calls-map-emergency',
    html: `<span style="position:relative;display:block;width:26px;height:26px;">
      <span class="emergency-pulse-ring" style="
        position:absolute;inset:0;border-radius:9999px;background:${color};"></span>
      <span style="
        position:absolute;left:2px;top:2px;display:flex;align-items:center;justify-content:center;
        width:22px;height:22px;border-radius:9999px;background:${color};
        border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);
        color:#fff;font-size:13px;font-weight:700;line-height:1;">!</span>
    </span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  })
}

// Unicode glyphs per discipline (kept ASCII-safe within the HTML string).
const DISCIPLINE_GLYPH: Record<string, string> = {
  fire: '\uD83D\uDD25', // flame
  security: '\uD83D\uDEE1', // shield
  installer: '\uD83D\uDD27', // wrench
  cdo: '\u2611', // ballot check
  general: '\u2691', // flag
}

/** Imperatively pan/zoom when the user picks a site, or fit route/dispatch bounds. */
function MapController({
  focusSite,
  route,
  dispatchBounds,
}: {
  focusSite: MapSite | null
  route: EngineerRoute | null
  dispatchBounds: [number, number][] | null
}) {
  const map = useMap()

  useEffect(() => {
    if (focusSite) {
      map.flyTo([focusSite.latitude, focusSite.longitude], 13, { duration: 0.6 })
    }
  }, [focusSite, map])

  useEffect(() => {
    if (route && route.stops.length > 1) {
      const line = route.geometry.length > 1 ? route.geometry : route.stops.map((s) => [s.latitude, s.longitude] as [number, number])
      map.flyToBounds(L.latLngBounds(line), { padding: [48, 48], duration: 0.6 })
    }
  }, [route, map])

  useEffect(() => {
    if (dispatchBounds && dispatchBounds.length > 1) {
      map.flyToBounds(L.latLngBounds(dispatchBounds), { padding: [64, 64], duration: 0.6 })
    }
  }, [dispatchBounds, map])

  return null
}

export function CallsMapCanvas({
  calls,
  engineers,
  route,
  focusSite,
  dispatchCall,
  candidates,
  highlightCandidateId,
  onDispatch,
}: {
  calls: MapCall[]
  engineers: MapEngineer[]
  route: EngineerRoute | null
  focusSite: MapSite | null
  // When dispatching from the map, the call being dispatched + its candidates.
  dispatchCall?: MapCall | null
  candidates?: DispatchCandidate[]
  highlightCandidateId?: string | null
  // Start dispatch (find best-placed engineers) for a call from its popup.
  onDispatch?: (call: MapCall) => void
}) {
  const homeIcon = useMemo(() => pinIcon('#0f172a', 'H'), [])

  const routeLine = useMemo<[number, number][]>(() => {
    if (!route) return []
    if (route.geometry.length > 1) return route.geometry
    return route.stops.map((s) => [s.latitude, s.longitude] as [number, number])
  }, [route])

  // The highlighted candidate's driving route to the dispatch call.
  const highlighted = useMemo(
    () => candidates?.find((c) => c.engineerId === highlightCandidateId) ?? null,
    [candidates, highlightCandidateId],
  )

  const dispatchBounds = useMemo<[number, number][] | null>(() => {
    if (!dispatchCall) return null
    const pts: [number, number][] = [[dispatchCall.latitude, dispatchCall.longitude]]
    if (highlighted && highlighted.geometry.length > 0) pts.push(...highlighted.geometry)
    return pts
  }, [dispatchCall, highlighted])

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

      <MapController focusSite={focusSite} route={route} dispatchBounds={dispatchBounds} />

      {/* 10-mile dispatch radius around the call being dispatched. */}
      {dispatchCall && (
        <Circle
          center={[dispatchCall.latitude, dispatchCall.longitude]}
          radius={10 * 1609.34}
          pathOptions={{ color: '#dc2626', weight: 1, fillColor: '#dc2626', fillOpacity: 0.06 }}
        />
      )}

      {/* Call markers */}
      {calls.map((c) => (
        <Marker
          key={c.taskId}
          position={[c.latitude, c.longitude]}
          icon={c.isEmergency ? emergencyIcon(URGENCY_COLOR.overdue) : pinIcon(URGENCY_COLOR[c.urgency])}
          zIndexOffset={c.isEmergency ? 1000 : 0}
        >
          <Tooltip direction="top" offset={[0, -18]}>
            <span className="text-xs">
              {c.isEmergency && <strong style={{ color: URGENCY_COLOR.overdue }}>EMERGENCY · </strong>}
              <strong>{c.siteName}</strong>
              {' · '}~{formatDuration(c.expected.minutes)}
            </span>
          </Tooltip>
          <Popup>
            <div className="min-w-[200px] space-y-1 text-[13px] leading-snug">
              {c.isEmergency && (
                <p className="font-bold" style={{ color: URGENCY_COLOR.overdue }}>
                  EMERGENCY CALL
                </p>
              )}
              <p className="font-semibold">{c.siteName}</p>
              {c.clientName && <p className="text-muted-foreground">{c.clientName}</p>}
              <p>
                {[c.systemTypeName, c.callTypeName ?? c.serviceTypeName].filter(Boolean).join(' · ') ||
                  'Service call'}
                {c.visitTypeName ? ` (${c.visitTypeName})` : ''}
              </p>
              {c.respondBy && (
                <p style={{ color: URGENCY_COLOR.overdue }}>
                  Attend by {formatDateUK(c.respondBy)} {new Date(c.respondBy).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
              <p>
                <strong>~{formatDuration(c.expected.minutes)}</strong> on site
              </p>
              <p>
                {c.urgency === 'overdue' && !c.isEmergency && (
                  <span style={{ color: URGENCY_COLOR.overdue }}>Overdue · </span>
                )}
                {c.scheduledDate ? `Due ${formatDateUK(c.scheduledDate)}` : 'Unscheduled'}
              </p>
              <p className="text-muted-foreground">
                {c.assignedEngineerName ? `Assigned: ${c.assignedEngineerName}` : 'Unassigned'}
                {c.postcode ? ` · ${c.postcode}` : ''}
              </p>
              <div className="flex items-center gap-3 pt-1">
                {onDispatch && (
                  <button
                    type="button"
                    onClick={() => onDispatch(c)}
                    className="font-medium text-primary underline"
                  >
                    Find engineers
                  </button>
                )}
                <a
                  href={`/dashboard/tasks/${c.taskId}?from=/dashboard/schedule/map`}
                  className="font-medium text-primary underline"
                >
                  Open call
                </a>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Engineer markers (positioned from latest activity), tinted by discipline */}
      {engineers
        .filter((e) => e.latitude != null && e.longitude != null)
        .map((e) => {
          const meta = disciplineMeta(e.discipline)
          const glyph = DISCIPLINE_GLYPH[meta.key] ?? DISCIPLINE_GLYPH.general
          return (
            <Marker
              key={e.id}
              position={[e.latitude!, e.longitude!]}
              icon={engineerIcon(meta.color, glyph, e.onLeave)}
              opacity={e.onLeave ? 0.6 : 1}
            >
              <Tooltip direction="top" offset={[0, -14]}>
                <span className="text-xs">
                  <strong>{e.name}</strong> · {meta.label}
                  {e.onLeave ? ' · on leave' : ''}
                </span>
              </Tooltip>
              <Popup>
                <div className="min-w-[190px] space-y-1 text-[13px] leading-snug">
                  <p className="font-semibold">{e.name}</p>
                  <p>
                    <span
                      className="mr-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium"
                      style={{ background: meta.color, color: meta.onColor }}
                    >
                      {meta.label}
                    </span>
                    {e.roleLabel && <span className="text-muted-foreground">{e.roleLabel}</span>}
                  </p>
                  {e.departmentName && <p className="text-muted-foreground">{e.departmentName}</p>}
                  <p>{e.lastSeenLabel ?? 'No recent activity'}</p>
                  {e.onLeave && (
                    <p style={{ color: URGENCY_COLOR.overdue }}>
                      On leave today{e.leaveReason ? ` · ${e.leaveReason}` : ''}
                    </p>
                  )}
                  <p className="text-muted-foreground">
                    {e.bookedTodayCount} booked call{e.bookedTodayCount === 1 ? '' : 's'} today
                  </p>
                </div>
              </Popup>
            </Marker>
          )
        })}

      {/* Selected engineer route (driving geometry when available) */}
      {routeLine.length > 1 && (
        <Polyline
          positions={routeLine}
          pathOptions={{
            color: disciplineMeta(null).color,
            weight: 4,
            opacity: 0.85,
            dashArray: route?.approximate ? '6 8' : undefined,
          }}
        />
      )}
      {route?.stops.map((s, i) => (
        <Marker
          key={`${route.engineerId}-stop-${i}`}
          position={[s.latitude, s.longitude]}
          icon={s.kind === 'home' ? homeIcon : pinIcon('#0f172a', String(i))}
        >
          <Tooltip direction="top" offset={[0, -18]}>
            <span className="text-xs">
              {s.kind === 'home' ? 'Home' : `${s.label} · ${s.siteName ?? ''}`}
            </span>
          </Tooltip>
        </Marker>
      ))}

      {/* Dispatch: highlighted candidate's driving route to the call */}
      {dispatchCall && highlighted && highlighted.geometry.length > 1 && (
        <Polyline
          positions={highlighted.geometry}
          pathOptions={{
            color: '#dc2626',
            weight: 4,
            opacity: 0.9,
            dashArray: highlighted.approximate ? '6 8' : undefined,
          }}
        />
      )}
    </MapContainer>
  )
}
