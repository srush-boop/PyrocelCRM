import { Capacitor } from '@capacitor/core'

/**
 * Thin, SSR-safe helpers for detecting the Capacitor native shell.
 *
 * The CRM is a server-rendered Next.js app that cannot be statically exported,
 * so the native apps use Capacitor's remote-URL model: the iOS/Android shell
 * loads the deployed site in a WebView and injects the native bridge. This
 * module only imports `@capacitor/core` (isomorphic — returns "web" in a normal
 * browser and during SSR), so importing it anywhere is safe. The heavy native
 * plugins are dynamically imported elsewhere, guarded by `isNativeApp()`.
 */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export function nativePlatform(): 'ios' | 'android' | 'web' {
  try {
    const p = Capacitor.getPlatform()
    return p === 'ios' || p === 'android' ? p : 'web'
  } catch {
    return 'web'
  }
}
