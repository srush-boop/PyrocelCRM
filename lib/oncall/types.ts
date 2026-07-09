// Shared types + pure helpers for the out-of-hours on-call rota. This module is
// framework-agnostic (no 'use server', no server-only) so it can be imported by
// both server actions/queries and client components.

export type OncallBand = 'weekday_evening' | 'weekend' | 'bank_holiday'
export type CoverKind = 'shift_cover' | 'leave_range' | 'general'
export type CoverStatus = 'open' | 'accepted' | 'cancelled' | 'declined'

export interface RotaEngineerRef {
  id: string
  fullName: string | null
  phone: string | null
  secondaryPhone: string | null
}

export interface RotaMember {
  id: string
  branchId: string
  engineerId: string
  active: boolean
  engineer: RotaEngineerRef | null
}

export interface OncallShift {
  id: string
  branchId: string
  branchName: string | null
  shiftDate: string // yyyy-mm-dd
  band: OncallBand
  engineerId: string | null
  engineer: RotaEngineerRef | null
  originalEngineerId: string | null
  notes: string | null
}

export interface CoverMessage {
  id: string
  requestId: string
  senderId: string
  senderName: string | null
  body: string
  createdAt: string
}

export interface CoverRequest {
  id: string
  requesterId: string
  requesterName: string | null
  branchId: string
  branchName: string | null
  kind: CoverKind
  status: CoverStatus
  shiftId: string | null
  shiftDate: string | null
  dateFrom: string | null
  dateTo: string | null
  message: string | null
  acceptedBy: string | null
  acceptedByName: string | null
  acceptedAt: string | null
  createdAt: string
  messages: CoverMessage[]
}

export interface ChangeLogEntry {
  id: string
  branchId: string
  branchName: string | null
  shiftId: string | null
  shiftDate: string | null
  fromEngineerName: string | null
  toEngineerName: string | null
  changedByName: string | null
  reason: string | null
  createdAt: string
}

export interface OncallSummaryRow {
  engineerId: string
  engineerName: string | null
  weekdayEvening: number
  weekend: number
  bankHoliday: number
  total: number
  pay: number | null
}

export interface OncallRates {
  weekdayEvening: number | null
  weekend: number | null
  bankHoliday: number | null
}

export const BAND_META: Record<OncallBand, { label: string; short: string; hint: string }> = {
  weekday_evening: {
    label: 'Weekday evening',
    short: 'Weekday',
    hint: 'Mon–Fri 17:00–08:30',
  },
  weekend: {
    label: 'Weekend',
    short: 'Weekend',
    hint: 'Sat & Sun',
  },
  bank_holiday: {
    label: 'Bank holiday',
    short: 'Bank hol.',
    hint: 'Public holiday',
  },
}

export const COVER_KIND_META: Record<CoverKind, { label: string }> = {
  shift_cover: { label: 'Cover a shift' },
  leave_range: { label: 'Annual leave cover' },
  general: { label: 'General request' },
}

/**
 * Classify an on-call shift date into a pay band. Weekend (Sat/Sun) and bank
 * holidays take precedence over a plain weekday evening.
 *
 * `date` must be a yyyy-mm-dd string; `bankHolidays` a set of yyyy-mm-dd
 * strings. Parsed as a floating (local) date to avoid timezone drift.
 */
export function deriveBand(date: string, bankHolidays: Set<string>): OncallBand {
  if (bankHolidays.has(date)) return 'bank_holiday'
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(y, (m ?? 1) - 1, d ?? 1).getDay() // 0 = Sun ... 6 = Sat
  if (day === 0 || day === 6) return 'weekend'
  return 'weekday_evening'
}

export function rateForBand(rates: OncallRates, band: OncallBand): number | null {
  switch (band) {
    case 'weekday_evening':
      return rates.weekdayEvening
    case 'weekend':
      return rates.weekend
    case 'bank_holiday':
      return rates.bankHoliday
  }
}

/** Format a yyyy-mm-dd as e.g. "Fri 10 Jul". */
export function formatShiftDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  })
}
