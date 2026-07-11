import type { CSSProperties } from 'react'
import {
  Cctv,
  FireExtinguisher,
  Siren,
  BellRing,
  Lightbulb,
  KeyRound,
  DoorClosed,
  Fan,
  ShieldAlert,
  ShieldCheck,
  Flame,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Centralised helpers for colour-coding and iconography of configured
 * `system_types`. Colours come from the user-configured `color` (hex) on each
 * system type; icons are inferred from the system code/name. Everything here is
 * pure/presentational so it can be used from both server and client components.
 */

export interface SystemLike {
  name?: string | null
  code?: string | null
  color?: string | null
}

// Neutral slate fallback when a system has no configured colour. Works on both
// light and dark themes as an accent.
const FALLBACK_COLOR = '#64748b'

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** Returns a valid hex colour for the system, falling back to a neutral slate. */
export function getSystemHex(color?: string | null): string {
  return color && HEX_RE.test(color.trim()) ? color.trim() : FALLBACK_COLOR
}

/**
 * Resolve a Lucide icon for a system. Matches by code first (fast path for the
 * configured fire/security systems), then by keywords in the name, with a
 * sensible shield fallback for anything bespoke.
 */
export function getSystemIcon(system: SystemLike): LucideIcon {
  const code = (system.code ?? '').trim().toUpperCase()
  const name = (system.name ?? '').toLowerCase()

  const byCode: Record<string, LucideIcon> = {
    FA: BellRing,
    EL: Lightbulb,
    EXT: FireExtinguisher,
    FD: Fan,
    AC: KeyRound,
    CCTV: Cctv,
    INTR: ShieldAlert,
  }
  if (code && byCode[code]) return byCode[code]

  if (name.includes('cctv') || name.includes('camera') || name.includes('surveillance')) return Cctv
  if (name.includes('access')) return KeyRound
  if (name.includes('intrud') || name.includes('burglar') || name.includes('security')) return ShieldAlert
  if (name.includes('extinguish')) return FireExtinguisher
  if (name.includes('damper')) return Fan
  if (name.includes('emergency') || name.includes('light')) return Lightbulb
  if (name.includes('door') || name.includes('escape')) return DoorClosed
  if (name.includes('alarm') || name.includes('detection') || name.includes('fire alarm')) return BellRing
  if (name.includes('fire')) return Flame

  return ShieldCheck
}

export interface SystemColors {
  /** The raw configured colour (or neutral fallback). */
  solid: string
  /** Low-alpha background tint, readable on light and dark themes. */
  tint: string
  /** Mid-alpha border colour. */
  border: string
  /** Theme-aware readable text colour derived from the system hue. */
  text: string
  /** Slightly stronger hue for icons so pale colours stay visible. */
  icon: string
}

/**
 * Derive a small palette from the configured colour using CSS `color-mix`, so
 * the same accent reads correctly in both light and dark mode (text/icon are
 * nudged toward the current `--foreground`).
 */
export function getSystemColors(color?: string | null): SystemColors {
  const hex = getSystemHex(color)
  return {
    solid: hex,
    tint: `color-mix(in srgb, ${hex} 14%, transparent)`,
    border: `color-mix(in srgb, ${hex} 45%, transparent)`,
    text: `color-mix(in srgb, ${hex}, var(--foreground) 30%)`,
    icon: `color-mix(in srgb, ${hex}, var(--foreground) 12%)`,
  }
}

/**
 * Inline style for a system-coloured border treatment (no background fill): a
 * subtle tinted outline on all sides with a stronger solid left-edge accent.
 */
export function systemAccentStyle(color?: string | null): CSSProperties {
  const c = getSystemColors(color)
  return {
    borderColor: c.border,
    borderLeftColor: c.solid,
  }
}

export interface SystemBadgeProps {
  system: SystemLike
  /** Show the leading icon. Defaults to true. */
  showIcon?: boolean
  /** Prefix the label with the system code (e.g. "FA — Fire Alarm"). */
  showCode?: boolean
  /** Render only the code rather than the full name. */
  codeOnly?: boolean
  className?: string
}

/** Colour-coded pill for a system type, with icon + tinted accent. */
export function SystemBadge({
  system,
  showIcon = true,
  showCode = true,
  codeOnly = false,
  className,
}: SystemBadgeProps) {
  const Icon = getSystemIcon(system)
  const c = getSystemColors(system.color)
  const name = system.name ?? 'System'
  const code = system.code?.trim()

  const label = codeOnly && code ? code : showCode && code ? `${code} — ${name}` : name

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium leading-tight',
        className,
      )}
      style={{ backgroundColor: c.tint, borderColor: c.border, color: c.text }}
    >
      {showIcon && (
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: c.icon }} aria-hidden="true" />
      )}
      <span className={cn(codeOnly && 'font-mono')}>{label}</span>
    </span>
  )
}

export interface SystemIconProps {
  system: SystemLike
  /** Tailwind size classes for the icon. Defaults to h-4 w-4. */
  className?: string
  /** Wrap the icon in a tinted rounded square. */
  boxed?: boolean
  /** Size classes for the box when boxed. Defaults to h-8 w-8. */
  boxClassName?: string
}

/** A system's icon rendered in its accent colour, optionally in a tinted tile. */
export function SystemIcon({
  system,
  className,
  boxed = false,
  boxClassName,
}: SystemIconProps) {
  const Icon = getSystemIcon(system)
  const c = getSystemColors(system.color)

  if (boxed) {
    return (
      <span
        className={cn('inline-flex items-center justify-center rounded-md border', boxClassName ?? 'h-8 w-8')}
        style={{ backgroundColor: c.tint, borderColor: c.border }}
        aria-hidden="true"
      >
        <Icon className={cn('h-4 w-4', className)} style={{ color: c.icon }} />
      </span>
    )
  }

  return (
    <Icon
      className={cn('h-4 w-4 shrink-0', className)}
      style={{ color: c.icon }}
      aria-hidden="true"
    />
  )
}

export interface SystemColorDotProps {
  color?: string | null
  className?: string
}

/** Small solid dot in the system colour, for compact lists/legends. */
export function SystemColorDot({ color, className }: SystemColorDotProps) {
  return (
    <span
      className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', className)}
      style={{ backgroundColor: getSystemHex(color) }}
      aria-hidden="true"
    />
  )
}
