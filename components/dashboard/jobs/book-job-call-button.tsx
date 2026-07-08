'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { CalendarPlus, Loader2, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { bookCall } from '@/app/(dashboard)/dashboard/schedule/book-call-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ReactiveType {
  id: string
  name: string
  is_emergency: boolean
  default_kpi_hours: number | null
  system_type_id: string | null
}

interface BookJobCallButtonProps {
  jobId: string
  siteId: string | null
  siteName: string | null
  clientId: string | null
  jobNumber: string | null
  jobTitle: string | null
  poNumber: string | null
  jobNotes: string | null
}

const NO_ENGINEER = '__none__'

/**
 * Book a call directly from a job. Defaults to a Commissioning call linked back
 * to the job (`source_job_id`), copying key job info into the call notes so the
 * attending engineer has context and can open the job's documents folder.
 */
export function BookJobCallButton({
  jobId,
  siteId,
  siteName,
  clientId,
  jobNumber,
  jobTitle,
  poNumber,
  jobNotes,
}: BookJobCallButtonProps) {
  const router = useRouter()
  const supabase = createClient()

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [types, setTypes] = useState<ReactiveType[]>([])
  const [engineers, setEngineers] = useState<{ id: string; full_name: string | null }[]>([])
  const [loaded, setLoaded] = useState(false)

  const [serviceTypeId, setServiceTypeId] = useState('')
  const [engineerId, setEngineerId] = useState<string>(NO_ENGINEER)
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [isCommissioning, setIsCommissioning] = useState(true)
  const [notes, setNotes] = useState('')
  const [sendConfirmation, setSendConfirmation] = useState(true)

  // Build the commissioning info block copied from the job.
  function jobInfoBlock(): string {
    const lines = [
      `Commissioning for job ${jobNumber ?? ''}`.trim(),
      jobTitle ? `Scope: ${jobTitle}` : null,
      poNumber ? `Customer PO: ${poNumber}` : null,
      jobNotes ? `Job notes: ${jobNotes}` : null,
    ].filter(Boolean)
    return lines.join('\n')
  }

  // Load call types + engineers once when first opened.
  useEffect(() => {
    if (!open || loaded) return
    let active = true
    ;(async () => {
      const [typesRes, engsRes] = await Promise.all([
        supabase
          .from('service_types')
          .select('id, name, is_emergency, default_kpi_hours, system_type_id')
          .eq('is_recurring', false)
          .order('name'),
        supabase
          .from('profiles')
          .select('id, full_name')
          .eq('role', 'engineer')
          .order('full_name'),
      ])
      if (!active) return
      const t = (typesRes.data ?? []) as ReactiveType[]
      setTypes(t)
      setEngineers((engsRes.data ?? []) as { id: string; full_name: string | null }[])
      // Default to a Commissioning type when present.
      const commissioning = t.find((x) => /commission/i.test(x.name))
      setServiceTypeId(commissioning?.id ?? t[0]?.id ?? '')
      setLoaded(true)
    })()
    return () => {
      active = false
    }
  }, [open, loaded, supabase])

  // Keep the notes prefilled with job info while commissioning, unless the user
  // has typed something else.
  useEffect(() => {
    if (!open) return
    if (isCommissioning) {
      setNotes((prev) => (prev.trim() === '' ? jobInfoBlock() : prev))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isCommissioning])

  function resetAndClose() {
    setOpen(false)
    setError(null)
    setLoading(false)
    setEngineerId(NO_ENGINEER)
    setDate(format(new Date(), 'yyyy-MM-dd'))
    setStartTime('')
    setEndTime('')
    setIsCommissioning(true)
    setNotes('')
    setSendConfirmation(true)
    setLoaded(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!siteId) {
      setError('This job has no site, so a call cannot be booked.')
      return
    }
    if (!serviceTypeId) {
      setError('Select a call type.')
      return
    }
    if (startTime && endTime && endTime <= startTime) {
      setError('End time must be after the start time.')
      return
    }
    setError(null)
    setLoading(true)

    const selected = types.find((t) => t.id === serviceTypeId)
    const result = await bookCall({
      mode: 'reactive',
      siteId,
      clientId: clientId || null,
      serviceTypeId,
      systemTypeId: selected?.system_type_id ?? null,
      assignedEngineerId: engineerId === NO_ENGINEER ? null : engineerId,
      scheduledDate: date,
      bookedStartTime: startTime || null,
      bookedEndTime: endTime || null,
      respondByHours: selected?.default_kpi_hours ?? null,
      notes: notes.trim() || null,
      sourceJobId: jobId,
      isCommissioning,
      sendConfirmation,
    })

    setLoading(false)
    if (result.ok) {
      resetAndClose()
      router.refresh()
    } else {
      setError(result.error ?? 'Something went wrong.')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : resetAndClose())}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarPlus className="mr-2 h-4 w-4" />
          Book call
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Book a call from this job</DialogTitle>
          <DialogDescription>
            {siteName
              ? `The call will be logged against ${siteName} and linked to this job.`
              : 'The call will be linked to this job.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="job-call-type">Call type</Label>
            <Select value={serviceTypeId} onValueChange={setServiceTypeId}>
              <SelectTrigger id="job-call-type">
                <SelectValue placeholder="Select a call type" />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="job-call-engineer">Engineer (optional)</Label>
            <Select value={engineerId} onValueChange={setEngineerId}>
              <SelectTrigger id="job-call-engineer">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ENGINEER}>Unassigned</SelectItem>
                {engineers.map((eng) => (
                  <SelectItem key={eng.id} value={eng.id}>
                    {eng.full_name ?? 'Unnamed engineer'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="job-call-date">Date</Label>
            <Input
              id="job-call-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="job-call-start">Start time</Label>
              <Input
                id="job-call-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="job-call-end">End time</Label>
              <Input
                id="job-call-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-md border p-3">
            <Checkbox
              id="job-call-commissioning"
              checked={isCommissioning}
              onCheckedChange={(checked) => setIsCommissioning(checked === true)}
              className="mt-0.5"
            />
            <div className="grid gap-1">
              <Label htmlFor="job-call-commissioning" className="cursor-pointer">
                Commissioning call
              </Label>
              <p className="text-xs text-muted-foreground">
                Copies key job details into the call and lets the attending engineer open the
                job&apos;s documents folder.
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="job-call-notes">Call notes</Label>
            <Textarea
              id="job-call-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Information for the attending engineer."
            />
          </div>

          <div className="flex items-start gap-3 rounded-md border p-3">
            <Checkbox
              id="job-call-confirm"
              checked={sendConfirmation}
              onCheckedChange={(checked) => setSendConfirmation(checked === true)}
              className="mt-0.5"
            />
            <div className="grid gap-1">
              <Label
                htmlFor="job-call-confirm"
                className="flex cursor-pointer items-center gap-1.5"
              >
                <Mail className="h-4 w-4 text-muted-foreground" />
                Send booking confirmation
              </Label>
              <p className="text-xs text-muted-foreground">
                Emails the site &amp; client a confirmation with an add-to-calendar invite.
              </p>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={resetAndClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !siteId}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Booking...
                </>
              ) : (
                'Book call'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
