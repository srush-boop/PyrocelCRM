'use server'

import { createClient } from '@/lib/supabase/server'
import { saveQuote, type QuoteInput } from '@/app/(dashboard)/dashboard/sales/actions'
import { quoteTypeFromWorkType } from '@/lib/sales'
import {
  buildAssembly,
  toQuoteLineInput,
  type AssemblyCatalogueRef,
  type AssemblyKitRule,
  type AssemblyTakeoffItem,
} from '@/lib/sales/quote-studio-assembly'
import {
  computeBatteryCalc,
  deriveZones,
  deriveEquipmentSchedule,
  type SpecTakeoffItem,
} from '@/lib/sales/quote-studio-spec'
import {
  draftFromBrief,
  redraftFromBrief,
  draftDisciplineDevices,
  generateSpecSections,
  type StudioUnderstanding,
  type StudioRequirement,
  type StudioDesignReasoning,
  type StudioDisciplineDraft,
  type RedraftDevice,
} from '@/lib/ai/studio-draft'

const FA_CODE = 'FA'

async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null as null, error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = (profile as { role?: string } | null)?.role
  if (!role || !['admin', 'office'].includes(role)) {
    return { supabase, user: null as null, error: 'Not authorised.' }
  }
  return { supabase, user, error: null as null }
}

// ---- Config: device types + kit rules + catalogue --------------------

export interface StudioDeviceType {
  device_key: string
  label: string
  default_catalogue_item_id: string | null
  contributes_to_device_count: boolean
  catalogue: AssemblyCatalogueRef | null
}

export interface StudioManufacturer {
  id: string
  name: string
  code: string
}

export interface StudioRange {
  id: string
  manufacturerId: string
  name: string
  code: string
  isDefault: boolean
  /** device_key -> catalogue_item_id for this range (overrides device default). */
  parts: Record<string, string | null>
}

export interface StudioConfig {
  systemTypeId: string
  systemTypeCode: string
  systemTypeName: string
  deviceTypes: StudioDeviceType[]
  kitRules: AssemblyKitRule[]
  catalogue: Record<string, AssemblyCatalogueRef>
  manufacturers: StudioManufacturer[]
  ranges: StudioRange[]
}

type CatalogueRow = {
  id: string
  product_code: string | null
  name: string
  default_unit: string | null
  unit_cost_pence: number
  margin_percent: number
  quiescent_ma: number | null
  alarm_ma: number | null
}

function toCatRef(r: CatalogueRow): AssemblyCatalogueRef {
  return {
    id: r.id,
    product_code: r.product_code,
    name: r.name,
    unit: r.default_unit,
    unit_cost_pence: r.unit_cost_pence,
    margin_percent: r.margin_percent,
    quiescent_ma: r.quiescent_ma,
    alarm_ma: r.alarm_ma,
  }
}

