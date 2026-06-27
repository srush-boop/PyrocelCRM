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
import type { CalendarEntryType, Profile } from '@/lib/types/database'

interface PersonOption {
  id: string
  full_name: string | null
  email: string
  role: string
}

interface CalendarEntryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // When set, the dialog edits an existing entry; otherwise it creates one.
  entryId: string | null
  defaultDate: Date | null
  entryTypes: CalendarEntryType[]
  people: PersonOption[]
  profile: Profile
  canManageOthers: boolean
}

const COMPANY = '__company__'

interface FormState {
  entry_type_id: string
  // target: own user id, another user id, or COMPANY (managers only)
  target: string
  title: string
  all_day: boolean
  start_date: string
  end_date: string
  start_time: string
  end_time: string
  is_public: boolean
  notes: string
}

function buildDefault(
  profile: Profile,
  entryTypes: CalendarEntryType[],
  defaultDate: Date | null,
): FormState {
  const d = defaultDate ?? new Date()
  const dateStr = format(d, 'yyyy-MM-dd')
  return {
    entry_type_id: entryTypes[0]?.id ?? '',
    target: profile.id,
    title: '',
    all_day: true,
    start_date: dateStr,
    end_date: dateStr,
    start_time: '09:00',
    end_time: '17:00',
    is_public: false,
    notes: '',
  }
}

export function CalendarEntryDialog({
  open,
  onOpenChange,
  entryId,
  defaultDate,
  entryTypes,
  people,
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
  const [error, setError] = useState<string | null>(null)

  // Reset / load whenever the dialog opens.
  useEffect(() => {
    if (!open) return
    setError(null)

    if (!entryId) {
      setForm(buildDefault(profile, entryTypes, defaultDate))
      setEditable(true)
      return
    }

    // Editing: fetch the entry.
    let cancelled = false
    setLoadingEntry(true)
    ;(async () => {
      const { data } = await supabase
        .from('calendar_entries')
        .select('*')
        .eq('id', entryId)
        .single()
      if (cancelled) return
      setLoadingEntry(false)
      if (!data) {
        setError('This entry could not be loaded.')
        return
      }
      const start = new Date(data.start_at)
      const end = new Date(data.end_at)
      setForm({
        entry_type_id: data.entry_type_id,
        target: data.user_id ?? COMPANY,
        title: data.title ?? '',
        all_day: data.all_day,
        start_date: format(start, 'yyyy-MM-dd'),
        end_date: format(end, 'yyyy-MM-dd'),
        start_time: format(start, 'HH:mm'),
        end_time: format(end, 'HH:mm'),
        is_public: data.is_public,
        notes: data.notes ?? '',
      })
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

  // Build ISO timestamps from the date + optional time fields.
  const toTimestamps = () => {
    if (form.all_day) {
      return {
        start_at: new Date(`${form.start_date}T00:00:00`).toISOString(),
        end_at: new Date(`${form.end_date}T23:59:00`).toISOString(),
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

    if (!form.entry_type_id) {
      setError('Please choose an entry type.')
      return
    }
    const { start_at, end_at } = toTimestamps()
    if (new Date(end_at) < new Date(start_at)) {
      setError('The end must be after the start.')
      return
    }

    // Resolve the owner. Engineers can only create for themselves.
    const userId =
      form.target === COMPANY ? null : form.target
    if (!canManageOthers && userId !== profile.id) {
      setError('You can only add entries to your own calendar.')
      return
    }

    setSaving(true)
    const payload = {
      entry_type_id: form.entry_type_id,
      user_id: userId,
      title: form.title.trim() || null,
      all_day: form.all_day,
      start_at,
      end_at,
      is_public: form.is_public,
      notes: form.notes.trim() || null,
    }

    let dbError
    if (entryId) {
      const { error: err } = await supabase
        .from('calendar_entries')
        .update(payload)
        .eq('id', entryId)
      dbError = err
    } else {
      const { error: err } = await supabase
        .from('calendar_entries')
        .insert({ ...payload, created_by: profile.id })
      dbError = err
    }

    setSaving(false)
    if (dbError) {
      setError(dbError.message)
      return
    }
    toast.success(entryId ? 'Entry updated' : 'Entry added')
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
              <div className="grid gap-2">
                <Label>Type *</Label>
                <Select
                  value={form.entry_type_id}
                  onValueChange={(v) => update({ entry_type_id: v })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a type" />
                  </SelectTrigger>
                  <SelectContent>
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
              </div>

              {canManageOthers && (
                <div className="grid gap-2">
                  <Label>Who is this for?</Label>
                  <Select value={form.target} onValueChange={(v) => update({ target: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={COMPANY}>Company-wide</SelectItem>
                      {people.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name || p.email}
                          {p.id === profile.id ? ' (you)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

              {!form.all_day && (
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
                    When off, only the owner and admin/office can see it.
                  </p>
                </div>
                <Switch
                  id="entry-public"
                  checked={form.is_public}
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
