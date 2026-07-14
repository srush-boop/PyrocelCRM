'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Building2,
  MapPin,
  Boxes,
  Wrench,
  Coins,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileSignature,
  ExternalLink,
  Send,
  ChevronDown,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { cn, formatDateUK } from '@/lib/utils'
import { quoteTypeLabel } from '@/lib/sales'
import { MONTH_LABELS } from '@/lib/billing/recurring'
import { SendContractDialog } from './send-contract-dialog'
import {
  updateContractReviewItem,
  updateContractReviewNotes,
  commitContractReview,
  cancelContractReview,
} from '@/lib/actions/contract-review'
import type {
  ContractReview,
  ContractReviewItem,
  ContractReviewAction,
  Quote,
} from '@/lib/types/database'

type IdName = { id: string; name: string }
type SiteRef = { id: string; name: string; postcode: string | null; client_id: string | null }
type SiteSystemRef = { id: string; name: string; site_id: string; system_type_id: string | null }
type SiteServiceRef = {
  id: string
  site_id: string
  site_system_id: string | null
  service_type_id: string
}

interface Props {
  review: ContractReview
  quote: Quote | null
  items: ContractReviewItem[]
  clients: IdName[]
  sites: SiteRef[]
  systemTypes: IdName[]
  serviceTypes: IdName[]
  subcontractors: IdName[]
  siteSystems: SiteSystemRef[]
  siteServices: SiteServiceRef[]
  branches: IdName[]
  propertyTypes: IdName[]
  nominalCodes: { id: string; code: string; name: string }[]
}

const NONE = '__none__'

// Local mirror of an item's editable state.
interface LocalItem {
  action: ContractReviewAction
  linkedId: string | null
  suggestedId: string | null
  confidence: number | null
  payload: Record<string, unknown>
}

