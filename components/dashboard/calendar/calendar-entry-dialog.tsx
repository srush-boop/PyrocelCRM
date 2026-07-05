'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Loader2, Trash2 } from 'lucide-react'
import type { CalendarEntryType, Profile, LeaveApprovalStatus, LeavePortion } from '@/lib/types/database'
import { ANNUAL_LEAVE_TYPE_ID } from '@/lib/constants/leave'

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

interface CalendarEntryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // When set, the dialog edits an existing entry; otherwise it creates one.
  entryId: string | null
  defaultDate: Date | null
  entryTypes: CalendarEntryType[]
  people: PersonOption[]
  departments: DepartmentOption[]
  profile: Profile
  canManageOthers: boolean
}

interface FormState {
  entry_type_id: string
  // Company-wide entries belong to no specific person (managers only).
  company_wide: boolean
  // People invited directly. The entry appears on each of their calendars.
  attendee_ids: string[]
  // Whole departments to invite; expanded to their members on save.
  department_ids: string[]
  title: string
  all_day: boolean
  start_date: string
  end_date: string
  start_time: string
  end_time: string
  is_public: boolean
  notes: string
  // Annual-leave duration model. 'full' = whole days, 'half' = half-day(s),
  // 'hours' = a custom number of hours (part-time staff). Ignored for other
  // entry types (stored as 'full').
  leave_mode: 'full' | 'half' | 'hours'
  // For half-day mode: which half of the first/last day the leave covers.
  start_portion: LeavePortion
  end_portion: LeavePortion
  // For hours mode: hours booked on the first/last day (kept as strings for the
  // numeric inputs).
  start_hours: string
  end_hours: string
}

// Sentinel for the "None (free text)" option, since Radix Select items cannot
// use an empty string value.
const NO_TYPE = '__none__'

function buildDefault(
  profile: Profile,
  entryTypes: CalendarEntryType[],
  defaultDate: Date | null,
): FormState {
  const d = defaultDate ?? new Date()
  const dateStr = format(d, 'yyyy-MM-dd')
  return {
    entry_type_id: entryTypes[0]?.id ?? '',
    company_wide: false,
    // Default to the creator so it lands on their own calendar.
    attendee_ids: [profile.id],
    department_ids: [],
    title: '',
    all_day: true,
    start_date: dateStr,
    end_date: dateStr,
    start_time: '09:00',
    end_time: '17:00',
    is_public: false,
    notes: '',
    leave_mode: 'full',
    start_portion: 'full',
    end_portion: 'full',
    start_hours: '',
    end_hours: '',
  }
}

