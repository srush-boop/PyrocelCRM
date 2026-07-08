import type { SupabaseClient } from '@supabase/supabase-js'
import { nextJobNumber } from '@/lib/jobs/number'

/**
 * Create a Job from an accepted quote.
 *
 * Design notes:
 * - **Idempotent**: if a job already exists for this quote it is returned as-is,
 *   so double-accepts / retries never create duplicates.
 * - **Remedial quotes are skipped**: they raise remedial calls (see
 *   `lib/remedial.ts`), not delivery jobs.
 * - **Prospect quotes** (no client/site) auto-create a client + site (status
 *   `new`) and copy the won systems onto the new site so it reflects the sale.
 * - **Never throws**: any failure is logged and returned as `{ ok: false }` so
 *   quote acceptance is never blocked by job creation.
 *
 * Uses the caller's (RLS-scoped, staff) Supabase client — mirrors
 * `createRemedialCallsForQuote`.
 */
export async function createJobForAcceptedQuote(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<{ ok: boolean; jobId?: string; error?: string }> {
  try {
    // Idempotency guard: bail if a job already exists for this quote.
    const { data: existing } = await supabase
      .from('jobs')
      .select('id')
      .eq('quote_id', quoteId)
      .maybeSingle()
    if (existing?.id) return { ok: true, jobId: existing.id as string }

    // Load the quote header.
    const { data: quote, error: qErr } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', quoteId)
      .single()
    if (qErr || !quote) {
      console.log('[v0] createJobForAcceptedQuote: quote not found', qErr?.message)
      return { ok: false, error: 'Quote not found.' }
    }

    // Remedial quotes become calls, not jobs.
    if (quote.quote_type === 'remedial') {
      return { ok: true }
    }

    // ----- Financial snapshot (pence) -----
    const { data: lineItems } = await supabase
      .from('quote_line_items')
      .select('quantity, unit_cost_pence')
      .eq('quote_id', quoteId)
    const quotedCostPence = (lineItems ?? []).reduce(
      (sum, l) => sum + Math.round((l.unit_cost_pence ?? 0) * (l.quantity ?? 0)),
      0,
    )

    // ----- Resolve client + site (create for prospect quotes) -----
    let clientId: string | null = quote.client_id ?? null
    let siteId: string | null = quote.site_id ?? null

    if (!clientId || !siteId) {
      const resolved = await resolveProspectClientAndSite(supabase, quote)
      clientId = resolved.clientId
      siteId = resolved.siteId
    }

    // ----- Owner / department -----
    const ownerId: string | null = quote.created_by ?? null
    let departmentId: string | null = null
    if (ownerId) {
      const { data: ownerProfile } = await supabase
        .from('profiles')
        .select('department_id')
        .eq('id', ownerId)
        .maybeSingle()
      departmentId = (ownerProfile as { department_id?: string | null } | null)?.department_id ?? null
    }

    // ----- Insert the job (retry once on job_number collision) -----
    const baseRow = {
      quote_id: quoteId,
      client_id: clientId,
      site_id: siteId,
      branch_id: quote.branch_id ?? null,
      title: quote.title ?? 'Untitled job',
      stage: 'contract_review' as const,
      status: 'open' as const,
      owner_id: ownerId,
      department_id: departmentId,
      quoted_total_pence: quote.total_pence ?? 0,
      quoted_cost_pence: quotedCostPence,
      quoted_subtotal_pence: quote.subtotal_pence ?? 0,
      quoted_vat_pence: quote.vat_pence ?? 0,
      po_number: quote.po_number ?? null,
      created_by: ownerId,
    }

    let jobId: string | null = null
    for (let attempt = 0; attempt < 2 && !jobId; attempt++) {
      const jobNumber = await nextJobNumber(supabase)
      const { data: inserted, error: insErr } = await supabase
        .from('jobs')
        .insert({ ...baseRow, job_number: jobNumber })
        .select('id')
        .single()
      if (inserted?.id) {
        jobId = inserted.id as string
        break
      }
      // Unique violation on job_number → loop and recompute. Any other error is fatal.
      if (insErr && insErr.code !== '23505') {
        console.log('[v0] createJobForAcceptedQuote: insert error', insErr.message)
        return { ok: false, error: 'Could not create the job.' }
      }
    }
    if (!jobId) {
      console.log('[v0] createJobForAcceptedQuote: could not allocate a job number')
      return { ok: false, error: 'Could not allocate a job number.' }
    }

    // Initial history entry.
    await supabase.from('job_status_history').insert({
      job_id: jobId,
      from_stage: null,
      to_stage: 'contract_review',
      note: 'Job created from accepted quote.',
      changed_by: ownerId,
    })

    return { ok: true, jobId }
  } catch (err) {
    console.log('[v0] createJobForAcceptedQuote: unexpected error', (err as Error).message)
    return { ok: false, error: 'Unexpected error creating the job.' }
  }
}

/**
 * For a prospect quote (no linked client/site), create a client and a site
 * (status `new`) from the prospect details, then copy the quote's systems onto
 * the new site so it reflects the won work. Returns whatever ids it manages to
 * create (nulls if creation fails — the job is still created, just unlinked).
 */
async function resolveProspectClientAndSite(
  supabase: SupabaseClient,
  quote: {
    id: string
    client_id: string | null
    site_id: string | null
    branch_id: string | null
    prospect_name: string | null
    prospect_contact: string | null
    prospect_email: string | null
    prospect_phone: string | null
    prospect_address: string | null
    title: string
  },
): Promise<{ clientId: string | null; siteId: string | null }> {
  let clientId = quote.client_id ?? null
  let siteId = quote.site_id ?? null

  // Create the client if missing.
  if (!clientId) {
    const { data: client, error: cErr } = await supabase
      .from('clients')
      .insert({
        name: quote.prospect_name?.trim() || quote.title || 'New client',
        contact_name: quote.prospect_contact ?? null,
        contact_email: quote.prospect_email ?? null,
        contact_phone: quote.prospect_phone ?? null,
        address: quote.prospect_address ?? null,
        notes: 'Created automatically from an accepted prospect quote.',
      })
      .select('id')
      .single()
    if (cErr || !client) {
      console.log('[v0] resolveProspectClientAndSite: client insert failed', cErr?.message)
      return { clientId: null, siteId: null }
    }
    clientId = client.id as string
  }

  // Create the site (status 'new') if missing.
  if (!siteId) {
    const { data: site, error: sErr } = await supabase
      .from('sites')
      .insert({
        name: quote.prospect_name?.trim() || quote.title || 'New site',
        client_id: clientId,
        address: quote.prospect_address ?? '',
        contact_name: quote.prospect_contact ?? null,
        contact_email: quote.prospect_email ?? null,
        contact_phone: quote.prospect_phone ?? null,
        branch_id: quote.branch_id ?? null,
        status: 'new',
        notes: 'Created automatically from an accepted prospect quote.',
      })
      .select('id')
      .single()
    if (sErr || !site) {
      console.log('[v0] resolveProspectClientAndSite: site insert failed', sErr?.message)
      return { clientId, siteId: null }
    }
    siteId = site.id as string

    // Copy the won quote's systems onto the new site so it reflects the sale.
    const { data: systems } = await supabase
      .from('quote_systems')
      .select('system_name, system_type_id, specification, position')
      .eq('quote_id', quote.id)
      .order('position', { ascending: true })
    if (systems && systems.length > 0) {
      const rows = systems.map((s, i) => ({
        site_id: siteId,
        system_type_id: s.system_type_id ?? null,
        name: s.system_name ?? `System ${i + 1}`,
        description: s.specification ?? null,
        active: true,
        position: s.position ?? i,
      }))
      const { error: ssErr } = await supabase.from('site_systems').insert(rows)
      if (ssErr) {
        console.log('[v0] resolveProspectClientAndSite: site_systems insert failed', ssErr.message)
      }
    }
  }

  return { clientId, siteId }
}
