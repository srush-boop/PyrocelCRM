'use client'

import type { ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Shared building blocks for grid pages so every list uses the same section
// header + filter-toolbar layout. Keep these purely presentational.

/**
 * Section header for a grid: a title (and optional description) on the left with
 * an optional actions cluster (buttons, create dialogs) on the right.
 */
export function GridHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight text-balance">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground text-pretty">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  )
}

/**
 * Filter toolbar row for a grid. Place a `GridSearch`, `Select`s and a
 * `GridClearButton` inside; pass a `meta` node (e.g. "12 of 40 sites") to pin a
 * summary to the right edge.
 */
export function GridToolbar({
  children,
  meta,
  className,
}: {
  children: ReactNode
  meta?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {children}
      {meta && <span className="ml-auto text-sm text-muted-foreground">{meta}</span>}
    </div>
  )
}

/** Standardised search field used inside `GridToolbar`. */
export function GridSearch({
  value,
  onChange,
  placeholder = 'Search...',
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('relative min-w-[180px] max-w-sm flex-1', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9"
      />
    </div>
  )
}

/** Standardised "clear filters" button. Render only when filters are active. */
export function GridClearButton({
  onClick,
  className,
}: {
  onClick: () => void
  className?: string
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn('gap-1.5 text-muted-foreground hover:text-foreground', className)}
    >
      <X className="h-4 w-4" />
      Clear
    </Button>
  )
}
