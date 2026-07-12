'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { ShieldCheck, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getMyLoneWorkerState,
  confirmSafe,
  evaluateMySession,
  pushLocation,
} from '@/app/(dashboard)/dashboard/lone-worker/actions'
import type { LoneWorkerPromptState, MyLoneWorkerState } from '@/lib/lone-worker/types'

type DisplayState = 'none' | 'ok' | 'prompting' | 'amber' | 'red'

const RANK: Record<DisplayState, number> = { none: -1, ok: 0, prompting: 1, amber: 2, red: 3 }

function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

/**
 * Global lone-worker safety overlay. Polls the server for the current user's
 * session, runs a de-drifted 1s countdown, and escalates on-device the instant
 * a deadline passes (also persisted server-side so the office is alerted even if
 * this device is closed). Renders nothing unless the user is on an active shift.
 */
export function LoneWorkerPrompt() {
  const { data, mutate } = useSWR<MyLoneWorkerState | null>(
    'my-lone-worker',
    () => getMyLoneWorkerState(),
    { refreshInterval: 15000, revalidateOnFocus: true },
  )

  const [now, setNow] = useState(() => Date.now())
  const [confirming, setConfirming] = useState(false)
  const evaluatingRef = useRef(false)
  const lastEscalatedRef = useRef<DisplayState>('none')
  const locationSentRef = useRef(false)

  // Clock offset so countdowns match the server's deadlines.
  const offset = useMemo(() => {
    if (!data) return 0
    return data.serverNow - Date.now()
  }, [data])

  // 1s ticker only while there is an active session.
  useEffect(() => {
    if (!data?.session || data.session.status !== 'active') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [data?.session])

  const effectiveNow = now + offset

  const { display, msToNextPrompt, msToAmber, msToRed } = useMemo(() => {
    const s = data?.session
    if (!data || !s || s.status !== 'active') {
      return { display: 'none' as DisplayState, msToNextPrompt: 0, msToAmber: 0, msToRed: 0 }
    }
    const nextPrompt = new Date(s.nextPromptAt).getTime()
    const amberAt = new Date(s.amberAt).getTime()
    const redAt = new Date(s.redAt).getTime()

    let byTime: DisplayState = 'ok'
    if (effectiveNow >= redAt) byTime = 'red'
    else if (effectiveNow >= amberAt) byTime = 'amber'
    else if (effectiveNow >= nextPrompt) byTime = 'prompting'

    // Never show lower than what the server already recorded (device-off case).
    const serverLevel: DisplayState = data.activeLevel ?? s.promptState
    const disp = RANK[byTime] >= RANK[serverLevel] ? byTime : serverLevel

    return {
      display: disp,
      msToNextPrompt: nextPrompt - effectiveNow,
      msToAmber: amberAt - effectiveNow,
      msToRed: redAt - effectiveNow,
    }
  }, [data, effectiveNow])

  // When the local countdown crosses a deadline, persist the transition so the
  // office is alerted immediately (idempotent server-side).
  useEffect(() => {
    if (display === 'none' || display === 'ok') {
      lastEscalatedRef.current = display
      return
    }
    if (RANK[display] > RANK[lastEscalatedRef.current] && !evaluatingRef.current) {
      evaluatingRef.current = true
      evaluateMySession()
        .then(() => mutate())
        .finally(() => {
          evaluatingRef.current = false
        })
    }
    lastEscalatedRef.current = display
  }, [display, mutate])

  // Capture device location on escalation so responders can locate the worker.
  useEffect(() => {
    if (display !== 'amber' && display !== 'red') {
      locationSentRef.current = false
      return
    }
    if (locationSentRef.current || typeof navigator === 'undefined' || !navigator.geolocation) return
    locationSentRef.current = true
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void pushLocation(pos.coords.latitude, pos.coords.longitude)
      },
      () => {
        /* denied/unavailable — engine falls back to live share / home postcode */
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }, [display])

  // Alarm sound loop while a prompt/escalation is on screen.
  const soundEnabled = data?.timings.soundEnabled ?? true
  useEffect(() => {
    if (!soundEnabled) return
    if (display !== 'prompting' && display !== 'amber' && display !== 'red') return

    let ctx: AudioContext | null = null
    const beep = () => {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        ctx = ctx || new AC()
        if (ctx.state === 'suspended') void ctx.resume()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = display === 'red' ? 880 : display === 'amber' ? 660 : 520
        gain.gain.setValueAtTime(0.0001, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.03)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4)
        osc.connect(gain).connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + 0.42)
      } catch {
        /* audio blocked until user interaction — visual alert still applies */
      }
    }
    beep()
    const period = display === 'red' ? 900 : display === 'amber' ? 1400 : 2500
    const id = setInterval(beep, period)
    return () => {
      clearInterval(id)
      if (ctx) void ctx.close()
    }
  }, [display, soundEnabled])

  const onConfirm = useCallback(async () => {
    setConfirming(true)
    const res = await confirmSafe()
    setConfirming(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    lastEscalatedRef.current = 'ok'
    locationSentRef.current = false
    toast.success('Thanks — logged that you are safe')
    await mutate()
  }, [mutate])

  if (display === 'none' || display === 'ok') {
    // Subtle "on shift" pill with the next check-in countdown.
    if (data?.session?.status === 'active' && display === 'ok') {
      return (
        <div className="fixed bottom-24 right-4 z-[80] lg:bottom-6">
          <div className="flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
            <span className="text-muted-foreground">Next check-in</span>
            <span className="tabular-nums text-foreground">{fmt(msToNextPrompt)}</span>
          </div>
        </div>
      )
    }
    return null
  }

  // Floating pulsing button while prompting (non-blocking).
  if (display === 'prompting') {
    return (
      <div className="fixed bottom-24 right-4 z-[90] lg:bottom-6">
        <button
          onClick={onConfirm}
          disabled={confirming}
          className="group relative flex items-center gap-3 rounded-full bg-primary px-6 py-4 text-lg font-bold text-primary-foreground shadow-2xl transition-transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-primary/40 disabled:opacity-70"
          aria-label="Confirm you are safe"
        >
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" aria-hidden />
          <span className="relative flex items-center gap-2">
            {confirming ? <Loader2 className="h-6 w-6 animate-spin" /> : <ShieldCheck className="h-6 w-6" />}
            {"I'm safe"}
          </span>
          <span className="relative rounded-full bg-primary-foreground/20 px-2 py-0.5 text-sm tabular-nums">
            {fmt(msToAmber)}
          </span>
        </button>
      </div>
    )
  }

  // Full-screen flashing takeover for amber/red.
  const isRed = display === 'red'
  return (
    <div
      className={cn(
        'fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 p-6 text-center',
        isRed ? 'lw-flash-red' : 'lw-flash-amber',
      )}
      role="alertdialog"
      aria-modal="true"
      aria-label={isRed ? 'Emergency: confirm you are safe' : 'Warning: confirm you are safe'}
    >
      <div className="flex flex-col items-center gap-3">
        <p className="text-2xl font-semibold uppercase tracking-widest text-white/90">
          {isRed ? 'Emergency' : 'Safety check required'}
        </p>
        <h1 className="text-balance text-4xl font-black text-white md:text-6xl">
          {isRed ? 'Confirm you are safe NOW' : 'Are you safe?'}
        </h1>
        <p className="text-lg text-white/90">
          {isRed
            ? 'An emergency alert has been raised at the office.'
            : `A warning has been raised. Emergency escalates in ${fmt(msToRed)}.`}
        </p>
      </div>

      <button
        onClick={onConfirm}
        disabled={confirming}
        className="flex items-center gap-4 rounded-2xl bg-white px-12 py-8 text-3xl font-black text-neutral-900 shadow-2xl transition-transform hover:scale-105 focus:outline-none focus:ring-8 focus:ring-white/50 disabled:opacity-70 md:text-4xl"
      >
        {confirming ? <Loader2 className="h-10 w-10 animate-spin" /> : <ShieldCheck className="h-10 w-10" />}
        {"I'm safe"}
      </button>

      <p className="text-sm text-white/80">Press the button to confirm your safety and clear this alert.</p>
    </div>
  )
}
