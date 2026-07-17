'use client'

import { useMemo, useRef, useState, type ComponentType } from 'react'
import { toast } from 'sonner'
import {
  Sparkles,
  Wand2,
  ListChecks,
  ClipboardList,
  ScrollText,
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  Trash2,
  ShieldCheck,
  BadgeCheck,
  FileText,
  Info,
  Loader2,
  Upload,
  Building2,
  MapPin,
  Gauge,
  PoundSterling,
  CircleCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { WORK_TYPES } from '@/lib/sales'
import { buildAssembly } from '@/lib/sales/quote-studio-assembly'
import {
  draftBrief,
  buildStudioSpec,
  saveStudioQuote,
  type StudioConfig,
  type StudioTakeoffItemInput,
  type StudioSpecPayload,
} from '@/app/(dashboard)/dashboard/sales/quote-studio/actions'
import type { StudioUnderstanding, StudioRequirement } from '@/lib/ai/studio-draft'

// ---------------------------------------------------------------- types

export interface StudioClientSite {
  id: string
  name: string
}
export interface StudioClient {
  id: string
  name: string
  sites: StudioClientSite[]
}

interface TakeoffRow {
  uid: string
  device_key: string
  label: string
  zone: string
  quantity: number
  confidence: 'high' | 'medium' | 'low' | 'manual'
  evidence: string | null
  rationale?: string
}

type Phase = 'brief' | 'review' | 'takeoff' | 'document' | 'saved'

const PHASES: { id: Phase; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'brief', label: 'Brief', icon: Wand2 },
  { id: 'review', label: 'AI draft', icon: ListChecks },
  { id: 'takeoff', label: 'Devices & price', icon: ClipboardList },
  { id: 'document', label: 'Specification', icon: ScrollText },
]

// --------------------------------------------------------------- helpers

