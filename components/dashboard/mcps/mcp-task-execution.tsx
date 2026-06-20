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
  BellRing,
  ArrowRight,
  History,
} from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import { McpInspectionCard, type McpInspectionState } from './mcp-inspection-card'
import type { Profile, TaskWithDetails, Mcp, McpInspection } from '@/lib/types/database'

interface McpTaskExecutionProps {
  task: TaskWithDetails
  profile: Profile
  mcps: Mcp[]
  existingInspections: McpInspection[]
  /** MCP id tested on the most recent previous weekly test (rotation pointer). */
  lastTestedMcpId?: string | null
  /** Date of that previous test, for display. */
  lastTestedDate?: string | null
}

function blankState(): McpInspectionState {
  return { result: 'pass', comments: '', photos: [], touched: false }
}

function stateFromInspection(insp: McpInspection): McpInspectionState {
  return {
    result: insp.result,
    comments: insp.comments || '',
    photos: insp.photos || [],
    touched: true,
  }
}

export function McpTaskExecution({
  task,
  profile,
  mcps,
  existingInspections,
  lastTestedMcpId,
  lastTestedDate,
}: McpTaskExecutionProps) {
  const site = task.site_service?.site
  const serviceType = task.site_service?.service_type

  const [status, setStatus] = useState(task.status)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showSubmit, setShowSubmit] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const [states, setStates] = useState<Record<string, McpInspectionState>>(() => {
    const map: Record<string, McpInspectionState> = {}
    for (const mcp of mcps) {
      const existing = existingInspections.find((i) => i.mcp_id === mcp.id)
      map[mcp.id] = existing ? stateFromInspection(existing) : blankState()
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
    return { total: mcps.length, tested, passed, failed, remedial, na }
  }, [states, mcps.length])

  const filtered = mcps.filter((m) => {
    const q = search.toLowerCase()
    return (
      (m.urn || '').toLowerCase().includes(q) ||
      (m.map_reference || '').toLowerCase().includes(q) ||
      (m.location || '').toLowerCase().includes(q) ||
      (m.floor || '').toLowerCase().includes(q)
    )
  })

  // Weekly rotation: the call point tested last week, and the one due next
  // (the next item in the ordered register, wrapping back to the start).
  const { lastTestedMcp, nextMcp } = useMemo(() => {
    if (mcps.length === 0) return { lastTestedMcp: null, nextMcp: null }
    const lastIdx = lastTestedMcpId ? mcps.findIndex((m) => m.id === lastTestedMcpId) : -1
    const last = lastIdx >= 0 ? mcps[lastIdx] : null
    const next = mcps[(lastIdx + 1) % mcps.length]
    return { lastTestedMcp: last, nextMcp: next }
  }, [mcps, lastTestedMcpId])

  const describeMcp = (m: Mcp) =>
    [m.map_reference ? `Map ${m.map_reference}` : null, m.location, m.floor]
      .filter(Boolean)
      .join(' · ') || m.urn || 'Call point'

  const handleStart = async () => {
    await supabase
      .from('tasks')
      .update({ status: 'in_progress', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', task.id)
    setStatus('in_progress')
    router.refresh()
  }

  const buildRows = () => {
    const today = new Date().toISOString().split('T')[0]
    return mcps
      .filter((m) => states[m.id].touched)
      .map((m) => {
        const s = states[m.id]
        return {
          mcp_id: m.id,
          task_id: task.id,
          inspector_id: profile.id,
          inspection_date: today,
          result: s.result,
          comments: s.comments || null,
          photos: s.photos,
        }
      })
  }

  const persistInspections = async () => {
    await supabase.from('mcp_inspections').delete().eq('task_id', task.id)
    const rows = buildRows()
    if (rows.length > 0) {
      await supabase.from('mcp_inspections').insert(rows)
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
      { item_id: 'total', label: 'Call points on register', type: 'number', value: summary.total, passed: null, notes: '' },
      { item_id: 'tested', label: 'Call points tested', type: 'number', value: summary.tested, passed: null, notes: '' },
      { item_id: 'passed', label: 'Passed', type: 'number', value: summary.passed, passed: null, notes: '' },
      { item_id: 'remedial', label: 'Remedial', type: 'number', value: summary.remedial, passed: null, notes: '' },
      { item_id: 'failed', label: 'Failed', type: 'number', value: summary.failed, passed: null, notes: '' },
      { item_id: 'na', label: 'N/A', type: 'number', value: summary.na, passed: null, notes: '' },
    ]
    const resultData = {
      task_id: task.id,
      checklist_results: checklistResults,
      overall_status: overall,
      engineer_notes: `Fire alarm test: ${summary.tested}/${summary.total} call points tested, ${summary.passed} pass, ${summary.remedial} remedial, ${summary.failed} fail.`,
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
    router.push('/dashboard')
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

      {mcps.length > 0 && nextMcp && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BellRing className="h-5 w-5 text-primary" />
              Call point due this week
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              {nextMcp.map_reference && (
                <Badge variant="default" className="font-mono">
                  {nextMcp.map_reference}
                </Badge>
              )}
              <span className="font-medium">{describeMcp(nextMcp)}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {lastTestedMcp ? (
                <span className="flex flex-wrap items-center gap-1">
                  <History className="h-3.5 w-3.5" />
                  Last week: {describeMcp(lastTestedMcp)}
                  {lastTestedDate ? ` (${formatDateUK(lastTestedDate)})` : ''}
                  <ArrowRight className="h-3.5 w-3.5" />
                  next in rotation shown above.
                </span>
              ) : (
                'No previous weekly test recorded — start the rotation with the call point above.'
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {status === 'pending' && canEdit && (
        <Button onClick={handleStart} size="lg" className="w-full">
          <Play className="mr-2 h-5 w-5" />
          Start Test
        </Button>
      )}

      {(status === 'in_progress' || status === 'completed') && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <BellRing className="h-5 w-5" />
                Test Progress
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

          {mcps.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No manual call points are registered for this site yet. Add them on the{' '}
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
                  placeholder="Search call points…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {filtered.map((mcp) => (
                <div
                  key={mcp.id}
                  className={
                    nextMcp && mcp.id === nextMcp.id && !states[mcp.id]?.touched
                      ? 'rounded-lg ring-2 ring-primary ring-offset-2'
                      : undefined
                  }
                >
                  {nextMcp && mcp.id === nextMcp.id && !states[mcp.id]?.touched && (
                    <Badge variant="default" className="mb-1 ml-1">
                      Due this week
                    </Badge>
                  )}
                  <McpInspectionCard
                    mcp={mcp}
                    state={states[mcp.id]}
                    disabled={!canEdit}
                    onChange={(next) => setStates((prev) => ({ ...prev, [mcp.id]: next }))}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {status === 'in_progress' && canEdit && mcps.length > 0 && (
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
            <AlertDialogTitle>Complete Fire Alarm Test</AlertDialogTitle>
            <AlertDialogDescription>
              You have tested {summary.tested} of {summary.total} call points ({summary.passed} pass,{' '}
              {summary.remedial} remedial, {summary.failed} fail). Submitting marks the task complete and
              emails the report.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Complete Test
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
