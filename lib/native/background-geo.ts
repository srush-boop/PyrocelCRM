import { isNativeApp } from './bridge'

/**
 * Safety-grade background location for the native lone-worker apps, backed by
 * `@transistorsoft/capacitor-background-geolocation`.
 *
 * The whole point of going native is that this keeps tracking after the phone is
 * locked, the app is backgrounded, or the app is force-quit — the exact cases a
 * browser cannot cover. Critically, the plugin's native HTTP layer posts fixes
 * DIRECTLY to our ingest endpoint from native code, so location keeps flowing to
 * the office even when no JavaScript/WebView is running. The web layer here only
 * has to configure it once per app open; native does the rest.
 *
 * The plugin is dynamically imported and only ever touched inside the native
 * shell, so this module is inert on the web and during SSR.
 */

let started = false

export async function startBackgroundLocation(opts: {
  ingestUrl: string
  deviceSecret: string
}): Promise<boolean> {
  if (!isNativeApp()) return false
  try {
    const mod = await import('@transistorsoft/capacitor-background-geolocation')
    const BackgroundGeolocation = mod.default

    await BackgroundGeolocation.ready({
      // --- Tracking fidelity ---
      desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
      distanceFilter: 25, // metres of movement before a new fix
      locationUpdateInterval: 60_000, // Android time-based fallback
      elasticityMultiplier: 1,

      // --- Survive lock / background / reboot ---
      stopOnTerminate: false,
      startOnBoot: true,
      enableHeadless: true,
      foregroundService: true,
      backgroundPermissionRationale: {
        title: 'Allow Pyrocel to track location in the background?',
        message:
          'This lets us confirm your whereabouts during a lone-worker shift and locate you in an emergency, even when the app is closed.',
        positiveAction: 'Allow',
      },
      locationAuthorizationRequest: 'Always',

      // --- Native HTTP auto-post (works with the app closed) ---
      url: opts.ingestUrl,
      httpRootProperty: '.', // post the location JSON at the body root
      autoSync: true,
      autoSyncThreshold: 0, // post each fix immediately
      batchSync: false,
      headers: { Authorization: `Bearer ${opts.deviceSecret}` },
      maxRecordsToPersist: 200, // queue while offline, flush on reconnect

      // --- Housekeeping ---
      debug: false,
      logLevel: BackgroundGeolocation.LOG_LEVEL_OFF,
      stopTimeout: 5,
    })

    if (!started) {
      await BackgroundGeolocation.start()
      started = true
    }
    return true
  } catch (err) {
    console.log('[v0] background-geo start failed:', (err as Error).message)
    return false
  }
}

export async function stopBackgroundLocation(): Promise<void> {
  if (!isNativeApp() || !started) return
  try {
    const mod = await import('@transistorsoft/capacitor-background-geolocation')
    await mod.default.stop()
    started = false
  } catch (err) {
    console.log('[v0] background-geo stop failed:', (err as Error).message)
  }
}
