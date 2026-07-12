'use client'

import { useCallback, useState, useTransition } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { ShieldCheck, ShieldAlert, Play, Square, Clock, Gauge, Loader2, Volume2 } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getMyLoneWorkerState,
  startShift,
  finishShift,
  setCheckinInterval,
} from '@/app/(dashboard)/dashboard/lone-worker/actions'
import { formatShiftTime, type MyLoneWorkerState } from '@/lib/lone-worker/types'
import { primeAlarm, playAlarmTone, buzz } from '@/lib/lone-worker/alarm'

// Frequency presets the worker can raise to when risk increases.
const INTERVAL_OPTIONS = [15, 30, 45, 60, 90, 120]

export function LoneWorkerShiftCard() {
  const { data, mutate, isLoading } = useSWR<MyLoneWorkerState | null>(
    'my-lone-worker',
    () => getMyLoneWorkerState(),
    { refreshInterval: 30000 },
  )

  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [starting, startStarting] = useTransition()
  const [finishing, startFinishing] = useTransition()

  // Seed the shift inputs from the user's work hours once loaded.
  const seededStart = start || data?.defaultShiftStart || '08:00'
  const seededEnd = end || data?.defaultShiftEnd || '17:00'

  const onStart = useCallback(() => {
    // Unlock alarm audio now, while we still have the user's tap gesture — iOS
    // blocks Web Audio that isn't primed inside a gesture.
    primeAlarm()
    startStarting(async () => {
      const res = await startShift({ shiftStart: seededStart, shiftEnd: seededEnd })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Shift started — stay safe out there')
      await mutate()
    })
  }, [seededStart, seededEnd, mutate])

  const onFinish = useCallback(() => {
    startFinishing(async () => {
      const res = await finishShift()
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Shift finished')
      await mutate()
    })
  }, [mutate])

  // Lets the worker confirm the alarm is audible on this device — and, being a
  // tap, primes the audio context so real check-in alarms will sound on iOS.
  const onTestAlarm = useCallback(() => {
    primeAlarm()
    playAlarmTone(660, 400)
    buzz([200, 120, 200])
    setTimeout(() => playAlarmTone(880, 400), 550)
    toast.success('If you did not hear a tone, check your ringer/volume and try again')
  }, [])

  const onChangeInterval = useCallback(
    async (value: string) => {
      const res = await setCheckinInterval(Number(value))
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`Check-in frequency set to every ${value} minutes`)
      await mutate()
    },
    [mutate],
  )

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            Lone worker safety
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking your status…
          </div>
        </CardContent>
      </Card>
    )
  }

  const session = data.session
  const onShift = session?.status === 'active'

  // Engineers may only REDUCE the interval below the configured default (check
  // in more often), never extend it. Offer the default plus any shorter presets.
  const defaultInterval = data.timings.checkinMinutes
  const intervalChoices = Array.from(
    new Set([...INTERVAL_OPTIONS.filter((m) => m <= defaultInterval), defaultInterval]),
  ).sort((a, b) => a - b)

  // Not eligible (role off, disabled, or on leave): show a quiet informative card.
  if (!data.eligible && !onShift) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            Lone worker safety
          </CardTitle>
          <CardDescription>
            {data.ineligibleReason ?? 'Lone worker check-ins are not active for you right now.'}
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className={onShift ? 'border-primary/40' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            Lone worker safety
          </CardTitle>
          {onShift ? (
            <Badge className="gap-1 bg-primary text-primary-foreground">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary-foreground" />
              On shift
            </Badge>
          ) : (
            <Badge variant="secondary">Off shift</Badge>
          )}
        </div>
        <CardDescription>
          {onShift
            ? "Confirm you're safe when prompted. Raise the frequency if your risk increases."
            : 'Start your shift to enable regular safety check-ins.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!onShift ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lw-start" className="text-xs">
                  Shift start
                </Label>
                <Input
                  id="lw-start"
                  type="time"
                  value={seededStart}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lw-end" className="text-xs">
                  Shift end
                </Label>
                <Input
                  id="lw-end"
                  type="time"
                  value={seededEnd}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Check-ins every {data.timings.checkinMinutes} min. Adjust the times above if you&apos;re
              working a different shift today.
            </p>
            <Button onClick={onStart} disabled={starting} className="w-full gap-2">
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Start shift
            </Button>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Shift</p>
                <p className="font-medium tabular-nums">
                  {formatShiftTime(session.shiftStart)} – {formatShiftTime(session.shiftEnd)}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Last check-in</p>
                <p className="font-medium tabular-nums">
                  {new Date(session.lastCheckinAt).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs">
                <Gauge className="h-3.5 w-3.5" />
                Check-in frequency
              </Label>
              <Select
                value={String(session.checkinIntervalMinutes)}
                onValueChange={onChangeInterval}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {intervalChoices.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      Every {m} minutes{m === defaultInterval ? ' (default)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Check in more often (shorter interval) when working in higher-risk conditions. You
                cannot set it longer than the {defaultInterval}-minute default.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={onTestAlarm}
                variant="outline"
                className="flex-1 gap-2"
              >
                <Volume2 className="h-4 w-4" />
                Test alarm
              </Button>
              <Button
                onClick={onFinish}
                disabled={finishing}
                variant="outline"
                className="flex-1 gap-2"
              >
                {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                Finish shift
              </Button>
            </div>
          </>
        )}

        {data.ineligibleReason && onShift && (
          <p className="flex items-center gap-1.5 text-xs text-amber-600">
            <ShieldAlert className="h-3.5 w-3.5" />
            {data.ineligibleReason}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
