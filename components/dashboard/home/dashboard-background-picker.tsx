'use client'

import { useState, useTransition } from 'react'
import { Check, Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DASHBOARD_BACKGROUNDS, resolveDashboardBackground } from '@/lib/dashboard/backgrounds'
import { setDashboardBackground } from '@/app/(dashboard)/dashboard/tile-color-actions'

/**
 * Header control that lets a user pick the home dashboard background from a set
 * of subtle on-brand technical patterns. Selection persists to the profile via
 * `setDashboardBackground`; the full-bleed layer (`[data-dashboard-bg]`) is
 * repainted optimistically so the change is instant.
 */
export function DashboardBackgroundPicker({ current }: { current: string | null }) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string>(resolveDashboardBackground(current).key)
  const [isPending, startTransition] = useTransition()

  function apply(key: string) {
    const prev = selected
    setSelected(key)

    // Optimistically repaint the live background layer so the change is instant.
    if (typeof document !== 'undefined') {
      const layer = document.querySelector<HTMLElement>('[data-dashboard-bg]')
      if (layer) {
        for (const bg of DASHBOARD_BACKGROUNDS) {
          if (bg.className) layer.classList.remove(bg.className)
        }
        const chosen = resolveDashboardBackground(key)
        if (chosen.className) layer.classList.add(chosen.className)
        // Image presets also need the photo set via the CSS custom property the
        // `.dash-bg-image` scrim rule reads; clear it for non-image presets.
        if (chosen.imageUrl) {
          layer.style.setProperty('--dash-bg-image', `url(${chosen.imageUrl})`)
        } else {
          layer.style.removeProperty('--dash-bg-image')
        }
      }
    }

    startTransition(async () => {
      const res = await setDashboardBackground(key)
      if (res.ok) {
        toast.success('Dashboard background updated')
      } else {
        setSelected(prev)
        toast.error(res.error || 'Could not update background')
      }
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <ImageIcon className="mr-2 h-4 w-4" />
          Background
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <p className="mb-1 text-sm font-medium">Dashboard background</p>
        <p className="mb-3 text-xs text-muted-foreground">
          A subtle pattern or image behind your dashboard. Only you see this.
        </p>
        <div
          className="grid max-h-[22rem] grid-cols-3 gap-2 overflow-y-auto pr-1"
          role="radiogroup"
          aria-label="Dashboard background"
        >
          {DASHBOARD_BACKGROUNDS.map((bg) => {
            const isSelected = bg.key === selected
            return (
              <button
                key={bg.key}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={bg.label}
                title={bg.description}
                disabled={isPending}
                onClick={() => apply(bg.key)}
                className={cn(
                  'group flex flex-col items-center gap-1.5 rounded-lg border p-1.5 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                  isSelected ? 'border-primary ring-2 ring-primary/40' : 'hover:border-primary/50',
                )}
              >
                <span
                  className={cn(
                    'relative flex h-12 w-full items-center justify-center overflow-hidden rounded-md border bg-card bg-cover bg-center',
                    bg.className,
                  )}
                  style={
                    bg.imageUrl
                      ? ({
                          backgroundImage: `url(${bg.imageUrl})`,
                          '--dash-bg-image': `url(${bg.imageUrl})`,
                        } as React.CSSProperties)
                      : undefined
                  }
                  aria-hidden="true"
                >
                  {isSelected && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}
                </span>
                <span className="text-[0.7rem] font-medium leading-tight">{bg.label}</span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
