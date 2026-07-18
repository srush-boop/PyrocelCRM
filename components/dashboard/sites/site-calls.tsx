'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { CallTile } from '@/components/dashboard/calls/call-tile'
import { GridToolbar, GridSearch, GridClearButton } from '@/components/dashboard/grid-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertCircle,
  ArrowRight,
  CalendarIcon,
  X,
  FileText,
  Send,
  Mail,
  Loader2,
} from 'lucide-react'
import { format } from 'date-fns'
import { formatDateUK, cn } from '@/lib/utils'
import { SystemIcon, getSystemColors } from '@/lib/system-types'
import { isDamperService } from '@/lib/dampers'
import { isExtinguisherService } from '@/lib/extinguishers'
import type { Task, SiteService, ServiceType, Profile, SystemType, TaskResult, ToleranceUnit } from '@/lib/types/database'
import { isCallOverdue } from '@/lib/kpi'

// ─── Types ────────────────────────────────────────────────────────────────────

// The system type carried on a call — either directly (7 of ~52 calls) or,
// far more commonly, resolved via the call's service type.
type CallSystemType = Pick<SystemType, 'id' | 'name' | 'code' | 'color'>
type CallServiceType = Pick<ServiceType, 'id' | 'name'> & {
  system_type?: CallSystemType | null
  // Optional: only the full `site_service.service_type` embed carries these; the
  // lightweight direct embed (id/name only) leaves them undefined. Used to
  // resolve when a call reports as overdue against its client KPI.
  is_recurring?: boolean | null
  regulatory_tolerance_value?: number | null
  regulatory_tolerance_unit?: ToleranceUnit | null
}

