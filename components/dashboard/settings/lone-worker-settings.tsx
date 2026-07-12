'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Save, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react'
import { setGlobalConfig } from '@/lib/actions/global-config'
import {
  disableUserLoneWorker,
  enableUserLoneWorker,
  setUserCanManageLoneWorker,
  type LoneWorkerManagedUser,
} from '@/app/(dashboard)/dashboard/lone-worker/actions'
import type { LoneWorkerTimings } from '@/lib/lone-worker/types'

interface Props {
  timings: LoneWorkerTimings
  users: LoneWorkerManagedUser[]
  isAdmin: boolean
}

// Sensible preset for how long the temporary disable lasts.
const DISABLE_PRESETS = [
  { label: 'Rest of today', hours: 12 },
  { label: '1 day', hours: 24 },
  { label: '3 days', hours: 72 },
  { label: '1 week', hours: 168 },
]

export function LoneWorkerSettings({ timings, users, isAdmin }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // --- Timings / sound -------------------------------------------------------
  const [checkin, setCheckin] = useState(String(timings.checkinMinutes))
  const [amber, setAmber] = useState(String(timings.amberMinutes))
  const [red, setRed] = useState(String(timings.redMinutes))
  const [sound, setSound] = useState(timings.soundEnabled)
  const [savingTimings, setSavingTimings] = useState(false)

  const saveTimings = async () => {
    const c = parseInt(checkin, 10)
    const a = parseInt(amber, 10)
    const r = parseInt(red, 10)
    if ([c, a, r].some((n) => Number.isNaN(n) || n < 1)) {
      toast.error('All timings must be at least 1 minute')
      return
    }
    setSavingTimings(true)
    const results = await Promise.all([
      setGlobalConfig('lone_worker_checkin_minutes', c),
      setGlobalConfig('lone_worker_amber_minutes', a),
      setGlobalConfig('lone_worker_red_minutes', r),
    ])
    setSavingTimings(false)
    const err = results.find((x) => x.error)?.error
    if (err) {
      toast.error(err)
      return
    }
    toast.success('Lone worker timings saved')
    startTransition(() => router.refresh())
  }

  const toggleSound = async (next: boolean) => {
    setSound(next)
    const { error } = await setGlobalConfig('lone_worker_alert_sound_enabled', next)
    if (error) {
      setSound(!next)
      toast.error(error)
    } else {
      toast.success(next ? 'Alert sound enabled' : 'Alert sound muted')
    }
  }

  // --- Per-user management ---------------------------------------------------
  const [disableTarget, setDisableTarget] = useState<LoneWorkerManagedUser | null>(null)
  const [reason, setReason] = useState('')
  const [hours, setHours] = useState(24)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const openDisable = (u: LoneWorkerManagedUser) => {
    setDisableTarget(u)
    setReason('')
    setHours(24)
    setConfirmed(false)
  }

  const confirmDisable = async () => {
    if (!disableTarget) return
    const until = new Date(Date.now() + hours * 3600_000).toISOString()
    setBusy(disableTarget.id)
    const { error } = await disableUserLoneWorker(disableTarget.id, until, reason.trim())
    setBusy(null)
    if (error) {
      toast.error(error)
      return
    }
    toast.success(`Lone worker disabled for ${disableTarget.name}`)
    setDisableTarget(null)
    startTransition(() => router.refresh())
  }

  const onEnable = async (u: LoneWorkerManagedUser) => {
    setBusy(u.id)
    const { error } = await enableUserLoneWorker(u.id)
    setBusy(null)
    if (error) {
      toast.error(error)
      return
    }
    toast.success(`Lone worker re-enabled for ${u.name}`)
    startTransition(() => router.refresh())
  }

  const onToggleManage = async (u: LoneWorkerManagedUser, next: boolean) => {
    setBusy(u.id)
    const { error } = await setUserCanManageLoneWorker(u.id, next)
    setBusy(null)
    if (error) {
      toast.error(error)
      return
    }
    toast.success(
      next ? `${u.name} can now manage lone workers` : `Removed manager rights from ${u.name}`,
    )
    startTransition(() => router.refresh())
  }

  return (
    <div className="space-y-6">
      {/* Timings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Check-in Timings
          </CardTitle>
          <CardDescription>
            How often lone workers are asked to confirm they are safe, and how long they have before
            a warning then an emergency is raised. Workers can shorten their own interval mid-shift.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="lw-checkin">Check-in every (min)</Label>
              <Input
                id="lw-checkin"
                type="number"
                min={1}
                max={240}
                value={checkin}
                onChange={(e) => setCheckin(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lw-amber">Warning after (min)</Label>
              <Input
                id="lw-amber"
                type="number"
                min={1}
                max={60}
                value={amber}
                onChange={(e) => setAmber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lw-red">Emergency after (min)</Label>
              <Input
                id="lw-red"
                type="number"
                min={1}
                max={60}
                value={red}
                onChange={(e) => setRed(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Example: with {checkin || '?'} / {amber || '?'} / {red || '?'}, a worker is prompted
            every {checkin || '?'} minutes, an amber warning is raised {amber || '?'} minutes after
            an unanswered prompt, and a red emergency {red || '?'} minutes after that.
          </p>
          <Button onClick={saveTimings} disabled={savingTimings} className="gap-2">
            {savingTimings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save timings
          </Button>
        </CardContent>
      </Card>

      {/* Sound */}
      <Card>
        <CardHeader>
          <CardTitle>Alert Sound</CardTitle>
          <CardDescription>
            Play an audible alarm on the worker&apos;s device while a check-in prompt, warning or
            emergency is on screen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-3">
            <div className="space-y-0.5">
              <Label htmlFor="lw-sound" className="text-sm font-medium">
                Play alert sound
              </Label>
              <p className="text-xs text-muted-foreground">
                {sound ? 'Alarm will sound on alerts' : 'Alerts are silent (visual only)'}
              </p>
            </div>
            <Switch id="lw-sound" checked={sound} onCheckedChange={toggleSound} />
          </div>
        </CardContent>
      </Card>

      {/* Per-user management */}
      <Card>
        <CardHeader>
          <CardTitle>Eligible Staff</CardTitle>
          <CardDescription>
            Everyone whose role has lone worker enabled. Temporarily disable a person (e.g.
            unexpected sick leave) to stop their check-ins{isAdmin ? ', or nominate a non-admin as a lone-worker manager who can monitor and disable others' : ''}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No roles have lone worker enabled yet. Turn it on for a role in Settings → Roles.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin && <TableHead>Manager</TableHead>}
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const disabled = u.disabledUntil != null
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">
                          {u.name}
                          {u.onShift && (
                            <Badge variant="secondary" className="ml-2 text-[10px]">
                              On shift
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{u.roleName || '—'}</TableCell>
                        <TableCell>
                          {disabled ? (
                            <Badge variant="outline" className="gap-1 text-amber-600">
                              <ShieldOff className="h-3 w-3" />
                              Disabled until{' '}
                              {new Date(u.disabledUntil!).toLocaleString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </Badge>
                          ) : (
                            <Badge className="gap-1">
                              <ShieldCheck className="h-3 w-3" />
                              Active
                            </Badge>
                          )}
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <Switch
                              checked={u.canManage}
                              disabled={busy === u.id}
                              onCheckedChange={(v) => onToggleManage(u, v)}
                              aria-label={`Toggle manager rights for ${u.name}`}
                            />
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          {disabled ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === u.id}
                              onClick={() => onEnable(u)}
                            >
                              {busy === u.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                'Re-enable'
                              )}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1 text-destructive hover:text-destructive"
                              disabled={busy === u.id}
                              onClick={() => openDisable(u)}
                            >
                              <ShieldOff className="h-4 w-4" />
                              Disable
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disable dialog (double confirm) */}
      <Dialog open={!!disableTarget} onOpenChange={(o) => !o && setDisableTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              Disable lone worker for {disableTarget?.name}?
            </DialogTitle>
            <DialogDescription>
              This stops safety check-ins for this person and clears any active shift, warning or
              emergency. Use only when you know they are safe (e.g. unexpected sick leave).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {disableTarget?.onShift && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {disableTarget.name} is currently on a lone-worker shift. Disabling will immediately
                end their monitoring.
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Disable for</Label>
              <div className="flex flex-wrap gap-2">
                {DISABLE_PRESETS.map((p) => (
                  <Button
                    key={p.hours}
                    type="button"
                    size="sm"
                    variant={hours === p.hours ? 'default' : 'outline'}
                    onClick={() => setHours(p.hours)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lw-reason">Reason</Label>
              <Textarea
                id="lw-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Off sick — confirmed at home"
                rows={2}
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <span>
                I confirm this person is safe and understand their lone-worker safety monitoring
                will be turned off for the selected period.
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!confirmed || busy === disableTarget?.id}
              onClick={confirmDisable}
              className="gap-2"
            >
              {busy === disableTarget?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldOff className="h-4 w-4" />
              )}
              Disable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
