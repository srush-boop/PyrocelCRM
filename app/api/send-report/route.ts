import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { formatDateUK } from '@/lib/utils'
import { sendEmail } from '@/lib/email/send-email'
import { resolveEmailFooter } from '@/lib/email/footer'
import {
  generateClientPassEmail,
  generateClientFailEmail,
  generateClientNoAccessEmail,
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
          site:sites(*, client:clients(id, name, requires_po)),
          service_type:service_types(*)
        ),
        assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(*)
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
    const overallStatus = taskResult.overall_status as 'pass' | 'fail' | 'partial' | 'no_access'

    // Build the "Open report" link. This points at the public, token-based
    // report route (/r/<public_token>) so recipients can open the report
    // straight from the email without needing to log in. Prefer an explicit
    // NEXT_PUBLIC_APP_URL, then fall back to Vercel's deployment URL, then the
    // incoming request origin — so the link is always present regardless of env config.
    const vercelUrl =
      process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
    const baseUrl = (
      process.env.NEXT_PUBLIC_APP_URL ||
      (vercelUrl ? `https://${vercelUrl}` : '') ||
      request.nextUrl.origin
    ).replace(/\/$/, '')
    const reportUrl =
      baseUrl && task.public_token ? `${baseUrl}/r/${task.public_token}` : undefined
    if (!baseUrl) {
      console.warn('[v0] Unable to determine base URL — "Open report" link omitted from email.')
    }

    // Public link to the site's fire safety log book (included on client emails).
    const logbookUrl = baseUrl && site?.id ? `${baseUrl}/logbook/${site.id}` : undefined

    // Configurable footer for the staff member sending this report (falls back
    // to the company-wide default). The sender is the authenticated user.
    const footer = await resolveEmailFooter(user.id)

    // ─── "What happens next" facts ───────────────────────────────────────────
    // Tell the client what we've done / intend to do based on the real state of
    // the call: follow-up logged, PO required but missing, remedial quote to come.
    const client = (site as { client?: { requires_po?: boolean | null } | null })?.client ?? null

    // Has a follow-up call already been logged for this visit?
    const { data: followUp } = await supabase
      .from('follow_up_requests')
      .select('id')
      .eq('original_task_id', taskId)
      .limit(1)
    const followUpLogged = Array.isArray(followUp) && followUp.length > 0

    // Existing PO requests for this call (to know if a PO is already on file, and
    // to reuse an outstanding request's authorisation token rather than duplicating).
    const { data: poRows } = await supabase
      .from('po_requests')
      .select('authorisation_token, authorised_at, po_number')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })
    const poList = (poRows || []) as {
      authorisation_token: string | null
      authorised_at: string | null
      po_number: string | null
    }[]
    const authorisedPoExists = poList.some((r) => !!r.authorised_at && !!r.po_number)

    // PO required = client account requires a PO, the call is chargeable, and
    // this call isn't exempt. Non-chargeable work (e.g. routine PPM visits) never
    // chases a PO even when the client account has requires_po set.
    const poRequired =
      !!client?.requires_po && !!task.chargeable && !task.po_not_required
    // PO satisfied = a PO / client reference has already been entered on the call
    // at the time of logging, OR an authorised PO exists. When satisfied we never
    // create a new request.
    const poProvided = !!task.client_ref || authorisedPoExists

    // When a PO is required but missing, offer the client a link to provide it.
    // Reuse an outstanding (un-authorised) request's token, otherwise create a
    // new request row (logged as the first request) — the token auto-generates.
    let poAuthoriseUrl: string | undefined
    if (poRequired && !poProvided && baseUrl) {
      let token = poList.find((r) => !r.authorised_at)?.authorisation_token ?? null
      if (!token) {
        const { data: createdPo, error: createPoError } = await supabase
          .from('po_requests')
          .insert({
            task_id: taskId,
            requested_by: user.id,
            note: 'Awaiting PO — requested via service completion report',
          })
          .select('authorisation_token')
          .single()
        if (createPoError) {
          console.warn('[v0] Could not create PO request for report email:', createPoError.message)
        }
        token = (createdPo as { authorisation_token: string | null } | null)?.authorisation_token ?? null
      }
      if (token) poAuthoriseUrl = `${baseUrl}/po-authorise/${token}`
    }

    // Remedial quote to follow when there are attention items and we haven't
    // already logged a follow-up call to carry the works out ourselves.
    const remedialQuoteToFollow =
      (overallStatus === 'fail' || overallStatus === 'partial') && !followUpLogged

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
      referenceNumber: taskResult.reference_number || undefined,
      siteName: site?.name || 'Site',
      serviceType: serviceType?.name || 'Service',
      completedDate: formatDateUK(task.completed_at || new Date().toISOString()),
      overallStatus,
      checklist: (taskResult.checklist_results || []).map(
        (r: {
          label: string
          type?: 'pass_fail' | 'text' | 'number' | 'checkbox'
          value?: boolean | string | number | null
          passed: boolean | null
          advisory?: boolean
          notes?: string
          parent_item_id?: string
        }) => ({
          id: r.label,
          // Conditional follow-up rows are indented under their parent so the
          // extra question + answer reads as a sub-item in the emailed report.
          label: r.parent_item_id ? `↳ ${r.label}` : r.label,
          type: r.type,
          value: r.value,
          // Preserve null for summary/informational items so they are not
          // rendered as failures in the email.
          passed: r.passed ?? null,
          advisory: r.advisory ?? false,
          notes: r.notes,
        })
      ),
      engineerName: engineer?.full_name || engineer?.email || 'Engineer',
      engineerNotes: taskResult.engineer_notes || undefined,
      reportUrl,
      logbookUrl,
      footer,
      followUpLogged,
      poRequired,
      poProvided,
      poAuthoriseUrl,
      remedialQuoteToFollow,
    }

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: 'No recipient email addresses configured for this site or service.' },
        { status: 400 }
      )
    }

    // Defects routing: when the report contains defects (not a clean pass), CC the
    // "Defects to" addresses so problems also reach the relevant departments.
    //  - service_types.defects_to_email: company-wide default from the service master template
    //  - site_services.defects_to_email: per-site client department override
    // Both are included (de-duplicated) when present. On a clean pass, no defect CCs are added.
    const hasDefects = overallStatus !== 'pass'
    const defectsCc: string[] = []
    if (hasDefects) {
      const serviceDefectsEmail = (siteService?.defects_to_email || '').trim()
      const templateDefectsEmail = (serviceType?.defects_to_email || '').trim()
      // Per-site service address takes priority; fall back to the template default.
      if (serviceDefectsEmail) defectsCc.push(serviceDefectsEmail)
      else if (templateDefectsEmail) defectsCc.push(templateDefectsEmail)
      // Always also include the template default alongside a per-site address when both differ.
      if (
        serviceDefectsEmail &&
        templateDefectsEmail &&
        serviceDefectsEmail.toLowerCase() !== templateDefectsEmail.toLowerCase()
      ) {
        defectsCc.push(templateDefectsEmail)
      }
    }

    // Pick the right client-facing template based on result. 'no_access' is a
    // neutral outcome (not a failure), so it gets its own template.
    const { subject, html } =
      overallStatus === 'pass'
        ? generateClientPassEmail(emailData)
        : overallStatus === 'no_access'
          ? generateClientNoAccessEmail(emailData)
          : generateClientFailEmail(emailData)

    // Send to every client recipient (CC the defects addresses on the first
    // recipient only, so the department is looped in without duplicate emails).
    const results = await Promise.all(
      recipients.map((to, index) =>
        sendEmail(to, subject, html, index === 0 ? { cc: defectsCc } : undefined),
      )
    )

    const failed = results.filter((r) => !r.success)
    if (failed.length > 0) {
      const firstError = failed[0]?.error || 'Unknown error'
      return NextResponse.json(
        { error: `Failed to send report: ${firstError}` },
        { status: 502 }
      )
    }

    // For failed/partial inspections, also notify internal staff. 'no_access'
    // is not a defect, so it does not trigger the defect alert.
    if (overallStatus === 'fail' || overallStatus === 'partial') {
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
