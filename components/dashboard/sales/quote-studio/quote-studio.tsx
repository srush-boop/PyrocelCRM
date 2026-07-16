'use client'

/**
 * Quote Studio — clickable PROTOTYPE of a proposed "brief-first" quoting flow.
 *
 * This is a mockup for the team to react to. It is intentionally NOT wired to
 * the database or a live model; the "AI" steps are simulated with a short delay
 * and all content comes from lib/sales/quote-studio-mock.ts. The real quote
 * builder is untouched.
 */

import { useState, type ComponentType } from 'react'
import {
  Sparkles,
  FileText,
  Boxes,
  Layers,
  ScrollText,
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Building2,
  ShieldCheck,
  Wand2,
  Pencil,
  TrendingDown,
  Clock,
  BadgeCheck,
  Plus,
  Minus,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  MOCK_BRIEF,
  MOCK_DETECTED,
  MOCK_REQUIREMENTS,
  MOCK_MANUFACTURERS,
  MOCK_PARTS,
  MOCK_OPTIONS,
} from '@/lib/sales/quote-studio-mock'

const STEPS = [
  { key: 'brief', label: 'Brief', icon: FileText },
  { key: 'draft', label: 'AI draft', icon: Sparkles },
  { key: 'systems', label: 'Systems & parts', icon: Boxes },
  { key: 'options', label: 'Client options', icon: Layers },
  { key: 'document', label: 'Document', icon: ScrollText },
] as const

type StepKey = (typeof STEPS)[number]['key']

const gbp = (n: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n)

