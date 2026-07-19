'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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

  // Per-system additional-service maintenance allowance lines. The client can
  // amend the value, supply a PO (or reuse the maintenance PO), or opt out.
  const allowanceLines = useMemo(
    () =>
      optionalLines.filter(
        (l) => (l as { is_maintenance_allowance?: boolean }).is_maintenance_allowance,
      ),
    [optionalLines],
  )
  type AllowanceOverride = { amountPounds: string; po: string; useMaintenancePo: boolean }
  const [allowanceOverrides, setAllowanceOverrides] = useState<Record<string, AllowanceOverride>>(
    () =>
      Object.fromEntries(
        allowanceLines.map((l) => {
          const amended = (l as { client_amount_pence?: number | null }).client_amount_pence
          return [
            l.id,
            {
              amountPounds:
                amended != null
                  ? (amended / 100).toString()
                  : (l.unit_price_pence / 100).toString(),
              po: (l as { client_po?: string | null }).client_po ?? '',
              useMaintenancePo:
                (l as { use_maintenance_po?: boolean }).use_maintenance_po ?? false,
            },
          ]
        }),
      ),
  )
  const setOverride = (id: string, patch: Partial<AllowanceOverride>) =>
    setAllowanceOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const locked = quote.status === 'accepted' || quote.status === 'rejected'
  // Extras are only interactive when the quote opts in to showing them.
  // The per-system service allowance is always actionable when present.
  const hasOptions =
    (quote.show_optional_extras && optionalLines.length > 0) || allowanceLines.length > 0

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

  // "No optional extras" for a system: clear every optional line in it.
  const declineSystemOptions = (systemId: string) => {
    if (locked) return
    setSelection((prev) => {
      const next = new Set(prev)
      for (const l of optionalLines) {
        if (l.system_id === systemId) next.delete(l.id)
      }
      return next
    })
  }

  const additionalPence = optionalLines
    .filter((l) => selection.has(l.id))
    .reduce((sum, l) => sum + l.line_total_pence, 0)

  const dirty = useMemo(() => {
    if (selection.size !== initialSelection.size) return true
    for (const id of selection) if (!initialSelection.has(id)) return true
    // Any change to an allowance's value/PO/reuse flag also counts as dirty.
    for (const l of allowanceLines) {
      const ov = allowanceOverrides[l.id]
      if (!ov) continue
      const amended = (l as { client_amount_pence?: number | null }).client_amount_pence
      const baseAmount =
        amended != null ? (amended / 100).toString() : (l.unit_price_pence / 100).toString()
      const basePo = (l as { client_po?: string | null }).client_po ?? ''
      const baseReuse = (l as { use_maintenance_po?: boolean }).use_maintenance_po ?? false
      if (ov.amountPounds !== baseAmount || ov.po !== basePo || ov.useMaintenancePo !== baseReuse)
        return true
    }
    return false
  }, [selection, initialSelection, allowanceLines, allowanceOverrides])

  const save = () => {
    // A selected allowance must be authorised: either a PO or "reuse
    // maintenance PO" is required before it can be saved.
    for (const l of allowanceLines) {
      if (!selection.has(l.id)) continue
      const ov = allowanceOverrides[l.id]
      if (!ov?.useMaintenancePo && !ov?.po?.trim()) {
        toast.error('Add a PO (or choose to use the maintenance PO) for the service allowance.')
        return
      }
    }
    startTransition(async () => {
      const res = await updatePublicQuoteOptions({
        token,
        selectedLineIds: Array.from(selection),
        allowanceOverrides: Object.fromEntries(
          allowanceLines.map((l) => [
            l.id,
            {
              amountPounds: allowanceOverrides[l.id]?.amountPounds,
              po: allowanceOverrides[l.id]?.po,
              useMaintenancePo: allowanceOverrides[l.id]?.useMaintenancePo,
            },
          ]),
        ),
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
        onDeclineSystemOptions={locked ? undefined : declineSystemOptions}
      />

      {/* Additional-service allowance: amend value, add PO / reuse maintenance
          PO, or opt out. One card per system's allowance line. */}
      {allowanceLines.length > 0 && (
        <div className="mx-auto mt-6 max-w-4xl px-4 print:hidden">
          <div className="rounded-xl border bg-card p-4 sm:p-6">
            <h3 className="text-base font-semibold">Additional service allowance</h3>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              A pre-authorised allowance (a value per system) covering additional service or minor
              remedial works during maintenance. Opt in and add a purchase order to authorise it, or
              opt out. You can amend the value below.
            </p>
            <div className="mt-4 grid gap-3">
              {allowanceLines.map((l) => {
                const sys = systems.find((s) => s.id === l.system_id)
                const ov = allowanceOverrides[l.id]
                const selected = selection.has(l.id)
                return (
                  <div key={l.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        <Checkbox
                          id={`allow-${l.id}`}
                          checked={selected}
                          disabled={locked}
                          onCheckedChange={() => toggle(l)}
                        />
                        <div className="grid gap-0.5">
                          <Label htmlFor={`allow-${l.id}`} className="cursor-pointer font-medium">
                            {sys?.system_name || 'System'} — service allowance
                          </Label>
                          <span className="text-xs text-muted-foreground">
                            {selected ? 'Included' : 'Not included'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm text-muted-foreground">£</span>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          className="w-28"
                          value={ov?.amountPounds ?? ''}
                          disabled={locked}
                          onChange={(e) => setOverride(l.id, { amountPounds: e.target.value })}
                        />
                      </div>
                    </div>
                    {selected && !locked && (
                      <div className="mt-3 grid gap-2 pl-6">
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={ov?.useMaintenancePo ?? false}
                            onCheckedChange={(v) =>
                              setOverride(l.id, { useMaintenancePo: v === true })
                            }
                          />
                          Use the maintenance PO for this allowance
                        </label>
                        {!ov?.useMaintenancePo && (
                          <div className="grid gap-1">
                            <Label htmlFor={`allow-po-${l.id}`} className="text-xs">
                              Purchase order for this allowance
                            </Label>
                            <Input
                              id={`allow-po-${l.id}`}
                              value={ov?.po ?? ''}
                              placeholder="Enter a PO to authorise"
                              onChange={(e) => setOverride(l.id, { po: e.target.value })}
                              className="max-w-sm"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

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
