// Client-side parsing of dropped email files into the fields our triage needs.
// Supports:
//   .eml  — standard MIME (Apple Mail, Thunderbird, Gmail "Show original", etc.) via postal-mime
//   .msg  — Outlook proprietary format via @kenjiuno/msgreader
// Parser libraries are imported dynamically so they only load when a file is dropped.

export interface ParsedEmail {
  fromName?: string
  fromEmail?: string
  subject?: string
  body: string
}

export type EmailFileKind = 'eml' | 'msg' | 'unknown'

export function classifyEmailFile(file: File): EmailFileKind {
  const name = file.name.toLowerCase()
  if (name.endsWith('.eml')) return 'eml'
  if (name.endsWith('.msg')) return 'msg'
  // Some clients set the MIME type but keep a generic name.
  if (file.type === 'message/rfc822') return 'eml'
  if (file.type === 'application/vnd.ms-outlook') return 'msg'
  return 'unknown'
}

/** Strip HTML to reasonably clean plain text (fallback when no text/plain part exists). */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

async function parseEml(file: File): Promise<ParsedEmail> {
  const { default: PostalMime } = await import('postal-mime')
  const buffer = await file.arrayBuffer()
  const email = await PostalMime.parse(buffer)
  const body = (email.text?.trim() || (email.html ? htmlToText(email.html) : '')).trim()
  return {
    fromName: email.from?.name?.trim() || undefined,
    fromEmail: email.from?.address?.trim() || undefined,
    subject: email.subject?.trim() || undefined,
    body,
  }
}

async function parseMsg(file: File): Promise<ParsedEmail> {
  const { default: MsgReader } = await import('@kenjiuno/msgreader')
  const buffer = await file.arrayBuffer()
  const reader = new MsgReader(buffer)
  const data = reader.getFileData()
  const body = (data.body?.trim() || (data.bodyHtml ? htmlToText(data.bodyHtml) : '')).trim()
  return {
    fromName: data.senderName?.trim() || undefined,
    fromEmail: data.senderEmail?.trim() || undefined,
    subject: data.subject?.trim() || undefined,
    body,
  }
}

/**
 * Parse a dropped/selected email file. Throws a user-facing Error for
 * unsupported files or empty content so the caller can toast the message.
 */
export async function parseEmailFile(file: File): Promise<ParsedEmail> {
  const kind = classifyEmailFile(file)
  let parsed: ParsedEmail
  if (kind === 'eml') {
    parsed = await parseEml(file)
  } else if (kind === 'msg') {
    parsed = await parseMsg(file)
  } else {
    throw new Error('Unsupported file. Drop a .eml or .msg email file.')
  }
  if (!parsed.body) {
    throw new Error('Could not read any text from that email. Try pasting it instead.')
  }
  return parsed
}
