'use client'

import { memo, useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/** A located alert to plot on the monitor map. */
export interface AlertPoint {
  sessionId: string
  userName: string
  level: 'amber' | 'red'
  lat: number
  lng: number
  since: string | null
  locationUpdatedAt: string | null
}

const RED = '#dc2626'
const AMBER = '#d97706'
const DEFAULT_CENTER: [number, number] = [52.8, -1.8]

// Amber warning pin — a coloured teardrop with a white "!".
function warningIcon(): L.DivIcon {
  return L.divIcon({
    className: 'lw-monitor-pin',
    html: `<span style="
      display:flex;align-items:center;justify-content:center;
      width:26px;height:26px;border-radius:9999px 9999px 9999px 0;
      background:${AMBER};transform:rotate(-45deg);
      border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45);
      color:#fff;font-size:14px;font-weight:800;">
      <span style="transform:rotate(45deg);line-height:1;">!</span>
    </span>`,
    iconSize: [26, 26],
    iconAnchor: [4, 26],
    popupAnchor: [9, -24],
  })
}

// Red emergency marker — a pulsing halo around a red pin. Reuses the shared
// `.emergency-pulse-ring` animation already defined in globals.css.
function emergencyIcon(): L.DivIcon {
  return L.divIcon({
    className: 'lw-monitor-emergency',
    html: `<span style="position:relative;display:block;width:30px;height:30px;">
      <span class="emergency-pulse-ring" style="
        position:absolute;inset:0;border-radius:9999px;background:${RED};"></span>
      <span style="
        position:absolute;left:2px;top:2px;display:flex;align-items:center;justify-content:center;
        width:26px;height:26px;border-radius:9999px;background:${RED};
        border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.5);
        color:#fff;font-size:15px;font-weight:800;line-height:1;">!</span>
    </span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  })
}

/** Fit the map to the plotted alerts whenever they change. */
function FitBounds({ points }: { points: AlertPoint[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14, { animate: true })
      return
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]))
    map.flyToBounds(bounds, { padding: [56, 56], maxZoom: 15, duration: 0.6 })
  }, [points, map])
  return null
}

export const LoneWorkerMonitorCanvas = memo(function LoneWorkerMonitorCanvas({
  points,
}: {
  points: AlertPoint[]
}) {
  const warning = useMemo(() => warningIcon(), [])
  const emergency = useMemo(() => emergencyIcon(), [])

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={6}
      scrollWheelZoom
      className="h-full w-full"
      style={{ background: '#e5e7eb' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points} />
      {points.map((p) => (
        <Marker
          key={p.sessionId}
          position={[p.lat, p.lng]}
          icon={p.level === 'red' ? emergency : warning}
          zIndexOffset={p.level === 'red' ? 1000 : 0}
        >
          <Tooltip direction="top" offset={[0, -18]}>
            <span className="text-xs">
              <strong style={{ color: p.level === 'red' ? RED : AMBER }}>
                {p.level === 'red' ? 'EMERGENCY' : 'WARNING'}
              </strong>
              {' · '}
              {p.userName}
            </span>
          </Tooltip>
          <Popup>
            <div className="min-w-[180px] space-y-1 text-[13px] leading-snug">
              <p className="font-bold" style={{ color: p.level === 'red' ? RED : AMBER }}>
                {p.level === 'red' ? 'EMERGENCY' : 'WARNING'}
              </p>
              <p className="font-semibold">{p.userName}</p>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline"
              >
                Open in Google Maps
              </a>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
})