export function QuoteStudio() {
  const [step, setStep] = useState<StepKey>('brief')
  const [thinking, setThinking] = useState(false)
  const [brief, setBrief] = useState(MOCK_BRIEF)
  const [includedOptions, setIncludedOptions] = useState<Record<string, boolean>>(
    Object.fromEntries(MOCK_OPTIONS.map((o) => [o.id, o.includedByDefault])),
  )
  const [chosenManufacturer, setChosenManufacturer] = useState(MOCK_MANUFACTURERS[0].manufacturer)

  const stepIndex = STEPS.findIndex((s) => s.key === step)

  // Simulate the AI "doing the work" between the brief and the draft review.
  function runDraft() {
    setThinking(true)
    setTimeout(() => {
      setThinking(false)
      setStep('draft')
    }, 1600)
  }

  function go(next: StepKey) {
    setStep(next)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 pb-16">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wand2 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold leading-none tracking-tight">Quote Studio</h1>
            <p className="text-sm text-muted-foreground">Prototype — describe the job, review the draft, send.</p>
          </div>
          <Badge variant="outline" className="ml-auto border-primary/40 text-primary">
            Concept preview
          </Badge>
        </div>
      </div>

      <Stepper stepIndex={stepIndex} onJump={(k) => go(k)} />

      {step === 'brief' && (
        <BriefStep brief={brief} setBrief={setBrief} thinking={thinking} onDraft={runDraft} />
      )}
      {step === 'draft' && <DraftStep onBack={() => go('brief')} onNext={() => go('systems')} />}
      {step === 'systems' && (
        <SystemsStep
          chosen={chosenManufacturer}
          onChoose={setChosenManufacturer}
          onBack={() => go('draft')}
          onNext={() => go('options')}
        />
      )}
      {step === 'options' && (
        <OptionsStep
          included={includedOptions}
          onToggle={(id) => setIncludedOptions((p) => ({ ...p, [id]: !p[id] }))}
          onBack={() => go('systems')}
          onNext={() => go('document')}
        />
      )}
      {step === 'document' && (
        <DocumentStep included={includedOptions} onBack={() => go('options')} onRestart={() => go('brief')} />
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- Stepper */

function Stepper({
  stepIndex,
  onJump,
}: {
  stepIndex: number
  onJump: (k: StepKey) => void
}) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((s, i) => {
        const Icon = s.icon
        const done = i < stepIndex
        const active = i === stepIndex
        return (
          <li key={s.key} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => (i <= stepIndex ? onJump(s.key) : undefined)}
              disabled={i > stepIndex}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
                active && 'border-primary bg-primary/5',
                done && 'border-primary/30 bg-background hover:bg-muted/50',
                !active && !done && 'border-dashed opacity-60',
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  active && 'bg-primary text-primary-foreground',
                  done && 'bg-primary/15 text-primary',
                  !active && !done && 'bg-muted text-muted-foreground',
                )}
              >
                {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </span>
              <span className={cn('hidden text-sm font-medium sm:block', active ? 'text-foreground' : 'text-muted-foreground')}>
                {s.label}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/* ------------------------------------------------------------------ Brief */

function BriefStep({
  brief,
  setBrief,
  thinking,
  onDraft,
}: {
  brief: string
  setBrief: (v: string) => void
  thinking: boolean
  onDraft: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold tracking-tight">Start with the job</h2>
          <p className="text-sm text-muted-foreground text-pretty">
            Paste the client&apos;s email or just describe what they need. No forms — the AI reads it and builds the
            whole quote for you to review.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={16}
            className="resize-none border-0 font-mono text-sm leading-relaxed focus-visible:ring-0"
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Prototype — this sample brief is editable, but the draft is pre-scripted for the demo.
        </p>
        <Button size="lg" onClick={onDraft} disabled={thinking} className="gap-2">
          {thinking ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading the brief & drafting…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Draft quote with AI
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Draft */

function DraftStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const d = MOCK_DETECTED
  return (
    <div className="flex flex-col gap-4">
      <StepHeading
        icon={Sparkles}
        title="Here’s what I understood"
        description="Review and correct anything. Everything below is editable — the AI just gives you a head start."
      />

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-3 py-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">AI understanding</p>
              <Badge variant="outline" className="border-primary/40 text-primary">
                {d.confidence}% confident
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">{d.summary}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <FactCard icon={Building2} label="Client & site" lines={[d.clientName, d.siteName, d.siteAddress]} />
        <FactCard icon={FileText} label="Work type" lines={[d.workType]} />
        <FactCard icon={Building2} label="Building type" lines={[d.buildingType]} />
        <FactCard icon={ShieldCheck} label="Standard & category" lines={[d.standard, d.category]} highlight />
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Requirements extracted from the brief</p>
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
          <ul className="flex flex-col gap-2">
            {MOCK_REQUIREMENTS.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-md border bg-background px-3 py-2">
                <PriorityDot priority={r.priority} />
                <span className="flex-1 text-sm">{r.text}</span>
                <Badge variant="secondary" className="text-xs">
                  {r.system}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <StepNav onBack={onBack} backLabel="Brief" onNext={onNext} nextLabel="Build systems & parts" />
    </div>
  )
}

/* ---------------------------------------------------------------- Systems */

function SystemsStep({
  chosen,
  onChoose,
  onBack,
  onNext,
}: {
  chosen: string
  onChoose: (m: string) => void
  onBack: () => void
  onNext: () => void
}) {
  const partsTotal = MOCK_PARTS.reduce((s, p) => s + p.qty * p.unit, 0)
  const cheapest = Math.min(...MOCK_MANUFACTURERS.map((m) => m.cost))

  return (
    <div className="flex flex-col gap-4">
      <StepHeading
        icon={Boxes}
        title="AI-built system & parts"
        description="The AI sized a Category L1 addressable system from the brief and drafted the device schedule. Compare manufacturers before you price it."
      />

      {/* System summary card */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Boxes className="h-4 w-4" />
            </span>
            <p className="font-semibold">Fire Alarm — Category L1 addressable</p>
            <Badge variant="secondary">2-loop</Badge>
            <Badge variant="secondary">124 devices</Badge>
            <Badge variant="outline" className="border-primary/40 text-primary">
              BS 5839-1:2025
            </Badge>
          </div>

          <Separator className="my-4" />

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
                {MOCK_PARTS.map((p) => (
                  <tr key={p.ref} className="border-b last:border-0">
                    <td className="py-2">
                      <span className="font-medium">{p.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{p.ref}</span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{p.qty}</td>
                    <td className="py-2 text-right tabular-nums">{gbp(p.unit)}</td>
                    <td className="py-2 text-right tabular-nums">{gbp(p.qty * p.unit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="pt-3 text-right text-sm font-medium text-muted-foreground">
                    Equipment cost (indicative)
                  </td>
                  <td className="pt-3 text-right font-bold tabular-nums">{gbp(partsTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Manufacturer comparison */}
      <StepHeading
        icon={TrendingDown}
        title="Compare manufacturers"
        description="Same compliant design, priced across our approved manufacturers — pick the basis for this quote."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {MOCK_MANUFACTURERS.map((m) => {
          const active = m.manufacturer === chosen
          const isCheapest = m.cost === cheapest
          return (
            <button
              key={m.manufacturer}
              type="button"
              onClick={() => onChoose(m.manufacturer)}
              className={cn(
                'flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors',
                active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{m.manufacturer}</span>
                {active ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" />
                  </span>
                ) : (
                  isCheapest && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <TrendingDown className="h-3 w-3" /> Lowest
                    </Badge>
                  )
                )}
              </div>
              <span className="text-xs text-muted-foreground">{m.range}</span>
              <span className="text-2xl font-bold tabular-nums">{gbp(m.cost)}</span>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {m.leadDays}d lead
                </span>
                {m.approved && (
                  <span className="flex items-center gap-1 text-primary">
                    <BadgeCheck className="h-3 w-3" /> Approved
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground text-pretty">{m.note}</p>
            </button>
          )
        })}
      </div>

      <StepNav onBack={onBack} backLabel="AI draft" onNext={onNext} nextLabel="Build client options" />
    </div>
  )
}

/* ---------------------------------------------------------------- Options */

function OptionsStep({
  included,
  onToggle,
  onBack,
  onNext,
}: {
  included: Record<string, boolean>
  onToggle: (id: string) => void
  onBack: () => void
  onNext: () => void
}) {
  const count = Object.values(included).filter(Boolean).length
  return (
    <div className="flex flex-col gap-4">
      <StepHeading
        icon={Layers}
        title="Tiered options for the client"
        description="The AI built three compliant options and an honest pros/cons overview for each. Choose which to present — the trustees see value at a glance."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {MOCK_OPTIONS.map((o) => {
          const on = included[o.id]
          const margin = Math.round(((o.price - o.ourCost) / o.price) * 100)
          return (
            <Card
              key={o.id}
              className={cn(
                'flex flex-col transition-colors',
                on ? 'border-primary ring-1 ring-primary' : 'opacity-80',
                o.tier === 'Recommended' && 'shadow-md',
              )}
            >
              <CardContent className="flex flex-1 flex-col gap-3 py-4">
                <div className="flex items-center justify-between">
                  <Badge
                    variant={o.tier === 'Recommended' ? 'default' : 'secondary'}
                    className={cn(o.tier === 'Recommended' && 'bg-primary')}
                  >
                    {o.tier}
                  </Badge>
                  {o.tier === 'Recommended' && (
                    <span className="text-xs font-medium text-primary">Best value</span>
                  )}
                </div>

                <div>
                  <p className="font-semibold leading-tight text-balance">{o.name}</p>
                  <p className="text-xs text-muted-foreground">{o.manufacturer}</p>
                </div>

                <p className="text-sm text-muted-foreground text-pretty">{o.headline}</p>

                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tabular-nums">{gbp(o.price)}</span>
                  <span className="text-xs text-muted-foreground">ex VAT</span>
                </div>
                <p className="-mt-2 text-xs text-muted-foreground">Internal margin {margin}% — hidden from client</p>

                <div className="flex flex-col gap-1.5">
                  {o.pros.map((p) => (
                    <div key={p} className="flex items-start gap-2 text-xs">
                      <Plus className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                      <span>{p}</span>
                    </div>
                  ))}
                  {o.cons.map((c) => (
                    <div key={c} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Minus className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{c}</span>
                    </div>
                  ))}
                </div>

                <div className="rounded-md border bg-muted/30 p-2.5">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold">AI overview</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground text-pretty">{o.aiOverview}</p>
                </div>

                <Button
                  type="button"
                  variant={on ? 'default' : 'outline'}
                  className="mt-auto gap-2"
                  onClick={() => onToggle(o.id)}
                >
                  {on ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {on ? 'Included for client' : 'Include this option'}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5" />
        {count} option{count === 1 ? '' : 's'} will be presented to the client. Pros/cons and the AI overview appear on
        the quote; internal costs and margins never do.
      </div>

      <StepNav onBack={onBack} backLabel="Systems & parts" onNext={onNext} nextLabel="Preview document" />
    </div>
  )
}

/* --------------------------------------------------------------- Document */

function DocumentStep({
  included,
  onBack,
  onRestart,
}: {
  included: Record<string, boolean>
  onBack: () => void
  onRestart: () => void
}) {
  const d = MOCK_DETECTED
  const shown = MOCK_OPTIONS.filter((o) => included[o.id])
  const options = shown.length > 0 ? shown : MOCK_OPTIONS.filter((o) => o.tier === 'Recommended')

  return (
    <div className="flex flex-col gap-4">
      <StepHeading
        icon={ScrollText}
        title="Audit-ready quote document"
        description="Consistent house style, standards referenced, and robust to NSI/BAFE scrutiny — generated, not hand-assembled."
      />

      {/* The "paper" */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between bg-[#1f2937] px-6 py-5 text-white">
          <div>
            <p className="text-lg font-bold tracking-tight">PYROCEL</p>
            <p className="text-xs text-white/70">Fire &amp; Security Systems</p>
          </div>
          <div className="text-right text-xs text-white/80">
            <p className="text-sm font-semibold text-white">Quotation</p>
            <p>Ref: Q-2026-0481</p>
            <p>16 July 2026</p>
          </div>
        </div>

        <CardContent className="flex flex-col gap-6 p-6">
          {/* Parties */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prepared for</p>
              <p className="mt-1 text-sm font-medium">{d.clientName}</p>
              <p className="text-sm text-muted-foreground">{d.siteName}</p>
              <p className="text-sm text-muted-foreground">{d.siteAddress}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scope</p>
              <p className="mt-1 text-sm">{d.workType}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 sm:justify-end">
                <Badge variant="outline">{d.standard}</Badge>
                <Badge variant="outline">{d.category}</Badge>
              </div>
            </div>
          </div>

          <Separator />

          {/* Narrative */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide">1. Scope of works</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
              Pyrocel proposes the design, supply, installation and commissioning of a Category L1 automatic fire
              detection and alarm system in accordance with {d.standard}, providing life-protection coverage
              throughout the existing three-storey premises and the new single-storey wing. All works will be
              certificated under our BAFE SP203-1 and NSI Gold approvals, with full cause-and-effect documentation and
              commissioning certificates issued on completion.
            </p>
          </div>

          {/* Options table */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide">2. Options</h3>
            <div className="mt-3 flex flex-col gap-3">
              {options.map((o) => (
                <div key={o.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wide text-primary">{o.tier}</span>
                      <p className="font-semibold">{o.name}</p>
                    </div>
                    <span className="text-lg font-bold tabular-nums">{gbp(o.price)}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground text-pretty">{o.aiOverview}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold text-foreground">Benefits</p>
                      <ul className="mt-1 flex flex-col gap-1">
                        {o.pros.map((p) => (
                          <li key={p} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                            {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">Considerations</p>
                      <ul className="mt-1 flex flex-col gap-1">
                        {o.cons.map((c) => (
                          <li key={c} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <Minus className="mt-0.5 h-3 w-3 shrink-0" />
                            {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Compliance strip */}
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
              <span className="text-xs font-medium">Commissioning &amp; C&amp;E certificates included</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            This quotation is valid for 30 days. Prices exclude VAT. Standard terms and conditions apply and are
            available on request.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to options
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onRestart} className="gap-2">
            Start over
          </Button>
          <Button className="gap-2">
            <Check className="h-4 w-4" />
            Looks good — this is the flow
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- primitives */

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

function FactCard({
  icon: Icon,
  label,
  lines,
  highlight,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  lines: string[]
  highlight?: boolean
}) {
  return (
    <div className={cn('flex items-start gap-3 rounded-lg border p-3', highlight && 'border-primary/30 bg-primary/5')}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', highlight ? 'text-primary' : 'text-muted-foreground')} />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        {lines.map((l, i) => (
          <p key={i} className={cn('text-sm', i === 0 ? 'font-medium' : 'text-muted-foreground')}>
            {l}
          </p>
        ))}
      </div>
    </div>
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
    <span className="flex items-center gap-1.5">
      <span className={cn('h-2 w-2 rounded-full', m.c)} />
      <span className="w-12 text-xs font-medium text-muted-foreground">{m.t}</span>
    </span>
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
