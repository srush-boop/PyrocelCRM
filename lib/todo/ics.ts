// Minimal, dependency-free iCalendar (RFC 5545) builder for a single to-do.
// Used by the "Add to calendar" .ics download so a user can drop a to-do into
// Outlook/Apple/Google Calendar. Pure and testable.

export interface IcsEvent {
  uid: string
  title: string
  description?: string | null
  // ISO timestamp. When absent, DTSTART falls back to created/now upstream.
  start: string
  // ISO timestamp. When absent we derive a 1-hour block (or all-day) upstream.
  end?: string | null
  allDay?: boolean
}

// Escapes text per RFC 5545 (commas, semicolons, backslashes, newlines).
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

// UTC timestamp form: 20260913T170000Z
function toUtcStamp(iso: string): string {
  const d = new Date(iso)
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
}

// All-day date form: 20260913 (in the DATE value type).
function toDateStamp(iso: string): string {
  const d = new Date(iso)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

// Long lines should be folded at 75 octets; we keep it simple and fold on 73
// chars with a leading space on continuation lines.
function foldLine(line: string): string {
  if (line.length <= 73) return line
  const parts: string[] = []
  let remaining = line
  parts.push(remaining.slice(0, 73))
  remaining = remaining.slice(73)
  while (remaining.length > 0) {
    parts.push(' ' + remaining.slice(0, 72))
    remaining = remaining.slice(72)
  }
  return parts.join('\r\n')
}

/** Builds a complete VCALENDAR string containing one VEVENT for the to-do. */
export function buildTodoIcs(event: IcsEvent): string {
  const now = toUtcStamp(new Date().toISOString())
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PyrocelCRM//To-Do//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}@pyrocelcrm`,
    `DTSTAMP:${now}`,
  ]

  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${toDateStamp(event.start)}`)
    // All-day DTEND is exclusive; add a day so a single-day event shows right.
    const endIso = event.end ?? event.start
    const endPlus = new Date(endIso)
    endPlus.setUTCDate(endPlus.getUTCDate() + 1)
    lines.push(`DTEND;VALUE=DATE:${toDateStamp(endPlus.toISOString())}`)
  } else {
    lines.push(`DTSTART:${toUtcStamp(event.start)}`)
    const endIso =
      event.end ?? new Date(new Date(event.start).getTime() + 60 * 60 * 1000).toISOString()
    lines.push(`DTEND:${toUtcStamp(endIso)}`)
  }

  lines.push(`SUMMARY:${escapeText(event.title)}`)
  if (event.description && event.description.trim()) {
    lines.push(`DESCRIPTION:${escapeText(event.description.trim())}`)
  }
  lines.push('END:VEVENT', 'END:VCALENDAR')

  return lines.map(foldLine).join('\r\n')
}

// A filesystem-safe filename for the download, e.g. "Call-back-client.ics".
export function icsFilename(title: string): string {
  const base = title
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60)
  return `${base || 'todo'}.ics`
}
