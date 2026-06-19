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
  ArrowLeft,
  MapPin,
  Calendar,
  Building2,
  Play,
  Save,
  Send,
  Loader2,
  Search,
  Wind,
  FileText,
} from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import { emptyPhotoCategories } from '@/lib/dampers'
import { DamperInspectionCard, type InspectionState } from './damper-inspection-card'
import { ScanQrButton } from './scan-qr-button'
import type { Profile, TaskWithDetails, Damper, DamperInspection, DamperResult } from '@/lib/types/database'

interface DamperTaskExecutionProps {
  task: TaskWithDetails
  profile: Profile
  dampers: Damper[]
  existingInspections: DamperInspection[]
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

export function DamperTaskExecution({
  task,
  profile,
  dampers,
  existingInspections,
}: DamperTaskExecutionProps) {
  const site = task.site_service?.site
  const serviceType = task.site_service?.service_type

  const [status, setStatus] = useState(task.status)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showSubmit, setShowSubmit] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const [states, setStates] = useState<Record<string, InspectionState>>(() => {
    const map: Record<string, InspectionState> = {}
    for (const damper of dampers) {
      const existing = existingInspections.find((i) => i.damper_id === damper.id)
      map[damper.id] = existing ? stateFromInspection(existing) : blankState()
    }
    return map
  })

  const isEngineer = profile.role === 'engineer'
  const canEdit = status !== 'completed' && status !== 'cancelled' && (isEngineer || profile.role !== 'engineer')

  const summary = useMemo(() => {
    const values = Object.values(states)
    const tested = values.filter((s) => s.touched).length
    const passed = values.filter((s) => s.touched && s.overall_result === 'pass').length
    const failed = values.filter((s) => s.touched && s.overall_result === 'fail').length
    const remedial = values.filter((s) => s.touched && s.overall_result === 'remedial').length
    const na = values.filter((s) => s.touched && s.overall_result === 'na').length
    return { total: dampers.length, tested, passed, failed, remedial, na }
  }, [states, dampers.length])

  const filtered = dampers.filter((d) => {
    const q = search.toLowerCase()
    return (
      d.urn.toLowerCase().includes(q) ||
      (d.reference || '').toLowerCase().includes(q) ||
      (d.location || '').toLowerCase().includes(q) ||
      (d.floor || '').toLowerCase().includes(q)
    )
  })

  const handleStart = async () => {
    await supabase
      .from('tasks')
      .update({ status: 'in_progress', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', task.id)
    setStatus('in_progress')
    router.refresh()
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

    // Update each damper's latest result snapshot
    for (const row of rows) {
      await supabase
        .from('dampers')
        .update({
          latest_result: row.overall_result as DamperResult,
          last_inspected_date: today,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.damper_id)
    }

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
      .select('frequency_value, frequency_unit, site:sites!inner(status)')
      .eq('id', task.site_service_id)
      .single()
    const siteRel = (ss as { site?: { status?: string } | { status?: string }[] } | null)?.site
    const siteStatus = Array.isArray(siteRel) ? siteRel[0]?.status : siteRel?.status
    if (ss && siteStatus === 'live') {
      const nextDate = new Date(completedAt)
      if (ss.frequency_unit === 'weeks') nextDate.setDate(nextDate.getDate() + ss.frequency_value * 7)
      else nextDate.setMonth(nextDate.getMonth() + ss.frequency_value)
      await supabase.from('tasks').insert({
        site_service_id: task.site_service_id,
        assigned_engineer_id: task.assigned_engineer_id,
        scheduled_date: nextDate.toISOString().split('T')[0],
        status: 'pending',
      })
      await supabase
        .from('site_services')
        .update({ next_service_date: nextDate.toISOString().split('T')[0] })
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
    router.push(`/dashboard/dampers/report/${task.id}`)
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
        {status === 'completed' && (
          <Button variant="outline" size="sm" asChild className="mt-1">
            <Link href={`/dashboard/dampers/report/${task.id}`}>
              <FileText className="mr-2 h-4 w-4" />
              View Report
            </Link>
          </Button>
        )}
        <ScanQrButton className="mt-1" />
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

          {dampers.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No dampers are registered for this site yet. Add them on the{' '}
                <Link href={`/dashboard/sites/${site?.id}`} className="text-primary hover:underline">
                  site page
                </Link>{' '}
                first.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search dampers…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {filtered.map((damper) => (
                <DamperInspectionCard
                  key={damper.id}
                  damper={damper}
                  state={states[damper.id]}
                  disabled={!canEdit}
                  onChange={(next) => setStates((prev) => ({ ...prev, [damper.id]: next }))}
                />
              ))}
            </div>
          )}
        </>
      )}

      {status === 'in_progress' && canEdit && dampers.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 flex gap-2 border-t bg-background p-4 md:relative md:border-0 md:p-0">
          <Button variant="outline" onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Progress
          </Button>
          <Button onClick={() => setShowSubmit(true)} className="flex-1">
            <Send className="mr-2 h-4 w-4" />
            Complete & Submit
          </Button>
        </div>
      )}

      <AlertDialog open={showSubmit} onOpenChange={setShowSubmit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete Damper Inspection</AlertDialogTitle>
            <AlertDialogDescription>
              You have tested {summary.tested} of {summary.total} dampers ({summary.passed} pass,{' '}
              {summary.remedial} remedial, {summary.failed} fail). Submitting marks the task complete,
              updates each damper&apos;s record, and emails the report.
              {summary.tested < summary.total &&
                ' Untested dampers will not be included in this report.'}
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
    </div>
  )
}
