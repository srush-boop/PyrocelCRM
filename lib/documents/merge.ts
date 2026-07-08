import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { formatPence } from '@/lib/sales'
import type { CompanyInfo, DocumentOwnerType } from '@/lib/types/database'

// A flat token->value map (values already formatted for display).
export type MergeTokenMap = Record<string, string>

export interface MergeContext {
  tokens: MergeTokenMap
  // Best-guess recipient for emailing (client/site contact), if resolvable.
  recipientEmail: string | null
  recipientName: string | null
  // Company branding used for the letterhead.
  company: CompanyInfo | null
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function companyTokens(company: CompanyInfo | null): MergeTokenMap {
  return {
    'company.name': company?.name ?? '',
    'company.address': company?.address ?? '',
    'company.phone': company?.phone ?? '',
    'company.email': company?.email ?? '',
    'company.website': company?.website ?? '',
    'company.registration_number': company?.registration_number ?? '',
    'company.vat_number': company?.vat_number ?? '',
  }
}

/**
 * Render a template body by substituting {{tokens}} and resolving simple
 * conditional sections {{#token}}...{{/token}} (kept only when the token has a
 * non-empty value). Unknown/empty tokens collapse to an empty string.
 */
export function renderTemplate(body: string, tokens: MergeTokenMap): string {
  if (!body) return ''
  // 1) Conditional sections: {{#token}}inner{{/token}}
  let out = body.replace(
    /\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_m, token: string, inner: string) => {
      const val = tokens[token]
      return val && val.trim() !== '' ? inner : ''
    },
  )
  // 2) Plain tokens: {{token}}
  out = out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, token: string) => {
    const val = tokens[token]
    return val != null ? val : ''
  })
  return out
}

/**
 * Load a flat merge-token map for the given entity, resolving up to its related
 * client and site where possible. Also returns a best-guess recipient email so
 * the Create-Document dialog can pre-fill the "email to client" field.
 *
 * Server-only. Relies on RLS for access control (office/admin).
 */