export type SiteCall = Omit<Task, 'service_type' | 'system_type' | 'assigned_engineer' | 'site_service'> & {
  site_service: (SiteService & { service_type: CallServiceType | null }) | null
  service_type: CallServiceType | null
  system_type: CallSystemType | null
  assigned_engineer: Profile | null
  task_result: TaskResult | null
  call_parts: { unit_cost_pence: number | null; quantity: number }[]
  // Populated when this call is a follow-up to an earlier one (for the sub-label).
  follow_up_to: {
    id: string
    is_emergency: boolean
    task_result: { reference_number: string | null } | null
  } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getServiceName(call: SiteCall) {
  return (
    call.site_service?.service_type?.name ||
    call.service_type?.name ||
    'Ad-hoc / reactive'
  )
}

/**
 * Resolve the call's system type. Most calls have no direct `system_type_id`, so
 * fall back to the system linked to their service type (site service first, then
 * the ad-hoc service type) — mirroring how the schedule grid resolves it.
 */
function getSystem(call: SiteCall): CallSystemType | null {
  return (
    call.system_type ??
    call.site_service?.service_type?.system_type ??
    call.service_type?.system_type ??
    null
  )
}

function getSystemName(call: SiteCall) {
  return getSystem(call)?.name ?? null
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

// ─── Call card ────────────────────────────────────────────────────────────────
// Thin wrapper that maps a SiteCall onto the shared CallTile template.

function CallCard({ call, onSendReport }: { call: SiteCall; onSendReport?: (c: SiteCall) => void }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Overdue only once the client KPI target date has expired (weekly/monthly
  // recurring PPM stays tied to the due week/month).
  const isOverdue = isCallOverdue(
    {
      scheduledDate: call.scheduled_date,
      status: call.status,
      isRecurring: call.site_service?.service_type?.is_recurring,
      frequencyValue: call.site_service?.frequency_value,
      frequencyUnit: call.site_service?.frequency_unit,
      clientToleranceValue: call.site_service?.client_tolerance_value,
      clientToleranceUnit: call.site_service?.client_tolerance_unit,
      regulatoryToleranceValue: call.site_service?.service_type?.regulatory_tolerance_value,
      regulatoryToleranceUnit: call.site_service?.service_type?.regulatory_tolerance_unit,
    },
    today,
  )
  const serviceName = getServiceName(call)
  const system = getSystem(call)
  const systemName = system?.name ?? null
  // The site name is implicit on the site page, so lead with the system type and
  // service (both bold in the tile title), plus a matching system icon so these
  // tiles share the same layout/dimensions as the all-calls grid tiles.
  const title = systemName ? `${systemName} · ${serviceName}` : serviceName
  // Colour-code by the resolved system type (falls back to a neutral slate),
  // matching the all-calls grid: coloured icon tile + left-border accent.
  const systemLike = { name: systemName ?? serviceName, code: system?.code, color: system?.color }
  const systemColors = getSystemColors(system?.color)
  const isCompleted = call.status === 'completed'
  const chargeInvoiced = !!call.charge_invoiced_at
  const reportHref = isCompleted ? getReportHref(call) : null
  // Follow-up chain context → ordinal visit label ("2nd visit", "3rd visit", …).
  const isFollowUp = !!call.follow_up_to_id
  const attempt = call.fix_attempt ?? 1
  const attemptLabel =
    attempt === 2 ? '2nd visit' : attempt === 3 ? '3rd visit' : `${attempt}th visit`

  return (
    <CallTile
      accentColor={systemColors.solid}
      leading={
        <SystemIcon system={systemLike} boxed boxClassName="h-8 w-8 shrink-0" />
      }
      title={title}
      status={call.status}
      result={call.task_result?.overall_status ?? null}
      reference={call.task_result?.reference_number ?? null}
      scheduledDate={call.scheduled_date}
      completedDate={call.completed_at}
      isOverdue={isOverdue}
      engineerName={call.assigned_engineer?.full_name ?? ''}
      valuePence={calcValue(call)}
      isEmergency={call.is_emergency}
      isRemedial={call.is_remedial}
      followUp={
        isFollowUp
          ? {
              attemptLabel,
              originRef: call.follow_up_to?.task_result?.reference_number ?? null,
              originId: call.follow_up_to_id,
            }
          : null
      }
      failedFirstFix={call.first_time_fix === false}
      chargeable={call.chargeable}
      awaitingReview={call.chargeable && call.charge_review_status === 'pending'}
      invoiced={chargeInvoiced}
      reviewed={call.chargeable && !chargeInvoiced && call.charge_review_status === 'reviewed'}
      actions={
        <>
          {reportHref && (
            <Button variant="outline" size="sm" asChild>
              <Link href={reportHref} target="_blank">
                <FileText className="h-4 w-4" />
                Report
              </Link>
            </Button>
          )}
          {isCompleted && onSendReport && (
            <Button variant="outline" size="sm" onClick={() => onSendReport(call)}>
              <Send className="h-4 w-4" />
              Send
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/dashboard/tasks/${call.id}`}>
              View
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </>
      }
    />
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'open' | 'pending' | 'in_progress' | 'paused' | 'completed' | 'cancelled'

interface SiteCallsProps {
  calls: SiteCall[]
  engineers: { id: string; name: string }[]
  serviceTypes: { id: string; name: string }[]
  reportingEmails?: string[]
}

export function SiteCalls({ calls, engineers, serviceTypes, reportingEmails = [] }: SiteCallsProps) {
  // Send-report dialog state
  const [sendingCall, setSendingCall] = useState<SiteCall | null>(null)
  const [sendEmails, setSendEmails] = useState<string[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sendSuccess, setSendSuccess] = useState(false)

  function openSendDialog(call: SiteCall) {
    setSendingCall(call)
    setSendEmails([...reportingEmails])
    setNewEmail('')
    setSendSuccess(false)
  }

  function addEmail() {
    const trimmed = newEmail.trim()
    if (trimmed && !sendEmails.includes(trimmed)) {
      setSendEmails([...sendEmails, trimmed])
      setNewEmail('')
    }
  }

  async function handleSendReport() {
    if (!sendingCall || sendEmails.length === 0) return
    setIsSending(true)
    try {
      const res = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: sendingCall.id, emails: sendEmails, resend: true }),
      })
      if (res.ok) {
        setSendSuccess(true)
        setTimeout(() => { setSendingCall(null); setSendSuccess(false) }, 2000)
      }
    } finally {
      setIsSending(false)
    }
  }
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [engineerFilter, setEngineerFilter] = useState('all')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [chargeFilter, setChargeFilter] = useState<'all' | 'chargeable' | 'invoiced' | 'awaiting'>('all')
  const [dateFrom, setDateFrom] = useState<Date | undefined>()
  const [dateTo, setDateTo] = useState<Date | undefined>()

  // Whether any call lacks an assigned engineer, so the "Assigned to" filter can
  // offer an Unassigned option even when no engineers are assigned yet.
  const hasUnassigned = useMemo(() => calls.some((c) => !c.assigned_engineer), [calls])

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

      // Assigned to (engineer / unassigned)
      if (engineerFilter === 'unassigned') {
        if (call.assigned_engineer) return false
      } else if (engineerFilter !== 'all' && call.assigned_engineer?.id !== engineerFilter) {
        return false
      }

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
      <GridToolbar
        meta={`${filtered.length} of ${calls.length} ${calls.length === 1 ? 'call' : 'calls'}`}
      >
        <GridSearch value={search} onChange={setSearch} placeholder="Search calls..." />

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

        {(engineers.length > 0 || hasUnassigned) && (
          <Select value={engineerFilter} onValueChange={setEngineerFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Assigned to" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Anyone</SelectItem>
              {hasUnassigned && <SelectItem value="unassigned">Unassigned</SelectItem>}
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

        {hasActiveFilters && <GridClearButton onClick={clearFilters} />}
      </GridToolbar>

      {/* Call cards */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 opacity-40" />
          No calls match your filters.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((call) => (
            <CallCard key={call.id} call={call} onSendReport={openSendDialog} />
          ))}
        </div>
      )}

      {/* Send report dialog */}
      <Dialog open={!!sendingCall} onOpenChange={() => setSendingCall(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Report</DialogTitle>
            <DialogDescription>
              {sendingCall ? `${getServiceName(sendingCall)} — ${sendingCall.completed_at ? formatDateUK(sendingCall.completed_at) : ''}` : ''}
            </DialogDescription>
          </DialogHeader>

          {sendSuccess ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Mail className="mx-auto mb-3 h-10 w-10 text-green-500" />
              <p className="text-base font-medium">Report sent successfully</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="send-email">Recipients</Label>
                  <div className="mt-1 flex gap-2">
                    <Input
                      id="send-email"
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="Add email address"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); addEmail() }
                      }}
                    />
                    <Button type="button" variant="outline" onClick={addEmail}>Add</Button>
                  </div>
                </div>
                {sendEmails.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {sendEmails.map((email) => (
                      <Badge key={email} variant="secondary" className="gap-1">
                        {email}
                        <button
                          type="button"
                          onClick={() => setSendEmails(sendEmails.filter((e) => e !== email))}
                          className="ml-1 hover:text-destructive"
                          aria-label={`Remove ${email}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No recipients added yet.</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSendingCall(null)}>Cancel</Button>
                <Button onClick={handleSendReport} disabled={isSending || sendEmails.length === 0}>
                  {isSending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                  ) : (
                    <><Send className="h-4 w-4" /> Send Report</>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