export function ContractReviewDetail(props: Props) {
  const { review, quote, items } = props
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [committing, setCommitting] = useState(false)
  const editable = review.status === 'draft'

  // Seed local state from the items.
  const [state, setState] = useState<Record<string, LocalItem>>(() => {
    const map: Record<string, LocalItem> = {}
    for (const it of items) {
      map[it.id] = {
        action: it.action,
        linkedId: it.linked_id,
        suggestedId: it.suggested_id,
        confidence: it.match_confidence,
        payload: { ...(it.payload as Record<string, unknown>) },
      }
    }
    return map
  })
  const [notes, setNotes] = useState(review.notes ?? '')

  const clientItem = items.find((i) => i.entity_type === 'client')
  const siteItem = items.find((i) => i.entity_type === 'site')
  const systemItems = items.filter((i) => i.entity_type === 'system')

  const resolvedSiteId = siteItem
    ? state[siteItem.id]?.action === 'link'
      ? state[siteItem.id]?.linkedId
      : null
    : null

  function save(itemId: string, patch: Partial<LocalItem>) {
    setState((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }))
    startTransition(async () => {
      const local = { ...state[itemId], ...patch }
      const res = await updateContractReviewItem(itemId, {
        action: local.action,
        linkedId: local.linkedId,
        payload: local.payload,
      })
      if (!res.ok) toast.error(res.error ?? 'Could not save change.')
    })
  }

  function setPayload(itemId: string, key: string, value: unknown) {
    const next = { ...state[itemId].payload, [key]: value }
    save(itemId, { payload: next })
  }

  // Client-side commit gate: catch obvious anomalies before hitting the server.
  const anomalies = useMemo(() => {
    const issues: string[] = []
    for (const it of items) {
      const s = state[it.id]
      if (!s) continue
      if (s.action === 'link' && !s.linkedId) {
        issues.push(`Select an existing ${it.entity_type} to link, or switch to Create.`)
      }
      if (s.action === 'create' && it.entity_type === 'service' && !s.payload.service_type_id) {
        issues.push('A service needs a service type before committing.')
      }
    }
    return issues
  }, [items, state])

  const canCommit = editable && anomalies.length === 0

  async function onCommit() {
    setCommitting(true)
    const res = await commitContractReview(review.id)
    setCommitting(false)
    if (res.ok) {
      toast.success('Contract committed. Records are now live.')
      router.refresh()
    } else {
      toast.error(res.error ?? 'Could not commit the review.')
    }
  }

  async function onCancel() {
    const res = await cancelContractReview(review.id)
    if (res.ok) {
      toast.success('Review cancelled.')
      router.refresh()
    } else {
      toast.error(res.error ?? 'Could not cancel.')
    }
  }

  function saveNotes() {
    startTransition(async () => {
      await updateContractReviewNotes(review.id, notes)
    })
  }

  const ref = quote?.reference || quote?.quote_number || 'No reference'

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/sales/contract-reviews" aria-label="Back to contract reviews">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-balance">
              {quote?.title || 'Maintenance contract'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {ref} • {quote ? quoteTypeLabel(quote.quote_type) : 'Routine Maintenance'}
            </p>
          </div>
        </div>
        <StatusBadge status={review.status} />
      </div>

      {!editable && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm text-emerald-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {review.status === 'committed'
                ? 'This contract has been committed to live records.'
                : 'This review was cancelled.'}
            </div>
            {review.status === 'committed' && quote && (
              <div className="flex items-center gap-3">
                {review.contract_sent_at && (
                  <span className="text-xs text-emerald-700">
                    Copy sent {formatDateUK(review.contract_sent_at)}
                  </span>
                )}
                <SendContractDialog
                  reviewId={review.id}
                  quote={quote}
                  trigger={
                    <Button size="sm" variant="outline" className="bg-card">
                      <Send className="mr-2 h-4 w-4" />
                      {review.contract_sent_at ? 'Resend contract copy' : 'Email contract copy'}
                    </Button>
                  }
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {editable && anomalies.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="space-y-1 py-3 text-sm text-amber-800">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" />
              Resolve before committing
            </div>
            <ul className="list-inside list-disc">
              {[...new Set(anomalies)].map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Signed contract: the accepted quote, presented for Pyrocel approval. */}
      {quote && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSignature className="h-5 w-5 text-primary" />
              Signed contract
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-pretty">
              This Routine Maintenance quotation was accepted by the client and is presented here as
              a contract for approval. Review the signed document and the draft records below, then
              commit to create the live client, site, systems, services and charges.
            </p>

            <div className="flex flex-wrap items-end justify-between gap-6 rounded-lg border bg-card p-4">
              <div className="min-w-[12rem]">
                <div className="text-xs text-muted-foreground">Signed by</div>
                {quote.signature_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={quote.signature_image_url || '/placeholder.svg'}
                    alt={`Signature of ${quote.signature_name ?? 'client'}`}
                    className="mt-1 h-16 w-auto max-w-full object-contain"
                    crossOrigin="anonymous"
                  />
                ) : quote.signature_name ? (
                  <div className="mt-1 font-serif text-xl italic">{quote.signature_name}</div>
                ) : (
                  <div className="mt-1 text-sm text-muted-foreground">
                    No electronic signature captured
                  </div>
                )}
                {quote.signature_name && (
                  <div className="mt-1 border-t pt-1 text-sm font-medium">
                    {quote.signature_name}
                  </div>
                )}
              </div>
              <div className="text-sm">
                <div className="text-xs text-muted-foreground">Date accepted</div>
                <div className="font-medium">
                  {quote.signed_at || quote.decided_at
                    ? formatDateUK(quote.signed_at ?? quote.decided_at!)
                    : '—'}
                </div>
                {quote.po_number && (
                  <div className="mt-2">
                    <div className="text-xs text-muted-foreground">PO number</div>
                    <div className="font-medium">{quote.po_number}</div>
                  </div>
                )}
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/dashboard/sales/${quote.id}`} target="_blank">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View signed document
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Client */}
      {clientItem && (
        <EntityCard icon={<Building2 className="h-5 w-5" />} title="Client">
          <ActionToggle
            editable={editable}
            allowSkip={false}
            value={state[clientItem.id].action}
            confidence={state[clientItem.id].confidence}
            hasSuggestion={!!state[clientItem.id].suggestedId}
            onChange={(action) => {
              const linkedId =
                action === 'link'
                  ? state[clientItem.id].linkedId ?? state[clientItem.id].suggestedId ?? null
                  : state[clientItem.id].linkedId
              save(clientItem.id, { action, linkedId })
            }}
          />
          {state[clientItem.id].action === 'link' ? (
            <LinkSelect
              editable={editable}
              placeholder="Select existing client"
              value={state[clientItem.id].linkedId}
              options={props.clients}
              onChange={(v) => save(clientItem.id, { linkedId: v })}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Client name">
                <Input
                  disabled={!editable}
                  value={(state[clientItem.id].payload.name as string) ?? ''}
                  onChange={(e) => setPayload(clientItem.id, 'name', e.target.value)}
                />
              </Field>
              <Field label="Contact name">
                <Input
                  disabled={!editable}
                  value={(state[clientItem.id].payload.contact_name as string) ?? ''}
                  onChange={(e) => setPayload(clientItem.id, 'contact_name', e.target.value)}
                />
              </Field>
              <Field label="Contact email">
                <Input
                  disabled={!editable}
                  value={(state[clientItem.id].payload.contact_email as string) ?? ''}
                  onChange={(e) => setPayload(clientItem.id, 'contact_email', e.target.value)}
                />
              </Field>
              <Field label="Contact phone">
                <Input
                  disabled={!editable}
                  value={(state[clientItem.id].payload.contact_phone as string) ?? ''}
                  onChange={(e) => setPayload(clientItem.id, 'contact_phone', e.target.value)}
                />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <Textarea
                  disabled={!editable}
                  rows={2}
                  value={(state[clientItem.id].payload.address as string) ?? ''}
                  onChange={(e) => setPayload(clientItem.id, 'address', e.target.value)}
                />
              </Field>
              <div className="sm:col-span-2">
                <MoreDetails>
                  <Field label="Notes">
                    <Textarea
                      disabled={!editable}
                      rows={2}
                      placeholder="Internal notes about this client"
                      value={(state[clientItem.id].payload.notes as string) ?? ''}
                      onChange={(e) => setPayload(clientItem.id, 'notes', e.target.value)}
                    />
                  </Field>
                  <SwitchField
                    label="Requires a PO before work"
                    checked={state[clientItem.id].payload.requires_po === true}
                    onChange={(v) => setPayload(clientItem.id, 'requires_po', v)}
                    editable={editable}
                  />
                </MoreDetails>
              </div>
              <div className="sm:col-span-2">
                <MissingInfo
                  fields={[
                    !state[clientItem.id].payload.contact_name && 'contact name',
                    !state[clientItem.id].payload.contact_email && 'contact email',
                    !state[clientItem.id].payload.contact_phone && 'contact phone',
                  ].filter(Boolean) as string[]}
                />
              </div>
            </div>
          )}
        </EntityCard>
      )}

      {/* Site */}
      {siteItem && (
        <EntityCard icon={<MapPin className="h-5 w-5" />} title="Site">
          <ActionToggle
            editable={editable}
            allowSkip={false}
            value={state[siteItem.id].action}
            confidence={state[siteItem.id].confidence}
            hasSuggestion={!!state[siteItem.id].suggestedId}
            onChange={(action) => {
              const linkedId =
                action === 'link'
                  ? state[siteItem.id].linkedId ?? state[siteItem.id].suggestedId ?? null
                  : state[siteItem.id].linkedId
              save(siteItem.id, { action, linkedId })
            }}
          />
          {state[siteItem.id].action === 'link' ? (
            <LinkSelect
              editable={editable}
              placeholder="Select existing site"
              value={state[siteItem.id].linkedId}
              options={props.sites.map((s) => ({
                id: s.id,
                name: s.postcode ? `${s.name} — ${s.postcode}` : s.name,
              }))}
              onChange={(v) => save(siteItem.id, { linkedId: v })}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Site name">
                <Input
                  disabled={!editable}
                  value={(state[siteItem.id].payload.name as string) ?? ''}
                  onChange={(e) => setPayload(siteItem.id, 'name', e.target.value)}
                />
              </Field>
              <Field label="Postcode">
                <Input
                  disabled={!editable}
                  value={(state[siteItem.id].payload.postcode as string) ?? ''}
                  onChange={(e) => setPayload(siteItem.id, 'postcode', e.target.value)}
                />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <Textarea
                  disabled={!editable}
                  rows={2}
                  value={(state[siteItem.id].payload.address as string) ?? ''}
                  onChange={(e) => setPayload(siteItem.id, 'address', e.target.value)}
                />
              </Field>
              <Field label="Branch">
                <TypeSelect
                  editable={editable}
                  allowClear
                  placeholder="Select branch"
                  value={(state[siteItem.id].payload.branch_id as string) ?? null}
                  options={props.branches}
                  onChange={(v) => setPayload(siteItem.id, 'branch_id', v)}
                />
              </Field>
              <Field label="Property type">
                <TypeSelect
                  editable={editable}
                  allowClear
                  placeholder="Select property type"
                  value={(state[siteItem.id].payload.property_type_id as string) ?? null}
                  options={props.propertyTypes}
                  onChange={(v) => setPayload(siteItem.id, 'property_type_id', v)}
                />
              </Field>
              <div className="sm:col-span-2">
                <MoreDetails>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Site ID (CASH)">
                      <Input
                        disabled={!editable}
                        value={(state[siteItem.id].payload.site_id_cash as string) ?? ''}
                        onChange={(e) => setPayload(siteItem.id, 'site_id_cash', e.target.value)}
                      />
                    </Field>
                    <Field label="UPRN">
                      <Input
                        disabled={!editable}
                        value={(state[siteItem.id].payload.uprn as string) ?? ''}
                        onChange={(e) => setPayload(siteItem.id, 'uprn', e.target.value)}
                      />
                    </Field>
                  </div>
                  <Field label="Reporting emails">
                    <Textarea
                      disabled={!editable}
                      rows={2}
                      placeholder="Comma-separated addresses for service reports"
                      value={emailsToText(state[siteItem.id].payload.reporting_emails)}
                      onChange={(e) =>
                        setPayload(siteItem.id, 'reporting_emails', textToEmails(e.target.value))
                      }
                    />
                  </Field>
                  <Field label="Notes">
                    <Textarea
                      disabled={!editable}
                      rows={2}
                      value={(state[siteItem.id].payload.notes as string) ?? ''}
                      onChange={(e) => setPayload(siteItem.id, 'notes', e.target.value)}
                    />
                  </Field>
                  <div className="space-y-2 rounded-md border p-3">
                    <SwitchField
                      label="Has remote monitoring"
                      checked={state[siteItem.id].payload.has_remote_monitoring === true}
                      onChange={(v) => setPayload(siteItem.id, 'has_remote_monitoring', v)}
                      editable={editable}
                    />
                    {state[siteItem.id].payload.has_remote_monitoring === true && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Monitoring station">
                          <Input
                            disabled={!editable}
                            value={
                              (state[siteItem.id].payload.monitoring_station_name as string) ?? ''
                            }
                            onChange={(e) =>
                              setPayload(siteItem.id, 'monitoring_station_name', e.target.value)
                            }
                          />
                        </Field>
                        <Field label="Station phone">
                          <Input
                            disabled={!editable}
                            value={
                              (state[siteItem.id].payload.monitoring_station_phone as string) ?? ''
                            }
                            onChange={(e) =>
                              setPayload(siteItem.id, 'monitoring_station_phone', e.target.value)
                            }
                          />
                        </Field>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-medium text-muted-foreground">
                      Visit requirements
                    </div>
                    <FlagsGrid
                      payload={state[siteItem.id].payload}
                      onToggle={(k, v) => setPayload(siteItem.id, k, v)}
                      editable={editable}
                    />
                  </div>
                </MoreDetails>
              </div>
              <div className="sm:col-span-2">
                <MissingInfo
                  fields={[
                    !state[siteItem.id].payload.postcode && 'postcode',
                    !state[siteItem.id].payload.branch_id && 'branch',
                    !state[siteItem.id].payload.property_type_id && 'property type',
                    emailsToText(state[siteItem.id].payload.reporting_emails).length === 0 &&
                      'reporting emails',
                  ].filter(Boolean) as string[]}
                />
              </div>
            </div>
          )}
        </EntityCard>
      )}

      {/* Systems + nested service + charge */}
      {systemItems.map((sys) => {
        const services = items.filter(
          (i) => i.entity_type === 'service' && i.parent_key === sys.local_key,
        )
        const systemsForSite = resolvedSiteId
          ? props.siteSystems.filter((s) => s.site_id === resolvedSiteId)
          : []
        const servicesForSite = resolvedSiteId
          ? props.siteServices.filter((s) => s.site_id === resolvedSiteId)
          : []
        return (
          <EntityCard
            key={sys.id}
            icon={<Boxes className="h-5 w-5" />}
            title={(state[sys.id].payload.name as string) || 'System'}
          >
            {/* System */}
            <ActionToggle
              editable={editable}
              allowSkip
              value={state[sys.id].action}
              confidence={state[sys.id].confidence}
              hasSuggestion={!!state[sys.id].suggestedId}
              onChange={(action) => {
                const linkedId =
                  action === 'link'
                    ? state[sys.id].linkedId ?? state[sys.id].suggestedId ?? null
                    : state[sys.id].linkedId
                save(sys.id, { action, linkedId })
              }}
            />
            {state[sys.id].action === 'link' ? (
              <LinkSelect
                editable={editable}
                placeholder={resolvedSiteId ? 'Select existing system' : 'Link the site first'}
                value={state[sys.id].linkedId}
                options={systemsForSite.map((s) => ({ id: s.id, name: s.name }))}
                onChange={(v) => save(sys.id, { linkedId: v })}
              />
            ) : state[sys.id].action === 'create' ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="System name">
                    <Input
                      disabled={!editable}
                      value={(state[sys.id].payload.name as string) ?? ''}
                      onChange={(e) => setPayload(sys.id, 'name', e.target.value)}
                    />
                  </Field>
                  <Field label="System type">
                    <TypeSelect
                      editable={editable}
                      value={(state[sys.id].payload.system_type_id as string) ?? null}
                      options={props.systemTypes}
                      onChange={(v) => setPayload(sys.id, 'system_type_id', v)}
                    />
                  </Field>
                </div>
                <MoreDetails>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Location">
                      <Input
                        disabled={!editable}
                        placeholder="e.g. Plant room, Level 2"
                        value={(state[sys.id].payload.location as string) ?? ''}
                        onChange={(e) => setPayload(sys.id, 'location', e.target.value)}
                      />
                    </Field>
                    <Field label="Install date">
                      <Input
                        type="date"
                        disabled={!editable}
                        value={(state[sys.id].payload.install_date as string) ?? ''}
                        onChange={(e) => setPayload(sys.id, 'install_date', e.target.value || null)}
                      />
                    </Field>
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-medium text-muted-foreground">
                      Visit requirements
                    </div>
                    <FlagsGrid
                      payload={state[sys.id].payload}
                      onToggle={(k, v) => setPayload(sys.id, k, v)}
                      editable={editable}
                    />
                  </div>
                </MoreDetails>
              </div>
            ) : null}

            {/* Services + their charges (one per priced line) */}
            {state[sys.id].action !== 'skip' &&
              services.map((service) => {
                const charge = items.find(
                  (i) => i.entity_type === 'charge' && i.parent_key === service.local_key,
                )
                return (
                  <div
                    key={service.id}
                    className="mt-3 space-y-3 rounded-md border bg-muted/20 p-3"
                  >
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Wrench className="h-4 w-4" /> Service
                </div>
                <ActionToggle
                  editable={editable}
                  allowSkip
                  value={state[service.id].action}
                  confidence={state[service.id].confidence}
                  hasSuggestion={!!state[service.id].suggestedId}
                  onChange={(action) => {
                    const linkedId =
                      action === 'link'
                        ? state[service.id].linkedId ?? state[service.id].suggestedId ?? null
                        : state[service.id].linkedId
                    save(service.id, { action, linkedId })
                  }}
                />
                {state[service.id].action === 'link' ? (
                  <LinkSelect
                    editable={editable}
                    placeholder={resolvedSiteId ? 'Select existing service' : 'Link the site first'}
                    value={state[service.id].linkedId}
                    options={servicesForSite.map((s) => ({
                      id: s.id,
                      name:
                        props.serviceTypes.find((t) => t.id === s.service_type_id)?.name ??
                        'Service',
                    }))}
                    onChange={(v) => save(service.id, { linkedId: v })}
                  />
                ) : state[service.id].action === 'create' ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Service type">
                      <TypeSelect
                        editable={editable}
                        value={(state[service.id].payload.service_type_id as string) ?? null}
                        options={props.serviceTypes}
                        onChange={(v) => setPayload(service.id, 'service_type_id', v)}
                      />
                    </Field>
                    <Field label="Frequency (months)">
                      <Input
                        type="number"
                        min={1}
                        max={12}
                        disabled={!editable}
                        value={(state[service.id].payload.frequency_months as number) ?? 12}
                        onChange={(e) => {
                          const m = Math.max(1, Math.min(12, Number(e.target.value) || 12))
                          setState((prev) => ({
                            ...prev,
                            [service.id]: {
                              ...prev[service.id],
                              payload: {
                                ...prev[service.id].payload,
                                frequency_months: m,
                                frequency_value: m,
                              },
                            },
                          }))
                          save(service.id, {
                            payload: {
                              ...state[service.id].payload,
                              frequency_months: m,
                              frequency_value: m,
                            },
                          })
                        }}
                      />
                    </Field>
                    <Field label="Delivered by">
                      <Select
                        disabled={!editable}
                        value={(state[service.id].payload.worker_type as string) ?? 'cdo'}
                        onValueChange={(v) => setPayload(service.id, 'worker_type', v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cdo">CDO (in-house)</SelectItem>
                          <SelectItem value="engineer">Engineer</SelectItem>
                          <SelectItem value="subcontractor">Subcontractor</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    {state[service.id].payload.worker_type === 'subcontractor' && (
                      <Field label="Subcontractor">
                        <TypeSelect
                          editable={editable}
                          value={(state[service.id].payload.subcontractor_id as string) ?? null}
                          options={props.subcontractors}
                          onChange={(v) => setPayload(service.id, 'subcontractor_id', v)}
                        />
                      </Field>
                    )}
                    <Field label="First / next service date">
                      <Input
                        type="date"
                        disabled={!editable}
                        value={(state[service.id].payload.next_service_date as string) ?? ''}
                        onChange={(e) =>
                          setPayload(service.id, 'next_service_date', e.target.value || null)
                        }
                      />
                    </Field>
                    <div className="sm:col-span-2">
                      <MoreDetails>
                        <SwitchField
                          label="Comprehensive cover"
                          checked={state[service.id].payload.comprehensive_cover === true}
                          onChange={(v) => setPayload(service.id, 'comprehensive_cover', v)}
                          editable={editable}
                        />
                        <Field label="Reporting emails">
                          <Textarea
                            disabled={!editable}
                            rows={2}
                            placeholder="Comma-separated addresses for this service's reports"
                            value={emailsToText(state[service.id].payload.reporting_emails)}
                            onChange={(e) =>
                              setPayload(
                                service.id,
                                'reporting_emails',
                                textToEmails(e.target.value),
                              )
                            }
                          />
                        </Field>
                        <div>
                          <div className="mb-2 text-xs font-medium text-muted-foreground">
                            Visit requirements
                          </div>
                          <FlagsGrid
                            payload={state[service.id].payload}
                            onToggle={(k, v) => setPayload(service.id, k, v)}
                            editable={editable}
                          />
                        </div>
                      </MoreDetails>
                    </div>
                    <div className="sm:col-span-2">
                      <MissingInfo
                        fields={[
                          !state[service.id].payload.service_type_id && 'service type',
                          !state[service.id].payload.next_service_date && 'first service date',
                        ].filter(Boolean) as string[]}
                      />
                    </div>
                  </div>
                ) : null}
                {/* Charge for this service */}
                {charge && state[service.id].action !== 'skip' && (
                  <>
                <Separator className="my-2" />
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Coins className="h-4 w-4" /> Recurring charge
                </div>
                <ActionToggle
                  editable={editable}
                  allowSkip
                  value={state[charge.id].action}
                  confidence={null}
                  hasSuggestion={false}
                  onChange={(action) => save(charge.id, { action })}
                />
                {state[charge.id].action === 'create' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Description" className="sm:col-span-2">
                      <Input
                        disabled={!editable}
                        value={(state[charge.id].payload.description as string) ?? ''}
                        onChange={(e) => setPayload(charge.id, 'description', e.target.value)}
                      />
                    </Field>
                    <Field label="Price (£ per period)">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        disabled={!editable}
                        value={centsToPounds(state[charge.id].payload.unit_price_pence as number)}
                        onChange={(e) =>
                          setPayload(
                            charge.id,
                            'unit_price_pence',
                            Math.round((Number(e.target.value) || 0) * 100),
                          )
                        }
                      />
                    </Field>
                    <Field label="Frequency">
                      <Select
                        disabled={!editable}
                        value={(state[charge.id].payload.frequency as string) ?? 'annual'}
                        onValueChange={(v) => setPayload(charge.id, 'frequency', v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="annual">Annual</SelectItem>
                          <SelectItem value="four_monthly">Four-monthly</SelectItem>
                          <SelectItem value="bi_monthly">Bi-monthly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="on_demand">On demand</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Renewal month *">
                      <Select
                        disabled={!editable}
                        value={
                          state[charge.id].payload.renewal_month
                            ? String(state[charge.id].payload.renewal_month)
                            : ''
                        }
                        onValueChange={(v) => setPayload(charge.id, 'renewal_month', Number(v))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select month" />
                        </SelectTrigger>
                        <SelectContent>
                          {MONTH_LABELS.map((m, i) => (
                            <SelectItem key={m} value={String(i + 1)}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Subcontracted?">
                      <Select
                        disabled={!editable}
                        value={state[charge.id].payload.is_subcontracted ? 'yes' : 'no'}
                        onValueChange={(v) => setPayload(charge.id, 'is_subcontracted', v === 'yes')}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="no">No</SelectItem>
                          <SelectItem value="yes">Yes</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    {state[charge.id].payload.is_subcontracted === true && (
                      <Field label="Subcontract cost (£)">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          disabled={!editable}
                          value={centsToPounds(
                            state[charge.id].payload.subcontract_price_pence as number,
                          )}
                          onChange={(e) =>
                            setPayload(
                              charge.id,
                              'subcontract_price_pence',
                              Math.round((Number(e.target.value) || 0) * 100),
                            )
                          }
                        />
                      </Field>
                    )}
                    <div className="sm:col-span-2">
                      <MoreDetails>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="Billing timing">
                            <Select
                              disabled={!editable}
                              value={(state[charge.id].payload.timing as string) ?? 'advance'}
                              onValueChange={(v) => setPayload(charge.id, 'timing', v)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="advance">In advance</SelectItem>
                                <SelectItem value="arrears">In arrears</SelectItem>
                              </SelectContent>
                            </Select>
                          </Field>
                          <Field label="Start date">
                            <Input
                              type="date"
                              disabled={!editable}
                              value={(state[charge.id].payload.start_date as string) ?? ''}
                              onChange={(e) =>
                                setPayload(charge.id, 'start_date', e.target.value || null)
                              }
                            />
                          </Field>
                          <Field label="Nominal code" className="sm:col-span-2">
                            <TypeSelect
                              editable={editable}
                              allowClear
                              placeholder="Resolve automatically"
                              value={(state[charge.id].payload.nominal_code_id as string) ?? null}
                              options={props.nominalCodes.map((n) => ({
                                id: n.id,
                                name: `${n.code} — ${n.name}`,
                              }))}
                              onChange={(v) => setPayload(charge.id, 'nominal_code_id', v)}
                            />
                          </Field>
                        </div>
                      </MoreDetails>
                    </div>
                  </div>
                )}
                  </>
                )}
                  </div>
                )
              })}
          </EntityCard>
        )
      })}

      {/* Notes */}
      <EntityCard title="Review notes">
        <Textarea
          disabled={!editable}
          rows={3}
          placeholder="Notes for the record (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
        />
      </EntityCard>

      {/* Footer actions */}
      {editable && (
        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">Cancel review</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel this contract review?</AlertDialogTitle>
                <AlertDialogDescription>
                  The draft records will be discarded. The accepted quote is not affected. This
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep review</AlertDialogCancel>
                <AlertDialogAction onClick={onCancel}>Cancel review</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <div className="flex items-center gap-2">
            {isPending && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving
              </span>
            )}
            <Button onClick={onCommit} disabled={!canCommit || committing}>
              {committing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Committing
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Commit &amp; Go Live
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function centsToPounds(pence: number | undefined | null): number {
  return typeof pence === 'number' ? Math.round(pence) / 100 : 0
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'committed'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
      : status === 'cancelled'
        ? 'bg-muted text-muted-foreground border-border'
        : 'bg-amber-100 text-amber-800 border-amber-200'
  return (
    <Badge variant="outline" className={tone}>
      {status}
    </Badge>
  )
}

function EntityCard({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function ActionToggle({
  value,
  onChange,
  editable,
  allowSkip,
  confidence,
  hasSuggestion,
}: {
  value: ContractReviewAction
  onChange: (a: ContractReviewAction) => void
  editable: boolean
  allowSkip: boolean
  confidence: number | null
  hasSuggestion: boolean
}) {
  const options: { value: ContractReviewAction; label: string }[] = [
    { value: 'create', label: 'Create new' },
    { value: 'link', label: 'Link existing' },
  ]
  if (allowSkip) options.push({ value: 'skip', label: 'Skip' })
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex overflow-hidden rounded-md border">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={!editable}
            onClick={() => onChange(o.value)}
            className={cn(
              'px-3 py-1.5 text-sm transition-colors disabled:opacity-60',
              value === o.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {hasSuggestion && confidence != null && confidence > 0 && (
        <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200">
          {Math.round(confidence * 100)}% match found
        </Badge>
      )}
    </div>
  )
}

function LinkSelect({
  value,
  options,
  onChange,
  placeholder,
  editable,
}: {
  value: string | null
  options: IdName[]
  onChange: (v: string | null) => void
  placeholder: string
  editable: boolean
}) {
  return (
    <Select
      disabled={!editable || options.length === 0}
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.length === 0 ? (
          <SelectItem value={NONE} disabled>
            {placeholder}
          </SelectItem>
        ) : (
          options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  )
}

function TypeSelect({
  value,
  options,
  onChange,
  editable,
  placeholder = 'Select',
  allowClear = false,
}: {
  value: string | null
  options: IdName[]
  onChange: (v: string | null) => void
  editable: boolean
  placeholder?: string
  allowClear?: boolean
}) {
  return (
    <Select
      disabled={!editable}
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowClear && (
          <SelectItem value={NONE}>
            <span className="text-muted-foreground">None</span>
          </SelectItem>
        )}
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// Collapsible "More details" area so secondary setup fields stay out of the way
// but remain fully editable before commit.
function MoreDetails({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-md border border-dashed">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <span>More details</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="space-y-3 border-t p-3">{children}</div>}
    </div>
  )
}

// Amber, non-blocking hint listing recommended-but-empty fields for an entity.
function MissingInfo({ fields }: { fields: string[] }) {
  if (fields.length === 0) return null
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        <span className="font-medium">Recommended: </span>
        {fields.join(', ')}
      </span>
    </div>
  )
}

function SwitchField({
  label,
  checked,
  onChange,
  editable,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  editable: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <Label className="text-sm font-normal">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} disabled={!editable} />
    </div>
  )
}

// Shared booking/access/keys/two-engineers requirement flags used by site,
// system and service entities.
function FlagsGrid({
  payload,
  onToggle,
  editable,
}: {
  payload: Record<string, unknown>
  onToggle: (key: string, v: boolean) => void
  editable: boolean
}) {
  const flags: { key: string; label: string }[] = [
    { key: 'booking_required', label: 'Booking required' },
    { key: 'access_required', label: 'Access required' },
    { key: 'keys_required', label: 'Keys required' },
    { key: 'two_engineers_required', label: 'Two engineers' },
  ]
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {flags.map((f) => (
        <SwitchField
          key={f.key}
          label={f.label}
          checked={payload[f.key] === true}
          onChange={(v) => onToggle(f.key, v)}
          editable={editable}
        />
      ))}
    </div>
  )
}

// Reporting emails are stored as a string[]; edited as a comma/newline list.
function emailsToText(v: unknown): string {
  if (Array.isArray(v)) return (v as string[]).join(', ')
  return typeof v === 'string' ? v : ''
}
function textToEmails(text: string): string[] {
  return text
    .split(/[,\n;]/)
    .map((s) => s.trim())
    .filter(Boolean)
}
