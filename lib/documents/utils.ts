// System references are a single global store (there is no per-entity owner), so
// they share one sentinel owner id. Defined here (not in data.ts) so client
// components can import it without pulling in server-only code.
export const SYSTEM_REFERENCE_OWNER_ID = '00000000-0000-0000-0000-000000000000'

export function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

export function isPreviewable(contentType: string | null): boolean {
  if (!contentType) return false
  return contentType.startsWith('image/') || contentType === 'application/pdf'
}
