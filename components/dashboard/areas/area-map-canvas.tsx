'use client'

import { memo, useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface AreaMapPoint {
  siteId: string
  name: string
  postcode: string | null
  district: string | null
  latitude: number
  longitude: number
  color: string | null
  areaName: string | null
  highlighted: boolean
}

const UNMAPPED = '#94a3b8'

function FitOnce({ points }: { points: [number, number][] }) {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (done.current || points.length === 0) return
    done.current = true
    if (points.length === 1) map.setView(points[0], 12)
    else map.fitBounds(L.latLngBounds(points), { padding: [32, 32] })
  }, [points, map])
  return null
}

function InvalidateSize() {
  const map = useMap()
  useEffect(() => {
    let raf = 0
    const fix = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => map.invalidateSize({ animate: false }))
    }
    fix()
    const ro = new ResizeObserver(fix)
    ro.observe(map.getContainer())
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [map])
  return null
}

export const AreaMapCanvas = memo(function AreaMapCanvas({
  points,
  anyHighlight,
  onSelectDistrict,
}: {
  points: AreaMapPoint[]
  anyHighlight: boolean
  onSelectDistrict: (district: string) => void
}) {
  const coords = useMemo(() => points.map((p) => [p.latitude, p.longitude] as [number, number]), [points])

  return (
    <MapContainer center={[54.97, -1.61]} zoom={10} scrollWheelZoom className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitOnce points={coords} />
      <InvalidateSize />
      {points.map((p) => {
        const dim = anyHighlight && !p.highlighted
        const fill = p.color ?? UNMAPPED
        return (
          <CircleMarker
            key={p.siteId}
            center={[p.latitude, p.longitude]}
            radius={p.highlighted ? 9 : 7}
            pathOptions={{
              color: '#ffffff',
              weight: 2,
              fillColor: fill,
              fillOpacity: dim ? 0.25 : 0.9,
              opacity: dim ? 0.4 : 1,
              dashArray: p.color ? undefined : '3 3',
            }}
            eventHandlers={{
              click: () => {
                if (p.district) onSelectDistrict(p.district)
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              <div className="text-xs">
                <div className="font-semibold">{p.name}</div>
                <div>{p.postcode || 'No postcode'}</div>
                <div>{p.areaName ? `Area: ${p.areaName}` : 'Not in an area'}</div>
              </div>
            </Tooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
})
