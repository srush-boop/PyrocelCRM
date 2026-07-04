'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  getDay,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
  Clock,
  User as UserIcon,
  Globe,
  Pencil,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDateUK } from '@/lib/utils'
import type {
  CalendarItem,
  CalendarEntryType,
  Profile,
  RouteCalendarSource,
} from '@/lib/types/database'
import { CalendarEntryDialog } from './calendar-entry-dialog'

type ViewMode = 'day' | 'week' | 'month' | 'list'

interface PersonOption {
  id: string
  full_name: string | null
  email: string
  role: string
}

interface DepartmentOption {
  id: string
  name: string
}

interface CalendarViewProps {
  items: CalendarItem[]
  routes: RouteCalendarSource[]
  entryTypes: CalendarEntryType[]
  people: PersonOption[]
  departments: DepartmentOption[]
  profile: Profile
  canManageOthers: boolean
}

const ALL = '__all__'

// Expands recurring weekly routes into all-day calendar items for every
// matching weekday within [rangeStart, rangeEnd].
function buildRouteItems(
  routes: RouteCalendarSource[],
  rangeStart: Date,
  rangeEnd: Date,
): CalendarItem[] {
  const recurring = routes.filter((r) => r.weekday !== null)
  if (recurring.length === 0) return []
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd })
  const out: CalendarItem[] = []
  for (const day of days) {
    const dow = getDay(day)
    for (const r of recurring) {
      if (r.weekday !== dow) continue
      const key = format(day, 'yyyy-MM-dd')
      out.push({
        id: `route-${r.id}-${key}`,
        kind: 'route',
        title: r.name,
        start: `${key}T00:00:00`,
        end: `${key}T23:59:00`,
        allDay: true,
        color: r.color,
        ownerId: r.engineerId,
        ownerName: r.engineerName,
        subtitle: r.engineerName ? `Route · ${r.engineerName}` : 'Route',
        routeId: r.id,
      })
    }
  }
  return out
}

function itemsForDay(items: CalendarItem[], day: Date): CalendarItem[] {
  return items
    .filter((it) => {
      const start = startOfDay(new Date(it.start))
      const end = startOfDay(new Date(it.end))
      const d = startOfDay(day)
      return isWithinInterval(d, { start, end })
    })
    .sort((a, b) => {
      // all-day first, then by start time
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
      return new Date(a.start).getTime() - new Date(b.start).getTime()
    })
}

function timeLabel(item: CalendarItem): string {
  if (item.allDay) return 'All day'
  const start = new Date(item.start)
  const end = new Date(item.end)
  const s = format(start, 'HH:mm')
  const e = format(end, 'HH:mm')
  // Tasks with a single booked time may have start==end
  return s === e ? s : `${s}–${e}`
}

