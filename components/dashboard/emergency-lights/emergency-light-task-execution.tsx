'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  ArrowLeft,
  MapPin,
  Calendar,
  Building2,
  Play,
  Save,
  Send,
  Loader2,
  Search,
  Lightbulb,
  FileText,
  CheckCircle2,
  Plus,
} from 'lucide-react'
import { Label } from '@/components/ui/label'
import { formatDateUK } from '@/lib/utils'
import {
  EMERGENCY_LIGHT_CHECKLIST,
  FITTING_TYPES,
  generateEmergencyLightUrn,
} from '@/lib/emergency-lights'
import { computeNextScheduledDate, toDateString } from '@/lib/scheduling'
import {
  EmergencyLightInspectionCard,
  type EmergencyLightInspectionState,
  type CheckValue,
} from './emergency-light-inspection-card'
import type {
  Profile,
  TaskWithDetails,
  EmergencyLight,
  EmergencyLightInspection,
} from '@/lib/types/database'

interface EmergencyLightTaskExecutionProps {
  task: TaskWithDetails
  profile: Profile
  lights: EmergencyLight[]
  existingInspections: EmergencyLightInspection[]
}

function blankState(): EmergencyLightInspectionState {
  return { result: 'pass', checklist: {}, comments: '', photos: [], touched: false }
}

function stateFromInspection(insp: EmergencyLightInspection): EmergencyLightInspectionState {
  return {
    result: insp.result,
    checklist: (insp.checklist || {}) as Record<string, CheckValue>,
    comments: insp.comments || '',
    photos: insp.photos || [],
    touched: true,
  }
}

