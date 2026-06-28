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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  Plus,
  CheckCheck,
  Ban,
  ExternalLink,
} from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import { computeNextScheduledDate, toDateString } from '@/lib/scheduling'
import { generateMcpUrn, TEST_KEY_TYPES, MCP_CHECKLIST } from '@/lib/mcps'
import { McpInspectionCard, type McpInspectionState, type CheckValue } from './mcp-inspection-card'
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
  /** Nimbus monitoring portal URL for this fire alarm system, if configured. */
  nimbusUrl?: string | null
}

function blankState(): McpInspectionState {
  return { result: 'pass', checklist: {}, comments: '', photos: [], touched: false }
}

function stateFromInspection(insp: McpInspection): McpInspectionState {
  return {
    result: insp.result,
    checklist: (insp.checklist as Record<string, CheckValue>) || {},
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
  nimbusUrl,
}: McpTaskExecutionProps) {
  const site = task.site_service?.site
  const serviceType = task.site_service?.service_type

  const [status, setStatus] = useState(task.status)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showSubmit, setShowSubmit] = useState(false)
  const [showPassAll, setShowPassAll] = useState(false)
  // "No access" outcome: engineer attended but couldn't get into the site.
  const [showNoAccess, setShowNoAccess] = useState(false)
  const [noAccessNotes, setNoAccessNotes] = useState('')
  const router = useRouter()
  const supabase = createClient()

  // Engineers can register new call points during the test, so keep a local
  // copy of the register that we can append to without losing in-progress state.
  const [mcpList, setMcpList] = useState<Mcp[]>(mcps)
  const [addOpen, setAddOpen] = useState(false)
  const [addSaving, setAddSaving] = useState(false)
  const [addForm, setAddForm] = useState({
    map_reference: '',
    floor: '',
    location: '',
    test_key_type: '',
    notes: '',
  })

  const [states, setStates] = useState<Record<string, McpInspectionState>>(() => {
    const map: Record<string, McpInspectionState> = {}
    for (const mcp of mcps) {
      const existing = existingInspections.find((i) => i.mcp_id === mcp.id)
      map[mcp.id] = existing ? stateFromInspection(existing) : blankState()
    }
    return map
  })

  const canEdit = status !== 'completed' && status !== 'cancelled'

  const handleAddMcp = async () => {
    setAddSaving(true)
    const { data, error } = await supabase
      .from('mcps')
      .insert({
        site_id: site?.id,
        urn: generateMcpUrn(),
        map_reference: addForm.map_reference || null,
        floor: addForm.floor || null,
        location: addForm.location || null,
        test_key_type: addForm.test_key_type || null,
        notes: addForm.notes || null,
        photos: [],
      })
      .select()
      .single()
    setAddSaving(false)
    if (error || !data) {
      console.log('[v0] Add call point error:', error?.message)
      return
    }
    const newMcp = data as Mcp
    setMcpList((prev) => [...prev, newMcp])
    setStates((prev) => ({ ...prev, [newMcp.id]: blankState() }))
    setAddForm({ map_reference: '', floor: '', location: '', test_key_type: '', notes: '' })
    setAddOpen(false)
  }

  const summary = useMemo(() => {
    const values = Object.values(states)
    const tested = values.filter((s) => s.touched).length
    const passed = values.filter((s) => s.touched && s.result === 'pass').length
    const failed = values.filter((s) => s.touched && s.result === 'fail').length
    const remedial = values.filter((s) => s.touched && s.result === 'remedial').length
    const na = values.filter((s) => s.touched && s.result === 'na').length
    return { total: mcpList.length, tested, passed, failed, remedial, na }
  }, [states, mcpList.length])

  const filtered = mcpList.filter((m) => {
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
    if (mcpList.length === 0) return { lastTestedMcp: null, nextMcp: null }
    const lastIdx = lastTestedMcpId ? mcpList.findIndex((m) => m.id === lastTestedMcpId) : -1
    const last = lastIdx >= 0 ? mcpList[lastIdx] : null
    const next = mcpList[(lastIdx + 1) % mcpList.length]
    return { lastTestedMcp: last, nextMcp: next }
  }, [mcpList, lastTestedMcpId])

  const describeMcp = (m: Mcp) =>
    [m.map_reference ? `Map ${m.map_reference}` : null, m.location, m.floor]
      .filter(Boolean)
      .join(' · ') || m.urn || 'Call point'

  // For the weekly rotation, only the call point due this week must be tested
  // or marked not accessible before the test can be submitted.
  const dueDone = !nextMcp || Boolean(states[nextMcp.id]?.touched)

  const handleStart = async () => {
    await supabase
      .from('tasks')
      .update({ status: 'in_progress', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', task.id)
    setStatus('in_progress')
    router.refresh()
  }

  // Task-level shortcut: mark every call point on the register as fully passed.
  // Useful when a whole site's test is clean; individual call points can still
  // be edited afterwards.
  const passAllMcps = () => {
    setStates((prev) => {
      const next: Record<string, McpInspectionState> = {}
      for (const mcp of mcpList) {
        const checklist: Record<string, CheckValue> = {}
        for (const item of MCP_CHECKLIST) checklist[item.id] = 'pass'
        const existing = prev[mcp.id]
        next[mcp.id] = {
          result: 'pass',
          checklist,
          comments: existing?.comments ?? '',
          photos: existing?.photos ?? [],
          touched: true,
        }
      }
      return next
    })
    setShowPassAll(false)
  }

  const buildRows = () => {
    const today = new Date().toISOString().split('T')[0]
    return mcpList
      .filter((m) => states[m.id].touched)
      .map((m) => {
        const s = states[m.id]
        return {
          mcp_id: m.id,
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

  // Shared completion logic for both a normal submit and a "no access" outcome.
  // `updateLastService` is false for no-access since the service wasn't carried
  // out, but the next recurring visit is still scheduled either way.
  const completeTask = async (opts: {
    overall: 'pass' | 'fail' | 'partial' | 'no_access'
    engineerNotes: string
    checklistResults: Array<Record<string, unknown>>
    updateLastService: boolean
  }) => {
    const today = new Date().toISOString().split('T')[0]
    const resultData = {
      task_id: task.id,
      checklist_results: opts.checklistResults,
      overall_status: opts.overall,
      engineer_notes: opts.engineerNotes,
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

    if (opts.updateLastService) {
      await supabase
        .from('site_services')
        .update({ last_service_date: today })
        .eq('id', task.site_service_id)
    }

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

    router.push('/dashboard')
    router.refresh()
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    await persistInspections()

    const overall = overallTaskStatus()
    const checklistResults = [
      { item_id: 'total', label: 'Call points on register', type: 'number', value: summary.total, passed: null, notes: '' },
      { item_id: 'tested', label: 'Call points tested', type: 'number', value: summary.tested, passed: null, notes: '' },
      { item_id: 'passed', label: 'Passed', type: 'number', value: summary.passed, passed: null, notes: '' },
      { item_id: 'remedial', label: 'Remedial', type: 'number', value: summary.remedial, passed: null, notes: '' },
      { item_id: 'failed', label: 'Failed', type: 'number', value: summary.failed, passed: null, notes: '' },
      { item_id: 'na', label: 'N/A', type: 'number', value: summary.na, passed: null, notes: '' },
    ]
    await completeTask({
      overall,
      engineerNotes: `Fire alarm test: ${summary.tested}/${summary.total} call points tested, ${summary.passed} pass, ${summary.remedial} remedial, ${summary.failed} fail.`,
      checklistResults,
      updateLastService: true,
    })

    setSubmitting(false)
    setShowSubmit(false)
  }

  // Records the visit as "no access" — a non-failure outcome. The service was
  // not carried out, so last_service_date is left untouched, but the next
  // scheduled visit is still generated.
  const handleNoAccessSubmit = async () => {
    setSubmitting(true)
    const note = noAccessNotes.trim()
    await completeTask({
      overall: 'no_access',
      engineerNotes: note
        ? `No access — could not gain entry to site. ${note}`
        : 'No access — could not gain entry to site.',
      checklistResults: [
        {
          item_id: 'no_access',
          label: 'Site access',
          type: 'text',
          value: 'No access — engineer could not gain entry',
          passed: null,
          notes: note,
        },
      ],
      updateLastService: false,
    })

    setSubmitting(false)
    setShowNoAccess(false)
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
            {task.visit_type?.name && (
              <Badge variant="secondary">{task.visit_type.name}</Badge>
            )}
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
          {nimbusUrl && (
            <a
              href={nimbusUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              Open Nimbus monitoring portal
            </a>
          )}
        </CardContent>
      </Card>

      {mcpList.length > 0 && nextMcp && (
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

          {mcpList.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-8 text-center text-muted-foreground">
                <p>No manual call points are registered for this site yet.</p>
                {canEdit && (
                  <Button onClick={() => setAddOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add a call point
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
                    placeholder="Search call points…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {canEdit && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setShowPassAll(true)}
                      className="shrink-0 bg-transparent"
                    >
                      <CheckCheck className="mr-2 h-4 w-4" />
                      Mark all passed
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setAddOpen(true)}
                      className="shrink-0 bg-transparent"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add call point
                    </Button>
                  </>
                )}
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

      {status === 'in_progress' && canEdit && (
        <div className="fixed bottom-0 left-0 right-0 flex flex-col gap-2 border-t bg-background p-4 md:relative md:flex-row md:border-0 md:p-0">
          {mcpList.length > 0 && (
            <Button variant="outline" onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Progress
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setShowNoAccess(true)}
            disabled={submitting}
            className="flex-1"
          >
            <Ban className="mr-2 h-4 w-4" />
            No Access
          </Button>
          {mcpList.length > 0 && (
            <div className="flex flex-1 flex-col items-stretch gap-1">
              <Button
                onClick={() => setShowSubmit(true)}
                disabled={!dueDone}
                className="w-full"
              >
                <Send className="mr-2 h-4 w-4" />
                Complete &amp; Submit
              </Button>
              {!dueDone && (
                <p className="text-center text-xs text-muted-foreground">
                  Test or mark the call point due this week before submitting
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add call point — lets engineers register a call point found on site */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Call Point</DialogTitle>
            <DialogDescription>
              A unique URN will be generated automatically for this call point.
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
                  placeholder="e.g. MCP-3"
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
                placeholder="e.g. Main entrance lobby"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-test-key">Test key type</Label>
              <Input
                id="add-test-key"
                list="mcp-test-key-types"
                value={addForm.test_key_type}
                onChange={(e) => setAddForm({ ...addForm, test_key_type: e.target.value })}
                placeholder="e.g. Standard reset key"
              />
              <datalist id="mcp-test-key-types">
                {TEST_KEY_TYPES.map((t) => (
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
            <Button onClick={handleAddMcp} disabled={addSaving}>
              {addSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add call point
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <Dialog open={showNoAccess} onOpenChange={setShowNoAccess}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record No Access</DialogTitle>
            <DialogDescription>
              Use this if you attended but could not gain access to the site. This is not
              recorded as a service failure. The visit will be closed and the next scheduled
              test created automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="no-access-notes">Notes (optional)</Label>
            <Textarea
              id="no-access-notes"
              value={noAccessNotes}
              onChange={(e) => setNoAccessNotes(e.target.value)}
              placeholder="e.g. Building locked, no key holder on site, gate code not working…"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNoAccess(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleNoAccessSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
              Confirm No Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showPassAll} onOpenChange={setShowPassAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark all call points passed?</AlertDialogTitle>
            <AlertDialogDescription>
              This sets every checklist item to pass and the result to pass for all{' '}
              {summary.total} call point{summary.total === 1 ? '' : 's'} on the register,
              overwriting any results already entered. You can still adjust individual call
              points afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={passAllMcps}>Mark all passed</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
