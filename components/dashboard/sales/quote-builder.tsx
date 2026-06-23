'use client'

import { useMemo, useState, useTransition } from 'react'
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
import { Plus, Trash2, GripVertical, BookOpen, Save, FileDown, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import {
  computeQuoteTotals,
  computeBankStats,
  formatPence,
  penceToPounds,
  poundsToPence,
  QUOTE_TYPES,
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
  QuoteDesignCategory,
  SystemType,
  Site,
} from '@/lib/types/database'
import { saveQuote, type QuoteInput } from '@/app/(dashboard)/dashboard/sales/actions'

// --- Local editable shapes (money kept as pounds strings for inputs) ---
interface EditLine {
  key: string
  description: string
  detail: string
  service_type_id: string | null
  catalogue_item_id: string | null
  quantity: string
  unit: string
  unitPrice: string // pounds
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
  lines: EditLine[]
}

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k_${Math.random().toString(36).slice(2)}`

function blankLine(): EditLine {
  return {
    key: uid(),
    description: '',
    detail: '',
    service_type_id: null,
    catalogue_item_id: null,
    quantity: '1',
    unit: '',
    unitPrice: '0.00',
  }
}

function blankSystem(index: number): EditSystem {
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
    lines: [blankLine()],
  }
}

interface QuoteBuilderProps {
  clients: Client[]
  sites: Site[]
  systemTypes: SystemType[]
  catalogue: QuoteCatalogueItem[]
  specTemplates: SystemSpecTemplate[]
  workTypeFields: WorkTypeField[]
  designCategories: QuoteDesignCategory[]
  bankValues: QuoteBankValue[]
  quote?: Quote
  initialSystems?: QuoteSystem[]
  initialLines?: QuoteLineItem[]
  readOnly?: boolean
}

export function QuoteBuilder({
  clients,
  sites,
  systemTypes,
  catalogue,
  specTemplates,
  workTypeFields,
  designCategories,
  bankValues,
  quote,
  initialSystems,
  initialLines,
  readOnly = false,
}: QuoteBuilderProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // ----- Header state -----
  const [title, setTitle] = useState(quote?.title ?? '')
  const [quoteType, setQuoteType] = useState(quote?.quote_type ?? QUOTE_TYPES[0].value)
  const [targetMode, setTargetMode] = useState<'client' | 'prospect'>(
    quote?.prospect_name && !quote?.client_id ? 'prospect' : 'client',
  )
  const [clientId, setClientId] = useState(quote?.client_id ?? '')
  const [siteId, setSiteId] = useState(quote?.site_id ?? '')
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
          lines: (initialLines ?? [])
            .filter((l) => l.system_id === s.id)
            .sort((a, b) => a.position - b.position)
            .map((l) => ({
              key: l.id,
              description: l.description,
              detail: l.detail ?? '',
              service_type_id: l.service_type_id,
              catalogue_item_id: l.catalogue_item_id,
              quantity: String(l.quantity),
              unit: l.unit ?? '',
              unitPrice: penceToPounds(l.unit_price_pence),
            })),
        }))
    }
    return [blankSystem(1)]
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
        unit_price_pence: poundsToPence(l.unitPrice),
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
    setSystems((prev) => [...prev, blankSystem(prev.length + 1)])
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
  function addCatalogueLine(systemKey: string, item: QuoteCatalogueItem) {
    addLine(systemKey, {
      key: uid(),
      description: item.name,
      detail: item.description ?? '',
      service_type_id: item.service_type_id,
      catalogue_item_id: item.id,
      quantity: '1',
      unit: item.default_unit ?? '',
      unitPrice: penceToPounds(item.default_unit_price_pence),
    })
  }

  function handleSave() {
    const payload: QuoteInput = {
      id: quote?.id,
      title,
      quote_type: quoteType,
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
        lines: s.lines
          .filter((l) => l.description.trim())
          .map((l) => ({
            description: l.description,
            detail: l.detail || null,
            service_type_id: l.service_type_id,
            catalogue_item_id: l.catalogue_item_id,
            quantity: Number.parseFloat(l.quantity) || 0,
            unit: l.unit || null,
            unit_price_pence: poundsToPence(l.unitPrice),
          })),
      })),
    }

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

  const disabled = readOnly || isPending

  return (
    <div className="space-y-6">
      {/* ---------- Quote details ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Quote details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
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
            <div className="grid gap-1.5">
              <Label htmlFor="q-type">Quote type *</Label>
              <Select value={quoteType} onValueChange={setQuoteType} disabled={disabled}>
                <SelectTrigger id="q-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUOTE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                <Select
                  value={clientId}
                  onValueChange={(v) => {
                    setClientId(v)
                    setSiteId('')
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger id="q-client">
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="q-site">Site (optional)</Label>
                <Select value={siteId} onValueChange={setSiteId} disabled={disabled || !clientId}>
                  <SelectTrigger id="q-site">
                    <SelectValue placeholder={clientId ? 'Select site' : 'Choose a client first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {sitesForClient.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
          catalogue={catalogue}
          specTemplates={specTemplates}
          workTypeFields={workTypeFields}
          designCategories={designCategories}
          bankValues={bankValues}
          onUpdate={(patch) => updateSystem(system.key, patch)}
          onRemove={() => removeSystem(system.key)}
          onAddLine={() => addLine(system.key)}
          onAddCatalogueLine={(item) => addCatalogueLine(system.key, item)}
          onUpdateLine={(lineKey, patch) => updateLine(system.key, lineKey, patch)}
          onRemoveLine={(lineKey) => removeLine(system.key, lineKey)}
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
        <div className="sticky bottom-4 flex justify-end">
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
  catalogue: QuoteCatalogueItem[]
  specTemplates: SystemSpecTemplate[]
  workTypeFields: WorkTypeField[]
  designCategories: QuoteDesignCategory[]
  bankValues: QuoteBankValue[]
  onUpdate: (patch: Partial<EditSystem>) => void
  onRemove: () => void
  onAddLine: () => void
  onAddCatalogueLine: (item: QuoteCatalogueItem) => void
  onUpdateLine: (lineKey: string, patch: Partial<EditLine>) => void
  onRemoveLine: (lineKey: string) => void
}

function SystemCard({
  system,
  canRemove,
  readOnly,
  isPending,
  systemTypes,
  catalogue,
  specTemplates,
  workTypeFields,
  designCategories,
  bankValues,
  onUpdate,
  onRemove,
  onAddLine,
  onAddCatalogueLine,
  onUpdateLine,
  onRemoveLine,
}: SystemCardProps) {
  const disabled = readOnly || isPending

  const systemTotalPence = system.lines.reduce(
    (sum, l) => sum + Math.round((Number.parseFloat(l.quantity) || 0) * poundsToPence(l.unitPrice)),
    0,
  )

  // Conditional fields that apply to the selected work type.
  const conditionalFields = useMemo(
    () =>
      workTypeFields
        .filter((f) => f.work_type === system.work_type && f.active)
        .sort((a, b) => a.position - b.position),
    [workTypeFields, system.work_type],
  )

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
    onUpdate({
      system_type_id: value,
      system_code: st?.code ?? null,
      // Default the system name to the system type name if still blank/default.
      system_name:
        !system.system_name || system.system_name.startsWith('System ')
          ? st?.name ?? system.system_name
          : system.system_name,
    })
  }

  function importSpec() {
    if (matchingTemplate?.specification) {
      onUpdate({ specification: matchingTemplate.specification })
      toast.success('Specification imported from template')
    } else {
      toast.error('No template for this system + work type yet')
    }
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
      <CardHeader className="gap-3">
        <div className="flex items-start gap-2">
          <GripVertical className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="grid flex-1 gap-3">
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
                  onValueChange={(v) => onUpdate({ work_type: v })}
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
          </div>
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
        {/* ---- Specification ---- */}
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <Label>Specification</Label>
            {!readOnly && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={importSpec}
                disabled={disabled || !matchingTemplate}
              >
                <FileDown className="mr-1.5 h-3.5 w-3.5" />
                Import from template
              </Button>
            )}
          </div>
          <Textarea
            value={system.specification}
            onChange={(e) => onUpdate({ specification: e.target.value })}
            placeholder="The specification for this system. Import a master template above, then edit."
            className="min-h-24"
            disabled={disabled}
          />
        </div>

        {/* ---- Conditional "IF" fields for the work type ---- */}
        {conditionalFields.length > 0 && (
          <div className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2">
            <p className="sm:col-span-2 text-xs font-medium text-muted-foreground">
              Additional details for {WORK_TYPES.find((w) => w.code === system.work_type)?.label}
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

        {/* ---- Design & survey ---- */}
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

        {/* ---- Line items ---- */}
        <div className="space-y-3">
          <div className="hidden gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1fr_70px_80px_110px_110px_36px]">
            <span>Description</span>
            <span className="text-right">Qty</span>
            <span>Unit</span>
            <span className="text-right">Unit price</span>
            <span className="text-right">Total</span>
            <span />
          </div>

          {system.lines.map((line) => {
            const lineTotal = Math.round(
              (Number.parseFloat(line.quantity) || 0) * poundsToPence(line.unitPrice),
            )
            return (
              <div
                key={line.key}
                className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_70px_80px_110px_110px_36px] sm:items-start sm:border-0 sm:p-0"
              >
                <div className="grid gap-1.5">
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
                  value={line.unitPrice}
                  onChange={(e) => onUpdateLine(line.key, { unitPrice: e.target.value })}
                  onBlur={(e) =>
                    onUpdateLine(line.key, { unitPrice: penceToPounds(poundsToPence(e.target.value)) })
                  }
                  className="text-right"
                  aria-label="Unit price in pounds"
                  disabled={disabled}
                />
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
                {catalogue.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" disabled={isPending}>
                        <BookOpen className="mr-2 h-4 w-4" />
                        Add from catalogue
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-72 w-72 overflow-y-auto">
                      <DropdownMenuLabel>Catalogue items</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {catalogue.map((item) => (
                        <DropdownMenuItem key={item.id} onClick={() => onAddCatalogueLine(item)}>
                          <div className="flex w-full items-center justify-between gap-2">
                            <span className="truncate">{item.name}</span>
                            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                              {formatPence(item.default_unit_price_pence)}
                            </span>
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
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
      </CardContent>
    </Card>
  )
}
