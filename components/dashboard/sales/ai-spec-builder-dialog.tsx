'use client'

import { useState, useTransition } from 'react'
import { Sparkles, Loader2, ArrowLeft, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  generateSpecQuestions,
  compileSpecification,
  type SpecQuestion,
} from '@/lib/ai/build-quote-spec'

// Guided AI wizard: asks the estimator the relevant fire alarm specification
// questions (pre-filled with AI-suggested answers), then compiles their answers
// into a specification written back to the system.

type Answer = { single: string; multi: string[]; text: string }

function initialAnswer(q: SpecQuestion): Answer {
  if (q.type === 'multi') return { single: '', multi: [...q.suggested], text: '' }
  if (q.type === 'text') return { single: '', multi: [], text: q.suggested[0] ?? '' }
  return { single: q.suggested[0] ?? '', multi: [], text: '' }
}

function answerToString(q: SpecQuestion, a: Answer): string {
  if (q.type === 'multi') return a.multi.join(', ')
  if (q.type === 'text') return a.text.trim()
  return a.single
}

export function AiSpecBuilderDialog({
  systemTypeName,
  workTypeLabel,
  workTypeCode,
  existingAnswers,
  existingSpecification,
  onGenerated,
  disabled,
}: {
  systemTypeName: string
  workTypeLabel: string
  workTypeCode: string
  existingAnswers?: Record<string, string | number | boolean>
  existingSpecification?: string
  onGenerated: (specification: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [questions, setQuestions] = useState<SpecQuestion[] | null>(null)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [loadingQuestions, startLoadingQuestions] = useTransition()
  const [compiling, startCompiling] = useTransition()

  function loadQuestions() {
    startLoadingQuestions(async () => {
      const res = await generateSpecQuestions({
        systemTypeName,
        workTypeLabel,
        workTypeCode,
        existingAnswers,
        existingSpecification,
      })
      if (!res.ok || !res.questions) {
        toast.error(res.error ?? 'Could not generate questions.')
        return
      }
      const map: Record<string, Answer> = {}
      for (const q of res.questions) map[q.id] = initialAnswer(q)
      setQuestions(res.questions)
      setAnswers(map)
    })
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next && !questions && !loadingQuestions) {
      loadQuestions()
    }
    if (!next) {
      // Reset so the next open regenerates for the current selection.
      setQuestions(null)
      setAnswers({})
    }
  }

  function updateAnswer(id: string, patch: Partial<Answer>) {
    setAnswers((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  function toggleMulti(id: string, option: string, checked: boolean) {
    setAnswers((prev) => {
      const current = prev[id]?.multi ?? []
      const next = checked ? [...current, option] : current.filter((o) => o !== option)
      return { ...prev, [id]: { ...prev[id], multi: next } }
    })
  }

  function handleCompile() {
    if (!questions) return
    const payload = questions.map((q) => ({
      question: q.question,
      answer: answerToString(q, answers[q.id] ?? initialAnswer(q)),
    }))
    startCompiling(async () => {
      const res = await compileSpecification({
        systemTypeName,
        workTypeLabel,
        workTypeCode,
        answers: payload,
      })
      if (!res.ok || !res.text) {
        toast.error(res.error ?? 'Could not compile the specification.')
        return
      }
      onGenerated(res.text)
      toast.success('Specification built and applied')
      handleOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        disabled={disabled}
        onClick={() => handleOpenChange(true)}
      >
        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
        Build with AI
      </Button>

      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Build specification with AI
          </DialogTitle>
          <DialogDescription>
            {workTypeLabel} — {systemTypeName}. Review the suggested answers, adjust anything, then
            generate the specification.
          </DialogDescription>
        </DialogHeader>

        {loadingQuestions || !questions ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            Preparing the relevant questions…
          </div>
        ) : (
          <ScrollArea className="flex-1 overflow-y-auto">
            <div className="space-y-5 px-6 py-5">
              {questions.map((q, i) => {
                const a = answers[q.id] ?? initialAnswer(q)
                return (
                  <div key={q.id} className="grid gap-2">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                        {i + 1}
                      </span>
                      <div className="grid gap-0.5">
                        <Label className="text-sm font-medium leading-snug">{q.question}</Label>
                        {q.help && <p className="text-xs text-muted-foreground">{q.help}</p>}
                      </div>
                    </div>

                    <div className="pl-7">
                      {q.type === 'single' && (
                        <RadioGroup
                          value={a.single}
                          onValueChange={(v) => updateAnswer(q.id, { single: v })}
                          className="gap-1.5"
                        >
                          {q.options.map((opt) => {
                            const suggested = q.suggested[0] === opt
                            return (
                              <label
                                key={opt}
                                className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted/40"
                              >
                                <RadioGroupItem value={opt} />
                                <span className="flex-1">{opt}</span>
                                {suggested && (
                                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                                    Suggested
                                  </Badge>
                                )}
                              </label>
                            )
                          })}
                        </RadioGroup>
                      )}

                      {q.type === 'multi' && (
                        <div className="grid gap-1.5">
                          {q.options.map((opt) => {
                            const checked = a.multi.includes(opt)
                            const suggested = q.suggested.includes(opt)
                            return (
                              <label
                                key={opt}
                                className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted/40"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(c) => toggleMulti(q.id, opt, c === true)}
                                />
                                <span className="flex-1">{opt}</span>
                                {suggested && (
                                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                                    Suggested
                                  </Badge>
                                )}
                              </label>
                            )
                          })}
                        </div>
                      )}

                      {q.type === 'text' && (
                        <Textarea
                          value={a.text}
                          onChange={(e) => updateAnswer(q.id, { text: e.target.value })}
                          rows={3}
                          placeholder="Type your answer…"
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t px-6 py-4">
          {questions && !loadingQuestions && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={loadQuestions}
              disabled={loadingQuestions || compiling}
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Regenerate questions
            </Button>
          )}
          <Button
            type="button"
            className="ml-auto"
            onClick={handleCompile}
            disabled={!questions || loadingQuestions || compiling}
          >
            {compiling ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Building…
              </>
            ) : (
              <>
                <Check className="mr-1.5 h-4 w-4" />
                Generate specification
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
