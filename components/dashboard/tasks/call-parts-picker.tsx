'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Wrench, Plus, Minus, Trash2, Search, Loader2, Lock } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import type { CallPartLine } from '@/lib/types/database'
import {
  searchCallParts,
  getCallParts,
  upsertCallPart,
  removeCallPart,
} from '@/lib/actions/call-parts'

interface CallPartsPickerProps {
  taskId: string
  /** Whether the current user can edit (assigned engineer while active, or office/admin). */
  canEdit?: boolean
}

/** Format integer pence as GBP, or a dash when the cost is unknown. */
function formatPence(pence: number | null | undefined): string {
  if (pence == null) return '—'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100)
}

/**
 * Picker for the catalogue parts actually used/fitted on a call. Always shown
 * (no defect required). Changes autosave. Line and total cost are shown for
 * internal reference only — charging is handled in a later pass. Never shown to
 * clients.
 */
export function CallPartsPicker({ taskId, canEdit = true }: CallPartsPickerProps) {
  const [lines, setLines] = useState<CallPartLine[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<CallPartLine[]>([])
  const [searching, startSearch] = useTransition()
  const [, startSave] = useTransition()
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load existing parts for this task.
  useEffect(() => {
    let active = true
    getCallParts(taskId).then((data) => {
      if (active) {
        setLines(data)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [taskId])

  function runSearch(query: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      startSearch(async () => {
        const results = await searchCallParts(query)
        setOptions(results)
      })
    }, 250)
  }

  function addPart(part: CallPartLine) {
    setOpen(false)
    if (lines.some((l) => l.part_id === part.part_id)) return
    const next = [...lines, { ...part, quantity: 1 }]
    setLines(next)
    startSave(async () => {
      await upsertCallPart(taskId, part.part_id, 1)
    })
  }

  function changeQty(partId: string, delta: number) {
    setLines((prev) =>
      prev.map((l) =>
        l.part_id === partId ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l,
      ),
    )
    const line = lines.find((l) => l.part_id === partId)
    const nextQty = Math.max(1, (line?.quantity ?? 1) + delta)
    startSave(async () => {
      await upsertCallPart(taskId, partId, nextQty)
    })
  }

  function remove(partId: string) {
    setLines((prev) => prev.filter((l) => l.part_id !== partId))
    startSave(async () => {
      await removeCallPart(taskId, partId)
    })
  }

  const totalPence = lines.reduce(
    (sum, l) => (l.unit_cost_pence == null ? sum : sum + l.unit_cost_pence * l.quantity),
    0,
  )
  const anyMissingCost = lines.some((l) => l.unit_cost_pence == null)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Wrench className="h-5 w-5 text-muted-foreground" />
              Parts used on this call
            </CardTitle>
            <CardDescription>
              Catalogue parts fitted or used during this call.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="flex items-center gap-1">
            <Lock className="h-3 w-3" />
            Internal only
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading parts...
          </p>
        ) : (
          <>
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No parts recorded yet.
                {canEdit ? ' Search the catalogue below to add one.' : ''}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {lines.map((line) => (
                  <li
                    key={line.part_id}
                    className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{line.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {line.sku ? `${line.sku} · ` : ''}
                        {formatPence(line.unit_cost_pence)} each
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {canEdit ? (
                        <div className="flex items-center rounded-md border">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => changeQty(line.part_id, -1)}
                            disabled={line.quantity <= 1}
                            aria-label={`Decrease quantity of ${line.name}`}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <span className="min-w-8 text-center text-sm tabular-nums">
                            {line.quantity}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => changeQty(line.part_id, 1)}
                            aria-label={`Increase quantity of ${line.name}`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Badge variant="outline" className="tabular-nums">
                          {line.quantity} {line.unit}
                        </Badge>
                      )}
                      <span className="min-w-16 text-right text-sm tabular-nums text-muted-foreground">
                        {line.unit_cost_pence == null
                          ? '—'
                          : formatPence(line.unit_cost_pence * line.quantity)}
                      </span>
                      {canEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => remove(line.part_id)}
                          aria-label={`Remove ${line.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {lines.length > 0 && (
              <div className="flex items-center justify-between border-t pt-2 text-sm">
                <span className="text-muted-foreground">
                  Estimated parts cost{anyMissingCost ? ' (some parts unpriced)' : ''}
                </span>
                <span className="font-medium tabular-nums">{formatPence(totalPence)}</span>
              </div>
            )}

            {canEdit && (
              <Popover
                open={open}
                onOpenChange={(o) => {
                  setOpen(o)
                  if (o) runSearch('')
                }}
              >
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add part
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <div className="flex items-center border-b px-3">
                      <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                      <CommandInput
                        placeholder="Search catalogue by name or SKU..."
                        onValueChange={runSearch}
                        className="border-0"
                      />
                    </div>
                    <CommandList>
                      {searching ? (
                        <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> Searching...
                        </div>
                      ) : (
                        <CommandEmpty>No parts found.</CommandEmpty>
                      )}
                      <CommandGroup>
                        {options.map((opt) => {
                          const already = lines.some((l) => l.part_id === opt.part_id)
                          return (
                            <CommandItem
                              key={opt.part_id}
                              value={opt.part_id}
                              disabled={already}
                              onSelect={() => addPart(opt)}
                            >
                              <div className="flex min-w-0 flex-col">
                                <span className="truncate">{opt.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {opt.sku ? `${opt.sku} · ` : ''}
                                  {formatPence(opt.unit_cost_pence)}
                                </span>
                              </div>
                              {already && (
                                <Badge variant="secondary" className="ml-auto text-xs">
                                  Added
                                </Badge>
                              )}
                            </CommandItem>
                          )
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
