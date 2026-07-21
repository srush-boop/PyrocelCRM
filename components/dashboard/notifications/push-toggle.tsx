'use client'

import { useEffect, useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  savePushSubscription,
  removePushSubscription,
} from '@/app/(dashboard)/dashboard/notifications/actions'
import { getVapidPublicKey, vapidPublicKeyToBytes } from '@/lib/push-vapid'

// Always resolves to a valid key (env value if sound, else baked-in fallback).
const VAPID_PUBLIC_KEY = getVapidPublicKey()

export function PushToggle() {
  const [supported, setSupported] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const ok =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      !!VAPID_PUBLIC_KEY
    setSupported(ok)
    if (!ok) return

    // Reflect current subscription state.
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEnabled(!!sub))
      .catch(() => {})
  }, [])

  async function enable() {
    setBusy(true)
    try {
      // iOS only allows web push when the site is installed to the Home Screen
      // (running standalone). In a Safari tab, subscribe() throws a vague error,
      // so guide the user explicitly instead.
      const isIOS =
        /iP(hone|ad|od)/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        // iOS Safari exposes this non-standard flag when launched from Home Screen.
        (navigator as Navigator & { standalone?: boolean }).standalone === true
      if (isIOS && !isStandalone) {
        toast.error(
          'On iPhone/iPad, first add this app to your Home Screen (Share → Add to Home Screen), then open it from there and enable notifications.',
          { duration: 8000 },
        )
        return
      }

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        toast.error(
          permission === 'denied'
            ? 'Notifications are blocked. Enable them for this app in your browser/OS settings, then try again.'
            : 'Notification permission was not granted.',
          { duration: 7000 },
        )
        return
      }

      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      // Reuse an existing subscription; if it was made with a different (old)
      // VAPID key, subscribe() would throw InvalidStateError, so drop it first.
      let sub = await reg.pushManager.getSubscription()
      if (sub) {
        const existingKey = sub.options?.applicationServerKey
        const wantKey = vapidPublicKeyToBytes()
        const sameKey =
          existingKey &&
          new Uint8Array(existingKey).length === wantKey.length &&
          new Uint8Array(existingKey).every((b, i) => b === wantKey[i])
        if (!sameKey) {
          await sub.unsubscribe().catch(() => {})
          sub = null
        }
      }
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidPublicKeyToBytes(),
        })
      }

      const json = sub.toJSON()
      const res = await savePushSubscription({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
        userAgent: navigator.userAgent,
      })
      if (!res.ok) {
        toast.error(res.error || 'Could not save this device.')
        return
      }
      setEnabled(true)
      toast.success('Push notifications enabled on this device.')
    } catch (err) {
      // Surface the real reason so field issues can actually be diagnosed.
      const message = err instanceof Error ? err.message : String(err)
      toast.error(`Could not enable push: ${message}`, { duration: 8000 })
      console.log('[v0] push enable error:', message)
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await removePushSubscription(sub.endpoint)
        await sub.unsubscribe()
      }
      setEnabled(false)
      toast.success('Push notifications disabled on this device.')
    } catch (err) {
      toast.error('Could not disable push notifications.')
      console.log('[v0] push disable error:', (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!supported) {
    return (
      <p className="text-xs text-muted-foreground">
        Browser push is unavailable on this device.
      </p>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor="push-toggle" className="text-xs font-normal text-muted-foreground">
        Browser push on this device
      </Label>
      <Switch
        id="push-toggle"
        checked={enabled}
        disabled={busy}
        onCheckedChange={(checked) => (checked ? enable() : disable())}
      />
    </div>
  )
}
