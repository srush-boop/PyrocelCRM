'use server'

import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { DRAFT_MODEL } from '@/lib/ai/shared'

const hospitalSchema = z.object({
  found: z
    .boolean()
    .describe('True if a plausible nearest A&E hospital could be identified for the location.'),
  name: z.string().describe('The hospital name, e.g. "Royal Berkshire Hospital". Empty if not found.'),
  address: z
    .string()
    .describe('The full postal address including postcode. Empty if not found.'),
  phone: z
    .string()
    .describe('The main switchboard phone number in UK format. Empty if not known.'),
  distance: z
    .string()
    .describe(
      'Approximate distance/direction from the site, e.g. "approx. 3 miles NE". Empty if unknown.',
    ),
  note: z
    .string()
    .describe(
      'A short caveat, e.g. that details must be verified before use, or that the postcode was ambiguous.',
    ),
})

export type NearestHospital = z.infer<typeof hospitalSchema>

export interface FindHospitalResult {
  ok: boolean
  hospital?: NearestHospital
  error?: string
}

async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null as null, error: 'Not authenticated.' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = (profile as { role?: string } | null)?.role
  if (!role || !['admin', 'office'].includes(role)) {
    return { user: null as null, error: 'Not authorised.' }
  }
  return { user, error: null as null }
}

// Suggests the nearest A&E hospital for a UK site location (postcode/address)
// for the RAMS emergency arrangements. This is AI-generated and MUST be verified
// by the author — the returned note reminds them, and the UI surfaces it.
export async function findNearestHospital(input: {
  location: string
}): Promise<FindHospitalResult> {
  const { user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const location = input.location?.trim()
  if (!location) {
    return { ok: false, error: 'Enter the site address or postcode first.' }
  }

  try {
    const { object } = await generateObject({
      model: DRAFT_MODEL,
      schema: hospitalSchema,
      system: [
        'You are assisting with UK site safety documentation (RAMS emergency arrangements).',
        'Given a UK site location (address and/or postcode), identify the nearest hospital with a 24-hour Accident & Emergency (A&E) department.',
        'Use British English and UK address/phone formatting.',
        'Prefer well-known NHS A&E hospitals. If you are not confident about the exact nearest one, still give the most likely major A&E for that area and clearly say in the note that it must be verified.',
        'Never fabricate a precise phone number you are unsure of — leave phone empty rather than guessing, and mention in the note that the number should be confirmed.',
      ].join(' '),
      prompt: `Site location: ${location}\n\nIdentify the nearest hospital with an A&E department, its address, main phone number if known, and approximate distance from this location.`,
    })

    return { ok: true, hospital: object }
  } catch (err) {
    console.error('[v0] findNearestHospital failed:', err)
    return { ok: false, error: 'Could not look up a hospital. Please try again.' }
  }
}
