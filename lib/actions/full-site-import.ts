'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  FULL_SITE_COLUMNS,
  parseFullSiteRow,
  normaliseStatus,
  lc,
  type SheetRow,
} from '@/lib/bulk-data/full-site'
import { buildSeedTaskRows, fetchVisitsByServiceType } from '@/lib/scheduling'

type Supa = Awaited<ReturnType<typeof createClient>>

async function requireAdmin(): Promise<{ supabase?: Supa; userId?: string; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if ((profile as { role?: string } | null)?.role !== 'admin')
    return { error: 'Only administrators can use bulk data tools.' }
  return { supabase, userId: user.id }
}

const VALID_FREQUENCY_UNITS = new Set(['weeks', 'months'])
const VALID_WORKER_TYPES = new Set(['cdo', 'engineer'])
const VALID_CHARGE_FREQUENCIES = new Set(['weekly', 'monthly', 'quarterly', 'biannual', 'annual'])
const VALID_CHARGE_TIMINGS = new Set(['advance', 'arrears', 'on_completion', 'per_visit'])

interface ChargeInput {
  description: string
  unitPricePence: number
  frequency: string
  timing: string
  quantity: number
}

interface ServiceInput {
  rowNumber: number
  serviceTypeId: string
  serviceTypeName: string
  frequencyValue: number
  frequencyUnit: 'weeks' | 'months'
  workerType: string
  isRecurring: boolean
  charge?: ChargeInput
}

interface SystemInput {
  key: string
  name: string
  systemTypeId: string | null
  location: string | null
  services: ServiceInput[]
}

interface SiteInput {
  key: string
  name: string
  address: string
  postcode: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  status: 'live' | 'new' | 'dead'
  billingKey: string
  systems: Map<string, SystemInput>
}

interface BillingInput {
  key: string
  name: string
  sageRef: string | null
  invoiceEmail: string | null
  invoiceAddress: string | null
  invoicePostcode: string | null
  paymentTermsDays: number | null
}

interface ClientInput {
  key: string
  name: string
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  address: string | null
  status: 'live' | 'new' | 'dead'
  billing: Map<string, BillingInput>
  sites: Map<string, SiteInput>
}

interface ServiceTypeMeta {
  id: string
  isRecurring: boolean
  defaultFrequencyValue: number
  defaultFrequencyUnit: 'weeks' | 'months'
  defaultWorkerType: string
}

function str(v: unknown): string | null {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}

/**
 * Parse + resolve + group the uploaded rows into a nested client→…→charge graph.
 * FK names (service type, system type) are resolved to ids here. Rows with
 * blocking issues are excluded from the graph and reported separately.
 */
