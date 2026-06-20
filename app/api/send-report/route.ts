import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { formatDateUK } from '@/lib/utils'
import { isDamperService } from '@/lib/dampers'
import { sendEmail } from '@/lib/email/send-email'
import {
  generateClientPassEmail,
  generateClientFailEmail,
  generateInternalAlertEmail,
  EmailData,
} from '@/lib/email/templates'

// This API route handles sending completion reports via Resend.
// Requires RESEND_API_KEY (and optionally RESEND_FROM_EMAIL) to be set.

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { taskId, emails, resend } = body

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID required' }, { status: 400 })
    }

    // If custom emails provided (resend), validate them
    const customEmails = resend && Array.isArray(emails) ? emails : null

    // Fetch task with all related data
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select(`
        *,
        site_service:site_services(
          *,
          site:sites(*),
          service_type:service_types(*)
        ),
        assigned_engineer:profiles(*)
      `)
      .eq('id', taskId)
      .single()

    if (taskError || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Fetch task result
    const { data: taskResult } = await supabase
      .from('task_results')
      .select('*')
      .eq('task_id', taskId)
      .single()

    if (!taskResult) {
      return NextResponse.json({ error: 'Task result not found' }, { status: 404 })
    }

    const siteService = task.site_service
    const site = siteService?.site
    const serviceType = siteService?.service_type
    const engineer = task.assigned_engineer
    const overallStatus = taskResult.overall_status as 'pass' | 'fail' | 'partial'

    // Build the "Open report" link. Auto-route to the damper or service report
    // page based on the service type. Requires NEXT_PUBLIC_APP_URL to be set.
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
    const reportPath = isDamperService(serviceType?.name)
      ? `/dashboard/dampers/report/${taskId}`
      : `/dashboard/reports/${taskId}`
    const reportUrl = baseUrl ? `${baseUrl}${reportPath}` : undefined
    if (!baseUrl) {
      console.warn('[v0] NEXT_PUBLIC_APP_URL not set — "Open report" link omitted from email.')
    }

    // Determine recipients.
    // Priority: explicit resend emails > per-service reporting emails (override) >
    // site-level reporting emails > site contact email.
    let recipients: string[] = []

    const serviceEmails = Array.isArray(siteService?.reporting_emails)
      ? (siteService.reporting_emails as string[])
      : []
    const siteEmails = Array.isArray(site?.reporting_emails)
      ? (site.reporting_emails as string[])
      : []

    if (customEmails && customEmails.length > 0) {
      recipients = customEmails
    } else if (serviceEmails.length > 0) {
      // System-specific client emails override the site-level emails
      recipients = serviceEmails
    } else if (siteEmails.length > 0) {
      recipients = siteEmails
    } else if (site?.contact_email) {
      recipients = [site.contact_email]
    }

    // Build the shared email data for the templates
    const emailData: EmailData = {
      clientName: site?.contact_name || 'Client',
      clientEmail: recipients[0] || site?.contact_email || '',
      siteName: site?.name || 'Site',
      serviceType: serviceType?.name || 'Service',
      completedDate: formatDateUK(task.completed_at || new Date().toISOString()),
      overallStatus,
      checklist: (taskResult.checklist_results || []).map(
        (r: { label: string; passed: boolean | null; notes?: string }) => ({
          id: r.label,
          label: r.label,
          passed: r.passed === true,
          notes: r.notes,
        })
      ),
      engineerName: engineer?.full_name || engineer?.email || 'Engineer',
      engineerNotes: taskResult.engineer_notes || undefined,
      reportUrl,
    }

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: 'No recipient email addresses configured for this site or service.' },
        { status: 400 }
      )
    }

    // Pick the right client-facing template based on result
    const { subject, html } =
      overallStatus === 'pass'
        ? generateClientPassEmail(emailData)
        : generateClientFailEmail(emailData)

    // Send to every client recipient
    const results = await Promise.all(
      recipients.map((to) => sendEmail(to, subject, html))
    )

    const failed = results.filter((r) => !r.success)
    if (failed.length > 0) {
      const firstError = failed[0]?.error || 'Unknown error'
      return NextResponse.json(
        { error: `Failed to send report: ${firstError}` },
        { status: 502 }
      )
    }

    // For failed/partial inspections, also notify internal staff
    if (overallStatus !== 'pass') {
      const internalEmails =
        process.env.INTERNAL_ALERT_EMAILS?.split(',').map((e) => e.trim()).filter(Boolean) ||
        []
      if (internalEmails.length > 0) {
        const internal = generateInternalAlertEmail(emailData)
        await Promise.all(
          internalEmails.map((to) => sendEmail(to, internal.subject, internal.html))
        )
      }
    }

    // Mark email as sent (preserve original send time on resend)
    if (!resend) {
      await supabase
        .from('task_results')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', taskResult.id)
    }

    return NextResponse.json({
      success: true,
      message: 'Report sent successfully',
      recipients,
    })
  } catch (error) {
    console.error('[v0] Error sending report:', error)
    return NextResponse.json(
      { error: 'Failed to send report' },
      { status: 500 }
    )
  }
}