const gbp = (pence: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format((pence || 0) / 100)

let uidCounter = 0
const nextUid = () => `row-${Date.now()}-${uidCounter++}`

function parseCategory(text: string): string {
  const m = (text || '').match(/\b(L[1-5]|P[12]|M)\b/)
  return m ? m[1] : 'L1'
}

function specToText(understanding: StudioUnderstanding, category: string, spec: StudioSpecPayload): string {
  const parts: string[] = []
  parts.push(`FIRE DETECTION & ALARM DESIGN SPECIFICATION — Category ${category} (${understanding.standard})`)
  parts.push('')
  for (const s of spec.sections) {
    parts.push(`${s.number}. ${s.title}`)
    parts.push(s.body)
    for (const b of s.bullets) parts.push(`  • ${b}`)
    parts.push('')
  }
  parts.push(`Confirmed field devices: ${spec.deviceCount} across ${spec.zones.length} zone(s).`)
  parts.push('Final device counts confirmed against the approved layout drawing at design freeze.')
  return parts.join('\n')
}

// ---------------------------------------------------------------- root

export function QuoteStudio({ config, clients }: { config: StudioConfig; clients: StudioClient[] }) {
  const [phase, setPhase] = useState<Phase>('brief')

  // Brief + attachment
  const [brief, setBrief] = useState('')
  const [clientId, setClientId] = useState<string>('')
  const [siteId, setSiteId] = useState<string>('')
  const [prospectName, setProspectName] = useState('')
  const [workType, setWorkType] = useState('DSIC')

  // Draft results (editable)
  const [understanding, setUnderstanding] = useState<StudioUnderstanding | null>(null)
  const [requirements, setRequirements] = useState<StudioRequirement[]>([])
  const [designCategory, setDesignCategory] = useState('L1')
  const [rows, setRows] = useState<TakeoffRow[]>([])
  const [margin, setMargin] = useState(40)

  // Async flags
  const [extracting, setExtracting] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [buildingSpec, setBuildingSpec] = useState(false)
  const [saving, setSaving] = useState(false)
  const [spec, setSpec] = useState<StudioSpecPayload | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  const selectedClient = clients.find((c) => c.id === clientId)

  // Live pricing preview (pure, recomputed from the editable schedule).
  const assembly = useMemo(() => {
    const items = rows
      .filter((r) => r.quantity > 0)
      .map((r) => {
        const dt = config.deviceTypes.find((d) => d.device_key === r.device_key)
        return {
          device_key: r.device_key,
          label: r.label,
          quantity: r.quantity,
          catalogue_item_id: dt?.default_catalogue_item_id ?? null,
          contributes_to_device_count: dt?.contributes_to_device_count ?? true,
        }
      })
    const zoneCount = new Set(rows.filter((r) => r.quantity > 0).map((r) => r.zone || 'Z1')).size
    return buildAssembly({
      items,
      kitRules: config.kitRules,
      catalogue: config.catalogue,
      zones: zoneCount,
      loops: null,
      systemMargin: margin,
    })
  }, [rows, config, margin])

  function resetAll() {
    setPhase('brief')
    setBrief('')
    setClientId('')
    setSiteId('')
    setProspectName('')
    setWorkType('DSIC')
    setUnderstanding(null)
    setRequirements([])
    setDesignCategory('L1')
    setRows([])
    setSpec(null)
    setSavedId(null)
  }

  async function handleExtractDocument(file: File) {
    setExtracting(true)
    try {
      const fd = new FormData()
      fd.set('file', file)
      const res: { ok: boolean; text?: string; error?: string } | null = await fetch(
        '/api/quote-requests/extract-text',
        { method: 'POST', body: fd },
      )
        .then((r) => r.json())
        .catch(() => null)

      if (!res || !res.ok || !res.text) {
        toast.error(res?.error ?? 'Could not read that document.')
        return
      }
      // Append to whatever is already in the brief so a document can top up
      // notes the designer has already typed.
      setBrief((prev) => (prev.trim() ? `${prev.trim()}\n\n${res.text}` : (res.text ?? '')))
      toast.success(`Loaded "${file.name}" into the brief`)
    } catch {
      toast.error('Could not read that document. Please try again.')
    } finally {
      setExtracting(false)
    }
  }

  async function handleDraft() {
    if (!brief.trim()) {
      toast.error('Please paste or type the client brief first.')
      return
    }
    setDrafting(true)
    try {
      const res = await draftBrief(brief)
      if (!res.ok || !res.draft) {
        toast.error(res.error ?? 'Could not draft from the brief.')
        return
      }
      const d = res.draft
      setUnderstanding(d.understanding)
      setRequirements(d.requirements)
      setDesignCategory(parseCategory(d.understanding.category))
      if (!prospectName && !clientId && d.understanding.clientName) {
        setProspectName(d.understanding.clientName)
      }
      // Seed the editable takeoff from the AI's first-pass schedule.
      setRows(
        d.devices
          .filter((dev) => dev.quantity > 0)
          .map((dev) => {
            const dt = config.deviceTypes.find((t) => t.device_key === dev.device_key)
            return {
              uid: nextUid(),
              device_key: dev.device_key,
              label: dt?.label ?? dev.device_key,
              zone: dev.zone || 'Z1',
              quantity: dev.quantity,
              confidence: 'low' as const,
              evidence: null,
              rationale: dev.rationale,
            }
          }),
      )
      setPhase('review')
    } catch {
      toast.error('Could not draft from the brief. Please try again.')
    } finally {
      setDrafting(false)
    }
  }

  async function handleBuildSpec() {
    if (!understanding) return
    if (assembly.lines.length === 0) {
      toast.error('Add at least one device to the takeoff first.')
      return
    }
    setBuildingSpec(true)
    try {
      const items: StudioTakeoffItemInput[] = rows
        .filter((r) => r.quantity > 0)
        .map((r) => ({
          device_key: r.device_key,
          label: r.label,
          zone: r.zone || null,
          quantity: r.quantity,
          catalogue_item_id: null,
          confidence: r.confidence,
          evidence: r.evidence,
        }))
      const res = await buildStudioSpec({ understanding, designCategory, items })
      if (!res.ok || !res.spec) {
        toast.error(res.error ?? 'Could not build the specification.')
        return
      }
      setSpec(res.spec)
      setPhase('document')
    } catch {
      toast.error('Could not build the specification. Please try again.')
    } finally {
      setBuildingSpec(false)
    }
  }

  async function handleSave() {
    if (!understanding || !spec) return
    if (!clientId && !prospectName.trim()) {
      toast.error('Select a client or enter a prospect name.')
      return
    }
    setSaving(true)
    try {
      const items: StudioTakeoffItemInput[] = rows
        .filter((r) => r.quantity > 0)
        .map((r) => ({
          device_key: r.device_key,
          label: r.label,
          zone: r.zone || null,
          quantity: r.quantity,
          catalogue_item_id: null,
          confidence: r.confidence,
          evidence: r.evidence,
        }))
      const title = `${understanding.siteName || understanding.clientName || 'Fire Alarm'} — Category ${designCategory} FA`
      const res = await saveStudioQuote({
        title,
        workType,
        designCategory,
        source: 'manual',
        margin,
        client_id: clientId || null,
        site_id: siteId || null,
        prospect_name: clientId ? null : prospectName.trim(),
        understanding,
        requirements,
        items,
        spec,
        specificationText: specToText(understanding, designCategory, spec),
      })
      if (!res.ok || !res.id) {
        toast.error(res.error ?? 'Could not save the quote.')
        return
      }
      setSavedId(res.id)
      setPhase('saved')
      toast.success('Quote created from the specification.')
    } catch {
      toast.error('Could not save the quote. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Row helpers -------------------------------------------------------
  function updateRow(uid: string, patch: Partial<TakeoffRow>) {
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)))
  }
  function removeRow(uid: string) {
    setRows((prev) => prev.filter((r) => r.uid !== uid))
  }
  function addRow(deviceKey: string) {
    const dt = config.deviceTypes.find((d) => d.device_key === deviceKey)
    if (!dt) return
    setRows((prev) => [
      ...prev,
      {
        uid: nextUid(),
        device_key: deviceKey,
        label: dt.label,
        zone: 'Z1',
        quantity: 1,
        confidence: 'manual',
        evidence: null,
      },
    ])
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
      <Header />
      <PhaseRail phase={phase} />

      {phase === 'brief' && (
        <BriefStep
          brief={brief}
          onBrief={setBrief}
          clients={clients}
          clientId={clientId}
          onClient={(v) => {
            setClientId(v)
            setSiteId('')
          }}
          selectedClient={selectedClient}
          siteId={siteId}
          onSite={setSiteId}
          prospectName={prospectName}
          onProspect={setProspectName}
          workType={workType}
          onWorkType={setWorkType}
          drafting={drafting}
          onDraft={handleDraft}
          extracting={extracting}
          onUploadDocument={handleExtractDocument}
        />
      )}

      {phase === 'review' && understanding && (
        <ReviewStep
          understanding={understanding}
          onUnderstanding={setUnderstanding}
          requirements={requirements}
          onRequirements={setRequirements}
          designCategory={designCategory}
          onCategory={setDesignCategory}
          onBack={() => setPhase('brief')}
          onNext={() => setPhase('takeoff')}
        />
      )}

      {phase === 'takeoff' && (
        <TakeoffStep
          config={config}
          rows={rows}
          assembly={assembly}
          margin={margin}
          onMargin={setMargin}
          onUpdateRow={updateRow}
          onRemoveRow={removeRow}
          onAddRow={addRow}
          buildingSpec={buildingSpec}
          onBack={() => setPhase('review')}
          onNext={handleBuildSpec}
        />
      )}

      {phase === 'document' && understanding && spec && (
        <DocumentStep
          understanding={understanding}
          designCategory={designCategory}
          spec={spec}
          assembly={assembly}
          saving={saving}
          onBack={() => setPhase('takeoff')}
          onSave={handleSave}
        />
      )}

      {phase === 'saved' && savedId && <SavedStep quoteId={savedId} onRestart={resetAll} />}
    </div>
  )
}

// ---------------------------------------------------------------- header

function Header() {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </span>
        <h1 className="text-xl font-bold tracking-tight text-balance">Quote Studio</h1>
        <Badge variant="secondary" className="ml-1">
          Fire Alarm
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground text-pretty">
        Start from the client&apos;s brief. AI drafts the understanding, requirements and a first-pass device schedule;
        your designer confirms the numbers, and the studio prices it from the catalogue and produces a BS 5839-1 /
        BAFE SP203-1 specification — saved as a real quote.
      </p>
    </div>
  )
}

