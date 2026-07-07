'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { QuoteDocument } from '@/components/dashboard/sales/quote-document'
import { formatPence } from '@/lib/sales'
import { updatePublicQuoteOptions } from '@/app/quote/[token]/actions'
import type {
  CompanyInfo,
  Quote,
  QuoteLineItem,
  QuoteRequirement,
  QuoteSystem,
} from '@/lib/types/database'
import type { SpecCatalogueItem } from '@/lib/sales/equipment-spec'

// Public shared-quote view. Wraps the read-only QuoteDocument and layers on
// interactive optional-extras selection: the client ticks options directly in
// the document, sees totals update live, and saves via a sticky action bar.
export function PublicQuoteInteractive({
  quote,
  systems,
  lines,
  company,
  requirements = [],
  catalogue = [],
  token,
}: {
  quote: Quote
  systems: QuoteSystem[]
  lines: QuoteLineItem[]
  company: CompanyInfo | null
  requirements?: QuoteRequirement[]
  catalogue?: SpecCatalogueItem[]
  token: string
}) {
  const optionalLines = useMemo(() => lines.filter((l) => l.is_optional), [lines])
  const initialSelection = useMemo(
    () => new Set(optionalLines.filter((l) => l.client_selected === true).map((l) => l.id)),
    [optionalLines],
  )
  const [selection, setSelection] = useState<Set<string>>(() => new Set(initialSelection))
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const locked = quote.status === 'accepted' || quote.status === 'rejected'
  const hasOptions = optionalLines.length > 0

  // Toggle an option. Selecting a grouped option (same option_group within the
  // same system) clears any sibling so groups stay mutually exclusive.
  const toggle = (line: QuoteLineItem) => {
    if (locked) return
    setSelection((prev) => {
      const next = new Set(prev)
      if (next.has(line.id)) {
        next.delete(line.id)
        return next
      }
      const group = line.option_group?.trim()
      if (group) {
        for (const other of optionalLines) {
          if (
            other.id !== line.id &&
            other.system_id === line.system_id &&
            other.option_group?.trim() === group
          ) {
            next.delete(other.id)
          }
        }
      }
      next.add(line.id)
      return next
    })
  }

  const additionalPence = optionalLines
    .filter((l) => selection.has(l.id))
    .reduce((sum, l) => sum + l.line_total_pence, 0)

  const dirty = useMemo(() => {
    if (selection.size !== initialSelection.size) return true
    for (const id of selection) if (!initialSelection.has(id)) return true
    return false
  }, [selection, initialSelection])

  const save = () => {
    startTransition(async () => {
      const res = await updatePublicQuoteOptions({
        token,
        selectedLineIds: Array.from(selection),
      })
      if (res.ok) {
        toast.success('Your options have been saved.')
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not save your options.')
      }
    })
  }

  return (
    <div className={hasOptions && !locked ? 'pb-24' : undefined}>
      <QuoteDocument
        quote={quote}
        systems={systems}
        lines={lines}
        company={company}
        requirements={requirements}
        catalogue={catalogue}
        optionSelection={selection}
        onToggleOption={locked ? undefined : toggle}
      />

      {/* Sticky save bar — only when there are options to choose and the quote
          is still open for a response. */}
      {hasOptions && !locked && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur print:hidden">
          <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <span className="text-muted-foreground">Optional extras selected: </span>
              <span className="font-semibold tabular-nums">
                {formatPence(additionalPence, quote.currency)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {dirty && (
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  You have unsaved changes
                </span>
              )}
              <Button onClick={save} disabled={isPending || !dirty} className="w-full sm:w-auto">
                {isPending ? 'Saving…' : dirty ? 'Save my options' : 'Options saved'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
