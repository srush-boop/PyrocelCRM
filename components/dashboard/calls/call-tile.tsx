'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { STATUS_TONE_CLASS } from '@/lib/status-colors'
import { cn, formatDateUK } from '@/lib/utils'
import {
  Clock,
  ClipboardCheck,
  PauseCircle,
  AlertCircle,
  Flame,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  CalendarIcon,
  User,
  Shield,
  Coins,
  Receipt,
  FileText,
  Wrench,
  RotateCcw,
  MapPin,
} from 'lucide-react'

// ─── Shared status / result badges ─────────────────────────────────────────────
// These are the canonical call-status and call-result chips used everywhere a
// call is summarised. They map onto the shared semantic palette in
// lib/status-colors.ts so a status always reads the same colour across the app.

export function CallStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="outline" className={cn('gap-1', STATUS_TONE_CLASS.neutral)}>
          <Clock className="h-3 w-3" /> Pending
        </Badge>
      )
    case 'in_progress':
      return (
        <Badge variant="outline" className={cn('gap-1', STATUS_TONE_CLASS.info)}>
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-600" aria-hidden />
          In Progress
        </Badge>
      )
    case 'paused':
      return (
        <Badge variant="outline" className={cn('gap-1', STATUS_TONE_CLASS.warning)}>
          <PauseCircle className="h-3 w-3" /> Paused
        </Badge>
      )
    case 'completed':
      return (
        <Badge variant="outline" className={cn('gap-1', STATUS_TONE_CLASS.success)}>
          <ClipboardCheck className="h-3 w-3" /> Completed
        </Badge>
      )
    case 'cancelled':
      return (
        <Badge variant="outline" className={cn('gap-1', STATUS_TONE_CLASS.neutral)}>
          <XCircle className="h-3 w-3" /> Cancelled
        </Badge>
      )
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

