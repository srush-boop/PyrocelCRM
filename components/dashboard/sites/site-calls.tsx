'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import {
  Clock,
  ClipboardCheck,
  PauseCircle,
  Search,
  AlertCircle,
  Flame,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  CalendarIcon,
  User,
  Wrench,
  Shield,
  X,
  Coins,
  Receipt,
  FileText,
} from 'lucide-react'
import { format } from 'date-fns'
import { formatDateUK, cn } from '@/lib/utils'
import { isDamperService } from '@/lib/dampers'
import { isExtinguisherService } from '@/lib/extinguishers'
import type { Task, SiteService, ServiceType, Profile, SystemType, TaskResult } from '@/lib/types/database'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SiteCall = Omit<Task, 'service_type' | 'system_type' | 'assigned_engineer' | 'site_service'> & {
  site_service: (SiteService & { service_type: ServiceType | null }) | null
  service_type: Pick<ServiceType, 'id' | 'name'> | null
  system_type: Pick<SystemType, 'id' | 'name'> | null
  assigned_engineer: Profile | null
  task_result: TaskResult | null
  call_parts: { unit_cost_pence: number | null; quantity: number }[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getServiceName(call: SiteCall) {
  return (
    call.site_service?.service_type?.name ||
    call.service_type?.name ||
    'Ad-hoc / reactive'
  )
}

function getSystemName(call: SiteCall) {
  return call.system_type?.name ?? null
}

function getReportHref(call: SiteCall) {
  const svc = getServiceName(call)
  if (isDamperService(svc)) return `/dashboard/dampers/report/${call.id}`
  if (isExtinguisherService(svc)) return `/dashboard/extinguishers/report/${call.id}`
  return `/dashboard/reports/${call.id}`
}

function calcValue(call: SiteCall): number | null {
  if (!call.call_parts?.length) return null
  const total = call.call_parts.reduce(
    (sum, p) => sum + (p.unit_cost_pence ?? 0) * p.quantity,
    0,
  )
  return total > 0 ? total : null
}

function formatPence(pence: number) {
  return `£${(pence / 100).toFixed(2)}`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="outline" className="gap-1 bg-secondary/60 text-secondary-foreground">
          <Clock className="h-3 w-3" /> Pending
        </Badge>
      )
    case 'in_progress':
      return (
        <Badge variant="outline" className="gap-1 bg-primary/10 text-primary border-primary/20">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden />
          In Progress
        </Badge>
      )
    case 'paused':
      return (
        <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-600 border-amber-500/20">
          <PauseCircle className="h-3 w-3" /> Paused
        </Badge>
      )
    case 'completed':
      return (
        <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-700 border-green-500/20">
          <ClipboardCheck className="h-3 w-3" /> Completed
        </Badge>
      )
    case 'cancelled':
      return (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <XCircle className="h-3 w-3" /> Cancelled
        </Badge>
      )
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

function ResultBadge({ status }: { status: string }) {
  switch (status) {
    case 'pass':
      return (
        <Badge className="gap-1 bg-green-500/10 text-green-700 border-green-500/20">
          <CheckCircle2 className="h-3 w-3" /> Pass
        </Badge>
      )
    case 'fail':
      return (
        <Badge className="gap-1 bg-red-500/10 text-red-600 border-red-500/20">
          <XCircle className="h-3 w-3" /> Fail
        </Badge>
      )
    case 'partial':
      return (
        <Badge className="gap-1 bg-yellow-500/10 text-yellow-700 border-yellow-500/20">
          <AlertCircle className="h-3 w-3" /> Partial
        </Badge>
      )
    case 'no_access':
      return (
        <Badge className="gap-1 bg-amber-500/10 text-amber-600 border-amber-500/20">
          <AlertTriangle className="h-3 w-3" /> No Access
        </Badge>
      )
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

// ─── Call card ────────────────────────────────────────────────────────────────

function CallCard({ call }: { call: SiteCall }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const scheduled = call.scheduled_date ? new Date(call.scheduled_date) : null
  const isOverdue =
    scheduled && scheduled < today && call.status === 'pending'
  const serviceName = getServiceName(call)
  const systemName = getSystemName(call)
  const value = calcValue(call)
  const isCompleted = call.status === 'completed'
  const refNum = call.task_result?.reference_number ?? null
  const chargeInvoiced = !!call.charge_invoiced_at
  const awaitingReview =
    call.chargeable && call.charge_review_status === 'pending'
  const reportHref = isCompleted ? getReportHref(call) : null

  return (
    <Card
      className={cn(
        'transition-colors',
        call.status === 'in_progress' && 'border-l-4 border-l-primary',
        isOverdue && 'border-l-4 border-l-destructive',
      )}
    >
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          {/* Left: core identity */}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {/* Row 1: service + system + emergency/remedial flags */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{serviceName}</span>
              {systemName && (
                <Badge variant="secondary" className="gap-1 text-xs font-normal">
                  <Shield className="h-3 w-3" />
                  {systemName}
                </Badge>
              )}
              {call.is_emergency && (
                <Badge variant="destructive" className="gap-1 text-xs">
                  <Flame className="h-3 w-3" /> Emergency
                </Badge>
              )}
              {call.is_remedial && (
                <Badge variant="outline" className="text-xs">Remedial</Badge>
              )}
            </div>

            {/* Row 2: meta grid */}
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              {/* Reference */}
              {refNum && (
                <span className="flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-mono text-foreground">{refNum}</span>
                </span>
              )}
              {/* Date */}
              <span className="flex items-center gap-1">
                <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                <span className={cn(isOverdue && 'font-medium text-destructive')}>
                  {isCompleted && call.completed_at
                    ? formatDateUK(call.completed_at)
                    : call.scheduled_date
                      ? formatDateUK(call.scheduled_date)
                      : '—'}
                </span>
                {isOverdue && (
                  <span className="ml-0.5 text-xs font-medium text-destructive">Overdue</span>
                )}
              </span>
              {/* Assigned to */}
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5 shrink-0" />
                {call.assigned_engineer?.full_name || 'Unassigned'}
              </span>
              {/* Value */}
              {value !== null && (
                <span className="flex items-center gap-1">
                  <Coins className="h-3.5 w-3.5 shrink-0" />
                  {formatPence(value)}
                </span>
              )}
            </div>

            {/* Row 3: status badges */}
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={call.status} />
              {isCompleted && call.task_result && (
                <ResultBadge status={call.task_result.overall_status} />
              )}
              {call.chargeable && (
                <Badge variant="outline" className="gap-1 text-xs bg-amber-500/10 text-amber-700 border-amber-400/30">
                  <Coins className="h-3 w-3" />
                  Chargeable
                </Badge>
              )}
              {awaitingReview && (
                <Badge variant="outline" className="gap-1 text-xs bg-orange-500/10 text-orange-700 border-orange-400/30">
                  <AlertCircle className="h-3 w-3" />
                  Awaiting review
                </Badge>
              )}
              {chargeInvoiced && (
                <Badge variant="outline" className="gap-1 text-xs bg-blue-500/10 text-blue-700 border-blue-400/30">
                  <Receipt className="h-3 w-3" />
                  Invoiced
                </Badge>
              )}
              {call.chargeable && !chargeInvoiced && call.charge_review_status === 'reviewed' && (
                <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
                  <Wrench className="h-3 w-3" />
                  Reviewed
                </Badge>
              )}
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex shrink-0 items-center gap-2">
            {reportHref && (
              <Button variant="outline" size="sm" asChild>
                <Link href={reportHref} target="_blank">
                  <FileText className="h-4 w-4" />
                  Report
                </Link>
              </Button>
            )}
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/dashboard/tasks/${call.id}`}>
                View
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'open' | 'pending' | 'in_progress' | 'paused' | 'completed' | 'cancelled'

interface SiteCallsProps {
  calls: SiteCall[]
  engineers: { id: string; name: string }[]
  serviceTypes: { id: string; name: string }[]
}

export function SiteCalls({ calls, engineers, serviceTypes }: SiteCallsProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [engineerFilter, setEngineerFilter] = useState('all')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [chargeFilter, setChargeFilter] = useState<'all' | 'chargeable' | 'invoiced' | 'awaiting'>('all')
  const [dateFrom, setDateFrom] = useState<Date | undefined>()
  const [dateTo, setDateTo] = useState<Date | undefined>()

  const filtered = useMemo(() => {
    return calls.filter((call) => {
      // Text search
      if (search.trim()) {
        const q = search.toLowerCase()
        const refNum = call.task_result?.reference_number ?? ''
        const hit =
          getServiceName(call).toLowerCase().includes(q) ||
          (getSystemName(call) ?? '').toLowerCase().includes(q) ||
          (call.assigned_engineer?.full_name ?? '').toLowerCase().includes(q) ||
          (call.notes ?? '').toLowerCase().includes(q) ||
          refNum.toLowerCase().includes(q)
        if (!hit) return false
      }

      // Status
      if (statusFilter !== 'all') {
        if (statusFilter === 'open') {
          if (!['pending', 'in_progress', 'paused'].includes(call.status)) return false
        } else {
          if (call.status !== statusFilter) return false
        }
      }

      // Engineer
      if (engineerFilter !== 'all' && call.assigned_engineer?.id !== engineerFilter) return false

      // Service
      if (serviceFilter !== 'all') {
        const svcId =
          call.site_service?.service_type?.id ?? call.service_type?.id ?? null
        if (svcId !== serviceFilter) return false
      }

      // Chargeable
      if (chargeFilter === 'chargeable' && !call.chargeable) return false
      if (chargeFilter === 'invoiced' && !call.charge_invoiced_at) return false
      if (
        chargeFilter === 'awaiting' &&
        !(call.chargeable && call.charge_review_status === 'pending')
      )
        return false

      // Date range — use completed_at for completed, scheduled_date otherwise
      const dateRef =
        call.status === 'completed' && call.completed_at
          ? new Date(call.completed_at)
          : call.scheduled_date
            ? new Date(call.scheduled_date)
            : null
      if (dateRef) {
        if (dateFrom && dateRef < dateFrom) return false
        if (dateTo) {
          const end = new Date(dateTo)
          end.setHours(23, 59, 59, 999)
          if (dateRef > end) return false
        }
      }

      return true
    })
  }, [calls, search, statusFilter, engineerFilter, serviceFilter, chargeFilter, dateFrom, dateTo])

  const hasActiveFilters =
    search ||
    statusFilter !== 'all' ||
    engineerFilter !== 'all' ||
    serviceFilter !== 'all' ||
    chargeFilter !== 'all' ||
    dateFrom ||
    dateTo

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setEngineerFilter('all')
    setServiceFilter('all')
    setChargeFilter('all')
    setDateFrom(undefined)
    setDateTo(undefined)
  }

  if (calls.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
        No calls recorded for this site yet.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search calls..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        {engineers.length > 1 && (
          <Select value={engineerFilter} onValueChange={setEngineerFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Engineer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All engineers</SelectItem>
              {engineers.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {serviceTypes.length > 1 && (
          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All services</SelectItem>
              {serviceTypes.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={chargeFilter} onValueChange={(v) => setChargeFilter(v as typeof chargeFilter)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Charge" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All charges</SelectItem>
            <SelectItem value="chargeable">Chargeable</SelectItem>
            <SelectItem value="awaiting">Awaiting review</SelectItem>
            <SelectItem value="invoiced">Invoiced</SelectItem>
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn('w-[110px] justify-start text-left font-normal', !dateFrom && 'text-muted-foreground')}
            >
              <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
              {dateFrom ? format(dateFrom, 'dd/MM/yy') : 'From'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn('w-[110px] justify-start text-left font-normal', !dateTo && 'text-muted-foreground')}
            >
              <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
              {dateTo ? format(dateTo, 'dd/MM/yy') : 'To'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus />
          </PopoverContent>
        </Popover>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}

        <span className="ml-auto text-sm text-muted-foreground">
          {filtered.length} of {calls.length} {calls.length === 1 ? 'call' : 'calls'}
        </span>
      </div>

      {/* Call cards */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 opacity-40" />
          No calls match your filters.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((call) => (
            <CallCard key={call.id} call={call} />
          ))}
        </div>
      )}
    </div>
  )
}
