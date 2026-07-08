// Builds calendar artefacts for a booked call confirmation: an .ics file
// (attachable to an email) and "add to calendar" links for Google and Outlook.
// Kept framework-agnostic (pure functions) so it can be used from server
// actions and API routes alike.

export interface CalendarEventInput {
  /** Short event title, e.g. "Fire Alarm Service — Acme Ltd". */
  title: string
  /** Optional longer description (site, call type, notes). */
  description?: string | null
  /** Location string (site address). */
  location?: string | null
  /** Event start. */
  start: Date
  /** Event end. Defaults to start + 1 hour when omitted. */
  end?: Date | null
  /** Stable unique id for the event (e.g. the task id). */
  uid: string
  /** Organiser display name. */
  organiserName?: string
  /** Organiser email. */
  organiserEmail?: string
}

// Format a Date as an iCalendar UTC timestamp: YYYYMMDDTHHMMSSZ.
function toICSDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

// Format a Date as a compact UTC stamp for Google/Outlook links.
function toCompactUTC(d: Date): string {
  return toICSDate(d)
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
  const chunks: string[] = []
  let remaining = line
  chunks.push(remaining.slice(0, 75))
  remaining = remaining.slice(75)
  while (remaining.length > 0) {
    chunks.push(' ' + remaining.slice(0, 74))
    remaining = remaining.slice(74)
  }
  return chunks.join('\r\n')
}

function resolveEnd(input: CalendarEventInput): Date {
  if (input.end) return input.end
  return new Date(input.start.getTime() + 60 * 60 * 1000)
}

/** Build a valid iCalendar (.ics) document for a single event. */
export function buildICS(input: CalendarEventInput): string {
  const end = resolveEnd(input)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PyrocelCRM//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeICS(input.uid)}@pyrocel.co.uk`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(input.start)}`,
    `DTEND:${toICSDate(end)}`,
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

/** Google Calendar "add event" URL. */
export function googleCalendarUrl(input: CalendarEventInput): string {
  const end = resolveEnd(input)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.title,
    dates: `${toCompactUTC(input.start)}/${toCompactUTC(end)}`,
  })
  if (input.description) params.set('details', input.description)
  if (input.location) params.set('location', input.location)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/** Outlook.com (Office 365) "add event" URL. */
export function outlookCalendarUrl(input: CalendarEventInput): string {
  const end = resolveEnd(input)
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    startdt: input.start.toISOString(),
    enddt: end.toISOString(),
    subject: input.title,
  })
  if (input.description) params.set('body', input.description)
  if (input.location) params.set('location', input.location)
  return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`
}