async function loadConfig(
  supabase: Awaited<ReturnType<typeof createClient>>,
  systemTypeCode: string = FA_CODE,
): Promise<{ config?: StudioConfig; error?: string }> {
  const { data: st } = await supabase
    .from('system_types')
    .select('id, code, name')
    .eq('code', systemTypeCode)
    .maybeSingle()
  if (!st) return { error: `System type "${systemTypeCode}" not found.` }
  const systemTypeId = (st as { id: string }).id
  const systemTypeCodeResolved = (st as { code: string }).code
  const systemTypeName = (st as { name: string }).name

  const [{ data: devices }, { data: rules }, { data: manufacturerRows }, { data: rangeRows }] =
    await Promise.all([
      supabase
        .from('quote_device_types')
        .select('device_key, label, default_catalogue_item_id, contributes_to_device_count, position')
        .eq('system_type_id', systemTypeId)
        .eq('active', true)
        .order('position'),
      supabase
        .from('quote_kit_rules')
        .select('id, label, rule_type, factor, applies_to_device_key, is_service, catalogue_item_id, notes, range_id, position')
        .eq('system_type_id', systemTypeId)
        .eq('active', true)
        .order('position'),
      supabase
        .from('quote_manufacturers')
        .select('id, name, code, position')
        .eq('active', true)
        .order('position'),
      supabase
        .from('quote_system_ranges')
        .select('id, manufacturer_id, name, code, is_default, position, parts:quote_range_parts(device_key, catalogue_item_id)')
        .eq('system_type_id', systemTypeId)
        .eq('active', true)
        .order('position'),
    ])

  const deviceRows = (devices ?? []) as Array<{
    device_key: string
    label: string
    default_catalogue_item_id: string | null
    contributes_to_device_count: boolean
  }>
  const ruleRows = (rules ?? []) as Array<{
    id: string
    label: string
    rule_type: AssemblyKitRule['rule_type']
    factor: number
    applies_to_device_key: string | null
    is_service: boolean
    catalogue_item_id: string
    notes: string | null
    range_id: string | null
  }>

  const rangeRowsTyped = (rangeRows ?? []) as Array<{
    id: string
    manufacturer_id: string
    name: string
    code: string
    is_default: boolean
    parts: { device_key: string; catalogue_item_id: string | null }[] | null
  }>

  // Load every catalogue item referenced by a device default, a kit rule, or a
  // range part (range parts swap the catalogue item used per device per range).
  const rangePartIds = rangeRowsTyped.flatMap((r) =>
    (r.parts ?? []).map((p) => p.catalogue_item_id).filter(Boolean),
  ) as string[]
  const ids = Array.from(
    new Set([
      ...deviceRows.map((d) => d.default_catalogue_item_id).filter(Boolean),
      ...ruleRows.map((r) => r.catalogue_item_id).filter(Boolean),
      ...rangePartIds,
    ]),
  ) as string[]

  const catalogue: Record<string, AssemblyCatalogueRef> = {}
  if (ids.length) {
    const { data: items } = await supabase
      .from('quote_catalogue_items')
      .select('id, product_code, name, default_unit, unit_cost_pence, margin_percent, quiescent_ma, alarm_ma')
      .in('id', ids)
    for (const row of (items ?? []) as CatalogueRow[]) {
      catalogue[row.id] = toCatRef(row)
    }
  }

  const deviceTypes: StudioDeviceType[] = deviceRows.map((d) => ({
    device_key: d.device_key,
    label: d.label,
    default_catalogue_item_id: d.default_catalogue_item_id,
    contributes_to_device_count: d.contributes_to_device_count,
    catalogue: d.default_catalogue_item_id ? catalogue[d.default_catalogue_item_id] ?? null : null,
  }))

  const kitRules: AssemblyKitRule[] = ruleRows.map((r) => ({
    id: r.id,
    label: r.label,
    rule_type: r.rule_type,
    factor: Number(r.factor),
    applies_to_device_key: r.applies_to_device_key,
    is_service: r.is_service,
    catalogue_item_id: r.catalogue_item_id,
    notes: r.notes,
    range_id: r.range_id,
  }))

  const manufacturers: StudioManufacturer[] = ((manufacturerRows ?? []) as Array<{
    id: string
    name: string
    code: string
  }>).map((m) => ({ id: m.id, name: m.name, code: m.code }))

  const ranges: StudioRange[] = rangeRowsTyped.map((r) => ({
    id: r.id,
    manufacturerId: r.manufacturer_id,
    name: r.name,
    code: r.code,
    isDefault: r.is_default,
    parts: Object.fromEntries((r.parts ?? []).map((p) => [p.device_key, p.catalogue_item_id])),
  }))

  return {
    config: {
      systemTypeId,
      systemTypeCode: systemTypeCodeResolved,
      systemTypeName,
      deviceTypes,
      kitRules,
      catalogue,
      manufacturers,
      ranges,
    },
  }
}

export async function getStudioConfig(): Promise<{ ok: boolean; config?: StudioConfig; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }
  const { config, error: cfgErr } = await loadConfig(supabase)
  if (!config) return { ok: false, error: cfgErr ?? 'Could not load configuration.' }
  return { ok: true, config }
}

/** Load a Quote Studio config for ANY discipline by its system-type code. */
export async function getStudioConfigForCode(
  code: string,
): Promise<{ ok: boolean; config?: StudioConfig; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }
  const { config, error: cfgErr } = await loadConfig(supabase, code)
  if (!config) return { ok: false, error: cfgErr ?? 'Could not load configuration.' }
  return { ok: true, config }
}

export interface StudioDiscipline {
  systemTypeId: string
  code: string
  name: string
  deviceCount: number
}

/**
 * List the disciplines Quote Studio can quote (any system type that has active
 * device types), excluding the primary Fire Alarm discipline. Used to offer
 * detected/other disciplines as additional priced sections.
 */
