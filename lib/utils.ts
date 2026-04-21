import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// UK Regional Settings
export const UK_LOCALE = 'en-GB'

export const dateFormatOptions: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
}

export const dateTimeFormatOptions: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}

export const timeFormatOptions: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
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
