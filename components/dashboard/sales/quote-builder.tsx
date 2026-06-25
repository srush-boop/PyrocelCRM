'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Plus, Trash2, BookOpen, Save, TrendingUp, Calculator, Wrench, Check, ChevronsUpDown, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { PpmCalculatorDialog, type PpmDraft } from '@/components/dashboard/sales/ppm-calculator-dialog'
import { QuoteSectionRenderer } from '@/components/dashboard/sales/quote-section-renderer'
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
} from '@/lib/types/database'
import {
  saveQuote,
  searchCatalogueItems,
  getCatalogueItemByCode,
  type QuoteInput,
} from '@/app/(dashboard)/dashboard/sales/actions'

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
    quantity: '1',
    unit: '',
    unitCost: '0.00',
    margin: '', // inherit system margin
  }
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

interface QuoteBuilderProps {
  clients: Client[]
  sites: Site[]
  systemTypes: SystemType[]
  serviceTypes: ServiceType[]
  // Global, configurable non-product services (Installation, Decommission, etc.).
  quoteServices: QuoteService[]
  assetTypes: AssetType[]
  defaultHourlyCostPence: number
  defaultMarginPercent: number
  specTemplates: SystemSpecTemplate[]
  workTypeFields: WorkTypeField[]
  systemWorkTypeMargins: SystemWorkTypeMargin[]
  workTypeSettings: WorkTypeSetting[]
  designCategories: QuoteDesignCategory[]
  bankValues: QuoteBankValue[]
  quote?: Quote
  // Preselect a client/site for brand-new quotes (e.g. launched from a site).
  initialClientId?: string
  initialSiteId?: string
  initialSystems?: QuoteSystem[]
  initialLines?: QuoteLineItem[]
  initialPpm?: QuoteSystemPpm[]
  readOnly?: boolean
}

