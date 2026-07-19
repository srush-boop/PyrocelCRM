import { NextResponse } from 'next/server'
import { enforceRateLimit, clientIp } from '@/lib/rate-limit'

/**
 * Keyless UK postcode lookup via postcodes.io. Given a (partial or full)
 * postcode, returns the resolved locality fields we use to help fill in a
 * site/client address: town/district, ward, region, country, and coordinates.
 *
 * postcodes.io does NOT return street-level data (house number / road), so the
 * street line is still typed by the user — this only removes the tedious
 * town/region/postcode typing and confirms the postcode is valid.
 */

interface PostcodesIoResult {
  postcode: string
  admin_district: string | null
  admin_ward: string | null
  parish: string | null
  region: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
}

export interface PostcodeLookupResponse {
  postcode: string
  town: string | null
  ward: string | null
  region: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  /** A human-friendly locality line, e.g. "Chorlton, Manchester, England". */
  locality: string
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit('public', clientIp(request))
  if (limited) return limited

  const { searchParams } = new URL(request.url)
  const raw = (searchParams.get('q') || '').trim()

  if (!raw) {
    return NextResponse.json({ error: 'A postcode is required.' }, { status: 400 })
  }

  // Basic sanity check: UK postcodes are 5-8 chars incl. the space.
  const cleaned = raw.toUpperCase().replace(/\s+/g, ' ')
  if (cleaned.replace(/\s/g, '').length < 5) {
    return NextResponse.json({ error: 'Enter a full postcode.' }, { status: 400 })
  }

  try {
    const res = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(cleaned)}`,
      { cache: 'no-store' },
    )

    if (res.status === 404) {
      return NextResponse.json({ error: 'Postcode not found.' }, { status: 404 })
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Address lookup is unavailable right now.' },
        { status: 502 },
      )
    }

    const data = (await res.json()) as { result: PostcodesIoResult | null }
    const r = data.result
    if (!r) {
      return NextResponse.json({ error: 'Postcode not found.' }, { status: 404 })
    }

    const town = r.admin_district || r.parish || null
    const localityParts = [r.admin_ward, town, r.region, r.country].filter(
      (p): p is string => Boolean(p && p.trim().length > 0),
    )
    // De-duplicate while preserving order (ward and district can coincide).
    const locality = Array.from(new Set(localityParts)).join(', ')

    const payload: PostcodeLookupResponse = {
      postcode: r.postcode,
      town,
      ward: r.admin_ward,
      region: r.region,
      country: r.country,
      latitude: r.latitude,
      longitude: r.longitude,
      locality,
    }
    return NextResponse.json(payload)
  } catch {
    return NextResponse.json(
      { error: 'Address lookup is unavailable right now.' },
      { status: 502 },
    )
  }
}
