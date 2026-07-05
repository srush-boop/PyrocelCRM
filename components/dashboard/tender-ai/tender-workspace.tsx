'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus,
  Loader2,
  Sparkles,
  Trophy,
  ChevronDown,
  BookOpen,
  Paperclip,
  Save,
  Upload,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  TENDER_STATUS_META,
  type Tender,
  type TenderQuestion,
  type TenderStatus,
  type TenderAnswerSource,
} from '@/lib/tender/types'

interface WorkspaceProps {
  tender: Tender
  initialQuestions: TenderQuestion[]
}

interface RecommendedEvidence {
  id: string
  title: string
}

// Draft an answer for a single question via the RAG endpoint, then persist it.
// Returns the saved answer + sources, or null on failure.
async function draftAndSave(
  question: TenderQuestion,
): Promise<{ answer: string; sources: TenderAnswerSource[] } | null> {
  const res = await fetch('/api/tender/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: question.question }),
  })
  if (!res.ok) return null
  const data = await res.json()
  const answer: string = data.answer ?? ''
  const sources: TenderAnswerSource[] = data.sources ?? []
  if (!answer.trim()) return null

  await fetch(`/api/tender/questions/${question.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer, sources, status: 'draft' }),
  })
  return { answer, sources }
}

export function TenderWorkspace({ tender, initialQuestions }: WorkspaceProps) {
  const router = useRouter()
  const [questions, setQuestions] = useState<TenderQuestion[]>(initialQuestions)
  const [status, setStatus] = useState<TenderStatus>(tender.status)
  const [newQuestion, setNewQuestion] = useState('')
  const [adding, setAdding] = useState(false)

  // Tender-pack upload + auto-draft state.
  const [file, setFile] = useState<File | null>(null)
  const [autoDraft, setAutoDraft] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [draftProgress, setDraftProgress] = useState<{ current: number; total: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const updateStatus = useCallback(
    async (value: TenderStatus) => {
      setStatus(value)
      try {
        const res = await fetch(`/api/tender/tenders/${tender.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: value }),
        })
        if (!res.ok) throw new Error()
        toast.success('Status updated')
      } catch {
        toast.error('Failed to update status')
      }
    },
    [tender.id],
  )

  const patchQuestion = useCallback((id: string, patch: Partial<TenderQuestion>) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)))
  }, [])

  const addQuestion = useCallback(async () => {
    if (!newQuestion.trim()) return
    setAdding(true)
    try {
      const res = await fetch(`/api/tender/tenders/${tender.id}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: newQuestion.trim() }),
      })
      if (!res.ok) throw new Error('Failed to add question')
      const { question } = await res.json()
      setQuestions((prev) => [...prev, question])
      setNewQuestion('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add question')
    } finally {
      setAdding(false)
    }
  }, [newQuestion, tender.id])

  // Draft answers for a batch of freshly-added questions, one at a time, so the
  // UI can show progress and each answer streams into its card as it completes.
  const batchDraft = useCallback(
    async (toDraft: TenderQuestion[]) => {
      setDraftProgress({ current: 0, total: toDraft.length })
      let failures = 0
      for (let i = 0; i < toDraft.length; i++) {
        setDraftProgress({ current: i + 1, total: toDraft.length })
        try {
          const result = await draftAndSave(toDraft[i])
          if (result) {
            patchQuestion(toDraft[i].id, {
              answer: result.answer,
              sources: result.sources,
              status: 'draft',
            })
          } else {
            failures++
          }
        } catch {
          failures++
        }
      }
      setDraftProgress(null)
      if (failures === 0) {
        toast.success(`Drafted ${toDraft.length} answer${toDraft.length === 1 ? '' : 's'}`)
      } else if (failures < toDraft.length) {
        toast.warning(`Drafted ${toDraft.length - failures} of ${toDraft.length}. ${failures} need a manual draft.`)
      } else {
        toast.error('Could not draft answers. Add company knowledge in the Knowledge Centre, then try again.')
      }
    },
    [patchQuestion],
  )

  const extractPack = useCallback(async () => {
    if (!file) return
    setExtracting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/tender/tenders/${tender.id}/extract`, {
        method: 'POST',
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to read the tender pack')

      const extracted: TenderQuestion[] = data.questions ?? []
      if (extracted.length === 0) {
        toast.info(data.message ?? 'No answerable questions were found in that document.')
        return
      }

      setQuestions((prev) => [...prev, ...extracted])
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      toast.success(`Extracted ${extracted.length} question${extracted.length === 1 ? '' : 's'} from the pack`)

      if (autoDraft) {
        await batchDraft(extracted)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to read the tender pack')
    } finally {
      setExtracting(false)
    }
  }, [file, tender.id, autoDraft, batchDraft])

  const busy = extracting || draftProgress !== null

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{tender.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[tender.client_name, tender.reference].filter(Boolean).join(' · ') || 'No client set'}
            {tender.due_date && ` · Due ${new Date(tender.due_date).toLocaleDateString()}`}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={status} onValueChange={(v) => updateStatus(v as TenderStatus)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TENDER_STATUS_META) as TenderStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {TENDER_STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Upload tender pack */}
      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Upload className="size-4 text-primary" />
            <h2 className="font-medium">Upload the client tender pack</h2>
          </div>
          <p className="text-sm text-muted-foreground text-pretty">
            Upload the tender document (PDF, Word or text). The AI reads it, pulls out every
            question, and can draft a grounded answer to each one automatically.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              ref={fileInputRef}
              id="tender-pack"
              type="file"
              accept=".pdf,.docx,.txt,.md,.csv,application/pdf"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full cursor-pointer rounded-md border bg-background text-sm file:mr-3 file:cursor-pointer file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium disabled:opacity-50"
            />
          </div>

          {tender.pack_file_name && !file && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileText className="size-3.5" />
              Last uploaded: {tender.pack_file_name}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={autoDraft}
                onCheckedChange={(v) => setAutoDraft(v === true)}
                disabled={busy}
              />
              Automatically draft answers with AI after extracting
            </label>
            <Button onClick={extractPack} disabled={busy || !file}>
              {extracting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {extracting ? 'Reading pack…' : 'Extract questions'}
            </Button>
          </div>

          {draftProgress && (
            <div className="flex flex-col gap-1.5 rounded-md border bg-background p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  Drafting answers…
                </span>
                <span className="text-muted-foreground">
                  {draftProgress.current} of {draftProgress.total}
                </span>
              </div>
              <Progress value={(draftProgress.current / draftProgress.total) * 100} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add question */}
      <Card>
        <CardHeader className="pb-3">
          <h2 className="font-medium">Add a tender question</h2>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Textarea
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder="Paste a question from the tender document..."
            rows={3}
          />
          <div className="flex justify-end">
            <Button onClick={addQuestion} disabled={adding || !newQuestion.trim()}>
              {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add question
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Questions */}
      {questions.length === 0 ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          No questions yet. Upload the tender pack above, or add a question manually.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {questions.map((q, i) => (
            <QuestionCard
              key={q.id}
              index={i + 1}
              question={q}
              onPatch={patchQuestion}
              onSavedWinning={() => router.refresh()}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function QuestionCard({
  index,
  question,
  onPatch,
  onSavedWinning,
}: {
  index: number
  question: TenderQuestion
  onPatch: (id: string, patch: Partial<TenderQuestion>) => void
  onSavedWinning: () => void
}) {
  const [answer, setAnswer] = useState(question.answer ?? '')
  const [sources, setSources] = useState<TenderAnswerSource[]>(question.sources ?? [])
  const [evidence, setEvidence] = useState<RecommendedEvidence[]>([])
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [winning, setWinning] = useState(question.is_winning_response)

  // Adopt answers that arrive from outside this card (e.g. the batch auto-draft
  // updating parent state) without clobbering the user's in-progress edits.
  const lastSyncedAnswer = useRef(question.answer ?? '')
  useEffect(() => {
    const incoming = question.answer ?? ''
    if (incoming !== lastSyncedAnswer.current) {
      lastSyncedAnswer.current = incoming
      setAnswer(incoming)
      setSources(question.sources ?? [])
    }
  }, [question.answer, question.sources])

  const generate = useCallback(async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/tender/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.question }),
      })
      if (!res.ok) throw new Error('Failed to generate answer')
      const data = await res.json()
      lastSyncedAnswer.current = data.answer ?? ''
      setAnswer(data.answer ?? '')
      setSources(data.sources ?? [])
      setEvidence(data.recommendedEvidence ?? [])
      toast.success('Draft answer generated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate answer')
    } finally {
      setGenerating(false)
    }
  }, [question.question])

  const save = useCallback(
    async (opts?: { markWinning?: boolean; status?: TenderQuestion['status'] }) => {
      setSaving(true)
      try {
        const body: Record<string, unknown> = { answer, sources }
        if (opts?.status) body.status = opts.status
        if (opts?.markWinning !== undefined) body.is_winning_response = opts.markWinning
        const res = await fetch(`/api/tender/questions/${question.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error('Failed to save')
        if (opts?.markWinning) {
          setWinning(true)
          toast.success('Saved as a winning response and indexed for future tenders')
          onSavedWinning()
        } else {
          toast.success('Answer saved')
        }
        lastSyncedAnswer.current = answer
        onPatch(question.id, {
          answer,
          sources,
          status: opts?.status ?? question.status,
          is_winning_response: opts?.markWinning ?? winning,
        })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save')
      } finally {
        setSaving(false)
      }
    },
    [answer, sources, question.id, question.status, winning, onPatch, onSavedWinning],
  )

  return (
    <Card>
      <CardHeader className="gap-2 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              {index}
            </span>
            <p className="font-medium leading-snug text-pretty">{question.question}</p>
          </div>
          {winning && (
            <Badge className="shrink-0 bg-chart-2/20 text-foreground" variant="secondary">
              <Trophy className="size-3" />
              Winning
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={generate} disabled={generating}>
            {generating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {answer ? 'Regenerate with AI' : 'Generate with AI'}
          </Button>
        </div>

        <Textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="The AI draft will appear here. You can edit it freely before saving."
          rows={8}
        />

        {/* Sources used */}
        {sources.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
              <BookOpen className="size-4" />
              Sources used ({sources.length})
              <ChevronDown className="size-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 flex flex-col gap-1.5">
              {sources.map((s) => (
                <div
                  key={s.sourceId}
                  className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-1.5 text-sm"
                >
                  <span className="truncate">{s.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {Math.round(s.similarity * 100)}% match
                  </span>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Recommended evidence */}
        {evidence.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Paperclip className="size-4" />
              Recommended evidence to attach
            </p>
            <div className="flex flex-wrap gap-1.5">
              {evidence.map((e) => (
                <Badge key={e.id} variant="outline" className="font-normal">
                  {e.title}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => save({ status: 'final' })}
            disabled={saving || !answer.trim()}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save answer
          </Button>
          <Button
            size="sm"
            onClick={() => save({ markWinning: true, status: 'final' })}
            disabled={saving || !answer.trim() || winning}
          >
            <Trophy className="size-4" />
            Save as winning response
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
