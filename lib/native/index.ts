import { isNativeApp, nativePlatform } from './bridge'
import { registerForPush } from './push'
import { startBackgroundLocation, stopBackgroundLocation } from './background-geo'

export { isNativeApp, nativePlatform } from './bridge'

/**
 * Native lone-worker bootstrap, called from the client once per app open while a
 * shift is active. It:
 *   1. registers the device (push token + a background-ingest secret), and
 *   2. configures + starts safety-grade background location that posts directly
 *      to the server from native code, surviving the app being closed.
 *
 * All of this is a no-op outside the native shell, so it is safe to call
 * unconditionally from shared client components.
 */

let bootstrapped = false

async function registerDevice(): Promise<{ deviceSecret: string; ingestUrl: string } | null> {
  const push = await registerForPush()
  const res = await fetch('/api/native/register-device', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      platform: nativePlatform(),
      pushToken: push?.token ?? null,
      pushProvider: push?.provider ?? null,
    }),
  })
  if (!res.ok) return null
  const json = (await res.json()) as { deviceSecret?: string; ingestUrl?: string }
  if (!json.deviceSecret || !json.ingestUrl) return null
  return { deviceSecret: json.deviceSecret, ingestUrl: json.ingestUrl }
}

export async function startNativeSafety(): Promise<void> {
  if (!isNativeApp() || bootstrapped) return
  bootstrapped = true
  try {
    const reg = await registerDevice()
    if (!reg) {
      bootstrapped = false
      return
    }
    const ok = await startBackgroundLocation(reg)
    if (!ok) bootstrapped = false
  } catch (err) {
    console.log('[v0] native safety bootstrap failed:', (err as Error).message)
    bootstrapped = false
  }
}

export async function stopNativeSafety(): Promise<void> {
  if (!isNativeApp()) return
  await stopBackgroundLocation()
  bootstrapped = false
}
