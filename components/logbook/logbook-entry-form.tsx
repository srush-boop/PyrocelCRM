'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LOGBOOK_ENTRY_TYPES, getLogbookEntryMeta } from '@/lib/logbook'
import type { LogbookEntryType } from '@/lib/types/database'
import { toast } from 'sonner'

export interface LogbookEntryFormValues {
  entry_type: LogbookEntryType
  entry_date: string
  title: string
  details: string
  performed_by: string
}

export interface LogbookEntryFormProps {
  /** Submit handler returning an error message string on failure, or null/undefined on success. */
  onSubmit: (values: LogbookEntryFormValues) => Promise<string | null | undefined>
  /** Label for the "performed by" field — occupiers see "Your name". */
  performedByLabel?: string
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function LogbookEntryForm({ onSubmit, performedByLabel = 'Performed by' }: LogbookEntryFormProps) {
  const [entryType, setEntryType] = useState<LogbookEntryType>('weekly_alarm_test')
  const [entryDate, setEntryDate] = useState(today())
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [performedBy, setPerformedBy] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const meta = getLogbookEntryMeta(entryType)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const error = await onSubmit({
      entry_type: entryType,
      entry_date: entryDate,
      title: title.trim(),
      details: details.trim(),
      performed_by: performedBy.trim(),
    })
    setSubmitting(false)
    if (error) {
      toast.error(error)
      return
    }
    toast.success('Log book entry added')
    setTitle('')
    setDetails('')
    setPerformedBy('')
    setEntryDate(today())
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="entry_type">Entry type</Label>
          <Select value={entryType} onValueChange={(v) => setEntryType(v as LogbookEntryType)}>
            <SelectTrigger id="entry_type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOGBOOK_ENTRY_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {meta.reference !== '—' ? `${meta.reference}: ` : ''}
            {meta.description}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="entry_date">Date</Label>
          <Input
            id="entry_date"
            type="date"
            value={entryDate}
            max={today()}
            onChange={(e) => setEntryDate(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Title / summary</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Weekly test - call point 3 (reception)"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="details">Details</Label>
        <Textarea
          id="details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Result, observations, faults found, remedial action…"
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="performed_by">{performedByLabel}</Label>
        <Input
          id="performed_by"
          value={performedBy}
          onChange={(e) => setPerformedBy(e.target.value)}
          placeholder="Name of person carrying out the check"
        />
      </div>

      <Button type="submit" disabled={submitting}>
        {submitting ? 'Adding…' : 'Add entry'}
      </Button>
    </form>
  )
}