async function buildGraph(
  supabase: Supa,
  rows: SheetRow[],
): Promise<{
  clients: Map<string, ClientInput>
  rowIssues: { rowNumber: number; issues: string[] }[]
  validRowCount: number
}> {
  // FK lookup maps.
  const { data: serviceTypeData } = await supabase
    .from('service_types')
    .select('id, name, is_recurring, default_frequency_value, default_frequency_unit, default_worker_type')
  const serviceTypeMap = new Map<string, ServiceTypeMeta>()
  for (const st of (serviceTypeData as Record<string, unknown>[] | null) ?? []) {
    serviceTypeMap.set(lc(st.name), {
      id: String(st.id),
      isRecurring: st.is_recurring !== false,
      defaultFrequencyValue: Number(st.default_frequency_value ?? 12),
      defaultFrequencyUnit: (st.default_frequency_unit as 'weeks' | 'months') ?? 'months',
      defaultWorkerType: String(st.default_worker_type ?? 'cdo'),
    })
  }

  const { data: systemTypeData } = await supabase
    .from('system_types')
    .select('id, name, requires_recurring_visits')
  const systemTypeMap = new Map<string, { id: string; requiresRecurringVisits: boolean }>()
  for (const st of (systemTypeData as Record<string, unknown>[] | null) ?? []) {
    systemTypeMap.set(lc(st.name), {
      id: String(st.id),
      requiresRecurringVisits: st.requires_recurring_visits !== false,
    })
  }

  const clients = new Map<string, ClientInput>()
  const rowIssues: { rowNumber: number; issues: string[] }[] = []
  let validRowCount = 0

  rows.forEach((raw, i) => {
    const rowNumber = i + 2 // header row + 1-based
    const { values, issues } = parseFullSiteRow(raw, rowNumber)

    // Resolve service type (required).
    const serviceTypeName = str(values['service_type'])
    let serviceMeta: ServiceTypeMeta | undefined
    if (serviceTypeName) {
      serviceMeta = serviceTypeMap.get(lc(serviceTypeName))
      if (!serviceMeta) issues.push(`service type "${serviceTypeName}" not found`)
    }

    // Resolve system type (optional).
    const systemTypeName = str(values['system_type'])
    let systemTypeId: string | null = null
    let systemRequiresVisits = true
    if (systemTypeName) {
      const match = systemTypeMap.get(lc(systemTypeName))
      if (!match) {
        issues.push(`system type "${systemTypeName}" not found`)
      } else {
        systemTypeId = match.id
        systemRequiresVisits = match.requiresRecurringVisits
      }
    }

    // Validate enums where provided.
    const freqUnit = (str(values['service_frequency_unit']) ?? '').toLowerCase()
    if (freqUnit && !VALID_FREQUENCY_UNITS.has(freqUnit))
      issues.push(`service_frequency_unit must be weeks or months`)
    const workerType = (str(values['service_worker_type']) ?? '').toLowerCase()
    if (workerType && !VALID_WORKER_TYPES.has(workerType))
      issues.push(`service_worker_type must be cdo or engineer`)

    const chargeDescription = str(values['charge_description'])
    const chargeFreq = (str(values['charge_frequency']) ?? 'annual').toLowerCase()
    const chargeTiming = (str(values['charge_timing']) ?? 'arrears').toLowerCase()
    if (chargeDescription) {
      if (!VALID_CHARGE_FREQUENCIES.has(chargeFreq))
        issues.push(`charge_frequency "${chargeFreq}" is invalid`)
      if (!VALID_CHARGE_TIMINGS.has(chargeTiming))
        issues.push(`charge_timing "${chargeTiming}" is invalid`)
    }

    if (issues.length > 0) {
      rowIssues.push({ rowNumber, issues })
      return
    }
    validRowCount += 1
    // From here everything required is present + resolved.
    const meta = serviceMeta!

    // ----- Client -----
    const clientName = String(values['client_name']).trim()
    const clientKey = lc(clientName)
    let client = clients.get(clientKey)
    if (!client) {
      client = {
        key: clientKey,
        name: clientName,
        contactName: str(values['client_contact_name']),
        contactEmail: str(values['client_contact_email']),
        contactPhone: str(values['client_contact_phone']),
        address: str(values['client_address']),
        status: normaliseStatus(values['client_status']),
        billing: new Map(),
        sites: new Map(),
      }
      clients.set(clientKey, client)
    }

    // ----- Billing account (per client) -----
    const billingName = str(values['billing_account_name']) ?? clientName
    const billingKey = lc(billingName)
    if (!client.billing.has(billingKey)) {
      client.billing.set(billingKey, {
        key: billingKey,
        name: billingName,
        sageRef: str(values['billing_sage_ref']),
        invoiceEmail: str(values['billing_invoice_email']),
        invoiceAddress: str(values['billing_invoice_address']),
        invoicePostcode: str(values['billing_invoice_postcode']),
        paymentTermsDays:
          values['billing_payment_terms_days'] != null
            ? Number(values['billing_payment_terms_days'])
            : null,
      })
    }

    // ----- Site (per client) -----
    const siteName = String(values['site_name']).trim()
    const siteKey = lc(siteName)
    let site = client.sites.get(siteKey)
    if (!site) {
      site = {
        key: siteKey,
        name: siteName,
        address: String(values['site_address']).trim(),
        postcode: str(values['site_postcode']),
        contactName: str(values['site_contact_name']),
        contactEmail: str(values['site_contact_email']),
        contactPhone: str(values['site_contact_phone']),
        status: normaliseStatus(values['site_status']),
        billingKey,
        systems: new Map(),
      }
      client.sites.set(siteKey, site)
    }

    // ----- System (per site) -----
    const systemName = String(values['system_name']).trim()
    const systemKey = lc(systemName)
    let system = site.systems.get(systemKey)
    if (!system) {
      system = {
        key: systemKey,
        name: systemName,
        systemTypeId,
        location: str(values['system_location']),
        services: [],
      }
      site.systems.set(systemKey, system)
    }

    // ----- Service -----
    const isRecurring = meta.isRecurring && systemRequiresVisits
    const charge: ChargeInput | undefined = chargeDescription
      ? {
          description: chargeDescription,
          unitPricePence: Number(values['charge_amount_gbp'] ?? 0),
          frequency: chargeFreq,
          timing: chargeTiming,
          quantity: values['charge_quantity'] != null ? Number(values['charge_quantity']) : 1,
        }
      : undefined

    system.services.push({
      rowNumber,
      serviceTypeId: meta.id,
      serviceTypeName: serviceTypeName!,
      frequencyValue:
        values['service_frequency_value'] != null
          ? Number(values['service_frequency_value'])
          : meta.defaultFrequencyValue,
      frequencyUnit: (freqUnit as 'weeks' | 'months') || meta.defaultFrequencyUnit,
      workerType: workerType || meta.defaultWorkerType,
      isRecurring,
      charge,
    })
  })

  return { clients, rowIssues, validRowCount }
}

