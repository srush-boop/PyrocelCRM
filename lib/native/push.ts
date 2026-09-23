import { isNativeApp, nativePlatform } from './bridge'

/**
 * Native push registration. Returns the device push token so the server can
 * target this install for emergency escalations that reach a locked phone even
 * when the WebView is not running. Dynamically imported; inert on the web.
 *
 * On Android the token is an FCM token; on iOS it is the APNs token (the native
 * project registers with Firebase so both can be delivered via FCM — see the
 * native-app runbook).
 */
export async function registerForPush(): Promise<
  { token: string; provider: 'fcm' | 'apns' } | null
> {
  if (!isNativeApp()) return null
  try {
    const mod = await import('@capacitor/push-notifications')
    const { PushNotifications } = mod

    const perm = await PushNotifications.requestPermissions()
    if (perm.receive !== 'granted') return null

    // Android 8+ requires an explicit channel. Create a high-importance
    // "lone-worker" channel so escalation pushes surface loudly — the server
    // targets this exact channel id when sending emergency notifications.
    if (nativePlatform() === 'android') {
      try {
        await PushNotifications.createChannel({
          id: 'lone-worker',
          name: 'Lone Worker Safety',
          description: 'Emergency lone-worker check-ins and escalation alerts',
          importance: 5,
          visibility: 1,
          sound: 'default',
          vibration: true,
          lights: true,
        })
      } catch (err) {
        console.log('[v0] channel create failed:', (err as Error).message)
      }
    }

    const token = await new Promise<string | null>((resolve) => {
      let settled = false
      const done = (v: string | null) => {
        if (!settled) {
          settled = true
          resolve(v)
        }
      }
      void PushNotifications.addListener('registration', (t) => done(t.value))
      void PushNotifications.addListener('registrationError', () => done(null))
      void PushNotifications.register()
      // Don't hang the bootstrap if the platform never calls back.
      setTimeout(() => done(null), 15_000)
    })

    if (!token) return null
    return { token, provider: nativePlatform() === 'ios' ? 'apns' : 'fcm' }
  } catch (err) {
    console.log('[v0] push registration failed:', (err as Error).message)
    return null
  }
}
