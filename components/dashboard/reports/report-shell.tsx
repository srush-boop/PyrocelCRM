'use client'

/**
 * Shared building blocks for a single, modern "technical compliance document"
 * report template used across all report types (generic service reports,
 * fire & smoke dampers, extinguishers, emergency lighting, ...).
 *
 * The goal is a consistent, on-brand (Pyrocel red / charcoal / white) layout
 * that reads like an engineering inspection certificate rather than a plain
 * dashboard card. Everything here is print-safe (solid colours, avoid-break
 * helpers, no gradients).
 */

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft,
  Printer,
  Phone,
  Mail,
  Globe,
  MapPin,
} from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import { signatureSrc } from '@/lib/blob'
import type { CompanyInfo, ReportTemplate } from '@/lib/types/database'

/** Canonical outcome colours reused across every report. */
export const REPORT_COLORS = {
  pass: '#16a34a',
  fail: '#dc2626',
  remedial: '#d97706',
  advisory: '#f59e0b',
  na: '#64748b',
  other: '#64748b',
  neutral: '#0f172a',
} as const

export const STATUS_META: Record<string, { label: string; color: string }> = {
  pass: { label: 'Pass', color: REPORT_COLORS.pass },
  fail: { label: 'Fail', color: REPORT_COLORS.fail },
  partial: { label: 'Partial', color: REPORT_COLORS.remedial },
  no_access: { label: 'No Access', color: REPORT_COLORS.na },
  pending: { label: 'Pending', color: REPORT_COLORS.na },
}

export function getStatusMeta(status?: string | null) {
  return (status && STATUS_META[status]) || STATUS_META.pending
}

/** Screen-only action bar (back + print). Hidden when printing. */
export function ReportActionBar({ backHref }: { backHref: string }) {
  return (
    <div className="mb-6 flex items-center justify-between print:hidden">
      <Button variant="ghost" size="sm" asChild>
        <Link href={backHref}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Link>
      </Button>
      <Button onClick={() => window.print()}>
        <Printer className="mr-2 h-4 w-4" />
        Print / Save PDF
      </Button>
    </div>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'P'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

interface ReportHeaderProps {
  headerColor: string
  companyName: string
  logoUrl?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  /** e.g. "Service Report", "Inspection Report" */
  docType: string
  /** e.g. "Fire Alarm — Annual" */
  docSubtitle?: string | null
  referenceNumber?: string | null
  reportDate?: string | null
  ServiceIcon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
}

/**
 * The branded document masthead: company identity on a solid brand band, a
 * document-classification block with a monospaced reference, and a contact
 * strip. Designed to sit flush to the top of a `.report-page`.
 */
export function ReportHeader({
  headerColor,
  companyName,
  logoUrl,
  address,
  phone,
  email,
  website,
  docType,
  docSubtitle,
  referenceNumber,
  reportDate,
  ServiceIcon,
}: ReportHeaderProps) {
  const contacts: { icon: typeof Phone; text: string }[] = []
  if (phone) contacts.push({ icon: Phone, text: phone })
  if (email) contacts.push({ icon: Mail, text: email })
  if (website) contacts.push({ icon: Globe, text: website.replace(/^https?:\/\//, '') })

  return (
    <header className="avoid-break -mx-8 -mt-8 mb-6 overflow-hidden print:mx-0 print:mt-0">
      {/* thin darker accent rule for a crisp technical edge */}
      <div className="h-1.5" style={{ backgroundColor: REPORT_COLORS.neutral }} />
      <div className="px-8 py-5 text-white" style={{ backgroundColor: headerColor }}>
        <div className="flex items-start justify-between gap-4">
          {/* Company identity */}
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl || '/placeholder.svg'}
                  alt={`${companyName} logo`}
                  crossOrigin="anonymous"
                  className="h-full w-full object-contain p-1.5"
                />
              ) : (
                <span
                  className="text-lg font-extrabold tracking-tight"
                  style={{ color: headerColor }}
                >
                  {initials(companyName)}
                </span>
              )}
            </div>
            <div>
              <p className="text-lg font-extrabold uppercase leading-tight tracking-wide">
                {companyName}
              </p>
              {address && (
                <p className="mt-0.5 flex max-w-[30ch] items-start gap-1 text-xs leading-snug text-white/80">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden={true} />
                  <span>{address}</span>
                </p>
              )}
            </div>
          </div>

          {/* Document classification */}
          <div className="flex items-start gap-3">
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75">
                {docType}
              </p>
              {docSubtitle && (
                <p className="text-sm font-semibold leading-tight">{docSubtitle}</p>
              )}
              {referenceNumber && (
                <p className="mt-1.5 inline-block rounded bg-white/15 px-2 py-0.5 font-mono text-sm font-bold tracking-tight ring-1 ring-inset ring-white/25">
                  {referenceNumber}
                </p>
              )}
              {reportDate && (
                <p className="mt-1 text-[11px] text-white/75">{formatDateUK(reportDate)}</p>
              )}
            </div>
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-white/10 ring-1 ring-inset ring-white/25">
              <ServiceIcon className="h-7 w-7" aria-hidden={true} />
            </div>
          </div>
        </div>

        {contacts.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-white/20 pt-3 text-[11px] text-white/85">
            {contacts.map(({ icon: Icon, text }) => (
              <span key={text} className="flex items-center gap-1.5">
                <Icon className="h-3 w-3" aria-hidden={true} />
                {text}
              </span>
            ))}
          </div>
        )}
      </div>
    </header>
  )
}

/** A labelled metadata field (uppercase micro-label + value). */
export function ReportMeta({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="border-l-2 pl-3" style={{ borderColor: 'var(--border)' }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-medium leading-snug">{value || '—'}</p>
    </div>
  )
}

export function ReportMetaGrid({ children }: { children: ReactNode }) {
  return (
    <section className="avoid-break mb-6 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
      {children}
    </section>
  )
}

/** Prominent overall-result ribbon. */
export function ReportStatusRibbon({
  label = 'Overall Result',
  statusLabel,
  color,
  note,
}: {
  label?: string
  statusLabel: string
  color: string
  note?: string | null
}) {
  return (
    <div
      className="avoid-break mb-6 flex items-center justify-between rounded-md border-l-4 px-4 py-3"
      style={{ borderLeftColor: color, backgroundColor: `${color}12` }}
    >
      <div>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      </div>
      <span
        className="rounded-full px-4 py-1 text-sm font-bold uppercase tracking-wide text-white"
        style={{ backgroundColor: color }}
      >
        {statusLabel}
      </span>
    </div>
  )
}

/** KPI card with a coloured top accent for the technical dashboard row. */
export function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string
  value: string | number
  color?: string
  icon?: ReactNode
}) {
  return (
    <div className="avoid-break overflow-hidden rounded-lg border bg-card">
      <div className="h-1" style={{ backgroundColor: color || 'var(--border)' }} />
      <div className="p-3 text-center">
        <div
          className="flex items-center justify-center gap-1.5"
          style={{ color: color || 'inherit' }}
        >
          {icon}
          <span className="text-2xl font-bold tabular-nums">{value}</span>
        </div>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      </div>
    </div>
  )
}

