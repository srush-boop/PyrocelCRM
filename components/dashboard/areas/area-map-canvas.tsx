'use client'

import { memo, useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, GeoJSON, Tooltip, useMap } from 'react-leaflet'
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
const LABEL_MIN_ZOOM = 11

export interface DistrictInfo {
  color: string | null
  areaName: string | null
  /** Some sectors inside the district belong to a different area. */
  partial: boolean
  siteCount: number
  /** Annual recurring value of the district's engineer services, in pence. */
  valuePence: number
}

const compactGbp = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  notation: 'compact',
  maximumFractionDigits: 1,
})
const fullGbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 })

export interface DistrictBoundaries {
  type: 'FeatureCollection'
  features: {
    type: 'Feature'
    properties: { name: string }
    geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }
  }[]
}

function LabelVisibility() {
  const map = useMap()
  useEffect(() => {
    const sync = () =>
      map.getContainer().classList.toggle('area-map-hide-labels', map.getZoom() < LABEL_MIN_ZOOM)
    sync()
    map.on('zoomend', sync)
    return () => {
      map.off('zoomend', sync)
    }
  }, [map])
  return null
}

function DistrictLayer({
  boundaries,
  info,
  styleKey,
  selectedDistrict,
  selectedColor,
  onSelectDistrict,
}: {
  boundaries: DistrictBoundaries
  info: (district: string) => DistrictInfo
  styleKey: string
  selectedDistrict: string | null
  selectedColor: string | null
  onSelectDistrict: (district: string) => void
}) {
  const focus = selectedDistrict || selectedColor
  return (
    <GeoJSON
      key={`${styleKey}|${selectedDistrict ?? ''}|${selectedColor ?? ''}`}
      data={boundaries}
      style={(feature) => {
        const name = feature?.properties?.name ?? ''
        const d = info(name)
        const isFocus = selectedDistrict ? name === selectedDistrict : selectedColor ? d.color === selectedColor : false
        const dim = focus && !isFocus
        return {
          color: isFocus ? '#0f172a' : (d.color ?? UNMAPPED),
          weight: isFocus ? 3 : d.color ? 2 : 1.25,
          opacity: dim ? 0.45 : 1,
          fillColor: d.color ?? UNMAPPED,
          fillOpacity: d.color ? (dim ? 0.15 : isFocus ? 0.6 : 0.45) : 0.1,
          dashArray: d.partial || !d.color ? '4 3' : undefined,
        }
      }}
      onEachFeature={(feature, layer) => {
        const name = feature.properties.name
        const d = info(name)
        const label = document.createElement('div')
        const labelName = document.createElement('div')
        labelName.textContent = name
        label.append(labelName)
        if (d.valuePence > 0) {
          const labelValue = document.createElement('div')
          labelValue.className = 'area-map-district-value'
          labelValue.textContent = compactGbp.format(d.valuePence / 100)
          label.append(labelValue)
        }
        layer.bindTooltip(label, {
          permanent: true,
          direction: 'center',
          className: 'area-map-district-label',
        })
        const summary = document.createElement('div')
        summary.style.fontSize = '12px'
        const title = document.createElement('strong')
        title.textContent = name
        const areaLine = document.createElement('div')
        areaLine.textContent = d.areaName
          ? `Area: ${d.areaName}${d.partial ? ' (some sectors elsewhere)' : ''}`
          : 'Not in an area'
        const sitesLine = document.createElement('div')
        sitesLine.textContent = `${d.siteCount} site${d.siteCount === 1 ? '' : 's'}`
        const valueLine = document.createElement('div')
        valueLine.textContent = `Recurring value: ${fullGbp.format(d.valuePence / 100)}/yr`
        summary.append(title, areaLine, sitesLine, valueLine)
        layer.bindPopup(summary, { closeButton: false, autoPan: false })
        layer.on('click', () => onSelectDistrict(name))
      }}
    />
  )
}

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
  boundaries,
  districtInfo,
  styleKey,
  selectedDistrict,
  selectedColor,
}: {
  points: AreaMapPoint[]
  anyHighlight: boolean
  onSelectDistrict: (district: string) => void
  boundaries: DistrictBoundaries | null
  districtInfo: (district: string) => DistrictInfo
  styleKey: string
  selectedDistrict: string | null
  selectedColor: string | null
}) {
  const coords = useMemo(() => points.map((p) => [p.latitude, p.longitude] as [number, number]), [points])

  return (
    <MapContainer center={[54.97, -1.61]} zoom={10} scrollWheelZoom className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Postcode boundaries &copy; OS Code-Point Open'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <FitOnce points={coords} />
      <InvalidateSize />
      <LabelVisibility />
      {boundaries && boundaries.features.length > 0 && (
        <DistrictLayer
          boundaries={boundaries}
          info={districtInfo}
          styleKey={styleKey}
          selectedDistrict={selectedDistrict}
          selectedColor={selectedColor}
          onSelectDistrict={onSelectDistrict}
        />
      )}
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
