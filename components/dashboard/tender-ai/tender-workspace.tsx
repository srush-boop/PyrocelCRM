'use client'

import { useState, useCallback } from 'react'
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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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

export function TenderWorkspace({ tender, initialQuestions }: WorkspaceProps) {
  const router = useRouter()
  const [questions, setQuestions] = useState<TenderQuestion[]>(initialQuestions)
  const [status, setStatus] = useState<TenderStatus>(tender.status)
  const [newQuestion, setNewQuestion] = useState('')
  const [adding, setAdding] = useState(false)

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

  const patchQuestion = useCallback((id: string, patch: Partial<TenderQuestion>) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)))
  }, [])

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
          No questions yet. Add one above to start drafting answers.
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
