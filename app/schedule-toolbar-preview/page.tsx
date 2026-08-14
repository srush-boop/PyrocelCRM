'use client'

/**
 * Standalone, throwaway PREVIEW of three redesigned "Calls" toolbar drafts.
 * Public route (no auth) so it can be viewed straight in the preview. Uses mock
 * data and self-contained state — none of this touches the live schedule. Once a
 * direction is chosen, that layout gets ported into
 * components/dashboard/schedule/schedule-view.tsx + schedule/page.tsx.
 *
 * Requirements captured from feedback:
 *  - every filter is a multi-select (Engineers included)
 *  - "Add request" (header) and "Remedial" (quick filter) removed
 *  - tighter use of space
 *  - colour-coded sections so filter groups read at a glance
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar as CalendarComponent } from '@/components/ui/calendar'
import { SearchMultiSelect } from '@/components/dashboard/schedule/search-multi-select'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import {
  Search,
  CalendarClock,
  Clock,
  CalendarIcon,
  LayoutGrid,
  List as ListIcon,
  Route as RouteIcon,
  MapPinned,
  ArrowUpDown,
  SlidersHorizontal,
  Building2,
  Wrench,
  Users,
  X,
  Filter,
  ChevronDown,
} from 'lucide-react'

// ── Mock data ────────────────────────────────────────────────────────────────
const SYSTEMS = [
  { value: 'fire-alarm', label: 'Fire Alarm' },
  { value: 'emergency-lighting', label: 'Emergency Lighting' },
  { value: 'extinguishers', label: 'Extinguishers' },
  { value: 'sprinkler', label: 'Sprinkler' },
  { value: 'dampers', label: 'Fire Dampers' },
  { value: 'rem-mon', label: 'Remote Monitoring' },
]
const SERVICES = [
  { value: 'annual', label: 'Annual Service' },
  { value: 'quarterly', label: 'Quarterly Service' },
  { value: 'six-monthly', label: '6-Monthly Service' },
  { value: 'weekly', label: 'Weekly Test' },
  { value: 'reactive', label: 'Reactive Call-out' },
]
const ENGINEERS = [
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'e1', label: 'Steve Rush' },
  { value: 'e2', label: 'Dan Miller' },
  { value: 'e3', label: 'Priya Shah' },
  { value: 'e4', label: 'Tom Blake' },
]
const SORTS = [
  { value: 'date', label: 'Due date' },
  { value: 'postcode', label: 'Postcode' },
  { value: 'nearby', label: 'Nearby' },
]

const STATUS_TABS = [
  { key: 'upcoming', label: 'Upcoming', count: 119, tone: 'neutral' as const },
  { key: 'overdue', label: 'Overdue', count: 46, tone: 'danger' as const },
  { key: 'completed', label: 'Completed', count: 104, tone: 'neutral' as const },
]

// Section colour system — each filter GROUP gets one hue so the eye can chunk
// the toolbar. Kept as light tints + a coloured label so it never competes with
// the brand red (reserved for genuine urgency / primary actions).
const SECTION = {
  attention: {
    label: 'text-amber-700 dark:text-amber-400',
    ring: 'ring-amber-200 dark:ring-amber-900',
    tint: 'bg-amber-50/70 dark:bg-amber-950/30',
    dot: 'bg-amber-500',
  },
  classify: {
    label: 'text-sky-700 dark:text-sky-400',
    ring: 'ring-sky-200 dark:ring-sky-900',
    tint: 'bg-sky-50/70 dark:bg-sky-950/30',
    dot: 'bg-sky-500',
  },
  people: {
    label: 'text-violet-700 dark:text-violet-400',
    ring: 'ring-violet-200 dark:ring-violet-900',
    tint: 'bg-violet-50/70 dark:bg-violet-950/30',
    dot: 'bg-violet-500',
  },
  time: {
    label: 'text-emerald-700 dark:text-emerald-400',
    ring: 'ring-emerald-200 dark:ring-emerald-900',
    tint: 'bg-emerald-50/70 dark:bg-emerald-950/30',
    dot: 'bg-emerald-500',
  },
}

// ── Small shared bits ────────────────────────────────────────────────────────
function StatusTabs({
  value,
  onChange,
  size = 'default',
}: {
  value: string
  onChange: (v: string) => void
  size?: 'default' | 'sm'
}) {
  return (
    <div className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5">
      {STATUS_TABS.map((t) => {
        const active = value === t.key
        const danger = t.tone === 'danger'
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            aria-pressed={active}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 font-medium transition-colors',
              size === 'sm' ? 'h-7 text-xs' : 'h-8 text-sm',
              active
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
              active && danger && 'text-destructive',
            )}
          >
            {t.label}
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums',
                danger
                  ? 'bg-destructive/15 text-destructive'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {t.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function DateRangeButton({
  from,
  to,
  onFrom,
  onTo,
}: {
  from?: Date
  to?: Date
  onFrom: (d?: Date) => void
  onTo: (d?: Date) => void
}) {
  const label =
    from && to
      ? `${format(from, 'dd/MM/yy')} – ${format(to, 'dd/MM/yy')}`
      : from
        ? `From ${format(from, 'dd/MM/yy')}`
        : to
          ? `Until ${format(to, 'dd/MM/yy')}`
          : 'Any date'
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('h-9 justify-start gap-2 font-normal', !from && !to && 'text-muted-foreground')}
        >
          <CalendarIcon className="h-4 w-4 shrink-0" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col gap-2 p-2 sm:flex-row">
          <div>
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">From</p>
            <CalendarComponent mode="single" selected={from} onSelect={onFrom} initialFocus />
          </div>
          <div>
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">To</p>
            <CalendarComponent mode="single" selected={to} onSelect={onTo} />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ViewToggle() {
  const [mode, setMode] = useState('list')
  const opts = [
    { mode: 'grid', icon: LayoutGrid, label: 'Grid' },
    { mode: 'list', icon: ListIcon, label: 'List' },
    { mode: 'route', icon: RouteIcon, label: 'Route' },
    { mode: 'area', icon: MapPinned, label: 'Area' },
  ]
  return (
    <div className="flex items-center rounded-md border p-0.5">
      {opts.map(({ mode: m, icon: Icon, label }) => (
        <Button
          key={m}
          type="button"
          variant={mode === m ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 gap-1.5 px-2"
          onClick={() => setMode(m)}
          aria-pressed={mode === m}
        >
          <Icon className="h-4 w-4" />
          <span className="hidden lg:inline">{label}</span>
        </Button>
      ))}
    </div>
  )
}

function SortMenu() {
  const [sort, setSort] = useState('date')
  return (
    <div className="relative">
      <select
        value={sort}
        onChange={(e) => setSort(e.target.value)}
        className="h-9 appearance-none rounded-md border bg-background pl-9 pr-8 text-sm"
        aria-label="Sort by"
      >
        {SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            Sort: {s.label}
          </option>
        ))}
      </select>
      <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

// Group label chip — the coloured section marker.
function GroupLabel({ tone, icon: Icon, children }: { tone: keyof typeof SECTION; icon: React.ElementType; children: React.ReactNode }) {
  const s = SECTION[tone]
  return (
    <span className={cn('flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide', s.label)}>
      <Icon className="h-3 w-3" />
      {children}
    </span>
  )
}

// Multi-select flag chips (the boolean quick filters as a multi-select group).
function FlagChips({
  values,
  onChange,
}: {
  values: string[]
  onChange: (v: string[]) => void
}) {
  const FLAGS = [
    { value: 'needs-booking', label: 'Needs booking', count: 2, icon: CalendarClock, danger: false },
    { value: 'overdue', label: 'Overdue', count: 46, icon: Clock, danger: true },
  ]
  const toggle = (v: string) =>
    values.includes(v) ? onChange(values.filter((x) => x !== v)) : onChange([...values, v])
  return (
    <div className="flex items-center gap-1.5">
      {FLAGS.map((f) => {
        const active = values.includes(f.value)
        return (
          <button
            key={f.value}
            type="button"
            onClick={() => toggle(f.value)}
            aria-pressed={active}
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition-colors',
              active
                ? f.danger
                  ? 'border-destructive bg-destructive text-destructive-foreground'
                  : 'border-amber-500 bg-amber-500 text-white'
                : 'bg-background hover:bg-muted',
            )}
          >
            <f.icon className="h-4 w-4" />
            {f.label}
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums',
                active ? 'bg-white/25' : f.danger ? 'bg-destructive/15 text-destructive' : 'bg-amber-100 text-amber-700',
              )}
            >
              {f.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Draft A — colour-coded grouped bar ──────────────────────────────────────
function DraftA() {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('upcoming')
  const [flags, setFlags] = useState<string[]>(['overdue'])
  const [systems, setSystems] = useState<string[]>([])
  const [services, setServices] = useState<string[]>([])
  const [engineers, setEngineers] = useState<string[]>([])
  const [from, setFrom] = useState<Date | undefined>()
  const [to, setTo] = useState<Date | undefined>()

  return (
    <div className="space-y-3 rounded-xl border bg-card p-3">
      {/* Top line: search + status + right-side sort/view */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search calls or ref number…"
            className="h-9 pl-9"
          />
        </div>
        <StatusTabs value={tab} onChange={setTab} />
        <div className="ml-auto flex items-center gap-1.5">
          <SortMenu />
          <ViewToggle />
        </div>
      </div>

      {/* Colour-coded filter groups on one wrapping line */}
      <div className="flex flex-wrap items-stretch gap-2">
        <section className={cn('flex items-center gap-2 rounded-lg px-2.5 py-2 ring-1', SECTION.attention.tint, SECTION.attention.ring)}>
          <GroupLabel tone="attention" icon={Filter}>Flags</GroupLabel>
          <FlagChips values={flags} onChange={setFlags} />
        </section>

        <section className={cn('flex items-center gap-2 rounded-lg px-2.5 py-2 ring-1', SECTION.classify.tint, SECTION.classify.ring)}>
          <GroupLabel tone="classify" icon={Building2}>Type</GroupLabel>
          <div className="w-[150px]">
            <SearchMultiSelect values={systems} onChange={setSystems} options={SYSTEMS} placeholder="All systems" />
          </div>
          <div className="w-[150px]">
            <SearchMultiSelect values={services} onChange={setServices} options={SERVICES} placeholder="All services" />
          </div>
        </section>

        <section className={cn('flex items-center gap-2 rounded-lg px-2.5 py-2 ring-1', SECTION.people.tint, SECTION.people.ring)}>
          <GroupLabel tone="people" icon={Users}>Who</GroupLabel>
          <div className="w-[160px]">
            <SearchMultiSelect values={engineers} onChange={setEngineers} options={ENGINEERS} placeholder="All engineers" />
          </div>
        </section>

        <section className={cn('flex items-center gap-2 rounded-lg px-2.5 py-2 ring-1', SECTION.time.tint, SECTION.time.ring)}>
          <GroupLabel tone="time" icon={CalendarIcon}>When</GroupLabel>
          <DateRangeButton from={from} to={to} onFrom={setFrom} onTo={setTo} />
        </section>
      </div>
    </div>
  )
}

