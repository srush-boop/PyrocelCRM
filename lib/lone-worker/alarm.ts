'use client'

/**
 * Lone-worker alarm audio.
 *
 * iOS Safari will not play Web Audio unless the AudioContext was created/resumed
 * inside a user gesture, and it silences Web Audio when the hardware ring/silent
 * switch is on unless the page opts into a "playback" audio session. Because the
 * safety alarm fires on a timer (i.e. NOT during a tap), we must:
 *   1. Keep a single persistent AudioContext for the whole session.
 *   2. Prime (create + resume + play a silent buffer) it on a real user gesture
 *      — starting a shift, tapping "I'm safe", or the first tap anywhere.
 *   3. Set navigator.audioSession.type = 'playback' (iOS 16.4+) so the alarm is
 *      audible even when the phone is on silent.
 * Once primed, programmatic beeps work for as long as the tab stays foregrounded.
 */

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext }
type AudioSessionNav = Navigator & { audioSession?: { type?: string } }

let ctx: AudioContext | null = null
let masterGain: GainNode | null = null
let unlocked = false
let gestureListenerInstalled = false

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as WebkitWindow).webkitAudioContext
    if (!AC) return null
    try {
      ctx = new AC()
    } catch {
      return null
    }
  }
  return ctx
}

/**
 * A shared output chain: master gain → limiter → destination. The limiter lets
 * us drive the level hard (loud alarm) while catching peaks so it stays clear
 * instead of distorting. Created lazily once per context.
 */
function getOutputNode(c: AudioContext): AudioNode {
  if (masterGain) return masterGain
  const gain = c.createGain()
  gain.gain.value = 1
  const limiter = c.createDynamicsCompressor()
  // Aggressive limiter settings so the loud tone stays controlled.
  limiter.threshold.value = -6
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.002
  limiter.release.value = 0.1
  gain.connect(limiter).connect(c.destination)
  masterGain = gain
  return gain
}

// Ask iOS to treat our audio as playback so it ignores the mute switch.
function configureAudioSession() {
  try {
    const nav = navigator as AudioSessionNav
    if (nav.audioSession && nav.audioSession.type !== 'playback') {
      nav.audioSession.type = 'playback'
    }
  } catch {
    /* not supported — falls back to default (mute switch respected) */
  }
}

/**
 * Unlock audio output. MUST be called from within a user gesture on iOS.
 * Idempotent and cheap, so it can be called on every gesture.
 */
export function primeAlarm(): void {
  const c = getCtx()
  if (!c) return
  configureAudioSession()
  if (c.state === 'suspended') void c.resume()
  try {
    // A one-sample silent buffer is the canonical iOS unlock trick.
    const buffer = c.createBuffer(1, 1, 22050)
    const src = c.createBufferSource()
    src.buffer = buffer
    src.connect(c.destination)
    src.start(0)
    unlocked = true
  } catch {
    /* ignore */
  }
}

export function isAlarmUnlocked(): boolean {
  return unlocked
}

/**
 * Play a single alarm tone. No-op if audio was never unlocked.
 *
 * For maximum audibility on a phone speaker we:
 *   - use a square wave (far louder/harsher than a sine at the same level),
 *   - layer a detuned sawtooth so the tone cuts through ambient noise,
 *   - hold the tone at a high, near-constant level (a sustained tone reads as
 *     much louder than one that decays), and
 *   - route through the shared limiter so the high level stays clean.
 */
export function playAlarmTone(frequency: number, durationMs = 400): void {
  const c = getCtx()
  if (!c) return
  // Best-effort resume in case iOS suspended it; only works while foregrounded.
  if (c.state === 'suspended') void c.resume()
  try {
    const out = getOutputNode(c)
    const t = c.currentTime
    const dur = durationMs / 1000

    const gain = c.createGain()
    // Short attack, long hold near peak, short release — no long fade-out.
    const peak = 0.9
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.008)
    gain.gain.setValueAtTime(peak, t + Math.max(0.02, dur - 0.03))
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    gain.connect(out)

    // Primary square tone.
    const osc = c.createOscillator()
    osc.type = 'square'
    osc.frequency.value = frequency
    osc.connect(gain)
    osc.start(t)
    osc.stop(t + dur + 0.02)

    // Detuned sawtooth layer an octave up for extra bite/presence.
    const osc2 = c.createOscillator()
    osc2.type = 'sawtooth'
    osc2.frequency.value = frequency * 2
    const gain2 = c.createGain()
    gain2.gain.value = 0.35
    osc2.connect(gain2).connect(gain)
    osc2.start(t)
    osc2.stop(t + dur + 0.02)
  } catch {
    /* ignore */
  }
}

/** Buzz the device where supported (Android; iOS Safari ignores this). */
export function buzz(pattern: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern)
    }
  } catch {
    /* ignore */
  }
}

/**
 * Install a one-time-ish global listener that primes audio on the first user
 * interaction, so the alarm can sound later even if the worker never tapped a
 * shift button on this device. Re-primes on each gesture (cheap) to recover
 * from iOS suspending the context, then stops once unlocked.
 */
export function installAlarmUnlockOnGesture(): () => void {
  if (typeof window === 'undefined' || gestureListenerInstalled) {
    return () => {}
  }
  gestureListenerInstalled = true
  const handler = () => {
    primeAlarm()
    if (unlocked) {
      window.removeEventListener('pointerdown', handler)
      window.removeEventListener('touchend', handler)
      window.removeEventListener('keydown', handler)
      gestureListenerInstalled = false
    }
  }
  const opts: AddEventListenerOptions = { passive: true }
  window.addEventListener('pointerdown', handler, opts)
  window.addEventListener('touchend', handler, opts)
  window.addEventListener('keydown', handler, opts)
  return () => {
    window.removeEventListener('pointerdown', handler)
    window.removeEventListener('touchend', handler)
    window.removeEventListener('keydown', handler)
    gestureListenerInstalled = false
  }
}
