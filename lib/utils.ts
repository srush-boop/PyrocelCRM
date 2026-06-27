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

// Helper functions for UK date formatting
export function formatDateUK(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString(UK_LOCALE, dateFormatOptions)
}

export function formatDateTimeUK(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString(UK_LOCALE, dateTimeFormatOptions)
}

export function formatTimeUK(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString(UK_LOCALE, timeFormatOptions)
}

export function formatNumberUK(value: number): string {
  return value.toLocaleString(UK_LOCALE)
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
