import type { SupabaseClient } from '@supabase/supabase-js'
import { isRoutineMaintenanceOnly } from '@/lib/sales'

/**
 * Contract Review draft builder.
 *
 * When a Routine Maintenance (`service_contract`) quote is accepted, this maps
 * the quote + its systems + PPM pricing + prospect details into a draft graph of
 * `contract_review_items` (client -> site -> system -> service -> charge) held
 * for review. Existing records are fuzzy-matched and pre-suggested so the
 * reviewer can link rather than duplicate.
 *
 * Design notes:
 * - **Idempotent**: if a review already exists for the quote it is returned as-is.
 * - **Never throws**: failures are logged and returned as `{ ok: false }` so
 *   quote acceptance is never blocked.
 * - Uses the caller's RLS-scoped (staff) Supabase client.
 */

// --- Fuzzy string matching (dependency-free Dice coefficient on bigrams) ---

function normalise(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function bigrams(s: string): Map<string, number> {
  const map = new Map<string, number>()
  for (let i = 0; i < s.length - 1; i++) {
    const bg = s.slice(i, i + 2)
    map.set(bg, (map.get(bg) ?? 0) + 1)
  }
  return map
}

// Returns similarity in [0,1]. 1 = identical (after normalisation).
export function similarity(a: string | null | undefined, b: string | null | undefined): number {
  const na = normalise(a)
  const nb = normalise(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.length < 2 || nb.length < 2) return na === nb ? 1 : 0
  const ba = bigrams(na)
  const bb = bigrams(nb)
  let intersection = 0
  for (const [bg, count] of ba) {
    const other = bb.get(bg)
    if (other) intersection += Math.min(count, other)
  }
  const total = na.length - 1 + (nb.length - 1)
  return (2 * intersection) / total
}

// Confidence threshold above which we pre-select a suggested match.
const MATCH_THRESHOLD = 0.72

interface BestMatch {
  id: string | null
  confidence: number
}

function bestMatch(
  target: string,
  candidates: { id: string; text: string }[],
): BestMatch {
  let best: BestMatch = { id: null, confidence: 0 }
  for (const c of candidates) {
    const score = similarity(target, c.text)
    if (score > best.confidence) best = { id: c.id, confidence: score }
  }
  return best
}

// --- Frequency mapping from PPM visit count ---

// Map the annual visit count to a service interval in months (best-effort).
function monthsFromVisits(numVisits: number): number {
  if (!numVisits || numVisits < 1) return 12
  const months = Math.round(12 / numVisits)
  return Math.max(1, Math.min(12, months))
}

// Map months to the recurring_charges frequency vocabulary (annual default).
function chargeFrequencyFromMonths(months: number): string {
  if (months <= 1) return 'monthly'
  if (months <= 2) return 'bi_monthly'
  if (months <= 4) return 'four_monthly'
  return 'annual'
}

interface ItemDraft {
  entity_type: 'client' | 'site' | 'system' | 'service' | 'charge'
  action: 'create' | 'link' | 'skip'
  linked_id: string | null
  suggested_id: string | null
  match_confidence: number | null
  local_key: string
  parent_key: string | null
  payload: Record<string, unknown>
  source_quote_system_id: string | null
  position: number
}

export async function buildContractReviewDraft(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<{ ok: boolean; reviewId?: string; error?: string; skipped?: boolean }> {
  try {
    // Idempotency guard.
    const { data: existing } = await supabase
      .from('contract_reviews')
      .select('id')
      .eq('quote_id', quoteId)
      .maybeSingle()
    if (existing?.id) return { ok: true, reviewId: existing.id as string }

    const { data: quote, error: qErr } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', quoteId)
      .single()
    if (qErr || !quote) {
      console.log('[v0] buildContractReviewDraft: quote not found', qErr?.message)
      return { ok: false, error: 'Quote not found.' }
    }

    // Load systems + PPM pricing for this quote.
    const { data: systems } = await supabase
      .from('quote_systems')
      .select('*')
      .eq('quote_id', quoteId)
      .order('position')
    const systemList = systems ?? []
    const systemIds = systemList.map((s) => s.id as string)

    // Only entirely-Routine-Maintenance quotes generate a contract review
    // (ignoring empty systems). Classify from the systems + their line content
    // rather than the persisted quote_type, which can be stale.
    const contentSystemIds = new Set<string>()
    if (systemIds.length > 0) {
      const { data: lineRows } = await supabase
        .from('quote_line_items')
        .select('system_id')
        .eq('quote_id', quoteId)
      for (const l of (lineRows ?? []) as { system_id: string | null }[]) {
        if (l.system_id) contentSystemIds.add(l.system_id)
      }
    }
    const maintenanceOnly = isRoutineMaintenanceOnly(
      systemList.map((s) => ({
        work_type: s.work_type as string | null,
        hasContent: contentSystemIds.has(s.id as string),
      })),
    )
    if (!maintenanceOnly) {
      return { ok: true, skipped: true }
    }

    const ppmBySystem = new Map<string, Record<string, unknown>>()
    if (systemIds.length > 0) {
      const { data: ppms } = await supabase
        .from('quote_system_ppm')
        .select('*')
        .in('quote_system_id', systemIds)
      for (const p of ppms ?? []) {
        ppmBySystem.set(p.quote_system_id as string, p as Record<string, unknown>)
      }
    }

    const { data: { user } } = await supabase.auth.getUser()

    // --- Client item ---
    const clientLinkedId: string | null = quote.client_id ?? null
    let clientSuggested: BestMatch = { id: null, confidence: 0 }
    if (!clientLinkedId) {
      const { data: clients } = await supabase.from('clients').select('id, name')
      clientSuggested = bestMatch(
        quote.prospect_name ?? quote.title ?? '',
        (clients ?? []).map((c) => ({ id: c.id as string, text: c.name as string })),
      )
    }
    const clientCreatePayload = {
      name: quote.prospect_name || quote.title || 'New client',
      contact_name: quote.prospect_contact || null,
      contact_email: quote.prospect_email || null,
      contact_phone: quote.prospect_phone || null,
      address: quote.prospect_address || null,
    }

    // --- Site item ---
    const siteLinkedId: string | null = quote.site_id ?? null
    let siteSuggested: BestMatch = { id: null, confidence: 0 }
    // Existing systems/services for a linked site power system/service matching.
    let existingSystems: { id: string; system_type_id: string | null; name: string }[] = []
    let existingServices: { id: string; service_type_id: string; site_system_id: string | null }[] =
      []
    if (!siteLinkedId) {
      const { data: sites } = await supabase.from('sites').select('id, name, postcode, address')
      siteSuggested = bestMatch(
        `${quote.prospect_name ?? ''} ${quote.prospect_address ?? ''}`.trim() || quote.title,
        (sites ?? []).map((s) => ({
          id: s.id as string,
          text: `${s.name ?? ''} ${s.postcode ?? ''} ${s.address ?? ''}`.trim(),
        })),
      )
    } else {
      const { data: sysRows } = await supabase
        .from('site_systems')
        .select('id, system_type_id, name')
        .eq('site_id', siteLinkedId)
      existingSystems = (sysRows ?? []) as typeof existingSystems
      const { data: svcRows } = await supabase
        .from('site_services')
        .select('id, service_type_id, site_system_id')
        .eq('site_id', siteLinkedId)
      existingServices = (svcRows ?? []) as typeof existingServices
    }
    const siteCreatePayload = {
      name: quote.prospect_name || quote.title || 'New site',
      address: quote.prospect_address || '',
      postcode: null as string | null,
      contact_name: quote.prospect_contact || null,
      contact_email: quote.prospect_email || null,
      contact_phone: quote.prospect_phone || null,
    }

    const items: ItemDraft[] = []
    let pos = 0

    items.push({
      entity_type: 'client',
      action: clientLinkedId ? 'link' : clientSuggested.confidence >= MATCH_THRESHOLD ? 'link' : 'create',
      linked_id: clientLinkedId,
      suggested_id: clientLinkedId ? null : clientSuggested.id,
      match_confidence: clientLinkedId ? null : clientSuggested.confidence,
      local_key: 'client',
      parent_key: null,
      payload: clientCreatePayload,
      source_quote_system_id: null,
      position: pos++,
    })

    items.push({
      entity_type: 'site',
      action: siteLinkedId ? 'link' : siteSuggested.confidence >= MATCH_THRESHOLD ? 'link' : 'create',
      linked_id: siteLinkedId,
      suggested_id: siteLinkedId ? null : siteSuggested.id,
      match_confidence: siteLinkedId ? null : siteSuggested.confidence,
      local_key: 'site',
      parent_key: 'client',
      payload: siteCreatePayload,
      source_quote_system_id: null,
      position: pos++,
    })

    // --- System / Service / Charge items per quote system ---
    for (const sys of systemList) {
      const ppm = ppmBySystem.get(sys.id as string)
      // Only maintenance-bearing systems (have a PPM calc or a service type).
      const isMaintenance = !!ppm || !!sys.service_type_id
      if (!isMaintenance) continue

      const sysKey = `system:${sys.id}`
      const svcKey = `service:${sys.id}`
      const chargeKey = `charge:${sys.id}`

      // System match within a linked site by system type.
      let sysSuggested: BestMatch = { id: null, confidence: 0 }
      if (siteLinkedId && sys.system_type_id) {
        const sameType = existingSystems.filter((e) => e.system_type_id === sys.system_type_id)
        if (sameType.length === 1) {
          sysSuggested = { id: sameType[0].id, confidence: 1 }
        } else if (sameType.length > 1) {
          sysSuggested = bestMatch(
            sys.system_name as string,
            sameType.map((e) => ({ id: e.id, text: e.name })),
          )
        }
      }
      items.push({
        entity_type: 'system',
        action: sysSuggested.confidence >= MATCH_THRESHOLD ? 'link' : 'create',
        linked_id: null,
        suggested_id: sysSuggested.id,
        match_confidence: sysSuggested.id ? sysSuggested.confidence : null,
        local_key: sysKey,
        parent_key: 'site',
        payload: {
          name: sys.system_name || 'System',
          system_type_id: sys.system_type_id ?? null,
          description: sys.specification || null,
        },
        source_quote_system_id: sys.id as string,
        position: pos++,
      })

      // Service (site_service) for this system's service type.
      const numVisits = Number(ppm?.num_visits ?? 1)
      const months = monthsFromVisits(numVisits)
      let svcSuggested: BestMatch = { id: null, confidence: 0 }
      if (siteLinkedId && sys.service_type_id && sysSuggested.id) {
        const sameSvc = existingServices.filter(
          (e) => e.service_type_id === sys.service_type_id && e.site_system_id === sysSuggested.id,
        )
        if (sameSvc.length >= 1) svcSuggested = { id: sameSvc[0].id, confidence: 1 }
      }
      items.push({
        entity_type: 'service',
        action: svcSuggested.confidence >= MATCH_THRESHOLD ? 'link' : 'create',
        linked_id: null,
        suggested_id: svcSuggested.id,
        match_confidence: svcSuggested.id ? svcSuggested.confidence : null,
        local_key: svcKey,
        parent_key: sysKey,
        payload: {
          service_type_id: sys.service_type_id ?? null,
          frequency_value: months,
          frequency_unit: 'months',
          frequency_months: months,
          worker_type: 'cdo',
          subcontractor_id: null,
          subcontractor_annual_cost_pence: null,
        },
        source_quote_system_id: sys.id as string,
        position: pos++,
      })

      // Recurring charge from the PPM price (annualised).
      const pricePence = Number(ppm?.computed_price_pence ?? sys.subtotal_pence ?? 0)
      items.push({
        entity_type: 'charge',
        action: 'create',
        linked_id: null,
        suggested_id: null,
        match_confidence: null,
        local_key: chargeKey,
        parent_key: svcKey,
        payload: {
          description: `${sys.system_name || 'Maintenance'} — routine maintenance`,
          unit_price_pence: pricePence,
          quantity: 1,
          frequency: chargeFrequencyFromMonths(months),
          price_basis: 'per_period',
          is_subcontracted: false,
          subcontract_price_pence: null,
        },
        source_quote_system_id: sys.id as string,
        position: pos++,
      })
    }

    // Create the review + items.
    const { data: review, error: crErr } = await supabase
      .from('contract_reviews')
      .insert({ quote_id: quoteId, status: 'draft', created_by: user?.id ?? null })
      .select('id')
      .single()
    if (crErr || !review) {
      console.log('[v0] buildContractReviewDraft: could not create review', crErr?.message)
      return { ok: false, error: 'Could not create contract review.' }
    }

    const rows = items.map((it) => ({ ...it, review_id: review.id }))
    const { error: itErr } = await supabase.from('contract_review_items').insert(rows)
    if (itErr) {
      console.log('[v0] buildContractReviewDraft: could not insert items', itErr.message)
      // Roll back the header so the next accept can retry cleanly.
      await supabase.from('contract_reviews').delete().eq('id', review.id)
      return { ok: false, error: 'Could not create contract review items.' }
    }

    return { ok: true, reviewId: review.id as string }
  } catch (e) {
    console.log('[v0] buildContractReviewDraft: unexpected error', (e as Error).message)
    return { ok: false, error: 'Unexpected error building contract review.' }
  }
}
