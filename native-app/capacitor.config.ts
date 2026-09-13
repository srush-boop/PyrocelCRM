import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor config for the Pyrocel CRM native shell.
 *
 * The CRM is a server-rendered Next.js app that cannot be statically exported,
 * so we use Capacitor's remote-URL model: the native app is a WebView pointing
 * at the deployed site (`server.url`). All UI, auth, and data come from the live
 * site — the native project exists purely to add the capabilities a browser
 * can't provide (background location, native push, critical alerts).
 *
 * Set CRM_URL at build time to the production URL (defaults to the value baked
 * in below). It MUST be https for background push/geolocation to work.
 */
const CRM_URL = process.env.CRM_URL || 'https://REPLACE_WITH_PRODUCTION_URL'

const config: CapacitorConfig = {
  appId: 'com.pyrocel.crm',
  appName: 'Pyrocel CRM',
  // No local web assets — everything is served from the remote CRM.
  webDir: 'www',
  server: {
    url: CRM_URL,
    cleartext: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config
