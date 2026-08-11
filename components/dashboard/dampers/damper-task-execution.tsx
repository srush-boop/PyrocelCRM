'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useShiftGate } from '@/components/dashboard/tasks/use-shift-gate'
import { useCompletionExit } from '@/components/dashboard/tasks/use-completion-exit'
import { RouteProgressBanner } from '@/components/dashboard/tasks/route-progress-banner'
import type { RouteProgress } from '@/lib/routes/route-progress'
import { useRouter } from 'next/navigation'
import { CompletedReportActions } from '@/components/dashboard/reports/completed-report-actions'
import { ClientSignOffCard } from '@/components/dashboard/tasks/client-sign-off-card'
import { CallTimeCard } from '@/components/dashboard/tasks/call-times-card'
import { resolveCallKind } from '@/lib/call-kinds'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FloorInput } from '@/components/ui/floor-input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TaskHeader } from '@/components/dashboard/tasks/task-header'
import { PauseResumeControls } from '@/components/dashboard/tasks/pause-resume-controls'
import { Progress } from '@/components/ui/progress'
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
  Wind,
  Plus,
} from 'lucide-react'
import { SuggestedPartsPicker } from '@/components/dashboard/tasks/suggested-parts-picker'
import { CallPartsPicker } from '@/components/dashboard/tasks/call-parts-picker'
import { emptyPhotoCategories, generateUrn } from '@/lib/dampers'
import { computeNextScheduledDate, toDateString } from '@/lib/scheduling'
import { DamperInspectionCard, type InspectionState } from './damper-inspection-card'
import { SizeCombobox } from './size-combobox'
import { ScanQrButton } from './scan-qr-button'
import type { ReactNode } from 'react'
import type { Profile, TaskWithDetails, Damper, DamperType, DamperInspection, DamperResult } from '@/lib/types/database'

interface DamperTaskExecutionProps {
  task: TaskWithDetails
  profile: Profile
  dampers: Damper[]
  existingInspections: DamperInspection[]
  /** Shared "Before you attend" panel, rendered beneath the site/service header. */
  preAttendance?: ReactNode
  /** Collapsed call history, rendered at the very bottom (below the completion action). */
  callHistory?: ReactNode
  /** CDO route context: "call X of Y" position + next call to jump to on completion. */
  routeProgress?: RouteProgress | null
  /** Saved client sign-off (name + signature) for redisplay on a completed call. */
  existingSignature?: string | null
  existingSignatureName?: string | null
}

function blankState(): InspectionState {
  return {
    accessible: true,
    access_notes: '',
    drop_test_pass: null,
    fire_barrier_intact: null,
    installation_correct: null,
    fusible_link_ok: null,
    spring_operation_ok: null,
    actuator_ok: null,
    damper_clean: null,
    condition: null,
    overall_result: 'pass',
    remedial_action: '',
    comments: '',
    photos: emptyPhotoCategories(),
    touched: false,
  }
}