export async function listStudioDisciplines(): Promise<{
  ok: boolean
  disciplines?: StudioDiscipline[]
  error?: string
}> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const { data: types } = await supabase
    .from('system_types')
    .select('id, code, name, quote_device_types(count)')
    .neq('code', FA_CODE)
    .order('name')

  const disciplines: StudioDiscipline[] = ((types ?? []) as Array<{
    id: string
    code: string
    name: string
    quote_device_types: { count: number }[]
  }>)
    .map((t) => ({
      systemTypeId: t.id,
      code: t.code,
      name: t.name,
      deviceCount: t.quote_device_types?.[0]?.count ?? 0,
    }))
    .filter((d) => d.deviceCount > 0)

  return { ok: true, disciplines }
}

/**
 * Load a discipline's config AND draft its first-pass device schedule from the
 * brief in one call — used when the user adds a detected discipline as an
 * additional priced section.
 */
export async function draftDisciplineSection(
  code: string,
  brief: string,
): Promise<{ ok: boolean; config?: StudioConfig; draft?: StudioDisciplineDraft; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  const { config, error: cfgErr } = await loadConfig(supabase, code)
  if (!config) return { ok: false, error: cfgErr ?? 'Could not load configuration.' }

  const allowed = config.deviceTypes.map((d) => ({ key: d.device_key, label: d.label }))
  const res = await draftDisciplineDevices(brief, config.systemTypeName, allowed)
  if (!res.ok) {
    // Still return the config so the user can add devices manually.
    return { ok: true, config, draft: { devices: [], notes: [res.error] } }
  }
  return { ok: true, config, draft: res.draft }
}

// ---- Draft from brief -------------------------------------------------

export async function draftBrief(brief: string) {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false as const, error: error ?? 'Not authorised.' }
  const { config } = await loadConfig(supabase)
  const keys = (config?.deviceTypes ?? []).map((d) => ({ key: d.device_key, label: d.label }))
  return draftFromBrief(brief, keys)
}

export async function redraftBrief(input: {
  brief: string
  steer: string
  understanding: StudioUnderstanding
  requirements: StudioRequirement[]
  devices: RedraftDevice[]
}) {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false as const, error: error ?? 'Not authorised.' }
  const { config } = await loadConfig(supabase)
  const keys = (config?.deviceTypes ?? []).map((d) => ({ key: d.device_key, label: d.label }))
  return redraftFromBrief(input.brief, keys, {
    steer: input.steer,
    understanding: input.understanding,
    requirements: input.requirements,
    devices: input.devices,
  })
}

// ---- Build the design specification (maths + AI narrative) -----------

export interface StudioTakeoffItemInput {
  device_key: string
  label: string
  zone: string | null
  quantity: number
  catalogue_item_id: string | null
  confidence: 'high' | 'medium' | 'low' | 'manual'
  evidence: string | null
}

export interface StudioCauseEffectRow {
  input: string
  effects: boolean[]
}

export interface StudioSpecPayload {
  sections: { id: string; number: string; title: string; body: string; bullets: string[] }[]
  zones: { zone: string; area: string; detection: string; devices: number }[]
  battery: { label: string; value: string }[]
  equipment: { ref: string; description: string; standard: string; qty: number }[]
  ceOutputs: string[]
  ceMatrix: StudioCauseEffectRow[]
  deviceCount: number
}

function buildCauseEffect(items: StudioTakeoffItemInput[]): {
  ceOutputs: string[]
  ceMatrix: StudioCauseEffectRow[]
} {
  const has = (k: string) => items.some((i) => i.device_key === k && i.quantity > 0)
  const outputs: string[] = ['Sounders / VADs', 'ARC signal']
  if (has('door_holder')) outputs.push('Door holders release')
  outputs.push('Lift homing', 'AHU / plant shutdown')

  const allTrue = outputs.map(() => true)
  const matrix: StudioCauseEffectRow[] = [
    { input: 'Any automatic detector', effects: allTrue.slice() },
    { input: 'Any manual call point', effects: allTrue.slice() },
    {
      input: 'Panel fault / PSU fail',
      effects: outputs.map((o) => o === 'ARC signal'),
    },
  ]
  return { ceOutputs: outputs, ceMatrix: matrix }
}

