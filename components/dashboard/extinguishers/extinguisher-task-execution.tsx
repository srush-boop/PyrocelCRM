'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { CompletedReportActions } from '@/components/dashboard/reports/completed-report-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TaskHeader } from '@/components/dashboard/tasks/task-header'
import { PauseResumeControls } from '@/components/dashboard/tasks/pause-resume-controls'
import { Progress } from '@/components/ui/progress'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Play,
  Save,
  Send,
  Loader2,
  Search,
  FireExtinguisher,
  FileText,
  Plus,
  CheckCircle2,
} from 'lucide-react'
import { SuggestedPartsPicker } from '@/components/dashboard/tasks/suggested-parts-picker'
import { CallPartsPicker } from '@/components/dashboard/tasks/call-parts-picker'
import { emptyPhotoCategories, generateUrn, EXTINGUISHER_TYPE_LABELS } from '@/lib/extinguishers'
import { computeNextScheduledDate, toDateString } from '@/lib/scheduling'
import { ExtinguisherInspectionCard, type InspectionState } from './extinguisher-inspection-card'
import { ScanQrButton } from './scan-qr-button'
import { TaskAttachments } from '@/components/dashboard/tasks/task-attachments'
import type { ReactNode } from 'react'
import type {
  Profile,
  TaskWithDetails,
  Extinguisher,
  ExtinguisherType,
  ExtinguisherInspection,
  ExtinguisherResult,
} from '@/lib/types/database'

interface ExtinguisherTaskExecutionProps {
  task: TaskWithDetails
  profile: Profile
  extinguishers: Extinguisher[]
  existingInspections: ExtinguisherInspection[]
  /** Shared "Before you attend" panel, rendered beneath the site/service header. */
  preAttendance?: ReactNode
}

function blankState(): InspectionState {
  return {
    accessible: true,
    access_notes: '',
    service_level: 'basic',
    correct_location: null,
    signage_present: null,
    seal_pin_intact: null,
    pressure_gauge_ok: null,
    weight_ok: null,
    body_condition_ok: null,
    hose_horn_ok: null,
    label_legible: null,
    mounting_secure: null,
    condition: null,
    overall_result: 'pass',
    remedial_action: '',
    comments: '',
    photos: emptyPhotoCategories(),
    touched: false,
  }
}

function stateFromInspection(insp: ExtinguisherInspection): InspectionState {
  return {
    accessible: insp.accessible,
    access_notes: insp.access_notes || '',
    service_level: insp.service_level,
    correct_location: insp.correct_location,
    signage_present: insp.signage_present,
    seal_pin_intact: insp.seal_pin_intact,
    pressure_gauge_ok: insp.pressure_gauge_ok,
    weight_ok: insp.weight_ok,
    body_condition_ok: insp.body_condition_ok,
    hose_horn_ok: insp.hose_horn_ok,
    label_legible: insp.label_legible,
    mounting_secure: insp.mounting_secure,
    condition: insp.condition,
    overall_result: insp.overall_result,
    remedial_action: insp.remedial_action || '',
    comments: insp.comments || '',
    photos: photosFromInspection(insp),
    touched: true,
  }
}

// Build the categorized photo map from a stored inspection, migrating any
// legacy uncategorized photos into the "additional" bucket.
function photosFromInspection(insp: ExtinguisherInspection): InspectionState['photos'] {
  const base = emptyPhotoCategories()
  const cats = insp.photo_categories
  if (cats) {
    for (const key of Object.keys(base) as (keyof typeof base)[]) {
      if (Array.isArray(cats[key])) base[key] = cats[key]
    }
  }
  const categorized = Object.values(base).flat()
  const legacy = (insp.photos || []).filter((url) => !categorized.includes(url))
  if (legacy.length > 0) base.additional = [...base.additional, ...legacy]
  return base
}

const emptyExtinguisherForm = {
  reference: '',
  floor: '',
  location: '',
  extinguisher_type: 'water' as ExtinguisherType,
  capacity: '',
  serial_number: '',
  notes: '',
}