export function CallResultBadge({ status }: { status: string }) {
  switch (status) {
    case 'pass':
      return (
        <Badge variant="outline" className={cn('gap-1', STATUS_TONE_CLASS.success)}>
          <CheckCircle2 className="h-3 w-3" /> Pass
        </Badge>
      )
    case 'fail':
      return (
        <Badge variant="outline" className={cn('gap-1', STATUS_TONE_CLASS.danger)}>
          <XCircle className="h-3 w-3" /> Fail
        </Badge>
      )
    case 'partial':
      return (
        <Badge variant="outline" className={cn('gap-1', STATUS_TONE_CLASS.warning)}>
          <AlertCircle className="h-3 w-3" /> Partial
        </Badge>
      )
    case 'no_access':
      return (
        <Badge variant="outline" className={cn('gap-1', STATUS_TONE_CLASS.neutral)}>
          <AlertTriangle className="h-3 w-3" /> No Access
        </Badge>
      )
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

function formatPence(pence: number) {
  return `£${(pence / 100).toFixed(2)}`
}

// ─── CallTile ───────────────────────────────────────────────────────────────
// The single, compact call-overview tile used across the app. It is purely
// presentational: callers compute the values and pass them in, plus optional
// slots for surface-specific extras (system icon, site flags, an assign
// control, action buttons). This is the template for ANY new call overview.

export interface CallTileFollowUp {
  attemptLabel: string
  originRef?: string | null
  originId?: string | null
}

export interface CallTileProps {
  /** Primary heading — the service name (calls grid) or site name (schedule). */
  title: string
  /** Optional secondary line under the title (e.g. "Service · Visit type"). */
  subtitle?: string | null
  /** Call lifecycle status; drives the status chip. */
  status: string
  /** Completed call outcome (pass/fail/partial/no_access); shows a result chip. */
  result?: string | null

  // ── Meta row ──
  reference?: string | null
  scheduledDate?: string | null
  completedDate?: string | null
  isOverdue?: boolean
  engineerName?: string | null
  valuePence?: number | null
  address?: string | null
  /** Formatted booked slot string, or null to show a "Not booked" chip. */
  bookedSlot?: string | null
  /** Whether to render the booked/not-booked chip at all. */
  showBooking?: boolean

  // ── Flag badges (baked in for consistency) ──
  systemName?: string | null
  isEmergency?: boolean
  /** Pulse the emergency marker (engineer-facing surfaces). */
  emergencyAnimated?: boolean
  isRemedial?: boolean
  followUp?: CallTileFollowUp | null
  failedFirstFix?: boolean
  chargeable?: boolean
  awaitingReview?: boolean
  invoiced?: boolean
  reviewed?: boolean

  // ── Slots ──
  /** Leading visual, typically a boxed system icon. */
  leading?: ReactNode
  /** Extra badges appended to the identity row (site flags, worker type, …). */
  extraBadges?: ReactNode
  /** Secondary control area below the meta row (e.g. assign control). */
  secondary?: ReactNode
  /** Right-hand action buttons (View, Report, Send …). */
  actions?: ReactNode

  /** Left-border accent colour (e.g. system colour). Overridden when overdue. */
  accentColor?: string
  className?: string
}

export function CallTile({
  title,
  subtitle,
  status,
  result,
  reference,
  scheduledDate,
  completedDate,
  isOverdue,
  engineerName,
  valuePence,
  address,
  bookedSlot,
  showBooking,
  systemName,
  isEmergency,
  emergencyAnimated,
  isRemedial,
  followUp,
  failedFirstFix,
  chargeable,
  awaitingReview,
  invoiced,
  reviewed,
  leading,
  extraBadges,
  secondary,
  actions,
  accentColor,
  className,
}: CallTileProps) {
  const isCompleted = status === 'completed'
  // Accent: overdue always wins (destructive); else a supplied system colour;
  // else in-progress uses the brand primary; otherwise a plain border.
  const accentStyle =
    !isOverdue && accentColor ? { borderLeftColor: accentColor } : undefined
  const dateValue = isCompleted && completedDate ? completedDate : scheduledDate

  return (
    <Card
      className={cn(
        'border-l-4 transition-colors',
        isOverdue
          ? 'border-l-destructive'
          : accentColor
            ? ''
            : status === 'in_progress'
              ? 'border-l-primary'
              : 'border-l-border',
        className,
      )}
      style={accentStyle}
    >
      <CardContent className="p-2.5">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          {/* Left: leading icon + core identity */}
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {leading}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {/* Row 1: title + status + result + system + flags */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {isEmergency && emergencyAnimated && (
                  <Flame
                    className="h-4 w-4 shrink-0 animate-pulse text-destructive"
                    role="img"
                    aria-label="Emergency call"
                  />
                )}
                <span className="font-semibold text-pretty">{title}</span>
                <CallStatusBadge status={status} />
                {isCompleted && result && <CallResultBadge status={result} />}
                {systemName && (
                  <Badge variant="secondary" className="gap-1 text-xs font-normal">
                    <Shield className="h-3 w-3" />
                    {systemName}
                  </Badge>
                )}
                {isEmergency && !emergencyAnimated && (
                  <Badge variant="destructive" className="gap-1 text-xs">
                    <Flame className="h-3 w-3" /> Emergency
                  </Badge>
                )}
                {isRemedial && <Badge variant="outline" className="text-xs">Remedial</Badge>}
                {followUp && (
                  <Badge
                    variant="outline"
                    className="gap-1 border-primary/30 bg-primary/10 text-xs text-primary"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Follow-up · {followUp.attemptLabel}
                  </Badge>
                )}
                {failedFirstFix && (
                  <Badge
                    variant="outline"
                    className="gap-1 border-destructive/30 bg-destructive/10 text-xs text-destructive"
                  >
                    <XCircle className="h-3 w-3" />
                    First-time fix: No
                  </Badge>
                )}
                {chargeable && (
                  <Badge
                    variant="outline"
                    className="gap-1 border-amber-400/30 bg-amber-500/10 text-xs text-amber-700"
                  >
                    <Coins className="h-3 w-3" />
                    Chargeable
                  </Badge>
                )}
                {awaitingReview && (
                  <Badge
                    variant="outline"
                    className="gap-1 border-orange-400/30 bg-orange-500/10 text-xs text-orange-700"
                  >
                    <AlertCircle className="h-3 w-3" />
                    Awaiting review
                  </Badge>
                )}
                {invoiced && (
                  <Badge
                    variant="outline"
                    className="gap-1 border-blue-400/30 bg-blue-500/10 text-xs text-blue-700"
                  >
                    <Receipt className="h-3 w-3" />
                    Invoiced
                  </Badge>
                )}
                {reviewed && (
                  <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
                    <Wrench className="h-3 w-3" />
                    Reviewed
                  </Badge>
                )}
                {extraBadges}
              </div>

              {/* Subtitle */}
              {subtitle && (
                <p className="text-sm text-muted-foreground">{subtitle}</p>
              )}

              {/* Row 2: meta */}
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
                {reference && (
                  <span className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    <span className="font-mono text-foreground">{reference}</span>
                  </span>
                )}
                {followUp && (
                  <span className="flex items-center gap-1">
                    <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                    {followUp.originId ? (
                      <Link
                        href={`/dashboard/tasks/${followUp.originId}`}
                        className="text-foreground hover:underline"
                      >
                        Follow Up to {followUp.originRef ?? 'original call'}
                      </Link>
                    ) : (
                      <span>Follow Up to {followUp.originRef ?? 'original call'}</span>
                    )}
                  </span>
                )}
                {dateValue && (
                  <span className="flex items-center gap-1">
                    <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className={cn(isOverdue && 'font-medium text-destructive')}>
                      {formatDateUK(dateValue)}
                    </span>
                    {isOverdue && (
                      <span className="ml-0.5 text-xs font-medium text-destructive">Overdue</span>
                    )}
                  </span>
                )}
                {engineerName !== undefined && (
                  <span className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5 shrink-0" />
                    {engineerName || 'Unassigned'}
                  </span>
                )}
                {valuePence != null && valuePence > 0 && (
                  <span className="flex items-center gap-1">
                    <Coins className="h-3.5 w-3.5 shrink-0" />
                    {formatPence(valuePence)}
                  </span>
                )}
                {address && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {address}
                  </span>
                )}
                {showBooking &&
                  (bookedSlot ? (
                    <Badge className="gap-1 border-transparent bg-emerald-600 text-white hover:bg-emerald-600/90">
                      <Clock className="h-3 w-3" />
                      Booked · {bookedSlot}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Not booked
                    </Badge>
                  ))}
              </div>

              {secondary}
            </div>
          </div>

          {/* Right: actions */}
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      </CardContent>
    </Card>
  )
}
