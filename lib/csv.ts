// Small, dependency-free CSV helpers used by download/export features across
// the dashboard (e.g. the schedule planning tool).

type Cell = string | number | boolean | null | undefined

/** Escape a single CSV cell, quoting when it contains a comma, quote or newline. */
function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/** Build a CSV string from a header row and body rows. */
export function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers.map(escapeCell).join(',')]
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(','))
  }
  // Prepend a BOM so Excel opens UTF-8 correctly.
  return '\uFEFF' + lines.join('\r\n')
}

/**
 * Trigger a client-side download of the given rows as a CSV file. Must be
 * called from the browser (client component event handlers).
 */
export function downloadCsv(filename: string, headers: string[], rows: Cell[][]): void {
  const csv = toCsv(headers, rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
