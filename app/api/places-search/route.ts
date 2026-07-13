import { NextResponse } from 'next/server'

/**
 * Business / address finder backed by the Google Places API (New) Text Search.
 *
 * A single call returns everything we need (name, full formatted address,
 * phone, website, postcode, coordinates) so callers don't need a follow-up
 * Place Details request. Used by the site / client / quote-prospect finders.
 *
 * Requires GOOGLE_MAPS_API_KEY with the "Places API (New)" enabled.
 */

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

export async function GET(request: Request) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Address finder is not configured (missing GOOGLE_MAPS_API_KEY).' },
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
        addressComponents?: { types?: string[]; longText?: string }[]
      }[]
    }

    const results: PlaceResult[] = (data.places ?? []).map((p) => ({
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
