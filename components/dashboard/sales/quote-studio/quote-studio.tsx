'use client'

import { useCallback, useMemo, useRef, useState, type ComponentType } from 'react'
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
  Layers,
  HelpCircle,
  TriangleAlert,
  Lightbulb,
  Factory,
} from 'lucide-react'
import { cn, formatPence } from '@/lib/utils'
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
  redraftBrief,
  buildStudioSpec,
  saveStudioQuote,
  draftDisciplineSection,
  type StudioConfig,
  type StudioTakeoffItemInput,
  type StudioSpecPayload,
  type StudioDiscipline,
  type StudioAdditionalSystemInput,
} from '@/app/(dashboard)/dashboard/sales/quote-studio/actions'
import type {
  StudioUnderstanding,
  StudioRequirement,
  StudioDesignReasoning,
} from '@/lib/ai/studio-draft'

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

/** An additional (non-fire) discipline quoted as its own priced section. */
interface AdditionalSection {
  uid: string
  code: string
  name: string
  config: StudioConfig
  rows: TakeoffRow[]
  notes: string[]
}

type Phase = 'brief' | 'review' | 'design' | 'takeoff' | 'document' | 'saved'

const PHASES: { id: Phase; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'brief', label: 'Brief', icon: Wand2 },
  { id: 'review', label: 'AI draft', icon: ListChecks },
  { id: 'design', label: 'Design rationale', icon: Layers },
  { id: 'takeoff', label: 'Devices & price', icon: ClipboardList },
  { id: 'document', label: 'Specification', icon: ScrollText },
]

// --------------------------------------------------------------- helpers

// Canonical GBP-from-pence formatter; see lib/utils.ts.
const gbp = formatPence

/** Sentinel key for the generic / unbranded default combination (no range). */
const GENERIC_KEY = '__generic__'

/** Display label for a product combination (manufacturer + range name). */
function combinationLabel(config: StudioConfig, key: string): string {
  if (key === GENERIC_KEY) return 'Generic / unbranded'
  const range = config.ranges.find((r) => r.id === key)
  if (!range) return 'Unknown combination'
  const manufacturer = config.manufacturers.find((m) => m.id === range.manufacturerId)
  return [manufacturer?.name, range.name].filter(Boolean).join(' ')
}

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

