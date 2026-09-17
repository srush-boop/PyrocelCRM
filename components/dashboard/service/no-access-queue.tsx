'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { DoorClosed, Loader2, CalendarClock, Building2, Coins } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
import { formatDateUK } from '@/lib/utils'
import { rearrangeNoAccessCall, dismissNoAccessCall } from '@/lib/actions/no-access'

export interface NoAccessCall {
  id: string
  referenceNumber: string | null
  siteName: string
  serviceName: string
  reason: string | null
  noAccessAt: string | null
  engineerName: string | null
  isNonRecurring: boolean
}

interface NoAccessQueueProps {
  calls: NoAccessCall[]
  engineers: { id: string; name: string }[]
}

const UNASSIGNED = '__unassigned__'

export function NoAccessQueue({ calls, engineers }: NoAccessQueueProps) {
  const router = useRouter()
  const [active, setActive] = useState<NoAccessCall | null>(null)
  const [mode, setMode] = useState<'rearrange' | 'dismiss'>('rearrange')

  // Rearrange form state.
  const [scheduledDate, setScheduledDate] = useState('')
  const [engineerId, setEngineerId] = useState<string>(UNASSIGNED)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [contactNote, setContactNote] = useState('')
  const [chargeAttendance, setChargeAttendance] = useState(false)
  const [dismissNote, setDismissNote] = useState('')
  const [saving, setSaving] = useState(false)

  const openDialog = (call: NoAccessCall, m: 'rearrange' | 'dismiss') => {
    setActive(call)
    setMode(m)
    setScheduledDate('')
    setEngineerId(UNASSIGNED)
    setStartTime('')
    setEndTime('')
    setContactNote('')
    setChargeAttendance(false)
    setDismissNote('')
  }

  const closeDialog = () => {
    if (saving) return
    setActive(null)
  }

  const handleRearrange = async () => {
    if (!active) return
    setSaving(true)
    const res = await rearrangeNoAccessCall({
      taskId: active.id,
      engineerId: engineerId === UNASSIGNED ? null : engineerId,
      scheduledDate,
      bookedStartTime: startTime || null,
      bookedEndTime: endTime || null,
      contactNote,
      chargeAttendance,
    })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error ?? 'Could not rearrange the call.')
      return
    }
    toast.success(
      chargeAttendance && active.isNonRecurring
        ? 'Call rearranged — attendance sent for charge review.'
        : 'Call rearranged.',
    )
    setActive(null)
    router.refresh()
  }

  const handleDismiss = async () => {
    if (!active) return
    setSaving(true)
    const res = await dismissNoAccessCall({ taskId: active.id, note: dismissNote })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error ?? 'Could not close the call.')
      return
    }
    toast.success('No-access call closed.')
    setActive(null)
    router.refresh()
  }

  if (calls.length === 0) return null

  const canRearrange = scheduledDate !== '' && contactNote.trim().length >= 3 && !saving
  const canDismiss = dismissNote.trim().length >= 3 && !saving

  return (
    <>
      <Card className="border-2 border-amber-500 bg-amber-500/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600">
              <DoorClosed className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-amber-700">
                {calls.length} no-access call{calls.length === 1 ? '' : 's'} to rearrange
              </CardTitle>
              <CardDescription>
                An engineer couldn&apos;t gain entry — contact the client to rearrange the visit.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {calls.map((call) => (
            <div
              key={call.id}
              className="flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-background px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-2">
                <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/dashboard/tasks/${call.id}?from=/dashboard/service`}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {call.siteName}
                    </Link>
                    {call.referenceNumber && (
                      <Badge variant="outline" className="text-[10px]">
                        {call.referenceNumber}
                      </Badge>
                    )}
                    {call.isNonRecurring && (
                      <Badge variant="secondary" className="text-[10px]">
                        Non-recurring
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{call.serviceName}</p>
                  {call.reason && (
                    <p className="mt-0.5 text-xs text-foreground/80">
                      <span className="font-medium">Reason:</span> {call.reason}
                    </p>
                  )}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Returned {call.noAccessAt ? formatDateUK(call.noAccessAt) : '—'}
                    {call.engineerName ? ` · ${call.engineerName}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openDialog(call, 'dismiss')}
                >
                  Close
                </Button>
                <Button size="sm" onClick={() => openDialog(call, 'rearrange')}>
                  <CalendarClock className="mr-2 h-4 w-4" />
                  Contact &amp; rearrange
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={active !== null} onOpenChange={(v) => (v ? null : closeDialog())}>
        <DialogContent>
          {mode === 'rearrange' ? (
            <>
              <DialogHeader>
                <DialogTitle>Contact &amp; rearrange</DialogTitle>
                <DialogDescription>
                  {active?.siteName} — {active?.serviceName}. This creates a new linked call and
                  clears it from the no-access queue.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="na-contact-note">Client contact note</Label>
                  <Textarea
                    id="na-contact-note"
                    value={contactNote}
                    onChange={(e) => setContactNote(e.target.value)}
                    placeholder="e.g. Called facilities manager, agreed new date with key holder on site."
                    rows={3}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="na-date">New visit date</Label>
                    <Input
                      id="na-date"
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="na-engineer">Engineer</Label>
                    <Select value={engineerId} onValueChange={setEngineerId}>
                      <SelectTrigger id="na-engineer">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                        {engineers.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="na-start">Start time (optional)</Label>
                    <Input
                      id="na-start"
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="na-end">End time (optional)</Label>
                    <Input
                      id="na-end"
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                    />
                  </div>
                </div>
                {active?.isNonRecurring && (
                  <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
                    <div className="flex items-start gap-2">
                      <Coins className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <div className="space-y-0.5">
                        <Label htmlFor="na-charge" className="text-sm">
                          Charge client for attendance
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Sends this wasted visit to the chargeable review queue so an
                          attendance fee can be invoiced.
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="na-charge"
                      checked={chargeAttendance}
                      onCheckedChange={setChargeAttendance}
                    />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeDialog} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={handleRearrange} disabled={!canRearrange}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Rearrange call
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Close without rebooking</DialogTitle>
                <DialogDescription>
                  {active?.siteName} — {active?.serviceName}. Use this when the visit won&apos;t be
                  rearranged. It clears the call from the no-access queue.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Label htmlFor="na-dismiss-note">Reason</Label>
                <Textarea
                  id="na-dismiss-note"
                  value={dismissNote}
                  onChange={(e) => setDismissNote(e.target.value)}
                  placeholder="e.g. Client cancelled the visit — no longer required."
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeDialog} disabled={saving}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleDismiss} disabled={!canDismiss}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Close call
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
