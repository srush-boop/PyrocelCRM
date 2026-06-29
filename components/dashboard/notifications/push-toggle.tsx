'use client'

import { useEffect, useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  savePushSubscription,
  removePushSubscription,
} from '@/app/(dashboard)/dashboard/notifications/actions'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

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
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        toast.error('Notification permission was denied.')
        return
      }
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY as string),
      })
      const json = sub.toJSON()
      const res = await savePushSubscription({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
        userAgent: navigator.userAgent,
      })
      if (!res.ok) {
        toast.error(res.error || 'Could not enable push notifications.')
        return
      }
      setEnabled(true)
      toast.success('Push notifications enabled on this device.')
    } catch (err) {
      toast.error('Could not enable push notifications.')
      console.log('[v0] push enable error:', (err as Error).message)
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