export async function buildStudioSpec(input: {
  understanding: StudioUnderstanding
  designCategory: string
  items: StudioTakeoffItemInput[]
}): Promise<{ ok: boolean; spec?: StudioSpecPayload; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  // Resolve the real manufacturer-specific current draws for the chosen parts so
  // the battery calc reflects the selected range (falls back to representative
  // constants inside computeBatteryCalc when a part has no current data yet).
  const { config } = await loadConfig(supabase)
  const catalogue = config?.catalogue ?? {}

  const specItems: SpecTakeoffItem[] = input.items.map((i) => {
    const cat = i.catalogue_item_id ? catalogue[i.catalogue_item_id] : undefined
    return {
      device_key: i.device_key,
      label: i.label,
      zone: i.zone,
      quantity: i.quantity,
      quiescentMa: cat?.quiescent_ma ?? null,
      alarmMa: cat?.alarm_ma ?? null,
    }
  })

  const zones = deriveZones(specItems)
  const battery = computeBatteryCalc(specItems).rows
  const equipment = deriveEquipmentSchedule(specItems)
  const deviceCount = specItems.reduce((s, i) => s + (i.quantity || 0), 0)
  const { ceOutputs, ceMatrix } = buildCauseEffect(input.items)

  const sectionsRes = await generateSpecSections({
    understanding: input.understanding,
    zoneCount: zones.length,
    deviceCount,
    designCategory: input.designCategory,
  })
  if (!sectionsRes.ok || !sectionsRes.sections) {
    return { ok: false, error: sectionsRes.error ?? 'Could not build the specification.' }
  }

  return {
    ok: true,
    spec: {
      sections: sectionsRes.sections,
      zones,
      battery,
      equipment,
      ceOutputs,
      ceMatrix,
      deviceCount,
    },
  }
}

// ---- Save the studio quote (persist takeoff + real quote) ------------

/** A product combination the user chose to compare (a manufacturer range).
 * The recommended one prices the main quote; the rest are summarised. */
export interface StudioComparisonOptionInput {
  /** Range id, or null for the generic / unbranded default combination. */
  rangeId: string | null
  recommended: boolean
  pros: string[]
  cons: string[]
}

/** A priced product option persisted onto the quote's design_spec for
 * rendering the "Product options considered" comparison on the document. */
export interface StudioQuoteOption {
  rangeId: string | null
  name: string
  recommended: boolean
  /** Total sell price (ex VAT) for the SAME device schedule on this combination. */
  sellPence: number
  pros: string[]
  cons: string[]
}

export interface SaveStudioQuoteInput {
  title: string
  workType: string // WORK_TYPES code, e.g. 'SIC'
  designCategory: string
  source: 'manual' | 'drawing'
  drawingBlobUrl?: string | null
  loops?: number | null
  rangeId?: string | null
  /** Product combinations the user selected to compare on the quote. The
   * recommended one should match `rangeId` (it prices the main quote). */
  comparisonOptions?: StudioComparisonOptionInput[]
  margin: number
  client_id?: string | null
  site_id?: string | null
  prospect_name?: string | null
  understanding: StudioUnderstanding
  requirements: StudioRequirement[]
  designReasoning?: StudioDesignReasoning | null
  items: StudioTakeoffItemInput[]
  spec: StudioSpecPayload
  specificationText: string
  /** Additional disciplines (access control, intruder, CCTV, EL) quoted as
   * their own priced system sections within the same quote. */
  additionalSystems?: StudioAdditionalSystemInput[]
  showFlags?: {
    show_equipment_spec?: boolean
    show_design_overview?: boolean
    show_requirements_matrix?: boolean
  }
}

export interface StudioAdditionalSystemInput {
  systemTypeCode: string
  designCategory?: string | null
  margin: number
  rangeId?: string | null
  items: StudioTakeoffItemInput[]
  specificationText?: string | null
  summary?: string | null
}

/**
 * Resolve each takeoff item to its authoritative catalogue part:
 * range part → client-supplied item → device default.
 */
function resolveAssemblyItems(
  config: StudioConfig,
  items: StudioTakeoffItemInput[],
  rangeId: string | null | undefined,
): AssemblyTakeoffItem[] {
  const range = rangeId ? config.ranges.find((r) => r.id === rangeId) : undefined
  return items.map((i) => {
    const dt = config.deviceTypes.find((d) => d.device_key === i.device_key)
    const rangePart = range ? range.parts[i.device_key] : undefined
    return {
      device_key: i.device_key,
      label: i.label,
      quantity: i.quantity,
      catalogue_item_id: rangePart ?? i.catalogue_item_id ?? dt?.default_catalogue_item_id ?? null,
      contributes_to_device_count: dt?.contributes_to_device_count ?? true,
    }
  })
}

/**
 * Re-price each chosen product combination SERVER-SIDE against the SAME device
 * schedule so the quote can summarise alternatives next to the recommended one.
 * Prices are authoritative (recomputed from live catalogue costs).
 */
