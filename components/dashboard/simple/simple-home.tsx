import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SIMPLE_SECTIONS, type SimpleSectionKey } from '@/lib/config/simple-app'
import type { SimpleCounts } from '@/lib/dashboard/simple-counts'

// The Simple-Mode landing screen: a set of large, tap-friendly tiles — one per
// enabled section — each with an icon, title and a live one-line summary.
export function SimpleHome({
  firstName,
  dateLabel,
  enabledKeys,
  counts,
}: {
  firstName: string
  dateLabel: string
  enabledKeys: SimpleSectionKey[]
  counts: SimpleCounts
}) {
  const sections = SIMPLE_SECTIONS.filter((s) => enabledKeys.includes(s.key))

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-balance">Hi, {firstName}</h1>
        <p className="text-sm text-muted-foreground">{dateLabel}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {sections.map((section) => {
          const info = counts[section.key]
          const alert = info?.alert ?? false
          const badge = info && info.count > 0 ? (info.count > 99 ? '99+' : info.count) : null
          return (
            <Link
              key={section.key}
              href={section.href}
              className={cn(
                'group relative flex min-h-36 flex-col justify-between rounded-2xl border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                alert && 'border-destructive/40',
              )}
            >
              <div className="flex items-start justify-between">
                <span
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-xl',
                    alert ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary',
                  )}
                >
                  <section.icon className="h-6 w-6" />
                </span>
                {badge != null && (
                  <span
                    className={cn(
                      'flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
                      alert
                        ? 'bg-destructive text-destructive-foreground'
                        : 'bg-primary/10 text-primary',
                    )}
                  >
                    {badge}
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-1 text-base font-semibold">
                  {section.title}
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <p
                  className={cn(
                    'text-xs',
                    alert ? 'font-medium text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {info?.summary ?? 'Open'}
                </p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