function stateFromInspection(insp: DamperInspection): InspectionState {
  return {
    accessible: insp.accessible,
    access_notes: insp.access_notes || '',
    drop_test_pass: insp.drop_test_pass,
    fire_barrier_intact: insp.fire_barrier_intact,
    installation_correct: insp.installation_correct,
    fusible_link_ok: insp.fusible_link_ok,
    spring_operation_ok: insp.spring_operation_ok,
    actuator_ok: insp.actuator_ok,
    damper_clean: insp.damper_clean,
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
function photosFromInspection(insp: DamperInspection): InspectionState['photos'] {
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

const emptyDamperForm = {
  reference: '',
  floor: '',
  location: '',
  damper_type: 'fire' as DamperType,
  size_mm: '',
  notes: '',
}

export function DamperTaskExecution({
  task,
  profile,
  dampers: initialDampers,
  existingInspections,
  preAttendance,
  callHistory,
  routeProgress,
  existingSignature = null,
  existingSignatureName = null,
}: DamperTaskExecutionProps) {
  const site = task.site_service?.site
  const serviceType = task.site_service?.service_type
  // Non-recurring calls (reactive / emergency / planned) capture an on-site
  // client sign-off; recurring maintenance visits do not.
  const isNonRecurring = serviceType ? resolveCallKind(serviceType) !== 'recurring' : true

  const [status, setStatus] = useState(task.status)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [clientSignature, setClientSignature] = useState<string | null>(existingSignature)
  const [clientSignatureName, setClientSignatureName] = useState(existingSignatureName ?? '')
  // Editable end time — auto-set to now on completion, adjustable via the End
  // time card. Feeds the task's completed_at on submit.
  const [endTime, setEndTime] = useState<Date | null>(
    task.completed_at ? new Date(task.completed_at) : null,
  )
  const [dampers, setDampers] = useState<Damper[]>(initialDampers)
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState(emptyDamperForm)
  const [addingDamper, setAddingDamper] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()
  const { ensureOnShift, checking: checkingShift, shiftGateDialog } = useShiftGate()
  const { runExit, nearbyPrompt } = useCompletionExit(profile.role, profile.discipline)

  const [states, setStates] = useState<Record<string, InspectionState>>(() => {
    const map: Record<string, InspectionState> = {}
    for (const damper of dampers) {
      const existing = existingInspections.find((i) => i.damper_id === damper.id)
      map[damper.id] = existing ? stateFromInspection(existing) : blankState()
    }
    return map
  })

  const isEngineer = profile.role === 'engineer' || profile.role === 'subcontractor'
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
    return { total: dampers.length, tested, passed, failed, remedial, na }
  }, [states, dampers.length])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const matches = dampers.filter(
      (d) =>
        d.urn.toLowerCase().includes(q) ||
        (d.reference || '').toLowerCase().includes(q) ||
        (d.location || '').toLowerCase().includes(q) ||
        (d.floor || '').toLowerCase().includes(q),
    )
    // Keep not-yet-inspected dampers at the top; move inspected ones to the
    // bottom while preserving each group's original order.
    return matches
      .map((d, index) => ({ d, index }))
      .sort((a, b) => {
        const aDone = states[a.d.id]?.touched ? 1 : 0
        const bDone = states[b.d.id]?.touched ? 1 : 0
        if (aDone !== bDone) return aDone - bDone
        return a.index - b.index
      })
      .map((entry) => entry.d)
  }, [dampers, search, states])

  // Locate a scanned damper in the current list, clearing any search filter and
  // scrolling/highlighting its card. Used by the QR scanner during inspection.
  const handleScanToDamper = (urn: string) => {
    const target = dampers.find(
      (d) =>
        d.urn.toLowerCase() === urn.toLowerCase() ||
        (d.reference || '').toLowerCase() === urn.toLowerCase(),
    )
    if (!target) {
      setScanError(`No damper matching "${urn}" on this site's register.`)
      setTimeout(() => setScanError(null), 5000)
      return
    }
    setSearch('')
    setHighlightId(target.id)
    requestAnimationFrame(() => {
      const el = document.getElementById(`damper-${target.id}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    setTimeout(() => setHighlightId(null), 2500)
  }

  const handleStart = async () => {
    if (!(await ensureOnShift())) return
    await supabase
      .from('tasks')
      .update({ status: 'in_progress', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', task.id)
    setStatus('in_progress')
    router.refresh()
  }

  // Engineers build the register in the field — add dampers as they find them.
  const handleAddDamper = async () => {
    if (!site?.id) return
    setAddingDamper(true)
    const { data, error } = await supabase
      .from('dampers')
      .insert({
        site_id: site.id,
        urn: generateUrn(),
        reference: addForm.reference || null,
        floor: addForm.floor || null,
        location: addForm.location || null,
        damper_type: addForm.damper_type,
        size_mm: addForm.size_mm || null,
        notes: addForm.notes || null,
      })
      .select()
      .single()
    setAddingDamper(false)
    if (error || !data) {
      console.log('[v0] Add damper error:', error?.message)
      return
    }
    const newDamper = data as Damper
    setDampers((prev) => [...prev, newDamper])
    setStates((prev) => ({ ...prev, [newDamper.id]: blankState() }))
    setAddForm(emptyDamperForm)
    setAddOpen(false)
  }

  const buildRows = (touchedOnly: boolean) => {
    const today = new Date().toISOString().split('T')[0]
    return dampers
      .filter((d) => !touchedOnly || states[d.id].touched)
      .map((d) => {
        const s = states[d.id]
        return {
          damper_id: d.id,
          task_id: task.id,
          inspected_by: profile.id,
          inspection_date: today,
          accessible: s.accessible,
          access_notes: s.access_notes || null,
          drop_test_pass: s.drop_test_pass,
          fire_barrier_intact: s.fire_barrier_intact,
          installation_correct: s.installation_correct,
          fusible_link_ok: s.fusible_link_ok,
          spring_operation_ok: s.spring_operation_ok,
          actuator_ok: s.actuator_ok,
          damper_clean: s.damper_clean,
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
    await supabase.from('damper_inspections').delete().eq('task_id', task.id)
    const rows = buildRows(touchedOnly)
    if (rows.length > 0) {
      await supabase.from('damper_inspections').insert(rows)
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

    // Update each damper's latest result snapshot. Rather than one round-trip
    // per damper (slow on large sites), group by result value and issue a single
    // batched update per distinct result — typically just pass/remedial/fail.
    const nowIso = new Date().toISOString()
    const idsByResult = new Map<DamperResult, string[]>()
    for (const row of rows) {
      const result = row.overall_result as DamperResult
      const ids = idsByResult.get(result)
      if (ids) ids.push(row.damper_id)
      else idsByResult.set(result, [row.damper_id])
    }
    await Promise.all(
      Array.from(idsByResult.entries()).map(([result, ids]) =>
        supabase
          .from('dampers')
          .update({
            latest_result: result,
            last_inspected_date: today,
            updated_at: nowIso,
          })
          .in('id', ids),
      ),
    )

    // Write a task_result summary so existing reports/dashboards work
    const overall = overallTaskStatus()
    const checklistResults = [
      { item_id: 'total', label: 'Dampers on register', type: 'number', value: summary.total, passed: null, notes: '' },
      { item_id: 'tested', label: 'Dampers tested', type: 'number', value: summary.tested, passed: null, notes: '' },
      { item_id: 'passed', label: 'Passed', type: 'number', value: summary.passed, passed: null, notes: '' },
      { item_id: 'remedial', label: 'Remedial', type: 'number', value: summary.remedial, passed: null, notes: '' },
      { item_id: 'failed', label: 'Failed', type: 'number', value: summary.failed, passed: null, notes: '' },
      { item_id: 'na', label: 'Not accessible', type: 'number', value: summary.na, passed: null, notes: '' },
    ]
    const resultData = {
      task_id: task.id,
      checklist_results: checklistResults,
      overall_status: overall,
      engineer_notes: `Damper inspection: ${summary.tested}/${summary.total} tested, ${summary.passed} pass, ${summary.remedial} remedial, ${summary.failed} fail.`,
      photos: [] as string[],
      client_signature: isNonRecurring ? clientSignature : null,
      client_signature_name: isNonRecurring ? clientSignatureName.trim() || null : null,
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

    // Mark task complete. End time defaults to now if the engineer didn't set
    // one, and stays adjustable via the End time card beforehand.
    const completedAt = endTime ?? new Date()
    if (!endTime) setEndTime(completedAt)
    await supabase
      .from('tasks')
      .update({ status: 'completed', completed_at: completedAt.toISOString(), updated_at: completedAt.toISOString() })
      .eq('id', task.id)

    await supabase
      .from('site_services')
      .update({ last_service_date: today })
      .eq('id', task.site_service_id)

    // Roll the projected "next due" date forward. We deliberately do NOT create
    // the next call here — future calls are only created via the office
    // "Generate Calls" workflow.
    const { data: ss } = await supabase
      .from('site_services')
      .select('frequency_value, frequency_unit, anchor_next_to_schedule, active, site:sites!inner(status), service_type:service_types!inner(status)')
      .eq('id', task.site_service_id)
      .single()
    const siteRel = (ss as { site?: { status?: string } | { status?: string }[] } | null)?.site
    const siteStatus = Array.isArray(siteRel) ? siteRel[0]?.status : siteRel?.status
    const serviceRel = (ss as { service_type?: { status?: string } | { status?: string }[] } | null)?.service_type
    const serviceStatus = Array.isArray(serviceRel) ? serviceRel[0]?.status : serviceRel?.status
    const serviceActive = (ss as { active?: boolean } | null)?.active !== false
    if (ss && serviceActive && siteStatus === 'live' && serviceStatus !== 'dead') {
      const nextDateStr = toDateString(
        computeNextScheduledDate(ss, { completedAt, scheduledDate: task.scheduled_date }),
      )
      await supabase
        .from('site_services')
        .update({ next_service_date: nextDateStr })
        .eq('id', task.site_service_id)
    }

    // Terminal side-effects: send the completion report email (server route
    // handles recipients) and run per-visit "invoice on completion" billing.
    // Both are best-effort and idempotent server-side, so we DON'T await them —
    // awaiting was adding ~10s before the UI navigated back to Calls.
    // `keepalive` lets the requests finish even as the page navigates away.
    void fetch('/api/send-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id }),
      keepalive: true,
    }).catch((err) => console.log('[v0] Report email request error:', err))

    void fetch('/api/tasks/complete-billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id }),
      keepalive: true,
    }).catch((err) => console.log('[v0] Visit billing request error:', err))

    setStatus('completed')
    setSubmitting(false)
    // No success screen / confirm — return to Calls (via nearby-calls prompt).
    await runExit(task.id, routeProgress?.nextTaskId)
  }

  // The primary Start action always sits directly beneath the overview header
  // so engineers can begin in one tap and every task item stays below it,
  // consistent across all call types.
  const startAtTop = true
  const startButton =
    status === 'pending' && canEdit ? (
      <Button onClick={handleStart} disabled={checkingShift} size="lg" className="w-full">
        {checkingShift ? (
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        ) : (
          <Play className="mr-2 h-5 w-5" />
        )}
        Start Inspection
      </Button>
    ) : null

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-44 lg:pb-6">
      <TaskHeader task={task} status={status} canCreateDocument={profile.role === 'admin' || profile.role === 'office'} />

      <RouteProgressBanner progress={routeProgress} />

      {startAtTop && startButton}

      <PauseResumeControls task={task} status={status} onStatusChange={setStatus} />

      <div className="flex flex-wrap items-center justify-end gap-2">
        {status === 'completed' && (
          <CompletedReportActions
            taskId={task.id}
            serviceName={serviceType?.name}
            chargeable={task.chargeable}
            chargeReviewStatus={task.charge_review_status}
            chargeReason={task.charge_reason}
            clientRef={(task as any).client_ref ?? null}
            chargeInvoicedAt={(task as any).charge_invoiced_at ?? null}
            invoiceId={(task as any).invoice?.id ?? (task as any).invoice_id ?? null}
            invoiceNumber={(task as any).invoice?.invoice_number ?? null}
            canReview={profile.role === 'admin' || profile.role === 'office'}
            canSendReport={profile.role === 'admin' || profile.role === 'office'}
          />
        )}
        <ScanQrButton onScan={handleScanToDamper} />
      </div>

      {preAttendance}

      {!startAtTop && startButton}

      {shiftGateDialog}

      {(status === 'in_progress' || status === 'completed') && (
        <>
          {/* Start time — before the inspection body. */}
          <CallTimeCard
            taskId={task.id}
            mode="start"
            initialValue={task.started_at}
            canEdit={canEdit}
          />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Wind className="h-5 w-5" />
                Inspection Progress
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={summary.total ? (summary.tested / summary.total) * 100 : 0} />
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="font-medium">
                  {summary.tested}/{summary.total} tested
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

          {dampers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
                <p className="text-muted-foreground">
                  No dampers registered for this site yet. Add the dampers you find on site to
                  build the register and start testing.
                </p>
                {canEdit && (
                  <Button onClick={() => setAddOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Damper
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
                    placeholder="Search dampers…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {canEdit && (
                  <Button variant="outline" onClick={() => setAddOpen(true)} className="shrink-0">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Damper
                  </Button>
                )}
              </div>
              {scanError && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {scanError}
                </p>
              )}
              {filtered.map((damper) => (
                <div
                  key={damper.id}
                  id={`damper-${damper.id}`}
                  className={
                    highlightId === damper.id
                      ? 'rounded-lg ring-2 ring-primary ring-offset-2 transition-all'
                      : 'transition-all'
                  }
                >
                  <DamperInspectionCard
                    damper={damper}
                    state={states[damper.id]}
                    disabled={!canEdit}
                    onChange={(next) => setStates((prev) => ({ ...prev, [damper.id]: next }))}
                  />
                </div>
              ))}
            </div>
          )}
          {/* End time — after the inspection body, at completion. */}
          <CallTimeCard
            taskId={task.id}
            mode="end"
            initialValue={task.completed_at}
            canEdit={canEdit}
            onChange={setEndTime}
          />
        </>
      )}

      {(status === 'in_progress' || status === 'completed') && isNonRecurring && (
        <ClientSignOffCard
          name={clientSignatureName}
          onNameChange={setClientSignatureName}
          signature={clientSignature}
          onSignatureChange={setClientSignature}
          canEdit={canEdit}
        />
      )}

      {status === 'in_progress' && canEdit && dampers.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-50 flex gap-2 border-t bg-background p-4 lg:relative lg:inset-x-auto lg:bottom-auto lg:z-auto lg:border-0 lg:p-0">
          <Button variant="outline" onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Progress
          </Button>
          <div className="flex flex-1 flex-col items-stretch gap-1">
            <Button
              onClick={handleSubmit}
              disabled={summary.tested < summary.total || submitting}
              className="w-full"
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {submitting ? 'Submitting…' : 'Complete Inspection'}
            </Button>
            {summary.tested < summary.total && (
              <p className="text-center text-xs text-muted-foreground">
                {summary.total - summary.tested} damper
                {summary.total - summary.tested === 1 ? '' : 's'} still to test or mark not accessible
              </p>
            )}
          </div>
        </div>
      )}

      {/* Add damper in the field */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Damper</DialogTitle>
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
                placeholder="e.g. FD-001"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-type">Damper Type</Label>
              <Select
                value={addForm.damper_type}
                onValueChange={(v) => setAddForm({ ...addForm, damper_type: v as DamperType })}
              >
                <SelectTrigger id="add-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fire">Fire Damper</SelectItem>
                  <SelectItem value="smoke">Smoke Damper</SelectItem>
                  <SelectItem value="fire_smoke">Fire/Smoke Damper</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-floor">Floor / Level</Label>
              <FloorInput
                id="add-floor"
                value={addForm.floor}
                onChange={(v) => setAddForm({ ...addForm, floor: v })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-size">Size / Shape</Label>
              <SizeCombobox
                id="add-size"
                value={addForm.size_mm}
                onChange={(v) => setAddForm({ ...addForm, size_mm: v })}
                placeholder="e.g. 300x300 Rectangular"
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="add-location">Location</Label>
              <Input
                id="add-location"
                value={addForm.location}
                onChange={(e) => setAddForm({ ...addForm, location: e.target.value })}
                placeholder="e.g. Plant Room AHU-1"
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
            <Button onClick={handleAddDamper} disabled={addingDamper}>
              {addingDamper && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add damper
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Call history — collapsed, at the very bottom below the completion action. */}
      {callHistory}

      {/* Post-completion: offer nearby overdue / due-soon calls, then Calls. */}
      {nearbyPrompt}
    </div>
  )
}
