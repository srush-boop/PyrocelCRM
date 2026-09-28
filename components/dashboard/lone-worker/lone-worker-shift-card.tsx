'use client'

import { useCallback, useState, useTransition } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import {
  ShieldCheck,
  ShieldAlert,
  Play,
  Square,
  Clock,
  Gauge,
  Loader2,
  Volume2,
  AlarmClock,
} from 'lucide-react'
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
  extendShift,
} from '@/app/(dashboard)/dashboard/lone-worker/actions'
import {
  formatShiftTime,
  isShiftOverrunning,
  SHIFT_EXTEND_OPTIONS,
  type MyLoneWorkerState,
} from '@/lib/lone-worker/types'

function extendLabel(minutes: number): string {
  return minutes < 60 ? `+${minutes} min` : `+${minutes / 60} hr`
}
import { primeAlarm, playAlarmTone, buzz } from '@/lib/lone-worker/alarm'

// Frequency presets the worker can raise to when risk increases.
const INTERVAL_OPTIONS = [15, 30, 45, 60, 90, 120]

export function LoneWorkerShiftCard() {
  const { data, mutate, isLoading } = useSWR<MyLoneWorkerState | null>(
    'my-lone-worker',
    () => getMyLoneWorkerState(),
    { refreshInterval: 30000 },
  )

  const [end, setEnd] = useState('')
  const [starting, startStarting] = useTransition()
  const [finishing, startFinishing] = useTransition()
  const [extending, startExtending] = useTransition()

  const onExtend = useCallback(
    (minutes: number) => {
      startExtending(async () => {
        const res = await extendShift(minutes)
        if (res.error) {
          toast.error(res.error)
          return
        }
        toast.success(
          res.shiftEnd
            ? `Shift extended to ${formatShiftTime(res.shiftEnd)} — check-ins continue`
            : 'Shift extended',
        )
        await mutate()
      })
    },
    [mutate],
  )

  // The shift start is always "now" (set server-side when Start is pressed), so
  // only the planned end is seeded from the user's work hours.
  const seededEnd = end || data?.defaultShiftEnd || '17:00'

  const onStart = useCallback(() => {
    // Unlock alarm audio now, while we still have the user's tap gesture — iOS
    // blocks Web Audio that isn't primed inside a gesture.
    primeAlarm()
    startStarting(async () => {
      const res = await startShift({ shiftEnd: seededEnd })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Shift started — stay safe out there')
      await mutate()
    })
  }, [seededEnd, mutate])

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
            <div className="space-y-1.5">
              <Label htmlFor="lw-end" className="text-xs">
                Planned shift end
              </Label>
              <Input
                id="lw-end"
                type="time"
                value={seededEnd}
                onChange={(e) => setEnd(e.target.value)}
                className="h-11 appearance-none text-base tabular-nums [&::-webkit-date-and-time-value]:text-left [&::-webkit-datetime-edit]:p-0"
              />
            </div>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Your shift starts now, when you tap Start. Check-ins every{' '}
                {data.timings.checkinMinutes} min. At your planned finish time we&apos;ll ask whether
                you&apos;re still working, so you can finish or extend.
              </span>
            </p>
            <Button onClick={onStart} disabled={starting} className="w-full gap-2">
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Start shift
            </Button>
          </>
        ) : (
          <>
            {isShiftOverrunning(session.shiftEnd, data.serverNow) && (
              <div
                role="alert"
                className="flex flex-col gap-3 rounded-lg border border-amber-500/60 bg-amber-500/10 p-3"
              >
                <div className="flex items-start gap-2">
                  <AlarmClock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-semibold">
                      Your shift was due to end at {formatShiftTime(session.shiftEnd)}
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Still working? Extend your shift, or finish it if you&apos;ve left site.
                      Check-ins carry on until you do.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {SHIFT_EXTEND_OPTIONS.map((m) => (
                    <Button
                      key={m}
                      size="sm"
                      variant="outline"
                      disabled={extending || finishing}
                      onClick={() => onExtend(m)}
                    >
                      {extendLabel(m)}
                    </Button>
                  ))}
                </div>
                <Button
                  size="sm"
                  onClick={onFinish}
                  disabled={finishing || extending}
                  className="gap-2"
                >
                  {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                  Finish shift now
                </Button>
              </div>
            )}

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
                    timeZone: 'Europe/London',
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
