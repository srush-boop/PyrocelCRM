import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// UK Regional Settings
export const UK_LOCALE = 'en-GB'

// A fixed timezone is pinned on every formatter so dates render identically on
// the server (which runs in UTC) and in the visitor's browser (local timezone).
// Without this, dates near a day boundary format differently server vs client,
// causing React hydration mismatches that visibly re-render/"reload" the page
// (notably on the public quote view).
const UK_TIME_ZONE = 'Europe/London'

export const dateFormatOptions: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: UK_TIME_ZONE,
}

export const dateTimeFormatOptions: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: UK_TIME_ZONE,
}

export const timeFormatOptions: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: UK_TIME_ZONE,
}

// Helper functions for UK date formatting.
// These coerce their input safely: a null/undefined/invalid date returns a
// dash placeholder rather than throwing, so a single missing field can never
// crash an entire client component.
function coerceDate(date: Date | string | null | undefined): Date | null {
  if (date == null) return null
  const d = typeof date === 'string' ? new Date(date) : date
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDateUK(date: Date | string | null | undefined): string {
  const d = coerceDate(date)
  return d ? d.toLocaleDateString(UK_LOCALE, dateFormatOptions) : '—'
}

export function formatDateTimeUK(date: Date | string | null | undefined): string {
  const d = coerceDate(date)
  return d ? d.toLocaleDateString(UK_LOCALE, dateTimeFormatOptions) : '—'
}

export function formatTimeUK(date: Date | string | null | undefined): string {
  const d = coerceDate(date)
  return d ? d.toLocaleTimeString(UK_LOCALE, timeFormatOptions) : '—'
}

export function formatNumberUK(value: number): string {
  return value.toLocaleString(UK_LOCALE)
}

// Format a "HH:MM[:SS]" time-of-day string (e.g. from a Postgres `time`
// column) as a UK 24h time like "09:00". Returns '' for empty input.
export function formatClockTime(time: string | null | undefined): string {
  if (!time) return ''
  const [h, m] = time.split(':')
  if (h === undefined || m === undefined) return ''
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
}

// Format an optional booked slot as "09:00 – 11:00", or just a single time if
// only one end is set. Returns '' when no times are provided.
export function formatBookedSlot(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const s = formatClockTime(start)
  const e = formatClockTime(end)
  if (s && e) return `${s} – ${e}`
  return s || e || ''
}

// Format a pounds value as GBP currency (client-safe).
export function formatGBP(value: number): string {
  return new Intl.NumberFormat(UK_LOCALE, {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0)
}
