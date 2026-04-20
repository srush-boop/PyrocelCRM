'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { FileText, Send, Eye, Loader2, CheckCircle, XCircle, AlertCircle, Mail, X } from 'lucide-react'
import type { Task, TaskResult, SiteService, ServiceType, Profile } from '@/lib/types/database'

interface CompletedTask extends Task {
  site_service: SiteService & { service_type: ServiceType }
  assigned_engineer: Profile | null
  task_result: TaskResult | null
}

interface SiteReportsProps {
  siteName: string
  siteAddress: string
  completedTasks: CompletedTask[]
  reportingEmails: string[]
}

export function SiteReports({ siteName, siteAddress, completedTasks, reportingEmails }: SiteReportsProps) {
  const [viewingTask, setViewingTask] = useState<CompletedTask | null>(null)
  const [resendingTask, setResendingTask] = useState<CompletedTask | null>(null)
  const [resendEmails, setResendEmails] = useState<string[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sendSuccess, setSendSuccess] = useState(false)

  const handleOpenResend = (task: CompletedTask) => {
    setResendingTask(task)
    setResendEmails([...reportingEmails])
    setNewEmail('')
    setSendSuccess(false)
  }

  const handleAddEmail = () => {
    if (newEmail && !resendEmails.includes(newEmail)) {
      setResendEmails([...resendEmails, newEmail])
      setNewEmail('')
    }
  }

  const handleRemoveEmail = (email: string) => {
    setResendEmails(resendEmails.filter((e) => e !== email))
  }

  const handleResendReport = async () => {
    if (!resendingTask || resendEmails.length === 0) return
    
    setSending(true)
    
    try {
      const response = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: resendingTask.id,
          emails: resendEmails,
          resend: true,
        }),
      })
      
      if (response.ok) {
        setSendSuccess(true)
        setTimeout(() => {
          setResendingTask(null)
          setSendSuccess(false)
        }, 2000)
      }
    } catch (error) {
      console.error('Error resending report:', error)
    } finally {
      setSending(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pass':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle className="h-3 w-3 mr-1" />Pass</Badge>
      case 'fail':
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20"><XCircle className="h-3 w-3 mr-1" />Fail</Badge>
      case 'partial':
        return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20"><AlertCircle className="h-3 w-3 mr-1" />Partial</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  if (completedTasks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Completed Reports
          </CardTitle>
          <CardDescription>View and resend completed test reports</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No completed reports yet. Reports will appear here once tasks are completed.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Completed Reports
          </CardTitle>
          <CardDescription>View and resend completed test reports</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service Type</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Engineer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Email Sent</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {completedTasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-medium">
                    {task.site_service?.service_type?.name || 'Unknown Service'}
                  </TableCell>
                  <TableCell>
                    {task.completed_at
                      ? new Date(task.completed_at).toLocaleDateString()
                      : '-'}
                  </TableCell>
                  <TableCell>
                    {task.assigned_engineer?.full_name || 'Unassigned'}
                  </TableCell>
                  <TableCell>
                    {task.task_result
                      ? getStatusBadge(task.task_result.overall_status)
                      : <Badge variant="secondary">No Result</Badge>}
                  </TableCell>
                  <TableCell>
                    {task.task_result?.email_sent_at ? (
                      <span className="flex items-center gap-1 text-green-600 text-sm">
                        <Mail className="h-3 w-3" />
                        {new Date(task.task_result.email_sent_at).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">Not sent</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setViewingTask(task)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenResend(task)}
                      >
                        <Send className="h-4 w-4 mr-1" />
                        Send
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* View Report Dialog */}
      <Dialog open={!!viewingTask} onOpenChange={() => setViewingTask(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Test Report</DialogTitle>
            <DialogDescription>
              {viewingTask?.site_service?.service_type?.name} - {' '}
              {viewingTask?.completed_at
                ? new Date(viewingTask.completed_at).toLocaleDateString()
                : 'N/A'}
            </DialogDescription>
          </DialogHeader>
          
          {viewingTask?.task_result && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">Overall Status:</span>
                {getStatusBadge(viewingTask.task_result.overall_status)}
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Site Information</h4>
                <div className="text-sm text-muted-foreground">
                  <p>{siteName}</p>
                  <p>{siteAddress}</p>
                </div>
              </div>
              
              {viewingTask.assigned_engineer && (
                <div>
                  <h4 className="font-medium mb-1">Engineer</h4>
                  <p className="text-sm text-muted-foreground">
                    {viewingTask.assigned_engineer.full_name}
                  </p>
                </div>
              )}
              
              <div>
                <h4 className="font-medium mb-2">Checklist Results</h4>
                <div className="space-y-2">
                  {viewingTask.task_result.checklist_results.map((result, index) => (
                    <div
                      key={result.item_id || index}
                      className="flex items-center justify-between p-2 bg-muted/50 rounded"
                    >
                      <span className="text-sm">{result.label}</span>
                      {result.type === 'pass_fail' ? (
                        result.passed ? (
                          <Badge className="bg-green-500/10 text-green-600">Pass</Badge>
                        ) : (
                          <Badge className="bg-red-500/10 text-red-600">Fail</Badge>
                        )
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {String(result.value)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              {viewingTask.task_result.engineer_notes && (
                <div>
                  <h4 className="font-medium mb-1">Engineer Notes</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {viewingTask.task_result.engineer_notes}
                  </p>
                </div>
              )}
              
              {viewingTask.task_result.photos && viewingTask.task_result.photos.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Photos</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {viewingTask.task_result.photos.map((photo, index) => (
                      <img
                        key={index}
                        src={photo}
                        alt={`Report photo ${index + 1}`}
                        className="rounded border w-full h-24 object-cover"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingTask(null)}>
              Close
            </Button>
            <Button onClick={() => {
              if (viewingTask) {
                handleOpenResend(viewingTask)
                setViewingTask(null)
              }
            }}>
              <Send className="h-4 w-4 mr-2" />
              Send Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resend Report Dialog */}
      <Dialog open={!!resendingTask} onOpenChange={() => setResendingTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Report</DialogTitle>
            <DialogDescription>
              Send the completed test report to the selected email addresses
            </DialogDescription>
          </DialogHeader>
          
          {sendSuccess ? (
            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
              <p className="text-lg font-medium">Report Sent Successfully</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="add-email">Email Recipients</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      id="add-email"
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="Add email address"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddEmail()
                        }
                      }}
                    />
                    <Button type="button" variant="outline" onClick={handleAddEmail}>
                      Add
                    </Button>
                  </div>
                </div>
                
                {resendEmails.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {resendEmails.map((email) => (
                      <Badge key={email} variant="secondary" className="gap-1">
                        {email}
                        <button
                          type="button"
                          onClick={() => handleRemoveEmail(email)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No email addresses added. Add at least one recipient.
                  </p>
                )}
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setResendingTask(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleResendReport}
                  disabled={sending || resendEmails.length === 0}
                >
                  {sending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Send Report
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