export interface FullSiteSitePreview {
  client: string
  clientNew: boolean
  site: string
  siteNew: boolean
  status: string
  systems: number
  services: number
  charges: number
  seedsCalls: boolean
  duplicateServices: number
}

export interface FullSitePreview {
  ok: boolean
  error?: string
  rowIssues: { rowNumber: number; issues: string[] }[]
  validRowCount: number
  skipRowCount: number
  counts: {
    clientsNew: number
    billingNew: number
    sitesNew: number
    systemsNew: number
    servicesNew: number
    chargesNew: number
    servicesSeeding: number
    duplicateServices: number
  }
  // Human-readable duplicate warnings: which service/system/site would be
  // created again because an identical service already exists.
  duplicateWarnings: string[]
  sites: FullSiteSitePreview[]
}

/** Build maps of existing records for new/existing classification. */
async function loadExisting(supabase: Supa) {
  const { data: clientRows } = await supabase.from('clients').select('id, name')
  const clientByName = new Map<string, string>()
  for (const c of (clientRows as Record<string, unknown>[] | null) ?? [])
    clientByName.set(lc(c.name), String(c.id))

  const { data: siteRows } = await supabase.from('sites').select('id, client_id, name')
  const siteByKey = new Map<string, string>() // clientId::lc(name)
  for (const s of (siteRows as Record<string, unknown>[] | null) ?? [])
    siteByKey.set(`${s.client_id}::${lc(s.name)}`, String(s.id))

  const { data: billingRows } = await supabase.from('billing_accounts').select('id, client_id, name')
  const billingByKey = new Map<string, string>()
  for (const b of (billingRows as Record<string, unknown>[] | null) ?? [])
    billingByKey.set(`${b.client_id}::${lc(b.name)}`, String(b.id))

  const { data: systemRows } = await supabase.from('site_systems').select('id, site_id, name')
  const systemByKey = new Map<string, string>()
  for (const s of (systemRows as Record<string, unknown>[] | null) ?? [])
    systemByKey.set(`${s.site_id}::${lc(s.name)}`, String(s.id))

  // Existing services keyed by systemId::serviceTypeId so we can warn when an
  // import row would duplicate a service that already exists on that system.
  const { data: serviceRows } = await supabase
    .from('site_services')
    .select('site_system_id, service_type_id')
  const serviceKeys = new Set<string>()
  for (const s of (serviceRows as Record<string, unknown>[] | null) ?? []) {
    if (s.site_system_id && s.service_type_id)
      serviceKeys.add(`${s.site_system_id}::${s.service_type_id}`)
  }

  return { clientByName, siteByKey, billingByKey, systemByKey, serviceKeys }
}

