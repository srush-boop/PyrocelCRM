import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Open postcode-district polygons (derived from OS Code-Point Open), one file per postcode area.
const SOURCE = 'https://raw.githubusercontent.com/missinglink/uk-postcode-polygons/master/geojson'
const AREA_RE = /^[A-Z]{1,2}$/
const MAX_AREAS = 12

type Position = number[]
interface Feature {
  type: 'Feature'
  properties: { name?: string }
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }
}

// ~10m precision is plenty for district shading and cuts the payload roughly in half.
function round(coords: unknown): unknown {
  if (Array.isArray(coords) && typeof coords[0] === 'number') {
    return (coords as Position).map((n) => Math.round(n * 1e4) / 1e4)
  }
  return (coords as unknown[]).map(round)
}

async function loadArea(area: string): Promise<Feature[]> {
  const res = await fetch(`${SOURCE}/${area}.geojson`, { next: { revalidate: 60 * 60 * 24 * 30 } })
  if (!res.ok) return []
  const json = (await res.json()) as { features?: Feature[] }
  return (json.features ?? [])
    .filter((f) => f.properties?.name && f.geometry)
    .map((f) => ({
      type: 'Feature',
      properties: { name: String(f.properties.name).toUpperCase() },
      geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) },
    }))
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const areas = [
    ...new Set(
      (new URL(request.url).searchParams.get('areas') ?? '')
        .split(',')
        .map((a) => a.trim().toUpperCase())
        .filter((a) => AREA_RE.test(a)),
    ),
  ].slice(0, MAX_AREAS)

  if (areas.length === 0) return NextResponse.json({ type: 'FeatureCollection', features: [] })

  const results = await Promise.all(areas.map((a) => loadArea(a).catch(() => [] as Feature[])))
  return NextResponse.json(
    { type: 'FeatureCollection', features: results.flat() },
    { headers: { 'Cache-Control': 'private, max-age=86400' } },
  )
}
