// Builds calendar artefacts for a booked call confirmation: an .ics file
// (attachable to an email) and "add to calendar" links for Google and Outlook.
// Kept framework-agnostic (pure functions) so it can be used from server
// actions and API routes alike.
//
// Times are handled as *wall-clock* values in a named time zone (default
// Europe/London) rather than UTC instants. This avoids the classic
// off-by-one-hour bug during British Summer Time: we emit the local time plus
// a TZID and let each calendar app resolve the zone from its own tz database.

export interface CalendarEventInput {
  /** Short event title, e.g. "Fire Alarm Service — Acme Ltd". */
  title: string
  /** Optional longer description (site, call type, notes). */
  description?: string | null
  /** Location string (site address). */
  location?: string | null
  /** Local start date, "yyyy-MM-dd". */
  date: string
  /** Local start time, "HH:mm" (24h). Defaults to 09:00 when omitted. */
  startTime?: string | null
  /** Local end time, "HH:mm" (24h). Defaults to start + 1 hour. */
  endTime?: string | null
  /** IANA time zone the wall-clock times are in. */
  timeZone?: string
  /** Stable unique id for the event (e.g. the task id). */
  uid: string
  /** Organiser display name. */
  organiserName?: string
  /** Organiser email. */
  organiserEmail?: string
}

const DEFAULT_TZ = 'Europe/London'

function normaliseTime(time: string | null | undefined, fallback: string): { h: number; m: number } {
  const raw = (time || fallback).slice(0, 5)
  const [h, m] = raw.split(':').map((n) => parseInt(n, 10))
  return { h: Number.isFinite(h) ? h : 9, m: Number.isFinite(m) ? m : 0 }
}

function addHour(h: number, m: number): { h: number; m: number } {
  return { h: (h + 1) % 24, m }
}

interface ResolvedTimes {
  date: string
  start: { h: number; m: number }
  end: { h: number; m: number }
  tz: string
}

function resolveTimes(input: CalendarEventInput): ResolvedTimes {
  const start = normaliseTime(input.startTime, '09:00')
  const end = input.endTime ? normaliseTime(input.endTime, '10:00') : addHour(start.h, start.m)
  return { date: input.date, start, end, tz: input.timeZone || DEFAULT_TZ }
}

const pad = (n: number) => String(n).padStart(2, '0')

// Compact local timestamp with no zone suffix: YYYYMMDDTHHMMSS.
function localStamp(date: string, t: { h: number; m: number }): string {
  return `${date.replace(/-/g, '')}T${pad(t.h)}${pad(t.m)}00`
}

// ISO-like local timestamp: yyyy-MM-ddTHH:mm:ss.
function localIso(date: string, t: { h: number; m: number }): string {
  return `${date}T${pad(t.h)}:${pad(t.m)}:00`
}

// UTC stamp for DTSTAMP (creation time only; safe to use the real instant).
function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

// Best-effort GMT offset (e.g. "+01:00") for a zone on a given local date, via
// Intl. Used only for the Outlook deep link, which wants an ISO offset.
function zoneOffset(date: string, t: { h: number; m: number }, timeZone: string): string {
  try {
    const approx = new Date(`${localIso(date, t)}Z`)
    const dtf = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    const part = dtf.formatToParts(approx).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
    const match = part.match(/GMT([+-]\d{2}:?\d{2})?/)
    if (!match || !match[1]) return '+00:00'
    const off = match[1].includes(':') ? match[1] : `${match[1].slice(0, 3)}:${match[1].slice(3)}`
    return off
  } catch {
    return '+00:00'
  }
}

// Escape text for an iCalendar field (commas, semicolons, newlines).
function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

// Fold long lines to 75 octets per RFC 5545 (best-effort, char-based).
function foldLine(line: string): string {
  if (line.length <= 75) return line
  const chunks: string[] = [line.slice(0, 75)]
  let remaining = line.slice(75)
  while (remaining.length > 0) {
    chunks.push(' ' + remaining.slice(0, 74))
    remaining = remaining.slice(74)
  }
  return chunks.join('\r\n')
}

/** Build a valid iCalendar (.ics) document for a single event. */
export function buildICS(input: CalendarEventInput): string {
  const r = resolveTimes(input)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PyrocelCRM//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeICS(input.uid)}@pyrocel.co.uk`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART;TZID=${r.tz}:${localStamp(r.date, r.start)}`,
    `DTEND;TZID=${r.tz}:${localStamp(r.date, r.end)}`,
    `SUMMARY:${escapeICS(input.title)}`,
    input.description ? `DESCRIPTION:${escapeICS(input.description)}` : null,
    input.location ? `LOCATION:${escapeICS(input.location)}` : null,
    input.organiserEmail
      ? `ORGANIZER;CN=${escapeICS(input.organiserName || 'Pyrocel')}:mailto:${input.organiserEmail}`
      : null,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((l): l is string => l !== null)

  return lines.map(foldLine).join('\r\n')
}

/** Google Calendar "add event" URL (local times + ctz zone). */
export function googleCalendarUrl(input: CalendarEventInput): string {
  const r = resolveTimes(input)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.title,
    dates: `${localStamp(r.date, r.start)}/${localStamp(r.date, r.end)}`,
    ctz: r.tz,
  })
  if (input.description) params.set('details', input.description)
  if (input.location) params.set('location', input.location)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/** Outlook.com (Office 365) "add event" URL (ISO local time + zone offset). */
export function outlookCalendarUrl(input: CalendarEventInput): string {
  const r = resolveTimes(input)
  const startOff = zoneOffset(r.date, r.start, r.tz)
  const endOff = zoneOffset(r.date, r.end, r.tz)
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    startdt: `${localIso(r.date, r.start)}${startOff}`,
    enddt: `${localIso(r.date, r.end)}${endOff}`,
    subject: input.title,
  })
  if (input.description) params.set('body', input.description)
  if (input.location) params.set('location', input.location)
  return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`
}
