import type { MetadataRoute } from 'next'

// PWA manifest so the CRM can be installed to the home screen on phones/tablets
// and launch in a standalone, app-like window. Icons reuse the existing assets.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Pyrocel Fire & Security CRM',
    short_name: 'Pyrocel',
    description:
      'Pyrocel Fire & Security CRM for managing fire alarm, damper, and emergency lighting testing services',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon.svg',
        type: 'image/svg+xml',
        sizes: 'any',
        purpose: 'any',
      },
      {
        src: '/apple-icon.png',
        type: 'image/png',
        sizes: '180x180',
        purpose: 'maskable',
      },
    ],
  }
}