function PhaseRail({ phase }: { phase: Phase }) {
  const activeIndex = PHASES.findIndex((p) => p.id === phase)
  const idx = phase === 'saved' ? PHASES.length : activeIndex
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PHASES.map((p, i) => {
        const done = i < idx
        const active = i === idx
        const Icon = p.icon
        return (
          <div key={p.id} className="flex items-center gap-2">
            <span
              className={cn(
                'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium',
                active && 'border-primary bg-primary/10 text-primary',
                done && 'border-primary/30 bg-primary/5 text-primary',
                !active && !done && 'text-muted-foreground',
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              {p.label}
            </span>
            {i < PHASES.length - 1 && <span className="h-px w-4 bg-border" />}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- brief

function BriefStep({
  brief,
  onBrief,
  clients,
  clientId,
  onClient,
  selectedClient,
  siteId,
  onSite,
  prospectName,
  onProspect,
  workType,
  onWorkType,
  drafting,
  onDraft,
  extracting,
  onUploadDocument,
}: {
  brief: string
  onBrief: (v: string) => void
  clients: StudioClient[]
  clientId: string
  onClient: (v: string) => void
  selectedClient?: StudioClient
  siteId: string
  onSite: (v: string) => void
  prospectName: string
  onProspect: (v: string) => void
  workType: string
  onWorkType: (v: string) => void
  drafting: boolean
  onDraft: () => void
  extracting: boolean
  onUploadDocument: (file: File) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="flex flex-col gap-4">
      <StepHeading
        icon={Wand2}
        title="Paste the client's brief"
        description="An enquiry email, a specification, or a few lines describing the job. The more detail, the better the first draft."
      />
      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <Textarea
            value={brief}
            onChange={(e) => onBrief(e.target.value)}
            rows={9}
            placeholder="e.g. We've taken on the maintenance of a 3-storey care home in Leeds and need to replace the ageing fire alarm. There's also a new single-storey wing with 8 bedrooms and a day room that needs covering. Sleeping risk, staff-assisted evacuation…"
            className="resize-y"
          />

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onUploadDocument(f)
                e.target.value = ''
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={extracting}
              onClick={() => fileInputRef.current?.click()}
            >
              {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {extracting ? 'Reading document…' : 'Upload a document'}
            </Button>
            <span className="text-xs text-muted-foreground">
              Add a tender pack, enquiry email or spec (PDF, Word or text) and we&apos;ll read it into the
              brief.
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Client</Label>
              <Select value={clientId || 'none'} onValueChange={(v) => onClient(v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Prospect (not yet a client)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Prospect (not yet a client)</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {clientId ? (
              <div className="grid gap-1.5">
                <Label>Site</Label>
                <Select value={siteId || 'none'} onValueChange={(v) => onSite(v === 'none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a site (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No specific site</SelectItem>
                    {(selectedClient?.sites ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label>Prospect name</Label>
                <Input
                  value={prospectName}
                  onChange={(e) => onProspect(e.target.value)}
                  placeholder="e.g. Meadowview Care Home"
                />
              </div>
            )}

            <div className="grid gap-1.5">
              <Label>Type of work</Label>
              <Select value={workType} onValueChange={onWorkType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORK_TYPES.filter((t) => t.code !== 'SVC' && t.code !== 'MON').map((t) => (
                    <SelectItem key={t.code} value={t.code}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              AI drafts a starting point — your designer confirms every figure before it&apos;s issued.
            </p>
            <Button onClick={onDraft} disabled={drafting || !brief.trim()} className="gap-2">
              {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {drafting ? 'Drafting…' : 'Draft quote with AI'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------- review

function ReviewStep({
  understanding,
  onUnderstanding,
  requirements,
  onRequirements,
  designCategory,
  onCategory,
  onBack,
  onNext,
}: {
  understanding: StudioUnderstanding
  onUnderstanding: (u: StudioUnderstanding) => void
  requirements: StudioRequirement[]
  onRequirements: (r: StudioRequirement[]) => void
  designCategory: string
  onCategory: (v: string) => void
  onBack: () => void
  onNext: () => void
}) {
  const set = (patch: Partial<StudioUnderstanding>) => onUnderstanding({ ...understanding, ...patch })
  return (
    <div className="flex flex-col gap-4">
      <StepHeading
        icon={ListChecks}
        title="What the AI understood"
        description="Review and correct. This drives the specification wording and the device schedule."
      />

      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-primary/40 text-primary">
              {understanding.standard || 'BS 5839-1:2025'}
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <Gauge className="h-3 w-3" />
              {understanding.confidence}% confident
            </Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <FactField icon={Building2} label="Client" value={understanding.clientName} onChange={(v) => set({ clientName: v })} />
            <FactField icon={MapPin} label="Site" value={understanding.siteName} onChange={(v) => set({ siteName: v })} />
            <FactField label="Address" value={understanding.siteAddress} onChange={(v) => set({ siteAddress: v })} />
            <FactField label="Building type" value={understanding.buildingType} onChange={(v) => set({ buildingType: v })} />
            <FactField label="Work" value={understanding.workType} onChange={(v) => set({ workType: v })} />
            <div className="grid gap-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Design category</Label>
              <Input value={designCategory} onChange={(e) => onCategory(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Summary &amp; category rationale</Label>
            <Textarea value={understanding.summary} onChange={(e) => set({ summary: e.target.value })} rows={4} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wide">Requirements</h3>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => onRequirements([...requirements, { text: '', system: 'Fire Alarm', priority: 'should' }])}
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
          {requirements.length === 0 && (
            <p className="text-sm text-muted-foreground">No requirements extracted — add any that matter.</p>
          )}
          <div className="flex flex-col gap-2">
            {requirements.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <PriorityDot priority={r.priority} />
                <Input
                  value={r.text}
                  onChange={(e) => {
                    const next = requirements.slice()
                    next[i] = { ...r, text: e.target.value }
                    onRequirements(next)
                  }}
                  className="flex-1"
                  placeholder="Requirement…"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onRequirements(requirements.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <StepNav onBack={onBack} backLabel="Brief" onNext={onNext} nextLabel="Devices & price" />
    </div>
  )
}

// ---------------------------------------------------------------- takeoff

function TakeoffStep({
  config,
  rows,
  assembly,
  margin,
  onMargin,
  onUpdateRow,
  onRemoveRow,
  onAddRow,
  buildingSpec,
  onBack,
  onNext,
}: {
  config: StudioConfig
  rows: TakeoffRow[]
  assembly: ReturnType<typeof buildAssembly>
  margin: number
  onMargin: (v: number) => void
  onUpdateRow: (uid: string, patch: Partial<TakeoffRow>) => void
  onRemoveRow: (uid: string) => void
  onAddRow: (deviceKey: string) => void
  buildingSpec: boolean
  onBack: () => void
  onNext: () => void
}) {
  const [addKey, setAddKey] = useState('')
  return (
    <div className="flex flex-col gap-4">
      <StepHeading
        icon={ClipboardList}
        title="Confirm the device schedule"
        description="AI-estimated quantities are a starting point — adjust each figure against the drawing or your survey. Confirmed counts drive both the price and the specification."
      />

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex items-start gap-3 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs text-muted-foreground text-pretty">
            <span className="font-semibold text-foreground">Designer confirmation required.</span> These quantities are
            AI estimates from the brief. Confirm them against the approved layout drawing before the quote is issued —
            drawing-read takeoff arrives in a later phase.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 font-medium">Device</th>
                  <th className="pb-2 font-medium">Zone</th>
                  <th className="w-24 pb-2 text-right font-medium">Qty</th>
                  <th className="pb-2 pl-3 font-medium">Confidence</th>
                  <th className="w-10 pb-2" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      No devices yet. Add one below to begin the schedule.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.uid} className="border-b last:border-0">
                    <td className="py-2 pr-2 font-medium">{r.label}</td>
                    <td className="py-2 pr-2">
                      <Input
                        value={r.zone}
                        onChange={(e) => onUpdateRow(r.uid, { zone: e.target.value })}
                        className="h-8 w-28"
                      />
                    </td>
                    <td className="py-2 text-right">
                      <Input
                        type="number"
                        min={0}
                        value={r.quantity}
                        onChange={(e) =>
                          onUpdateRow(r.uid, {
                            quantity: Math.max(0, Number.parseInt(e.target.value || '0', 10)),
                            confidence: 'manual',
                          })
                        }
                        className="h-8 w-20 text-right tabular-nums"
                      />
                    </td>
                    <td className="py-2 pl-3">
                      <ConfidenceBadge confidence={r.confidence} rationale={r.rationale} />
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => onRemoveRow(r.uid)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={addKey} onValueChange={setAddKey}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Add a device type…" />
              </SelectTrigger>
              <SelectContent>
                {config.deviceTypes.map((d) => (
                  <SelectItem key={d.device_key} value={d.device_key}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="gap-1.5"
              disabled={!addKey}
              onClick={() => {
                if (addKey) {
                  onAddRow(addKey)
                  setAddKey('')
                }
              }}
            >
              <Plus className="h-4 w-4" />
              Add device
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Live pricing */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
              <PoundSterling className="h-4 w-4 text-primary" />
              Catalogue pricing
            </h3>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Margin %</Label>
              <Input
                type="number"
                min={0}
                max={95}
                value={margin}
                onChange={(e) => onMargin(Math.min(95, Math.max(0, Number.parseInt(e.target.value || '0', 10))))}
                className="h-8 w-20 text-right tabular-nums"
              />
            </div>
          </div>

          {assembly.unmappedKeys.length > 0 && (
            <p className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <Info className="h-3.5 w-3.5" />
              {assembly.unmappedKeys.length} item(s) have no catalogue cost yet — add them in the catalogue for accurate
              pricing.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 font-medium">Item</th>
                  <th className="pb-2 text-right font-medium">Qty</th>
                  <th className="pb-2 text-right font-medium">Unit</th>
                  <th className="pb-2 text-right font-medium">Line</th>
                </tr>
              </thead>
              <tbody>
                {assembly.lines.map((l) => (
                  <tr key={l.key} className="border-b last:border-0">
                    <td className="py-1.5 pr-2">
                      {l.description}
                      {l.sourceType === 'kit' && (
                        <span className="ml-2 text-xs text-muted-foreground">{l.is_service ? 'labour' : 'kit'}</span>
                      )}
                      {l.unmapped && <span className="ml-2 text-xs text-destructive">no cost</span>}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{l.quantity}</td>
                    <td className="py-1.5 text-right tabular-nums">{gbp(l.unit_price_pence)}</td>
                    <td className="py-1.5 text-right tabular-nums">{gbp(l.line_total_pence)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Separator />
          <div className="flex flex-wrap items-center justify-end gap-6 text-sm">
            <span className="text-muted-foreground">
              Cost <span className="font-medium text-foreground tabular-nums">{gbp(assembly.totalCostPence)}</span>
            </span>
            <span className="text-muted-foreground">
              Devices <span className="font-medium text-foreground tabular-nums">{assembly.deviceCount}</span>
            </span>
            <span className="text-base font-bold">
              Sell <span className="tabular-nums">{gbp(assembly.totalSellPence)}</span>
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3 pt-2">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          AI draft
        </Button>
        <Button onClick={onNext} disabled={buildingSpec || assembly.lines.length === 0} className="gap-2">
          {buildingSpec ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScrollText className="h-4 w-4" />}
          {buildingSpec ? 'Building specification…' : 'Build specification'}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- document

function DocumentStep({
  understanding,
  designCategory,
  spec,
  assembly,
  saving,
  onBack,
  onSave,
}: {
  understanding: StudioUnderstanding
  designCategory: string
  spec: StudioSpecPayload
  assembly: ReturnType<typeof buildAssembly>
  saving: boolean
  onBack: () => void
  onSave: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <StepHeading
        icon={ScrollText}
        title="Design specification"
        description="Generated from the confirmed schedule to BS 5839-1:2025 / BAFE SP203-1. Review, then save as a quote."
      />

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between bg-[#1f2937] px-6 py-5 text-white">
          <div>
            <p className="text-lg font-bold tracking-tight">PYROCEL</p>
            <p className="text-xs text-white/70">Fire &amp; Security Systems</p>
          </div>
          <div className="text-right text-xs text-white/80">
            <p className="text-sm font-semibold text-white">Fire Alarm Design Specification</p>
            <p>Category {designCategory} · {understanding.standard}</p>
          </div>
        </div>

        <CardContent className="flex flex-col gap-6 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prepared for</p>
              <p className="mt-1 text-sm font-medium">{understanding.clientName || '—'}</p>
              <p className="text-sm text-muted-foreground">{understanding.siteName}</p>
              <p className="text-sm text-muted-foreground">{understanding.siteAddress}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scope</p>
              <p className="mt-1 text-sm">{understanding.workType}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 sm:justify-end">
                <Badge variant="outline" className="border-primary/40 text-primary">
                  Category {designCategory}
                </Badge>
                <Badge variant="secondary">
                  {spec.deviceCount} devices · {spec.zones.length} zones
                </Badge>
              </div>
            </div>
          </div>

          <Separator />

          {spec.sections.map((s) => (
            <div key={s.id}>
              <h3 className="text-sm font-bold uppercase tracking-wide">
                {s.number}. {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">{s.body}</p>
              {s.bullets.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {s.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                      <span className="text-pretty">{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          <Separator />

          {/* Zones */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide">Detection &amp; alarm zones</h3>
            <DocTable
              className="mt-3"
              head={['Zone', 'Area', 'Detection', 'Devices']}
              rows={spec.zones.map((z) => [z.zone, z.area, z.detection, String(z.devices)])}
              alignLast
            />
          </div>

          {/* Battery */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide">Standby battery calculation (BS 5839-1 §25)</h3>
            <DocTable
              className="mt-3"
              head={['Parameter', 'Value']}
              rows={spec.battery.map((b) => [b.label, b.value])}
              alignLast
            />
          </div>

          {/* Cause & effect */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide">Cause &amp; effect</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 font-medium">Input</th>
                    {spec.ceOutputs.map((o) => (
                      <th key={o} className="pb-2 text-center font-medium">
                        {o}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {spec.ceMatrix.map((row) => (
                    <tr key={row.input} className="border-b last:border-0">
                      <td className="py-2 font-medium">{row.input}</td>
                      {row.effects.map((on, i) => (
                        <td key={i} className="py-2 text-center">
                          {on ? (
                            <Check className="mx-auto h-4 w-4 text-primary" />
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Equipment */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide">Equipment schedule</h3>
            <p className="mt-2 text-sm text-muted-foreground text-pretty">
              All equipment third-party approved to the relevant part of the BS EN 54 series. Final quantities confirmed
              against the approved layout drawing at design freeze.
            </p>
            <DocTable
              className="mt-3"
              head={['Ref', 'Description', 'Standard', 'Qty']}
              rows={spec.equipment.map((e) => [e.ref, e.description, e.standard, String(e.qty)])}
              alignLast
            />
          </div>

          <Separator />

          {/* Investment */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Investment</p>
              <p className="text-xs text-muted-foreground">Excludes VAT. Priced from the current catalogue.</p>
            </div>
            <span className="text-2xl font-bold tabular-nums">{gbp(assembly.totalSellPence)}</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 rounded-lg bg-muted/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <span className="text-xs font-medium">BAFE SP203-1 certificated</span>
            </div>
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-primary" />
              <span className="text-xs font-medium">NSI Gold approved</span>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <span className="text-xs font-medium">Design, Installation &amp; Commissioning certificates issued</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Devices &amp; price
        </Button>
        <Button onClick={onSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? 'Saving…' : 'Save as quote'}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- saved

function SavedStep({ quoteId, onRestart }: { quoteId: string; onRestart: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CircleCheck className="h-7 w-7" />
        </span>
        <div className="grid gap-1">
          <h2 className="text-lg font-bold">Quote created</h2>
          <p className="text-sm text-muted-foreground text-pretty">
            The specification and priced schedule have been saved as a real quote. Open it to review, adjust line items
            or send it to the client.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button asChild className="gap-2">
            <a href={`/dashboard/sales/${quoteId}`}>
              Open quote
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
          <Button variant="outline" onClick={onRestart}>
            Start another
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------- primitives

function StepHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  description?: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <div className="grid gap-1">
        <h2 className="text-lg font-bold leading-tight tracking-tight text-balance">{title}</h2>
        {description && <p className="text-sm text-muted-foreground text-pretty">{description}</p>}
      </div>
    </div>
  )
}

function FactField({
  icon: Icon,
  label,
  value,
  onChange,
}: {
  icon?: ComponentType<{ className?: string }>
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function ConfidenceBadge({
  confidence,
  rationale,
}: {
  confidence: 'high' | 'medium' | 'low' | 'manual'
  rationale?: string
}) {
  const map = {
    high: { c: 'bg-primary/10 text-primary border-primary/30', t: 'AI · high' },
    medium: { c: 'bg-amber-500/10 text-amber-600 border-amber-500/30', t: 'AI · medium' },
    low: { c: 'bg-amber-500/10 text-amber-600 border-amber-500/30', t: 'AI · estimate' },
    manual: { c: 'bg-muted text-muted-foreground border-border', t: 'Confirmed' },
  } as const
  const m = map[confidence]
  return (
    <span
      className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', m.c)}
      title={rationale ?? undefined}
    >
      {m.t}
    </span>
  )
}

function PriorityDot({ priority }: { priority: 'must' | 'should' | 'note' }) {
  const map = {
    must: { c: 'bg-primary', t: 'Must' },
    should: { c: 'bg-amber-500', t: 'Should' },
    note: { c: 'bg-muted-foreground', t: 'Note' },
  } as const
  const m = map[priority]
  return (
    <span className="flex w-16 shrink-0 items-center gap-1.5">
      <span className={cn('h-2 w-2 rounded-full', m.c)} />
      <span className="text-xs font-medium text-muted-foreground">{m.t}</span>
    </span>
  )
}

function DocTable({
  head,
  rows,
  alignLast,
  className,
}: {
  head: string[]
  rows: string[][]
  alignLast?: boolean
  className?: string
}) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            {head.map((h, i) => (
              <th key={i} className={cn('pb-2 font-medium', alignLast && i === head.length - 1 && 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b last:border-0">
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className={cn(
                    'py-2 align-top',
                    ci === 0 && 'font-medium',
                    alignLast && ci === r.length - 1 && 'text-right tabular-nums',
                  )}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StepNav({
  onBack,
  backLabel,
  onNext,
  nextLabel,
}: {
  onBack: () => void
  backLabel: string
  onNext: () => void
  nextLabel: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      <Button variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Button>
      <Button onClick={onNext} className="gap-2">
        {nextLabel}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
