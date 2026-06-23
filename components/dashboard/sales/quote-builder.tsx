'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Plus, Trash2, GripVertical, BookOpen, Save } from 'lucide-react'
import { toast } from 'sonner'
import { computeQuoteTotals, formatPence, penceToPounds, poundsToPence, QUOTE_TYPES } from '@/lib/sales'
import type {
  Client,
  Quote,
  QuoteCatalogueItem,
  QuoteLineItem,
  QuoteSection,
  ServiceType,
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

interface EditSection {
  key: string
  title: string
  description: string
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

interface QuoteBuilderProps {
  clients: Client[]
  sites: Site[]
  serviceTypes: ServiceType[]
  catalogue: QuoteCatalogueItem[]
  quote?: Quote
  initialSections?: QuoteSection[]
  initialLines?: QuoteLineItem[]
  readOnly?: boolean
}

export function QuoteBuilder({
  clients,
  sites,
  serviceTypes,
  catalogue,
  quote,
  initialSections,
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

  // ----- Sections / lines state -----
  const [sections, setSections] = useState<EditSection[]>(() => {
    if (initialSections && initialSections.length > 0) {
      return initialSections.map((s) => ({
        key: s.id,
        title: s.title,
        description: s.description ?? '',
        lines: (initialLines ?? [])
          .filter((l) => l.section_id === s.id)
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
    return [{ key: uid(), title: 'Items', description: '', lines: [blankLine()] }]
  })

  const sitesForClient = useMemo(
    () => (clientId ? sites.filter((s) => s.client_id === clientId) : []),
    [sites, clientId],
  )

  // ----- Live totals -----
  const totals = useMemo(() => {
    const lines = sections.flatMap((s) =>
      s.lines.map((l) => ({
        quantity: Number.parseFloat(l.quantity) || 0,
        unit_price_pence: poundsToPence(l.unitPrice),
      })),
    )
    return computeQuoteTotals(lines, {
      vatRate: Number.parseFloat(vatRate) || 0,
      discountPence: poundsToPence(discount),
    })
  }, [sections, vatRate, discount])

  // ----- Mutators -----
  function updateSection(key: string, patch: Partial<EditSection>) {
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  }
  function addSection() {
    setSections((prev) => [
      ...prev,
      { key: uid(), title: `Section ${prev.length + 1}`, description: '', lines: [blankLine()] },
    ])
  }
  function removeSection(key: string) {
    setSections((prev) => prev.filter((s) => s.key !== key))
  }
  function addLine(sectionKey: string, line?: EditLine) {
    setSections((prev) =>
      prev.map((s) =>
        s.key === sectionKey ? { ...s, lines: [...s.lines, line ?? blankLine()] } : s,
      ),
    )
  }
  function updateLine(sectionKey: string, lineKey: string, patch: Partial<EditLine>) {
    setSections((prev) =>
      prev.map((s) =>
        s.key === sectionKey
          ? { ...s, lines: s.lines.map((l) => (l.key === lineKey ? { ...l, ...patch } : l)) }
          : s,
      ),
    )
  }
  function removeLine(sectionKey: string, lineKey: string) {
    setSections((prev) =>
      prev.map((s) =>
        s.key === sectionKey ? { ...s, lines: s.lines.filter((l) => l.key !== lineKey) } : s,
      ),
    )
  }
  function addCatalogueLine(sectionKey: string, item: QuoteCatalogueItem) {
    addLine(sectionKey, {
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
      sections: sections.map((s) => ({
        title: s.title,
        description: s.description || null,
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

      {/* ---------- Sections ---------- */}
      {sections.map((section) => {
        const sectionTotalPence = section.lines.reduce(
          (sum, l) => sum + Math.round((Number.parseFloat(l.quantity) || 0) * poundsToPence(l.unitPrice)),
          0,
        )
        return (
          <Card key={section.key}>
            <CardHeader className="gap-3">
              <div className="flex items-start gap-2">
                <GripVertical className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="grid flex-1 gap-2">
                  <Input
                    value={section.title}
                    onChange={(e) => updateSection(section.key, { title: e.target.value })}
                    placeholder="Section title (e.g. Supply, Installation, Commissioning)"
                    className="font-medium"
                    disabled={disabled}
                  />
                  <Input
                    value={section.description}
                    onChange={(e) => updateSection(section.key, { description: e.target.value })}
                    placeholder="Optional section description"
                    disabled={disabled}
                  />
                </div>
                {!readOnly && sections.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground"
                    onClick={() => removeSection(section.key)}
                    disabled={isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Remove section</span>
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Line header (desktop) */}
              <div className="hidden gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1fr_70px_80px_110px_110px_36px]">
                <span>Description</span>
                <span className="text-right">Qty</span>
                <span>Unit</span>
                <span className="text-right">Unit price</span>
                <span className="text-right">Total</span>
                <span />
              </div>

              {section.lines.map((line) => {
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
                        onChange={(e) => updateLine(section.key, line.key, { description: e.target.value })}
                        placeholder="Item description"
                        disabled={disabled}
                      />
                      <Input
                        value={line.detail}
                        onChange={(e) => updateLine(section.key, line.key, { detail: e.target.value })}
                        placeholder="Extra detail (optional)"
                        className="text-xs"
                        disabled={disabled}
                      />
                    </div>
                    <Input
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(e) => updateLine(section.key, line.key, { quantity: e.target.value })}
                      className="text-right"
                      aria-label="Quantity"
                      disabled={disabled}
                    />
                    <Input
                      value={line.unit}
                      onChange={(e) => updateLine(section.key, line.key, { unit: e.target.value })}
                      placeholder="each"
                      aria-label="Unit"
                      disabled={disabled}
                    />
                    <Input
                      inputMode="decimal"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(section.key, line.key, { unitPrice: e.target.value })}
                      onBlur={(e) =>
                        updateLine(section.key, line.key, { unitPrice: penceToPounds(poundsToPence(e.target.value)) })
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
                        onClick={() => removeLine(section.key, line.key)}
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
                    <Button variant="outline" size="sm" onClick={() => addLine(section.key)} disabled={isPending}>
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
                            <DropdownMenuItem key={item.id} onClick={() => addCatalogueLine(section.key, item)}>
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
                    Section total:{' '}
                    <span className="font-medium text-foreground tabular-nums">
                      {formatPence(sectionTotalPence)}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      {!readOnly && (
        <Button variant="outline" onClick={addSection} disabled={isPending}>
          <Plus className="mr-2 h-4 w-4" />
          Add section
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