export function QuoteStudio({
  config,
  clients,
  disciplines = [],
}: {
  config: StudioConfig
  clients: StudioClient[]
  disciplines?: StudioDiscipline[]
}) {
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
  const [designReasoning, setDesignReasoning] = useState<StudioDesignReasoning | null>(null)
  const [designCategory, setDesignCategory] = useState('L1')
  const [rows, setRows] = useState<TakeoffRow[]>([])
  const [margin, setMargin] = useState(40)
  const [manufacturerId, setManufacturerId] = useState<string>('')
  const [rangeId, setRangeId] = useState<string>('')
  // Product combinations (manufacturer ranges) selected to compare on the quote.
  // Keys are range ids or GENERIC_KEY; the recommended one is the active range.
  const [compareKeys, setCompareKeys] = useState<string[]>([])
  const [optionNotes, setOptionNotes] = useState<Record<string, { pros: string; cons: string }>>({})
  // Additional discipline sections (access control, intruder, CCTV, EL).
  const [sections, setSections] = useState<AdditionalSection[]>([])
  const [addingCode, setAddingCode] = useState<string | null>(null)

  // Async flags
  const [extracting, setExtracting] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [redrafting, setRedrafting] = useState(false)
  const [buildingSpec, setBuildingSpec] = useState(false)
  const [saving, setSaving] = useState(false)
  const [spec, setSpec] = useState<StudioSpecPayload | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  const selectedClient = clients.find((c) => c.id === clientId)

  const selectedRange = config.ranges.find((r) => r.id === rangeId)

  // Resolve the catalogue part for a device key: range-specific part (when a
  // range is selected) → device default.
  const resolvePartId = useCallback(
    (deviceKey: string): string | null => {
      const dt = config.deviceTypes.find((d) => d.device_key === deviceKey)
      const rangePart = selectedRange ? selectedRange.parts[deviceKey] : undefined
      return rangePart ?? dt?.default_catalogue_item_id ?? null
    },
    [config.deviceTypes, selectedRange],
  )

  // Price the current schedule against ANY range (pure). Used for the live
  // preview and for the product-combination comparison table.
  const computeAssemblyForRange = useCallback(
    (rid: string | null) => {
      const range = rid ? config.ranges.find((r) => r.id === rid) : null
      const items = rows
        .filter((r) => r.quantity > 0)
        .map((r) => {
          const dt = config.deviceTypes.find((d) => d.device_key === r.device_key)
          const rangePart = range ? range.parts[r.device_key] : undefined
          return {
            device_key: r.device_key,
            label: r.label,
            quantity: r.quantity,
            catalogue_item_id: rangePart ?? dt?.default_catalogue_item_id ?? null,
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
        rangeId: rid,
        systemMargin: margin,
      })
    },
    [rows, config, margin],
  )

  // Live pricing preview for the active (recommended) range.
  const assembly = useMemo(
    () => computeAssemblyForRange(rangeId || null),
    [computeAssemblyForRange, rangeId],
  )

  // The recommended combination is always the active range.
  const recommendedKey = rangeId || GENERIC_KEY

  // Price every selected combination against the same schedule for comparison.
  const comparison = useMemo(
    () =>
      compareKeys.map((key) => {
        const rid = key === GENERIC_KEY ? null : key
        const a = computeAssemblyForRange(rid)
        return {
          key,
          rangeId: rid,
          name: combinationLabel(config, key),
          sellPence: a.totalSellPence,
          recommended: key === recommendedKey,
        }
      }),
    [compareKeys, computeAssemblyForRange, config, recommendedKey],
  )

  // Toggle a combination in/out of the comparison set.
  const toggleCompare = useCallback((key: string) => {
    setCompareKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }, [])

  // Mark a combination as recommended → drives the active range + manufacturer.
  const setRecommended = useCallback(
    (key: string) => {
      setCompareKeys((prev) => (prev.includes(key) ? prev : [...prev, key]))
      if (key === GENERIC_KEY) {
        setRangeId('')
        setManufacturerId('')
      } else {
        const range = config.ranges.find((r) => r.id === key)
        setRangeId(key)
        if (range) setManufacturerId(range.manufacturerId)
      }
    },
    [config.ranges],
  )

  const setOptionNote = useCallback((key: string, patch: { pros?: string; cons?: string }) => {
    setOptionNotes((prev) => ({
      ...prev,
      [key]: { pros: prev[key]?.pros ?? '', cons: prev[key]?.cons ?? '', ...patch },
    }))
  }, [])

  function resetAll() {
    setPhase('brief')
    setBrief('')
    setClientId('')
    setSiteId('')
    setProspectName('')
    setWorkType('DSIC')
    setUnderstanding(null)
    setRequirements([])
    setDesignReasoning(null)
    setDesignCategory('L1')
    setRows([])
    setManufacturerId('')
    setRangeId('')
    setSections([])
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
      setDesignReasoning(d.design ?? null)
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

  // Re-run the AI with the designer's current edits + a free-text steer, so the
  // interpretation and device quantities can be corrected mid-process. Designer-
  // owned (manual) rows are locked and preserved; the AI re-reasons the rest.
  async function handleRedraft(steer: string) {
    if (!understanding) return
    if (!steer.trim()) {
      toast.error('Add a correction or instruction for the AI first.')
      return
    }
    setRedrafting(true)
    try {
      const res = await redraftBrief({
        brief,
        steer,
        understanding,
        requirements,
        devices: rows.map((r) => ({
          device_key: r.device_key,
          label: r.label,
          zone: r.zone,
          quantity: r.quantity,
          locked: r.confidence === 'manual',
        })),
      })
      if (!res.ok || !res.draft) {
        toast.error(res.error ?? 'Could not re-draft.')
        return
      }
      const d = res.draft
      setUnderstanding(d.understanding)
      setRequirements(d.requirements)
      setDesignReasoning(d.design ?? null)
      setDesignCategory(parseCategory(d.understanding.category))
      // Merge: keep designer-owned (manual) rows at their quantities; refresh
      // the AI-derived remainder from the new schedule.
      setRows((prev) => {
        const manual = prev.filter((r) => r.confidence === 'manual')
        const manualKeys = new Set(manual.map((r) => r.device_key))
        const aiRows = d.devices
          .filter((dev) => dev.quantity > 0 && !manualKeys.has(dev.device_key))
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
          })
        return [...manual, ...aiRows]
      })
      toast.success('Re-drafted with your corrections.')
    } catch {
      toast.error('Could not re-draft. Please try again.')
    } finally {
      setRedrafting(false)
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
          catalogue_item_id: resolvePartId(r.device_key),
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
          catalogue_item_id: resolvePartId(r.device_key),
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
        rangeId: rangeId || null,
        comparisonOptions:
          compareKeys.length > 0
            ? compareKeys.map((key) => ({
                rangeId: key === GENERIC_KEY ? null : key,
                recommended: key === recommendedKey,
                pros: (optionNotes[key]?.pros ?? '')
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
                cons: (optionNotes[key]?.cons ?? '')
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
              }))
            : undefined,
        client_id: clientId || null,
        site_id: siteId || null,
        prospect_name: clientId ? null : prospectName.trim(),
        understanding,
        requirements,
        designReasoning,
        items,
        spec,
        specificationText: specToText(understanding, designCategory, spec),
        additionalSystems: sections
          .filter((s) => s.rows.some((r) => r.quantity > 0))
          .map<StudioAdditionalSystemInput>((s) => ({
            systemTypeCode: s.code,
            margin,
            rangeId: null,
            summary: null,
            specificationText: null,
            items: s.rows
              .filter((r) => r.quantity > 0)
              .map((r) => ({
                device_key: r.device_key,
                label: r.label,
                zone: r.zone || null,
                quantity: r.quantity,
                // Server re-resolves to the device default part.
                catalogue_item_id: null,
                confidence: r.confidence,
                evidence: r.evidence,
              })),
          })),
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

  // Additional discipline section helpers -----------------------------
  async function addSection(code: string) {
    if (sections.some((s) => s.code === code)) return
    setAddingCode(code)
    try {
      const res = await draftDisciplineSection(code, brief)
      if (!res.ok || !res.config) {
        toast.error(res.error ?? 'Could not add that system.')
        return
      }
      const cfg = res.config
      const secRows: TakeoffRow[] = (res.draft?.devices ?? [])
        .filter((d) => d.quantity > 0)
        .map((d) => {
          const dt = cfg.deviceTypes.find((t) => t.device_key === d.device_key)
          return {
            uid: nextUid(),
            device_key: d.device_key,
            label: dt?.label ?? d.device_key,
            zone: d.zone || 'Z1',
            quantity: d.quantity,
            confidence: 'low' as const,
            evidence: null,
            rationale: d.rationale,
          }
        })
      setSections((prev) => [
        ...prev,
        { uid: nextUid(), code, name: cfg.systemTypeName, config: cfg, rows: secRows, notes: res.draft?.notes ?? [] },
      ])
      toast.success(`${cfg.systemTypeName} added as a separate section.`)
    } catch {
      toast.error('Could not add that system. Please try again.')
    } finally {
      setAddingCode(null)
    }
  }
  function removeSection(uid: string) {
    setSections((prev) => prev.filter((s) => s.uid !== uid))
  }
  function updateSectionRow(sectionUid: string, rowUid: string, patch: Partial<TakeoffRow>) {
    setSections((prev) =>
      prev.map((s) =>
        s.uid === sectionUid
          ? { ...s, rows: s.rows.map((r) => (r.uid === rowUid ? { ...r, ...patch } : r)) }
          : s,
      ),
    )
  }
  function removeSectionRow(sectionUid: string, rowUid: string) {
    setSections((prev) =>
      prev.map((s) => (s.uid === sectionUid ? { ...s, rows: s.rows.filter((r) => r.uid !== rowUid) } : s)),
    )
  }
  function addSectionRow(sectionUid: string, deviceKey: string) {
    setSections((prev) =>
      prev.map((s) => {
        if (s.uid !== sectionUid) return s
        const dt = s.config.deviceTypes.find((d) => d.device_key === deviceKey)
        if (!dt) return s
        return {
          ...s,
          rows: [
            ...s.rows,
            { uid: nextUid(), device_key: deviceKey, label: dt.label, zone: 'Z1', quantity: 1, confidence: 'manual', evidence: null },
          ],
        }
      }),
    )
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
          config={config}
          compareKeys={compareKeys}
          recommendedKey={recommendedKey}
          optionNotes={optionNotes}
          onToggleCompare={toggleCompare}
          onRecommend={setRecommended}
          onOptionNote={setOptionNote}
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
          onRedraft={handleRedraft}
          redrafting={redrafting}
          onBack={() => setPhase('brief')}
          onNext={() => setPhase(designReasoning ? 'design' : 'takeoff')}
        />
      )}

      {phase === 'design' && (
        <DesignStep
          design={designReasoning}
          onRedraft={handleRedraft}
          redrafting={redrafting}
          onBack={() => setPhase('review')}
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
          manufacturerId={manufacturerId}
          rangeId={rangeId}
          onManufacturer={(id) => {
            setManufacturerId(id)
            // Reset range to the manufacturer's default (or clear) so parts stay coherent.
            const ranges = config.ranges.filter((r) => r.manufacturerId === id)
            const def = ranges.find((r) => r.isDefault) ?? ranges[0]
            setRangeId(def?.id ?? '')
          }}
          onRange={setRangeId}
          comparison={comparison}
          recommendedKey={recommendedKey}
          onRecommend={setRecommended}
          onUpdateRow={updateRow}
          onRemoveRow={removeRow}
          onAddRow={addRow}
          disciplines={disciplines}
          sections={sections}
          addingCode={addingCode}
          onAddSection={addSection}
          onRemoveSection={removeSection}
          onUpdateSectionRow={updateSectionRow}
          onRemoveSectionRow={removeSectionRow}
          onAddSectionRow={addSectionRow}
          buildingSpec={buildingSpec}
          onBack={() => setPhase(designReasoning ? 'design' : 'review')}
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
  config,
  compareKeys,
  recommendedKey,
  optionNotes,
  onToggleCompare,
  onRecommend,
  onOptionNote,
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
  config: StudioConfig
  compareKeys: string[]
  recommendedKey: string
  optionNotes: Record<string, { pros: string; cons: string }>
  onToggleCompare: (key: string) => void
  onRecommend: (key: string) => void
  onOptionNote: (key: string, patch: { pros?: string; cons?: string }) => void
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

          {config.ranges.length > 0 && (
            <div className="flex flex-col gap-3 rounded-lg border p-4">
              <div className="flex items-start gap-2">
                <Factory className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">Product combinations to compare</p>
                  <p className="text-xs text-muted-foreground">
                    Optional. Pick the manufacturer combinations to price (e.g. Advanced CIE with
                    Hochiki devices, Morley CIE with Apollo devices). Mark one as recommended — the
                    others appear on the quote as priced alternatives with your pros &amp; cons.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {[GENERIC_KEY, ...config.ranges.map((r) => r.id)].map((key) => {
                  const selected = compareKeys.includes(key)
                  const isRecommended = recommendedKey === key && selected
                  return (
                    <div
                      key={key}
                      className={cn(
                        'rounded-md border p-3 transition-colors',
                        selected ? 'border-primary/40 bg-primary/5' : 'border-border',
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleCompare(key)}
                          className={cn(
                            'flex h-5 w-5 items-center justify-center rounded border',
                            selected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-input',
                          )}
                          aria-pressed={selected}
                          aria-label={selected ? 'Remove from comparison' : 'Add to comparison'}
                        >
                          {selected && <Check className="h-3.5 w-3.5" />}
                        </button>
                        <span className="text-sm font-medium">{combinationLabel(config, key)}</span>
                        {selected && (
                          <Button
                            type="button"
                            size="sm"
                            variant={isRecommended ? 'default' : 'outline'}
                            className="ml-auto h-7 gap-1.5 text-xs"
                            onClick={() => onRecommend(key)}
                          >
                            <BadgeCheck className="h-3.5 w-3.5" />
                            {isRecommended ? 'Recommended' : 'Set recommended'}
                          </Button>
                        )}
                      </div>
                      {selected && (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div className="grid gap-1.5">
                            <Label className="text-xs text-muted-foreground">Pros (one per line)</Label>
                            <Textarea
                              rows={3}
                              value={optionNotes[key]?.pros ?? ''}
                              onChange={(e) => onOptionNote(key, { pros: e.target.value })}
                              placeholder={'Open protocol\nWidely stocked\nLower device cost'}
                              className="resize-y text-sm"
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <Label className="text-xs text-muted-foreground">Cons (one per line)</Label>
                            <Textarea
                              rows={3}
                              value={optionNotes[key]?.cons ?? ''}
                              onChange={(e) => onOptionNote(key, { cons: e.target.value })}
                              placeholder={'Proprietary panel\nLonger lead time'}
                              className="resize-y text-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

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
  onRedraft,
  redrafting,
  onBack,
  onNext,
}: {
  understanding: StudioUnderstanding
  onUnderstanding: (u: StudioUnderstanding) => void
  requirements: StudioRequirement[]
  onRequirements: (r: StudioRequirement[]) => void
  designCategory: string
  onCategory: (v: string) => void
  onRedraft: (steer: string) => void
  redrafting: boolean
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

      <SteerBox
        onRedraft={onRedraft}
        redrafting={redrafting}
        hint="e.g. “It’s 4 storeys not 3, 14 bedrooms, add a sprinkler interface, and treat the plant room as a separate zone.”"
      />

      <StepNav onBack={onBack} backLabel="Brief" onNext={onNext} nextLabel="Devices & price" />
    </div>
  )
}

// ---- Correct-the-AI steer box (re-draft with a designer instruction) ----

function SteerBox({
  onRedraft,
  redrafting,
  hint,
}: {
  onRedraft: (steer: string) => void
  redrafting: boolean
  hint: string
}) {
  const [steer, setSteer] = useState('')
  const submit = () => {
    if (!steer.trim() || redrafting) return
    onRedraft(steer.trim())
  }
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold uppercase tracking-wide">Correct the AI</h3>
        </div>
        <p className="text-xs text-muted-foreground text-pretty">
          Not quite right? Tell the AI what to change — quantities, interpretation, category, zoning
          — and it will re-draft using your edits above. Devices you added or edited by hand are kept.
        </p>
        <Textarea
          value={steer}
          onChange={(e) => setSteer(e.target.value)}
          rows={3}
          placeholder={hint}
          disabled={redrafting}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Tip: press ⌘/Ctrl + Enter to re-draft.</span>
          <Button className="gap-1.5" onClick={submit} disabled={redrafting || !steer.trim()}>
            {redrafting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Re-drafting…
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                Re-draft with these changes
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------- design rationale

function DesignStep({
  design,
  onRedraft,
  redrafting,
  onBack,
  onNext,
}: {
  design: StudioDesignReasoning | null
  onRedraft: (steer: string) => void
  redrafting: boolean
  onBack: () => void
  onNext: () => void
}) {
  const areas = design?.areas ?? []
  const assumptions = design?.assumptions ?? []
  const openQuestions = design?.openQuestions ?? []
  const otherDisciplines = design?.otherDisciplines ?? []
  const totalDevices = areas.reduce(
    (sum, a) => sum + a.devices.reduce((s, d) => s + (d.quantity || 0), 0),
    0,
  )

  return (
    <div className="flex flex-col gap-4">
      <StepHeading
        icon={Layers}
        title="How the AI designed this"
        description="Confirm the reasoning behind every quantity before it reaches the quote. Each line shows how the number was reached, the governing clause, and the assumption made."
      />

      {areas.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No design breakdown was returned for this brief. You can still confirm the schedule on the next step.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Layers className="h-3 w-3" />
              {areas.length} area{areas.length === 1 ? '' : 's'}
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <ClipboardList className="h-3 w-3" />
              {totalDevices} device{totalDevices === 1 ? '' : 's'} reasoned
            </Badge>
          </div>

          {areas.map((area, i) => (
            <Card key={i}>
              <CardContent className="flex flex-col gap-3 p-4">
                <div>
                  <h3 className="text-sm font-bold text-balance">{area.name}</h3>
                  {area.description && (
                    <p className="text-xs text-muted-foreground text-pretty">{area.description}</p>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="pb-2 font-medium">Device</th>
                        <th className="w-16 pb-2 text-right font-medium">Qty</th>
                        <th className="pb-2 pl-3 font-medium">How it was reached</th>
                        <th className="w-28 pb-2 pl-3 font-medium">Clause</th>
                      </tr>
                    </thead>
                    <tbody>
                      {area.devices.map((d, j) => (
                        <tr key={j} className="border-b align-top last:border-0">
                          <td className="py-2 pr-2 font-medium">{d.label}</td>
                          <td className="py-2 text-right tabular-nums">{d.quantity}</td>
                          <td className="py-2 pl-3 text-muted-foreground">
                            <span className="text-pretty">{d.basis}</span>
                            {d.assumption && (
                              <span className="mt-1 flex items-start gap-1 text-xs text-amber-600">
                                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                                <span className="text-pretty">Assumes: {d.assumption}</span>
                              </span>
                            )}
                          </td>
                          <td className="py-2 pl-3">
                            {d.clause ? (
                              <Badge variant="outline" className="whitespace-nowrap text-xs">
                                {d.clause}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      )}

      {assumptions.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-2 p-4">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold uppercase tracking-wide">Assumptions the AI made</h3>
            </div>
            <ul className="flex flex-col gap-1.5">
              {assumptions.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                  <span className="text-pretty">{a}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {openQuestions.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-2 p-4">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold uppercase tracking-wide">Open questions for the designer</h3>
            </div>
            <ul className="flex flex-col gap-1.5">
              {openQuestions.map((q, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                  <span className="text-pretty">{q}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {otherDisciplines.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-bold uppercase tracking-wide text-amber-700">
                Also detected — quote separately
              </h3>
            </div>
            <p className="text-xs text-muted-foreground text-pretty">
              This quote covers fire detection &amp; alarm only. The brief also implies the following — raise
              separate quotes so nothing is missed.
            </p>
            <div className="flex flex-col gap-2">
              {otherDisciplines.map((o, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-3 rounded-md border border-amber-500/30 bg-background/60 p-2.5"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">{o.system}</span>
                    <span className="text-xs text-muted-foreground text-pretty">{o.evidence}</span>
                  </div>
                  <Badge variant="secondary" className="shrink-0 gap-1">
                    <Gauge className="h-3 w-3" />
                    {o.confidence}%
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <SteerBox
        onRedraft={onRedraft}
        redrafting={redrafting}
        hint="e.g. “Ground-floor plant room needs heat not smoke, use point spacing at 7.5m, and the reasoning should assume 2.7m ceilings.”"
      />

      <StepNav
        onBack={onBack}
        backLabel="AI draft"
        onNext={onNext}
        nextLabel="Looks right — build schedule"
      />
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
  manufacturerId,
  rangeId,
  onManufacturer,
  onRange,
  comparison,
  recommendedKey,
  onRecommend,
  onUpdateRow,
  onRemoveRow,
  onAddRow,
  disciplines,
  sections,
  addingCode,
  onAddSection,
  onRemoveSection,
  onUpdateSectionRow,
  onRemoveSectionRow,
  onAddSectionRow,
  buildingSpec,
  onBack,
  onNext,
}: {
  config: StudioConfig
  rows: TakeoffRow[]
  assembly: ReturnType<typeof buildAssembly>
  margin: number
  onMargin: (v: number) => void
  manufacturerId: string
  rangeId: string
  onManufacturer: (id: string) => void
  onRange: (id: string) => void
  comparison: {
    key: string
    rangeId: string | null
    name: string
    sellPence: number
    recommended: boolean
  }[]
  recommendedKey: string
  onRecommend: (key: string) => void
  onUpdateRow: (uid: string, patch: Partial<TakeoffRow>) => void
  onRemoveRow: (uid: string) => void
  onAddRow: (deviceKey: string) => void
  disciplines: StudioDiscipline[]
  sections: AdditionalSection[]
  addingCode: string | null
  onAddSection: (code: string) => void
  onRemoveSection: (uid: string) => void
  onUpdateSectionRow: (sectionUid: string, rowUid: string, patch: Partial<TakeoffRow>) => void
  onRemoveSectionRow: (sectionUid: string, rowUid: string) => void
  onAddSectionRow: (sectionUid: string, deviceKey: string) => void
  buildingSpec: boolean
  onBack: () => void
  onNext: () => void
}) {
  const [addKey, setAddKey] = useState('')
  const rangesForManufacturer = config.ranges.filter((r) => r.manufacturerId === manufacturerId)
  const availableDisciplines = disciplines.filter((d) => !sections.some((s) => s.code === d.code))
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

      {config.manufacturers.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2">
              <Factory className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold uppercase tracking-wide">Equipment manufacturer</h3>
            </div>
            <p className="text-xs text-muted-foreground text-pretty">
              Choose the manufacturer range for this design. The schedule is priced with that range&apos;s parts and its
              real current draws feed the battery calculation. Leave blank to use the generic default parts.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Manufacturer</label>
                <Select value={manufacturerId} onValueChange={onManufacturer}>
                  <SelectTrigger className="w-52">
                    <SelectValue placeholder="Generic / unspecified" />
                  </SelectTrigger>
                  <SelectContent>
                    {config.manufacturers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Range</label>
                <Select value={rangeId} onValueChange={onRange} disabled={!manufacturerId}>
                  <SelectTrigger className="w-52">
                    <SelectValue placeholder={manufacturerId ? 'Select a range…' : 'Choose a manufacturer first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {rangesForManufacturer.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {manufacturerId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => {
                    onManufacturer('')
                    onRange('')
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {comparison.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold uppercase tracking-wide">Product combination comparison</h3>
            </div>
            <p className="text-xs text-muted-foreground text-pretty">
              The same confirmed schedule priced against each selected combination. Set which one is
              recommended — it prices the quote; the rest are summarised as alternatives.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 font-medium">Combination</th>
                    <th className="w-32 pb-2 text-right font-medium">Sell (ex VAT)</th>
                    <th className="w-32 pb-2 text-right font-medium">vs recommended</th>
                    <th className="w-40 pb-2 pl-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rec = comparison.find((c) => c.recommended)
                    const recPence = rec?.sellPence ?? 0
                    return comparison.map((c) => {
                      const delta = c.sellPence - recPence
                      return (
                        <tr key={c.key} className="border-b last:border-0">
                          <td className="py-2 pr-2 font-medium">
                            <span className="flex items-center gap-2">
                              {c.name}
                              {c.recommended && (
                                <Badge variant="secondary" className="gap-1 text-[10px]">
                                  <BadgeCheck className="h-3 w-3" />
                                  Recommended
                                </Badge>
                              )}
                            </span>
                          </td>
                          <td className="py-2 text-right tabular-nums">{gbp(c.sellPence)}</td>
                          <td
                            className={cn(
                              'py-2 text-right tabular-nums',
                              delta > 0 && 'text-amber-600',
                              delta < 0 && 'text-emerald-600',
                              delta === 0 && 'text-muted-foreground',
                            )}
                          >
                            {c.recommended ? '—' : `${delta > 0 ? '+' : ''}${gbp(delta)}`}
                          </td>
                          <td className="py-2 pl-3">
                            {!c.recommended && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1.5 text-xs"
                                onClick={() => onRecommend(c.key)}
                              >
                                <BadgeCheck className="h-3.5 w-3.5" />
                                Make recommended
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Additional disciplines — quoted as their own priced sections. */}
      {(disciplines.length > 0 || sections.length > 0) && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold uppercase tracking-wide">Additional systems</h3>
            </div>
            <p className="text-xs text-muted-foreground text-pretty">
              Quote other disciplines (access control, intruder, CCTV, emergency lighting) alongside the fire alarm.
              Each is priced as its own section on the same quote and can be confirmed independently.
            </p>

            {sections.map((s) => (
              <SectionCard
                key={s.uid}
                section={s}
                margin={margin}
                onRemove={() => onRemoveSection(s.uid)}
                onUpdateRow={(rowUid, patch) => onUpdateSectionRow(s.uid, rowUid, patch)}
                onRemoveRow={(rowUid) => onRemoveSectionRow(s.uid, rowUid)}
                onAddRow={(deviceKey) => onAddSectionRow(s.uid, deviceKey)}
              />
            ))}

            {availableDisciplines.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {availableDisciplines.map((d) => (
                  <Button
                    key={d.code}
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={addingCode !== null}
                    onClick={() => onAddSection(d.code)}
                  >
                    {addingCode === d.code ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    {d.name}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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

function SectionCard({
  section,
  margin,
  onRemove,
  onUpdateRow,
  onRemoveRow,
  onAddRow,
}: {
  section: AdditionalSection
  margin: number
  onRemove: () => void
  onUpdateRow: (rowUid: string, patch: Partial<TakeoffRow>) => void
  onRemoveRow: (rowUid: string) => void
  onAddRow: (deviceKey: string) => void
}) {
  const [addKey, setAddKey] = useState('')
  // Live price preview for this discipline (device default parts).
  const sectionAssembly = useMemo(() => {
    const items = section.rows
      .filter((r) => r.quantity > 0)
      .map((r) => {
        const dt = section.config.deviceTypes.find((d) => d.device_key === r.device_key)
        return {
          device_key: r.device_key,
          label: r.label,
          quantity: r.quantity,
          catalogue_item_id: dt?.default_catalogue_item_id ?? null,
          contributes_to_device_count: dt?.contributes_to_device_count ?? true,
        }
      })
    return buildAssembly({
      items,
      kitRules: section.config.kitRules,
      catalogue: section.config.catalogue,
      loops: null,
      systemMargin: margin,
    })
  }, [section, margin])

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{section.name}</Badge>
          {section.notes.length > 0 && (
            <span className="text-xs text-muted-foreground">{section.notes[0]}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="pb-1.5 font-medium">Device</th>
              <th className="pb-1.5 font-medium">Zone</th>
              <th className="w-20 pb-1.5 text-right font-medium">Qty</th>
              <th className="w-10 pb-1.5" />
            </tr>
          </thead>
          <tbody>
            {section.rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-xs text-muted-foreground">
                  No devices yet — add one below.
                </td>
              </tr>
            )}
            {section.rows.map((r) => (
              <tr key={r.uid} className="border-b last:border-0">
                <td className="py-1.5 pr-2 font-medium">{r.label}</td>
                <td className="py-1.5 pr-2">
                  <Input
                    value={r.zone}
                    onChange={(e) => onUpdateRow(r.uid, { zone: e.target.value })}
                    className="h-8 w-28"
                  />
                </td>
                <td className="py-1.5 text-right">
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
                <td className="py-1.5 text-right">
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

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Select value={addKey} onValueChange={setAddKey}>
            <SelectTrigger className="h-8 w-52">
              <SelectValue placeholder="Add a device…" />
            </SelectTrigger>
            <SelectContent>
              {section.config.deviceTypes.map((d) => (
                <SelectItem key={d.device_key} value={d.device_key}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
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
            Add
          </Button>
        </div>
        <span className="text-sm font-bold">
          Sell <span className="tabular-nums">{gbp(sectionAssembly.totalSellPence)}</span>
        </span>
      </div>
      {sectionAssembly.unmappedKeys.length > 0 && (
        <p className="mt-1.5 text-xs text-destructive">
          {sectionAssembly.unmappedKeys.length} item(s) have no catalogue cost yet — add prices via Settings → Data.
        </p>
      )}
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
