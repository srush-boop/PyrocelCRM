'use client'

import { memo, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Tooltip, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'

const DEFAULT_CENTER: [number, number] = [52.8, -1.8]
const DEFAULT_ZOOM = 6

export interface CanvasStop {
  siteId: string
  name: string
  latitude: number
  longitude: number
}

function numberedIcon(color: string, label: string): L.DivIcon {
  return L.divIcon({
    className: 'route-map-pin',
    html: `<span style="
      display:flex;align-items:center;justify-content:center;
      width:24px;height:24px;border-radius:9999px 9999px 9999px 0;
      background:${color};transform:rotate(-45deg);
      border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);
      color:#fff;font-size:11px;font-weight:700;">
      <span style="transform:rotate(45deg);line-height:1;">${label}</span>
    </span>`,
    iconSize: [24, 24],
    iconAnchor: [4, 24],
    popupAnchor: [8, -22],
  })
}

function homeIcon(): L.DivIcon {
  return L.divIcon({
    className: 'route-map-home',
    html: `<span style="
      display:flex;align-items:center;justify-content:center;
      width:26px;height:26px;border-radius:9999px;
      background:#0f172a;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);
      color:#fff;font-size:12px;font-weight:700;line-height:1;">H</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  })
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 1) {
      map.flyTo(points[0], 12, { duration: 0.5 })
    } else if (points.length > 1) {
      map.flyToBounds(L.latLngBounds(points), { padding: [48, 48], duration: 0.6 })
    }
  }, [points, map])
  return null
}

export const RouteMapCanvas = memo(function RouteMapCanvas({
  home,
  stops,
  polyline,
  approximate,
  color = '#2563eb',
}: {
  home: { latitude: number; longitude: number } | null
  stops: CanvasStop[]
  polyline: [number, number][]
  approximate: boolean
  color?: string
}) {
  const hIcon = useMemo(() => homeIcon(), [])

  // Straight-line fallback path when we have no driving geometry: home → stops → home.
  const fallbackLine = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = []
    if (home) pts.push([home.latitude, home.longitude])
    for (const s of stops) pts.push([s.latitude, s.longitude])
    if (home && stops.length > 0) pts.push([home.latitude, home.longitude])
    return pts
  }, [home, stops])

  const line = polyline.length > 1 ? polyline : fallbackLine
  const isApprox = polyline.length > 1 ? approximate : true

  const fitPoints = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = []
    if (home) pts.push([home.latitude, home.longitude])
    for (const s of stops) pts.push([s.latitude, s.longitude])
    return pts
  }, [home, stops])

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
      <FitBounds points={fitPoints} />

      {line.length > 1 && (
        <Polyline
          positions={line}
          pathOptions={{ color, weight: 4, opacity: 0.85, dashArray: isApprox ? '6 8' : undefined }}
        />
      )}

      {home && (
        <Marker position={[home.latitude, home.longitude]} icon={hIcon}>
          <Tooltip direction="top" offset={[0, -14]}>
            <span className="text-xs">Home (start / finish)</span>
          </Tooltip>
        </Marker>
      )}

      {stops.map((s, i) => (
        <Marker
          key={s.siteId}
          position={[s.latitude, s.longitude]}
          icon={numberedIcon(color, String(i + 1))}
        >
          <Tooltip direction="top" offset={[0, -20]}>
            <span className="text-xs">
              <strong>
                {i + 1}. {s.name}
              </strong>
            </span>
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  )
})
