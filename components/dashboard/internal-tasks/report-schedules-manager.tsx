'use client'

import { useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { CalendarClock, Loader2, Plus, Send, Trash2, Users, ChevronDown, Check } from 'lucide-react'
import type {
  InternalTaskReportSchedule,
  ReportScheduleFrequency,
} from '@/lib/types/database'
import { scheduleCadenceLabel } from '@/lib/internal-tasks/report-schedule'
import {
  upsertReportSchedule,
  deleteReportSchedule,
  setReportScheduleActive,
  sendReportScheduleNow,
  type ReportScheduleInput,
} from '@/lib/actions/internal-tasks'

interface Props {
  initialSchedules: InternalTaskReportSchedule[]
  templates: { id: string; name: string }[]
  users: { id: string; name: string }[]
  roles: { name: string }[]
}

const ALL = '__all__'
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface EditorState {
  id?: string
  templateId: string
  frequency: ReportScheduleFrequency
  dayOfWeek: number
  dayOfMonth: number
  userIds: string[]
  roleNames: string[]
  emails: string
  active: boolean
}

function blankEditor(): EditorState {
  return {
    templateId: ALL,
    frequency: 'monthly',
    dayOfWeek: 1,
    dayOfMonth: 1,
    userIds: [],
    roleNames: [],
    emails: '',
    active: true,
  }
}

export function ReportSchedulesManager({ initialSchedules, templates, users, roles }: Props) {
  const [schedules, setSchedules] = useState(initialSchedules)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editor, setEditor] = useState<EditorState>(blankEditor())
  const [error, setError] = useState<string | null>(null)
  const [saving, startSave] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pending, startPending] = useTransition()
  const [sentMsg, setSentMsg] = useState<string | null>(null)

  const templateName = useMemo(
    () => new Map(templates.map((t) => [t.id, t.name])),
    [templates],
  )
  const userName = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users])

  function openNew() {
    setEditor(blankEditor())
    setError(null)
    setEditorOpen(true)
  }

  function openEdit(s: InternalTaskReportSchedule) {
    setEditor({
      id: s.id,
      templateId: s.template_id ?? ALL,
      frequency: s.frequency,
      dayOfWeek: s.day_of_week ?? 1,
      dayOfMonth: s.day_of_month ?? 1,
      userIds: s.recipient_user_ids ?? [],
      roleNames: s.recipient_role_names ?? [],
      emails: (s.recipient_emails ?? []).join(', '),
      active: s.active,
    })
    setError(null)
    setEditorOpen(true)
  }

  async function reload() {
    const { listReportSchedules } = await import('@/lib/actions/internal-tasks')
    const res = await listReportSchedules()
    if (res.ok) setSchedules(res.schedules ?? [])
  }

  function save() {
    setError(null)
    const input: ReportScheduleInput = {
      id: editor.id,
      templateId: editor.templateId === ALL ? null : editor.templateId,
      frequency: editor.frequency,
      dayOfWeek: editor.dayOfWeek,
      dayOfMonth: editor.dayOfMonth,
      recipientUserIds: editor.userIds,
      recipientRoleNames: editor.roleNames,
      recipientEmails: editor.emails
        .split(/[\n,;]+/)
        .map((e) => e.trim())
        .filter(Boolean),
      active: editor.active,
    }
    startSave(async () => {
      const res = await upsertReportSchedule(input)
      if (!res.ok) {
        setError(res.error ?? 'Could not save the schedule.')
        return
      }
      setEditorOpen(false)
      await reload()
    })
  }

  function toggleActive(s: InternalTaskReportSchedule) {
    setBusyId(s.id)
    startPending(async () => {
      const res = await setReportScheduleActive(s.id, !s.active)
      if (res.ok) {
        setSchedules((list) =>
          list.map((x) => (x.id === s.id ? { ...x, active: !s.active } : x)),
        )
      }
      setBusyId(null)
    })
  }

  function remove(id: string) {
    setBusyId(id)
    startPending(async () => {
      const res = await deleteReportSchedule(id)
      if (res.ok) setSchedules((list) => list.filter((x) => x.id !== id))
      setBusyId(null)
    })
  }

  function sendNow(id: string) {
    setBusyId(id)
    setSentMsg(null)
    startPending(async () => {
      const res = await sendReportScheduleNow(id)
      setSentMsg(
        res.ok
          ? `Report sent to ${res.sent ?? 0} recipient(s).`
          : res.error ?? 'Could not send the report.',
      )
      setBusyId(null)
    })
  }

  function recipientSummary(s: InternalTaskReportSchedule): string {
    const parts: string[] = []
    if (s.recipient_user_ids?.length) {
      parts.push(s.recipient_user_ids.map((id) => userName.get(id) ?? 'User').join(', '))
    }
    if (s.recipient_role_names?.length) {
      parts.push(s.recipient_role_names.map((r) => `${r} team`).join(', '))
    }
    if (s.recipient_emails?.length) parts.push(s.recipient_emails.join(', '))
    return parts.join(' · ') || 'No recipients'
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground text-pretty">
          Automatically email a completion report — expected vs actual responses, who is overdue
          and a summary of submissions — to people or whole teams on a set schedule.
        </p>
        <Button onClick={openNew}>
          <Plus className="size-4" />
          New schedule
        </Button>
      </div>

      {sentMsg ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Check className="size-4 text-primary" />
          {sentMsg}
        </p>
      ) : null}

      {schedules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <CalendarClock className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-pretty">
              No scheduled reports yet. Create one to have reports emailed automatically.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {schedules.map((s) => (
            <Card key={s.id} className={s.active ? '' : 'opacity-70'}>
              <CardContent className="flex flex-wrap items-start justify-between gap-4 py-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {s.template_id ? (templateName.get(s.template_id) ?? 'Task') : 'All tasks & forms'}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {scheduleCadenceLabel(s.frequency, s.day_of_week, s.day_of_month)}
                    </Badge>
                    {!s.active ? (
                      <Badge variant="outline" className="text-[10px]">
                        Paused
                      </Badge>
                    ) : null}
                  </div>
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground text-pretty">
                    <Users className="mt-0.5 size-3.5 shrink-0" />
                    {recipientSummary(s)}
                  </p>
                  {s.last_sent_at ? (
                    <p className="text-xs text-muted-foreground">
                      Last sent{' '}
                      {new Date(s.last_sent_at).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <div className="mr-1 flex items-center gap-2">
                    <Switch
                      checked={s.active}
                      onCheckedChange={() => toggleActive(s)}
                      disabled={pending && busyId === s.id}
                      aria-label="Toggle schedule active"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => sendNow(s.id)}
                    disabled={pending && busyId === s.id}
                    title="Send the latest report now"
                  >
                    {pending && busyId === s.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    Send now
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                    Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" title="Delete schedule">
                        <Trash2 className="size-4 text-destructive" />
                        <span className="sr-only">Delete schedule</span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this report schedule?</AlertDialogTitle>
                        <AlertDialogDescription>
                          The automatic report will stop being sent. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove(s.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editor.id ? 'Edit report schedule' : 'New report schedule'}</DialogTitle>
            <DialogDescription>
              Choose what to report on, how often, and who receives it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-xs">Report on</Label>
              <Select
                value={editor.templateId}
                onValueChange={(v) => setEditor((e) => ({ ...e, templateId: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All tasks &amp; forms</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Frequency</Label>
                <Select
                  value={editor.frequency}
                  onValueChange={(v) =>
                    setEditor((e) => ({ ...e, frequency: v as ReportScheduleFrequency }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {editor.frequency === 'weekly' ? (
                <div>
                  <Label className="text-xs">Send on</Label>
                  <Select
                    value={String(editor.dayOfWeek)}
                    onValueChange={(v) => setEditor((e) => ({ ...e, dayOfWeek: Number(v) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((d, i) => (
                        <SelectItem key={d} value={String(i)}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {editor.frequency === 'monthly' ? (
                <div>
                  <Label className="text-xs" htmlFor="dom">
                    Day of month
                  </Label>
                  <Input
                    id="dom"
                    type="number"
                    min={1}
                    max={28}
                    value={editor.dayOfMonth}
                    onChange={(e) =>
                      setEditor((s) => ({
                        ...s,
                        dayOfMonth: Math.min(28, Math.max(1, Number(e.target.value) || 1)),
                      }))
                    }
                  />
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <MultiSelectField
                label="People"
                placeholder="Choose people"
                options={users.map((u) => ({ value: u.id, label: u.name }))}
                selected={editor.userIds}
                onChange={(userIds) => setEditor((e) => ({ ...e, userIds }))}
              />
              <MultiSelectField
                label="Groups (roles)"
                placeholder="Choose teams"
                options={roles.map((r) => ({ value: r.name, label: `${r.name} team` }))}
                selected={editor.roleNames}
                onChange={(roleNames) => setEditor((e) => ({ ...e, roleNames }))}
              />
            </div>

            <div>
              <Label className="text-xs" htmlFor="emails">
                Additional email addresses
              </Label>
              <Textarea
                id="emails"
                placeholder="jane@example.com, ops@example.com"
                value={editor.emails}
                onChange={(e) => setEditor((s) => ({ ...s, emails: e.target.value }))}
                rows={2}
              />
              <p className="mt-1 text-xs text-muted-foreground">Separate multiple with commas.</p>
            </div>

            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">
                  Paused schedules keep their settings but do not send.
                </p>
              </div>
              <Switch
                checked={editor.active}
                onCheckedChange={(v) => setEditor((e) => ({ ...e, active: v }))}
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {editor.id ? 'Save changes' : 'Create schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Inline multi-select rendered directly in the dialog's DOM (no nested portal).
// A portaled Popover inside a modal Dialog is made inert/mispositioned by the
// Dialog, so the recipient dropdown did not render correctly — this expands a
// native scroll list in-flow instead, which the dialog's own overflow scrolls.
function MultiSelectField({
  label,
  placeholder,
  options,
  selected,
  onChange,
}: {
  label: string
  placeholder: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const selectedSet = new Set(selected)
  const summary =
    selected.length === 0
      ? placeholder
      : options
          .filter((o) => selectedSet.has(o.value))
          .map((o) => o.label)
          .join(', ')

  function toggle(value: string) {
    if (selectedSet.has(value)) onChange(selected.filter((v) => v !== value))
    else onChange([...selected, value])
  }

  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between font-normal"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="truncate text-left">{summary}</span>
        <ChevronDown
          className={`size-4 shrink-0 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </Button>
      {open ? (
        <div className="mt-1 max-h-48 overflow-y-auto rounded-md border p-1">
          {options.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">None available.</p>
          ) : (
            options.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={selectedSet.has(o.value)}
                  onCheckedChange={() => toggle(o.value)}
                />
                <span className="truncate">{o.label}</span>
              </label>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