function buildComparisonOptions(
  config: StudioConfig,
  confirmedItems: StudioTakeoffItemInput[],
  options: StudioComparisonOptionInput[] | undefined,
  margin: number,
  loops: number | null | undefined,
): StudioQuoteOption[] {
  if (!options || options.length === 0) return []
  return options.map((opt) => {
    const assembly = buildAssembly({
      items: resolveAssemblyItems(config, confirmedItems, opt.rangeId),
      kitRules: config.kitRules,
      catalogue: config.catalogue,
      loops: loops ?? null,
      rangeId: opt.rangeId ?? null,
      systemMargin: margin,
    })
    const range = opt.rangeId ? config.ranges.find((r) => r.id === opt.rangeId) : null
    const manufacturer = range
      ? config.manufacturers.find((m) => m.id === range.manufacturerId)
      : null
    const name = range
      ? [manufacturer?.name, range.name].filter(Boolean).join(' ')
      : 'Generic / unbranded'
    return {
      rangeId: opt.rangeId,
      name,
      recommended: opt.recommended,
      sellPence: assembly.totalSellPence,
      pros: opt.pros.filter((p) => p.trim()),
      cons: opt.cons.filter((c) => c.trim()),
    }
  })
}

/** Insert a confirmed takeoff + its items for one system section (audit trail). */
async function insertTakeoffWithItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: {
    quoteId: string
    systemTypeId: string
    title: string
    source: 'manual' | 'drawing'
    drawingBlobUrl?: string | null
    designCategory?: string | null
    loops?: number | null
    rangeId?: string | null
    designReasoning?: StudioDesignReasoning | null
    userId: string
    items: StudioTakeoffItemInput[]
  },
): Promise<void> {
  const { data: takeoff, error } = await supabase
    .from('quote_takeoffs')
    .insert({
      quote_id: opts.quoteId,
      system_type_id: opts.systemTypeId,
      title: opts.title,
      source: opts.source,
      drawing_blob_url: opts.drawingBlobUrl ?? null,
      design_category: opts.designCategory ?? null,
      loops: opts.loops ?? null,
      range_id: opts.rangeId ?? null,
      design_reasoning: opts.designReasoning ?? null,
      status: 'confirmed',
      confirmed_by: opts.userId,
      confirmed_at: new Date().toISOString(),
      created_by: opts.userId,
    })
    .select('id')
    .single()

  if (error || !takeoff) return
  const takeoffId = (takeoff as { id: string }).id
  const rows = opts.items.map((i, idx) => ({
    takeoff_id: takeoffId,
    device_key: i.device_key,
    label: i.label,
    zone: i.zone,
    quantity: i.quantity,
    catalogue_item_id: i.catalogue_item_id ?? null,
    confidence: i.confidence,
    evidence: i.evidence,
    position: idx,
  }))
  await supabase.from('quote_takeoff_items').insert(rows)
}