// ── Draft B — clean bar + single Filters popover + active chips ──────────────
function DraftB() {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('upcoming')
  const [flags, setFlags] = useState<string[]>([])
  const [systems, setSystems] = useState<string[]>(['fire-alarm'])
  const [services, setServices] = useState<string[]>([])
  const [engineers, setEngineers] = useState<string[]>([])
  const [from, setFrom] = useState<Date | undefined>()
  const [to, setTo] = useState<Date | undefined>()

  const activeCount =
    flags.length + systems.length + services.length + engineers.length + (from || to ? 1 : 0)

  const chips: { key: string; label: string; tone: keyof typeof SECTION; clear: () => void }[] = [
    ...flags.map((f) => ({
      key: `flag-${f}`,
      label: f === 'overdue' ? 'Overdue' : 'Needs booking',
      tone: 'attention' as const,
      clear: () => setFlags((p) => p.filter((x) => x !== f)),
    })),
    ...systems.map((s) => ({
      key: `sys-${s}`,
      label: SYSTEMS.find((o) => o.value === s)?.label ?? s,
      tone: 'classify' as const,
      clear: () => setSystems((p) => p.filter((x) => x !== s)),
    })),
    ...services.map((s) => ({
      key: `svc-${s}`,
      label: SERVICES.find((o) => o.value === s)?.label ?? s,
      tone: 'classify' as const,
      clear: () => setServices((p) => p.filter((x) => x !== s)),
    })),
    ...engineers.map((e) => ({
      key: `eng-${e}`,
      label: ENGINEERS.find((o) => o.value === e)?.label ?? e,
      tone: 'people' as const,
      clear: () => setEngineers((p) => p.filter((x) => x !== e)),
    })),
  ]

  return (
    <div className="space-y-3 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search calls or ref number…"
            className="h-9 pl-9"
          />
        </div>
        <StatusTabs value={tab} onChange={setTab} />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9 gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeCount > 0 && (
                <Badge className="ml-0.5 rounded-full px-1.5 py-0 tabular-nums">{activeCount}</Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[320px] space-y-4 p-4">
            <div className="space-y-2">
              <GroupLabel tone="attention" icon={Filter}>Flags</GroupLabel>
              <FlagChips values={flags} onChange={setFlags} />
            </div>
            <div className="space-y-2">
              <GroupLabel tone="classify" icon={Building2}>Type</GroupLabel>
              <SearchMultiSelect values={systems} onChange={setSystems} options={SYSTEMS} placeholder="All systems" />
              <SearchMultiSelect values={services} onChange={setServices} options={SERVICES} placeholder="All services" />
            </div>
            <div className="space-y-2">
              <GroupLabel tone="people" icon={Users}>Who</GroupLabel>
              <SearchMultiSelect values={engineers} onChange={setEngineers} options={ENGINEERS} placeholder="All engineers" />
            </div>
            <div className="space-y-2">
              <GroupLabel tone="time" icon={CalendarIcon}>When</GroupLabel>
              <DateRangeButton from={from} to={to} onFrom={setFrom} onTo={setTo} />
            </div>
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex items-center gap-1.5">
          <SortMenu />
          <ViewToggle />
        </div>
      </div>

      {/* Active-filter chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.clear}
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1',
                SECTION[c.tone].tint,
                SECTION[c.tone].ring,
                SECTION[c.tone].label,
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', SECTION[c.tone].dot)} />
              {c.label}
              <X className="h-3 w-3 opacity-60" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setFlags([]); setSystems([]); setServices([]); setEngineers([]); setFrom(undefined); setTo(undefined)
            }}
            className="ml-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}

// ── Draft C — labelled two-tier sections ─────────────────────────────────────
function DraftC() {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('upcoming')
  const [flags, setFlags] = useState<string[]>(['needs-booking'])
  const [systems, setSystems] = useState<string[]>([])
  const [services, setServices] = useState<string[]>([])
  const [engineers, setEngineers] = useState<string[]>([])
  const [from, setFrom] = useState<Date | undefined>()
  const [to, setTo] = useState<Date | undefined>()

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* Tier 1: search + status + view (the "what am I looking at" row) */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search calls or ref number…"
            className="h-9 bg-background pl-9"
          />
        </div>
        <StatusTabs value={tab} onChange={setTab} />
        <div className="ml-auto flex items-center gap-1.5">
          <SortMenu />
          <ViewToggle />
        </div>
      </div>

      {/* Tier 2: labelled, colour-coded filter columns (the "narrow it down" row) */}
      <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={cn('space-y-2 rounded-lg p-2.5', SECTION.attention.tint)}>
          <GroupLabel tone="attention" icon={Filter}>Flags</GroupLabel>
          <FlagChips values={flags} onChange={setFlags} />
        </div>
        <div className={cn('space-y-2 rounded-lg p-2.5', SECTION.classify.tint)}>
          <GroupLabel tone="classify" icon={Building2}>Type</GroupLabel>
          <SearchMultiSelect values={systems} onChange={setSystems} options={SYSTEMS} placeholder="All systems" />
          <SearchMultiSelect values={services} onChange={setServices} options={SERVICES} placeholder="All services" />
        </div>
        <div className={cn('space-y-2 rounded-lg p-2.5', SECTION.people.tint)}>
          <GroupLabel tone="people" icon={Users}>Who</GroupLabel>
          <SearchMultiSelect values={engineers} onChange={setEngineers} options={ENGINEERS} placeholder="All engineers" />
        </div>
        <div className={cn('space-y-2 rounded-lg p-2.5', SECTION.time.tint)}>
          <GroupLabel tone="time" icon={CalendarIcon}>When</GroupLabel>
          <DateRangeButton from={from} to={to} onFrom={setFrom} onTo={setTo} />
        </div>
      </div>
    </div>
  )
}

// ── Mock page header (shows "Add request" removed) ──────────────────────────
function MockHeader() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" className="h-9 gap-2">
        <Building2 className="h-4 w-4" /> All branches <ChevronDown className="h-4 w-4 opacity-60" />
      </Button>
      <Button variant="outline" className="h-9 gap-2">
        <CalendarClock className="h-4 w-4" /> Planning
      </Button>
      <Button variant="outline" className="h-9 gap-2">
        <MapPinned className="h-4 w-4" /> Map view
      </Button>
      <Button variant="outline" className="h-9 gap-2">
        <CalendarIcon className="h-4 w-4" /> Generate Calls
      </Button>
      <Button className="h-9 gap-2">
        <Wrench className="h-4 w-4" /> Log Call
      </Button>
      <span className="ml-1 text-xs text-muted-foreground">
        (“Add request” removed)
      </span>
    </div>
  )
}