export function ExtinguisherTaskExecution({
  task,
  profile,
  extinguishers: initialExtinguishers,
  existingInspections,
  preAttendance,
}: ExtinguisherTaskExecutionProps) {
  const site = task.site_service?.site
  const serviceType = task.site_service?.service_type

  const [status, setStatus] = useState(task.status)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showSubmit, setShowSubmit] = useState(false)
  const [extinguishers, setExtinguishers] = useState<Extinguisher[]>(initialExtinguishers)
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState(emptyExtinguisherForm)
  const [addingExtinguisher, setAddingExtinguisher] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const [states, setStates] = useState<Record<string, InspectionState>>(() => {
    const map: Record<string, InspectionState> = {}
    for (const extinguisher of extinguishers) {
      const existing = existingInspections.find((i) => i.extinguisher_id === extinguisher.id)
      map[extinguisher.id] = existing ? stateFromInspection(existing) : blankState()
    }
    return map
  })

  const isEngineer = profile.role === 'engineer'
  // Paused inspections are read-only until resumed (see PauseResumeControls).
  const canEdit = status !== 'completed' && status !== 'cancelled' && status !== 'paused' && (isEngineer || profile.role !== 'engineer')
  // Office/admin can correct parts at any status (incl. completed); the engineer
  // only while the call is active. RLS enforces this server-side too.
  const canManageParts = profile.role === 'admin' || profile.role === 'office' || canEdit

  const summary = useMemo(() => {
    const values = Object.values(states)
    const tested = values.filter((s) => s.touched).length
    const passed = values.filter((s) => s.touched && s.overall_result === 'pass').length
    const failed = values.filter((s) => s.touched && s.overall_result === 'fail').length
    const remedial = values.filter((s) => s.touched && s.overall_result === 'remedial').length
    const na = values.filter((s) => s.touched && s.overall_result === 'na').length
    return { total: extinguishers.length, tested, passed, failed, remedial, na }
  }, [states, extinguishers.length])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const matches = extinguishers.filter(
      (e) =>
        e.urn.toLowerCase().includes(q) ||
        (e.reference || '').toLowerCase().includes(q) ||
        (e.location || '').toLowerCase().includes(q) ||
        (e.serial_number || '').toLowerCase().includes(q) ||
        (e.floor || '').toLowerCase().includes(q),
    )
    // Keep not-yet-serviced extinguishers at the top; move serviced ones to the
    // bottom while preserving each group's original order.
    return matches
      .map((e, index) => ({ e, index }))
      .sort((a, b) => {
        const aDone = states[a.e.id]?.touched ? 1 : 0
        const bDone = states[b.e.id]?.touched ? 1 : 0
        if (aDone !== bDone) return aDone - bDone
        return a.index - b.index
      })
      .map((entry) => entry.e)
  }, [extinguishers, search, states])

  // Locate a scanned extinguisher in the current list, clearing any search filter
  // and scrolling/highlighting its card. Used by the QR scanner during service.
  const handleScanToExtinguisher = (urn: string) => {
    const target = extinguishers.find(
      (e) =>
        e.urn.toLowerCase() === urn.toLowerCase() ||
        (e.reference || '').toLowerCase() === urn.toLowerCase(),
    )
    if (!target) {
      setScanError(`No extinguisher matching "${urn}" on this site's register.`)
      setTimeout(() => setScanError(null), 5000)
      return
    }
    setSearch('')
    setHighlightId(target.id)
    requestAnimationFrame(() => {
      const el = document.getElementById(`extinguisher-${target.id}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    setTimeout(() => setHighlightId(null), 2500)
  }

  const handleStart = async () => {
    await supabase
      .from('tasks')
      .update({ status: 'in_progress', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', task.id)
    setStatus('in_progress')
    router.refresh()
  }

  // Engineers build the register in the field — add extinguishers as they find them.
  const handleAddExtinguisher = async () => {
    if (!site?.id) return
    setAddingExtinguisher(true)
    const { data, error } = await supabase
      .from('extinguishers')
      .insert({
        site_id: site.id,
        urn: generateUrn(),
        reference: addForm.reference || null,
        floor: addForm.floor || null,
        location: addForm.location || null,
        extinguisher_type: addForm.extinguisher_type,
        capacity: addForm.capacity || null,
        serial_number: addForm.serial_number || null,
        notes: addForm.notes || null,
      })
      .select()
      .single()
    setAddingExtinguisher(false)
    if (error || !data) {
      console.log('[v0] Add extinguisher error:', error?.message)
      return
    }
    const newExtinguisher = data as Extinguisher
    setExtinguishers((prev) => [...prev, newExtinguisher])
    setStates((prev) => ({ ...prev, [newExtinguisher.id]: blankState() }))
    setAddForm(emptyExtinguisherForm)
    setAddOpen(false)
  }

  const buildRows = (touchedOnly: boolean) => {
    const today = new Date().toISOString().split('T')[0]
    return extinguishers
      .filter((e) => !touchedOnly || states[e.id].touched)
      .map((e) => {
        const s = states[e.id]
        return {
          extinguisher_id: e.id,
          task_id: task.id,
          inspected_by: profile.id,
          inspection_date: today,
          accessible: s.accessible,
          access_notes: s.access_notes || null,
          service_level: s.service_level,
          correct_location: s.correct_location,
          signage_present: s.signage_present,
          seal_pin_intact: s.seal_pin_intact,
          pressure_gauge_ok: s.pressure_gauge_ok,
          weight_ok: s.weight_ok,
          body_condition_ok: s.body_condition_ok,
          hose_horn_ok: s.hose_horn_ok,
          label_legible: s.label_legible,
          mounting_secure: s.mounting_secure,
          condition: s.condition,
          overall_result: s.overall_result,
          remedial_action: s.remedial_action || null,
          comments: s.comments || null,
          photo_categories: s.photos,
          photos: Object.values(s.photos).flat(),
        }
      })
  }

  // Replace this task's inspections with the current set
  const persistInspections = async (touchedOnly: boolean) => {
    await supabase.from('extinguisher_inspections').delete().eq('task_id', task.id)
    const rows = buildRows(touchedOnly)
    if (rows.length > 0) {
      await supabase.from('extinguisher_inspections').insert(rows)
    }
    return rows
  }

  const handleSave = async () => {
    setSaving(true)
    await persistInspections(true)
    setSaving(false)
    router.refresh()
  }

  const overallTaskStatus = (): 'pass' | 'fail' | 'partial' => {
    if (summary.failed > 0) return 'fail'
    if (summary.remedial > 0) return 'partial'
    return 'pass'
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    const rows = await persistInspections(true)
    const today = new Date().toISOString().split('T')[0]

    // Update each extinguisher's latest result snapshot
    for (const row of rows) {
      await supabase
        .from('extinguishers')
        .update({
          latest_result: row.overall_result as ExtinguisherResult,
          last_inspected_date: today,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.extinguisher_id)
    }

    // Write a task_result summary so existing reports/dashboards work
    const overall = overallTaskStatus()
    const checklistResults = [
      { item_id: 'total', label: 'Extinguishers on register', type: 'number', value: summary.total, passed: null, notes: '' },
      { item_id: 'serviced', label: 'Extinguishers serviced', type: 'number', value: summary.tested, passed: null, notes: '' },
      { item_id: 'passed', label: 'Passed', type: 'number', value: summary.passed, passed: null, notes: '' },
      { item_id: 'remedial', label: 'Remedial', type: 'number', value: summary.remedial, passed: null, notes: '' },
      { item_id: 'failed', label: 'Failed', type: 'number', value: summary.failed, passed: null, notes: '' },
      { item_id: 'na', label: 'Not accessible', type: 'number', value: summary.na, passed: null, notes: '' },
    ]
    const resultData = {
      task_id: task.id,
      checklist_results: checklistResults,
      overall_status: overall,
      engineer_notes: `Extinguisher service: ${summary.tested}/${summary.total} serviced, ${summary.passed} pass, ${summary.remedial} remedial, ${summary.failed} fail.`,
      photos: [] as string[],
      updated_at: new Date().toISOString(),
    }
    const { data: existing } = await supabase
      .from('task_results')
      .select('id')
      .eq('task_id', task.id)
      .maybeSingle()
    if (existing) {
      await supabase.from('task_results').update(resultData).eq('id', existing.id)
    } else {
      await supabase.from('task_results').insert(resultData)
    }

    // Mark task complete
    const completedAt = new Date()
    await supabase
      .from('tasks')
      .update({ status: 'completed', completed_at: completedAt.toISOString(), updated_at: completedAt.toISOString() })
      .eq('id', task.id)

    await supabase
      .from('site_services')
      .update({ last_service_date: today })
      .eq('id', task.site_service_id)

    // Generate next recurring task if site live
    const { data: ss } = await supabase
      .from('site_services')
      .select('frequency_value, frequency_unit, anchor_next_to_schedule, active, site:sites!inner(status)')
      .eq('id', task.site_service_id)
      .single()
    const siteRel = (ss as { site?: { status?: string } | { status?: string }[] } | null)?.site
    const siteStatus = Array.isArray(siteRel) ? siteRel[0]?.status : siteRel?.status
    const serviceActive = (ss as { active?: boolean } | null)?.active !== false
    if (ss && serviceActive && siteStatus === 'live') {
      const nextDateStr = toDateString(
        computeNextScheduledDate(ss, { completedAt, scheduledDate: task.scheduled_date }),
      )
      await supabase.from('tasks').insert({
        site_service_id: task.site_service_id,
        assigned_engineer_id: task.assigned_engineer_id,
        scheduled_date: nextDateStr,
        status: 'pending',
        visit_type_id: task.visit_type_id ?? null,
      })
      await supabase
        .from('site_services')
        .update({ next_service_date: nextDateStr })
        .eq('id', task.site_service_id)
    }

    // Send report email (server route handles recipients)
    try {
      await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id }),
      })
    } catch (err) {
      console.log('[v0] Report email request error:', err)
    }

    setSubmitting(false)
    setShowSubmit(false)
    setStatus('completed')
    setShowDone(true)
    router.refresh()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-28">
      <TaskHeader task={task} status={status} canCreateDocument={profile.role === 'admin' || profile.role === 'office'} />

      <PauseResumeControls task={task} status={status} onStatusChange={setStatus} />

      <div className="flex flex-wrap items-center justify-end gap-2">
        {status === 'completed' && (
          <CompletedReportActions taskId={task.id} serviceName={serviceType?.name} />
        )}
        <ScanQrButton onScan={handleScanToExtinguisher} />
      </div>

      {preAttendance}

      {status === 'pending' && canEdit && (
        <Button onClick={handleStart} size="lg" className="w-full">
          <Play className="mr-2 h-5 w-5" />
          Start Service
        </Button>
      )}

      {(status === 'in_progress' || status === 'completed') && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FireExtinguisher className="h-5 w-5" />
                Service Progress
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={summary.total ? (summary.tested / summary.total) * 100 : 0} />
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="font-medium">
                  {summary.tested}/{summary.total} serviced
                </span>
                <span className="text-green-600">{summary.passed} pass</span>
                <span className="text-amber-600">{summary.remedial} remedial</span>
                <span className="text-destructive">{summary.failed} fail</span>
                <span className="text-muted-foreground">{summary.na} N/A</span>
              </div>
            </CardContent>
          </Card>

          {/* Suggested parts (internal) — shown when a defect/failure is present */}
          {summary.failed > 0 && (
            <SuggestedPartsPicker taskId={task.id} canEdit={canEdit} />
          )}

          {/* Parts used on this call (internal) — always available */}
          <CallPartsPicker taskId={task.id} canEdit={canManageParts} />

          {extinguishers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
                <p className="text-muted-foreground">
                  No extinguishers registered for this site yet. Add the extinguishers you find on
                  site to build the register and start servicing.
                </p>
                {canEdit && (
                  <Button onClick={() => setAddOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Extinguisher
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search extinguishers…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {canEdit && (
                  <Button variant="outline" onClick={() => setAddOpen(true)} className="shrink-0">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Extinguisher
                  </Button>
                )}
              </div>
              {scanError && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {scanError}
                </p>
              )}
              {filtered.map((extinguisher) => (
                <div
                  key={extinguisher.id}
                  id={`extinguisher-${extinguisher.id}`}
                  className={
                    highlightId === extinguisher.id
                      ? 'rounded-lg ring-2 ring-primary ring-offset-2 transition-all'
                      : 'transition-all'
                  }
                >
                  <ExtinguisherInspectionCard
                    extinguisher={extinguisher}
                    state={states[extinguisher.id]}
                    disabled={!canEdit}
                    onChange={(next) => setStates((prev) => ({ ...prev, [extinguisher.id]: next }))}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {status === 'in_progress' && canEdit && extinguishers.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 flex gap-2 border-t bg-background p-4 md:relative md:border-0 md:p-0">
          <Button variant="outline" onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Progress
          </Button>
          <div className="flex flex-1 flex-col items-stretch gap-1">
            <Button
              onClick={() => setShowSubmit(true)}
              disabled={summary.tested < summary.total}
              className="w-full"
            >
              <Send className="mr-2 h-4 w-4" />
              Complete & Submit
            </Button>
            {summary.tested < summary.total && (
              <p className="text-center text-xs text-muted-foreground">
                {summary.total - summary.tested} extinguisher
                {summary.total - summary.tested === 1 ? '' : 's'} still to service or mark not accessible
              </p>
            )}
          </div>
        </div>
      )}

      {/* Attachments */}
      <TaskAttachments taskId={task.id} profile={profile} />

      <AlertDialog open={showSubmit} onOpenChange={setShowSubmit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete Extinguisher Service</AlertDialogTitle>
            <AlertDialogDescription>
              You have serviced {summary.tested} of {summary.total} extinguishers ({summary.passed} pass,{' '}
              {summary.remedial} remedial, {summary.failed} fail). Submitting marks the task complete,
              updates each extinguisher&apos;s record, and emails the report.
              {summary.tested < summary.total &&
                ' Unserviced extinguishers will not be included in this report.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Complete Service
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add extinguisher in the field */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Extinguisher</DialogTitle>
            <DialogDescription>
              A unique URN will be generated automatically for the QR label.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="add-reference">Reference</Label>
              <Input
                id="add-reference"
                value={addForm.reference}
                onChange={(e) => setAddForm({ ...addForm, reference: e.target.value })}
                placeholder="e.g. EXT-001"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-type">Extinguisher Type</Label>
              <Select
                value={addForm.extinguisher_type}
                onValueChange={(v) => setAddForm({ ...addForm, extinguisher_type: v as ExtinguisherType })}
              >
                <SelectTrigger id="add-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(EXTINGUISHER_TYPE_LABELS) as ExtinguisherType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {EXTINGUISHER_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-capacity">Capacity</Label>
              <Input
                id="add-capacity"
                value={addForm.capacity}
                onChange={(e) => setAddForm({ ...addForm, capacity: e.target.value })}
                placeholder="e.g. 6 litre / 2 kg"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-serial">Serial Number</Label>
              <Input
                id="add-serial"
                value={addForm.serial_number}
                onChange={(e) => setAddForm({ ...addForm, serial_number: e.target.value })}
                placeholder="Manufacturer serial"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-floor">Floor / Level</Label>
              <Input
                id="add-floor"
                value={addForm.floor}
                onChange={(e) => setAddForm({ ...addForm, floor: e.target.value })}
                placeholder="e.g. Ground"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-location">Location</Label>
              <Input
                id="add-location"
                value={addForm.location}
                onChange={(e) => setAddForm({ ...addForm, location: e.target.value })}
                placeholder="e.g. Reception by main door"
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="add-notes">Notes</Label>
              <Input
                id="add-notes"
                value={addForm.notes}
                onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                placeholder="Access notes, etc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddExtinguisher} disabled={addingExtinguisher}>
              {addingExtinguisher && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add extinguisher
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Service complete — let the engineer choose what to do next */}
      <Dialog open={showDone} onOpenChange={setShowDone}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-center">Service complete</DialogTitle>
            <DialogDescription className="text-center">
              The report has been generated and emailed to the site contacts. What would you
              like to do next?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full"
              onClick={() => router.push(`/dashboard/extinguishers/report/${task.id}`)}
            >
              <FileText className="mr-2 h-4 w-4" />
              View report
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setShowDone(false)
                router.push('/dashboard/schedule')
              }}
            >
              Return to calls
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
