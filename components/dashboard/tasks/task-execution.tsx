'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { ReactNode } from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TaskAttachments } from '@/components/dashboard/tasks/task-attachments'
import { TaskHeader } from '@/components/dashboard/tasks/task-header'
import { PauseResumeControls } from '@/components/dashboard/tasks/pause-resume-controls'
import { ReportNotesAssist } from '@/components/dashboard/reports/report-notes-assist'
import { CompletedReportActions } from '@/components/dashboard/reports/completed-report-actions'
import { SuggestedPartsPicker } from '@/components/dashboard/tasks/suggested-parts-picker'
import { CallPartsPicker } from '@/components/dashboard/tasks/call-parts-picker'
import { FurtherWorksSheet } from '@/components/dashboard/tasks/further-works-sheet'
import { NearbyCallsPrompt } from '@/components/dashboard/tasks/nearby-calls-prompt'
import {
  findNearbyOverdueCalls,
  type NearbyOverdueCall,
} from '@/app/(dashboard)/dashboard/nearby/actions'
import { useShiftGate } from '@/components/dashboard/tasks/use-shift-gate'
import { OfflineStatusBadge } from '@/components/dashboard/tasks/offline-status-badge'
import { useOfflineSync } from '@/lib/offline/use-offline-sync'
import { persistTaskResult, isOnline } from '@/lib/offline/sync'
import { cacheCallSnapshot } from '@/lib/offline/snapshots'
import { isNonRecurringCall } from '@/lib/follow-up'
import { resolveCallKind } from '@/lib/call-kinds'
import { SignaturePad } from '@/components/portal/signature-pad'
import { formatDateUK, formatTimeUK, toDatetimeLocalValue, cn } from '@/lib/utils'
import { computeNextScheduledDate, toDateString } from '@/lib/scheduling'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { 
  MapPin, 
  Phone, 
  Mail, 
  Calendar,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Save,
  Send,
  Play,
  Building2,
  Clock,
  StopCircle,
  Link2,
  ExternalLink,
  UserPlus,
  Wrench,
  ChevronDown,
  Camera,
  ImageIcon,
  X,
  CornerDownRight,
  Ban,
  } from 'lucide-react'
import type { 
  Profile, 
  TaskWithDetails, 
  ChecklistTemplate, 
  ChecklistItem,
  ChecklistResult,
  ChecklistCondition,
  TaskResult,
  TaskResultStatus,
  ClientLink,
  SystemPanel
} from '@/lib/types/database'

interface TaskExecutionProps {
  task: TaskWithDetails
  checklistTemplate: ChecklistTemplate | null
  existingResult: TaskResult | null
  profile: Profile
  clientLinks?: ClientLink[]
  engineers?: Profile[]
  panels?: SystemPanel[]
  /**
   * Panel-level visit rotation. When present and non-empty, each keyed panel uses
   * its own checklist template (and level label) on this visit instead of the
   * single `checklistTemplate`. Absent/empty = every panel uses checklistTemplate.
   */
  panelChecklists?: Record<string, { template: ChecklistTemplate; level: string }>
  /** Shared "Before you attend" panel, rendered beneath the site/service header. */
  preAttendance?: ReactNode
}

// Builds the initial checklist results for a template. When the task's system
// has panels, the full checklist is repeated once per panel and each row is
// tagged with its panel so one report captures every panel. The composite
// item_id keeps each row uniquely addressable by updateChecklistResult.
function buildInitialResults(
  items: ChecklistItem[],
  panels: SystemPanel[],
  panelChecklists: Record<string, { template: ChecklistTemplate; level: string }> = {},
): ChecklistResult[] {
  const baseRow = (
    item: ChecklistItem,
    itemId: string,
    panel: SystemPanel | null,
    level: string | null,
  ): ChecklistResult => ({
    item_id: itemId,
    label: item.label,
    type: item.type,
    value: item.type === 'pass_fail' ? true : item.type === 'checkbox' ? false : '',
    passed: item.type === 'pass_fail' ? true : null,
    notes: '',
    panel_id: panel?.id ?? null,
    panel_name: panel?.name ?? null,
    panel_level: level,
  })

  // A template item expands to its own (parent) row plus, for each conditional
  // rule, one hidden follow-up row per follow-up question. Follow-up rows are
  // tagged with parent_item_id + condition_id so the UI can reveal them only
  // while the owning rule is active, and reports can filter unanswered ones out.
  const makeRows = (
    item: ChecklistItem,
    panel: SystemPanel | null,
    level: string | null = null,
  ): ChecklistResult[] => {
    const parentId = panel ? `${panel.id}::${item.id}` : item.id
    const parent = baseRow(item, parentId, panel, level)
    const conditions = item.conditions || []
    if (conditions.length > 0) parent.conditions = conditions
    const childRows: ChecklistResult[] = []
    for (const cond of conditions) {
      for (const child of cond.items || []) {
        const childRow = baseRow(child, `${parentId}::${cond.id}::${child.id}`, panel, level)
        childRow.parent_item_id = parentId
        childRow.condition_id = cond.id
        childRow.required = child.required
        childRows.push(childRow)
      }
    }
    return [parent, ...childRows]
  }

  if (panels.length === 0) return items.flatMap((item) => makeRows(item, null))
  return panels.flatMap((panel) => {
    // Panel rotation: this panel may use its own template + level on this visit.
    const rotated = panelChecklists[panel.id]
    if (rotated) {
      return rotated.template.items.flatMap((item) => makeRows(item, panel, rotated.level))
    }
    return items.flatMap((item) => makeRows(item, panel))
  })
}

// Evaluates whether a conditional rule is currently "active" given the parent
// row's answer. Active rules reveal their requirements (photo/note/follow-ups)
// and are enforced at submit; inactive rules stay hidden and are ignored.
function isConditionActive(row: ChecklistResult, cond: ChecklistCondition): boolean {
  // An item marked N/A carries no answer, so no follow-up rule can fire.
  if (row.na) return false
  switch (cond.when) {
    case 'fail':
      return row.passed === false && !row.advisory
    case 'advisory':
      return row.advisory === true
    case 'pass':
      return row.passed === true && !row.advisory
    case 'checked':
      return row.value === true
    case 'unchecked':
      return row.value === false
    case 'number': {
      const v = typeof row.value === 'number' ? row.value : parseFloat(String(row.value))
      if (!Number.isFinite(v) || cond.threshold == null) return false
      switch (cond.comparator) {
        case 'gt':
          return v > cond.threshold
        case 'lt':
          return v < cond.threshold
        case 'gte':
          return v >= cond.threshold
        case 'lte':
          return v <= cond.threshold
        case 'eq':
          return v === cond.threshold
        default:
          return false
      }
    }
    default:
      return false
  }
}

// Compact "N/A" toggle shown beside checkbox / text / number checklist inputs.
// When active the item is marked not-applicable and excluded from the outcome.
function NaToggle({
  active,
  disabled,
  onToggle,
}: {
  active: boolean
  disabled?: boolean
  onToggle: () => void
}) {
  return (
    <Button
      type="button"
      variant={active ? 'default' : 'outline'}
      size="sm"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        'h-9 shrink-0 gap-1 px-3 text-xs font-semibold',
        active
          ? 'bg-muted-foreground text-background hover:bg-muted-foreground/90 border-muted-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
      aria-pressed={active}
    >
      <Ban className="h-4 w-4" />
      N/A
    </Button>
  )
}