export function QuoteBuilder({
  clients,
  sites,
  systemTypes,
  serviceTypes,
  quoteServices,
  assetTypes,
  defaultHourlyCostPence,
  defaultMarginPercent,
  specTemplates,
  workTypeFields,
  systemWorkTypeMargins,
  workTypeSettings,
  designCategories,
  bankValues,
  quote,
  initialClientId,
  initialSiteId,
  initialSystems,
  initialLines,
  initialPpm,
  readOnly = false,
}: QuoteBuilderProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // ----- Header state -----
  const [title, setTitle] = useState(quote?.title ?? '')
  const [targetMode, setTargetMode] = useState<'client' | 'prospect'>(
    quote?.prospect_name && !quote?.client_id ? 'prospect' : 'client',
  )
  const [clientId, setClientId] = useState(quote?.client_id ?? initialClientId ?? '')
  const [siteId, setSiteId] = useState(quote?.site_id ?? initialSiteId ?? '')
  const [clientPickerOpen, setClientPickerOpen] = useState(false)
  const [sitePickerOpen, setSitePickerOpen] = useState(false)
  const [prospectName, setProspectName] = useState(quote?.prospect_name ?? '')
  const [prospectContact, setProspectContact] = useState(quote?.prospect_contact ?? '')
  const [prospectEmail, setProspectEmail] = useState(quote?.prospect_email ?? '')
  const [prospectPhone, setProspectPhone] = useState(quote?.prospect_phone ?? '')
  const [prospectAddress, setProspectAddress] = useState(quote?.prospect_address ?? '')
  const [summary, setSummary] = useState(quote?.summary ?? '')
  const [terms, setTerms] = useState(quote?.terms ?? '')
  const [notes, setNotes] = useState(quote?.notes ?? '')
  const [vatRate, setVatRate] = useState(String(quote?.vat_rate ?? 20))
  const [discount, setDiscount] = useState(penceToPounds(quote?.discount_pence ?? 0))
  const [validUntil, setValidUntil] = useState(quote?.valid_until ?? '')
  const [showLineItems, setShowLineItems] = useState(quote?.show_line_items ?? true)

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
            })),
          ppm: ppmToDraft((initialPpm ?? []).find((p) => p.quote_system_id === s.id) ?? null),
        }))
    }
    return [blankSystem(1, defaultMarginPercent)]
  })

  const sitesForClient = useMemo(
    () => (clientId ? sites.filter((s) => s.client_id === clientId) : []),
    [sites, clientId],
  )

  // ----- Live totals -----
  const totals = useMemo(() => {
    const lines = systems.flatMap((s) =>
      s.lines.map((l) => ({
        quantity: Number.parseFloat(l.quantity) || 0,
        unit_price_pence: lineSellPence(l, s),
      })),
    )
    return computeQuoteTotals(lines, {
      vatRate: Number.parseFloat(vatRate) || 0,
      discountPence: poundsToPence(discount),
    })
  }, [systems, vatRate, discount])

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
      detail: item.description ?? '',
      service_type_id: item.service_type_id,
      is_service: false,
      catalogue_item_id: item.id,
      quantity: '1',
      unit: item.default_unit ?? '',
      // Bring in the catalogue item's cost; the part inherits the system margin
      // (which is auto-filled from the set-margins table) so it pulls through.
      unitCost: penceToPounds(item.unit_cost_pence),
      margin: '',
    })
  }

  // Link an existing line to a catalogue item (used by the product-code box).
  function applyCatalogueToLine(systemKey: string, lineKey: string, item: QuoteCatalogueItem) {
    updateLine(systemKey, lineKey, {
      productCode: item.product_code ?? '',
      description: item.name,
      detail: item.description ?? '',
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
    })
  }

  const buildPayload = useCallback((): QuoteInput => {
    return {
      id: quote?.id,
      title,
      // Quote type is no longer a header field — derive it from the first
      // system's work type so the persisted value stays meaningful.
      quote_type: quoteTypeFromWorkType(systems[0]?.work_type),
      client_id: targetMode === 'client' ? clientId || null : null,
      site_id: targetMode === 'client' ? siteId || null : null,
      prospect_name: targetMode === 'prospect' ? prospectName || null : null,
      prospect_contact: targetMode === 'prospect' ? prospectContact || null : null,
      prospect_email: targetMode === 'prospect' ? prospectEmail || null : null,
      prospect_phone: targetMode === 'prospect' ? prospectPhone || null : null,
      prospect_address: targetMode === 'prospect' ? prospectAddress || null : null,
      summary: summary || null,
      terms: terms || null,
      notes: notes || null,
      vat_rate: Number.parseFloat(vatRate) || 0,
      discount_pence: poundsToPence(discount),
      show_line_items: showLineItems,
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
          })),
      })),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    quote?.id,
    title,
    targetMode,
    clientId,
    siteId,
    prospectName,
    prospectContact,
    prospectEmail,
    prospectPhone,
    prospectAddress,
    summary,
    terms,
    notes,
    vatRate,
    discount,
    validUntil,
    showLineItems,
    systems,
  ])

  function handleSave() {
    const payload = buildPayload()
    startTransition(async () => {
      const res = await saveQuote(payload)
      if (res.ok && res.id) {
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

  const disabled = readOnly || isPending

  return (
    <div className="space-y-6">
      {/* ---------- Quote details ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Quote details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="q-title">Title *</Label>
            <Input
              id="q-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Fire alarm upgrade — Block A"
              disabled={disabled}
            />
          </div>

          {/* Target: client vs prospect */}
          <div className="grid gap-1.5">
            <Label>Quote for</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={targetMode === 'client' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTargetMode('client')}
                disabled={disabled}
              >
                Existing client
              </Button>
              <Button
                type="button"
                variant={targetMode === 'prospect' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTargetMode('prospect')}
                disabled={disabled}
              >
                New prospect
              </Button>
            </div>
          </div>

          {targetMode === 'client' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="q-client">Client</Label>
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
                                setSiteId('')
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
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="q-site">Site (optional)</Label>
                <Popover open={sitePickerOpen} onOpenChange={setSitePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="q-site"
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={sitePickerOpen}
                      disabled={disabled || !clientId}
                      className="justify-between font-normal"
                    >
                      <span className="truncate">
                        {siteId
                          ? sitesForClient.find((s) => s.id === siteId)?.name ?? 'Select site'
                          : clientId
                            ? 'Select site'
                            : 'Choose a client first'}
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
                          {sitesForClient.map((s) => (
                            <CommandItem
                              key={s.id}
                              value={s.name}
                              onSelect={() => {
                                setSiteId(s.id === siteId ? '' : s.id)
                                setSitePickerOpen(false)
                              }}
                            >
                              <Check className={`mr-2 h-4 w-4 ${siteId === s.id ? 'opacity-100' : 'opacity-0'}`} />
                              <span className="truncate">{s.name}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="p-name">Prospect name *</Label>
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
                <Label htmlFor="p-address">Address</Label>
                <Input id="p-address" value={prospectAddress} onChange={(e) => setProspectAddress(e.target.value)} disabled={disabled} />
              </div>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="q-summary">Scope / summary</Label>
            <Textarea
              id="q-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Shown at the top of the quote."
              disabled={disabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* ---------- Systems ---------- */}
      {systems.map((system) => (
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
                  workTypeFields={workTypeFields}
                  systemWorkTypeMargins={systemWorkTypeMargins}
                  workTypeSettings={workTypeSettings}
                  designCategories={designCategories}
                  bankValues={bankValues}
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
        />
      ))}

      {!readOnly && (
        <Button variant="outline" onClick={addSystem} disabled={isPending}>
          <Plus className="mr-2 h-4 w-4" />
          Add system
        </Button>
      )}

      {/* ---------- Totals + terms ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Pricing &amp; terms</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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

      {!readOnly && (
        <div className="sticky bottom-4 flex items-center justify-end gap-3">
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
          <Button size="lg" onClick={handleSave} disabled={isPending || !title.trim()} className="shadow-lg">
            <Save className="mr-2 h-4 w-4" />
            {quote?.id ? 'Save changes' : 'Create quote'}
          </Button>
        </div>
      )}
    </div>
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
  workTypeFields: WorkTypeField[]
  systemWorkTypeMargins: SystemWorkTypeMargin[]
  workTypeSettings: WorkTypeSetting[]
  designCategories: QuoteDesignCategory[]
  bankValues: QuoteBankValue[]
  onUpdate: (patch: Partial<EditSystem>) => void
  onRemove: () => void
  onAddLine: () => void
  onAddCatalogueLine: (item: QuoteCatalogueItem) => void
  onApplyCatalogueToLine: (lineKey: string, item: QuoteCatalogueItem) => void
  onAddServiceLine: (service: QuoteService) => void
  onUpdateLine: (lineKey: string, patch: Partial<EditLine>) => void
  onRemoveLine: (lineKey: string) => void
  onApplyPpm: (draft: PpmDraft) => void
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
  workTypeFields,
  systemWorkTypeMargins,
  workTypeSettings,
  designCategories,
  bankValues,
  onUpdate,
  onRemove,
  onAddLine,
  onAddCatalogueLine,
  onApplyCatalogueToLine,
  onAddServiceLine,
  onUpdateLine,
  onRemoveLine,
  onApplyPpm,
}: SystemCardProps) {
  const disabled = readOnly || isPending
  const [ppmOpen, setPpmOpen] = useState(false)
  // Each system section is collapsible. Configured systems start collapsed to
  // keep long multi-system quotes scannable; a brand-new (untyped) system
  // auto-expands so the user is guided straight into setup.
  const [open, setOpen] = useState(!system.system_type_id)
  const [catalogueOpen, setCatalogueOpen] = useState(false)
  const [catalogueSearch, setCatalogueSearch] = useState('')

  // The catalogue can hold tens of thousands of items, so we never load it all.
  // Results are fetched from the server on demand as the user types (debounced),
  // keeping page navigation and this popover fast and light.
  const [catalogueMatches, setCatalogueMatches] = useState<QuoteCatalogueItem[]>([])
  const [catalogueLoading, setCatalogueLoading] = useState(false)

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

  return (
    <Card>
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
              <span className="truncate font-medium">
                {system.system_name?.trim() || 'Untitled system'}
              </span>
              {system.system_code && (
                <Badge variant="outline" className="shrink-0 font-mono">
                  {system.system_code}
                </Badge>
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
                        {st.name}
                        {st.code ? ` (${st.code})` : ''}
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
                    {WORK_TYPES.map((w) => (
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

        {/* ---- Configured sections (system type x work type) ----
             Includes spec_template and asset_type elements, which replace the
             old hardcoded "Description of Works / Specification" step. */}
        <QuoteSectionRenderer
          systemTypeId={system.system_type_id ?? ''}
          workType={system.work_type}
          values={system.conditional_values}
          onChange={setConditional}
          disabled={disabled}
          assetTypes={systemAssetTypes}
          specification={system.specification}
          onSpecChange={(value) => onUpdate({ specification: value })}
          matchingTemplate={matchingTemplate}
        />

        {/* ---- Design & survey (only for work types that require it) ---- */}
        {requiresDesign && (
        <div className="grid gap-3 rounded-md border p-3">
          <p className="text-xs font-medium text-muted-foreground">Design &amp; survey</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Design category</Label>
              <Select
                value={system.design_category_id ?? ''}
                onValueChange={handleDesignCategory}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {designCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
            <span>Description</span>
            <span className="text-right">Qty</span>
            <span>Unit</span>
            <span className="text-right">Unit cost</span>
            <span className="text-right">Margin %</span>
            <span className="text-right">Unit price</span>
            <span className="text-right">Total</span>
            <span />
          </div>

          {system.lines.map((line) => {
            const unitSell = lineSellPence(line, system)
            const lineTotal = Math.round((Number.parseFloat(line.quantity) || 0) * unitSell)
            const marginInherited = line.margin.trim() === ''
            return (
              <div
                key={line.key}
                className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_60px_70px_100px_70px_100px_100px_36px] sm:items-start sm:border-0 sm:p-0"
              >
                <div className="grid gap-1.5">
                  <ProductCodeInput
                    value={line.productCode}
                    listId={`catalogue-codes-${line.key}`}
                    disabled={disabled}
                    onChangeCode={(code) => onUpdateLine(line.key, { productCode: code })}
                    onResolve={(item) => onApplyCatalogueToLine(line.key, item)}
                  />
                  <Input
                    value={line.description}
                    onChange={(e) => onUpdateLine(line.key, { description: e.target.value })}
                    placeholder="Item description"
                    disabled={disabled}
                  />
                  <Input
                    value={line.detail}
                    onChange={(e) => onUpdateLine(line.key, { detail: e.target.value })}
                    placeholder="Extra detail (optional)"
                    className="text-xs"
                    disabled={disabled}
                  />
                </div>
                <Input
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(e) => onUpdateLine(line.key, { quantity: e.target.value })}
                  className="text-right"
                  aria-label="Quantity"
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
            )
          })}

          {!readOnly && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={onAddLine} disabled={isPending}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add line
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
                    <Button variant="outline" size="sm" disabled={isPending}>
                      <BookOpen className="mr-2 h-4 w-4" />
                      Add from catalogue
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-80 p-2">
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
                System total:{' '}
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
