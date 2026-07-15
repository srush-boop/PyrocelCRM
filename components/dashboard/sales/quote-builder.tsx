'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AddressFinder } from '@/components/dashboard/shared/address-finder'
import type { PlaceResult } from '@/app/api/places-search/route'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { Plus, Trash2, BookOpen, Save, TrendingUp, Calculator, Wrench, Check, ChevronsUpDown, ChevronDown, Sparkles, Building2, HardHat, Send, Eye, AlertTriangle, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { SendQuoteDialog } from '@/components/dashboard/sales/send-quote-dialog'
import { PpmCalculatorDialog, type PpmDraft } from '@/components/dashboard/sales/ppm-calculator-dialog'
import {
  MaintenanceCalculatorDialog,
  type MaintenanceCalcResult,
} from '@/components/dashboard/sales/maintenance-calculator-dialog'
import type { MaintenanceLine, MaintenanceRates } from '@/lib/maintenance-calculator'
import {
  InstallationCalculatorDialog,
  type InstallationCalcResult,
} from '@/components/dashboard/sales/installation-calculator-dialog'
import {
  type InstallationRates,
} from '@/lib/installation-calculator'
import {
  parseCalculatorSnapshot,
  type CalculatorSnapshot,
  type InstallationSnapshot,
  type MaintenanceSnapshot,
} from '@/lib/calculator-snapshot'
import { QuoteSectionRenderer } from '@/components/dashboard/sales/quote-section-renderer'
import { AiSpecBuilderDialog } from '@/components/dashboard/sales/ai-spec-builder-dialog'
import {
  QuoteRequestImporter,
  type ImportApplyPayload,
} from '@/components/dashboard/sales/quote-request-importer'
import { QuoteRequirementsEditor } from '@/components/dashboard/sales/quote-requirements-editor'
import type { DraftRequirement, RequirementSourceInfo } from '@/lib/sales-requirements'
import { SystemBadge, SystemIcon, SystemColorDot, getSystemHex } from '@/lib/system-types'
import {
  computeQuoteTotals,
  computeBankStats,
  formatPence,
  penceToPounds,
  poundsToPence,
  sellFromCost,
  resolveLineMargin,
  resolveSystemWorkTypeMargin,
  quoteTypeFromWorkType,
  deriveQuoteTypeFromSystems,
  WORK_TYPES,
  DESIGNED_BY_OPTIONS,
} from '@/lib/sales'
import type {
  Client,
  Quote,
  QuoteCatalogueItem,
  QuoteLineItem,
  QuoteSystem,
  QuoteBankValue,
  SystemSpecTemplate,
  WorkTypeField,
  SystemWorkTypeMargin,
  WorkTypeSetting,
  QuoteDesignCategory,
  SystemType,
  ServiceType,
  QuoteService,
  AssetType,
  QuoteSystemPpm,
  Site,
  Branch,
} from '@/lib/types/database'
import {
  saveQuote,
  searchCatalogueItems,
  getCatalogueItemByCode,
  type QuoteInput,
} from '@/app/(dashboard)/dashboard/sales/actions'
import { linkDefectToQuote } from '@/app/(dashboard)/dashboard/defects/actions'

// Default terms shown on a brand-new quote (editable per quote).
const DEFAULT_QUOTE_TERMS = 'Standard terms and conditions apply which are available on request.'

// --- Local editable shapes (money kept as pounds strings for inputs) ---
interface EditLine {
  key: string
  productCode: string
  description: string
  detail: string
  service_type_id: string | null
  // True for non-product service lines (grouped as a "Services" sub-section).
  is_service: boolean
  catalogue_item_id: string | null
  quantity: string
  unit: string
  unitCost: string // pounds (cost)
  margin: string // gross margin %, empty string = inherit system margin
  // Client-selectable option support (used by maintenance quotes). Optional
  // lines are excluded from the core total; lines sharing an option_group are
  // mutually exclusive. standard names the relevant industry standard.
  is_optional: boolean
  option_group: string | null
  standard: string | null
  // Serialised inputs + result of the calculator that produced this line (if
  // any), so the calculation can be re-opened and viewed/adjusted later.
  calculatorSnapshot?: CalculatorSnapshot | null
}

interface EditSystem {
  key: string
  system_type_id: string | null
  system_name: string
  system_code: string | null
  work_type: string
  specification: string
  conditional_values: Record<string, string | number | boolean>
  design_category_id: string | null
  design_overview: string
  designed_by: string | null
  designed_by_name: string
  drawing_reference: string
  survey_carried_out: boolean
  survey_by: string
  survey_date: string
  margin: string // system-level gross margin %
  lines: EditLine[]
  // Saved PPM calculator breakdown for this system, if one has been applied.
  ppm: PpmDraft | null
}

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k_${Math.random().toString(36).slice(2)}`

// Resolve a line's effective margin % (per-line override, else system margin).
function effectiveMargin(line: EditLine, system: { margin: string }): number {
  const lineMargin = line.margin.trim() === '' ? null : Number.parseFloat(line.margin)
  const sysMargin = Number.parseFloat(system.margin) || 0
  return resolveLineMargin(Number.isNaN(lineMargin as number) ? null : lineMargin, sysMargin)
}

// Compute the unit sell price (pence) for a line from its cost + margin.
function lineSellPence(line: EditLine, system: { margin: string }): number {
  return sellFromCost(poundsToPence(line.unitCost), effectiveMargin(line, system))
}

function blankLine(): EditLine {
  return {
    key: uid(),
    productCode: '',
    description: '',
    detail: '',
    service_type_id: null,
    is_service: false,
    catalogue_item_id: null,
    quantity: '', // required: starts empty so the field highlights until filled
    unit: '',
    unitCost: '0.00',
    margin: '', // inherit system margin
    is_optional: false,
    option_group: null,
    standard: null,
  }
}

// Best-effort mapping of a system's product lines to fire maintenance asset
// counts, used to pre-fill the maintenance calculator. Keyword patterns are
// tested in order and the first match wins to avoid double-counting a line.
const FIRE_ASSET_KEYWORDS: { key: string; patterns: RegExp[] }[] = [
  { key: 'repeater', patterns: [/repeater/i] },
  { key: 'controlPanel', patterns: [/control panel/i, /\bpanel\b/i, /\bcie\b/i] },
  { key: 'psu', patterns: [/\bpsu\b/i, /power supply/i] },
  { key: 'manualCallPoint', patterns: [/call ?point/i, /\bmcp\b/i, /break ?glass/i] },
  { key: 'beam', patterns: [/beam/i] },
  { key: 'heatDetector', patterns: [/heat detect/i, /\bheat\b/i] },
  { key: 'smokeDetector', patterns: [/smoke/i, /optical/i, /multi ?sensor/i] },
  { key: 'sounder', patterns: [/sounder/i, /\bsav\b/i, /\bvad\b/i, /beacon/i, /\bbell\b/i, /strobe/i] },
  { key: 'mainsInterface', patterns: [/interface/i, /input.?output/i, /\bi\/o\b/i] },
  { key: 'network', patterns: [/network/i] },
  { key: 'remoteSignalling', patterns: [/signalling/i, /dualcom/i, /redcare/i, /\bgsm\b/i] },
]

function inferFireAssetsFromLines(lines: EditLine[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const line of lines) {
    if (line.is_service) continue
    const hay = `${line.description} ${line.productCode}`.trim()
    if (!hay) continue
    const qty = Math.max(0, Math.round(Number.parseFloat(line.quantity) || 0))
    if (qty <= 0) continue
    for (const { key, patterns } of FIRE_ASSET_KEYWORDS) {
      if (patterns.some((p) => p.test(hay))) {
        counts[key] = (counts[key] ?? 0) + qty
        break
      }
    }
  }
  return counts
}

// Product-code box for a line item. The catalogue is too large to ship to the
// client, so this searches the server on demand (debounced) to power its
// autocomplete and to resolve a typed/selected code to a full catalogue item.
function ProductCodeInput({
  value,
  listId,
  disabled,
  onChangeCode,
  onResolve,
}: {
  value: string
  listId: string
  disabled?: boolean
  onChangeCode: (code: string) => void
  onResolve: (item: QuoteCatalogueItem) => void
}) {
  const [results, setResults] = useState<QuoteCatalogueItem[]>([])

  useEffect(() => {
    const term = value.trim()
    if (!term) {
      setResults([])
      return
    }
    let cancelled = false
    const handle = setTimeout(async () => {
      const r = await searchCatalogueItems(term, { limit: 20 })
      if (!cancelled) setResults(r)
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [value])

  function tryResolve(code: string): boolean {
    const match = results.find(
      (c) => c.product_code && c.product_code.toLowerCase() === code.trim().toLowerCase(),
    )
    if (match) {
      onResolve(match)
      return true
    }
    return false
  }

  return (
    <>
      <Input
        list={listId}
        value={value}
        onChange={(e) => {
          const code = e.target.value
          // Selecting/typing an exact code links the catalogue item (pulling in
          // description, cost, etc.); otherwise just store the raw code.
          if (!tryResolve(code)) onChangeCode(code)
        }}
        onBlur={async (e) => {
          const code = e.target.value.trim()
          if (!code || tryResolve(code)) return
          // Fallback: exact lookup for a pasted code we never searched for.
          const item = await getCatalogueItemByCode(code)
          if (item) onResolve(item)
        }}
        placeholder="Product code"
        className="font-mono text-xs"
        aria-label="Product code"
        disabled={disabled}
      />
      <datalist id={listId}>
        {results
          .filter((c) => c.product_code)
          .map((c) => (
            <option key={c.id} value={c.product_code as string}>
              {c.name}
            </option>
          ))}
      </datalist>
    </>
  )
}

function blankSystem(index: number, defaultMargin = 0): EditSystem {
  return {
    key: uid(),
    system_type_id: null,
    system_name: `System ${index}`,
    system_code: null,
    work_type: 'SO',
    specification: '',
    conditional_values: {},
    design_category_id: null,
    design_overview: '',
    designed_by: 'pyrocel',
    designed_by_name: '',
    drawing_reference: '',
    survey_carried_out: false,
    survey_by: '',
    survey_date: '',
    margin: String(defaultMargin ?? 0),
    lines: [],
    ppm: null,
  }
}

// Convert a saved PPM row into the editable draft shape used by the dialog.
function ppmToDraft(p: QuoteSystemPpm | null): PpmDraft | null {
  if (!p) return null
  return {
    num_visits: p.num_visits,
    round_trip_miles: p.round_trip_miles,
    mileage_rate_pence: p.mileage_rate_pence,
    travel_minutes_per_visit: p.travel_minutes_per_visit,
    hourly_cost_pence: p.hourly_cost_pence,
    download_required: p.download_required,
    download_minutes_per_visit: p.download_minutes_per_visit,
    access_minutes_per_visit: p.access_minutes_per_visit,
    remote_monitored: p.remote_monitored,
    remote_minutes_per_visit: p.remote_minutes_per_visit,
    out_of_hours: p.out_of_hours,
    ooh_uplift_percent: p.ooh_uplift_percent,
    margin_percent: p.margin_percent,
    computed_cost_pence: p.computed_cost_pence,
    computed_price_pence: p.computed_price_pence,
    assets: p.assets ?? [],
    visits: p.visits ?? [],
    notes: p.notes,
  }
}

// Map a maintenance calculator result into editable quote lines: one line per
// priced service (Routine Maintenance, Weekly fire testing, EL testing,
// monitoring, sub-contract, etc.), each annotated with its cover type and the
// number of visits per year. The originating calculation snapshot is attached
// to the first line so it can be re-opened and adjusted later. Sell-priced at
// 0% margin (cost = sell) so the quote total reproduces the calculator exactly.
// Resolve the best-matching Service Type for a maintenance line. Preference:
// (1) service types under the line's discipline system type, name-matched;
// (2) any service type name-matched; (3) none. Name matching is keyword-based
// (e.g. "Weekly Fire Alarm Testing" ~ "Fire Alarm Weekly Testing").
function matchServiceTypeForLine(
  line: MaintenanceLine,
  serviceTypes: ServiceType[],
  systemTypeId: string | null,
): string | null {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(annual|monthly|weekly)\b/g, '').trim()
  const target = norm(line.description)
  const targetWords = new Set(target.split(' ').filter(Boolean))
  const score = (name: string) => {
    const words = norm(name).split(' ').filter(Boolean)
    if (words.length === 0) return 0
    const hits = words.filter((w) => targetWords.has(w)).length
    return hits / words.length
  }
  const pools = [
    systemTypeId ? serviceTypes.filter((t) => t.system_type_id === systemTypeId) : [],
    serviceTypes,
  ]
  for (const pool of pools) {
    let best: { id: string; s: number } | null = null
    for (const t of pool) {
      const s = score(t.name)
      if (s > 0 && (!best || s > best.s)) best = { id: t.id, s }
    }
    if (best && best.s >= 0.5) return best.id
  }
  return null
}

// Match a discipline's system_types.code to a configured System Type id.
function matchSystemTypeByCode(
  code: string | undefined,
  systemTypes: SystemType[],
): string | null {
  if (!code) return null
  const hit = systemTypes.find((t) => (t.code ?? '').toUpperCase() === code.toUpperCase())
  return hit?.id ?? null
}

// Convert a priced maintenance line into a typed, non-optional service EditLine.
function maintenanceLineToEditLine(
  l: MaintenanceLine,
  systemTypeId: string | null,
  serviceTypes: ServiceType[],
  snapshot: CalculatorSnapshot | null,
): EditLine {
  const meta = [l.coverType, l.visits ? `${l.visits} visits/yr` : null].filter(Boolean).join(' · ')
  const detail = [l.overview, meta].filter(Boolean).join('\n')
  const description = l.coverType ? `${l.description} (${l.coverType} Cover)` : l.description
  return {
    key: uid(),
    productCode: '',
    description,
    detail: detail || meta || '',
    service_type_id: matchServiceTypeForLine(l, serviceTypes, systemTypeId),
    is_service: true,
    catalogue_item_id: null,
    quantity: '1',
    unit: 'year',
    unitCost: l.sell.toFixed(2),
    margin: '0',
    is_optional: false,
    option_group: null,
    standard: l.standard ?? null,
    calculatorSnapshot: snapshot,
  }
}

// Flat list of typed service lines (used when adding to an existing system).
function maintenanceResultToLines(
  result: MaintenanceCalcResult,
  systemTypes: SystemType[],
  serviceTypes: ServiceType[],
): EditLine[] {
  return result.lines.map((l, i) => {
    const systemTypeId = matchSystemTypeByCode(l.systemTypeCode, systemTypes)
    return maintenanceLineToEditLine(l, systemTypeId, serviceTypes, i === 0 ? result.snapshot : null)
  })
}

// Group priced maintenance lines into ONE typed EditSystem per discipline (Fire
// Alarm, Emergency Lighting, Intruder, …). Lines without a discipline mapping
// (e.g. sub-contracts) collect into a single untyped "Routine Maintenance"
// system so nothing is lost. The calculator snapshot rides on the first line of
// the first system so the whole calc can be re-opened later.
function maintenanceResultToSystems(
  result: MaintenanceCalcResult,
  systemTypes: SystemType[],
  serviceTypes: ServiceType[],
  defaultMargin = 0,
): EditSystem[] {
  const groups = new Map<string, { name: string; systemTypeId: string | null; lines: EditLine[] }>()
  const order: string[] = []
  let snapshotAttached = false
  for (const l of result.lines) {
    const systemTypeId = matchSystemTypeByCode(l.systemTypeCode, systemTypes)
    const systemType = systemTypeId ? systemTypes.find((t) => t.id === systemTypeId) : null
    // Group by discipline system type when known, else one shared bucket.
    const groupKey = systemTypeId ?? 'routine-maintenance'
    const groupName = systemType?.name ?? 'Routine Maintenance'
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { name: groupName, systemTypeId, lines: [] })
      order.push(groupKey)
    }
    const snapshot = !snapshotAttached ? result.snapshot : null
    snapshotAttached = true
    groups.get(groupKey)!.lines.push(maintenanceLineToEditLine(l, systemTypeId, serviceTypes, snapshot))
  }
  return order.map((key, idx) => {
    const g = groups.get(key)!
    return {
      ...blankSystem(idx + 1, defaultMargin),
      system_type_id: g.systemTypeId,
      system_name: g.name,
      work_type: 'SVC',
      margin: '0',
      lines: g.lines,
    }
  })
}

// A system reference guide, condensed for AI grounding in the spec builder.
export type SystemReferenceLite = {
  id: string
  name: string
  description: string | null
  system_type_id: string | null
  extracted_text: string | null
}

interface QuoteBuilderProps {
  clients: Client[]
  sites: Site[]
  // Branches the preparer can issue this quote under (admin/office can switch).
  branches?: Branch[]
  // The preparer's own branch, used as the default for brand-new quotes.
  defaultBranchId?: string | null
  // Saved maintenance rate overrides from company settings (null = defaults).
  savedMaintenanceRates?: Partial<MaintenanceRates> | null
  // Saved installation rate overrides from company settings (null = defaults).
  savedInstallationRates?: Partial<InstallationRates> | null
  systemTypes: SystemType[]
  serviceTypes: ServiceType[]
  // Global, configurable non-product services (Installation, Decommission, etc.).
  quoteServices: QuoteService[]
  assetTypes: AssetType[]
  defaultHourlyCostPence: number
  defaultMarginPercent: number
  specTemplates: SystemSpecTemplate[]
  // Admin-curated reference documents assigned to a system, used as extra AI
  // grounding for the spec builder.
  systemReferences?: SystemReferenceLite[]
  workTypeFields: WorkTypeField[]
  systemWorkTypeMargins: SystemWorkTypeMargin[]
  workTypeSettings: WorkTypeSetting[]
  designCategories: QuoteDesignCategory[]
  bankValues: QuoteBankValue[]
  quote?: Quote
  // Preselect a client/site for brand-new quotes (e.g. launched from a site).
  initialClientId?: string
  initialSiteId?: string
  // Prefill the title/notes for brand-new quotes (e.g. a remedial quote raised
  // from a defect, where the scope of works is seeded from the failed items).
  initialTitle?: string
  initialNotes?: string
  // When set, links the saved quote back to this defect and marks it 'quoted'.
  defectId?: string
  // Seed the first system for a brand-new quote (e.g. a remedial quote raised
  // from a defect): the originating service's system type, the work type
  // (Remedial), and a scope of works placed in the system specification.
  initialSystemTypeId?: string | null
  initialWorkType?: string
  initialSpecification?: string
  initialSystems?: QuoteSystem[]
  initialLines?: QuoteLineItem[]
  initialPpm?: QuoteSystemPpm[]
  // Client-request import: previously-saved requirements matrix + its source.
  initialRequirements?: DraftRequirement[]
  initialRequirementSource?: RequirementSourceInfo | null
  readOnly?: boolean
}

export function QuoteBuilder({
  clients,
  sites,
  branches = [],
  defaultBranchId = null,
  savedMaintenanceRates = null,
  savedInstallationRates = null,
  systemTypes,
  serviceTypes,
  quoteServices,
  assetTypes,
  defaultHourlyCostPence,
  defaultMarginPercent,
  specTemplates,
  systemReferences = [],
  workTypeFields,
  systemWorkTypeMargins,
  workTypeSettings,
  designCategories,
  bankValues,
  quote,
  initialClientId,
  initialSiteId,
  initialTitle,
  initialNotes,
  defectId,
  initialSystemTypeId,
  initialWorkType,
  initialSpecification,
  initialSystems,
  initialLines,
  initialPpm,
  initialRequirements,
  initialRequirementSource,
  readOnly = false,
}: QuoteBuilderProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // ----- Header state -----
  const [title, setTitle] = useState(quote?.title ?? initialTitle ?? '')
  // Tracks whether the user has manually edited the title. Until they do, the
  // title auto-follows the selected site name. Seed as "dirty" for existing
  // quotes / seeded titles so we never overwrite an established title.
  const titleDirty = useRef<boolean>(Boolean(quote?.title || initialTitle))
  // "Maintenance quote only" mode: hides the client-request and systems sections
  // and focuses the builder on the itemised routine-maintenance flow. Seeded on
  // for existing quotes whose only system is routine maintenance (SVC).
  const [maintenanceOnly, setMaintenanceOnly] = useState<boolean>(() => {
    const svc = initialSystems?.filter((s) => s.work_type === 'SVC') ?? []
    return svc.length > 0 && svc.length === (initialSystems?.length ?? 0)
  })
  // Client and site targets are chosen INDEPENDENTLY: a quote can pair an
  // existing client with a brand-new site, a new prospect client with an
  // existing site, etc. `clientMode`/`siteMode` drive which set of fields is
  // persisted (existing id XOR new prospect fields), per target.
  const [clientMode, setClientMode] = useState<'existing' | 'new'>(
    quote?.prospect_name && !quote?.client_id ? 'new' : 'existing',
  )
  const [siteMode, setSiteMode] = useState<'existing' | 'new'>(
    (quote?.prospect_site_name || quote?.prospect_name) && !quote?.site_id ? 'new' : 'existing',
  )
  // Issuing branch: existing quote's branch, else the preparer's own branch.
  const [branchId, setBranchId] = useState(quote?.branch_id ?? defaultBranchId ?? '')
  const [clientId, setClientId] = useState(quote?.client_id ?? initialClientId ?? '')
  const [siteId, setSiteId] = useState(quote?.site_id ?? initialSiteId ?? '')
  const [clientPickerOpen, setClientPickerOpen] = useState(false)
  const [sitePickerOpen, setSitePickerOpen] = useState(false)
  const [prospectName, setProspectName] = useState(quote?.prospect_name ?? '')
  const [prospectContact, setProspectContact] = useState(quote?.prospect_contact ?? '')
  const [prospectEmail, setProspectEmail] = useState(quote?.prospect_email ?? '')
  const [prospectPhone, setProspectPhone] = useState(quote?.prospect_phone ?? '')
  const [prospectAddress, setProspectAddress] = useState(quote?.prospect_address ?? '')
  // New-site prospect fields (independent of the client prospect fields above).
  const [prospectSiteName, setProspectSiteName] = useState(quote?.prospect_site_name ?? '')
  const [prospectSiteContact, setProspectSiteContact] = useState(quote?.prospect_site_contact ?? '')
  const [prospectSiteEmail, setProspectSiteEmail] = useState(quote?.prospect_site_email ?? '')
  const [prospectSitePhone, setProspectSitePhone] = useState(quote?.prospect_site_phone ?? '')
  const [prospectSiteAddress, setProspectSiteAddress] = useState(quote?.prospect_site_address ?? '')
  // Scope / summary is no longer edited in the form, but we preserve any
  // previously-saved value so editing a quote doesn't wipe it.
  const [summary] = useState(quote?.summary ?? '')
  // New quotes start with the standard terms line; existing quotes keep whatever was saved.
  const [terms, setTerms] = useState(quote ? (quote.terms ?? '') : DEFAULT_QUOTE_TERMS)
  const [notes, setNotes] = useState(quote?.notes ?? initialNotes ?? '')
  const [vatRate, setVatRate] = useState(String(quote?.vat_rate ?? 20))
  const [discount, setDiscount] = useState(penceToPounds(quote?.discount_pence ?? 0))
  const [validUntil, setValidUntil] = useState(quote?.valid_until ?? '')
  const [showLineItems, setShowLineItems] = useState(quote?.show_line_items ?? true)
  const [showEquipmentSpec, setShowEquipmentSpec] = useState(quote?.show_equipment_spec ?? false)
  // Optional extras are hidden from the client quote by default; staff opt in
  // per-quote. When off, optional lines never render on the public quote/PDF.
  const [showOptionalExtras, setShowOptionalExtras] = useState(
    quote?.show_optional_extras ?? false,
  )

  // Append the modernised maintenance service agreement to the quote document.
  // Defaults on so it's auto-included on maintenance quotes (payload gates it on
  // the quote actually being a maintenance quote — see buildPayload).
  const [showMaintenanceAgreement, setShowMaintenanceAgreement] = useState(
    quote?.show_maintenance_agreement ?? true,
  )
  // Routine-maintenance pricing calculator dialog.
  const [maintCalcOpen, setMaintCalcOpen] = useState(false)
  // System the maintenance service line should be added to (per-system button);
  // null in the isolated maintenance-only flow.
  const [maintAddTarget, setMaintAddTarget] = useState<string | null>(null)
  // Fire-asset counts inferred from a system's lines, to seed the calculator.
  const [maintInitialFire, setMaintInitialFire] = useState<Record<string, number> | null>(null)
  // Existing line being re-viewed/adjusted via its saved snapshot.
  const [maintViewTarget, setMaintViewTarget] = useState<{ systemKey: string; lineKey: string } | null>(null)
  const [maintViewSnapshot, setMaintViewSnapshot] = useState<MaintenanceSnapshot | null>(null)

  // Installation pricing calculator dialog.
  const [installCalcOpen, setInstallCalcOpen] = useState(false)
  // Existing line being re-viewed/adjusted via its saved snapshot.
  const [installViewTarget, setInstallViewTarget] = useState<{ systemKey: string; lineKey: string } | null>(null)
  const [installViewSnapshot, setInstallViewSnapshot] = useState<InstallationSnapshot | null>(null)

  // ----- Client-request requirements matrix state -----
  const [requirements, setRequirements] = useState<DraftRequirement[]>(
    initialRequirements ?? [],
  )
  const [requirementSource, setRequirementSource] = useState<RequirementSourceInfo | null>(
    initialRequirementSource ?? null,
  )
  const [showRequirementsMatrix, setShowRequirementsMatrix] = useState(
    quote?.show_requirements_matrix ?? false,
  )

  // ----- Systems / lines state -----
  const [systems, setSystems] = useState<EditSystem[]>(() => {
    if (initialSystems && initialSystems.length > 0) {
      return initialSystems
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((s) => ({
          key: s.id,
          system_type_id: s.system_type_id,
          system_name: s.system_name,
          system_code: s.system_code,
          work_type: s.work_type,
          specification: s.specification ?? '',
          conditional_values: s.conditional_values ?? {},
          design_category_id: s.design_category_id,
          design_overview: s.design_overview ?? '',
          designed_by: s.designed_by ?? 'pyrocel',
          designed_by_name: s.designed_by_name ?? '',
          drawing_reference: s.drawing_reference ?? '',
          survey_carried_out: s.survey_carried_out,
          survey_by: s.survey_by ?? '',
          survey_date: s.survey_date ?? '',
          margin: String(s.margin_percent ?? defaultMarginPercent ?? 0),
          lines: (initialLines ?? [])
            .filter((l) => l.system_id === s.id)
            .sort((a, b) => a.position - b.position)
            .map((l) => ({
              key: l.id,
              productCode: l.product_code ?? '',
              description: l.description,
              detail: l.detail ?? '',
              service_type_id: l.service_type_id,
              is_service: l.is_service ?? false,
              catalogue_item_id: l.catalogue_item_id,
            quantity: String(l.quantity),
            unit: l.unit ?? '',
            unitCost: penceToPounds(l.unit_cost_pence),
            margin: l.margin_percent === null || l.margin_percent === undefined ? '' : String(l.margin_percent),
            is_optional: l.is_optional ?? false,
            option_group: l.option_group ?? null,
            standard: l.standard ?? null,
            calculatorSnapshot: parseCalculatorSnapshot(l.calculator_snapshot),
          })),
          ppm: ppmToDraft((initialPpm ?? []).find((p) => p.quote_system_id === s.id) ?? null),
        }))
    }
    const base = blankSystem(1, defaultMarginPercent)
    // Seed a brand-new quote raised from a defect with the originating service's
    // system type, the work type (Remedial), and the scope as the specification.
    if (initialSystemTypeId || initialWorkType || initialSpecification) {
      const workType = initialWorkType ?? base.work_type
      const systemTypeId = initialSystemTypeId ?? base.system_type_id
      const seededMargin =
        systemTypeId !== null
          ? resolveSystemWorkTypeMargin(systemWorkTypeMargins, systemTypeId, workType)
          : null
      return [
        {
          ...base,
          system_type_id: systemTypeId,
          work_type: workType,
          specification: initialSpecification ?? base.specification,
          margin: seededMargin !== null ? String(seededMargin) : base.margin,
        },
      ]
    }
    // A brand-new blank quote starts with no systems — the user adds the first
    // one via the "Add system" button (or the Installation calculator).
    return []
  })

  // Existing-site options: scoped to the selected client when one is chosen,
  // otherwise every site (so an existing site can be picked even when the client
  // is a new prospect). Labelled with the owning client name when unscoped.
  const siteOptions = useMemo(() => {
    const list = clientId ? sites.filter((s) => s.client_id === clientId) : sites
    const clientName = (id: string | null) =>
      id ? clients.find((c) => c.id === id)?.name ?? null : null
    return list.map((s) => ({
      id: s.id,
      name: s.name,
      clientName: clientId ? null : clientName(s.client_id),
    }))
  }, [sites, clients, clientId])

  // Auto-fill the quote title from the selected existing site's name until the
  // user edits the title themselves (tracked via titleDirty).
  useEffect(() => {
    if (titleDirty.current) return
    if (siteMode !== 'existing' || !siteId) return
    const site = siteOptions.find((s) => s.id === siteId)
    if (site?.name) setTitle(site.name)
  }, [siteId, siteMode, siteOptions])

  // ----- Live totals -----
  const totals = useMemo(() => {
    const lines = systems.flatMap((s) =>
      s.lines.map((l) => ({
        quantity: Number.parseFloat(l.quantity) || 0,
        unit_price_pence: lineSellPence(l, s),
        // Optional lines are excluded from the builder's core total (the client
        // selects them on the quote). client_selected stays null here.
        is_optional: l.is_optional,
        client_selected: null,
      })),
    )
    return computeQuoteTotals(lines, {
      vatRate: Number.parseFloat(vatRate) || 0,
      discountPence: poundsToPence(discount),
    })
  }, [systems, vatRate, discount])

  // ----- Zero-margin guard -----
  // Flag any costed product line whose effective margin resolves to 0% (or less)
  // — i.e. it would be sold at (or below) cost. Calculator-priced service lines
  // are excluded: their profit is embedded in the price and they intentionally
  // carry a 0% line margin (cost = sell). Shown as an always-on warning so a
  // preparer never sends a quote with an unpriced-for-profit item by mistake.
  const zeroMarginLines = useMemo(() => {
    const flagged: { system: string; line: string }[] = []
    systems.forEach((s, i) => {
      const sysName = s.system_name || `System ${i + 1}`
      for (const l of s.lines) {
        if (l.is_service) continue
        const cost = Number.parseFloat(l.unitCost) || 0
        if (cost <= 0) continue
        if (effectiveMargin(l, s) <= 0) {
          flagged.push({
            system: sysName,
            line: l.description.trim() || l.productCode.trim() || 'Unnamed item',
          })
        }
      }
    })
    return flagged
  }, [systems])

  // ----- Mutators -----
  function updateSystem(key: string, patch: Partial<EditSystem>) {
    setSystems((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  }
  function addSystem() {
    setSystems((prev) => [...prev, blankSystem(prev.length + 1, defaultMarginPercent)])
  }
  function removeSystem(key: string) {
    setSystems((prev) => prev.filter((s) => s.key !== key))
  }

  // Apply an AI-generated proposal from an imported client request. This only
  // ever *adds* to the quote and never touches pricing: suggested systems are
  // appended as blank-priced systems (staff add catalogue lines afterwards),
  // and the requirements matrix is populated for review. Existing content is
  // preserved; the title is only filled if currently empty.
  function applyImportedProposal(payload: ImportApplyPayload) {
    // Seed notes with the AI proposal notes only if the field is empty.
    if (payload.proposalNotes && !notes.trim()) setNotes(payload.proposalNotes)

    if (payload.suggestedSystems.length > 0) {
      setSystems((prev) => {
        const startIndex = prev.length
        const added: EditSystem[] = payload.suggestedSystems.map((sug, i) => {
          const base = blankSystem(startIndex + i + 1, defaultMarginPercent)
          const seededMargin =
            sug.system_type_id !== null
              ? resolveSystemWorkTypeMargin(
                  systemWorkTypeMargins,
                  sug.system_type_id,
                  sug.work_type,
                )
              : null
          const matchedType = sug.system_type_id
            ? systemTypes.find((t) => t.id === sug.system_type_id)
            : undefined
          return {
            ...base,
            system_type_id: sug.system_type_id ?? null,
            system_name: sug.system_name || base.system_name,
            system_code: matchedType?.code ?? base.system_code,
            work_type: sug.work_type || base.work_type,
            specification: sug.specification || '',
            margin: seededMargin !== null ? String(seededMargin) : base.margin,
          }
        })
        return [...prev, ...added]
      })
    }

    setRequirements(payload.requirements)
    setRequirementSource(payload.source)
    // Default to internal-only; staff opt in to showing the matrix to clients.
    setShowRequirementsMatrix(false)
    const sysCount = payload.suggestedSystems.length
    toast.success(
      `Imported ${payload.requirements.length} requirement${
        payload.requirements.length === 1 ? '' : 's'
      }${sysCount ? ` and ${sysCount} suggested system${sysCount === 1 ? '' : 's'}` : ''}`,
    )
  }
  function addLine(systemKey: string, line?: EditLine) {
    setSystems((prev) =>
      prev.map((s) => (s.key === systemKey ? { ...s, lines: [...s.lines, line ?? blankLine()] } : s)),
    )
  }
  function updateLine(systemKey: string, lineKey: string, patch: Partial<EditLine>) {
    setSystems((prev) =>
      prev.map((s) =>
        s.key === systemKey
          ? { ...s, lines: s.lines.map((l) => (l.key === lineKey ? { ...l, ...patch } : l)) }
          : s,
      ),
    )
  }
  function removeLine(systemKey: string, lineKey: string) {
    setSystems((prev) =>
      prev.map((s) =>
        s.key === systemKey ? { ...s, lines: s.lines.filter((l) => l.key !== lineKey) } : s,
      ),
    )
  }
  // Apply a PPM calculation: store the breakdown on the system and replace any
  // previous PPM line with a single priced "Annual PPM" line at the computed price.
  function applyPpm(systemKey: string, draft: PpmDraft) {
    setSystems((prev) =>
      prev.map((s) => {
        if (s.key !== systemKey) return s
        const ppmLine: EditLine = {
          key: uid(),
          productCode: '',
          description: `Annual PPM — ${s.system_name}`.trim(),
          detail: `${draft.num_visits} visit${draft.num_visits === 1 ? '' : 's'} per year`,
          service_type_id: null,
          is_service: false,
          catalogue_item_id: null,
          quantity: '1',
          unit: 'year',
          // The PPM calculator already produced a sell price (its own margin was
          // applied inside the dialog), so store it as cost at 0% margin.
          unitCost: penceToPounds(draft.computed_price_pence),
          margin: '0',
          is_optional: false,
          option_group: null,
          standard: null,
        }
        // Drop a previously-applied PPM line (same description) before re-adding.
        const otherLines = s.lines.filter(
          (l) => !l.description.startsWith('Annual PPM —') && l.description.trim() !== '',
        )
        return { ...s, ppm: draft, lines: [...otherLines, ppmLine] }
      }),
    )
    toast.success('PPM price applied to system')
  }

  function addCatalogueLine(systemKey: string, item: QuoteCatalogueItem) {
    addLine(systemKey, {
      key: uid(),
      productCode: item.product_code ?? '',
      description: item.name,
      // The catalogue's spec text is intentionally NOT pulled onto the quote line.
      // It stays in the catalogue and is only used for the equipment specification.
      detail: '',
      service_type_id: item.service_type_id,
      is_service: false,
      catalogue_item_id: item.id,
      quantity: '', // required: starts empty so the field highlights until filled
      unit: item.default_unit ?? '',
      // Bring in the catalogue item's cost; the part inherits the system margin
      // (which is auto-filled from the set-margins table) so it pulls through.
      unitCost: penceToPounds(item.unit_cost_pence),
      margin: '',
      is_optional: false,
      option_group: null,
      standard: null,
    })
  }

  // Link an existing line to a catalogue item (used by the product-code box).
  function applyCatalogueToLine(systemKey: string, lineKey: string, item: QuoteCatalogueItem) {
    updateLine(systemKey, lineKey, {
      productCode: item.product_code ?? '',
      description: item.name,
      // Spec text stays in the catalogue (used only for the equipment specification).
      detail: '',
      service_type_id: item.service_type_id,
      catalogue_item_id: item.id,
      unit: item.default_unit ?? '',
      unitCost: penceToPounds(item.unit_cost_pence),
      // Part inherits the system margin.
      margin: '',
    })
  }

  // Add a non-product service line seeded from a global Quote Service
  // (e.g. Installation, Decommission). It is flagged is_service so it groups
  // into the Services sub-section. The default price seeds the unit cost at
  // zero margin (sell = price); staff can adjust cost/qty/margin afterwards.
  function addServiceLine(systemKey: string, service: QuoteService) {
    addLine(systemKey, {
      key: uid(),
      productCode: '',
      description: service.name,
      detail: service.description ?? '',
      service_type_id: null,
      is_service: true,
      catalogue_item_id: null,
      quantity: '1',
      unit: '',
      unitCost:
        service.default_price_pence !== null ? penceToPounds(service.default_price_pence) : '0.00',
      margin: '0',
      is_optional: false,
      option_group: null,
      standard: null,
    })
  }

  // A maintenance quote if any system uses the Routine Maintenance (SVC) work
  // type. Drives the maintenance calculator + service-agreement surfaces.
  const isMaintenanceQuote = useMemo(
    () => systems.some((s) => quoteTypeFromWorkType(s.work_type) === 'service_contract'),
    [systems],
  )

  // Summary of the routine-maintenance pricing already added to the quote (if
  // any). Powers the "priced" state on the maintenance pricing card.
  const maintenanceSummary = useMemo(() => {
    const sys = systems.find((s) => quoteTypeFromWorkType(s.work_type) === 'service_contract')
    if (!sys) return null
    const total = sys.lines.reduce(
      (acc, l) => acc + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0),
      0,
    )
    return { lineCount: sys.lines.length, total }
  }, [systems])

  // Non-maintenance systems the installation calculator can add its service line
  // to. Falls back to a placeholder label for unnamed systems.
  const installSystemOptions = useMemo(
    () =>
      systems
        .filter((s) => quoteTypeFromWorkType(s.work_type) !== 'service_contract')
        .map((s, i) => ({ key: s.key, label: s.system_name || `System ${i + 1}` })),
    [systems],
  )

  // Replace an existing line's price + snapshot in place (used when a saved
  // calculation is re-opened, adjusted and re-applied).
  const updateLinePriceFromCalc = useCallback(
    (systemKey: string, lineKey: string, total: number, snapshot: CalculatorSnapshot) => {
      setSystems((prev) =>
        prev.map((s) =>
          s.key === systemKey
            ? {
                ...s,
                lines: s.lines.map((l) =>
                  l.key === lineKey
                    ? { ...l, quantity: '1', unitCost: total.toFixed(2), calculatorSnapshot: snapshot }
                    : l,
                ),
              }
            : s,
        ),
      )
    },
    [],
  )

  // Apply the maintenance calculator. Three paths:
  //  - view/adjust: update the originating line's price + snapshot in place.
  //  - per-system: add ONE "Routine Maintenance" service line (annual total) to
  //    the chosen system.
  //  - maintenance-only isolated flow: build the itemised Routine Maintenance
  //    system (Standard/Comprehensive options etc.), snapshot on the first line.
  // Sell-priced results are stored at cost = sell with 0% margin so the quote
  // total reproduces the calculator total exactly.
  const applyMaintenance = useCallback(
    (result: MaintenanceCalcResult) => {
      if (maintViewTarget) {
        updateLinePriceFromCalc(
          maintViewTarget.systemKey,
          maintViewTarget.lineKey,
          result.totalSale,
          result.snapshot,
        )
        setMaintViewTarget(null)
        setMaintViewSnapshot(null)
        toast.success('Maintenance price updated')
        return
      }

      if (maintAddTarget) {
        const target = maintAddTarget
        // Add one typed line per priced service (maintenance visits, weekly
        // testing, EL testing, monitoring, etc.) to the targeted system.
        const newLines = maintenanceResultToLines(result, systemTypes, serviceTypes)
        setSystems((prev) =>
          prev.map((s) => (s.key === target ? { ...s, lines: [...s.lines, ...newLines] } : s)),
        )
        setMaintAddTarget(null)
        setMaintInitialFire(null)
        toast.success(
          newLines.length === 1
            ? 'Maintenance added as a service line'
            : `Maintenance added as ${newLines.length} service lines`,
        )
        return
      }

      // Maintenance-only isolated flow: build ONE typed system per discipline
      // (Fire Alarm, Emergency Lighting, Intruder, …) so the accepted quote maps
      // straight onto a fully-typed contract review.
      const newSystems = maintenanceResultToSystems(result, systemTypes, serviceTypes)

      setSystems((prev) => {
        // Replace any prior calculator output (previous per-discipline systems or
        // the legacy single "Routine Maintenance" system) and drop empty default
        // systems, then append the freshly-built typed systems.
        const kept = prev.filter(
          (s) =>
            s.work_type !== 'SVC' &&
            !(s.lines.length === 0 && /^System \d+$/.test(s.system_name)),
        )
        return [...kept, ...newSystems]
      })
      toast.success(
        newSystems.length === 1
          ? 'Maintenance pricing added to the quote'
          : `Maintenance added as ${newSystems.length} systems`,
      )
    },
    [maintViewTarget, maintAddTarget, updateLinePriceFromCalc, systemTypes, serviceTypes],
  )

  // Apply the installation calculator. In view/adjust mode the originating line
  // is updated in place; otherwise a single "Installation" service line, priced
  // at the calculated total, is added to the chosen target system. Stored at
  // cost = sell with 0% margin so the quote reproduces the calculator total.
  const applyInstallation = useCallback(
    (result: InstallationCalcResult) => {
      if (installViewTarget) {
        updateLinePriceFromCalc(
          installViewTarget.systemKey,
          installViewTarget.lineKey,
          result.total,
          result.snapshot,
        )
        setInstallViewTarget(null)
        setInstallViewSnapshot(null)
        toast.success('Installation price updated')
        return
      }

      const target = result.targetSystemKey
      if (!target) {
        toast.error('Choose a system to add the installation to')
        return
      }
      const line: EditLine = {
        key: uid(),
        productCode: '',
        description: 'Installation',
        detail: '',
        service_type_id: null,
        is_service: true,
        catalogue_item_id: null,
        quantity: '1',
        unit: '',
        unitCost: result.total.toFixed(2),
        margin: '0',
        is_optional: false,
        option_group: null,
        standard: null,
        calculatorSnapshot: result.snapshot,
      }
      setSystems((prev) =>
        prev.map((s) => (s.key === target ? { ...s, lines: [...s.lines, line] } : s)),
      )
      toast.success('Installation added as a service line')
    },
    [installViewTarget, updateLinePriceFromCalc],
  )

  // Open the maintenance calculator for a specific system, pre-filling fire
  // asset counts inferred from that system's product lines.
  const openMaintenanceForSystem = useCallback((systemKey: string) => {
    setSystems((prev) => {
      const sys = prev.find((s) => s.key === systemKey)
      setMaintInitialFire(sys ? inferFireAssetsFromLines(sys.lines) : null)
      return prev
    })
    setMaintAddTarget(systemKey)
    setMaintViewTarget(null)
    setMaintViewSnapshot(null)
    setMaintCalcOpen(true)
  }, [])

  // Re-open a saved calculation for a line so it can be viewed / adjusted.
  const viewLineCalculation = useCallback(
    (systemKey: string, line: EditLine) => {
      const snap = parseCalculatorSnapshot(line.calculatorSnapshot)
      if (!snap) return
      if (snap.kind === 'installation') {
        setInstallViewTarget({ systemKey, lineKey: line.key })
        setInstallViewSnapshot(snap)
        setInstallCalcOpen(true)
      } else {
        setMaintViewTarget({ systemKey, lineKey: line.key })
        setMaintViewSnapshot(snap)
        setMaintAddTarget(null)
        setMaintInitialFire(null)
        setMaintCalcOpen(true)
      }
    },
    [],
  )

  const buildPayload = useCallback((): QuoteInput => {
    return {
      id: quote?.id,
      title,
      // Quote type is no longer a header field — derive it from the systems.
      // Routine Maintenance only wins when every meaningful (non-empty) system
      // is SVC, so a stray empty system can't mask the real quote type.
      quote_type: deriveQuoteTypeFromSystems(
        systems.map((s) => ({ work_type: s.work_type, hasContent: s.lines.length > 0 })),
      ),
      branch_id: branchId || null,
      // Client and site are independent: persist an existing id XOR the new
      // prospect fields for each, so any combination is supported.
      client_id: clientMode === 'existing' ? clientId || null : null,
      site_id: siteMode === 'existing' ? siteId || null : null,
      prospect_name: clientMode === 'new' ? prospectName || null : null,
      prospect_contact: clientMode === 'new' ? prospectContact || null : null,
      prospect_email: clientMode === 'new' ? prospectEmail || null : null,
      prospect_phone: clientMode === 'new' ? prospectPhone || null : null,
      prospect_address: clientMode === 'new' ? prospectAddress || null : null,
      prospect_site_name: siteMode === 'new' ? prospectSiteName || null : null,
      prospect_site_contact: siteMode === 'new' ? prospectSiteContact || null : null,
      prospect_site_email: siteMode === 'new' ? prospectSiteEmail || null : null,
      prospect_site_phone: siteMode === 'new' ? prospectSitePhone || null : null,
      prospect_site_address: siteMode === 'new' ? prospectSiteAddress || null : null,
      summary: summary || null,
      terms: terms || null,
      notes: notes || null,
      vat_rate: Number.parseFloat(vatRate) || 0,
      discount_pence: poundsToPence(discount),
      show_line_items: showLineItems,
      show_equipment_spec: showEquipmentSpec,
      show_optional_extras: showOptionalExtras,
      // Design overview / survey section has been removed from the quote
      // document, so it is never included.
      show_design_overview: false,
      // Only meaningful for maintenance quotes; force off otherwise.
      show_maintenance_agreement: isMaintenanceQuote && showMaintenanceAgreement,
      valid_until: validUntil || null,
      systems: systems.map((s) => ({
        system_type_id: s.system_type_id,
        system_name: s.system_name,
        system_code: s.system_code,
        work_type: s.work_type,
        specification: s.specification || null,
        conditional_values: s.conditional_values,
        design_category_id: s.design_category_id,
        design_overview: s.design_overview || null,
        designed_by: s.designed_by,
        designed_by_name: s.designed_by === 'other' ? s.designed_by_name || null : null,
        drawing_reference: s.drawing_reference || null,
        survey_carried_out: s.survey_carried_out,
        survey_by: s.survey_carried_out ? s.survey_by || null : null,
        survey_date: s.survey_carried_out ? s.survey_date || null : null,
        margin_percent: Number.parseFloat(s.margin) || 0,
        ppm: s.ppm,
        lines: s.lines
          .filter((l) => l.description.trim())
          .map((l) => ({
            description: l.description,
            detail: l.detail || null,
            service_type_id: l.service_type_id,
            is_service: l.is_service,
            catalogue_item_id: l.catalogue_item_id,
            product_code: l.productCode.trim() || null,
            quantity: Number.parseFloat(l.quantity) || 0,
            unit: l.unit || null,
            unit_cost_pence: poundsToPence(l.unitCost),
            margin_percent: l.margin.trim() === '' ? null : Number.parseFloat(l.margin) || 0,
            is_optional: l.is_optional,
            option_group: l.option_group,
            standard: l.standard,
            calculator_snapshot: l.calculatorSnapshot ?? null,
          })),
      })),
      show_requirements_matrix: showRequirementsMatrix,
      requirements: requirements
        .filter((r) => r.requirement.trim())
        .map((r) => ({
          category: r.category || null,
          requirement: r.requirement,
          our_response: r.our_response || null,
          status: r.status,
        })),
      requirementSource,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    quote?.id,
    title,
    requirements,
    requirementSource,
    showRequirementsMatrix,
    branchId,
    isMaintenanceQuote,
    showMaintenanceAgreement,
    clientMode,
    siteMode,
    clientId,
    siteId,
    prospectName,
    prospectContact,
    prospectEmail,
    prospectPhone,
    prospectAddress,
    prospectSiteName,
    prospectSiteContact,
    prospectSiteEmail,
    prospectSitePhone,
    prospectSiteAddress,
    summary,
    terms,
    notes,
    vatRate,
    discount,
    validUntil,
    showLineItems,
    showEquipmentSpec,
    showOptionalExtras,
    systems,
  ])

  function handleSave() {
    const payload = buildPayload()
    startTransition(async () => {
      const res = await saveQuote(payload)
      if (res.ok && res.id) {
        // When raised from a defect, link the new quote back and mark the
        // defect as quoted so it drops out of the "open" list.
        if (defectId && !quote?.id) {
          await linkDefectToQuote(defectId, res.id)
        }
        // The quote now lives in the database, so drop the local draft copy.
        clearDraft()
        toast.success('Quote saved')
        if (quote?.id) router.refresh()
        else router.push(`/dashboard/sales/${res.id}`)
      } else {
        toast.error(res.error ?? 'Could not save quote')
      }
    })
  }

  // ----- Debounced autosave (existing draft quotes only) -----
  // Sent/accepted quotes are read-only; brand-new quotes are saved explicitly
  // first (we need an id before autosaving), so autosave only runs for drafts
  // that already exist.
  const canAutosave = Boolean(quote?.id) && quote?.status === 'draft' && !readOnly
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  // Skip the first render so loading a quote doesn't immediately trigger a save.
  const hasMounted = useRef(false)

  useEffect(() => {
    if (!canAutosave) return
    if (!hasMounted.current) {
      hasMounted.current = true
      return
    }
    if (!title.trim()) return

    setAutosaveState('saving')
    const handle = setTimeout(async () => {
      const res = await saveQuote(buildPayload())
      setAutosaveState(res.ok ? 'saved' : 'error')
    }, 1500)

    return () => clearTimeout(handle)
  }, [canAutosave, title, buildPayload])

  // ----- New-quote draft persistence (localStorage) -----
  // Brand-new quotes have no id to autosave against, so if the user navigates
  // away mid-build we'd lose everything. Keep the in-progress draft in
  // localStorage, restore it on return, and clear it once the quote is saved.
  const isNewQuote = !quote?.id && !readOnly
  const draftKey = `pyrocel:new-quote-draft:${defectId ?? 'blank'}`
  const [draftRestored, setDraftRestored] = useState(false)
  // Skip the first save-effect run so the initial defaults never overwrite a
  // previously-stored draft before the restore effect has applied it.
  const draftSaveMounted = useRef(false)

  const clearDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(draftKey)
    } catch {
      // ignore storage errors (private mode, quota, etc.)
    }
  }, [draftKey])

  // Restore once on mount.
  useEffect(() => {
    if (!isNewQuote) return
    try {
      const raw = window.localStorage.getItem(draftKey)
      if (!raw) return
      const d = JSON.parse(raw) as Record<string, unknown>
      if (typeof d.title === 'string') {
        setTitle(d.title)
        titleDirty.current = Boolean(d.title)
      }
      if (typeof d.maintenanceOnly === 'boolean') setMaintenanceOnly(d.maintenanceOnly)
      if (d.clientMode === 'existing' || d.clientMode === 'new') setClientMode(d.clientMode)
      if (d.siteMode === 'existing' || d.siteMode === 'new') setSiteMode(d.siteMode)
      if (typeof d.branchId === 'string') setBranchId(d.branchId)
      if (typeof d.clientId === 'string') setClientId(d.clientId)
      if (typeof d.siteId === 'string') setSiteId(d.siteId)
      if (typeof d.prospectName === 'string') setProspectName(d.prospectName)
      if (typeof d.prospectContact === 'string') setProspectContact(d.prospectContact)
      if (typeof d.prospectEmail === 'string') setProspectEmail(d.prospectEmail)
      if (typeof d.prospectPhone === 'string') setProspectPhone(d.prospectPhone)
      if (typeof d.prospectAddress === 'string') setProspectAddress(d.prospectAddress)
      if (typeof d.prospectSiteName === 'string') setProspectSiteName(d.prospectSiteName)
      if (typeof d.prospectSiteContact === 'string') setProspectSiteContact(d.prospectSiteContact)
      if (typeof d.prospectSiteEmail === 'string') setProspectSiteEmail(d.prospectSiteEmail)
      if (typeof d.prospectSitePhone === 'string') setProspectSitePhone(d.prospectSitePhone)
      if (typeof d.prospectSiteAddress === 'string') setProspectSiteAddress(d.prospectSiteAddress)
      if (typeof d.terms === 'string') setTerms(d.terms)
      if (typeof d.notes === 'string') setNotes(d.notes)
      if (typeof d.vatRate === 'string') setVatRate(d.vatRate)
      if (typeof d.discount === 'string') setDiscount(d.discount)
      if (typeof d.validUntil === 'string') setValidUntil(d.validUntil)
      if (typeof d.showLineItems === 'boolean') setShowLineItems(d.showLineItems)
      if (typeof d.showEquipmentSpec === 'boolean') setShowEquipmentSpec(d.showEquipmentSpec)
    if (typeof d.showOptionalExtras === 'boolean') setShowOptionalExtras(d.showOptionalExtras)
      if (typeof d.showMaintenanceAgreement === 'boolean')
        setShowMaintenanceAgreement(d.showMaintenanceAgreement)
      if (typeof d.showRequirementsMatrix === 'boolean')
        setShowRequirementsMatrix(d.showRequirementsMatrix)
      if (Array.isArray(d.requirements)) setRequirements(d.requirements as DraftRequirement[])
      if (d.requirementSource !== undefined)
        setRequirementSource((d.requirementSource as RequirementSourceInfo | null) ?? null)
      if (Array.isArray(d.systems) && d.systems.length > 0)
        setSystems(d.systems as EditSystem[])
      setDraftRestored(true)
    } catch {
      // corrupt/unparseable draft — ignore and carry on with a fresh form.
    }
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounced save whenever any persisted field changes.
  useEffect(() => {
    if (!isNewQuote) return
    if (!draftSaveMounted.current) {
      draftSaveMounted.current = true
      return
    }
    const draft = {
      title,
      maintenanceOnly,
      clientMode,
      siteMode,
      branchId,
      clientId,
      siteId,
      prospectName,
      prospectContact,
      prospectEmail,
      prospectPhone,
      prospectAddress,
      prospectSiteName,
      prospectSiteContact,
      prospectSiteEmail,
      prospectSitePhone,
      prospectSiteAddress,
      terms,
      notes,
      vatRate,
      discount,
      validUntil,
      showLineItems,
      showEquipmentSpec,
      showOptionalExtras,
      showMaintenanceAgreement,
      showRequirementsMatrix,
      requirements,
      requirementSource,
      systems,
    }
    const handle = setTimeout(() => {
      try {
        window.localStorage.setItem(draftKey, JSON.stringify(draft))
      } catch {
        // ignore storage errors (private mode, quota, etc.)
      }
    }, 500)
    return () => clearTimeout(handle)
  }, [
    isNewQuote,
    draftKey,
    title,
    maintenanceOnly,
    clientMode,
    siteMode,
    branchId,
    clientId,
    siteId,
    prospectName,
    prospectContact,
    prospectEmail,
    prospectPhone,
    prospectAddress,
    prospectSiteName,
    prospectSiteContact,
    prospectSiteEmail,
    prospectSitePhone,
    prospectSiteAddress,
    terms,
    notes,
    vatRate,
    discount,
    validUntil,
    showLineItems,
    showEquipmentSpec,
    showOptionalExtras,
    showMaintenanceAgreement,
    showRequirementsMatrix,
    requirements,
    requirementSource,
    systems,
  ])

  const disabled = readOnly || isPending

  return (
    <div className="space-y-6">
      {/* Unsaved-draft notice: we recovered the in-progress quote from a previous
          session so nothing was lost when the user navigated away. */}
      {draftRestored && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <span className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 shrink-0" />
            Restored your unsaved draft from a previous session.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              clearDraft()
              window.location.reload()
            }}
          >
            Discard draft
          </Button>
        </div>
      )}

      {/* ---------- Quote details ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Quote details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Issuing branch */}
          {branches.length > 0 && (
            <div className="grid gap-1.5">
              <Label htmlFor="q-branch" className="flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Issuing branch
              </Label>
              <Select value={branchId} onValueChange={setBranchId} disabled={disabled}>
                <SelectTrigger id="q-branch" className="sm:w-72">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                The branch responsible for this quote — its details appear on the quote document.
              </span>
            </div>
          )}

          {/* ---- Client: existing record OR new prospect ---- */}
          <div className="grid gap-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-sm font-medium">Client</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={clientMode === 'existing' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setClientMode('existing')}
                  disabled={disabled}
                >
                  Existing client
                </Button>
                <Button
                  type="button"
                  variant={clientMode === 'new' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setClientMode('new')}
                  disabled={disabled}
                >
                  New client
                </Button>
              </div>
            </div>

            {clientMode === 'existing' ? (
              <Popover open={clientPickerOpen} onOpenChange={setClientPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="q-client"
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={clientPickerOpen}
                    disabled={disabled}
                    className="justify-between font-normal"
                  >
                    <span className="truncate">
                      {clientId ? clients.find((c) => c.id === clientId)?.name ?? 'Select client' : 'Select client'}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search clients..." />
                    <CommandList>
                      <CommandEmpty>No client found.</CommandEmpty>
                      <CommandGroup>
                        {clients.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.name}
                            onSelect={() => {
                              setClientId(c.id === clientId ? '' : c.id)
                              // Existing sites are client-scoped, so clear a stale pick.
                              if (siteMode === 'existing') setSiteId('')
                              setClientPickerOpen(false)
                            }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${clientId === c.id ? 'opacity-100' : 'opacity-0'}`} />
                            <span className="truncate">{c.name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {!disabled && (
                  <div className="sm:col-span-2">
                    <AddressFinder
                      label="Find prospect business or address"
                      hint="Search by business name or address to auto-fill the client details."
                      onSelect={(p: PlaceResult) => {
                        if (p.name && !prospectName) setProspectName(p.name)
                        if (p.address) setProspectAddress(p.address)
                        if (p.phone && !prospectPhone) setProspectPhone(p.phone)
                      }}
                    />
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label htmlFor="p-name">Client / prospect name *</Label>
                  <Input id="p-name" value={prospectName} onChange={(e) => setProspectName(e.target.value)} disabled={disabled} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="p-contact">Contact name</Label>
                  <Input id="p-contact" value={prospectContact} onChange={(e) => setProspectContact(e.target.value)} disabled={disabled} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="p-email">Email</Label>
                  <Input id="p-email" type="email" value={prospectEmail} onChange={(e) => setProspectEmail(e.target.value)} disabled={disabled} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="p-phone">Phone</Label>
                  <Input id="p-phone" value={prospectPhone} onChange={(e) => setProspectPhone(e.target.value)} disabled={disabled} />
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="p-address">Client address</Label>
                  <Input id="p-address" value={prospectAddress} onChange={(e) => setProspectAddress(e.target.value)} disabled={disabled} />
                </div>
              </div>
            )}
          </div>

          {/* ---- Site: existing record OR new address (independent of client) ---- */}
          <div className="grid gap-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-sm font-medium">Site</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={siteMode === 'existing' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSiteMode('existing')}
                  disabled={disabled}
                >
                  Existing site
                </Button>
                <Button
                  type="button"
                  variant={siteMode === 'new' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSiteMode('new')}
                  disabled={disabled}
                >
                  New site
                </Button>
              </div>
            </div>

            {siteMode === 'existing' ? (
              <Popover open={sitePickerOpen} onOpenChange={setSitePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="q-site"
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={sitePickerOpen}
                    disabled={disabled}
                    className="justify-between font-normal"
                  >
                    <span className="truncate">
                      {siteId ? siteOptions.find((s) => s.id === siteId)?.name ?? 'Select site' : 'Select site (optional)'}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search sites..." />
                    <CommandList>
                      <CommandEmpty>No site found.</CommandEmpty>
                      <CommandGroup>
                        {siteOptions.map((s) => (
                          <CommandItem
                            key={s.id}
                            value={`${s.name} ${s.clientName ?? ''}`}
                            onSelect={() => {
                              setSiteId(s.id === siteId ? '' : s.id)
                              setSitePickerOpen(false)
                            }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${siteId === s.id ? 'opacity-100' : 'opacity-0'}`} />
                            <span className="truncate">
                              {s.name}
                              {s.clientName ? <span className="text-muted-foreground"> · {s.clientName}</span> : null}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {!disabled && (
                  <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                    <div className="min-w-[220px] flex-1">
                      <AddressFinder
                        label="Find site business or address"
                        hint="Search by business name or address to auto-fill the site details."
                        onSelect={(p: PlaceResult) => {
                          if (p.name && !prospectSiteName) setProspectSiteName(p.name)
                          if (p.address) setProspectSiteAddress(p.address)
                          if (p.phone && !prospectSitePhone) setProspectSitePhone(p.phone)
                        }}
                      />
                    </div>
                    {clientMode === 'new' && (prospectName || prospectAddress) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (!prospectSiteName && prospectName) setProspectSiteName(prospectName)
                          if (prospectAddress) setProspectSiteAddress(prospectAddress)
                        }}
                        disabled={disabled}
                      >
                        Same as client address
                      </Button>
                    )}
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label htmlFor="ps-name">Site name *</Label>
                  <Input id="ps-name" value={prospectSiteName} onChange={(e) => setProspectSiteName(e.target.value)} disabled={disabled} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ps-contact">Site contact</Label>
                  <Input id="ps-contact" value={prospectSiteContact} onChange={(e) => setProspectSiteContact(e.target.value)} disabled={disabled} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ps-email">Email</Label>
                  <Input id="ps-email" type="email" value={prospectSiteEmail} onChange={(e) => setProspectSiteEmail(e.target.value)} disabled={disabled} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ps-phone">Phone</Label>
                  <Input id="ps-phone" value={prospectSitePhone} onChange={(e) => setProspectSitePhone(e.target.value)} disabled={disabled} />
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="ps-address">Site address</Label>
                  <Input id="ps-address" value={prospectSiteAddress} onChange={(e) => setProspectSiteAddress(e.target.value)} disabled={disabled} />
                </div>
              </div>
            )}
          </div>

          {/* Title — placed after client/site so it reads naturally and can
              auto-follow the selected site name until manually edited. */}
          <div className="grid gap-1.5">
            <Label htmlFor="q-title">Title *</Label>
            <Input
              id="q-title"
              value={title}
              onChange={(e) => {
                titleDirty.current = true
                setTitle(e.target.value)
              }}
              placeholder="e.g. Fire alarm upgrade — Block A"
              disabled={disabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* ---------- Maintenance quote only (own section) ---------- */}
      {!readOnly && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              Maintenance quote only
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div className="grid gap-0.5">
                <span className="text-sm font-medium">Enable maintenance-only mode</span>
                <span className="text-xs text-muted-foreground text-pretty">
                  Hides the client request and systems sections and focuses this quote on the
                  routine-maintenance pricing calculator.
                </span>
              </div>
              <Button
                type="button"
                variant={maintenanceOnly ? 'default' : 'outline'}
                onClick={() => setMaintenanceOnly((prev) => !prev)}
                disabled={disabled}
                className="shrink-0"
              >
                {maintenanceOnly ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Maintenance-only on
                  </>
                ) : (
                  <>
                    <Wrench className="mr-2 h-4 w-4" />
                    Enable
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------- Routine maintenance pricing (maintenance-only mode) ----------
        Only shown when "Maintenance quote only" is enabled. Opening the
        calculator here (no target system) drives the isolated itemised flow
        that auto-creates the Routine Maintenance system. */}
      {maintenanceOnly && (
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-muted-foreground" />
              Routine maintenance pricing
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              {maintenanceSummary
                ? 'Recalculate to update the annual maintenance lines on this quote.'
                : 'Add a maintenance service to this quote. Enter the on-site asset counts and the calculator prices each discipline and adds itemised annual lines automatically.'}
            </p>
          </div>
          {!readOnly && (
            <Button
              type="button"
              variant={maintenanceSummary ? 'outline' : 'default'}
              onClick={() => {
                setMaintAddTarget(null)
                setMaintInitialFire(null)
                setMaintViewTarget(null)
                setMaintViewSnapshot(null)
                setMaintCalcOpen(true)
              }}
              disabled={isPending}
            >
              <Calculator className="mr-2 h-4 w-4" />
              {maintenanceSummary ? 'Recalculate' : 'Add maintenance pricing'}
            </Button>
          )}
        </CardHeader>
        {isMaintenanceQuote && (
          <CardContent className="space-y-3">
            {/* Priced state summary */}
            {maintenanceSummary && (
              <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/40 p-3 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                  {maintenanceSummary.lineCount} maintenance{' '}
                  {maintenanceSummary.lineCount === 1 ? 'line' : 'lines'} priced
                </span>
                <span className="font-semibold tabular-nums">
                  {maintenanceSummary.total.toLocaleString('en-GB', {
                    style: 'currency',
                    currency: 'GBP',
                  })}
                  {' / yr'}
                </span>
              </div>
            )}

            {/* Service agreement toggle */}
            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div className="grid gap-0.5">
                <Label htmlFor="q-show-agreement" className="cursor-pointer">
                  Include maintenance service agreement
                </Label>
                <span className="text-xs text-muted-foreground">
                  {showMaintenanceAgreement
                    ? 'The modernised service-agreement pages (cover letter, cover summary and FAQs) are appended to the quote document and PDF.'
                    : 'No service agreement is appended to the quote document.'}
                </span>
              </div>
              <Switch
                id="q-show-agreement"
                checked={showMaintenanceAgreement}
                onCheckedChange={setShowMaintenanceAgreement}
                disabled={disabled}
              />
            </div>
          </CardContent>
        )}
      </Card>
      )}

      <MaintenanceCalculatorDialog
        open={maintCalcOpen}
        onOpenChange={(o) => {
          setMaintCalcOpen(o)
          if (!o) {
            setMaintAddTarget(null)
            setMaintInitialFire(null)
            setMaintViewTarget(null)
            setMaintViewSnapshot(null)
          }
        }}
        savedRates={savedMaintenanceRates}
        disabled={disabled}
        initialFireAssets={maintInitialFire}
        viewSnapshot={maintViewSnapshot}
        onApply={applyMaintenance}
      />

      <InstallationCalculatorDialog
        open={installCalcOpen}
        onOpenChange={(o) => {
          setInstallCalcOpen(o)
          if (!o) {
            setInstallViewTarget(null)
            setInstallViewSnapshot(null)
          }
        }}
        savedRates={savedInstallationRates}
        disabled={disabled}
        systems={installSystemOptions}
        viewSnapshot={installViewSnapshot}
        onApply={applyInstallation}
      />

      {/* ---------- Client request / requirements matrix ---------- */}
      {!readOnly && !maintenanceOnly && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Client request</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground text-pretty">
                Import a client email or specification. AI summarises it, extracts each
                requirement, and drafts our response — you review before it&apos;s saved.
              </p>
            </div>
            <QuoteRequestImporter
              systemTypes={systemTypes}
              onApply={applyImportedProposal}
            />
          </CardHeader>
          {(requirements.length > 0 || requirementSource) && (
            <CardContent>
              <QuoteRequirementsEditor
                requirements={requirements}
                onChange={setRequirements}
                source={requirementSource}
                showMatrix={showRequirementsMatrix}
                onShowMatrixChange={setShowRequirementsMatrix}
              />
            </CardContent>
          )}
        </Card>
      )}

      {/* ---------- Description of works required (remedial quotes) ----------
           When raising a remedial quote from a defect, the AI-drafted scope is
           seeded into the first system's specification. That field only renders
           if a spec_template section is configured for the system type + work
           type, so we surface it here explicitly to guarantee it's always shown
           (and editable) when creating the quote. Bound to the first system's
           specification so edits persist through save. */}
      {defectId && systems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              Description of works required
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              AI-drafted from the failed items on the originating report. Review
              and edit before sending.
            </p>
            <Textarea
              value={systems[0].specification}
              onChange={(e) =>
                updateSystem(systems[0].key, { specification: e.target.value })
              }
              rows={8}
              disabled={readOnly || isPending}
              placeholder="Description of the remedial works required."
            />
          </CardContent>
        </Card>
      )}

      {/* ---------- Systems ----------
        In maintenance-only mode only the Routine Maintenance (service_contract)
        systems are shown; otherwise the full multi-system builder is rendered. */}
      {systems
        .filter((system) =>
          maintenanceOnly
            ? quoteTypeFromWorkType(system.work_type) === 'service_contract'
            : true,
        )
        .map((system) =>
        quoteTypeFromWorkType(system.work_type) === 'service_contract' ? (
          // Maintenance systems are built by the calculator, so they get a
          // dedicated tidy view (priced lines + client options) instead of the
          // generic system-details / catalogue builder.
          <MaintenanceSystemCard
            key={system.key}
            system={system}
            canRemove={systems.length > 1}
            readOnly={readOnly}
            isPending={isPending}
            onUpdate={(patch) => updateSystem(system.key, patch)}
            onRemove={() => removeSystem(system.key)}
            onUpdateLine={(lineKey, patch) => updateLine(system.key, lineKey, patch)}
            onRemoveLine={(lineKey) => removeLine(system.key, lineKey)}
            onViewLineCalculation={(line) => viewLineCalculation(system.key, line)}
            onOpenCalculator={() => {
              setMaintAddTarget(null)
              setMaintInitialFire(null)
              setMaintViewTarget(null)
              setMaintViewSnapshot(null)
              setMaintCalcOpen(true)
            }}
          />
        ) : (
        <SystemCard
          key={system.key}
          system={system}
          canRemove={systems.length > 1}
          readOnly={readOnly}
          isPending={isPending}
          systemTypes={systemTypes}
          serviceTypes={serviceTypes}
          quoteServices={quoteServices}
          assetTypes={assetTypes}
          defaultHourlyCostPence={defaultHourlyCostPence}
                  specTemplates={specTemplates}
                  systemReferences={systemReferences}
                  workTypeFields={workTypeFields}
                  systemWorkTypeMargins={systemWorkTypeMargins}
                  workTypeSettings={workTypeSettings}
                  designCategories={designCategories}
                  bankValues={bankValues}
                  requirementSource={requirementSource}
                  onUpdate={(patch) => updateSystem(system.key, patch)}
                  onRemove={() => removeSystem(system.key)}
                  onAddLine={() => addLine(system.key)}
                  onAddCatalogueLine={(item) => addCatalogueLine(system.key, item)}
                  onApplyCatalogueToLine={(lineKey, item) =>
                    applyCatalogueToLine(system.key, lineKey, item)
                  }
                  onAddServiceLine={(service) => addServiceLine(system.key, service)}
                  onUpdateLine={(lineKey, patch) => updateLine(system.key, lineKey, patch)}
          onRemoveLine={(lineKey) => removeLine(system.key, lineKey)}
          onApplyPpm={(draft) => applyPpm(system.key, draft)}
          onOpenMaintenance={() => openMaintenanceForSystem(system.key)}
          onViewLineCalculation={(line) => viewLineCalculation(system.key, line)}
        />
        ),
      )}

      {!readOnly && !maintenanceOnly && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={addSystem} disabled={isPending}>
            <Plus className="mr-2 h-4 w-4" />
            Add system
          </Button>
          <Button
            variant="outline"
            onClick={() => setInstallCalcOpen(true)}
            disabled={isPending}
          >
            <HardHat className="mr-2 h-4 w-4" />
            Installation calculator
          </Button>
        </div>
      )}

      {/* ---------- Totals + terms ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Pricing &amp; terms</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="q-vat">VAT rate (%)</Label>
                <Input
                  id="q-vat"
                  inputMode="decimal"
                  value={vatRate}
                  onChange={(e) => setVatRate(e.target.value)}
                  disabled={disabled}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="q-discount">Discount (£)</Label>
                <Input
                  id="q-discount"
                  inputMode="decimal"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  disabled={disabled}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-valid">Valid until</Label>
              <Input
                id="q-valid"
                type="date"
                value={validUntil ?? ''}
                onChange={(e) => setValidUntil(e.target.value)}
                disabled={disabled}
                className="w-full sm:w-[12rem]"
              />
            </div>
            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div className="grid gap-0.5">
                <Label htmlFor="q-show-lines" className="cursor-pointer">
                  Itemise products on quote
                </Label>
                <span className="text-xs text-muted-foreground">
                  {showLineItems
                    ? 'Each product line and its price are shown.'
                    : 'Only system and overall totals are shown — individual products are hidden.'}
                </span>
              </div>
              <Switch
                id="q-show-lines"
                checked={showLineItems}
                onCheckedChange={setShowLineItems}
                disabled={disabled}
              />
            </div>
            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div className="grid gap-0.5">
                <Label htmlFor="q-show-spec" className="cursor-pointer">
                  Include equipment specification
                </Label>
                <span className="text-xs text-muted-foreground">
                  {showEquipmentSpec
                    ? 'A full equipment specification (part numbers + standard descriptions) is appended to the quote document and PDF.'
                    : 'No equipment specification is appended. It can still be produced separately at any time.'}
                </span>
              </div>
              <Switch
                id="q-show-spec"
                checked={showEquipmentSpec}
                onCheckedChange={setShowEquipmentSpec}
                disabled={disabled}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-terms">Terms &amp; conditions</Label>
              <Textarea
                id="q-terms"
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                placeholder="Payment terms, exclusions, etc. Shown on the quote."
                disabled={disabled}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-notes">Internal notes</Label>
              <Textarea
                id="q-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Not shown to the client."
                disabled={disabled}
              />
            </div>
          </div>

          {zeroMarginLines.length > 0 && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-destructive"
            >
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">
                  {zeroMarginLines.length === 1
                    ? '1 item has zero margin'
                    : `${zeroMarginLines.length} items have zero margin`}
                </p>
                <p className="text-pretty text-destructive/90">
                  The following {zeroMarginLines.length === 1 ? 'item is' : 'items are'} priced at
                  cost (no profit). Set a margin before sending:
                </p>
                <ul className="mt-1 list-disc pl-5 text-destructive/90">
                  {zeroMarginLines.slice(0, 6).map((z, idx) => (
                    <li key={idx}>
                      {z.system} — {z.line}
                    </li>
                  ))}
                  {zeroMarginLines.length > 6 && (
                    <li>and {zeroMarginLines.length - 6} more…</li>
                  )}
                </ul>
              </div>
            </div>
          )}

          <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium tabular-nums">{formatPence(totals.subtotalPence)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">VAT ({Number.parseFloat(vatRate) || 0}%)</span>
              <span className="font-medium tabular-nums">{formatPence(totals.vatPence)}</span>
            </div>
            <Separator className="my-2" />
            <div className="flex items-center justify-between text-lg font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatPence(totals.totalPence)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {(!readOnly || quote?.id) && (
        <div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-3">
          {canAutosave && autosaveState !== 'idle' && (
            <span
              className="rounded-md bg-background/80 px-3 py-1.5 text-sm text-muted-foreground shadow-sm backdrop-blur"
              aria-live="polite"
            >
              {autosaveState === 'saving' && 'Saving…'}
              {autosaveState === 'saved' && 'All changes saved'}
              {autosaveState === 'error' && (
                <span className="text-destructive">Couldn&apos;t autosave</span>
              )}
            </span>
          )}

          {/* View + Send are available once the quote is saved (they act on the
              persisted version). Drafts autosave; use Save first if unsure. */}
          {quote?.id && (
            <Button size="lg" variant="outline" className="shadow-lg" asChild>
              <a
                href={`/dashboard/sales/${quote.id}/print`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Eye className="mr-2 h-4 w-4" />
                View quote
              </a>
            </Button>
          )}

          {quote?.id && (
            <SendQuoteDialog
              quote={quote}
              trigger={
                <Button size="lg" variant="outline" className="shadow-lg">
                  <Send className="mr-2 h-4 w-4" />
                  Send quote
                </Button>
              }
            />
          )}

          {!readOnly && (
            <Button size="lg" onClick={handleSave} disabled={isPending || !title.trim()} className="shadow-lg">
              <Save className="mr-2 h-4 w-4" />
              {quote?.id ? 'Save changes' : 'Create quote'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

  // =====================================================================
  // Maintenance system card
  // ---------------------------------------------------------------------
  // Maintenance (service_contract) systems are priced by the calculator, so
  // they don't need the generic system-type / catalogue builder. This tidy
  // card just lists the priced lines, lets staff tweak the annual price and
  // flag client-selectable options (with a shared option group + standard).
  // =====================================================================
  interface MaintenanceSystemCardProps {
    system: EditSystem
    canRemove: boolean
    readOnly: boolean
    isPending: boolean
    onUpdate: (patch: Partial<EditSystem>) => void
    onRemove: () => void
    onUpdateLine: (lineKey: string, patch: Partial<EditLine>) => void
    onRemoveLine: (lineKey: string) => void
    onOpenCalculator: () => void
    onViewLineCalculation: (line: EditLine) => void
  }

  function MaintenanceSystemCard({
    system,
    canRemove,
    readOnly,
    isPending,
    onUpdate,
    onRemove,
    onUpdateLine,
    onRemoveLine,
    onOpenCalculator,
    onViewLineCalculation,
  }: MaintenanceSystemCardProps) {
    const disabled = readOnly || isPending
    const [open, setOpen] = useState(true)
    const priced = system.lines.filter((l) => l.description.trim())
    // Annual value excludes optional lines (the client picks those on the quote).
    const annualPence = priced
      .filter((l) => !l.is_optional)
      .reduce((sum, l) => sum + Math.round((Number.parseFloat(l.quantity) || 0) * lineSellPence(l, system)), 0)

    return (
      <Card className="border-l-2" style={{ borderLeftColor: getSystemHex('slate') }}>
        <Collapsible open={open} onOpenChange={setOpen}>
          <div className="flex items-center gap-2 px-6 py-4">
            <CollapsibleTrigger asChild>
              <button type="button" aria-expanded={open} className="flex flex-1 items-center gap-3 text-left">
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                    open && 'rotate-180',
                  )}
                />
                <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">
                  {system.system_name?.trim() || 'Routine Maintenance'}
                </span>
                <Badge variant="secondary" className="shrink-0">
                  SVC
                </Badge>
                <span className="ml-auto shrink-0 text-sm font-medium tabular-nums">
                  {formatPence(annualPence)}
                  {' / yr'}
                </span>
              </button>
            </CollapsibleTrigger>
            {!readOnly && canRemove && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground"
                onClick={onRemove}
                disabled={isPending}
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Remove system</span>
              </Button>
            )}
          </div>

          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div className="grid gap-1.5">
                <Label htmlFor={`maint-name-${system.key}`}>System name</Label>
                <Input
                  id={`maint-name-${system.key}`}
                  value={system.system_name}
                  onChange={(e) => onUpdate({ system_name: e.target.value })}
                  disabled={disabled}
                  placeholder="Routine Maintenance"
                />
              </div>

              {priced.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center">
                  <p className="text-sm text-muted-foreground text-pretty">
                    No maintenance lines yet. Use the maintenance calculator to price
                    the visits and generate the lines.
                  </p>
                  {!readOnly && (
                    <Button variant="outline" size="sm" onClick={onOpenCalculator} disabled={isPending}>
                      <Calculator className="mr-2 h-4 w-4" />
                      Open maintenance calculator
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {priced.map((line) => (
                    <div key={line.key} className="rounded-lg border p-3">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="font-medium text-sm text-pretty">{line.description}</p>
                          {line.detail && (
                            <p className="text-xs text-muted-foreground text-pretty">{line.detail}</p>
                          )}
                          {line.standard && (
                            <Badge variant="outline" className="text-xs font-normal">
                              {line.standard}
                            </Badge>
                          )}
                        </div>
                        <div className="grid w-32 shrink-0 gap-1">
                          <Label htmlFor={`maint-price-${line.key}`} className="text-xs text-muted-foreground">
                            Annual price
                          </Label>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                              £
                            </span>
                            <Input
                              id={`maint-price-${line.key}`}
                              value={line.unitCost}
                              onChange={(e) =>
                                onUpdateLine(line.key, { unitCost: e.target.value, margin: '0' })
                              }
                              disabled={disabled}
                              inputMode="decimal"
                              className="pl-5 text-right tabular-nums"
                            />
                          </div>
                        </div>
                        {line.calculatorSnapshot && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-muted-foreground"
                            onClick={() => onViewLineCalculation(line)}
                            disabled={isPending}
                            title="View calculation"
                          >
                            <Calculator className="h-4 w-4" />
                            <span className="sr-only">View calculation</span>
                          </Button>
                        )}
                        {!readOnly && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-muted-foreground"
                            onClick={() => onRemoveLine(line.key)}
                            disabled={isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Remove line</span>
                          </Button>
                        )}
                      </div>

                    </div>
                  ))}

                  {!readOnly && (
                    <Button variant="outline" size="sm" onClick={onOpenCalculator} disabled={isPending}>
                      <Calculator className="mr-2 h-4 w-4" />
                      Recalculate maintenance
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    )
  }

  // =====================================================================
  // System card
  // =====================================================================
  interface SystemCardProps {
  system: EditSystem
  canRemove: boolean
  readOnly: boolean
  isPending: boolean
  systemTypes: SystemType[]
  serviceTypes: ServiceType[]
  quoteServices: QuoteService[]
  assetTypes: AssetType[]
  defaultHourlyCostPence: number
  specTemplates: SystemSpecTemplate[]
  systemReferences: SystemReferenceLite[]
  workTypeFields: WorkTypeField[]
  systemWorkTypeMargins: SystemWorkTypeMargin[]
  workTypeSettings: WorkTypeSetting[]
  designCategories: QuoteDesignCategory[]
  bankValues: QuoteBankValue[]
  // The client's own brief for this quote (used to ground the AI spec builder).
  requirementSource: RequirementSourceInfo | null
  onUpdate: (patch: Partial<EditSystem>) => void
  onRemove: () => void
  onAddLine: () => void
  onAddCatalogueLine: (item: QuoteCatalogueItem) => void
  onApplyCatalogueToLine: (lineKey: string, item: QuoteCatalogueItem) => void
  onAddServiceLine: (service: QuoteService) => void
  onUpdateLine: (lineKey: string, patch: Partial<EditLine>) => void
  onRemoveLine: (lineKey: string) => void
  onApplyPpm: (draft: PpmDraft) => void
  // Open the maintenance calculator targeting this system (adds a single
  // Routine Maintenance service line at the calculated annual total).
  onOpenMaintenance: () => void
  // Re-open the calculator that produced a line's price (if it has a snapshot).
  onViewLineCalculation: (line: EditLine) => void
}

function SystemCard({
  system,
  canRemove,
  readOnly,
  isPending,
  systemTypes,
  quoteServices,
  assetTypes,
  defaultHourlyCostPence,
  specTemplates,
  systemReferences,
  workTypeFields,
  systemWorkTypeMargins,
  workTypeSettings,
  designCategories,
  bankValues,
  requirementSource,
  onUpdate,
  onRemove,
  onAddLine,
  onAddCatalogueLine,
  onApplyCatalogueToLine,
  onAddServiceLine,
  onUpdateLine,
  onRemoveLine,
  onApplyPpm,
  onOpenMaintenance,
  onViewLineCalculation,
}: SystemCardProps) {
  const disabled = readOnly || isPending
  const [ppmOpen, setPpmOpen] = useState(false)
  // Each system section is collapsible and starts collapsed to keep long
  // multi-system quotes scannable (header/summary stays visible).
  const [open, setOpen] = useState(false)
  const [catalogueOpen, setCatalogueOpen] = useState(false)
  const [catalogueSearch, setCatalogueSearch] = useState('')

  // The catalogue can hold tens of thousands of items, so we never load it all.
  // Results are fetched from the server on demand as the user types (debounced),
  // keeping page navigation and this popover fast and light.
  const [catalogueMatches, setCatalogueMatches] = useState<QuoteCatalogueItem[]>([])
  const [catalogueLoading, setCatalogueLoading] = useState(false)

  // Whether the configured sections include an editable specification field
  // (via a spec_template element). When none is configured we render a fallback
  // specification textarea so AI-built spec text is always visible.
  const [hasConfiguredSections, setHasConfiguredSections] = useState(false)

  // When a new part line is added (blank line or from the catalogue) we focus
  // its quantity box so the user can type the amount straight away. Services
  // default to qty 1, so we only auto-focus non-service lines.
  const qtyInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const prevLineKeysRef = useRef<Set<string>>(new Set(system.lines.map((l) => l.key)))
  useEffect(() => {
    const prev = prevLineKeysRef.current
    const added = system.lines.filter((l) => !prev.has(l.key) && !l.is_service)
    // Focus the most recently added part line's quantity field.
    const target = added.at(-1)
    if (target) {
      // Wait a frame so the input is mounted before focusing it.
      requestAnimationFrame(() => qtyInputRefs.current.get(target.key)?.focus())
    }
    prevLineKeysRef.current = new Set(system.lines.map((l) => l.key))
  }, [system.lines])

  useEffect(() => {
    if (!catalogueOpen) return
    let cancelled = false
    setCatalogueLoading(true)
    const handle = setTimeout(async () => {
      const results = await searchCatalogueItems(catalogueSearch, { limit: 50 })
      if (!cancelled) {
        setCatalogueMatches(results)
        setCatalogueLoading(false)
      }
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [catalogueOpen, catalogueSearch])

  // Asset types belonging to this system's system type (for the PPM calculator).
  const systemAssetTypes = useMemo(
    () =>
      system.system_type_id
        ? assetTypes.filter((a) => a.system_type_id === system.system_type_id && a.active)
        : [],
    [assetTypes, system.system_type_id],
  )

  // Global non-product services (Installation, Decommission, etc.), addable to
  // any system regardless of its system type. Only active ones are offered.
  const availableServices = useMemo(
    () =>
      quoteServices
        .filter((s) => s.active)
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [quoteServices],
  )

  const systemTotalPence = system.lines.reduce(
    (sum, l) => sum + Math.round((Number.parseFloat(l.quantity) || 0) * lineSellPence(l, system)),
    0,
  )

  // Conditional fields that apply to the selected system type AND work type.
  const conditionalFields = useMemo(
    () =>
      workTypeFields
        .filter(
          (f) =>
            f.active &&
            f.work_type === system.work_type &&
            f.system_type_id === system.system_type_id,
        )
        .sort((a, b) => a.position - b.position),
    [workTypeFields, system.work_type, system.system_type_id],
  )

  // Which optional sections apply to this work type (admin toggles). Questions
  // default to on; design and PPM default to off when no setting row exists.
  const workTypeSetting = useMemo(
    () => workTypeSettings.find((s) => s.work_type === system.work_type),
    [workTypeSettings, system.work_type],
  )
  const requiresDesign = workTypeSetting?.requires_design ?? false
  const requiresPpm = workTypeSetting?.requires_ppm ?? false
  const requiresQuestions = workTypeSetting?.requires_questions ?? true

  // Spec template matching this system type + work type.
  const matchingTemplate = useMemo(
    () =>
      specTemplates.find(
        (t) => t.system_type_id === system.system_type_id && t.work_type === system.work_type && t.active,
      ),
    [specTemplates, system.system_type_id, system.work_type],
  )

  // Quote-bank hint for this system code + work type.
  const bankStats = useMemo(() => {
    if (!system.system_code) return null
    const matches = bankValues.filter(
      (b) => b.system_code === system.system_code && b.work_type === system.work_type,
    )
    if (!matches.length) return null
    return computeBankStats(matches.map((m) => m.subtotal_pence))
  }, [bankValues, system.system_code, system.work_type])

  function handleSystemType(value: string) {
    const st = systemTypes.find((s) => s.id === value)
    const setMargin = resolveSystemWorkTypeMargin(systemWorkTypeMargins, value, system.work_type)
    onUpdate({
      system_type_id: value,
      system_code: st?.code ?? null,
      // Default the system name to the system type name if still blank/default.
      system_name:
        !system.system_name || system.system_name.startsWith('System ')
          ? st?.name ?? system.system_name
          : system.system_name,
      // Auto-fill the system margin from the set-margins table when available.
      ...(setMargin !== null ? { margin: String(setMargin) } : {}),
    })
  }

  function handleWorkType(value: string) {
    const setMargin = resolveSystemWorkTypeMargin(
      systemWorkTypeMargins,
      system.system_type_id,
      value,
    )
    onUpdate({
      work_type: value,
      ...(setMargin !== null ? { margin: String(setMargin) } : {}),
    })
  }

  function handleDesignCategory(value: string) {
    const cat = designCategories.find((c) => c.id === value)
    onUpdate({
      design_category_id: value,
      // Import overview if empty.
      design_overview: system.design_overview?.trim() ? system.design_overview : cat?.overview ?? '',
    })
  }

  function setConditional(key: string, value: string | number | boolean) {
    onUpdate({ conditional_values: { ...system.conditional_values, [key]: value } })
  }

  const systemType = systemTypes.find((s) => s.id === system.system_type_id)

  // Fire detection & alarm systems always have the built-in BAFE SP203
  // knowledge base as a fallback. Detect by system type name/code.
  const isFireAlarm =
    /fire/i.test(systemType?.name ?? '') || /^(FA|FD|FDA)/i.test(systemType?.code ?? '')

  // Admin-curated reference guides assigned to this system type. Each is
  // formatted as "[description]\n[extracted text]" for AI grounding.
  const matchingReferences = useMemo(
    () =>
      system.system_type_id
        ? systemReferences.filter(
            (r) => r.system_type_id === system.system_type_id && r.extracted_text,
          )
        : [],
    [systemReferences, system.system_type_id],
  )
  const referenceKnowledge = useMemo(
    () =>
      matchingReferences
        .map((r) => {
          const header = [r.name, r.description?.trim()].filter(Boolean).join(' — ')
          return `Reference: ${header}\n${r.extracted_text?.trim() ?? ''}`
        })
        .join('\n\n---\n\n'),
    [matchingReferences],
  )

  // The AI specification builder is available whenever there is an uploaded
  // sample-spec knowledge base for this system type + work type, an admin
  // reference guide for the system, OR it is a fire alarm system (built-in KB).
  const templateKnowledge = matchingTemplate?.source_text ?? matchingTemplate?.specification ?? ''
  // Combine the discipline template with any admin reference guides. The AI
  // helper clamps this to MAX_KB_CHARS, so we never blow the token budget.
  const specKnowledgeBase = [templateKnowledge, referenceKnowledge].filter(Boolean).join('\n\n===\n\n')
  const canBuildWithAi = Boolean(specKnowledgeBase) || isFireAlarm

  // The client's own brief for this quote, condensed for AI grounding.
  const clientContext = [requirementSource?.summary?.trim(), requirementSource?.raw_text?.trim()]
    .filter(Boolean)
    .join('\n\n')

  return (
    <Card className={systemType ? 'border-l-2' : undefined} style={systemType ? { borderLeftColor: getSystemHex(systemType.color) } : undefined}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-2 px-6 py-4">
          <CollapsibleTrigger asChild>
            <button type="button" aria-expanded={open} className="flex flex-1 items-center gap-3 text-left">
              <ChevronDown
                className={cn(
                  'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                  open && 'rotate-180',
                )}
              />
              {systemType && <SystemIcon system={systemType} />}
              <span className="truncate font-medium">
                {system.system_name?.trim() || 'Untitled system'}
              </span>
              {system.system_code && (
                systemType ? (
                  <SystemBadge system={systemType} codeOnly className="shrink-0" />
                ) : (
                  <Badge variant="outline" className="shrink-0 font-mono">
                    {system.system_code}
                  </Badge>
                )
              )}
              <Badge variant="secondary" className="shrink-0">
                {WORK_TYPES.find((w) => w.code === system.work_type)?.code ?? system.work_type}
              </Badge>
              <span className="ml-auto shrink-0 text-sm font-medium tabular-nums">
                {formatPence(systemTotalPence)}
              </span>
            </button>
          </CollapsibleTrigger>
          {!readOnly && canRemove && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              onClick={onRemove}
              disabled={isPending}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Remove system</span>
            </Button>
          )}
        </div>

        <CollapsibleContent>
          <CardHeader className="gap-3">
            <div className="flex items-start gap-2">
              <div className="grid flex-1 gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Step 1 · System details
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>System type</Label>
                <Select
                  value={system.system_type_id ?? ''}
                  onValueChange={handleSystemType}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a system type" />
                  </SelectTrigger>
                  <SelectContent>
                    {systemTypes.map((st) => (
                      <SelectItem key={st.id} value={st.id}>
                        <span className="flex items-center gap-2">
                          <SystemColorDot color={st.color} />
                          {st.name}
                          {st.code ? ` (${st.code})` : ''}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Type of work</Label>
                <Select
                value={system.work_type}
                onValueChange={handleWorkType}
                disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {/* SVC (Routine Maintenance) is created via the maintenance
                        calculator, not picked here — keep it out of the list. */}
                    {WORK_TYPES.filter((w) => w.code !== 'SVC').map((w) => (
                      <SelectItem key={w.code} value={w.code}>
                        {w.label} ({w.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>System name</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={system.system_name}
                  onChange={(e) => onUpdate({ system_name: e.target.value })}
                  placeholder="e.g. Addressable fire alarm"
                  className="font-medium"
                  disabled={disabled}
                />
                {system.system_code && (
                  <Badge variant="outline" className="shrink-0 font-mono">
                    {system.system_code}
                  </Badge>
                )}
              </div>
            </div>
            <div className="grid gap-1.5 sm:max-w-[200px]">
              <Label>System margin %</Label>
              <Input
                inputMode="decimal"
                value={system.margin}
                onChange={(e) => onUpdate({ margin: e.target.value })}
                placeholder="0"
                aria-label="System gross margin percent"
                disabled={disabled}
              />
              <p className="text-xs text-muted-foreground">
                Applied to all lines unless a line sets its own margin.
              </p>
            </div>
          </div>
        </div>

        {/* Quote bank hint */}
        {bankStats && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              Quote bank ({system.system_code} / {system.work_type})
            </span>
            <span className="text-muted-foreground">
              {bankStats.count} past {bankStats.count === 1 ? 'system' : 'systems'}
            </span>
            <span className="text-muted-foreground">
              Avg <span className="font-medium text-foreground tabular-nums">{formatPence(bankStats.avgPence)}</span>
            </span>
            <span className="text-muted-foreground">
              Range{' '}
              <span className="font-medium text-foreground tabular-nums">
                {formatPence(bankStats.minPence)}–{formatPence(bankStats.maxPence)}
              </span>
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-5">
        {!system.system_type_id ? (
          <div className="rounded-md border border-dashed bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            Choose a <span className="font-medium text-foreground">system type</span> and{' '}
            <span className="font-medium text-foreground">type of work</span> above to start building
            this system.
          </div>
        ) : (
          <>
        {/* ---- Step 2 · Questions (conditional "IF" fields for the work type) ---- */}
        {requiresQuestions && conditionalFields.length > 0 && (
          <div className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2">
            <p className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Step 2 · Questions for {WORK_TYPES.find((w) => w.code === system.work_type)?.label}
            </p>
            {conditionalFields.map((f) => {
              const val = system.conditional_values[f.field_key]
              if (f.field_type === 'boolean') {
                return (
                  <div key={f.id} className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
                    <Label htmlFor={`cf-${f.id}`} className="text-sm">{f.label}</Label>
                    <Switch
                      id={`cf-${f.id}`}
                      checked={!!val}
                      onCheckedChange={(c) => setConditional(f.field_key, c)}
                      disabled={disabled}
                    />
                  </div>
                )
              }
              if (f.field_type === 'select') {
                return (
                  <div key={f.id} className="grid gap-1.5">
                    <Label>{f.label}</Label>
                    <Select
                      value={String(val ?? '')}
                      onValueChange={(v) => setConditional(f.field_key, v)}
                      disabled={disabled}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {f.options.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )
              }
              return (
                <div key={f.id} className="grid gap-1.5">
                  <Label>{f.label}</Label>
                  <Input
                    inputMode={f.field_type === 'number' ? 'decimal' : 'text'}
                    value={String(val ?? '')}
                    onChange={(e) =>
                      setConditional(
                        f.field_key,
                        f.field_type === 'number' ? e.target.value : e.target.value,
                      )
                    }
                    disabled={disabled}
                  />
                </div>
              )
            })}
          </div>
        )}

        {/* ---- AI specification builder ----
             Asks the relevant questions (grounded in the discipline's uploaded
             sample spec, or the built-in BAFE SP203 KB for fire alarm) with
             suggested answers biased toward the client's brief, then compiles
             them into the system's specification text. */}
        {canBuildWithAi && !readOnly && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5">
            <div className="grid gap-0.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Build the specification with AI
              </p>
              <p className="text-xs text-muted-foreground">
                Answer a few guided questions — suggested answers included — and AI drafts the
                specification for you
                {matchingTemplate?.source_file_name
                  ? `, grounded in ${matchingTemplate.source_file_name}`
                  : ''}
                {matchingReferences.length > 0
                  ? `${matchingTemplate?.source_file_name ? ' and' : ', grounded in'} ${matchingReferences.length} system reference${matchingReferences.length === 1 ? '' : 's'}`
                  : ''}
                {clientContext ? ' and the client brief' : ''}.
              </p>
            </div>
            <AiSpecBuilderDialog
              systemTypeName={systemType?.name ?? 'System'}
              workTypeLabel={
                WORK_TYPES.find((w) => w.code === system.work_type)?.label ?? system.work_type
              }
              workTypeCode={system.work_type}
              existingAnswers={system.conditional_values}
              existingSpecification={system.specification}
              knowledgeBaseText={specKnowledgeBase || undefined}
              clientContext={clientContext || undefined}
              templateName={
                specKnowledgeBase
                  ? matchingTemplate?.source_file_name ??
                    (matchingReferences.length > 0
                      ? `${systemType?.name ?? 'System'} reference guides`
                      : `${systemType?.name ?? 'System'} specification template`)
                  : undefined
              }
              hasClientBrief={Boolean(clientContext)}
              onGenerated={(specification) => onUpdate({ specification })}
              disabled={disabled}
            />
          </div>
        )}

        {/* Fallback specification editor when the AI builder is available but no
            configured spec_template section exists, so the built spec is visible. */}
        {canBuildWithAi && !hasConfiguredSections && (
          <div className="grid gap-1.5">
            <Label>Specification</Label>
            <Textarea
              value={system.specification}
              onChange={(e) => onUpdate({ specification: e.target.value })}
              rows={6}
              placeholder="Build with AI above, or type the specification here."
              disabled={disabled}
            />
          </div>
        )}

        {/* ---- Configured sections (system type x work type) ----
             Includes spec_template and asset_type elements, which replace the
             old hardcoded "Description of Works / Specification" step. */}
        <QuoteSectionRenderer
          systemTypeId={system.system_type_id ?? ''}
          workType={system.work_type}
          values={system.conditional_values}
          onChange={setConditional}
          disabled={disabled}
          onLoaded={setHasConfiguredSections}
          assetTypes={systemAssetTypes}
          specification={system.specification}
          onSpecChange={(value) => onUpdate({ specification: value })}
          matchingTemplate={matchingTemplate}
          designCategories={designCategories}
          designCategoryId={system.design_category_id}
          onDesignCategoryChange={handleDesignCategory}
        />

        {/* ---- Design & survey (only for work types that require it) ---- */}
        {requiresDesign && (
        <div className="grid gap-3 rounded-md border p-3">
          <p className="text-xs font-medium text-muted-foreground">Design &amp; survey</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Drawing reference</Label>
              <Input
                value={system.drawing_reference}
                onChange={(e) => onUpdate({ drawing_reference: e.target.value })}
                placeholder="e.g. DWG-2026-014"
                disabled={disabled}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Design overview</Label>
            <Textarea
              value={system.design_overview}
              onChange={(e) => onUpdate({ design_overview: e.target.value })}
              placeholder="Imported from the design category, then editable."
              disabled={disabled}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Designed by</Label>
              <Select
                value={system.designed_by ?? 'pyrocel'}
                onValueChange={(v) => onUpdate({ designed_by: v })}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DESIGNED_BY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {system.designed_by === 'other' && (
              <div className="grid gap-1.5">
                <Label>Designer name</Label>
                <Input
                  value={system.designed_by_name}
                  onChange={(e) => onUpdate({ designed_by_name: e.target.value })}
                  placeholder="Who produced the design"
                  disabled={disabled}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
            <Label htmlFor={`survey-${system.key}`} className="text-sm">Survey carried out</Label>
            <Switch
              id={`survey-${system.key}`}
              checked={system.survey_carried_out}
              onCheckedChange={(c) => onUpdate({ survey_carried_out: c })}
              disabled={disabled}
            />
          </div>
          {system.survey_carried_out && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Survey by</Label>
                <Input
                  value={system.survey_by}
                  onChange={(e) => onUpdate({ survey_by: e.target.value })}
                  placeholder="Who carried out the survey"
                  disabled={disabled}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Survey date</Label>
                <Input
                  type="date"
                  value={system.survey_date}
                  onChange={(e) => onUpdate({ survey_date: e.target.value })}
                  disabled={disabled}
                />
              </div>
            </div>
          )}
        </div>
        )}

        {/* ---- Step 4 · Line items & pricing ---- */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Step 4 · Line items &amp; pricing
          </p>
          <div className="hidden gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1fr_60px_70px_100px_70px_100px_100px_36px]">
            <span>Product code</span>
            <span className="text-right">Qty</span>
            <span>Unit</span>
            <span className="text-right">Unit cost</span>
            <span className="text-right">Margin %</span>
            <span className="text-right">Unit price</span>
            <span className="text-right">Total</span>
            <span />
          </div>

          {(() => {
            // Show products first, then services, with a "Services" heading
            // before the first service line so they read as their own group.
            const orderedLines = [
              ...system.lines.filter((l) => !l.is_service),
              ...system.lines.filter((l) => l.is_service),
            ]
            const firstServiceKey = orderedLines.find((l) => l.is_service)?.key
            return orderedLines.map((line) => {
            const unitSell = lineSellPence(line, system)
            const lineTotal = Math.round((Number.parseFloat(line.quantity) || 0) * unitSell)
            const marginInherited = line.margin.trim() === ''
            return (
              <Fragment key={line.key}>
              {line.key === firstServiceKey && (
                <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Services
                </p>
              )}
              <div className="grid gap-2 rounded-md border p-2 sm:border-0 sm:p-0">
                {/* Pricing row: product code + numeric fields stay aligned to
                    the column headers above. */}
                <div className="grid gap-2 sm:grid-cols-[1fr_60px_70px_100px_70px_100px_100px_36px] sm:items-center">
                  <ProductCodeInput
                    value={line.productCode}
                    listId={`catalogue-codes-${line.key}`}
                    disabled={disabled}
                    onChangeCode={(code) => onUpdateLine(line.key, { productCode: code })}
                    onResolve={(item) => onApplyCatalogueToLine(line.key, item)}
                  />
                  <Input
                    ref={(el) => {
                      if (el) qtyInputRefs.current.set(line.key, el)
                      else qtyInputRefs.current.delete(line.key)
                    }}
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(e) => onUpdateLine(line.key, { quantity: e.target.value })}
                    className={cn(
                      'text-right',
                      // Required field: highlight in transparent red until a valid quantity is entered.
                      !(Number.parseFloat(line.quantity) > 0) &&
                        'border-destructive bg-destructive/10 focus-visible:ring-destructive',
                    )}
                    aria-label="Quantity"
                    aria-invalid={!(Number.parseFloat(line.quantity) > 0)}
                    disabled={disabled}
                  />
                  <Input
                    value={line.unit}
                    onChange={(e) => onUpdateLine(line.key, { unit: e.target.value })}
                    placeholder="each"
                    aria-label="Unit"
                    disabled={disabled}
                  />
                  <Input
                    inputMode="decimal"
                    value={line.unitCost}
                    onChange={(e) => onUpdateLine(line.key, { unitCost: e.target.value })}
                    onBlur={(e) =>
                      onUpdateLine(line.key, { unitCost: penceToPounds(poundsToPence(e.target.value)) })
                    }
                    className="text-right"
                    aria-label="Unit cost in pounds"
                    disabled={disabled}
                  />
                  <Input
                    inputMode="decimal"
                    value={line.margin}
                    onChange={(e) => onUpdateLine(line.key, { margin: e.target.value })}
                    placeholder={String(Number.parseFloat(system.margin) || 0)}
                    className="text-right"
                    aria-label="Margin percent (blank inherits system margin)"
                    title={marginInherited ? 'Inheriting system margin' : 'Line margin override'}
                    disabled={disabled}
                  />
                  <div
                    className="flex h-9 items-center justify-end text-sm tabular-nums text-muted-foreground"
                    aria-label="Computed unit price"
                  >
                    {formatPence(unitSell)}
                  </div>
                  <div className="flex h-9 items-center justify-end text-sm font-medium tabular-nums">
                    {formatPence(lineTotal)}
                  </div>
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground"
                      onClick={() => onRemoveLine(line.key)}
                      disabled={isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove line</span>
                    </Button>
                  )}
                </div>
                {/* Description spans the full row width so long catalogue names
                    are fully readable. Extra spec detail is no longer edited on
                    the quote line; it lives in the catalogue. */}
                <Input
                  value={line.description}
                  onChange={(e) => onUpdateLine(line.key, { description: e.target.value })}
                  placeholder="Item description"
                  className="w-full"
                  disabled={disabled}
                />
                {line.calculatorSnapshot && (
                  <div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground"
                      onClick={() => onViewLineCalculation(line)}
                      disabled={isPending}
                    >
                      <Calculator className="mr-1.5 h-3.5 w-3.5" />
                      View calculation
                    </Button>
                  </div>
                )}
              </div>
              </Fragment>
            )
          })
          })()}

          {/* Reminder: prompt for services when parts have been added but no
              service line exists yet (e.g. installation/commissioning missing). */}
          {!readOnly &&
            system.lines.some((l) => !l.is_service) &&
            !system.lines.some((l) => l.is_service) && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="text-pretty">
                  No services added yet. Remember to add any services appropriate to{' '}
                  <span className="font-medium">
                    {WORK_TYPES.find((w) => w.code === system.work_type)?.label ?? 'this work'}
                  </span>{' '}
                  (e.g. installation, commissioning or decommission) using{' '}
                  <span className="font-medium">Add service</span> below.
                </span>
              </div>
            )}

          {!readOnly && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={onAddLine} disabled={isPending}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add line
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenMaintenance}
                  disabled={isPending}
                  title="Price routine maintenance for this system and add it as an annual service line"
                >
                  <Calculator className="mr-2 h-4 w-4" />
                  Maintenance price
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending || availableServices.length === 0}
                      title={
                        availableServices.length === 0
                          ? 'No services configured yet — add them under Sales → Quote Services'
                          : undefined
                      }
                    >
                      <Wrench className="mr-2 h-4 w-4" />
                      Add service
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-72 w-72 overflow-y-auto">
                    <DropdownMenuLabel>Services</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {availableServices.map((service) => (
                      <DropdownMenuItem key={service.id} onClick={() => onAddServiceLine(service)}>
                        <span className="flex w-full items-center justify-between gap-2">
                          <span className="truncate">{service.name}</span>
                          {service.default_price_pence !== null && (
                            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                              {formatPence(service.default_price_pence)}
                            </span>
                          )}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Popover
                  open={catalogueOpen}
                  onOpenChange={(open) => {
                    setCatalogueOpen(open)
                    if (!open) setCatalogueSearch('')
                  }}
                >
                  <PopoverTrigger asChild>
                    {/* Highlighted as the primary parts-adding action so it
                        stands out from the other outline buttons. */}
                    <Button size="sm" disabled={isPending} className="shadow-sm">
                      <BookOpen className="mr-2 h-4 w-4" />
                      Add from catalogue
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-80 p-2"
                    // Don't yank focus back to the trigger on close; we focus the
                    // new line's quantity box instead so the user can type at once.
                    onCloseAutoFocus={(e) => e.preventDefault()}
                  >
                    <Input
                      autoFocus
                      value={catalogueSearch}
                      onChange={(e) => setCatalogueSearch(e.target.value)}
                      placeholder="Search by code, name or category"
                      className="mb-2"
                      aria-label="Search catalogue"
                    />
                    <div className="max-h-72 overflow-y-auto">
                      {catalogueLoading ? (
                        <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                          Searching…
                        </p>
                      ) : catalogueMatches.length === 0 ? (
                        <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                          {catalogueSearch.trim() ? 'No matching items' : 'Type to search the catalogue'}
                        </p>
                      ) : (
                          catalogueMatches.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                onAddCatalogueLine(item)
                                setCatalogueOpen(false)
                                setCatalogueSearch('')
                              }}
                              className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                {item.product_code && (
                                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                                    {item.product_code}
                                  </span>
                                )}
                                <span className="truncate">{item.name}</span>
                              </span>
                              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                {formatPence(item.default_unit_price_pence)}
                              </span>
                            </button>
                          ))
                        )}
                    </div>
                    {!catalogueLoading && catalogueMatches.length >= 50 && (
                      <p className="px-2 pt-2 text-xs text-muted-foreground">
                        Showing the first 50 matches. Refine your search to narrow them down.
                      </p>
                    )}
                  </PopoverContent>
                </Popover>
                {requiresPpm && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPpmOpen(true)}
                    disabled={isPending}
                  >
                    <Calculator className="mr-2 h-4 w-4" />
                    {system.ppm ? 'Edit PPM price' : 'PPM calculator'}
                  </Button>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                Total:{' '}
                <span className="font-medium text-foreground tabular-nums">
                  {formatPence(systemTotalPence)}
                </span>
              </div>
            </div>
          )}
        </div>

          </>
        )}

        {requiresPpm && (
          <PpmCalculatorDialog
            open={ppmOpen}
            onOpenChange={setPpmOpen}
            systemName={system.system_name}
            assetTypes={systemAssetTypes}
            defaultHourlyCostPence={defaultHourlyCostPence}
            existingDraft={system.ppm}
            disabled={disabled}
            onApply={onApplyPpm}
          />
        )}
        </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
