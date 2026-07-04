'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, FileText, ClipboardList } from 'lucide-react'
import {
  REQUIREMENT_STATUSES,
  REQUIREMENT_STATUS_META,
  type DraftRequirement,
  type RequirementSourceInfo,
  type RequirementStatus,
} from '@/lib/sales-requirements'

function uid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

interface Props {
  requirements: DraftRequirement[]
  onChange: (next: DraftRequirement[]) => void
  source: RequirementSourceInfo | null
  showMatrix: boolean
  onShowMatrixChange: (v: boolean) => void
  disabled?: boolean
}

export function QuoteRequirementsEditor({
  requirements,
  onChange,
  source,
  showMatrix,
  onShowMatrixChange,
  disabled,
}: Props) {
  function update(key: string, patch: Partial<DraftRequirement>) {
    onChange(requirements.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }
  function remove(key: string) {
    onChange(requirements.filter((r) => r.key !== key))
  }
  function add() {
    onChange([
      ...requirements,
      { key: uid(), category: null, requirement: '', our_response: '', status: 'included' },
    ])
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="size-5" />
            Client requirements
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Each requirement from the client&apos;s request and our response. Kept internal unless you
            choose to show it on the quote.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {source && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-2.5 text-sm">
            <FileText className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">Imported from</span>
            <span className="font-medium">
              {source.source_type === 'file' ? (source.file_name ?? 'uploaded document') : 'pasted text'}
            </span>
            {source.source_type === 'file' && source.file_url && (
              <a
                href={`/api/quote-requests/file?pathname=${encodeURIComponent(source.file_url)}`}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline underline-offset-2"
              >
                View original
              </a>
            )}
          </div>
        )}

        {requirements.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No requirements yet. Use &quot;Import client request&quot; above, or add them manually.
          </p>
        ) : (
          <ul className="space-y-3">
            {requirements.map((r, i) => {
              const meta = REQUIREMENT_STATUS_META[r.status]
              return (
                <li key={r.key} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Requirement {i + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      <Select
                        value={r.status}
                        onValueChange={(v) => update(r.key, { status: v as RequirementStatus })}
                        disabled={disabled}
                      >
                        <SelectTrigger className={`h-8 w-36 ${meta.badgeClass}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {REQUIREMENT_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {REQUIREMENT_STATUS_META[s].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        onClick={() => remove(r.key)}
                        disabled={disabled}
                        aria-label="Remove requirement"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-2 grid gap-2 md:grid-cols-[1fr_2fr]">
                    <div className="grid gap-1.5">
                      <Label className="text-xs" htmlFor={`cat-${r.key}`}>
                        Category
                      </Label>
                      <Input
                        id={`cat-${r.key}`}
                        value={r.category ?? ''}
                        onChange={(e) => update(r.key, { category: e.target.value || null })}
                        placeholder="e.g. Detection"
                        disabled={disabled}
                        className="text-base"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs" htmlFor={`req-${r.key}`}>
                        Requirement
                      </Label>
                      <Textarea
                        id={`req-${r.key}`}
                        value={r.requirement}
                        onChange={(e) => update(r.key, { requirement: e.target.value })}
                        placeholder="What the client asked for"
                        disabled={disabled}
                        className="min-h-10 text-base"
                      />
                    </div>
                  </div>

                  <div className="mt-2 grid gap-1.5">
                    <Label className="text-xs" htmlFor={`resp-${r.key}`}>
                      Our response
                    </Label>
                    <Textarea
                      id={`resp-${r.key}`}
                      value={r.our_response}
                      onChange={(e) => update(r.key, { our_response: e.target.value })}
                      placeholder="How we meet this requirement"
                      disabled={disabled}
                      className="min-h-10 text-base"
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" size="sm" onClick={add} disabled={disabled} className="gap-2">
            <Plus className="size-4" />
            Add requirement
          </Button>

          {requirements.length > 0 && (
            <div className="flex items-center gap-2">
              <Switch
                id="show-matrix"
                checked={showMatrix}
                onCheckedChange={onShowMatrixChange}
                disabled={disabled}
              />
              <Label htmlFor="show-matrix" className="cursor-pointer text-sm font-normal">
                Show this matrix on the client quote &amp; PDF
              </Label>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