export async function loadMergeContext(
  ownerType: DocumentOwnerType,
  ownerId: string,
  sender?: { name?: string | null; email?: string | null },
): Promise<MergeContext> {
  const supabase = await createClient()

  const { data: company } = await supabase.from('company_info').select('*').limit(1).maybeSingle()
  const companyInfo = (company ?? null) as CompanyInfo | null

  const tokens: MergeTokenMap = {
    ...companyTokens(companyInfo),
    today: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    'user.name': sender?.name ?? '',
    'user.email': sender?.email ?? '',
  }

  let clientId: string | null = null
  let siteId: string | null = null
  let recipientEmail: string | null = null
  let recipientName: string | null = null

  // Resolve the primary entity, collecting client/site ids to expand below.
  if (ownerType === 'client') {
    clientId = ownerId
  } else if (ownerType === 'site') {
    siteId = ownerId
  } else if (ownerType === 'site_service') {
    const { data: ss } = await supabase
      .from('site_services')
      .select(
        'id, site_id, frequency_value, frequency_unit, next_service_date, service_type:service_types!site_services_service_type_id_fkey(name), system:site_systems!site_services_site_system_id_fkey(name)',
      )
      .eq('id', ownerId)
      .maybeSingle()
    if (ss) {
      siteId = (ss as { site_id: string | null }).site_id
      const svc = ss as {
        frequency_value: number | null
        frequency_unit: string | null
        next_service_date: string | null
        service_type?: { name?: string | null } | null
        system?: { name?: string | null } | null
      }
      tokens['system.name'] = svc.system?.name || svc.service_type?.name || ''
      tokens['system.frequency'] =
        svc.frequency_value && svc.frequency_unit ? `every ${svc.frequency_value} ${svc.frequency_unit}` : ''
      tokens['system.next_service_date'] = fmtDate(svc.next_service_date)
    }
  } else if (ownerType === 'task') {
    const { data: t } = await supabase
      .from('tasks')
      .select(
        'id, client_id, site_id, scheduled_date, status, service_type:service_types!tasks_service_type_id_fkey(name)',
      )
      .eq('id', ownerId)
      .maybeSingle()
    if (t) {
      const task = t as {
        client_id: string | null
        site_id: string | null
        scheduled_date: string | null
        status: string | null
        service_type?: { name?: string | null } | null
      }
      clientId = task.client_id
      siteId = task.site_id
      tokens['call.reference'] = String(ownerId).slice(0, 8).toUpperCase()
      tokens['call.date'] = fmtDate(task.scheduled_date)
      tokens['call.status'] = task.status ?? ''
      tokens['call.type'] = task.service_type?.name ?? ''
    }
  } else if (ownerType === 'quote') {
    const { data: q } = await supabase
      .from('quotes')
      .select(
        'id, quote_number, reference, title, total_pence, currency, valid_until, client_id, site_id, prospect_contact, prospect_email, prospect_name',
      )
      .eq('id', ownerId)
      .maybeSingle()
    if (q) {
      const quote = q as {
        quote_number: string | null
        reference: string | null
        title: string | null
        total_pence: number | null
        currency: string | null
        valid_until: string | null
        client_id: string | null
        site_id: string | null
        prospect_contact: string | null
        prospect_email: string | null
        prospect_name: string | null
      }
      clientId = quote.client_id
      siteId = quote.site_id
      tokens['quote.number'] = quote.reference || quote.quote_number || ''
      tokens['quote.title'] = quote.title ?? ''
      tokens['quote.total'] = formatPence(quote.total_pence ?? 0, quote.currency || 'GBP')
      tokens['quote.valid_until'] = fmtDate(quote.valid_until)
      // Prospect quotes (no client record) carry their own contact.
      if (!clientId && quote.prospect_email) {
        recipientEmail = quote.prospect_email
        recipientName = quote.prospect_contact || quote.prospect_name || null
      }
    }
  } else if (ownerType === 'job') {
    const { data: j } = await supabase
      .from('jobs')
      .select('id, job_number, title, po_number, quoted_total_pence, client_id, site_id')
      .eq('id', ownerId)
      .maybeSingle()
    if (j) {
      const job = j as {
        job_number: string | null
        title: string | null
        po_number: string | null
        quoted_total_pence: number | null
        client_id: string | null
        site_id: string | null
      }
      clientId = job.client_id
      siteId = job.site_id
      tokens['job.number'] = job.job_number ?? ''
      tokens['job.title'] = job.title ?? ''
      tokens['job.po_number'] = job.po_number ?? ''
      tokens['job.total'] = formatPence(job.quoted_total_pence ?? 0, 'GBP')
    }
  }

  // Expand the site (also backfills client_id if we only had a site).
  if (siteId) {
    const { data: s } = await supabase
      .from('sites')
      .select('id, name, address, postcode, contact_name, contact_email, contact_phone, client_id')
      .eq('id', siteId)
      .maybeSingle()
    if (s) {
      const site = s as {
        name: string | null
        address: string | null
        postcode: string | null
        contact_name: string | null
        contact_email: string | null
        contact_phone: string | null
        client_id: string | null
      }
      tokens['site.name'] = site.name ?? ''
      tokens['site.address'] = site.address ?? ''
      tokens['site.postcode'] = site.postcode ?? ''
      tokens['site.contact_name'] = site.contact_name ?? ''
      tokens['site.contact_email'] = site.contact_email ?? ''
      tokens['site.contact_phone'] = site.contact_phone ?? ''
      if (!clientId) clientId = site.client_id
      if (!recipientEmail && site.contact_email) {
        recipientEmail = site.contact_email
        recipientName = site.contact_name
      }
    }
  }

  // Expand the client (preferred recipient).
  if (clientId) {
    const { data: c } = await supabase
      .from('clients')
      .select('id, name, contact_name, contact_email, contact_phone, address')
      .eq('id', clientId)
      .maybeSingle()
    if (c) {
      const client = c as {
        name: string | null
        contact_name: string | null
        contact_email: string | null
        contact_phone: string | null
        address: string | null
      }
      tokens['client.name'] = client.name ?? ''
      tokens['client.contact_name'] = client.contact_name ?? ''
      tokens['client.contact_email'] = client.contact_email ?? ''
      tokens['client.contact_phone'] = client.contact_phone ?? ''
      tokens['client.address'] = client.address ?? ''
      if (client.contact_email) {
        recipientEmail = client.contact_email
        recipientName = client.contact_name || client.name
      }
    }
  }

  return { tokens, recipientEmail, recipientName, company: companyInfo }
}