export function EmergencyLightTaskExecution({
  task,
  profile,
  lights,
  existingInspections,
}: EmergencyLightTaskExecutionProps) {
  const site = task.site_service?.site
  const serviceType = task.site_service?.service_type

  const [status, setStatus] = useState(task.status)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showSubmit, setShowSubmit] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Engineers can register new fittings during the inspection, so keep a local
  // copy of the register that we can append to without losing in-progress state.
  const [lightList, setLightList] = useState<EmergencyLight[]>(lights)
  const [addOpen, setAddOpen] = useState(false)
  const [addSaving, setAddSaving] = useState(false)
  const [addForm, setAddForm] = useState({
    map_reference: '',
    floor: '',
    location: '',
    fitting_type: '',
    notes: '',
  })

  const [states, setStates] = useState<Record<string, EmergencyLightInspectionState>>(() => {
    const map: Record<string, EmergencyLightInspectionState> = {}
    for (const light of lights) {
      const existing = existingInspections.find((i) => i.emergency_light_id === light.id)
      map[light.id] = existing ? stateFromInspection(existing) : blankState()
    }
    return map
  })

  const handleAddFitting = async () => {
    setAddSaving(true)
    const { data, error } = await supabase
      .from('emergency_lights')
      .insert({
        site_id: site?.id,
        urn: generateEmergencyLightUrn(),
        map_reference: addForm.map_reference || null,
        floor: addForm.floor || null,
        location: addForm.location || null,
        fitting_type: addForm.fitting_type || null,
        notes: addForm.notes || null,
        photos: [],
      })
      .select()
      .single()
    setAddSaving(false)
    if (error || !data) {
      console.log('[v0] Add emergency light error:', error?.message)
      return
    }
    const newLight = data as EmergencyLight
    setLightList((prev) => [...prev, newLight])
    setStates((prev) => ({ ...prev, [newLight.id]: blankState() }))
    setAddForm({ map_reference: '', floor: '', location: '', fitting_type: '', notes: '' })
    setAddOpen(false)
  }

  const canEdit = status !== 'completed' && status !== 'cancelled'

  const summary = useMemo(() => {
    const values = Object.values(states)
    const tested = values.filter((s) => s.touched).length
    const passed = values.filter((s) => s.touched && s.result === 'pass').length
    const failed = values.filter((s) => s.touched && s.result === 'fail').length
    const remedial = values.filter((s) => s.touched && s.result === 'remedial').length
    const na = values.filter((s) => s.touched && s.result === 'na').length
    return { total: lightList.length, tested, passed, failed, remedial, na }
  }, [states, lightList.length])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const matches = lightList.filter(
      (l) =>
        (l.urn || '').toLowerCase().includes(q) ||
        (l.map_reference || '').toLowerCase().includes(q) ||
        (l.location || '').toLowerCase().includes(q) ||
        (l.floor || '').toLowerCase().includes(q),
    )
    // Keep not-yet-inspected fittings at the top; move inspected ones to the bottom.
    return matches
      .map((l, index) => ({ l, index }))
      .sort((a, b) => {
        const aDone = states[a.l.id]?.touched ? 1 : 0
        const bDone = states[b.l.id]?.touched ? 1 : 0
        if (aDone !== bDone) return aDone - bDone
        return a.index - b.index
      })
      .map((entry) => entry.l)
  }, [lightList, search, states])

  const handleStart = async () => {
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

  // Bulk pass: mark every fitting as tested with all checklist items passing.
  // Fittings that already have a recorded defect (fail/remedial) are left
  // untouched so the engineer doesn't accidentally overwrite real findings.
  const handleAllSatisfactory = () => {
    const passChecklist: Record<string, CheckValue> = {}
    for (const item of EMERGENCY_LIGHT_CHECKLIST) passChecklist[item.id] = 'pass'
    setStates((prev) => {
      const next: Record<string, EmergencyLightInspectionState> = { ...prev }
      for (const light of lightList) {
        const current = prev[light.id]
        if (current?.touched && (current.result === 'fail' || current.result === 'remedial')) {
          continue
        }
        next[light.id] = {
          result: 'pass',
          checklist: { ...passChecklist },
          comments: current?.comments || '',
          photos: current?.photos || [],
          touched: true,
        }
      }
      return next
    })
  }

  const buildRows = () => {
    const today = new Date().toISOString().split('T')[0]
    return lightList
      .filter((l) => states[l.id].touched)
      .map((l) => {
        const s = states[l.id]
        return {
          emergency_light_id: l.id,
          task_id: task.id,
          inspector_id: profile.id,
          inspection_date: today,
          result: s.result,
          checklist: s.checklist,
          comments: s.comments || null,
          photos: s.photos,
        }
      })
  }

  const persistInspections = async () => {
    await supabase.from('emergency_light_inspections').delete().eq('task_id', task.id)
    const rows = buildRows()
    if (rows.length > 0) {
      await supabase.from('emergency_light_inspections').insert(rows)
    }
    return rows
  }

  const handleSave = async () => {
    setSaving(true)
    await persistInspections()
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
    await persistInspections()
    const today = new Date().toISOString().split('T')[0]

    const overall = overallTaskStatus()
    const checklistResults = [
      { item_id: 'total', label: 'Fittings on register', type: 'number', value: summary.total, passed: null, notes: '' },
      { item_id: 'tested', label: 'Fittings tested', type: 'number', value: summary.tested, passed: null, notes: '' },
      { item_id: 'passed', label: 'Passed', type: 'number', value: summary.passed, passed: null, notes: '' },
      { item_id: 'remedial', label: 'Remedial', type: 'number', value: summary.remedial, passed: null, notes: '' },
      { item_id: 'failed', label: 'Failed', type: 'number', value: summary.failed, passed: null, notes: '' },
      { item_id: 'na', label: 'N/A', type: 'number', value: summary.na, passed: null, notes: '' },
    ]
    const resultData = {
      task_id: task.id,
      checklist_results: checklistResults,
      overall_status: overall,
      engineer_notes: `Emergency lighting test: ${summary.tested}/${summary.total} fittings tested, ${summary.passed} pass, ${summary.remedial} remedial, ${summary.failed} fail.`,
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

    const completedAt = new Date()
    await supabase
      .from('tasks')
      .update({
        status: 'completed',
        completed_at: completedAt.toISOString(),
        updated_at: completedAt.toISOString(),
      })
      .eq('id', task.id)

    await supabase
      .from('site_services')
      .update({ last_service_date: today })
      .eq('id', task.site_service_id)

    // Generate next recurring task if both the site and service type are live
    const { data: ss } = await supabase
      .from('site_services')
      .select('frequency_value, frequency_unit, anchor_next_to_schedule, site:sites!inner(status), service_type:service_types!inner(status)')
      .eq('id', task.site_service_id)
      .single()
    const siteRel = (ss as { site?: { status?: string } | { status?: string }[] } | null)?.site
    const siteStatus = Array.isArray(siteRel) ? siteRel[0]?.status : siteRel?.status
    const serviceRel = (ss as { service_type?: { status?: string } | { status?: string }[] } | null)?.service_type
    const serviceStatus = Array.isArray(serviceRel) ? serviceRel[0]?.status : serviceRel?.status
    if (ss && siteStatus === 'live' && serviceStatus !== 'dead') {
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
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" asChild className="mt-1">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <Badge variant={status === 'completed' ? 'default' : status === 'in_progress' ? 'secondary' : 'outline'}>
              {status.replace('_', ' ')}
            </Badge>
            <Badge variant="outline">{serviceType?.name}</Badge>
          </div>
          <h1 className="text-2xl font-bold">{site?.name}</h1>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5" />
            Site Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span>{site?.address}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            Scheduled: {formatDateUK(task.scheduled_date)}
          </div>
        </CardContent>
      </Card>

      {status === 'pending' && canEdit && (
        <Button onClick={handleStart} size="lg" className="w-full">
          <Play className="mr-2 h-5 w-5" />
          Start Inspection
        </Button>
      )}

      {(status === 'in_progress' || status === 'completed') && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lightbulb className="h-5 w-5" />
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

          {lightList.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-8 text-center text-muted-foreground">
                <p>No emergency light fittings are registered for this site yet.</p>
                {canEdit && (
                  <Button onClick={() => setAddOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add a fitting
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search fittings…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {canEdit && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setAddOpen(true)}
                      className="shrink-0 bg-transparent"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add fitting
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleAllSatisfactory}
                      className="shrink-0 bg-transparent"
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      All tested satisfactory
                    </Button>
                  </>
                )}
              </div>
              {filtered.map((light) => (
                <EmergencyLightInspectionCard
                  key={light.id}
                  light={light}
                  state={states[light.id]}
                  disabled={!canEdit}
                  onChange={(next) => setStates((prev) => ({ ...prev, [light.id]: next }))}
                />
              ))}
            </div>
          )}
        </>
      )}

      {status === 'in_progress' && canEdit && lightList.length > 0 && (
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
              Complete &amp; Submit
            </Button>
            {summary.tested < summary.total && (
              <p className="text-center text-xs text-muted-foreground">
                {summary.total - summary.tested} fitting
                {summary.total - summary.tested === 1 ? '' : 's'} still to test or mark not accessible
              </p>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={showSubmit} onOpenChange={setShowSubmit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete Emergency Lighting Inspection</AlertDialogTitle>
            <AlertDialogDescription>
              You have tested {summary.tested} of {summary.total} fittings ({summary.passed} pass,{' '}
              {summary.remedial} remedial, {summary.failed} fail). Submitting marks the task complete and
              emails the report.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Complete Inspection
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add fitting — lets engineers register a fitting found on site */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Fitting</DialogTitle>
            <DialogDescription>
              A unique URN will be generated automatically for this fitting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="add-map-ref">Map reference</Label>
                <Input
                  id="add-map-ref"
                  value={addForm.map_reference}
                  onChange={(e) => setAddForm({ ...addForm, map_reference: e.target.value })}
                  placeholder="e.g. EL-12"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-floor">Floor</Label>
                <Input
                  id="add-floor"
                  value={addForm.floor}
                  onChange={(e) => setAddForm({ ...addForm, floor: e.target.value })}
                  placeholder="e.g. Ground"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-location">Location</Label>
              <Input
                id="add-location"
                value={addForm.location}
                onChange={(e) => setAddForm({ ...addForm, location: e.target.value })}
                placeholder="e.g. Main stairwell, Level 1"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-fitting-type">Fitting type</Label>
              <Input
                id="add-fitting-type"
                list="el-fitting-types"
                value={addForm.fitting_type}
                onChange={(e) => setAddForm({ ...addForm, fitting_type: e.target.value })}
                placeholder="e.g. Maintained"
              />
              <datalist id="el-fitting-types">
                {FITTING_TYPES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-notes">Notes</Label>
              <Input
                id="add-notes"
                value={addForm.notes}
                onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                placeholder="Optional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addSaving}>
              Cancel
            </Button>
            <Button onClick={handleAddFitting} disabled={addSaving}>
              {addSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add fitting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inspection complete — let the engineer choose what to do next */}
      <Dialog open={showDone} onOpenChange={setShowDone}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-center">Inspection complete</DialogTitle>
            <DialogDescription className="text-center">
              The report has been generated and emailed to the site contacts. What would you like to
              do next?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button className="w-full" onClick={() => router.push(`/dashboard/reports/${task.id}`)}>
              <FileText className="mr-2 h-4 w-4" />
              View report
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setShowDone(false)
                router.push('/dashboard')
              }}
            >
              Return to tasks
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