export async function saveStudioQuote(
  input: SaveStudioQuoteInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { supabase, user, error } = await requireStaff()
  if (error || !user) return { ok: false, error: error ?? 'Not authorised.' }

  if (!input.title?.trim()) return { ok: false, error: 'A quote title is required.' }
  if (!input.client_id && !input.prospect_name?.trim()) {
    return { ok: false, error: 'Select a client or enter a prospect name.' }
  }
  const confirmedItems = input.items.filter((i) => (i.quantity || 0) > 0)
  if (confirmedItems.length === 0) {
    return { ok: false, error: 'Add at least one device to the takeoff before saving.' }
  }

  // Rebuild the priced assembly SERVER-SIDE from the confirmed schedule + the
  // current catalogue costs, so prices are authoritative (never client-supplied).
  const { config, error: cfgErr } = await loadConfig(supabase)
  if (!config) return { ok: false, error: cfgErr ?? 'Could not load configuration.' }

  // Resolve parts against the selected manufacturer range and price SERVER-SIDE.
  const assembly = buildAssembly({
    items: resolveAssemblyItems(config, confirmedItems, input.rangeId),
    kitRules: config.kitRules,
    catalogue: config.catalogue,
    loops: input.loops ?? null,
    rangeId: input.rangeId ?? null,
    systemMargin: input.margin,
  })

  const lines = assembly.lines.map(toQuoteLineInput)

  // Re-price the chosen product combinations for the comparison summary.
  const comparisonOptions = buildComparisonOptions(
    config,
    confirmedItems,
    input.comparisonOptions,
    input.margin,
    input.loops,
  )

  // Build any additional discipline sections (access control, intruder, etc.).
  // Each becomes its own priced system within the same quote, re-priced
  // server-side from its confirmed schedule.
  const additionalSystemEntries: QuoteInput['systems'] = []
  const additionalTakeoffs: {
    config: StudioConfig
    items: StudioTakeoffItemInput[]
    designCategory?: string | null
    rangeId?: string | null
  }[] = []
  for (const add of input.additionalSystems ?? []) {
    const addConfirmed = add.items.filter((i) => (i.quantity || 0) > 0)
    if (addConfirmed.length === 0) continue
    const { config: addCfg } = await loadConfig(supabase, add.systemTypeCode)
    if (!addCfg) continue
    const addAssembly = buildAssembly({
      items: resolveAssemblyItems(addCfg, addConfirmed, add.rangeId),
      kitRules: addCfg.kitRules,
      catalogue: addCfg.catalogue,
      loops: null,
      rangeId: add.rangeId ?? null,
      systemMargin: add.margin,
    })
    additionalSystemEntries.push({
      system_type_id: addCfg.systemTypeId,
      system_name: add.designCategory
        ? `${addCfg.systemTypeName} — ${add.designCategory}`
        : addCfg.systemTypeName,
      work_type: input.workType,
      specification: add.specificationText || null,
      design_overview: add.summary || null,
      designed_by: 'pyrocel',
      margin_percent: add.margin,
      lines: addAssembly.lines.map(toQuoteLineInput),
    })
    additionalTakeoffs.push({
      config: addCfg,
      items: addConfirmed,
      designCategory: add.designCategory ?? null,
      rangeId: add.rangeId ?? null,
    })
  }

  const quoteInput: QuoteInput = {
    title: input.title.trim(),
    quote_type: quoteTypeFromWorkType(input.workType),
    client_id: input.client_id ?? null,
    site_id: input.site_id ?? null,
    prospect_name: input.prospect_name ?? null,
    summary: input.understanding.summary ?? null,
    vat_rate: 20,
    discount_pence: 0,
    show_line_items: true,
    show_equipment_spec: input.showFlags?.show_equipment_spec ?? true,
    show_design_overview: input.showFlags?.show_design_overview ?? true,
    show_requirements_matrix: input.showFlags?.show_requirements_matrix ?? true,
    systems: [
      {
        system_type_id: config.systemTypeId,
        system_name: `${config.systemTypeName} — Category ${input.designCategory}`,
        work_type: input.workType,
        specification: input.specificationText || null,
        design_overview: input.understanding.summary || null,
        designed_by: 'pyrocel',
        margin_percent: input.margin,
        lines,
      },
      ...additionalSystemEntries,
    ],
    requirements: input.requirements.map((r) => ({
      requirement: r.text,
      category: r.system,
      status: 'met',
    })),
  }

  const saved = await saveQuote(quoteInput)
  if (!saved.ok || !saved.id) return { ok: false, error: saved.error ?? 'Could not save the quote.' }

  // Persist the confirmed takeoffs (audit trail) — one per system section.
  await insertTakeoffWithItems(supabase, {
    quoteId: saved.id,
    systemTypeId: config.systemTypeId,
    title: input.title.trim(),
    source: input.source,
    drawingBlobUrl: input.drawingBlobUrl ?? null,
    designCategory: input.designCategory,
    loops: input.loops ?? null,
    rangeId: input.rangeId ?? null,
    designReasoning: input.designReasoning ?? null,
    userId: user.id,
    items: confirmedItems,
  })

  for (const add of additionalTakeoffs) {
    await insertTakeoffWithItems(supabase, {
      quoteId: saved.id,
      systemTypeId: add.config.systemTypeId,
      title: `${input.title.trim()} — ${add.config.systemTypeName}`,
      source: input.source,
      designCategory: add.designCategory ?? null,
      rangeId: add.rangeId ?? null,
      userId: user.id,
      items: add.items,
    })
  }

  // Store the generated design specification on the quote for later rendering.
  await supabase
    .from('quotes')
    .update({
      design_spec: {
        understanding: input.understanding,
        designCategory: input.designCategory,
        spec: input.spec,
        options: comparisonOptions,
        generatedAt: new Date().toISOString(),
        generatedBy: user.id,
      },
    })
    .eq('id', saved.id)

  return { ok: true, id: saved.id }
}
