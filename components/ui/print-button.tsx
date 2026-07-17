'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Clean, self-contained styles for the print popup. The cloned table keeps its
// shadcn class names but the popup has no Tailwind, so we style raw elements and
// hide interactive controls (buttons, inputs, dropdown triggers) that make no
// sense on paper.
const PRINT_CSS = `
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #111827; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .meta { font-size: 11px; color: #6b7280; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 600; }
  button, [role="button"], [role="checkbox"], input, select, svg { display: none !important; }
  a { color: inherit; text-decoration: none; }
  .no-print { display: none !important; }
`

interface PrintButtonProps {
  /** id of the element (usually a table or its wrapper) to print. */
  targetId: string
  /** Heading shown at the top of the printout. */
  title: string
  /** Optional button label (defaults to "Print"). */
  label?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  className?: string
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function PrintButton({
  targetId,
  title,
  label = 'Print',
  variant = 'outline',
  size = 'sm',
  className,
}: PrintButtonProps) {
  const handlePrint = () => {
    const el = document.getElementById(targetId)
    if (!el) return

    // Prefer printing a contained <table>; fall back to the element itself.
    const table = el.tagName === 'TABLE' ? el : el.querySelector('table')
    const markup = (table ?? el).outerHTML

    const win = window.open('', '_blank', 'width=1100,height=800')
    if (!win) return

    const printedAt = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })
    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(
        title,
      )}</title><style>${PRINT_CSS}</style></head><body>` +
        `<h1>${escapeHtml(title)}</h1>` +
        `<p class="meta">Printed ${escapeHtml(printedAt)}</p>` +
        markup +
        `</body></html>`,
    )
    win.document.close()
    win.focus()

    // Give the popup a beat to render before invoking the print dialog.
    win.onload = () => {
      win.print()
      win.close()
    }
    // Fallback if onload doesn't fire (already-complete document).
    setTimeout(() => {
      if (!win.closed) {
        win.print()
        win.close()
      }
    }, 400)
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handlePrint}
      className={cn('no-print', className)}
    >
      <Printer className="h-4 w-4" />
      {label}
    </Button>
  )
}
