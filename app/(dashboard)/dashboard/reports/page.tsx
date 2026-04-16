'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Mail, AlertCircle, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

interface TaskReport {
  id: string
  taskId: string
  siteName: string
  serviceName: string
  clientEmail: string
  overallStatus: string
  emailSentAt: string | null
  createdAt: string
}

export default function ReportsPage() {
  const supabase = createClient()
  const [reports, setReports] = useState<TaskReport[]>([])
  const [loading, setLoading] = useState(true)
  const [sendingEmail, setSendingEmail] = useState<string | null>(null)

  useEffect(() => {
    loadReports()
  }, [])

  const loadReports = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('task_results')
        .select(`
          id,
          task_id,
          overall_status,
          email_sent_at,
          created_at,
          tasks(
            id,
            site_services(
              site_id,
              service_type_id,
              sites(name),
              service_types(name)
            )
          )
        `)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error

      const formatted = data?.map((item: any) => ({
        id: item.id,
        taskId: item.task_id,
        siteName: item.tasks?.site_services?.sites?.name || 'Unknown',
        serviceName: item.tasks?.site_services?.service_types?.name || 'Unknown',
        clientEmail: item.tasks?.site_services?.sites?.contact_email || '',
        overallStatus: item.overall_status,
        emailSentAt: item.email_sent_at,
        createdAt: item.created_at,
      })) || []

      setReports(formatted)
    } catch (error) {
      console.error('Error loading reports:', error)
      toast.error('Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  const resendEmail = async (reportId: string) => {
    try {
      setSendingEmail(reportId)
      
      const response = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskResultId: reportId }),
      })

      if (!response.ok) throw new Error('Failed to send email')

      toast.success('Email sent successfully')
      loadReports()
    } catch (error) {
      console.error('Error sending email:', error)
      toast.error('Failed to send email')
    } finally {
      setSendingEmail(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Service Reports</h1>
        <p className="text-muted-foreground">View and resend service completion reports</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Reports</CardTitle>
          <CardDescription>All service reports with email status</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Client Email</TableHead>
                <TableHead>Email Sent</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell className="font-medium">{report.siteName}</TableCell>
                  <TableCell>{report.serviceName}</TableCell>
                  <TableCell>
                    <Badge variant={report.overallStatus === 'pass' ? 'default' : 'destructive'}>
                      {report.overallStatus === 'pass' ? '✓ Pass' : '✗ Issues'}
                    </Badge>
                  </TableCell>
                  <TableCell>{report.clientEmail}</TableCell>
                  <TableCell>
                    {report.emailSentAt ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-sm">
                          {new Date(report.emailSentAt).toLocaleDateString()}
                        </span>
                      </div>
                    ) : (
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(report.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resendEmail(report.id)}
                      disabled={sendingEmail === report.id}
                      className="gap-2"
                    >
                      <Mail className="h-4 w-4" />
                      {sendingEmail === report.id ? 'Sending...' : 'Resend'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
