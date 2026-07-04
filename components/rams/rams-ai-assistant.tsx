'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { RiskScoreBadge } from '@/components/rams/risk-matrix'
import {
  suggestRamsContent,
  type RamsSuggestion,
} from '@/lib/ai/suggest-rams-content'

// The subset of a suggestion the author chose to apply back into the wizard.
export interface AppliedRamsSuggestion {
  scope?: string
  methodSteps?: string[]
  hazards?: RamsSuggestion['hazards']
  siteConsiderations?: string
}

interface RamsAiAssistantProps {
  context: {
    title: string
    systemType?: string | null
    workType?: string | null
    workDescription?: string | null
    workLocation?: string | null
  }
  onApply: (parts: AppliedRamsSuggestion) => void
}

export function RamsAiAssistant({ context, onApply }: RamsAiAssistantProps) {
  const [open, setOpen] = useState(false)
  const [brief, setBrief] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<RamsSuggestion | null>(null)

  // Which sections to apply. Default all on; toggled off if a section is empty.
  const [useScope, setUseScope] = useState(true)
  const [useMethod, setUseMethod] = useState(true)
  const [useHazards, setUseHazards] = useState(true)
  const [useConsiderations, setUseConsiderations] = useState(true)

  async function handleGenerate() {
    setLoading(true)
    setResult(null)
    try {
      const res = await suggestRamsContent({
        title: context.title,
        systemType: context.systemType,
        workType: context.workType,
        workDescription: context.workDescription,
        workLocation: context.workLocation,
        brief: brief.trim() || null,
      })
      if (!res.ok || !res.suggestion) {
        toast.error(res.error ?? 'Could not generate suggestions.')
        return
      }
      setResult(res.suggestion)
      setUseScope(Boolean(res.suggestion.scope.trim()))
      setUseMethod(res.suggestion.methodSteps.length > 0)
      setUseHazards(res.suggestion.hazards.length > 0)
      setUseConsiderations(Boolean(res.suggestion.siteConsiderations.trim()))
    } finally {
      setLoading(false)
    }
  }

  function handleApply() {
    if (!result) return
    onApply({
      scope: useScope ? result.scope : undefined,
      methodSteps: useMethod ? result.methodSteps : undefined,
      hazards: useHazards ? result.hazards : undefined,
      siteConsiderations: useConsiderations ? result.siteConsiderations : undefined,
    })
    toast.success('Applied AI suggestions')
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setResult(null)
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          <Sparkles className="mr-2 h-4 w-4" />
          AI Assist
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>AI RAMS Assistant</DialogTitle>
          <DialogDescription>
            Drafts a scope, method steps, hazards with controls, and site considerations from
            this job&apos;s details. Review and choose what to apply — nothing is saved until you
            do.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={3}
              placeholder="Optional: add extra context to steer the draft, e.g. 'occupied hospital ward, out-of-hours working, scaffold already in place'."
              aria-label="Additional brief for the AI assistant"
            />
            <Button type="button" onClick={handleGenerate} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {result ? 'Regenerate' : 'Generate'}
            </Button>
          </div>

          {result && (
            <div className="space-y-4 border-t pt-4">
              {/* Scope */}
              {result.scope.trim() && (
                <SectionToggle
                  checked={useScope}
                  onCheckedChange={setUseScope}
                  label="Description of works"
                >
                  <p className="text-sm leading-relaxed text-muted-foreground">{result.scope}</p>
                </SectionToggle>
              )}

              {/* Method steps */}
              {result.methodSteps.length > 0 && (
                <SectionToggle
                  checked={useMethod}
                  onCheckedChange={setUseMethod}
                  label={`Method statement (${result.methodSteps.length} steps)`}
                >
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                    {result.methodSteps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </SectionToggle>
              )}

              {/* Hazards */}
              {result.hazards.length > 0 && (
                <SectionToggle
                  checked={useHazards}
                  onCheckedChange={setUseHazards}
                  label={`Hazards (${result.hazards.length})`}
                >
                  <ul className="space-y-3">
                    {result.hazards.map((h, i) => (
                      <li key={i} className="rounded-md border p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{h.description}</span>
                          <span className="flex items-center gap-1">
                            <RiskScoreBadge likelihood={h.likelihood} severity={h.severity} />
                            <span className="text-xs text-muted-foreground">→</span>
                            <RiskScoreBadge
                              likelihood={h.residual_likelihood}
                              severity={h.residual_severity}
                            />
                          </span>
                        </div>
                        {h.potential_consequences && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {h.potential_consequences}
                          </p>
                        )}
                        {h.controls.length > 0 && (
                          <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                            {h.controls.map((c, ci) => (
                              <li key={ci}>{c}</li>
                            ))}
                          </ul>
                        )}
                        <Badge variant="secondary" className="mt-2">
                          {h.category}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </SectionToggle>
              )}

              {/* Site considerations */}
              {result.siteConsiderations.trim() && (
                <SectionToggle
                  checked={useConsiderations}
                  onCheckedChange={setUseConsiderations}
                  label="Site-specific considerations"
                >
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {result.siteConsiderations}
                  </p>
                </SectionToggle>
              )}

              <p className="text-xs text-muted-foreground">
                AI can make mistakes. Always review hazards, scores and controls before saving.
                Applying hazards adds them to any you already selected.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={
              !result || (!useScope && !useMethod && !useHazards && !useConsiderations)
            }
          >
            Apply selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SectionToggle({
  checked,
  onCheckedChange,
  label,
  children,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox checked={checked} onCheckedChange={(c) => onCheckedChange(Boolean(c))} />
        {label}
      </label>
      <div className="pl-6">{children}</div>
    </div>
  )
}
