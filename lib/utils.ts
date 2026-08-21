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
export const UK_TIME_ZONE = 'Europe/London'

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

// Format a Date for an <input type="datetime-local"> value. The input works in
// the browser's LOCAL time and expects a "YYYY-MM-DDTHH:mm" string. Using
// toISOString() here is wrong — it renders the value shifted to UTC, so a
// 14:30 BST time shows as 13:30 (the classic "1 hour earlier" bug). We build the
// string from the Date's local components so what the engineer sees matches the
// clock, and new Date(value) on change round-trips back to the same instant.
export function toDatetimeLocalValue(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
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

// ── Money helpers (single source of truth, all client-safe) ───────────────
// Three GBP formatters exist because call sites genuinely need different
// behaviour; keep them here so there is exactly one definition of each.
//   formatGBP     — pounds in, always 2 dp (e.g. "£1,234.50")
//   formatCurrency— pounds in, 0–2 dp, null → em dash (compact summary display)
//   formatPence   — integer pence in, 2 dp
// lib/sales.ts and lib/assets.ts re-export these for backwards compatibility.

// Format a pounds value as GBP currency, always 2 decimal places.
export function formatGBP(value: number): string {
  return new Intl.NumberFormat(UK_LOCALE, {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0)
}

// Format a pounds value as GBP, trimming trailing zeros (0–2 dp), with a dash
// placeholder for null/undefined. Used for compact table/summary figures.
export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat(UK_LOCALE, {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

// Format an integer-pence value as GBP currency (2 dp).
export function formatPence(pence: number, currency = 'GBP'): string {
  return new Intl.NumberFormat(UK_LOCALE, {
    style: 'currency',
    currency,
  }).format((pence ?? 0) / 100)
}

// Parse a user-entered pounds string (e.g. "1,234.50") into integer pence.
export function poundsToPence(value: string | number): number {
  if (typeof value === 'number') return Math.round(value * 100)
  const cleaned = value.replace(/[^0-9.-]/g, '')
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

// Convert integer pence into a plain pounds string for inputs (no symbol).
export function penceToPounds(pence: number): string {
  return ((pence ?? 0) / 100).toFixed(2)
}
