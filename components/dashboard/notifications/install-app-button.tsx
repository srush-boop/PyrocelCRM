'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Download, Share, Plus, Check } from 'lucide-react'

// Chrome/Edge/Android fire this before offering to install; we capture it so the
// user can trigger the native prompt from our own button instead.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * "Pin to home screen" control. Uses the native install prompt where the browser
 * supports it (Android/Chrome/desktop), falls back to Share-sheet instructions on
 * iOS Safari, and hides itself once the app is already installed (standalone).
 */
export function InstallAppButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [showIosHelp, setShowIosHelp] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Already launched as an installed app? Then there's nothing to offer.
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari exposes this non-standard flag when launched from the home screen.
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    setInstalled(standalone)

    const ua = window.navigator.userAgent
    const iOS = /iphone|ipad|ipod/i.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream
    setIsIOS(iOS)

    const onBeforeInstall = (e: Event) => {
      e.preventDefault() // stop the mini-infobar; we drive the prompt ourselves
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function handleInstall() {
    if (!deferred) return
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setDeferred(null)
  }

  if (installed) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Check className="h-3.5 w-3.5 text-emerald-600" />
        Installed on this device
      </div>
    )
  }

  // Native prompt available (Android / Chrome / desktop).
  if (deferred) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Image src="/icon-192.png" alt="" width={20} height={20} className="rounded" />
          <span className="text-xs text-muted-foreground">Add Pyrocel to your home screen</span>
        </div>
        <Button size="sm" className="h-7 gap-1.5 px-2.5 text-xs" onClick={handleInstall}>
          <Download className="h-3.5 w-3.5" />
          Install
        </Button>
      </div>
    )
  }

  // iOS Safari: no programmatic prompt, so show the manual steps.
  if (isIOS) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Image src="/icon-192.png" alt="" width={20} height={20} className="rounded" />
            <span className="text-xs text-muted-foreground">Add Pyrocel to your home screen</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2.5 text-xs"
            onClick={() => setShowIosHelp((v) => !v)}
            aria-expanded={showIosHelp}
          >
            <Plus className="h-3.5 w-3.5" />
            How
          </Button>
        </div>
        {showIosHelp && (
          <ol className="space-y-1 rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5">
              1. Tap the Share icon
              <Share className="h-3.5 w-3.5" />
              in Safari&apos;s toolbar
            </li>
            <li className="flex items-center gap-1.5">
              2. Choose &quot;Add to Home Screen&quot;
              <Plus className="h-3.5 w-3.5" />
            </li>
            <li>3. Tap &quot;Add&quot; to finish</li>
          </ol>
        )}
      </div>
    )
  }

  // Other browsers that don't support install (e.g. Firefox desktop): offer guidance.
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Download className="h-3.5 w-3.5" />
      Use your browser menu to install this app
    </div>
  )
}