// Whether a follow-up row still needs an answer (only meaningful when required).
function isChildUnanswered(row: ChecklistResult): boolean {
  switch (row.type) {
    case 'text':
      return !String(row.value ?? '').trim()
    case 'number':
      return row.value === '' || row.value == null || Number.isNaN(Number(row.value))
    case 'checkbox':
      return row.value !== true
    default:
      // pass_fail always carries a definite answer (defaults to Pass).
      return false
  }
}

// A card whose body collapses behind its header. Used to tuck away
// non-vital overview detail (site contacts, reference links) so the call
// overview leads with the essentials and stays tidy.
function CollapsibleCard({
  icon,
  title,
  description,
  defaultOpen = false,
  children,
}: {
  icon?: ReactNode
  title: string
  description?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-start gap-3 px-6 py-4 text-left"
          >
            {icon}
            <div className="flex-1">
              <div className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">
                {title}
              </div>
              {description && (
                <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
              )}
            </div>
            <ChevronDown
              className={cn(
                'mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-180',
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">{children}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

// A working day is treated as 8 hours when converting the "days" part of the
// anticipated duration into minutes. Keep in sync with lib/calendar.ts.
const WORKDAY_MINUTES = 480

// Renders a minutes total as e.g. "1 day 2 hrs" using the working-day length.
function formatDuration(totalMinutes: number): string {
  const days = Math.floor(totalMinutes / WORKDAY_MINUTES)
  const hours = Math.round((totalMinutes % WORKDAY_MINUTES) / 60)
  const parts: string[] = []
  if (days > 0) parts.push(`${days} day${days === 1 ? '' : 's'}`)
  if (hours > 0) parts.push(`${hours} hr${hours === 1 ? '' : 's'}`)
  return parts.join(' ') || '0 hrs'
}

export function TaskExecution({ 
  task, 
  checklistTemplate, 
  existingResult,
  profile,
  clientLinks = [],
  engineers = [],
  panels = [],
  panelChecklists = {},
  preAttendance,
}: TaskExecutionProps) {
  const [status, setStatus] = useState(task.status)
  // Local snapshot of the assigned engineer so the summary reflects quick
  // reassignments immediately without a full reload.
  const [assignedEngineerId, setAssignedEngineerId] = useState<string | null>(
    task.assigned_engineer_id ?? null
  )
  const [assigning, setAssigning] = useState(false)
  const [checklistResults, setChecklistResults] = useState<ChecklistResult[]>(() => {
    if (existingResult?.checklist_results) {
      return existingResult.checklist_results
    }
    // Initialize from template, repeated per panel when the system has panels.
    // With panel rotation, each panel may use its own template + level.
    return buildInitialResults(checklistTemplate?.items || [], panels, panelChecklists)
  })
  const [engineerNotes, setEngineerNotes] = useState(existingResult?.engineer_notes || '')
  // On-site client sign-off (non-recurring calls only). The signature is a PNG
  // data URL captured on the SignaturePad; the name is the printed signatory.
  const [clientSignature, setClientSignature] = useState<string | null>(
    existingResult?.client_signature || null,
  )
  const [clientSignatureName, setClientSignatureName] = useState(
    existingResult?.client_signature_name || '',
  )
  const [testingStartTime, setTestingStartTime] = useState<Date | null>(
    existingResult?.testing_start_time ? new Date(existingResult.testing_start_time) : null
  )
  const [testingEndTime, setTestingEndTime] = useState<Date | null>(
    existingResult?.testing_end_time ? new Date(existingResult.testing_end_time) : null
  )
  const [timerRunning, setTimerRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showSubmitDialog, setShowSubmitDialog] = useState(false)
  // Offline spike: set when an engineer tries to submit with no connection.
  const [offlineSubmitBlocked, setOfflineSubmitBlocked] = useState(false)
  // After completion, nearby overdue/due-soon calls the engineer can take on.
  const [nearbyCalls, setNearbyCalls] = useState<NearbyOverdueCall[]>([])
  const [showNearbyPrompt, setShowNearbyPrompt] = useState(false)
  // Id of the task_results row backing this call. Tracked so the autosave draft,
  // the manual Save and the final Submit all update one row rather than inserting
  // duplicates. Seeded from any result already loaded for the call.
  const [resultId, setResultId] = useState<string | null>(existingResult?.id ?? null)
  const resultIdRef = useRef<string | null>(existingResult?.id ?? null)
  // Feedback for the automatic draft save (shown subtly next to the Notes).
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  // "Book Visit" lets the engineer place this task onto the calendar by setting
  // a date and an optional appointment time slot.
  const [bookedDate, setBookedDate] = useState(task.scheduled_date)
  const [bookedStart, setBookedStart] = useState((task.booked_start_time || '').slice(0, 5))
  // Anticipated time to complete, split into whole days + hours for the engineer
  // to enter. A working day is treated as 8 hours (see WORKDAY_MINUTES).
  const [bookedDays, setBookedDays] = useState(
    task.booked_duration_minutes ? String(Math.floor(task.booked_duration_minutes / 480)) : '',
  )
  const [bookedHours, setBookedHours] = useState(
    task.booked_duration_minutes ? String(Math.round((task.booked_duration_minutes % 480) / 60)) : '',
  )
  const [bookingVisit, setBookingVisit] = useState(false)
  const [bookError, setBookError] = useState<string | null>(null)
  const [bookSaved, setBookSaved] = useState(false)
  // Lone-worker gate: blocks starting a call until the engineer's shift is on.
  const { ensureOnShift, checking: checkingShift, shiftGateDialog } = useShiftGate()
  const router = useRouter()
  const supabase = createClient()

  // Offline spike: connectivity + queue state, and the server `updated_at` we
  // last saw for the backing row (the conflict base for queued writes).
  const offline = useOfflineSync()
  const baseUpdatedAtRef = useRef<string | null>(existingResult?.updated_at ?? null)

  // Cache the checklist-relevant props so the engineer surface can repopulate
  // this call offline. Full offline rendering of the route needs the Phase 1
  // shell; this stores the data that layer will read from.
  useEffect(() => {
    void cacheCallSnapshot(task.id, {
      task,
      checklistTemplate,
      existingResult,
      panels,
      panelChecklists,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id])

  const site = task.site_service?.site
  const serviceType = task.site_service?.service_type
  const systemType = serviceType?.system_type
  const clientName = task.client?.name ?? site?.client?.name ?? null
  const isAdminOrOffice = profile.role === 'admin' || profile.role === 'office'
  // Sub-contractors are external: they execute the checklist, add photos/notes,
  // book/rebook and submit, but never see internal-only surfaces (parts pickers,
  // costs/labour, transfers, further-works escalation, internal report actions).
  const canSeeInternal = profile.role !== 'subcontractor'
  // Non-recurring = reactive / planned one-off work (or an ad-hoc call with no
  // service type). Only these capture an on-site client name + signature; recurring
  // PPM visits never prompt for one.
  const isNonRecurring = serviceType ? resolveCallKind(serviceType) !== 'recurring' : true

  // Quick-assign (or reassign) this call to an engineer straight from the summary.
  const assignEngineer = async (value: string) => {
    const engineerId = value === 'unassigned' ? null : value
    setAssigning(true)
    await supabase
      .from('tasks')
      .update({ assigned_engineer_id: engineerId, updated_at: new Date().toISOString() })
      .eq('id', task.id)
    setAssignedEngineerId(engineerId)
    setAssigning(false)
    router.refresh()
  }

  // Calculate overall status based on checklist results
  const calculateOverallStatus = (): TaskResultStatus => {
    if (checklistResults.length === 0) return 'pass'
    
    // Advisory items are observations, not pass/fail outcomes, so they never
    // affect the overall result (a report of all passes + advisories is a pass).
    // N/A items carry no answer and are likewise excluded. Conditional follow-up
    // rows (parent_item_id set) are supplementary detail and never drive the
    // overall pass/fail either.
    const passFailItems = checklistResults.filter(
      (r) => r.type === 'pass_fail' && !r.advisory && !r.na && !r.parent_item_id,
    )
    if (passFailItems.length === 0) return 'pass'
    
    const allPassed = passFailItems.every((r) => r.passed === true)
    const allFailed = passFailItems.every((r) => r.passed === false)
    
    if (allPassed) return 'pass'
    if (allFailed) return 'fail'
    return 'partial'
  }

  const handleStartTask = async () => {
    // Lone workers must be on shift (safety check-ins active) before starting.
    if (!(await ensureOnShift())) return

    const now = new Date()

    await supabase
      .from('tasks')
      .update({
        status: 'in_progress',
        started_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', task.id)

    // Auto-populate the on-site Start Time with the moment work begins so the
    // engineer doesn't have to set it manually. Never overwrite an existing
    // value (e.g. when a paused/reopened call is restarted).
    setTestingStartTime((prev) => prev ?? now)

    setStatus('in_progress')
    router.refresh()
  }

  // Total anticipated minutes from the days + hours inputs (0 when neither set).
  const durationMinutes =
    (parseInt(bookedDays || '0', 10) || 0) * WORKDAY_MINUTES +
    (parseInt(bookedHours || '0', 10) || 0) * 60

  const handleBookVisit = async () => {
    if (!bookedDate) {
      setBookError('Please choose a date for the visit.')
      return
    }
    if (durationMinutes < 0) {
      setBookError('Please enter a valid duration.')
      return
    }
    setBookError(null)
    setBookSaved(false)
    setBookingVisit(true)

    // When a start time and a same-day duration are set, also store an end time
    // so single-day bookings still show a precise slot on the calendar.
    let endTime: string | null = null
    if (bookedStart && durationMinutes > 0 && durationMinutes <= WORKDAY_MINUTES) {
      const [h, m] = bookedStart.split(':').map((n) => parseInt(n, 10))
      const endMinutes = h * 60 + m + durationMinutes
      if (endMinutes < 24 * 60) {
        const eh = Math.floor(endMinutes / 60)
        const em = endMinutes % 60
        endTime = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
      }
    }

    const { error } = await supabase
      .from('tasks')
      .update({
        scheduled_date: bookedDate,
        booked_start_time: bookedStart || null,
        booked_end_time: endTime,
        booked_duration_minutes: durationMinutes > 0 ? durationMinutes : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', task.id)

    setBookingVisit(false)
    if (error) {
      setBookError('Could not book the visit. Please try again.')
      return
    }
    setBookSaved(true)
    router.refresh()
  }

  const updateChecklistResult = (itemId: string, updates: Partial<ChecklistResult>) => {
    setChecklistResults((prev) =>
      prev.map((result) => {
        if (result.item_id === itemId) {
          const updated = { ...result, ...updates }
          // If it's a pass/fail type and value changed, derive passed from it —
          // unless the caller set `passed` explicitly (e.g. the Advisory action,
          // which sends value:true but passed:null).
          if (updated.type === 'pass_fail' && 'value' in updates && !('passed' in updates)) {
            updated.passed = updates.value as boolean
          }
          return updated
        }
        return result
      })
    )
  }

  // Per-item photo capture for conditional "require photo" requirements. Reuses
  // the task attachments upload + private-blob serve route, so no new storage is
  // introduced. Tracked by the row's item_id so multiple rows upload independently.
  const [photoUploadingId, setPhotoUploadingId] = useState<string | null>(null)
  const uploadItemPhoto = async (row: ChecklistResult, file: File) => {
    setPhotoUploadingId(row.item_id)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('task_id', task.id)
      const res = await fetch('/api/tasks/attachments/upload', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error('upload failed')
      const { attachment } = await res.json()
      const photo = {
        id: attachment.id as string,
        name: attachment.name as string,
        url: `/api/tasks/attachments/file?id=${attachment.id}`,
      }
      updateChecklistResult(row.item_id, { photos: [...(row.photos || []), photo] })
    } catch {
      // Non-fatal: the required-photo submit guard keeps the engineer honest.
    } finally {
      setPhotoUploadingId(null)
    }
  }
  const removeItemPhoto = (row: ChecklistResult, photoId: string) => {
    updateChecklistResult(row.item_id, {
      photos: (row.photos || []).filter((p) => p.id !== photoId),
    })
  }

  // Collects human-readable descriptions of any active conditional requirement
  // that has not been satisfied. Empty array = safe to submit.
  const collectSubmitBlockers = (): string[] => {
    const blockers: string[] = []
    for (const row of checklistResults) {
      if (row.parent_item_id) continue // only parent rows own conditions
      const where = row.panel_name ? `${row.panel_name} — ${row.label}` : row.label
      for (const cond of row.conditions || []) {
        if (!isConditionActive(row, cond)) continue
        if (cond.requireNote && !(row.notes && row.notes.trim())) {
          blockers.push(`${where}: add a note`)
        }
        if (cond.requirePhoto && !(row.photos && row.photos.length > 0)) {
          blockers.push(`${where}: attach a photo`)
        }
        const children = checklistResults.filter(
          (r) => r.parent_item_id === row.item_id && r.condition_id === cond.id,
        )
        for (const child of children) {
          if (child.required && isChildUnanswered(child)) {
            blockers.push(`${where}: answer "${child.label}"`)
          }
        }
      }
    }
    return blockers
  }

  const [submitBlockers, setSubmitBlockers] = useState<string[]>([])
  // Complete the call. Validates conditional requirements first; there is no
  // confirmation dialog — completing returns the engineer straight to Calls
  // (or the nearby-calls prompt). handleSubmit is hoisted below.
  const handleAttemptSubmit = () => {
    const blockers = collectSubmitBlockers()
    if (blockers.length > 0) {
      setSubmitBlockers(blockers)
      checklistCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    setSubmitBlockers([])
    void handleSubmit()
  }
  const checklistCardRef = useRef<HTMLDivElement>(null)

  const handleSave = async () => {
    setSaving(true)

    const resultData = {
      task_id: task.id,
      checklist_results: checklistResults,
      overall_status: calculateOverallStatus(),
      engineer_notes: engineerNotes,
      client_signature: clientSignature,
      client_signature_name: clientSignatureName.trim() || null,
      testing_start_time: testingStartTime?.toISOString(),
      testing_end_time: testingEndTime?.toISOString(),
      photos: existingResult?.photos || [],
      updated_at: new Date().toISOString(),
    }

    const { id, queued } = await persistTaskResult(supabase, {
      rowId: resultIdRef.current,
      data: resultData,
      baseUpdatedAt: baseUpdatedAtRef.current,
    })
    resultIdRef.current = id
    setResultId(id)
    if (!queued) baseUpdatedAtRef.current = resultData.updated_at
    await offline.refresh()

    setSaving(false)
    // Offline: the draft is safe on-device; skip the RSC refresh (it would fail).
    if (!queued) router.refresh()
  }

  const handleSubmit = async () => {
    // Safety net: never run the completion cascade with unmet conditional
    // requirements, even if the dialog was somehow opened.
    const blockers = collectSubmitBlockers()
    if (blockers.length > 0) {
      setSubmitBlockers(blockers)
      setShowSubmitDialog(false)
      checklistCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    setSubmitting(true)

    const overallStatus = calculateOverallStatus()
    const resultData = {
      task_id: task.id,
      checklist_results: checklistResults,
      overall_status: overallStatus,
      engineer_notes: engineerNotes,
      client_signature: clientSignature,
      client_signature_name: clientSignatureName.trim() || null,
      testing_start_time: testingStartTime?.toISOString(),
      testing_end_time: testingEndTime?.toISOString(),
      photos: existingResult?.photos || [],
      updated_at: new Date().toISOString(),
    }

    // Offline spike boundary: final submission runs a multi-step completion
    // cascade (mark task complete, roll the recurring visit, email the report).
    // We deliberately do NOT run that offline. Instead we queue the checklist so
    // no work is lost, then ask the engineer to submit once back online. (Making
    // the full cascade offline-safe is Phase 2/3 work.)
    if (!isOnline()) {
      const { id } = await persistTaskResult(supabase, {
        rowId: resultIdRef.current,
        data: resultData,
        baseUpdatedAt: baseUpdatedAtRef.current,
      })
      resultIdRef.current = id
      setResultId(id)
      await offline.refresh()
      setSubmitting(false)
      setShowSubmitDialog(false)
      setOfflineSubmitBlocked(true)
      return
    }

    // Save/update task result
    const persisted = await persistTaskResult(supabase, {
      rowId: resultIdRef.current,
      data: resultData,
      baseUpdatedAt: baseUpdatedAtRef.current,
    })
    resultIdRef.current = persisted.id
    setResultId(persisted.id)
    baseUpdatedAtRef.current = resultData.updated_at

    // Mark task as completed
    const completedAt = new Date()
    await supabase
      .from('tasks')
      .update({
        status: 'completed',
        completed_at: completedAt.toISOString(),
        updated_at: completedAt.toISOString(),
      })
      .eq('id', task.id)

    // Update site service with last service date
    const lastServiceDate = completedAt.toISOString().split('T')[0]
    await supabase
      .from('site_services')
      .update({
        last_service_date: lastServiceDate,
      })
      .eq('id', task.site_service_id)

    // Roll the service's projected "next due" date forward on completion so the
    // office can see when the next visit falls due. NOTE: we deliberately do NOT
    // create the next call here — future calls are only ever created via the
    // office "Generate Calls" workflow.
    const { data: siteServiceData } = await supabase
      .from('site_services')
      .select(`
        frequency_value,
        frequency_unit,
        anchor_next_to_schedule,
        active,
        site:sites!inner(id, status),
        service_type:service_types!inner(id, status)
      `)
      .eq('id', task.site_service_id)
      .single()

    const siteRel = (siteServiceData as { site?: { status?: string } | { status?: string }[] } | null)?.site
    const siteStatus = Array.isArray(siteRel) ? siteRel[0]?.status : siteRel?.status
    const serviceRel = (siteServiceData as { service_type?: { status?: string } | { status?: string }[] } | null)?.service_type
    const serviceStatus = Array.isArray(serviceRel) ? serviceRel[0]?.status : serviceRel?.status
    const serviceActive = (siteServiceData as { active?: boolean } | null)?.active !== false
    if (siteServiceData && serviceActive && siteStatus === 'live' && serviceStatus !== 'dead') {
      // Calculate next scheduled date based on frequency + anchor preference
      const nextDate = computeNextScheduledDate(siteServiceData, {
        completedAt,
        scheduledDate: task.scheduled_date,
      })
      const nextDateStr = toDateString(nextDate)

      // Update next_service_date on the site_service (projected "next due" only —
      // no call is created).
      await supabase
        .from('site_services')
        .update({
          next_service_date: nextDateStr,
        })
        .eq('id', task.site_service_id)
    }

    // Terminal side-effects: send the completion report email (per-service
    // emails if set, otherwise site-level) and run per-visit "invoice on
    // completion" billing. Both are best-effort and idempotent server-side (the
    // recurring due queue backstops billing), so we DON'T await them — that was
    // adding ~10s to the engineer's completion before the UI navigated away.
    // `keepalive` lets the requests finish even if the page unloads, and the
    // client-side router navigation below won't interrupt in-flight fetches.
    void fetch('/api/send-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id }),
      keepalive: true,
    })
      .then(async (reportRes) => {
        if (!reportRes.ok) {
          const data = await reportRes.json().catch(() => ({}))
          console.error('[v0] Report email failed:', data?.error)
        }
      })
      .catch((err) => console.error('[v0] Report email request error:', err))

    void fetch('/api/tasks/complete-billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id }),
      keepalive: true,
    }).catch((err) => console.error('[v0] Visit billing request error:', err))

    setShowSubmitDialog(false)

    // Before leaving, check for overdue / due-soon calls at other nearby sites so
    // the engineer can take them on while they're in the area (avoids sending a
    // second engineer out later). Best-effort — never block completion on it.
    // Internal engineers only — sub-contractors go straight back to Calls.
    if (profile.role === 'engineer') {
      try {
        const res = await findNearbyOverdueCalls({ fromTaskId: task.id })
        if (res.ok && res.calls && res.calls.length > 0) {
          setNearbyCalls(res.calls)
          setShowNearbyPrompt(true)
          setSubmitting(false)
          return
        }
      } catch (err) {
        console.error('[v0] Nearby calls lookup failed:', err)
      }
    }

    setSubmitting(false)
    router.push('/dashboard/schedule')
    router.refresh()
  }

  // Leave the completed task once the engineer dismisses the nearby-calls prompt.
  const handleNearbyPromptClose = () => {
    setShowNearbyPrompt(false)
    router.push('/dashboard/schedule')
    router.refresh()
  }

  // Sub-contractors execute their allocated tasks exactly like engineers.
  const isEngineer = profile.role === 'engineer' || profile.role === 'subcontractor'
  // Paused inspections are read-only until resumed (see PauseResumeControls).
  const canEdit = isEngineer && status !== 'completed' && status !== 'cancelled' && status !== 'paused'

  // Parts have a broader edit rule than the checklist: office/admin can correct
  // parts at any status (incl. after completion), while the assigned engineer
  // can edit while the call is actively in progress. RLS enforces this too.
  const canManageParts = isAdminOrOffice || canEdit

  // Persist the current inputs to the backing task_results row (creating it on
  // first save). Shared by the debounced autosave and the visibility flush.
  const persistDraft = useCallback(async () => {
    const resultData = {
      task_id: task.id,
      checklist_results: checklistResults,
      overall_status: calculateOverallStatus(),
      engineer_notes: engineerNotes,
      client_signature: clientSignature,
      client_signature_name: clientSignatureName.trim() || null,
      testing_start_time: testingStartTime?.toISOString() ?? null,
      testing_end_time: testingEndTime?.toISOString() ?? null,
      photos: existingResult?.photos || [],
      updated_at: new Date().toISOString(),
    }
    const { id, queued } = await persistTaskResult(supabase, {
      rowId: resultIdRef.current,
      data: resultData,
      baseUpdatedAt: baseUpdatedAtRef.current,
    })
    resultIdRef.current = id
    setResultId(id)
    if (!queued) baseUpdatedAtRef.current = resultData.updated_at
    void offline.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checklistResults, engineerNotes, clientSignature, clientSignatureName, testingStartTime, testingEndTime, existingResult, task.id, supabase])

  // Draft autosave. As the engineer fills in the checklist and notes, persist a
  // draft to task_results after a short pause. This means accidentally leaving
  // the page (e.g. swiping off on mobile to reach an off-screen button) never
  // loses entered work — the server reloads this draft into `existingResult`
  // when the call is reopened.
  const autosaveArmed = useRef(false)
  useEffect(() => {
    if (!canEdit) return
    // Skip the first run so the untouched initial state isn't written back.
    if (!autosaveArmed.current) {
      autosaveArmed.current = true
      return
    }
    setAutoSaveState('saving')
    const handle = setTimeout(async () => {
      try {
        await persistDraft()
        setAutoSaveState('saved')
      } catch {
        setAutoSaveState('idle')
      }
    }, 1000)
    return () => clearTimeout(handle)
  }, [canEdit, persistDraft])

  // Flush the draft immediately when the tab is hidden or the page is being torn
  // down (covers mobile app-switching / swipe-away, where the debounce above may
  // not have fired yet). Best-effort — failures are non-fatal.
  useEffect(() => {
    if (!canEdit) return
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && autosaveArmed.current) void persistDraft()
    }
    const onPageHide = () => {
      if (autosaveArmed.current) void persistDraft()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [canEdit, persistDraft])

  // Group checklist rows by panel for rendering. Preserves the order results
  // were built in (per panel, then per item). Legacy results with no panel_id
  // fall into a single untitled group so older reports render unchanged.
  type ChecklistGroup = {
    key: string
    panelName: string | null
    panelLevel: string | null
    results: ChecklistResult[]
  }
  const checklistGroups = (() => {
  const groups: ChecklistGroup[] = []
  const byKey = new Map<string, ChecklistGroup>()
  for (const result of checklistResults) {
      // Conditional follow-up rows are rendered inline beneath their parent, not
      // as standalone checklist entries.
      if (result.parent_item_id) continue
      const key = result.panel_id ?? '__none__'
      let group = byKey.get(key)
      if (!group) {
        group = {
          key,
          panelName: result.panel_name ?? null,
          panelLevel: result.panel_level ?? null,
          results: [],
        }
        byKey.set(key, group)
        groups.push(group)
      }
      group.results.push(result)
    }
    return groups
  })()

  return (
    <div
      className={cn(
        'mx-auto max-w-3xl space-y-6',
        // Extra room so the fixed mobile action bar (raised above the bottom nav)
        // never hides the last cards while a task is in progress.
        status === 'in_progress' ? 'pb-44 lg:pb-6' : 'pb-6',
      )}
    >
      <TaskHeader
        task={task}
        status={status}
        canCreateDocument={isAdminOrOffice}
        referenceNumber={existingResult?.reference_number ?? null}
      />

      <PauseResumeControls task={task} status={status} onStatusChange={setStatus} />

      {preAttendance}

      {/* Call Summary — only the details the header doesn't already show
          (system, service, address and dates all live in the header). */}
      {(clientName || isAdminOrOffice) && (
        <Card>
          <CardContent className="space-y-3 p-4 text-sm">
            {clientName && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Client</span>
                <span className="inline-flex items-center gap-1.5 text-right font-medium">
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {clientName}
                </span>
              </div>
            )}
            {isAdminOrOffice && (
              <div className="space-y-1.5">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <UserPlus className="h-3.5 w-3.5" />
                  Assign engineer
                </span>
                <Select
                  value={assignedEngineerId ?? 'unassigned'}
                  onValueChange={assignEngineer}
                  disabled={assigning}
                >
                  <SelectTrigger>
                    {assigning ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
                      </span>
                    ) : (
                      <SelectValue placeholder="Assign to..." />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {engineers.map((eng) => (
                      <SelectItem key={eng.id} value={eng.id}>
                        {eng.full_name || eng.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Site Details (collapsible — address & contacts are reference detail) */}
      <CollapsibleCard
        icon={<Building2 className="h-5 w-5 shrink-0" />}
        title="Site Details"
        description={site?.address || undefined}
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <span>{site?.address}</span>
          </div>
          {site?.contact_name && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Contact:</span>
              <span>{site.contact_name}</span>
            </div>
          )}
          {site?.contact_phone && (
            <a href={`tel:${site.contact_phone}`} className="flex items-center gap-2 text-sm text-primary">
              <Phone className="h-4 w-4" />
              {site.contact_phone}
            </a>
          )}
          {site?.contact_email && (
            <a href={`mailto:${site.contact_email}`} className="flex items-center gap-2 text-sm text-primary">
              <Mail className="h-4 w-4" />
              {site.contact_email}
            </a>
          )}
        </div>
      </CollapsibleCard>

      {/* Client reference links scoped to this task's system/service */}
      {clientLinks.length > 0 && (
        <CollapsibleCard
          icon={<Link2 className="h-5 w-5 shrink-0" />}
          title="Reference links"
          description="Resources provided by the client for this visit."
        >
          <div className="space-y-2">
            {clientLinks.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start justify-between gap-3 rounded-md border bg-background px-3 py-2 transition-colors hover:border-primary hover:bg-primary/5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{link.label}</p>
                  {link.description && (
                    <p className="text-xs text-muted-foreground">{link.description}</p>
                  )}
                  <p className="truncate text-xs text-muted-foreground">{link.url}</p>
                </div>
                <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              </a>
            ))}
          </div>
        </CollapsibleCard>
      )}

      {/* Start Task — the primary action, kept prominent and above the
          optional booking panel so engineers can begin in one tap. */}
      {status === 'pending' && canEdit && (
        <Button
          onClick={handleStartTask}
          disabled={checkingShift}
          size="lg"
          className="h-14 w-full text-base font-bold"
        >
          {checkingShift ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <Play className="mr-2 h-5 w-5" />
          )}
          Start Inspection
        </Button>
      )}

      {/* Book Visit (collapsed by default — only needed when rescheduling) */}
      {canEdit && (
        <CollapsibleCard
          icon={<Calendar className="h-5 w-5 shrink-0" />}
          title="Book Visit"
          description="Set the date and time to add this visit to your calendar."
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="booked-date">Date</Label>
              <Input
                id="booked-date"
                type="date"
                value={bookedDate}
                onChange={(e) => {
                  setBookedDate(e.target.value)
                  setBookSaved(false)
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booked-start">Start time (optional)</Label>
              <Input
                id="booked-start"
                type="time"
                value={bookedStart}
                onChange={(e) => {
                  setBookedStart(e.target.value)
                  setBookSaved(false)
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Anticipated time to complete</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Input
                    id="booked-days"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder="0"
                    value={bookedDays}
                    onChange={(e) => {
                      setBookedDays(e.target.value)
                      setBookSaved(false)
                    }}
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id="booked-hours"
                    type="number"
                    min={0}
                    max={23}
                    inputMode="numeric"
                    placeholder="0"
                    value={bookedHours}
                    onChange={(e) => {
                      setBookedHours(e.target.value)
                      setBookSaved(false)
                    }}
                  />
                  <span className="text-sm text-muted-foreground">hours</span>
                </div>
              </div>
            </div>
            {bookError ? (
              <p className="text-sm text-destructive">{bookError}</p>
            ) : bookSaved ? (
              <p className="text-sm text-green-600">Visit booked and added to your calendar.</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {durationMinutes > 0
                  ? `Blocks out ${formatDuration(durationMinutes)} on the calendar${
                      Math.ceil(durationMinutes / WORKDAY_MINUTES) > 1
                        ? ` (about ${Math.ceil(durationMinutes / WORKDAY_MINUTES)} days)`
                        : ''
                    }. A working day counts as 8 hours.`
                  : 'Leave the duration blank to book the whole day.'}
              </p>
            )}
            <Button onClick={handleBookVisit} disabled={bookingVisit} className="w-full sm:w-auto">
              {bookingVisit ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Booking...
                </>
              ) : (
                <>
                  <Calendar className="mr-2 h-4 w-4" />
                  Book Visit
                </>
              )}
            </Button>
          </div>
        </CollapsibleCard>
      )}

      {/* Checklist */}
      {(status === 'in_progress' || status === 'completed') && (
        <>
          {/* Time Recording */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Testing Time
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                  <Label>Start Time</Label>
                  <div className="flex gap-2">
                    <Input
                      type="datetime-local"
                      value={toDatetimeLocalValue(testingStartTime)}
                      onChange={(e) => setTestingStartTime(e.target.value ? new Date(e.target.value) : null)}
                      disabled={!canEdit}
                      className="min-w-0 flex-1"
                    />
                    {canEdit && (
                      <Button
                        type="button"
                        variant={testingStartTime ? 'outline' : 'default'}
                        size="sm"
                        onClick={() => setTestingStartTime(new Date())}
                        title="Set to now"
                        className="h-10 shrink-0 gap-1.5 px-3 text-xs"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Now
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <div className="flex gap-2">
                    <Input
                      type="datetime-local"
                      value={toDatetimeLocalValue(testingEndTime)}
                      onChange={(e) => setTestingEndTime(e.target.value ? new Date(e.target.value) : null)}
                      disabled={!canEdit}
                      className="min-w-0 flex-1"
                    />
                    {canEdit && (
                      <Button
                        type="button"
                        variant={testingEndTime ? 'outline' : 'default'}
                        size="sm"
                        onClick={() => setTestingEndTime(new Date())}
                        title="Set to now"
                        className="h-10 shrink-0 gap-1.5 px-3 text-xs"
                      >
                        <StopCircle className="h-3.5 w-3.5" />
                        Now
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              {testingStartTime && testingEndTime && (
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-sm">
                    <strong>Duration:</strong>{' '}
                    {Math.round((testingEndTime.getTime() - testingStartTime.getTime()) / 60000)} minutes
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card ref={checklistCardRef}>
            <CardHeader>
              <CardTitle>Inspection Checklist</CardTitle>
              <CardDescription>
                {checklistTemplate?.name || 'Standard inspection checklist'}
                {panels.length > 0 && ` · repeated for ${panels.length} panel${panels.length === 1 ? '' : 's'}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
            {submitBlockers.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <p className="flex items-center gap-2 font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Complete these before submitting:
                </p>
                <ul className="mt-2 list-disc space-y-0.5 pl-6 text-destructive">
                  {submitBlockers.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
            {checklistResults.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No checklist items configured for this service type
              </p>
            ) : (
              checklistGroups.map((group, groupIndex) => (
                <div key={group.key} className="space-y-4">
                  {group.panelName && (
                    <div className={`flex items-center gap-2 ${groupIndex > 0 ? 'pt-4' : ''}`}>
                      <Wrench className="h-4 w-4 text-primary" />
                      <h3 className="text-base font-semibold">{group.panelName}</h3>
                      {group.panelLevel && (
                        <Badge variant="secondary" className="ml-1">{group.panelLevel}</Badge>
                      )}
                      {group.results.some((r) => r.type === 'pass_fail' && r.passed === false) && (
                        <Badge variant="destructive" className="ml-1">Defect</Badge>
                      )}
                    </div>
                  )}
                  {group.results.map((result, index) => (
                    <div key={result.item_id} className="space-y-2">
                      {index > 0 && <Separator />}
                      <div className="pt-2">
                        <Label className="text-base font-medium">{result.label}</Label>

                        {result.type === 'pass_fail' && (
                          <div className="grid grid-cols-4 gap-2 mt-3">
                            <Button
                              type="button"
                              variant={result.passed === true && !result.advisory && !result.na ? 'default' : 'outline'}
                              onClick={() => updateChecklistResult(result.item_id, { value: true, passed: true, advisory: false, na: false })}
                              disabled={!canEdit}
                              className={cn(
                                'h-12 flex-col gap-0.5 text-xs font-semibold',
                                result.passed === true && !result.advisory && !result.na
                                  ? 'bg-green-600 hover:bg-green-700 border-green-600'
                                  : 'hover:border-green-600 hover:text-green-700',
                              )}
                            >
                              <CheckCircle2 className="h-5 w-5" />
                              Pass
                            </Button>
                            <Button
                              type="button"
                              variant={result.advisory && !result.na ? 'default' : 'outline'}
                              onClick={() => updateChecklistResult(result.item_id, { value: true, passed: null, advisory: true, na: false })}
                              disabled={!canEdit}
                              className={cn(
                                'h-12 flex-col gap-0.5 text-xs font-semibold',
                                result.advisory && !result.na
                                  ? 'bg-amber-500 text-white hover:bg-amber-600 border-amber-500'
                                  : 'hover:border-amber-500 hover:text-amber-600',
                              )}
                            >
                              <AlertTriangle className="h-5 w-5" />
                              Advisory
                            </Button>
                            <Button
                              type="button"
                              variant={result.passed === false && !result.advisory && !result.na ? 'default' : 'outline'}
                              onClick={() => updateChecklistResult(result.item_id, { value: false, passed: false, advisory: false, na: false })}
                              disabled={!canEdit}
                              className={cn(
                                'h-12 flex-col gap-0.5 text-xs font-semibold',
                                result.passed === false && !result.advisory && !result.na
                                  ? 'bg-destructive hover:bg-destructive/90 border-destructive'
                                  : 'hover:border-destructive hover:text-destructive',
                              )}
                            >
                              <XCircle className="h-5 w-5" />
                              Fail
                            </Button>
                            <Button
                              type="button"
                              variant={result.na ? 'default' : 'outline'}
                              onClick={() => updateChecklistResult(result.item_id, { value: false, passed: null, advisory: false, na: true })}
                              disabled={!canEdit}
                              className={cn(
                                'h-12 flex-col gap-0.5 text-xs font-semibold',
                                result.na
                                  ? 'bg-muted-foreground text-background hover:bg-muted-foreground/90 border-muted-foreground'
                                  : 'hover:border-muted-foreground hover:text-foreground',
                              )}
                            >
                              <Ban className="h-5 w-5" />
                              N/A
                            </Button>
                          </div>
                        )}

                        {result.type === 'checkbox' && (
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={result.value as boolean}
                                onCheckedChange={(checked) =>
                                  updateChecklistResult(result.item_id, { value: checked as boolean, na: false })
                                }
                                disabled={!canEdit || result.na}
                              />
                              <span className={cn('text-sm', result.na && 'text-muted-foreground line-through')}>
                                Completed
                              </span>
                            </div>
                            <NaToggle
                              active={!!result.na}
                              disabled={!canEdit}
                              onToggle={() =>
                                updateChecklistResult(result.item_id, {
                                  na: !result.na,
                                  ...(result.na ? {} : { value: false }),
                                })
                              }
                            />
                          </div>
                        )}

                        {result.type === 'text' && (
                          <div className="mt-2 flex items-center gap-2">
                            <Input
                              value={result.na ? '' : (result.value as string)}
                              onChange={(e) => updateChecklistResult(result.item_id, { value: e.target.value, na: false })}
                              placeholder={result.na ? 'Not applicable' : 'Enter value...'}
                              disabled={!canEdit || result.na}
                            />
                            <NaToggle
                              active={!!result.na}
                              disabled={!canEdit}
                              onToggle={() =>
                                updateChecklistResult(result.item_id, {
                                  na: !result.na,
                                  ...(result.na ? {} : { value: '' }),
                                })
                              }
                            />
                          </div>
                        )}

                        {result.type === 'number' && (
                          <div className="mt-2 flex items-center gap-2">
                            <Input
                              type="number"
                              value={result.na ? '' : (result.value as number)}
                              onChange={(e) => updateChecklistResult(result.item_id, { value: parseFloat(e.target.value) || 0, na: false })}
                              placeholder={result.na ? 'Not applicable' : 'Enter value...'}
                              disabled={!canEdit || result.na}
                            />
                            <NaToggle
                              active={!!result.na}
                              disabled={!canEdit}
                              onToggle={() =>
                                updateChecklistResult(result.item_id, {
                                  na: !result.na,
                                  ...(result.na ? {} : { value: 0 }),
                                })
                              }
                            />
                          </div>
                        )}

                        {/* Notes for failed and advisory items */}
                        {result.type === 'pass_fail' && (result.passed === false || result.advisory) && (
                          <div className="mt-2 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-muted-foreground">
                                {result.advisory ? 'Advisory note' : 'Defect description'}
                              </span>
                              {canEdit && (
                                <ReportNotesAssist
                                  label="AI describe"
                                  input={{
                                    mode: 'defect',
                                    serviceType: serviceType?.name,
                                    systemType: systemType?.name,
                                    visitType: task.visit_type?.name,
                                    siteName: site?.name,
                                    itemLabel: group.panelName ? `${group.panelName} — ${result.label}` : result.label,
                                  }}
                                  onInsert={(text, applyMode) =>
                                    updateChecklistResult(result.item_id, {
                                      notes:
                                        applyMode === 'replace' || !result.notes
                                          ? text
                                          : `${result.notes}\n${text}`,
                                    })
                                  }
                                />
                              )}
                            </div>
                            <Textarea
                              value={result.notes || ''}
                              onChange={(e) => updateChecklistResult(result.item_id, { notes: e.target.value })}
                              placeholder={result.advisory ? 'Describe the observation...' : 'Describe the issue...'}
                              disabled={!canEdit}
                            />
                          </div>
                        )}

                        {/* Conditional follow-ups: revealed only while a rule on
                            this item is active, requiring extra info before submit. */}
                        {(result.conditions || [])
                          .filter((cond) => isConditionActive(result, cond))
                          .map((cond) => {
                            const children = group.results.length
                              ? checklistResults.filter(
                                  (r) =>
                                    r.parent_item_id === result.item_id &&
                                    r.condition_id === cond.id,
                                )
                              : []
                            const needNote =
                              cond.requireNote && result.type !== 'pass_fail'
                            const needNoteMissing =
                              cond.requireNote && !(result.notes && result.notes.trim())
                            const needPhotoMissing =
                              cond.requirePhoto && !(result.photos && result.photos.length > 0)
                            return (
                              <div
                                key={cond.id}
                                className="mt-3 space-y-3 rounded-md border-l-2 border-amber-400 bg-amber-50 p-3 dark:bg-amber-950/20"
                              >
                                <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                                  <CornerDownRight className="h-3.5 w-3.5" />
                                  Follow-up required
                                </p>

                                {/* Extra note field only when the parent isn't a
                                    pass/fail (which already shows its own note box). */}
                                {needNote && (
                                  <div className="space-y-1">
                                    <span className="text-xs font-medium text-muted-foreground">
                                      Note {needNoteMissing && <span className="text-destructive">*</span>}
                                    </span>
                                    <Textarea
                                      value={result.notes || ''}
                                      onChange={(e) =>
                                        updateChecklistResult(result.item_id, {
                                          notes: e.target.value,
                                        })
                                      }
                                      placeholder="Add the required note..."
                                      disabled={!canEdit}
                                    />
                                  </div>
                                )}

                                {/* Required-photo capture. */}
                                {cond.requirePhoto && (
                                  <div className="space-y-2">
                                    <span className="text-xs font-medium text-muted-foreground">
                                      Photo {needPhotoMissing && <span className="text-destructive">*</span>}
                                    </span>
                                    <div className="flex flex-wrap items-center gap-2">
                                      {(result.photos || []).map((p) => (
                                        <div
                                          key={p.id}
                                          className="relative h-16 w-16 overflow-hidden rounded-md border bg-muted"
                                        >
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img
                                            src={p.url || '/placeholder.svg'}
                                            alt={p.name}
                                            className="h-full w-full object-cover"
                                          />
                                          {canEdit && (
                                            <button
                                              type="button"
                                              onClick={() => removeItemPhoto(result, p.id)}
                                              className="absolute right-0 top-0 rounded-bl bg-black/60 p-0.5 text-white"
                                              aria-label={`Remove ${p.name}`}
                                            >
                                              <X className="h-3 w-3" />
                                            </button>
                                          )}
                                        </div>
                                      ))}
                                      {canEdit && (
                                        <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground hover:border-primary hover:text-primary">
                                          {photoUploadingId === result.item_id ? (
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                          ) : (
                                            <Camera className="h-5 w-5" />
                                          )}
                                          <span className="text-[10px]">Add</span>
                                          <input
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            className="hidden"
                                            disabled={photoUploadingId === result.item_id}
                                            onChange={(e) => {
                                              const file = e.target.files?.[0]
                                              if (file) uploadItemPhoto(result, file)
                                              e.target.value = ''
                                            }}
                                          />
                                        </label>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Follow-up questions. */}
                                {children.map((child) => (
                                  <div key={child.item_id} className="space-y-1.5">
                                    <Label className="text-sm">
                                      {child.label}
                                      {child.required && (
                                        <span className="ml-1 text-destructive">*</span>
                                      )}
                                    </Label>
                                    {child.type === 'pass_fail' && (
                                      <div className="grid grid-cols-2 gap-2">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant={child.passed === true ? 'default' : 'outline'}
                                          onClick={() =>
                                            updateChecklistResult(child.item_id, {
                                              value: true,
                                              passed: true,
                                            })
                                          }
                                          disabled={!canEdit}
                                          className={cn(
                                            child.passed === true &&
                                              'bg-green-600 hover:bg-green-700 border-green-600',
                                          )}
                                        >
                                          Pass
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant={child.passed === false ? 'default' : 'outline'}
                                          onClick={() =>
                                            updateChecklistResult(child.item_id, {
                                              value: false,
                                              passed: false,
                                            })
                                          }
                                          disabled={!canEdit}
                                          className={cn(
                                            child.passed === false &&
                                              'bg-destructive hover:bg-destructive/90 border-destructive',
                                          )}
                                        >
                                          Fail
                                        </Button>
                                      </div>
                                    )}
                                    {child.type === 'checkbox' && (
                                      <div className="flex items-center gap-2">
                                        <Checkbox
                                          checked={child.value as boolean}
                                          onCheckedChange={(checked) =>
                                            updateChecklistResult(child.item_id, {
                                              value: checked as boolean,
                                            })
                                          }
                                          disabled={!canEdit}
                                        />
                                        <span className="text-sm">Completed</span>
                                      </div>
                                    )}
                                    {child.type === 'text' && (
                                      <Input
                                        value={child.value as string}
                                        onChange={(e) =>
                                          updateChecklistResult(child.item_id, {
                                            value: e.target.value,
                                          })
                                        }
                                        placeholder="Enter value..."
                                        disabled={!canEdit}
                                      />
                                    )}
                                    {child.type === 'number' && (
                                      <Input
                                        type="number"
                                        value={child.value as number}
                                        onChange={(e) =>
                                          updateChecklistResult(child.item_id, {
                                            value: parseFloat(e.target.value) || 0,
                                          })
                                        }
                                        placeholder="Enter value..."
                                        disabled={!canEdit}
                                      />
                                    )}
                                  </div>
                                ))}
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Suggested parts (internal) — shown when a defect/failure is present.
            Hidden from external sub-contractors. */}
        {canSeeInternal &&
          checklistResults.some((r) => r.type === 'pass_fail' && r.passed === false) && (
            <SuggestedPartsPicker taskId={task.id} canEdit={canEdit} />
          )}

        {/* Parts used on this call (internal) — hidden from sub-contractors */}
        {canSeeInternal && <CallPartsPicker taskId={task.id} canEdit={canManageParts} />}
        </>
      )}

      {/* Engineer Notes */}
      {(status === 'in_progress' || status === 'completed') && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle>Notes</CardTitle>
                <CardDescription>Add any additional observations or comments</CardDescription>
                {canEdit && autoSaveState !== 'idle' && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {autoSaveState === 'saving' ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Saving draft…
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-3 w-3 text-primary" />
                        Draft saved — your progress is kept if you leave
                      </>
                    )}
                  </p>
                )}
                {canEdit && (
                  <div className="mt-1.5">
                    <OfflineStatusBadge state={offline} />
                  </div>
                )}
              </div>
              {canEdit && (
                <ReportNotesAssist
                  label="AI summary"
                  input={{
                    mode: 'summary',
                    serviceType: serviceType?.name,
                    systemType: systemType?.name,
                    visitType: task.visit_type?.name,
                    siteName: site?.name,
                    existingNotes: engineerNotes,
                    checklist: checklistResults.map((r) => ({
                      label: r.label,
                      type: r.type,
                      value: r.value,
                          passed: r.passed,
                          advisory: r.advisory,
                          na: r.na,
                          notes: r.notes,
                        })),
                  }}
                  onInsert={(text, applyMode) =>
                    setEngineerNotes((prev) =>
                      applyMode === 'replace' || !prev ? text : `${prev}\n${text}`,
                    )
                  }
                />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              value={engineerNotes}
              onChange={(e) => setEngineerNotes(e.target.value)}
              placeholder="Additional notes..."
              rows={4}
              disabled={!canEdit}
            />
          </CardContent>
        </Card>
      )}

      {/* Client sign-off — non-recurring calls only. Captures the on-site
          representative's printed name + signature, shown on the report. */}
      {(status === 'in_progress' || status === 'completed') && isNonRecurring && (
        <Card>
          <CardHeader>
            <CardTitle>Client sign-off</CardTitle>
            <CardDescription>
              Optional — capture the name and signature of the on-site
              representative confirming the work carried out.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="client-signature-name">Client / representative name</Label>
              <Input
                id="client-signature-name"
                value={clientSignatureName}
                onChange={(e) => setClientSignatureName(e.target.value)}
                placeholder="e.g. J. Smith (Facilities Manager)"
                disabled={!canEdit}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Signature</Label>
              {canEdit ? (
                clientSignature ? (
                  <div className="grid gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={clientSignature || '/placeholder.svg'}
                      alt="Captured client signature"
                      className="h-40 w-full rounded-md border border-input bg-background object-contain"
                    />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setClientSignature(null)}
                      >
                        Redraw signature
                      </Button>
                    </div>
                  </div>
                ) : (
                  <SignaturePad onChange={setClientSignature} />
                )
              ) : clientSignature ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={clientSignature || '/placeholder.svg'}
                  alt="Client signature"
                  className="h-40 w-full rounded-md border border-input bg-background object-contain"
                />
              ) : (
                <p className="text-sm text-muted-foreground">No signature captured.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      {status === 'in_progress' && canEdit && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-50 flex flex-col gap-2 border-t bg-background px-4 py-3 lg:relative lg:inset-x-auto lg:bottom-auto lg:z-auto lg:border-0 lg:p-0">
          {(offlineSubmitBlocked || !offline.online) && (
            <p className="flex items-center gap-1.5 rounded-md bg-amber-100 px-3 py-2 text-xs font-medium text-amber-900">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {offlineSubmitBlocked
                ? "You're offline — your checklist is saved on this device and will submit once you're back online."
                : "You're offline — you can keep working; submitting needs a connection."}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSave} disabled={saving} className="h-12 flex-1">
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Progress
                </>
              )}
            </Button>
            <Button onClick={handleAttemptSubmit} disabled={submitting} className="h-12 flex-1">
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Complete &amp; Submit
                </>
              )}
            </Button>
          </div>
          {/* Non-recurring calls (reactive / emergency / planned) can be flagged as
              needing further works, which raises a follow-up for review. Internal
              escalation — hidden from external sub-contractors. */}
          {canSeeInternal && isNonRecurringCall(task) && (
            <div className="flex">
              <FurtherWorksSheet
                taskId={task.id}
                isEmergency={task.is_emergency}
                onBeforeRaise={handleSave}
              />
            </div>
          )}
        </div>
      )}

      {/* Result Summary for completed tasks */}
      {status === 'completed' && existingResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {existingResult.overall_status === 'pass' ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : existingResult.overall_status === 'fail' ? (
                <XCircle className="h-5 w-5 text-destructive" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
              )}
              Inspection Result: {existingResult.overall_status.toUpperCase()}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Completed on {formatDateUK(task.completed_at)} at{' '}
              {formatTimeUK(task.completed_at)}
            </p>
            {/* Internal report management + chargeable review — hidden from
                external sub-contractors. */}
            {canSeeInternal && (
              <CompletedReportActions
                taskId={task.id}
                serviceName={serviceType?.name}
                emailSentAt={existingResult.email_sent_at}
                chargeable={task.chargeable}
                chargeReviewStatus={task.charge_review_status}
                chargeReason={task.charge_reason}
                clientRef={(task as any).client_ref ?? null}
                chargeInvoicedAt={(task as any).charge_invoiced_at ?? null}
                invoiceId={(task as any).invoice?.id ?? (task as any).invoice_id ?? null}
                invoiceNumber={(task as any).invoice?.invoice_number ?? null}
                canReview={profile.role === 'admin' || profile.role === 'office'}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Attachments */}
      <TaskAttachments taskId={task.id} profile={profile} />

      {/* Submit Confirmation Dialog */}
      {/* Lone-worker shift gate — blocks starting a call until on shift. */}
      {shiftGateDialog}

      {/* Post-completion: offer nearby overdue / due-soon calls to take on */}
      <NearbyCallsPrompt
        open={showNearbyPrompt}
        calls={nearbyCalls}
        onClose={handleNearbyPromptClose}
      />
    </div>
  )
}
