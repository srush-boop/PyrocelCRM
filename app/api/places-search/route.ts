import { NextResponse } from 'next/server'
import { enforceRateLimit, clientIp } from '@/lib/rate-limit'

/**
 * Business / address finder backed by the Google Places API (New) Text Search.
 *
 * A single call returns everything we need (name, full formatted address,
 * phone, website, postcode, coordinates) so callers don't need a follow-up
 * Place Details request. Used by the site / client / quote-prospect finders.
 *
 * Requires a Google API key with the "Places API (New)" enabled. We read the
 * first non-empty value from a small list of accepted variable names, because
 * the key has historically been saved under suffixed/alternate names
 * (GOOGLE_MAPS_API_KEY_2, GCP_API_KEY, ...) rather than the canonical one.
 */

// Accepted env var names for the Google key, in priority order. The canonical
// name wins; the alternates are fallbacks so a valid key saved under a
// suffixed name still works without a code change.
const API_KEY_ENV_NAMES = [
  'GOOGLE_MAPS_API_KEY',
  'GOOGLE_MAPS_API_KEY_2',
  'GOOGLE_MAPS_API_KEY_3',
  'GCP_API_KEY',
  'GCP_API_KEY_2',
  'GCP_API_KEY_3',
]

function resolveApiKey(): string | undefined {
  for (const name of API_KEY_ENV_NAMES) {
    const value = process.env[name]?.trim()
    // A real Google key starts with "AIza"; skip obviously-invalid values so a
    // stale placeholder under the canonical name can't shadow a good fallback.
    if (value && value.startsWith('AIza')) return value
  }
  // Last resort: any non-empty canonical value (covers non-standard key formats).
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || undefined
}

export interface PlaceResult {
  placeId: string
  name: string
  address: string
  postcode: string
  phone: string
  website: string
  lat: number | null
  lng: number | null
}

// Pull the UK-style postcode out of Places address components.
function extractPostcode(
  components: { types?: string[]; longText?: string }[] | undefined,
): string {
  if (!components) return ''
  const pc = components.find((c) => c.types?.includes('postal_code'))
  return pc?.longText ?? ''
}

// The ISO country code (shortText, e.g. "GB") from Places address components.
function extractCountryCode(
  components: { types?: string[]; shortText?: string }[] | undefined,
): string {
  if (!components) return ''
  const country = components.find((c) => c.types?.includes('country'))
  return country?.shortText ?? ''
}

// UK bounding box (mainland GB, Northern Ireland, and the isles) used to hard
// restrict Text Search results rather than merely bias them.
const UK_BOUNDS = {
  low: { latitude: 49.8, longitude: -8.7 },
  high: { latitude: 60.9, longitude: 1.9 },
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit('public', clientIp(request))
  if (limited) return limited

  const apiKey = resolveApiKey()
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Address finder is not configured (missing Google Maps API key).' },
      { status: 500 },
    )
  }

  const { searchParams } = new URL(request.url)
  const query = (searchParams.get('q') ?? '').trim()
  if (query.length < 3) {
    return NextResponse.json({ results: [] })
  }

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        // Only request the fields we actually use, to keep the call in the
        // cheaper billing SKU and the payload small.
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.internationalPhoneNumber',
          'places.nationalPhoneNumber',
          'places.websiteUri',
          'places.location',
          'places.addressComponents',
        ].join(','),
      },
      body: JSON.stringify({
        textQuery: query,
        // Bias results to the UK; this is a UK fire & security business.
        regionCode: 'GB',
        // Hard-restrict to a UK bounding box so results outside the UK are not
        // returned (regionCode alone only biases). Belt-and-braces with the
        // per-result country filter below.
        locationRestriction: { rectangle: UK_BOUNDS },
        languageCode: 'en',
        maxResultCount: 8,
      }),
      // Places results are stable enough to cache briefly.
      next: { revalidate: 60 },
    })

    if (!res.ok) {
      const detail = await res.text()
      console.log('[v0] places-search error:', res.status, detail)
      return NextResponse.json({ error: 'Address lookup failed.' }, { status: 502 })
    }

    const data = (await res.json()) as {
      places?: {
        id: string
        displayName?: { text?: string }
        formattedAddress?: string
        internationalPhoneNumber?: string
        nationalPhoneNumber?: string
        websiteUri?: string
        location?: { latitude?: number; longitude?: number }
        addressComponents?: { types?: string[]; longText?: string; shortText?: string }[]
      }[]
    }

    const results: PlaceResult[] = (data.places ?? [])
      // Only keep UK results. The country component is the authoritative signal;
      // if it's missing we keep the result (the bounding box already restricted it).
      .filter((p) => {
        const cc = extractCountryCode(p.addressComponents)
        return cc === '' || cc === 'GB'
      })
      .map((p) => ({
        placeId: p.id,
        name: p.displayName?.text ?? '',
        address: p.formattedAddress ?? '',
        postcode: extractPostcode(p.addressComponents),
        phone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? '',
        website: p.websiteUri ?? '',
        lat: p.location?.latitude ?? null,
        lng: p.location?.longitude ?? null,
      }))

    return NextResponse.json({ results })
  } catch (err) {
    console.log('[v0] places-search exception:', err)
    return NextResponse.json({ error: 'Address lookup failed.' }, { status: 502 })
  }
}
