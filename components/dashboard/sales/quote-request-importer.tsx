'use client'

import { useRef, useState, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Sparkles, Upload, FileText, Loader2, ClipboardPaste } from 'lucide-react'
import { toast } from 'sonner'
import type { AnalyzeResult, ClientRequestProposal } from '@/lib/ai/analyze-client-request'
import {
  REQUIREMENT_STATUS_META,
  type DraftRequirement,
  type RequirementSourceInfo,
} from '@/lib/sales-requirements'

function uid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

export interface ImportApplyPayload {
  summary: string
  proposalNotes: string | null
  requirements: DraftRequirement[]
  source: RequirementSourceInfo
  suggestedSystems: {
    system_type_id: string | null
    system_name: string
    work_type: string
    specification: string
  }[]
  recommendedSections: string[]
}

interface Props {
  systemTypes: { id: string; name: string }[]
  disabled?: boolean
  onApply: (payload: ImportApplyPayload) => void
}

type ReviewState = {
  proposal: ClientRequestProposal
  source: RequirementSourceInfo
  systemChecked: boolean[]
}

export function QuoteRequestImporter({ systemTypes, disabled, onApply }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [instructions, setInstructions] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [review, setReview] = useState<ReviewState | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const typeName = (id: string | null) =>
    id ? (systemTypes.find((t) => t.id === id)?.name ?? 'Unmatched type') : 'No system type'

  function reset() {
    setText('')
    setInstructions('')
    setFile(null)
    setReview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleAnalyse() {
    if (!file && !text.trim()) {
      toast.error('Paste the client request or choose a document first.')
      return
    }
    const fd = new FormData()
    if (file) fd.set('file', file)
    if (text.trim()) fd.set('text', text.trim())
    if (instructions.trim()) fd.set('instructions', instructions.trim())

    startTransition(async () => {
      const res: AnalyzeResult | null = await fetch('/api/quote-requests/analyze', {
        method: 'POST',
        body: fd,
      })
        .then((r) => r.json() as Promise<AnalyzeResult>)
        .catch(() => null)

      if (!res || !res.ok || !res.proposal || !res.source) {
        toast.error(res?.error ?? 'Could not analyse the document.')
        return
      }
      setReview({
        proposal: res.proposal,
        source: {
          source_type: res.source.sourceType,
          file_name: res.source.fileName,
          file_url: res.source.pathname,
          mime_type: res.source.mimeType,
          raw_text: res.source.rawText,
          summary: res.proposal.summary,
        },
        systemChecked: res.proposal.suggestedSystems.map(() => true),
      })
    })
  }

  function handleApply() {
    if (!review) return
    const { proposal, source, systemChecked } = review
    onApply({
      summary: proposal.summary,
      proposalNotes: proposal.proposalNotes,
      requirements: proposal.requirements.map((r) => ({
        key: uid(),
        category: r.category,
        requirement: r.requirement,
        our_response: r.our_response,
        status: r.status,
      })),
      source,
      suggestedSystems: proposal.suggestedSystems.filter((_, i) => systemChecked[i]),
      recommendedSections: proposal.recommendedSections,
    })
    const n = proposal.requirements.length
    toast.success(`Imported ${n} requirement${n === 1 ? '' : 's'} into the quote`)
    setOpen(false)
    reset()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled} className="gap-2">
          <Sparkles className="size-4" />
          Import client request
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import client request</DialogTitle>
          <DialogDescription>
            Paste a client email or upload a written specification. We&apos;ll summarise it, pull out
            each requirement, and draft our response for you to review.
          </DialogDescription>
        </DialogHeader>

        {!review ? (
          <div className="space-y-4">
            <Tabs defaultValue="paste">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="paste" className="gap-2">
                  <ClipboardPaste className="size-4" /> Paste text
                </TabsTrigger>
                <TabsTrigger value="upload" className="gap-2">
                  <Upload className="size-4" /> Upload document
                </TabsTrigger>
              </TabsList>
              <TabsContent value="paste" className="mt-3">
                <Label htmlFor="req-text" className="sr-only">
                  Client request text
                </Label>
                <Textarea
                  id="req-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste the client's email or specification here..."
                  className="min-h-40 text-base"
                />
              </TabsContent>
              <TabsContent value="upload" className="mt-3">
                <label
                  htmlFor="req-file"
                  className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/60"
                >
                  <FileText className="size-6" />
                  {file ? (
                    <span className="font-medium text-foreground">{file.name}</span>
                  ) : (
                    <>
                      <span className="font-medium text-foreground">Choose a file</span>
                      <span>PDF, Word (.docx) or text</span>
                    </>
                  )}
                  <input
                    id="req-file"
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt,.md,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    className="sr-only"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </TabsContent>
            </Tabs>

            <div className="grid gap-1.5">
              <Label htmlFor="req-instructions">Notes for the assistant (optional)</Label>
              <Textarea
                id="req-instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. This is a competitive tender, focus on compliance with BS 5839-1."
                className="min-h-16 text-base"
              />
            </div>
          </div>
        ) : (
          <ScrollArea className="max-h-[55vh] pr-3">
            <div className="space-y-4">
              <section className="rounded-md border border-border bg-muted/30 p-3">
                <h3 className="text-sm font-semibold">Summary</h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  {review.proposal.summary}
                </p>
              </section>

              <section>
                <h3 className="text-sm font-semibold">
                  Requirements ({review.proposal.requirements.length})
                </h3>
                <ul className="mt-2 space-y-2">
                  {review.proposal.requirements.map((r, i) => {
                    const meta = REQUIREMENT_STATUS_META[r.status]
                    return (
                      <li key={i} className="rounded-md border border-border p-2.5 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium">{r.requirement}</span>
                          <Badge variant="outline" className={meta.badgeClass}>
                            {meta.short}
                          </Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground leading-relaxed">{r.our_response}</p>
                      </li>
                    )
                  })}
                </ul>
              </section>

              {review.proposal.suggestedSystems.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold">Suggested systems to add</h3>
                  <p className="text-xs text-muted-foreground">
                    Selected systems are added to the quote with their scope filled in. You still add
                    line items and pricing yourself.
                  </p>
                  <ul className="mt-2 space-y-2">
                    {review.proposal.suggestedSystems.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 rounded-md border border-border p-2.5">
                        <Checkbox
                          id={`sys-${i}`}
                          checked={review.systemChecked[i]}
                          onCheckedChange={(v) =>
                            setReview((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    systemChecked: prev.systemChecked.map((c, j) =>
                                      j === i ? v === true : c,
                                    ),
                                  }
                                : prev,
                            )
                          }
                          className="mt-0.5"
                        />
                        <Label htmlFor={`sys-${i}`} className="flex-1 cursor-pointer font-normal">
                          <span className="block text-sm font-medium">{s.system_name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {typeName(s.system_type_id)} · {s.work_type}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground leading-relaxed">
                            {s.specification}
                          </span>
                        </Label>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {review.proposal.recommendedSections.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold">Recommended proposal sections</h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {review.proposal.recommendedSections.map((s, i) => (
                      <Badge key={i} variant="secondary">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          {!review ? (
            <Button type="button" onClick={handleAnalyse} disabled={isPending} className="gap-2">
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {isPending ? 'Analysing...' : 'Analyse'}
            </Button>
          ) : (
            <div className="flex w-full items-center justify-between gap-2">
              <Button type="button" variant="ghost" onClick={() => setReview(null)}>
                Back
              </Button>
              <Button type="button" onClick={handleApply}>
                Apply to quote
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
