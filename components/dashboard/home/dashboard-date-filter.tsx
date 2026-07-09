'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CalendarRange, X } from 'lucide-react'

/**
 * Global date-range filter for the company dashboard. Writes `from`/`to`
 * (yyyy-MM-dd) to the URL search params; the server page reads them and, when
 * both are present, applies the range to every metric (PPM, Sales, Defects),
 * overriding the per-card defaults (current month for PPM, last 60 days for
 * values).
 */
export function DashboardDateFilter({
  initialFrom,
  initialTo,
}: {
  initialFrom: string
  initialTo: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)

  const hasFilter = Boolean(searchParams.get('from') && searchParams.get('to'))

  const apply = () => {
    if (!from || !to) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('from', from)
    params.set('to', to)
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  const clear = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('from')
    params.delete('to')
    setFrom('')
    setTo('')
    startTransition(() => router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname))
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <CalendarRange className="h-4 w-4" />
        <span>Date range</span>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="dash-from" className="text-xs text-muted-foreground">
          From
        </label>
        <Input
          id="dash-from"
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => setFrom(e.target.value)}
          className="h-9 w-[10rem]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="dash-to" className="text-xs text-muted-foreground">
          To
        </label>
        <Input
          id="dash-to"
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => setTo(e.target.value)}
          className="h-9 w-[10rem]"
        />
      </div>
      <Button onClick={apply} disabled={!from || !to || isPending} className="h-9">
        Apply
      </Button>
      {hasFilter && (
        <Button variant="ghost" onClick={clear} disabled={isPending} className="h-9 gap-1">
          <X className="h-4 w-4" />
          Clear
        </Button>
      )}
    </div>
  )
}
