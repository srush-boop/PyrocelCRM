'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SystemIcon, SystemBadge } from '@/lib/system-types'
import { TaskAttachments } from '@/components/dashboard/tasks/task-attachments'
import { ReportNotesAssist } from '@/components/dashboard/reports/report-notes-assist'
import { useBackNavigation } from '@/hooks/use-back-navigation'
import { formatDateUK, formatTimeUK } from '@/lib/utils'
import { computeNextScheduledDate, toDateString } from '@/lib/scheduling'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { 
  ArrowLeft, 
  MapPin, 
  Phone, 
  Mail, 
  Calendar,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Save,
  Send,
  Play,
  Building2,
  Clock,
  StopCircle,
  Link2,
  ExternalLink,
  UserPlus,
  Wrench
} from 'lucide-react'
import type { 
  Profile, 
  TaskWithDetails, 
  ChecklistTemplate, 
  ChecklistItem,
  ChecklistResult,
  TaskResult,
  TaskResultStatus,
  ClientLink
} from '@/lib/types/database'

interface TaskExecutionProps {
  task: TaskWithDetails
  checklistTemplate: ChecklistTemplate | null
  existingResult: TaskResult | null
  profile: Profile
  clientLinks?: ClientLink[]
  engineers?: Profile[]
}

export function TaskExecution({ 
  task, 
  checklistTemplate, 
  existingResult,
  profile,
  clientLinks = [],
  engineers = []
}: TaskExecutionProps) {
  const [status, setStatus] = useState(task.status)
  // Local snapshot of the assigned engineer so the summary reflects quick
  // reassignments immediately without a full reload.
  const [assignedEngineerId, setAssignedEngineerId] = useState<string | null>(
    task.assigned_engineer_id ?? null
  )
  const [assigning, setAssigning] = useState(false)
  const [checklistResults, setChecklistResults] = useState<ChecklistResult[]>(() => {
    if (existingResult?.checklist_results) {
      return existingResult.checklist_results
    }
    // Initialize from template
    return (checklistTemplate?.items || []).map((item) => ({
      item_id: item.id,
      label: item.label,
      type: item.type,
      value: item.type === 'pass_fail' ? true : item.type === 'checkbox' ? false : '',
      passed: item.type === 'pass_fail' ? true : null,
      notes: '',
    }))
  })
  const [engineerNotes, setEngineerNotes] = useState(existingResult?.engineer_notes || '')
  const [testingStartTime, setTestingStartTime] = useState<Date | null>(
    existingResult?.testing_start_time ? new Date(existingResult.testing_start_time) : null
  )
  const [testingEndTime, setTestingEndTime] = useState<Date | null>(
    existingResult?.testing_end_time ? new Date(existingResult.testing_end_time) : null
  )
  const [timerRunning, setTimerRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showSubmitDialog, setShowSubmitDialog] = useState(false)
  // "Book Visit" lets the engineer place this task onto the calendar by setting
  // a date and an optional appointment time slot.
  const [bookedDate, setBookedDate] = useState(task.scheduled_date)
  const [bookedStart, setBookedStart] = useState((task.booked_start_time || '').slice(0, 5))
  const [bookedEnd, setBookedEnd] = useState((task.booked_end_time || '').slice(0, 5))
  const [bookingVisit, setBookingVisit] = useState(false)
  const [bookError, setBookError] = useState<string | null>(null)
  const [bookSaved, setBookSaved] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const site = task.site_service?.site
  const serviceType = task.site_service?.service_type
  const systemType = serviceType?.system_type
  const clientName = task.client?.name ?? site?.client?.name ?? null
  const isAdminOrOffice = profile.role === 'admin' || profile.role === 'office'
  const handleBack = useBackNavigation('/dashboard/schedule')

  // Quick-assign (or reassign) this call to an engineer straight from the summary.
  const assignEngineer = async (value: string) => {
    const engineerId = value === 'unassigned' ? null : value
    setAssigning(true)
    await supabase
      .from('tasks')
      .update({ assigned_engineer_id: engineerId, updated_at: new Date().toISOString() })
      .eq('id', task.id)
    setAssignedEngineerId(engineerId)
    setAssigning(false)
    router.refresh()
  }

  // Calculate overall status based on checklist results
  const calculateOverallStatus = (): TaskResultStatus => {
    if (checklistResults.length === 0) return 'pass'
    
    const passFailItems = checklistResults.filter((r) => r.type === 'pass_fail')
    if (passFailItems.length === 0) return 'pass'
    
    const allPassed = passFailItems.every((r) => r.passed === true)
    const allFailed = passFailItems.every((r) => r.passed === false)
    
    if (allPassed) return 'pass'
    if (allFailed) return 'fail'
    return 'partial'
  }

  const handleStartTask = async () => {
    await supabase
      .from('tasks')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', task.id)
    
    setStatus('in_progress')
    router.refresh()
  }

  const handleBookVisit = async () => {
    if (!bookedDate) {
      setBookError('Please choose a date for the visit.')
      return
    }
    // If both times are given, the end must be after the start.
    if (bookedStart && bookedEnd && bookedEnd <= bookedStart) {
      setBookError('End time must be after the start time.')
      return
    }
    setBookError(null)
    setBookSaved(false)
    setBookingVisit(true)

    const { error } = await supabase
      .from('tasks')
      .update({
        scheduled_date: bookedDate,
        booked_start_time: bookedStart || null,
        booked_end_time: bookedEnd || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', task.id)

    setBookingVisit(false)
    if (error) {
      setBookError('Could not book the visit. Please try again.')
      return
    }
    setBookSaved(true)
    router.refresh()
  }

  const updateChecklistResult = (itemId: string, updates: Partial<ChecklistResult>) => {
    setChecklistResults((prev) =>
      prev.map((result) => {
        if (result.item_id === itemId) {
          const updated = { ...result, ...updates }
          // If it's a pass/fail type and value changed, update passed status
          if (updated.type === 'pass_fail' && 'value' in updates) {
            updated.passed = updates.value as boolean
          }
          return updated
        }
        return result
      })
    )
  }

  const handleSave = async () => {
    setSaving(true)

    const resultData = {
      task_id: task.id,
      checklist_results: checklistResults,
      overall_status: calculateOverallStatus(),
      engineer_notes: engineerNotes,
      testing_start_time: testingStartTime?.toISOString(),
      testing_end_time: testingEndTime?.toISOString(),
      photos: existingResult?.photos || [],
      updated_at: new Date().toISOString(),
    }

    if (existingResult) {
      await supabase
        .from('task_results')
        .update(resultData)
        .eq('id', existingResult.id)
    } else {
      await supabase.from('task_results').insert(resultData)
    }

    setSaving(false)
    router.refresh()
  }

  const handleSubmit = async () => {
    setSubmitting(true)

    const overallStatus = calculateOverallStatus()
    const resultData = {
      task_id: task.id,
      checklist_results: checklistResults,
      overall_status: overallStatus,
      engineer_notes: engineerNotes,
      testing_start_time: testingStartTime?.toISOString(),
      testing_end_time: testingEndTime?.toISOString(),
      photos: existingResult?.photos || [],
      updated_at: new Date().toISOString(),
    }

    // Save/update task result
    if (existingResult) {
      await supabase
        .from('task_results')
        .update(resultData)
        .eq('id', existingResult.id)
    } else {
      await supabase.from('task_results').insert(resultData)
    }

    // Mark task as completed
    const completedAt = new Date()
    await supabase
      .from('tasks')
      .update({
        status: 'completed',
        completed_at: completedAt.toISOString(),
        updated_at: completedAt.toISOString(),
      })
      .eq('id', task.id)

    // Update site service with last service date
    const lastServiceDate = completedAt.toISOString().split('T')[0]
    await supabase
      .from('site_services')
      .update({
        last_service_date: lastServiceDate,
      })
      .eq('id', task.site_service_id)

    // Generate next recurring task if both the site and service type are live
    const { data: siteServiceData } = await supabase
      .from('site_services')
      .select(`
        frequency_value,
        frequency_unit,
        anchor_next_to_schedule,
        active,
        site:sites!inner(id, status),
        service_type:service_types!inner(id, status)
      `)
      .eq('id', task.site_service_id)
      .single()

    const siteRel = (siteServiceData as { site?: { status?: string } | { status?: string }[] } | null)?.site
    const siteStatus = Array.isArray(siteRel) ? siteRel[0]?.status : siteRel?.status
    const serviceRel = (siteServiceData as { service_type?: { status?: string } | { status?: string }[] } | null)?.service_type
    const serviceStatus = Array.isArray(serviceRel) ? serviceRel[0]?.status : serviceRel?.status
    const serviceActive = (siteServiceData as { active?: boolean } | null)?.active !== false
    if (siteServiceData && serviceActive && siteStatus === 'live' && serviceStatus !== 'dead') {
      // Calculate next scheduled date based on frequency + anchor preference
      const nextDate = computeNextScheduledDate(siteServiceData, {
        completedAt,
        scheduledDate: task.scheduled_date,
      })
      const nextDateStr = toDateString(nextDate)

      // Create the next recurring task. Carry the visit type forward so each
      // visit in a multi-visit service (e.g. Annual, Periodic) recurs on its own
      // track one full cycle later.
      await supabase.from('tasks').insert({
        site_service_id: task.site_service_id,
        assigned_engineer_id: task.assigned_engineer_id, // Keep same engineer
        scheduled_date: nextDateStr,
        status: 'pending',
        visit_type_id: task.visit_type_id ?? null,
      })

      // Update next_service_date on site_service
      await supabase
        .from('site_services')
        .update({
          next_service_date: nextDateStr,
        })
        .eq('id', task.site_service_id)
    }

    // Send the completion report email (uses per-service emails if set,
    // otherwise the site-level reporting emails).
    try {
      const reportRes = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id }),
      })
      if (!reportRes.ok) {
        const data = await reportRes.json().catch(() => ({}))
        console.error('[v0] Report email failed:', data?.error)
      }
    } catch (err) {
      console.error('[v0] Report email request error:', err)
    }

    setSubmitting(false)
    setShowSubmitDialog(false)
    router.push('/dashboard/schedule')
    router.refresh()
  }

  const isEngineer = profile.role === 'engineer'
  const canEdit = isEngineer && status !== 'completed' && status !== 'cancelled'

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={handleBack} className="mt-1" aria-label="Go back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={status === 'completed' ? 'default' : status === 'in_progress' ? 'secondary' : 'outline'}>
              {status.replace('_', ' ')}
            </Badge>
            <Badge variant="outline">{serviceType?.name}</Badge>
            {task.visit_type?.name && (
              <Badge variant="secondary">{task.visit_type.name}</Badge>
            )}
          </div>
          <h1 className="text-2xl font-bold">{site?.name}</h1>
          {task.started_at && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              Commenced {formatDateUK(task.started_at)} at {formatTimeUK(task.started_at)}
            </p>
          )}
        </div>
      </div>

      {/* Call Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <SystemIcon system={systemType ?? {}} className="h-5 w-5" />
            Call Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {systemType && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">System</span>
              <SystemBadge system={systemType} />
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Service</span>
            <span className="inline-flex items-center gap-1.5 text-right font-medium">
              <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {serviceType?.name ?? '—'}
              {task.visit_type?.name ? ` · ${task.visit_type.name}` : ''}
            </span>
          </div>
          {clientName && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Client</span>
              <span className="inline-flex items-center gap-1.5 text-right font-medium">
                <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {clientName}
              </span>
            </div>
          )}
          {isAdminOrOffice ? (
            <div className="space-y-1.5 pt-1">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <UserPlus className="h-3.5 w-3.5" />
                Assign engineer
              </span>
              <Select
                value={assignedEngineerId ?? 'unassigned'}
                onValueChange={assignEngineer}
                disabled={assigning}
              >
                <SelectTrigger>
                  {assigning ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
                    </span>
                  ) : (
                    <SelectValue placeholder="Assign to..." />
                  )}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {engineers.map((eng) => (
                    <SelectItem key={eng.id} value={eng.id}>
                      {eng.full_name || eng.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Engineer</span>
              <span className="text-right font-medium">
                {task.assigned_engineer
                  ? task.assigned_engineer.full_name || task.assigned_engineer.email
                  : 'Unassigned'}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Site Details Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Site Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <span>{site?.address}</span>
          </div>
          {site?.contact_name && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Contact:</span>
              <span>{site.contact_name}</span>
            </div>
          )}
          {site?.contact_phone && (
            <a href={`tel:${site.contact_phone}`} className="flex items-center gap-2 text-sm text-primary">
              <Phone className="h-4 w-4" />
              {site.contact_phone}
            </a>
          )}
          {site?.contact_email && (
            <a href={`mailto:${site.contact_email}`} className="flex items-center gap-2 text-sm text-primary">
              <Mail className="h-4 w-4" />
              {site.contact_email}
            </a>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            Scheduled: {formatDateUK(task.scheduled_date)}
          </div>
        </CardContent>
      </Card>

      {/* Client reference links scoped to this task's system/service */}
      {clientLinks.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Reference links
            </CardTitle>
            <CardDescription>
              Resources provided by the client for this visit.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {clientLinks.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start justify-between gap-3 rounded-md border bg-background px-3 py-2 transition-colors hover:border-primary hover:bg-primary/5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{link.label}</p>
                  {link.description && (
                    <p className="text-xs text-muted-foreground">{link.description}</p>
                  )}
                  <p className="truncate text-xs text-muted-foreground">{link.url}</p>
                </div>
                <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              </a>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Book Visit */}
      {canEdit && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Book Visit
            </CardTitle>
            <CardDescription>
              Set the date and time for this visit to add it to your calendar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="booked-date">Date</Label>
              <Input
                id="booked-date"
                type="date"
                value={bookedDate}
                onChange={(e) => {
                  setBookedDate(e.target.value)
                  setBookSaved(false)
                }}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="booked-start">Start time (optional)</Label>
                <Input
                  id="booked-start"
                  type="time"
                  value={bookedStart}
                  onChange={(e) => {
                    setBookedStart(e.target.value)
                    setBookSaved(false)
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="booked-end">End time (optional)</Label>
                <Input
                  id="booked-end"
                  type="time"
                  value={bookedEnd}
                  onChange={(e) => {
                    setBookedEnd(e.target.value)
                    setBookSaved(false)
                  }}
                />
              </div>
            </div>
            {bookError ? (
              <p className="text-sm text-destructive">{bookError}</p>
            ) : bookSaved ? (
              <p className="text-sm text-green-600">Visit booked and added to your calendar.</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Leave the times blank to book the whole day.
              </p>
            )}
            <Button onClick={handleBookVisit} disabled={bookingVisit} className="w-full sm:w-auto">
              {bookingVisit ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Booking...
                </>
              ) : (
                <>
                  <Calendar className="mr-2 h-4 w-4" />
                  Book Visit
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Start Task Button */}
      {status === 'pending' && canEdit && (
        <Button onClick={handleStartTask} size="lg" className="w-full">
          <Play className="mr-2 h-5 w-5" />
          Start Inspection
        </Button>
      )}

      {/* Checklist */}
      {(status === 'in_progress' || status === 'completed') && (
        <>
          {/* Time Recording */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Testing Time
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <div className="flex gap-2">
                    <Input
                      type="datetime-local"
                      value={testingStartTime?.toISOString().slice(0, 16) || ''}
                      onChange={(e) => setTestingStartTime(e.target.value ? new Date(e.target.value) : null)}
                      disabled={!canEdit}
                    />
                    {!testingStartTime && canEdit && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setTestingStartTime(new Date())}
                        title="Set current time"
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <div className="flex gap-2">
                    <Input
                      type="datetime-local"
                      value={testingEndTime?.toISOString().slice(0, 16) || ''}
                      onChange={(e) => setTestingEndTime(e.target.value ? new Date(e.target.value) : null)}
                      disabled={!canEdit}
                    />
                    {!testingEndTime && canEdit && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setTestingEndTime(new Date())}
                        title="Set current time"
                      >
                        <StopCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              {testingStartTime && testingEndTime && (
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-sm">
                    <strong>Duration:</strong>{' '}
                    {Math.round((testingEndTime.getTime() - testingStartTime.getTime()) / 60000)} minutes
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Inspection Checklist</CardTitle>
              <CardDescription>
                {checklistTemplate?.name || 'Standard inspection checklist'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
            {checklistResults.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No checklist items configured for this service type
              </p>
            ) : (
              checklistResults.map((result, index) => (
                <div key={result.item_id} className="space-y-2">
                  {index > 0 && <Separator />}
                  <div className="pt-2">
                    <Label className="text-base font-medium">{result.label}</Label>
                    
                    {result.type === 'pass_fail' && (
                      <div className="flex gap-2 mt-2">
                        <Button
                          type="button"
                          variant={result.passed === true ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => updateChecklistResult(result.item_id, { value: true, passed: true })}
                          disabled={!canEdit}
                          className={result.passed === true ? 'bg-green-600 hover:bg-green-700' : ''}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Pass
                        </Button>
                        <Button
                          type="button"
                          variant={result.passed === false ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => updateChecklistResult(result.item_id, { value: false, passed: false })}
                          disabled={!canEdit}
                          className={result.passed === false ? 'bg-destructive hover:bg-destructive/90' : ''}
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          Fail
                        </Button>
                      </div>
                    )}

                    {result.type === 'checkbox' && (
                      <div className="flex items-center gap-2 mt-2">
                        <Checkbox
                          checked={result.value as boolean}
                          onCheckedChange={(checked) =>
                            updateChecklistResult(result.item_id, { value: checked as boolean })
                          }
                          disabled={!canEdit}
                        />
                        <span className="text-sm">Completed</span>
                      </div>
                    )}

                    {result.type === 'text' && (
                      <Input
                        value={result.value as string}
                        onChange={(e) => updateChecklistResult(result.item_id, { value: e.target.value })}
                        placeholder="Enter value..."
                        className="mt-2"
                        disabled={!canEdit}
                      />
                    )}

                    {result.type === 'number' && (
                      <Input
                        type="number"
                        value={result.value as number}
                        onChange={(e) => updateChecklistResult(result.item_id, { value: parseFloat(e.target.value) || 0 })}
                        placeholder="Enter value..."
                        className="mt-2"
                        disabled={!canEdit}
                      />
                    )}

                    {/* Notes for failed items */}
                    {result.type === 'pass_fail' && result.passed === false && (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-muted-foreground">
                            Defect description
                          </span>
                          {canEdit && (
                            <ReportNotesAssist
                              label="AI describe"
                              input={{
                                mode: 'defect',
                                serviceType: serviceType?.name,
                                systemType: systemType?.name,
                                visitType: task.visit_type?.name,
                                siteName: site?.name,
                                itemLabel: result.label,
                              }}
                              onInsert={(text, applyMode) =>
                                updateChecklistResult(result.item_id, {
                                  notes:
                                    applyMode === 'replace' || !result.notes
                                      ? text
                                      : `${result.notes}\n${text}`,
                                })
                              }
                            />
                          )}
                        </div>
                        <Textarea
                          value={result.notes || ''}
                          onChange={(e) => updateChecklistResult(result.item_id, { notes: e.target.value })}
                          placeholder="Describe the issue..."
                          disabled={!canEdit}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        </>
      )}

      {/* Engineer Notes */}
      {(status === 'in_progress' || status === 'completed') && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle>Notes</CardTitle>
                <CardDescription>Add any additional observations or comments</CardDescription>
              </div>
              {canEdit && (
                <ReportNotesAssist
                  label="AI summary"
                  input={{
                    mode: 'summary',
                    serviceType: serviceType?.name,
                    systemType: systemType?.name,
                    visitType: task.visit_type?.name,
                    siteName: site?.name,
                    existingNotes: engineerNotes,
                    checklist: checklistResults.map((r) => ({
                      label: r.label,
                      type: r.type,
                      value: r.value,
                      passed: r.passed,
                      notes: r.notes,
                    })),
                  }}
                  onInsert={(text, applyMode) =>
                    setEngineerNotes((prev) =>
                      applyMode === 'replace' || !prev ? text : `${prev}\n${text}`,
                    )
                  }
                />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              value={engineerNotes}
              onChange={(e) => setEngineerNotes(e.target.value)}
              placeholder="Additional notes..."
              rows={4}
              disabled={!canEdit}
            />
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      {status === 'in_progress' && canEdit && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t flex gap-2 md:relative md:border-0 md:p-0">
          <Button variant="outline" onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Progress
              </>
            )}
          </Button>
          <Button onClick={() => setShowSubmitDialog(true)} className="flex-1">
            <Send className="mr-2 h-4 w-4" />
            Complete & Submit
          </Button>
        </div>
      )}

      {/* Result Summary for completed tasks */}
      {status === 'completed' && existingResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {existingResult.overall_status === 'pass' ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : existingResult.overall_status === 'fail' ? (
                <XCircle className="h-5 w-5 text-destructive" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
              )}
              Inspection Result: {existingResult.overall_status.toUpperCase()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Completed on {new Date(task.completed_at!).toLocaleDateString()} at{' '}
              {new Date(task.completed_at!).toLocaleTimeString()}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Attachments */}
      <TaskAttachments taskId={task.id} profile={profile} />

      {/* Submit Confirmation Dialog */}
      <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete Inspection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to submit this inspection? This will mark the task as completed
              {calculateOverallStatus() === 'fail' || calculateOverallStatus() === 'partial'
                ? ' and notify the office of any issues found.'
                : ' and send a confirmation to the client.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Complete Inspection'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