/** Validate an uploaded full-site sheet and report what would be created. */
export async function previewFullSiteImport(rows: SheetRow[]): Promise<FullSitePreview> {
  const empty: FullSitePreview = {
    ok: false,
    rowIssues: [],
    validRowCount: 0,
    skipRowCount: 0,
    counts: { clientsNew: 0, billingNew: 0, sitesNew: 0, systemsNew: 0, servicesNew: 0, chargesNew: 0, servicesSeeding: 0, duplicateServices: 0 },
    duplicateWarnings: [],
    sites: [],
  }
  const { supabase, error } = await requireAdmin()
  if (error || !supabase) return { ...empty, error: error ?? 'Not authorised.' }
  if (!Array.isArray(rows) || rows.length === 0)
    return { ...empty, error: 'The file has no rows.' }

  const { clients, rowIssues, validRowCount } = await buildGraph(supabase, rows)
  const existing = await loadExisting(supabase)

  const counts = { clientsNew: 0, billingNew: 0, sitesNew: 0, systemsNew: 0, servicesNew: 0, chargesNew: 0, servicesSeeding: 0, duplicateServices: 0 }
  const duplicateWarnings: string[] = []
  const sitesOut: FullSiteSitePreview[] = []

  for (const client of clients.values()) {
    const existingClientId = existing.clientByName.get(client.key) ?? null
    const clientNew = !existingClientId
    if (clientNew) counts.clientsNew += 1

    for (const billing of client.billing.values()) {
      const billingExists = existingClientId
        ? existing.billingByKey.has(`${existingClientId}::${billing.key}`)
        : false
      if (!billingExists) counts.billingNew += 1
    }

    for (const site of client.sites.values()) {
      const existingSiteId = existingClientId
        ? existing.siteByKey.get(`${existingClientId}::${site.key}`) ?? null
        : null
      const siteNew = !existingSiteId
      if (siteNew) counts.sitesNew += 1

      let systemCount = 0
      let serviceCount = 0
      let chargeCount = 0
      let seeds = false
      let siteDuplicates = 0
      for (const system of site.systems.values()) {
        const existingSystemId = existingSiteId
          ? existing.systemByKey.get(`${existingSiteId}::${system.key}`) ?? null
          : null
        if (!existingSystemId) {
          counts.systemsNew += 1
          systemCount += 1
        }
        for (const service of system.services) {
          counts.servicesNew += 1
          serviceCount += 1
          // Duplicate = the same service type already exists on this exact
          // existing system (only possible when both site + system pre-exist).
          if (
            existingSystemId &&
            existing.serviceKeys.has(`${existingSystemId}::${service.serviceTypeId}`)
          ) {
            counts.duplicateServices += 1
            siteDuplicates += 1
            duplicateWarnings.push(
              `${client.name} → ${site.name} → ${system.name}: "${service.serviceTypeName}" already exists (row ${service.rowNumber})`,
            )
          }
          if (service.charge) {
            counts.chargesNew += 1
            chargeCount += 1
          }
          if (site.status === 'live' && service.isRecurring) {
            counts.servicesSeeding += 1
            seeds = true
          }
        }
      }
      sitesOut.push({
        client: client.name,
        clientNew,
        site: site.name,
        siteNew,
        status: site.status,
        systems: systemCount,
        services: serviceCount,
        charges: chargeCount,
        seedsCalls: seeds,
        duplicateServices: siteDuplicates,
      })
    }
  }

  return {
    ok: true,
    rowIssues,
    validRowCount,
    skipRowCount: rowIssues.length,
    counts,
    duplicateWarnings,
    sites: sitesOut,
  }
}

