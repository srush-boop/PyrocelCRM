'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { formatDateUK, formatTimeUK } from '@/lib/utils'
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
  Building2
} from 'lucide-react'
import type { 
  Profile, 
  TaskWithDetails, 
  ChecklistTemplate, 
  ChecklistItem,
  ChecklistResult,
  TaskResult,
  TaskResultStatus
} from '@/lib/types/database'

interface TaskExecutionProps {
  task: TaskWithDetails
  checklistTemplate: ChecklistTemplate | null
  existingResult: TaskResult | null
  profile: Profile
}

export function TaskExecution({ 
  task, 
  checklistTemplate, 
  existingResult,
  profile 
}: TaskExecutionProps) {
  const [status, setStatus] = useState(task.status)
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
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showSubmitDialog, setShowSubmitDialog] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const site = task.site_service?.site
  const serviceType = task.site_service?.service_type

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
    await supabase
      .from('tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', task.id)

    // Update site service with last service date
    await supabase
      .from('site_services')
      .update({
        last_service_date: new Date().toISOString().split('T')[0],
      })
      .eq('id', task.site_service_id)

    setSubmitting(false)
    setShowSubmitDialog(false)
    router.push('/dashboard')
    router.refresh()
  }

  const isEngineer = profile.role === 'engineer'
  const canEdit = isEngineer && status !== 'completed' && status !== 'cancelled'

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" asChild className="mt-1">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={status === 'completed' ? 'default' : status === 'in_progress' ? 'secondary' : 'outline'}>
              {status.replace('_', ' ')}
            </Badge>
            <Badge variant="outline">{serviceType?.name}</Badge>
          </div>
          <h1 className="text-2xl font-bold">{site?.name}</h1>
        </div>
      </div>

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

      {/* Start Task Button */}
      {status === 'pending' && canEdit && (
        <Button onClick={handleStartTask} size="lg" className="w-full">
          <Play className="mr-2 h-5 w-5" />
          Start Inspection
        </Button>
      )}

      {/* Checklist */}
      {(status === 'in_progress' || status === 'completed') && (
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
                      <Textarea
                        value={result.notes || ''}
                        onChange={(e) => updateChecklistResult(result.item_id, { notes: e.target.value })}
                        placeholder="Describe the issue..."
                        className="mt-2"
                        disabled={!canEdit}
                      />
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Engineer Notes */}
      {(status === 'in_progress' || status === 'completed') && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
            <CardDescription>Add any additional observations or comments</CardDescription>
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
                Completed on {formatDateUK(task.completed_at!)} at {formatTimeUK(task.completed_at!)}
              </>
              
