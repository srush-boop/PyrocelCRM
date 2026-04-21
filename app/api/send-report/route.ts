import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { formatDateUK } from '@/lib/utils'

// This API route handles sending completion reports
// In production, integrate with an email service like Resend, SendGrid, etc.

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

    const site = task.site_service?.site
    const serviceType = task.site_service?.service_type
    const engineer = task.assigned_engineer
    const overallStatus = taskResult.overall_status

    // Generate email content
    const emailSubject = overallStatus === 'pass'
      ? `Service Completed: ${serviceType?.name} at ${site?.name}`
      : `Service Alert: Issues Found at ${site?.name}`

    const failedItems = (taskResult.checklist_results || [])
      .filter((r: { passed: boolean | null }) => r.passed === false)
      .map((r: { label: string; notes?: string }) => `- ${r.label}${r.notes ? `: ${r.notes}` : ''}`)
      .join('\n')

    const emailBody = overallStatus === 'pass'
      ? `
Dear ${site?.contact_name || 'Client'},

We are pleased to confirm that the ${serviceType?.name} service at ${site?.name} has been completed successfully.

Service Details:
- Service Type: ${serviceType?.name}
- Date Completed: ${formatDateUK(task.completed_at || '')}
- Engineer: ${engineer?.full_name || engineer?.email}
- Result: All checks passed

${taskResult.engineer_notes ? `Engineer Notes:\n${taskResult.engineer_notes}\n` : ''}

Thank you for choosing our services.

Best regards,
Pyrocel Fire & Safety
      `.trim()
      : `
INTERNAL ALERT: Service Issues Detected

Site: ${site?.name}
Address: ${site?.address}
Service: ${serviceType?.name}
Date: ${formatDateUK(task.completed_at || '')}
Engineer: ${engineer?.full_name || engineer?.email}
Status: ${overallStatus.toUpperCase()}

Issues Found:
${failedItems || 'See detailed checklist results'}

${taskResult.engineer_notes ? `Engineer Notes:\n${taskResult.engineer_notes}\n` : ''}

Client Contact:
- Name: ${site?.contact_name || 'N/A'}
- Email: ${site?.contact_email || 'N/A'}
- Phone: ${site?.contact_phone || 'N/A'}

Please review and take appropriate action.
      `.trim()

    // Determine recipients
    // If custom emails provided (resend scenario), use those
    // Otherwise, use site's reporting emails or fall back to contact email
    let recipients: string[] = []
    
    if (customEmails && customEmails.length > 0) {
      recipients = customEmails
    } else if (site?.reporting_emails && Array.isArray(site.reporting_emails) && site.reporting_emails.length > 0) {
      recipients = site.reporting_emails
    } else if (site?.contact_email) {
      recipients = [site.contact_email]
    }

    // For failed tests, also send to internal email
    const internalEmail = process.env.INTERNAL_REPORT_EMAIL || 'office@pyrocel.com'
    const allRecipients = overallStatus === 'pass' 
      ? recipients 
      : [...recipients, internalEmail]

    // In production, send actual email here using Resend, SendGrid, etc.
    // For now, log the email content and mark as sent
    console.log('=== EMAIL REPORT ===')
    console.log('To:', allRecipients.join(', '))
    console.log('Subject:', emailSubject)
    console.log('Body:', emailBody)
    console.log('===================')

    // Update task_result to mark email as sent (only if not a resend to preserve original send time)
    if (!resend) {
      await supabase
        .from('task_results')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', taskResult.id)
    }

    return NextResponse.json({
      success: true,
      message: 'Report sent successfully',
      recipients: allRecipients,
    })
  } catch (error) {
    console.error('Error sending report:', error)
    return NextResponse.json(
      { error: 'Failed to send report' },
      { status: 500 }
    )
  }
}