function DraftBlock({
  n,
  title,
  blurb,
  children,
}: {
  n: string
  title: string
  blurb: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {n}
        </span>
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{blurb}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

export default function ToolbarPreviewPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Calls toolbar — redesign drafts</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Three interactive directions for the Calls filter bar. Every filter is now a multi-select
          (engineers included), “Add request” and the “Remedial” quick filter are gone, spacing is
          tightened, and filter groups are colour-coded: {' '}
          <span className="font-medium text-amber-700 dark:text-amber-400">Flags</span>,{' '}
          <span className="font-medium text-sky-700 dark:text-sky-400">Type</span>,{' '}
          <span className="font-medium text-violet-700 dark:text-violet-400">Who</span>,{' '}
          <span className="font-medium text-emerald-700 dark:text-emerald-400">When</span>. Try clicking around.
        </p>
      </header>

      <div className="rounded-xl border border-dashed p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Shared page header (all drafts)
        </p>
        <MockHeader />
      </div>

      <DraftBlock
        n="A"
        title="Grouped colour bar"
        blurb="One compact toolbar. Filters sit in tinted, labelled pods so each group reads instantly. Best when the full filter set should always be visible."
      >
        <DraftA />
      </DraftBlock>

      <DraftBlock
        n="B"
        title="Clean bar + Filters popover"
        blurb="Minimal top row. All filters live behind one “Filters” button; active choices show as removable colour-coded chips. Best for the tightest, calmest header."
      >
        <DraftB />
      </DraftBlock>

      <DraftBlock
        n="C"
        title="Two-tier labelled sections"
        blurb="Row 1 = what you’re viewing (search, status, view). Row 2 = colour-coded filter columns with headings. Best for scanability and touch targets."
      >
        <DraftC />
      </DraftBlock>
    </div>
  )
}
