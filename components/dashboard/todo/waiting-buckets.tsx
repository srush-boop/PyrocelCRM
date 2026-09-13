'use client'

import Link from 'next/link'
import type { WaitingBucket } from '@/lib/todo/waiting-for-you'
import { BucketIcon } from './todo-icon'
import { Badge } from '@/components/ui/badge'
import { ChevronRight } from 'lucide-react'

function timeAgo(iso?: string | null): string | null {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return 'soon'
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins || 1}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// Renders the aggregated "waiting for you" buckets. Each bucket is a titled
// group; each item deep-links to the screen where it can be actioned.
export function WaitingBuckets({
  buckets,
  onNavigate,
}: {
  buckets: WaitingBucket[]
  onNavigate?: () => void
}) {
  if (buckets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 p-6 text-center">
        <p className="text-sm font-medium">You&apos;re all caught up</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Nothing is waiting on you right now.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {buckets.map((bucket) => (
        <div key={bucket.key}>
          <div className="mb-1.5 flex items-center gap-2 px-1">
            <BucketIcon name={bucket.icon} className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">{bucket.label}</span>
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {bucket.count}
            </Badge>
            <Link
              href={bucket.href}
              onClick={onNavigate}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            >
              View all
            </Link>
          </div>
          <div className="overflow-hidden rounded-lg border border-border/70">
            {bucket.items.map((item, i) => (
              <Link
                key={item.id}
                href={item.href}
                onClick={onNavigate}
                className={`flex items-center gap-3 px-3 py-2 hover:bg-muted/50 ${
                  i > 0 ? 'border-t border-border/60' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{item.title}</p>
                  {item.subtitle && (
                    <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                  )}
                </div>
                {timeAgo(item.timestamp) && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {timeAgo(item.timestamp)}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
