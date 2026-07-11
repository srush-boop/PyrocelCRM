'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, Package, Plus, Minus, Search, Trash2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { searchSuggestedParts } from '@/lib/actions/suggested-parts'
import { raiseFollowUp, type FollowUpPartInput } from '@/lib/actions/follow-up'
import type { SuggestedPartLine } from '@/lib/types/database'

interface PartLine {
  key: string
  partId: string | null
  name: string
  sku: string | null
  description: string | null
  quantity: number
}

interface FurtherWorksSheetProps {
  taskId: string
  isEmergency: boolean
  /** Persist the current inspection draft before raising the follow-up. */
  onBeforeRaise?: () => Promise<void>
}

/**
 * Engineer action: classify a non-recurring call as "further works required".
 * Captures an issue overview and engineer-suggested parts, then routes the
 * follow-up into the office review queue (a linked Planned Call is created after
 * review). Completing the original call here also flags emergency calls as
 * first-time-fix = NO and sends the original to Chargeable Calls review.
 */
export function FurtherWorksSheet({ taskId, isEmergency, onBeforeRaise }: FurtherWorksSheetProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [summary, setSummary] = useState('')
  const [lines, setLines] = useState<PartLine[]>([])
  const [freeText, setFreeText] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [options, setOptions] = useState<SuggestedPartLine[]>([])
  const [searching, startSearch] = useTransition()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function runSearch(query: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      startSearch(async () => setOptions(await searchSuggestedParts(query)))
    }, 250)
  }

  function addPart(part: SuggestedPartLine) {
    setPickerOpen(false)
    if (lines.some((l) => l.partId === part.part_id)) return
    setLines((prev) => [
      ...prev,
      { key: part.part_id, partId: part.part_id, name: part.name, sku: part.sku, description: null, quantity: 1 },
    ])
  }

  function addFreeText() {
    const text = freeText.trim()
    if (!text) return
    setLines((prev) => [
      ...prev,
      { key: `free-${Date.now()}`, partId: null, name: text, sku: null, description: text, quantity: 1 },
    ])
    setFreeText('')
  }

  function changeQty(key: string, delta: number) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l)),
    )
  }

  function remove(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  async function handleSubmit() {
    setError(null)
    if (!summary.trim()) {
      setError('Please describe the outstanding issue.')
      return
    }
    setSubmitting(true)
    try {
      if (onBeforeRaise) await onBeforeRaise()
      const parts: FollowUpPartInput[] = lines.map((l) => ({
        partId: l.partId,
        description: l.partId ? null : l.description,
        quantity: l.quantity,
      }))
      const res = await raiseFollowUp({ originalTaskId: taskId, issueSummary: summary, parts })
      if (!res.ok) {
        setError(res.error ?? 'Could not raise the follow-up.')
        setSubmitting(false)
        return
      }
      setOpen(false)
      router.push('/dashboard/schedule')
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-12 flex-1 border-amber-500/60 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
      >
        <Wrench className="mr-2 h-4 w-4" />
        Further works required
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Further works required
            </SheetTitle>
            <SheetDescription>
              The issue could not be resolved on this visit. This completes the current call and
              raises a follow-up for the office to review before a Planned Call is booked.
              {isEmergency ? ' This emergency call will be marked as first-time-fix = NO.' : ''}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 px-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="fw-summary">Issue overview</Label>
              <Textarea
                id="fw-summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Describe what's wrong, what was tried, and what's needed to resolve it..."
                rows={5}
              />
            </div>

            <div className="space-y-3">
              <div>
                <Label>Suggested parts</Label>
                <p className="text-xs text-muted-foreground">
                  Parts you think are needed to complete the works. The office can reserve or order these.
                </p>
              </div>

              {lines.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {lines.map((line) => (
                    <li
                      key={line.key}
                      className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{line.name}</p>
                        {line.sku && <p className="text-xs text-muted-foreground">{line.sku}</p>}
                        {!line.partId && (
                          <Badge variant="outline" className="mt-1 text-[10px]">
                            Free text
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center rounded-md border">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => changeQty(line.key, -1)}
                            disabled={line.quantity <= 1}
                            aria-label={`Decrease quantity of ${line.name}`}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <span className="min-w-8 text-center text-sm tabular-nums">{line.quantity}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => changeQty(line.key, 1)}
                            aria-label={`Increase quantity of ${line.name}`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => remove(line.key)}
                          aria-label={`Remove ${line.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <Popover
                open={pickerOpen}
                onOpenChange={(o) => {
                  setPickerOpen(o)
                  if (o) runSearch('')
                }}
              >
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    <Package className="mr-2 h-4 w-4" />
                    Add from parts list
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <div className="flex items-center border-b px-3">
                      <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                      <CommandInput
                        placeholder="Search parts by name or SKU..."
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
                          const already = lines.some((l) => l.partId === opt.part_id)
                          return (
                            <CommandItem
                              key={opt.part_id}
                              value={opt.part_id}
                              disabled={already}
                              onSelect={() => addPart(opt)}
                            >
                              <div className="flex min-w-0 flex-col">
                                <span className="truncate">{opt.name}</span>
                                {opt.sku && <span className="text-xs text-muted-foreground">{opt.sku}</span>}
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

              <div className="flex items-center gap-2">
                <Input
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder="Or type a part / material not in the list..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                      e.preventDefault()
                      addFreeText()
                    }
                  }}
                />
                <Button type="button" variant="secondary" size="sm" onClick={addFreeText} disabled={!freeText.trim()}>
                  Add
                </Button>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <SheetFooter className="flex-row gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Raising...
                </>
              ) : (
                'Raise follow-up'
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}