export function CalendarView({
  items,
  routes,
  entryTypes,
  people,
  departments,
  profile,
  canManageOthers,
  }: CalendarViewProps) {
  const router = useRouter()
  const [view, setView] = useState<ViewMode>('day')
  const [cursor, setCursor] = useState<Date>(new Date())
  const [selected, setSelected] = useState<CalendarItem | null>(null)

  // Filters
  const [personFilter, setPersonFilter] = useState<string>(ALL)
  const [typeFilter, setTypeFilter] = useState<string>(ALL)
  const [kindFilter, setKindFilter] = useState<string>(ALL)

  // Entry create/edit dialog state
  const [entryDialogOpen, setEntryDialogOpen] = useState(false)
  const [editEntryId, setEditEntryId] = useState<string | null>(null)
  const [defaultDate, setDefaultDate] = useState<Date | null>(null)

  // The visible date window for the current view, used to expand recurring
  // routes into concrete occurrences.
  const [rangeStart, rangeEnd] = useMemo<[Date, Date]>(() => {
    if (view === 'day') {
      return [startOfDay(cursor), endOfDay(cursor)]
    }
    if (view === 'month') {
      return [
        startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
        endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
      ]
    }
    if (view === 'week') {
      return [
        startOfWeek(cursor, { weekStartsOn: 1 }),
        endOfWeek(cursor, { weekStartsOn: 1 }),
      ]
    }
    // list/agenda: from the cursor day for the next eight weeks
    return [startOfDay(cursor), addWeeks(cursor, 8)]
  }, [view, cursor])

  // Tasks/entries combined with the route occurrences for the visible window.
  const allItems = useMemo(() => {
    return [...items, ...buildRouteItems(routes, rangeStart, rangeEnd)]
  }, [items, routes, rangeStart, rangeEnd])

  const filtered = useMemo(() => {
    return allItems.filter((it) => {
      if (kindFilter !== ALL && it.kind !== kindFilter) return false
      if (personFilter !== ALL) {
        if (personFilter === 'company' ? it.ownerId !== null : it.ownerId !== personFilter)
          return false
      }
      if (typeFilter !== ALL) {
        if (it.kind !== 'entry' || it.entryTypeName !== typeFilter) return false
      }
      return true
    })
  }, [allItems, kindFilter, personFilter, typeFilter])

  // Selecting a task opens it directly; routes and entries open the detail sheet.
  const handleSelect = (it: CalendarItem) => {
    if (it.kind === 'task' && it.taskId) {
      router.push(`/dashboard/tasks/${it.taskId}`)
      return
    }
    setSelected(it)
  }

  const openNewEntry = (date?: Date) => {
    setEditEntryId(null)
    setDefaultDate(date ?? cursor)
    setEntryDialogOpen(true)
  }

  const openEditEntry = (entryId: string) => {
    setEditEntryId(entryId)
    setDefaultDate(null)
    setEntryDialogOpen(true)
    setSelected(null)
  }

  // ---- Header / navigation ----
  const periodLabel =
    view === 'day'
      ? format(cursor, 'EEEE d MMMM yyyy')
      : view === 'month'
        ? format(cursor, 'MMMM yyyy')
        : view === 'week'
          ? `${format(startOfWeek(cursor, { weekStartsOn: 1 }), 'd MMM')} – ${format(
              endOfWeek(cursor, { weekStartsOn: 1 }),
              'd MMM yyyy',
            )}`
          : 'Upcoming'

  const navigate = (dir: -1 | 1) => {
    if (view === 'month') setCursor(addMonths(cursor, dir))
    else if (view === 'week') setCursor(addWeeks(cursor, dir))
    else if (view === 'day') setCursor(addDays(cursor, dir))
    else setCursor(addDays(cursor, dir * 14))
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => navigate(1)} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-1 text-lg font-semibold">{periodLabel}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="list">List</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button onClick={() => openNewEntry()}>
            <Plus className="mr-2 h-4 w-4" />
            New Entry
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All items" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All items</SelectItem>
            <SelectItem value="task">Booked tasks</SelectItem>
            <SelectItem value="route">Routes</SelectItem>
            <SelectItem value="entry">General entries</SelectItem>
          </SelectContent>
        </Select>

        {canManageOthers && (
          <Select value={personFilter} onValueChange={setPersonFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Everyone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Everyone</SelectItem>
              <SelectItem value="company">Company-wide</SelectItem>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name || p.email}
                  <span className="ml-1 text-xs text-muted-foreground">({p.role})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All entry types</SelectItem>
            {entryTypes.map((t) => (
              <SelectItem key={t.id} value={t.name}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Views */}
      {view === 'day' && (
        <DayView cursor={cursor} items={filtered} onSelect={handleSelect} onAddDay={openNewEntry} />
      )}
      {view === 'month' && (
        <MonthGrid
          cursor={cursor}
          items={filtered}
          onSelect={handleSelect}
          onAddDay={openNewEntry}
        />
      )}
      {view === 'week' && (
        <WeekGrid cursor={cursor} items={filtered} onSelect={handleSelect} onAddDay={openNewEntry} />
      )}
      {view === 'list' && (
        <AgendaList cursor={cursor} items={filtered} onSelect={handleSelect} />
      )}

      {/* Detail sheet */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent>
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: selected.color }}
                    aria-hidden="true"
                  />
                  {selected.title}
                </SheetTitle>
                <SheetDescription>
                  {selected.kind === 'task'
                    ? 'Booked service task'
                    : selected.kind === 'route'
                      ? 'Recurring route'
                      : selected.entryTypeName}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-4 text-sm">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  {isSameDay(new Date(selected.start), new Date(selected.end))
                    ? formatDateUK(selected.start)
                    : `${formatDateUK(selected.start)} – ${formatDateUK(selected.end)}`}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  {timeLabel(selected)}
                </div>
                <div className="flex items-center gap-2">
                  {selected.ownerId ? (
                    <UserIcon className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Globe className="h-4 w-4 text-muted-foreground" />
                  )}
                  {selected.ownerName || 'Unassigned'}
                </div>
                {selected.subtitle && (
                  <p className="text-muted-foreground">{selected.subtitle}</p>
                )}
                {selected.kind === 'entry' && (
                  <Badge variant={selected.isPublic ? 'default' : 'secondary'}>
                    {selected.isPublic ? 'Public' : 'Private'}
                  </Badge>
                )}

                <div className="flex gap-2 pt-2">
                  {selected.kind === 'task' && selected.taskId && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/dashboard/tasks/${selected.taskId}`}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open task
                      </Link>
                    </Button>
                  )}
                  {selected.kind === 'route' && (
                    <Button asChild variant="outline" size="sm">
                      <Link href="/dashboard/routes">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Manage route
                      </Link>
                    </Button>
                  )}
                  {selected.kind === 'entry' && selected.entryId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditEntry(selected.entryId!)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit entry
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <CalendarEntryDialog
        open={entryDialogOpen}
        onOpenChange={setEntryDialogOpen}
        entryId={editEntryId}
        defaultDate={defaultDate}
        entryTypes={entryTypes}
        people={people}
        departments={departments}
        profile={profile}
        canManageOthers={canManageOthers}
      />
    </div>
  )
}

// ---------------- Day view ----------------
function DayView({
  cursor,
  items,
  onSelect,
  onAddDay,
}: {
  cursor: Date
  items: CalendarItem[]
  onSelect: (it: CalendarItem) => void
  onAddDay: (d: Date) => void
}) {
  const dayItems = itemsForDay(items, cursor)
  const allDayItems = dayItems.filter((it) => it.allDay)
  const timedItems = dayItems.filter((it) => !it.allDay)
  const isToday = isSameDay(cursor, new Date())

  return (
    <Card className={cn(isToday && 'border-primary')}>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{format(cursor, 'EEEE')}</p>
            <p className={cn('text-2xl font-semibold', isToday && 'text-primary')}>
              {format(cursor, 'd MMMM yyyy')}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => onAddDay(cursor)}>
            <Plus className="mr-2 h-4 w-4" />
            New Entry
          </Button>
        </div>

        {dayItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CalendarDays className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-muted-foreground">Nothing scheduled for this day</p>
          </div>
        )}

        {allDayItems.length > 0 && (
          <div className="mb-4 space-y-1">
            <p className="mb-1 text-xs font-medium text-muted-foreground">All day</p>
            {allDayItems.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => onSelect(it)}
                className="flex w-full items-center gap-2 rounded border-l-2 px-3 py-2 text-left text-sm hover:bg-accent"
                style={{ borderLeftColor: it.color, backgroundColor: `${it.color}12` }}
              >
                <span className="font-medium">{it.title}</span>
                {it.ownerName && (
                  <span className="truncate text-xs text-muted-foreground">· {it.ownerName}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {timedItems.length > 0 && (
          <div className="space-y-1">
            {timedItems.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => onSelect(it)}
                className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent"
              >
                <div className="w-20 shrink-0 text-xs font-medium text-muted-foreground">
                  {timeLabel(it)}
                </div>
                <span
                  className="h-8 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: it.color }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{it.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[it.subtitle, it.ownerName].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {it.kind === 'task' ? 'Task' : it.kind === 'route' ? 'Route' : it.entryTypeName}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------- Month grid ----------------
function MonthGrid({
  cursor,
  items,
  onSelect,
  onAddDay,
}: {
  cursor: Date
  items: CalendarItem[]
  onSelect: (it: CalendarItem) => void
  onAddDay: (d: Date) => void
}) {
  const monthStart = startOfMonth(cursor)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })
  const today = new Date()
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <Card>
      <CardContent className="p-0">
        <div className="grid grid-cols-7 border-b">
          {weekdays.map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dayItems = itemsForDay(items, day)
            const inMonth = isSameMonth(day, cursor)
            const isToday = isSameDay(day, today)
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'group min-h-24 border-b border-r p-1 last:border-r-0 sm:min-h-28',
                  !inMonth && 'bg-muted/40',
                )}
              >
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => onAddDay(day)}
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full text-xs',
                      isToday
                        ? 'bg-primary font-semibold text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent',
                      !inMonth && 'opacity-50',
                    )}
                    aria-label={`Add entry on ${formatDateUK(day)}`}
                  >
                    {format(day, 'd')}
                  </button>
                </div>
                <div className="mt-1 space-y-1">
                  {dayItems.slice(0, 3).map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => onSelect(it)}
                      className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] leading-tight hover:opacity-80"
                      style={{ backgroundColor: `${it.color}20` }}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: it.color }}
                        aria-hidden="true"
                      />
                      <span className="truncate">
                        {!it.allDay && (
                          <span className="mr-1 font-medium">{format(new Date(it.start), 'HH:mm')}</span>
                        )}
                        {it.title}
                      </span>
                    </button>
                  ))}
                  {dayItems.length > 3 && (
                    <p className="px-1 text-[11px] text-muted-foreground">
                      +{dayItems.length - 3} more
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------- Week grid ----------------
function WeekGrid({
  cursor,
  items,
  onSelect,
  onAddDay,
}: {
  cursor: Date
  items: CalendarItem[]
  onSelect: (it: CalendarItem) => void
  onAddDay: (d: Date) => void
}) {
  const weekStart = startOfWeek(cursor, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: weekStart, end: endOfWeek(cursor, { weekStartsOn: 1 }) })
  const today = new Date()

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((day) => {
        const dayItems = itemsForDay(items, day)
        const isToday = isSameDay(day, today)
        return (
          <Card key={day.toISOString()} className={cn(isToday && 'border-primary')}>
            <CardContent className="p-3">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{format(day, 'EEE')}</p>
                  <p className={cn('text-lg font-semibold', isToday && 'text-primary')}>
                    {format(day, 'd')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onAddDay(day)}
                  aria-label={`Add entry on ${formatDateUK(day)}`}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-1">
                {dayItems.length === 0 && (
                  <p className="py-2 text-center text-xs text-muted-foreground">—</p>
                )}
                {dayItems.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => onSelect(it)}
                    className="flex w-full flex-col gap-0.5 rounded border-l-2 px-2 py-1 text-left text-xs hover:bg-accent"
                    style={{ borderLeftColor: it.color, backgroundColor: `${it.color}12` }}
                  >
                    <span className="font-medium leading-tight">{it.title}</span>
                    <span className="text-[11px] text-muted-foreground">{timeLabel(it)}</span>
                    {it.ownerName && (
                      <span className="truncate text-[11px] text-muted-foreground">
                        {it.ownerName}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ---------------- Agenda / list ----------------
function AgendaList({
  cursor,
  items,
  onSelect,
}: {
  cursor: Date
  items: CalendarItem[]
  onSelect: (it: CalendarItem) => void
}) {
  // Show items from the cursor day forward, grouped by day.
  const from = startOfDay(cursor)
  const upcoming = items
    .filter((it) => startOfDay(new Date(it.end)) >= from)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  const groups = useMemo(() => {
    const map = new Map<string, CalendarItem[]>()
    for (const it of upcoming) {
      const key = format(new Date(it.start), 'yyyy-MM-dd')
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(it)
    }
    return Array.from(map.entries())
  }, [upcoming])

  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarDays className="mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-muted-foreground">Nothing scheduled from this date onward</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {groups.map(([key, dayItems]) => (
        <Card key={key}>
          <CardContent className="p-4">
            <p className="mb-3 text-sm font-semibold">
              {format(new Date(key), 'EEEE d MMMM yyyy')}
            </p>
            <div className="space-y-2">
              {dayItems.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onSelect(it)}
                  className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent"
                >
                  <span
                    className="h-8 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: it.color }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[it.subtitle, it.ownerName].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium">{timeLabel(it)}</p>
                    <Badge variant="outline" className="mt-1 text-[10px]">
                      {it.kind === 'task'
                        ? 'Task'
                        : it.kind === 'route'
                          ? 'Route'
                          : it.entryTypeName}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