/** Numbered technical section heading with a solid brand chip. */
export function SectionHeading({
  index,
  color,
  children,
}: {
  index?: number
  color: string
  children: ReactNode
}) {
  return (
    <h2 className="avoid-break mb-3 flex items-center gap-2.5 text-sm font-bold uppercase tracking-wide">
      {index != null && (
        <span
          className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded px-1.5 text-xs font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {index}
        </span>
      )}
      <span style={{ color }}>{children}</span>
    </h2>
  )
}

/** A bordered panel used to wrap chart/summary blocks. */
export function ReportPanel({
  title,
  children,
}: {
  title?: string
  children: ReactNode
}) {
  return (
    <div className="avoid-break rounded-lg border bg-card p-4">
      {title && (
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
      )}
      {children}
    </div>
  )
}

interface SignatureBlockProps {
  signatureUrl?: string | null
  signatoryName?: string | null
  signatoryTitle?: string | null
  date?: string | null
}

export function SignatureBlock({
  signatureUrl,
  signatoryName,
  signatoryTitle,
  date,
}: SignatureBlockProps) {
  return (
    <section className="avoid-break mb-6 grid grid-cols-2 gap-8 border-t pt-5 text-sm">
      <div>
        {signatureUrl ? (
          <div className="mb-1 flex h-12 items-end">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={signatureSrc(signatureUrl) || '/placeholder.svg'}
              alt={`Signature of ${signatoryName || 'engineer'}`}
              crossOrigin="anonymous"
              className="max-h-12 w-auto object-contain"
            />
          </div>
        ) : (
          <div className="mb-1 h-12 border-b border-dashed" />
        )}
        <p className="font-medium">{signatoryName || ''}</p>
        <p className="text-xs text-muted-foreground">{signatoryTitle || 'Engineer'}</p>
      </div>
      <div>
        <div className="mb-1 h-12 border-b border-dashed" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Date
        </p>
        <p className="text-sm font-medium">{date ? formatDateUK(date) : '—'}</p>
      </div>
    </section>
  )
}

/**
 * Compliance footer: standards + company registration details + optional
 * free-text footer configured on the report template.
 */
export function ReportFooter({
  headerColor,
  companyInfo,
  template,
  standards,
}: {
  headerColor: string
  companyInfo?: CompanyInfo | null
  template?: ReportTemplate | null
  standards?: string | null
}) {
  const bits: string[] = []
  if (companyInfo?.registration_number)
    bits.push(`Reg. No. ${companyInfo.registration_number}`)
  if (companyInfo?.vat_number) bits.push(`VAT ${companyInfo.vat_number}`)
  if (companyInfo?.website) bits.push(companyInfo.website.replace(/^https?:\/\//, ''))

  const footerText = template?.footer_text

  if (!standards && bits.length === 0 && !footerText) return null

  return (
    <footer className="avoid-break mt-2 border-t pt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
      {standards && (
        <p className="mb-1">
          <span className="font-semibold uppercase tracking-wider" style={{ color: headerColor }}>
            Inspected to:{' '}
          </span>
          {standards}
        </p>
      )}
      {footerText && <p className="mb-1">{footerText}</p>}
      {bits.length > 0 && <p className="text-muted-foreground/80">{bits.join('  ·  ')}</p>}
    </footer>
  )
}
