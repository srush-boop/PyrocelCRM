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

// ── Malware scanning ────────────────────────────────────────────────────────

const VT_BASE = 'https://www.virustotal.com/api/v3'

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** True when a VirusTotal analysis result flags the file as malicious/suspicious. */
function isFlagged(stats: Record<string, number> | undefined): boolean {
  if (!stats) return false
  return (stats.malicious ?? 0) > 0 || (stats.suspicious ?? 0) > 0
}

/**
 * Scan an uploaded file for malware before it is stored/marked usable.
 *
 * Backed by VirusTotal. Strategy:
 *  1. Hash the file and look up an existing report (instant for known files).
 *  2. If unknown and the file is small enough, upload it and poll the analysis.
 *
 * Behaviour:
 *  - Fails OPEN when `VIRUSTOTAL_API_KEY` is unset or the service errors — we
 *    never block legitimate uploads because the scanner is unavailable. Callers
 *    should still rely on `validateUpload` for the type/size guard.
 *  - Returns a ready-to-return 422 NextResponse when the file is flagged.
 */
export async function scanForMalware(
  file: File,
): Promise<UploadValidationOk | UploadValidationError> {
  const apiKey = process.env.VIRUSTOTAL_API_KEY
  if (!apiKey) return { ok: true } // scanning not configured → skip

  const rejection = () => ({
    ok: false as const,
    response: NextResponse.json(
      { error: 'This file failed a security scan and was rejected.' },
      { status: 422 },
    ),
  })

  try {
    const buffer = await file.arrayBuffer()
    const hash = await sha256Hex(buffer)

    // 1) Known-file lookup by hash.
    const reportRes = await fetch(`${VT_BASE}/files/${hash}`, {
      headers: { 'x-apikey': apiKey },
    })
    if (reportRes.ok) {
      const report = await reportRes.json()
      const stats = report?.data?.attributes?.last_analysis_stats
      return isFlagged(stats) ? rejection() : { ok: true }
    }
    // 404 → VirusTotal has never seen this file; fall through to upload.
    if (reportRes.status !== 404) return { ok: true } // other error → fail open

    // 2) Upload unknown files (cap at 30MB to stay within the basic API) and
    //    poll the analysis a few times.
    if (buffer.byteLength > 30 * MB) return { ok: true }

    const form = new FormData()
    form.append('file', new Blob([buffer], { type: file.type }), file.name)
    const uploadRes = await fetch(`${VT_BASE}/files`, {
      method: 'POST',
      headers: { 'x-apikey': apiKey },
      body: form,
    })
    if (!uploadRes.ok) return { ok: true }
    const uploaded = await uploadRes.json()
    const analysisId: string | undefined = uploaded?.data?.id
    if (!analysisId) return { ok: true }

    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((r) => setTimeout(r, 2000))
      const analysisRes = await fetch(`${VT_BASE}/analyses/${analysisId}`, {
        headers: { 'x-apikey': apiKey },
      })
      if (!analysisRes.ok) continue
      const analysis = await analysisRes.json()
      const status = analysis?.data?.attributes?.status
      if (status === 'completed') {
        const stats = analysis?.data?.attributes?.stats
        return isFlagged(stats) ? rejection() : { ok: true }
      }
    }
    // Analysis didn't finish in time → fail open rather than block the user.
    return { ok: true }
  } catch (err) {
    console.error('[v0] malware scan failed (allowing upload):', err)
    return { ok: true }
  }
}
