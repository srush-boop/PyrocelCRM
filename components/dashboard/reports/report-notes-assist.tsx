'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Sparkles, Loader2, Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import {
  suggestReportNotes,
  type SuggestReportNotesInput,
} from '@/lib/ai/suggest-report-notes'

interface ReportNotesAssistProps {
  // Everything the action needs except the free-text observation, which is
  // captured in the popover for "defect" mode. For "summary" mode the input
  // already carries the checklist + existing notes.
  input: Omit<SuggestReportNotesInput, 'observation'>
  // How the generated text is returned to the parent field: "append" adds it to
  // the end of any existing text, "replace" swaps the field's content.
  onInsert: (text: string, applyMode: 'append' | 'replace') => void
  // "defect" shows a small observation box; "summary" generates straight away.
  disabled?: boolean
  label?: string
}

export function ReportNotesAssist({
  input,
  onInsert,
  disabled,
  label = 'AI assist',
}: ReportNotesAssistProps) {
  const [open, setOpen] = useState(false)
  const [observation, setObservation] = useState('')
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const isDefect = input.mode === 'defect'

  async function generate() {
    setLoading(true)
    setDraft('')
    const res = await suggestReportNotes({
      ...input,
      observation: isDefect ? observation : undefined,
    })
    setLoading(false)
    if (!res.ok || !res.text) {
      toast.error(res.error ?? 'Could not generate a suggestion.')
      return
    }
    setDraft(res.text)
  }

  function insert(applyMode: 'append' | 'replace') {
    if (!draft.trim()) return
    onInsert(draft.trim(), applyMode)
    setOpen(false)
    setDraft('')
    setObservation('')
    toast.success('Added to the report.')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="gap-1.5"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        collisionPadding={12}
        className="w-[min(20rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-6rem)] overflow-y-auto space-y-3"
      >
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {isDefect ? 'Describe the fault' : 'Draft engineer summary'}
          </p>
          <p className="text-xs text-muted-foreground">
            {isDefect
              ? 'Add a short note and the assistant will write a technical defect description.'
              : 'Generates a technical summary from your checklist results.'}
          </p>
        </div>

        {isDefect && (
          <Textarea
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            placeholder="e.g. detector head missing in room 3, base only"
            rows={3}
            className="text-sm"
          />
        )}

        {draft ? (
          <div className="space-y-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              className="text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => insert('append')}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Append
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => insert('replace')}
              >
                Replace
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={generate}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                )}
                Regenerate
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={generate}
            disabled={loading || (isDefect && !observation.trim())}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Generate
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
