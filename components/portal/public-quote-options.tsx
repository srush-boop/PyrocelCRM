'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { formatPence } from '@/lib/sales'
import { updatePublicQuoteOptions } from '@/app/quote/[token]/actions'
import type { Quote, QuoteLineItem, QuoteSystem } from '@/lib/types/database'

// Client-facing panel that lets the customer tick/untick the optional extras on
// a quote and save the choices back. Grouped options (same option_group within a
// system) are mutually exclusive; ungrouped options are independent checkboxes.
export function PublicQuoteOptions({
  quote,
  systems,
  lines,
  token,
}: {
  quote: Quote
  systems: QuoteSystem[]
  lines: QuoteLineItem[]
  token: string
}) {
  const optionalLines = useMemo(() => lines.filter((l) => l.is_optional), [lines])
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(optionalLines.filter((l) => l.client_selected === true).map((l) => l.id)),
  )
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  // Nothing to show if the quote has no optional lines.
  if (optionalLines.length === 0) return null

  const locked = quote.status === 'accepted' || quote.status === 'rejected'

  const systemName = (id: string | null) =>
    systems.find((s) => s.id === id)?.system_name?.trim() || 'Options'

  // Group by system, then by option_group (null group = standalone checkboxes).
  const bySystem = new Map<string, QuoteLineItem[]>()
  for (const line of optionalLines) {
    const key = line.system_id ?? '__none__'
    const arr = bySystem.get(key) ?? []
    arr.push(line)
    bySystem.set(key, arr)
  }

  const toggle = (line: QuoteLineItem) => {
    if (locked) return
    setSelected((prev) => {
      const next = new Set(prev)
      const group = line.option_group?.trim()
      if (next.has(line.id)) {
        next.delete(line.id)
      } else {
        // Selecting a grouped option clears any sibling in the same group+system.
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
      }
      return next
    })
  }

  const additionalPence = optionalLines
    .filter((l) => selected.has(l.id))
    .reduce((sum, l) => sum + l.line_total_pence, 0)

  const save = () => {
    startTransition(async () => {
      const res = await updatePublicQuoteOptions({
        token,
        selectedLineIds: Array.from(selected),
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
    <Card>
      <CardHeader>
        <CardTitle>Optional extras</CardTitle>
        <CardDescription className="text-pretty">
          Tick the options you would like to include. Your selections update the quote total and
          are saved for our team.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {Array.from(bySystem.entries()).map(([systemId, systemLines]) => {
          // Split grouped vs standalone for a clearer layout.
          const groups = new Map<string, QuoteLineItem[]>()
          const standalone: QuoteLineItem[] = []
          for (const line of systemLines) {
            const group = line.option_group?.trim()
            if (group) {
              const arr = groups.get(group) ?? []
              arr.push(line)
              groups.set(group, arr)
            } else {
              standalone.push(line)
            }
          }

          return (
            <div key={systemId} className="space-y-4">
              {bySystem.size > 1 && (
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {systemName(systemId === '__none__' ? null : systemId)}
                </p>
              )}

              {Array.from(groups.entries()).map(([group, groupLines]) => (
                <fieldset key={group} className="rounded-lg border p-3">
                  <legend className="px-1 text-sm font-medium">{group}</legend>
                  <p className="mb-2 px-1 text-xs text-muted-foreground">Choose one option.</p>
                  <div className="space-y-2">
                    {groupLines.map((line) => (
                      <OptionRow
                        key={line.id}
                        line={line}
                        currency={quote.currency}
                        checked={selected.has(line.id)}
                        disabled={locked || isPending}
                        onToggle={() => toggle(line)}
                      />
                    ))}
                  </div>
                </fieldset>
              ))}

              {standalone.length > 0 && (
                <div className="space-y-2">
                  {standalone.map((line) => (
                    <OptionRow
                      key={line.id}
                      line={line}
                      currency={quote.currency}
                      checked={selected.has(line.id)}
                      disabled={locked || isPending}
                      onToggle={() => toggle(line)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Selected extras:{' '}
            <span className="font-medium text-foreground tabular-nums">
              {formatPence(additionalPence, quote.currency)}
            </span>
          </p>
          {!locked && (
            <Button onClick={save} disabled={isPending}>
              {isPending ? 'Saving…' : 'Save my options'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function OptionRow({
  line,
  currency,
  checked,
  disabled,
  onToggle,
}: {
  line: QuoteLineItem
  currency: string
  checked: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <Label
      htmlFor={`opt-${line.id}`}
      className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/50 has-[:disabled]:cursor-default has-[:disabled]:opacity-70"
    >
      <Checkbox
        id={`opt-${line.id}`}
        checked={checked}
        onCheckedChange={onToggle}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-medium">{line.description}</span>
          <span className="shrink-0 text-sm font-medium tabular-nums">
            {formatPence(line.line_total_pence, currency)}
          </span>
        </div>
        {line.detail && (
          <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
            {line.detail}
          </p>
        )}
        {line.standard && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Standard:</span> {line.standard}
          </p>
        )}
      </div>
    </Label>
  )
}
