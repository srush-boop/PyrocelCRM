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
} from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
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

  const [states, setStates] = useState<Record<string, EmergencyLightInspectionState>>(() => {
    const map: Record<string, EmergencyLightInspectionState> = {}
    for (const light of lights) {
      const existing = existingInspections.find((i) => i.emergency_light_id === light.id)
      map[light.id] = existing ? stateFromInspection(existing) : blankState()
    }
    return map
  })

  const canEdit = status !== 'completed' && status !== 'cancelled'

  const summary = useMemo(() => {
    const values = Object.values(states)
    const tested = values.filter((s) => s.touched).length
    const passed = values.filter((s) => s.touched && s.result === 'pass').length
    const failed = values.filter((s) => s.touched && s.result === 'fail').length
    const remedial = values.filter((s) => s.touched && s.result === 'remedial').length
    const na = values.filter((s) => s.touched && s.result === 'na').length
    return { total: lights.length, tested, passed, failed, remedial, na }
  }, [states, lights.length])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const matches = lights.filter(
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
  }, [lights, search, states])

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

  const buildRows = () => {
    const today = new Date().toISOString().split('T')[0]
    return lights
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

          {lights.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No emergency light fittings are registered for this site yet. Add them on the{' '}
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
                  placeholder="Search fittings…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
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

      {status === 'in_progress' && canEdit && lights.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 flex gap-2 border-t bg-background p-4 md:relative md:border-0 md:p-0">
          <Button variant="outline" onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Progress
          </Button>
          <Button onClick={() => setShowSubmit(true)} className="flex-1">
            <Send className="mr-2 h-4 w-4" />
            Complete &amp; Submit
          </Button>
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
