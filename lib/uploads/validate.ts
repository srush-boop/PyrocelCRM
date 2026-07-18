import { NextResponse } from 'next/server'

/**
 * Shared upload validation. Uploads must be constrained by an explicit MIME
 * allowlist and a maximum size so malicious or oversized payloads can't be
 * stored. `file.type` is browser-supplied, so treat this as a first-line guard
 * (defence in depth) rather than absolute proof of content.
 */

export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
] as const

export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  // Office documents.
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
] as const

export const MB = 1024 * 1024

export interface UploadRule {
  /** Allowed MIME types. */
  allow: readonly string[]
  /** Maximum size in bytes. */
  maxBytes: number
}

export interface UploadValidationError {
  ok: false
  /** JSON error response ready to return from a route handler. */
  response: NextResponse
}

export interface UploadValidationOk {
  ok: true
}

/**
 * Validate an uploaded File against a MIME allowlist and size cap. On failure
 * returns a ready-to-return NextResponse (415 for type, 413 for size, 400 for
 * a missing/empty file).
 */
export function validateUpload(
  file: File | null,
  rule: UploadRule,
): UploadValidationOk | UploadValidationError {
  if (!file || file.size === 0) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'No file provided.' }, { status: 400 }),
    }
  }
  if (file.size > rule.maxBytes) {
    const mb = Math.round(rule.maxBytes / MB)
    return {
      ok: false,
      response: NextResponse.json(
        { error: `File is too large. Maximum size is ${mb}MB.` },
        { status: 413 },
      ),
    }
  }
  // Some browsers/devices send an empty type; reject rather than guess.
  if (!file.type || !rule.allow.includes(file.type)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Unsupported file type.' },
        { status: 415 },
      ),
    }
  }
  return { ok: true }
}