export function CalendarEntryDialog({
  open,
  onOpenChange,
  entryId,
  defaultDate,
  entryTypes,
  people,
  departments,
  profile,
  canManageOthers,
}: CalendarEntryDialogProps) {
  const router = useRouter()
  const supabase = createClient()

  const [form, setForm] = useState<FormState>(() =>
    buildDefault(profile, entryTypes, defaultDate),
  )
  const [saving, setSaving] = useState(false)
  const [loadingEntry, setLoadingEntry] = useState(false)
  // Whether the current user is allowed to edit/delete the loaded entry.
  const [editable, setEditable] = useState(true)
  // Approval status of the loaded leave entry (null for new/non-leave entries).
  const [approvalStatus, setApprovalStatus] = useState<LeaveApprovalStatus | null>(null)
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Reset / load whenever the dialog opens.
  useEffect(() => {
    if (!open) return
    setError(null)

    if (!entryId) {
      setForm(buildDefault(profile, entryTypes, defaultDate))
      setEditable(true)
      setApprovalStatus(null)
      setRejectionReason(null)
      return
    }

    // Editing: fetch the entry and its attendees.
    let cancelled = false
    setLoadingEntry(true)
    ;(async () => {
      const [{ data }, { data: attendees }] = await Promise.all([
        supabase.from('calendar_entries').select('*').eq('id', entryId).single(),
        supabase
          .from('calendar_entry_attendees')
          .select('user_id')
          .eq('entry_id', entryId),
      ])
      if (cancelled) return
      setLoadingEntry(false)
      if (!data) {
        setError('This entry could not be loaded.')
        return
      }
      const attendeeIds = (attendees || []).map((a) => a.user_id as string)
      const start = new Date(data.start_at)
      const end = new Date(data.end_at)
      // All-day entries are stored at UTC midnight, so read their calendar date
      // from UTC parts to avoid a timezone shift when re-opening the form.
      const dateStr = (dt: Date) =>
        data.all_day
          ? `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
          : format(dt, 'yyyy-MM-dd')
      const loadedStartPortion = (data.start_portion as LeavePortion | null) ?? 'full'
      const loadedEndPortion = (data.end_portion as LeavePortion | null) ?? 'full'
      const loadedMode: FormState['leave_mode'] =
        loadedStartPortion === 'hours' || loadedEndPortion === 'hours'
          ? 'hours'
          : loadedStartPortion === 'am' ||
              loadedStartPortion === 'pm' ||
              loadedEndPortion === 'am' ||
              loadedEndPortion === 'pm'
            ? 'half'
            : 'full'
      setForm({
        entry_type_id: data.entry_type_id,
        company_wide: data.user_id === null && attendeeIds.length === 0,
        attendee_ids: attendeeIds.length > 0 ? attendeeIds : data.user_id ? [data.user_id] : [],
        department_ids: [],
        title: data.title ?? '',
        all_day: data.all_day,
        start_date: dateStr(start),
        end_date: dateStr(end),
        start_time: format(start, 'HH:mm'),
        end_time: format(end, 'HH:mm'),
        is_public: data.is_public,
        notes: data.notes ?? '',
        leave_mode: loadedMode,
        start_portion: loadedStartPortion,
        end_portion: loadedEndPortion,
        start_hours: data.start_hours != null ? String(data.start_hours) : '',
        end_hours: data.end_hours != null ? String(data.end_hours) : '',
      })
      setApprovalStatus((data.approval_status as LeaveApprovalStatus | null) ?? null)
      setRejectionReason((data.rejection_reason as string | null) ?? null)
      // Managers can edit anything; engineers only their own entries they created.
      setEditable(
        canManageOthers ||
          (data.user_id === profile.id && data.created_by === profile.id),
      )
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entryId])

  const update = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

  const toggleAttendee = (id: string) =>
    setForm((f) => ({
      ...f,
      attendee_ids: f.attendee_ids.includes(id)
        ? f.attendee_ids.filter((x) => x !== id)
        : [...f.attendee_ids, id],
    }))

  const toggleDepartment = (id: string) =>
    setForm((f) => ({
      ...f,
      department_ids: f.department_ids.includes(id)
        ? f.department_ids.filter((x) => x !== id)
        : [...f.department_ids, id],
    }))

  // Build ISO timestamps from the date + optional time fields. `allDay` can be
  // overridden (annual leave is always anchored to whole UTC days regardless of
  // the time toggle, since its cost is derived from day portions, not times).
  const toTimestamps = (allDay: boolean = form.all_day) => {
    if (allDay) {
      // All-day entries are timezone-independent: anchor them to UTC midnight so
      // they land on the exact dates picked, no matter the viewer's timezone.
      // This matches how leave day-counts and bank holidays are read elsewhere
      // (UTC date parts / the ISO date prefix).
      return {
        start_at: `${form.start_date}T00:00:00.000Z`,
        end_at: `${form.end_date}T23:59:59.999Z`,
      }
    }
    return {
      start_at: new Date(`${form.start_date}T${form.start_time}:00`).toISOString(),
      end_at: new Date(`${form.end_date}T${form.end_time}:00`).toISOString(),
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Free-text entries are allowed: require either a type or a title.
    if (!form.entry_type_id && !form.title.trim()) {
      setError('Add a title, or choose an entry type.')
      return
    }
    const isAnnualLeave = form.entry_type_id === ANNUAL_LEAVE_TYPE_ID
    // Annual leave is always stored as whole UTC days (its cost comes from day
    // portions, not clock times); other entries respect the all-day toggle.
    const allDayEffective = isAnnualLeave || form.all_day
    const { start_at, end_at } = toTimestamps(allDayEffective)
    if (new Date(end_at) < new Date(start_at)) {
      setError('The end must be after the start.')
      return
    }

    // Annual leave is always a personal request, never company-wide.
    const companyWide = canManageOthers && form.company_wide && !isAnnualLeave

    // Resolve the partial-day portions to store. Only annual leave uses these;
    // everything else stays a plain full-day/timed entry. Middle days of a
    // range are always full; a single-day booking uses the start fields only.
    const isSingleDay = form.start_date === form.end_date
    let portionFields: {
      start_portion: LeavePortion
      end_portion: LeavePortion
      start_hours: number | null
      end_hours: number | null
    } = { start_portion: 'full', end_portion: 'full', start_hours: null, end_hours: null }

    if (isAnnualLeave && form.leave_mode === 'half') {
      portionFields = {
        start_portion: form.start_portion === 'am' || form.start_portion === 'pm' ? form.start_portion : 'am',
        end_portion: isSingleDay
          ? 'full'
          : form.end_portion === 'am' || form.end_portion === 'pm'
            ? form.end_portion
            : 'am',
        start_hours: null,
        end_hours: null,
      }
    } else if (isAnnualLeave && form.leave_mode === 'hours') {
      const startH = Number(form.start_hours)
      const endH = Number(form.end_hours)
      if (!Number.isFinite(startH) || startH <= 0) {
        setError('Enter the number of hours for the first day.')
        return
      }
      if (!isSingleDay && (!Number.isFinite(endH) || endH <= 0)) {
        setError('Enter the number of hours for the last day.')
        return
      }
      if (startH > 24 || endH > 24) {
        setError('Hours per day must be 24 or fewer.')
        return
      }
      portionFields = {
        start_portion: 'hours',
        end_portion: isSingleDay ? 'full' : 'hours',
        start_hours: startH,
        end_hours: isSingleDay ? null : endH,
      }
    }

    // Resolve the final attendee set: directly-picked people plus everyone in
    // any selected department.
    const resolved = new Set<string>()
    if (!companyWide) {
      if (canManageOthers) {
        form.attendee_ids.forEach((id) => resolved.add(id))
        if (form.department_ids.length > 0) {
          const { data: members } = await supabase
            .from('profiles')
            .select('id')
            .in('department_id', form.department_ids)
          ;(members || []).forEach((m) => resolved.add(m.id as string))
        }
      } else {
        // Engineer: themselves only.
        resolved.add(profile.id)
      }
    }

    if (!companyWide && resolved.size === 0) {
      setError('Add at least one person, or mark the entry company-wide.')
      return
    }

    const attendeeIds = Array.from(resolved)
    // The primary owner keeps legacy single-owner behaviour working and
    // satisfies the insert policy for engineers (must equal their own id).
    const userId = companyWide
      ? null
      : canManageOthers
        ? attendeeIds[0] ?? null
        : profile.id

    // Annual leave enters the diary as "requested". New requests and any edit
    // by the leave-taker (re-request) reset the approval; a manager editing an
    // existing entry leaves its current status untouched.
    const willRequest = isAnnualLeave && (!entryId || !canManageOthers)
    const leaveFields = willRequest
      ? {
          approval_status: 'requested' as const,
          approved_by: null,
          approved_at: null,
          rejection_reason: null,
        }
      : {}

    setSaving(true)
    const payload = {
      entry_type_id: form.entry_type_id || null,
      user_id: userId,
      title: form.title.trim() || null,
      all_day: allDayEffective,
      start_at,
      end_at,
      // Leave is always shared so the whole team can plan around it. Other
      // entry types respect the "Visible to all staff" toggle.
      is_public: isAnnualLeave ? true : form.is_public,
      notes: form.notes.trim() || null,
      ...portionFields,
      ...leaveFields,
    }

    let targetId = entryId
    let dbError
    if (entryId) {
      const { error: err } = await supabase
        .from('calendar_entries')
        .update(payload)
        .eq('id', entryId)
      dbError = err
    } else {
      const { data: inserted, error: err } = await supabase
        .from('calendar_entries')
        .insert({ ...payload, created_by: profile.id })
        .select('id')
        .single()
      dbError = err
      targetId = inserted?.id ?? null
    }

    if (dbError || !targetId) {
      setSaving(false)
      setError(dbError?.message ?? 'Could not save the entry.')
      return
    }

    // Sync attendees: replace the set for this entry.
    if (entryId) {
      await supabase.from('calendar_entry_attendees').delete().eq('entry_id', targetId)
    }
    if (attendeeIds.length > 0) {
      const { error: attErr } = await supabase
        .from('calendar_entry_attendees')
        .insert(attendeeIds.map((uid) => ({ entry_id: targetId, user_id: uid })))
      if (attErr) {
        setSaving(false)
        setError(`Entry saved, but inviting people failed: ${attErr.message}`)
        return
      }
    }

    // For annual leave, fan out the approval request to the manager server-side.
    if (willRequest) {
      try {
        await fetch('/api/leave/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entryId: targetId }),
        })
      } catch {
        // Non-fatal: the entry is saved; the manager can still see it in Approvals.
      }
    }

    setSaving(false)
    toast.success(
      willRequest
        ? 'Leave requested — sent to your manager for approval'
        : entryId
          ? 'Entry updated'
          : 'Entry added',
    )
    onOpenChange(false)
    router.refresh()
  }

  const handleDelete = async () => {
    if (!entryId) return
    const { error: err } = await supabase
      .from('calendar_entries')
      .delete()
      .eq('id', entryId)
    if (err) {
      toast.error('Could not delete entry')
      return
    }
    toast.success('Entry deleted')
    onOpenChange(false)
    router.refresh()
  }

  const readOnly = !editable
  const attendeeCount = form.attendee_ids.length
  const isAnnualLeaveType = form.entry_type_id === ANNUAL_LEAVE_TYPE_ID
  const isSingleDayRange = form.start_date === form.end_date

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{entryId ? 'Edit Entry' : 'New Calendar Entry'}</DialogTitle>
            <DialogDescription>
              {readOnly
                ? 'You can view this entry but only the owner or an admin can change it.'
                : 'Add annual leave, sickness, training or another general entry.'}
            </DialogDescription>
          </DialogHeader>

          {loadingEntry ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <fieldset disabled={readOnly} className="grid gap-4 py-4">
              {approvalStatus && (
                <div
                  className={
                    'flex items-start gap-2 rounded-md border px-3 py-2 text-sm ' +
                    (approvalStatus === 'approved'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
                      : approvalStatus === 'rejected'
                        ? 'border-destructive/30 bg-destructive/10 text-destructive'
                        : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300')
                  }
                >
                  <span className="font-medium capitalize">
                    {approvalStatus === 'requested' ? 'Awaiting approval' : approvalStatus}
                  </span>
                  {approvalStatus === 'rejected' && rejectionReason && (
                    <span className="text-muted-foreground">— {rejectionReason}</span>
                  )}
                </div>
              )}
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select
                  value={form.entry_type_id || NO_TYPE}
                  onValueChange={(v) => update({ entry_type_id: v === NO_TYPE ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None (free text)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TYPE}>
                      <span className="text-muted-foreground">None (free text)</span>
                    </SelectItem>
                    {entryTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: t.color }}
                          />
                          {t.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Leave as &ldquo;None&rdquo; to create a free-text entry using the title below.
                </p>
              </div>

              {canManageOthers && (
                <div className="grid gap-3 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="entry-company">Company-wide</Label>
                      <p className="text-xs text-muted-foreground">
                        Applies to everyone instead of specific people.
                      </p>
                    </div>
                    <Switch
                      id="entry-company"
                      checked={form.company_wide}
                      onCheckedChange={(v) => update({ company_wide: v })}
                    />
                  </div>

                  {!form.company_wide && (
                    <>
                      <div className="grid gap-2">
                        <div className="flex items-center justify-between">
                          <Label>People</Label>
                          <Badge variant="secondary">{attendeeCount} selected</Badge>
                        </div>
                        <ScrollArea className="h-40 rounded-md border">
                          <div className="grid gap-1 p-2">
                            {people.map((p) => (
                              <label
                                key={p.id}
                                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                              >
                                <Checkbox
                                  checked={form.attendee_ids.includes(p.id)}
                                  onCheckedChange={() => toggleAttendee(p.id)}
                                />
                                <span>
                                  {p.full_name || p.email}
                                  {p.id === profile.id ? ' (you)' : ''}
                                </span>
                              </label>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>

                      {departments.length > 0 && (
                        <div className="grid gap-2">
                          <Label>Add whole departments</Label>
                          <div className="flex flex-wrap gap-1.5">
                            {departments.map((d) => {
                              const active = form.department_ids.includes(d.id)
                              return (
                                <Button
                                  key={d.id}
                                  type="button"
                                  size="sm"
                                  variant={active ? 'default' : 'outline'}
                                  aria-pressed={active}
                                  onClick={() => toggleDepartment(d.id)}
                                >
                                  {d.name}
                                </Button>
                              )
                            })}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Everyone in a selected department is invited when you save.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="entry-title">Title (optional)</Label>
                <Input
                  id="entry-title"
                  value={form.title}
                  onChange={(e) => update({ title: e.target.value })}
                  placeholder="Defaults to the type name"
                />
              </div>

              {!isAnnualLeaveType && (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="entry-allday">All day</Label>
                    <p className="text-xs text-muted-foreground">
                      Turn off to set specific start and end times.
                    </p>
                  </div>
                  <Switch
                    id="entry-allday"
                    checked={form.all_day}
                    onCheckedChange={(v) => update({ all_day: v })}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="entry-start-date">Start date</Label>
                  <Input
                    id="entry-start-date"
                    type="date"
                    value={form.start_date}
                    onChange={(e) => update({ start_date: e.target.value })}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="entry-end-date">End date</Label>
                  <Input
                    id="entry-end-date"
                    type="date"
                    value={form.end_date}
                    min={form.start_date}
                    onChange={(e) => update({ end_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              {isAnnualLeaveType && (
                <div className="grid gap-3 rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <Label>Leave duration</Label>
                    <p className="text-xs text-muted-foreground">
                      Half days and hours only deduct part of a working day.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ['full', 'Full day'],
                        ['half', 'Half day'],
                        ['hours', 'Hours'],
                      ] as const
                    ).map(([mode, label]) => (
                      <Button
                        key={mode}
                        type="button"
                        size="sm"
                        variant={form.leave_mode === mode ? 'default' : 'outline'}
                        aria-pressed={form.leave_mode === mode}
                        className="min-h-11"
                        onClick={() => update({ leave_mode: mode })}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>

                  {form.leave_mode === 'half' && (
                    <div className="grid gap-3">
                      <div className="grid gap-1.5">
                        <Label className="text-xs text-muted-foreground">
                          {isSingleDayRange ? 'Which half?' : 'First day'}
                        </Label>
                        <div className="grid grid-cols-2 gap-2">
                          {(
                            [
                              ['am', 'Morning'],
                              ['pm', 'Afternoon'],
                            ] as const
                          ).map(([p, label]) => (
                            <Button
                              key={p}
                              type="button"
                              size="sm"
                              variant={form.start_portion === p ? 'default' : 'outline'}
                              aria-pressed={form.start_portion === p}
                              className="min-h-11"
                              onClick={() => update({ start_portion: p })}
                            >
                              {label}
                            </Button>
                          ))}
                        </div>
                      </div>
                      {!isSingleDayRange && (
                        <div className="grid gap-1.5">
                          <Label className="text-xs text-muted-foreground">Last day</Label>
                          <div className="grid grid-cols-2 gap-2">
                            {(
                              [
                                ['am', 'Morning'],
                                ['pm', 'Afternoon'],
                              ] as const
                            ).map(([p, label]) => (
                              <Button
                                key={p}
                                type="button"
                                size="sm"
                                variant={form.end_portion === p ? 'default' : 'outline'}
                                aria-pressed={form.end_portion === p}
                                className="min-h-11"
                                onClick={() => update({ end_portion: p })}
                              >
                                {label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {form.leave_mode === 'hours' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1.5">
                        <Label htmlFor="leave-start-hours" className="text-xs text-muted-foreground">
                          {isSingleDayRange ? 'Hours this day' : 'Hours on first day'}
                        </Label>
                        <Input
                          id="leave-start-hours"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max="24"
                          step="0.5"
                          value={form.start_hours}
                          onChange={(e) => update({ start_hours: e.target.value })}
                          placeholder="e.g. 4"
                        />
                      </div>
                      {!isSingleDayRange && (
                        <div className="grid gap-1.5">
                          <Label htmlFor="leave-end-hours" className="text-xs text-muted-foreground">
                            Hours on last day
                          </Label>
                          <Input
                            id="leave-end-hours"
                            type="number"
                            inputMode="decimal"
                            min="0"
                            max="24"
                            step="0.5"
                            value={form.end_hours}
                            onChange={(e) => update({ end_hours: e.target.value })}
                            placeholder="e.g. 4"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {!isAnnualLeaveType && !form.all_day && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="entry-start-time">Start time</Label>
                    <Input
                      id="entry-start-time"
                      type="time"
                      value={form.start_time}
                      onChange={(e) => update({ start_time: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="entry-end-time">End time</Label>
                    <Input
                      id="entry-end-time"
                      type="time"
                      value={form.end_time}
                      onChange={(e) => update({ end_time: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="entry-public">Visible to all staff</Label>
                  <p className="text-xs text-muted-foreground">
                    {form.entry_type_id === ANNUAL_LEAVE_TYPE_ID
                      ? 'Leave is always shared so the team can plan around it.'
                      : 'When off, only the people invited and admin/office can see it.'}
                  </p>
                </div>
                <Switch
                  id="entry-public"
                  checked={form.entry_type_id === ANNUAL_LEAVE_TYPE_ID ? true : form.is_public}
                  disabled={form.entry_type_id === ANNUAL_LEAVE_TYPE_ID}
                  onCheckedChange={(v) => update({ is_public: v })}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="entry-notes">Notes (optional)</Label>
                <Textarea
                  id="entry-notes"
                  value={form.notes}
                  onChange={(e) => update({ notes: e.target.value })}
                  rows={2}
                />
              </div>
            </fieldset>
          )}

          {error && <p className="pb-2 text-sm text-destructive">{error}</p>}

          <DialogFooter className="gap-2 sm:justify-between">
            {entryId && editable ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="outline" className="text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete entry</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove this calendar entry.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => {
                        e.preventDefault()
                        handleDelete()
                      }}
                      className="bg-destructive text-destructive-foreground"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <span />
            )}

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {readOnly ? 'Close' : 'Cancel'}
              </Button>
              {!readOnly && (
                <Button type="submit" disabled={saving || loadingEntry}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : entryId ? (
                    'Save Changes'
                  ) : (
                    'Add Entry'
                  )}
                </Button>
              )}
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