export interface FullSiteCommitResult {
  ok: boolean
  error?: string
  clientsCreated: number
  billingCreated: number
  sitesCreated: number
  systemsCreated: number
  servicesCreated: number
  chargesCreated: number
  callsSeeded: number
  skipped: number
}

/**
 * Commit the full-site import: match-or-create client → billing account → site
 * → system, always-create services + charges, then seed the first cycle of
 * calls for live sites. Runs top-down so foreign keys resolve. Volumes are
 * small (a site's worth of records), so per-record inserts are fine.
 */
export async function commitFullSiteImport(rows: SheetRow[]): Promise<FullSiteCommitResult> {
  const base: FullSiteCommitResult = {
    ok: false,
    clientsCreated: 0,
    billingCreated: 0,
    sitesCreated: 0,
    systemsCreated: 0,
    servicesCreated: 0,
    chargesCreated: 0,
    callsSeeded: 0,
    skipped: 0,
  }
  const { supabase, userId, error } = await requireAdmin()
  if (error || !supabase) return { ...base, error: error ?? 'Not authorised.' }
  if (!Array.isArray(rows) || rows.length === 0) return { ...base, error: 'The file has no rows.' }

  const { clients, rowIssues } = await buildGraph(supabase, rows)
  base.skipped = rowIssues.length
  const existing = await loadExisting(supabase)

  const startDate = new Date().toISOString().slice(0, 10)
  const result = { ...base, ok: true }

  try {
    for (const client of clients.values()) {
      // ----- Client -----
      let clientId = existing.clientByName.get(client.key) ?? null
      if (!clientId) {
        const { data, error: e } = await supabase
          .from('clients')
          .insert({
            name: client.name,
            contact_name: client.contactName,
            contact_email: client.contactEmail,
            contact_phone: client.contactPhone,
            address: client.address,
            status: client.status,
          })
          .select('id')
          .single()
        if (e) throw new Error(`client "${client.name}": ${e.message}`)
        clientId = String((data as { id: string }).id)
        result.clientsCreated += 1
      }

      // ----- Billing accounts -----
      const billingIdByKey = new Map<string, string>()
      for (const billing of client.billing.values()) {
        const existKey = `${clientId}::${billing.key}`
        let billingId = existing.billingByKey.get(existKey) ?? null
        if (!billingId) {
          const { data, error: e } = await supabase
            .from('billing_accounts')
            .insert({
              client_id: clientId,
              name: billing.name,
              sage_account_ref: billing.sageRef,
              invoice_email: billing.invoiceEmail,
              invoice_address: billing.invoiceAddress,
              invoice_postcode: billing.invoicePostcode,
              payment_terms_days: billing.paymentTermsDays ?? 30,
            })
            .select('id')
            .single()
          if (e) throw new Error(`billing account "${billing.name}": ${e.message}`)
          billingId = String((data as { id: string }).id)
          existing.billingByKey.set(existKey, billingId)
          result.billingCreated += 1
        }
        billingIdByKey.set(billing.key, billingId)
      }

      // ----- Sites -----
      for (const site of client.sites.values()) {
        const siteExistKey = `${clientId}::${site.key}`
        let siteId = existing.siteByKey.get(siteExistKey) ?? null
        const siteBillingId = billingIdByKey.get(site.billingKey) ?? null
        if (!siteId) {
          const { data, error: e } = await supabase
            .from('sites')
            .insert({
              client_id: clientId,
              name: site.name,
              address: site.address,
              postcode: site.postcode,
              contact_name: site.contactName,
              contact_email: site.contactEmail,
              contact_phone: site.contactPhone,
              status: site.status,
              billing_account_id: siteBillingId,
            })
            .select('id')
            .single()
          if (e) throw new Error(`site "${site.name}": ${e.message}`)
          siteId = String((data as { id: string }).id)
          existing.siteByKey.set(siteExistKey, siteId)
          result.sitesCreated += 1
        }

        const siteLive = site.status === 'live'

        // ----- Systems + services + charges -----
        // Collect newly created recurring services for call seeding.
        const seedServices: {
          id: string
          service_type_id: string
          frequency_value: number
          frequency_unit: 'weeks' | 'months'
          is_recurring: boolean
        }[] = []

        for (const system of site.systems.values()) {
          const sysExistKey = `${siteId}::${system.key}`
          let systemId = existing.systemByKey.get(sysExistKey) ?? null
          if (!systemId) {
            const { data, error: e } = await supabase
              .from('site_systems')
              .insert({
                site_id: siteId,
                name: system.name,
                system_type_id: system.systemTypeId,
                location: system.location,
              })
              .select('id')
              .single()
            if (e) throw new Error(`system "${system.name}": ${e.message}`)
            systemId = String((data as { id: string }).id)
            existing.systemByKey.set(sysExistKey, systemId)
            result.systemsCreated += 1
          }

          for (const service of system.services) {
            const nextServiceDate = siteLive && service.isRecurring ? startDate : null
            const { data: svcData, error: svcErr } = await supabase
              .from('site_services')
              .insert({
                site_id: siteId,
                site_system_id: systemId,
                service_type_id: service.serviceTypeId,
                frequency_value: service.frequencyValue,
                frequency_unit: service.frequencyUnit,
                worker_type: service.workerType,
                status: site.status,
                billing_account_id: siteBillingId,
                next_service_date: nextServiceDate,
              })
              .select('id')
              .single()
            if (svcErr) throw new Error(`service "${service.serviceTypeName}": ${svcErr.message}`)
            const serviceId = String((svcData as { id: string }).id)
            result.servicesCreated += 1

            if (siteLive && service.isRecurring) {
              seedServices.push({
                id: serviceId,
                service_type_id: service.serviceTypeId,
                frequency_value: service.frequencyValue,
                frequency_unit: service.frequencyUnit,
                is_recurring: true,
              })
            }

            // ----- Charge -----
            if (service.charge) {
              if (!siteBillingId)
                throw new Error(`charge "${service.charge.description}": no billing account resolved`)
              const { error: chErr } = await supabase.from('recurring_charges').insert({
                billing_account_id: siteBillingId,
                site_service_id: serviceId,
                client_id: clientId,
                site_id: siteId,
                description: service.charge.description,
                unit_price_pence: service.charge.unitPricePence,
                quantity: service.charge.quantity,
                frequency: service.charge.frequency,
                timing: service.charge.timing,
                price_basis: 'per_period',
                created_by: userId ?? null,
              })
              if (chErr) throw new Error(`charge "${service.charge.description}": ${chErr.message}`)
              result.chargesCreated += 1
            }
          }
        }

        // ----- Seed first cycle of calls for live sites -----
        if (seedServices.length > 0) {
          const visitsByServiceType = await fetchVisitsByServiceType(
            supabase,
            seedServices.map((s) => s.service_type_id),
          )
          const taskData = buildSeedTaskRows(seedServices, startDate, visitsByServiceType)
          if (taskData.length > 0) {
            const { error: taskErr } = await supabase.from('tasks').insert(taskData)
            if (taskErr) throw new Error(`seeding calls for "${site.name}": ${taskErr.message}`)
            result.callsSeeded += taskData.length
          }
        }
      }
    }
  } catch (e) {
    console.log('[v0] full-site import failed:', (e as Error).message)
    return { ...result, ok: false, error: (e as Error).message }
  }

  for (const path of ['/dashboard/clients', '/dashboard/sites', '/dashboard/schedule', '/dashboard/invoices']) {
    revalidatePath(path)
  }
  return result
}
