import type { SupabaseClient } from '@supabase/supabase-js'
import type { Profile, InternalTaskTemplate, InternalTaskInstance } from '@/lib/types/database'
import { buildSurveySummary, summaryHeadlines, type SurveySummary } from '@/lib/surveys/summary'
import { notifyUsers } from '@/lib/notifications'
import { sendEmail } from '@/lib/email/send-email'

// Shared survey summary-delivery logic. Kept OUT of the 'use server' actions
// file so it can accept a Supabase client argument (server actions may only take
// serializable args) and be reused by both the manual action (caller session)
// and the cron (admin client).

export function surveyResultsPath(templateId: string): string {
  return `/dashboard/surveys/${templateId}`
}

/**
 * Builds the results summary and posts it to the creator + nominated recipients
 * in-app and by email, then stamps `survey_summary_sent_at`. Best-effort on
 * notifications/email; only a hard DB failure returns ok:false.
 */
export async function deliverSurveySummary(
  supabase: SupabaseClient,
  templateId: string,
): Promise<{ ok: boolean; error?: string; recipients?: number }> {
  const { data: template } = await supabase
    .from('internal_task_templates')
    .select('*')
    .eq('id', templateId)
    .single()
  const t = template as InternalTaskTemplate | null
  if (!t || t.task_kind !== 'survey') return { ok: false, error: 'Survey not found.' }

  const { data: instances } = await supabase
    .from('internal_task_instances')
    .select('id, user_id, status, answers')
    .eq('template_id', templateId)
  const rows = (instances ?? []) as Pick<
    InternalTaskInstance,
    'id' | 'user_id' | 'status' | 'answers'
  >[]

  const ids = Array.from(new Set(rows.map((r) => r.user_id)))
  const nameById: Record<string, string> = {}
  if (ids.length > 0) {
    const { data: people } = await supabase.from('profiles').select('id, full_name').in('id', ids)
    for (const p of (people ?? []) as Pick<Profile, 'id' | 'full_name'>[]) {
      nameById[p.id] = p.full_name ?? 'Unknown'
    }
  }

  const summary = buildSurveySummary({
    questions: t.questions ?? [],
    instances: rows.map((r) => ({ status: r.status, answers: r.answers ?? [], user_id: r.user_id })),
    anonymous: t.survey_anonymous,
    nameById,
  })

  const recipientIds = Array.from(
    new Set([...(t.created_by ? [t.created_by] : []), ...(t.survey_summary_recipient_ids ?? [])]),
  )
  if (recipientIds.length === 0) {
    return { ok: false, error: 'No summary recipients (survey has no creator or nominees).' }
  }

  try {
    await notifyUsers({
      userIds: recipientIds,
      title: `Survey results: ${t.name}`,
      body: `${summary.totalResponded} of ${summary.totalInvited} responded (${summary.responseRate}%). Tap to view the full summary.`,
      url: surveyResultsPath(templateId),
      category: 'internal_task',
      createdBy: t.created_by ?? undefined,
      data: { kind: 'survey_summary', templateId },
    })
  } catch (err) {
    console.log('[v0] survey summary notify failed:', (err as Error).message)
  }

  try {
    const { data: recipients } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', recipientIds)
    const html = renderSummaryEmail(t, summary)
    for (const r of (recipients ?? []) as Pick<Profile, 'id' | 'full_name' | 'email'>[]) {
      if (!r.email) continue
      await sendEmail(r.email, `Survey results: ${t.name}`, html)
    }
  } catch (err) {
    console.log('[v0] survey summary email failed:', (err as Error).message)
  }

  const { error: upErr } = await supabase
    .from('internal_task_templates')
    .update({ survey_summary_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', templateId)
  if (upErr) return { ok: false, error: upErr.message }

  return { ok: true, recipients: recipientIds.length }
}

// --- Email rendering --------------------------------------------------------

const BRAND = '#c8102e'

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  )
}

// Self-contained branded HTML digest — deliberately independent of the client
// email templates so surveys never break if those helpers change.
function renderSummaryEmail(t: InternalTaskTemplate, summary: SurveySummary): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
  const link = base ? `${base}${surveyResultsPath(t.id)}` : ''
  const rows = summaryHeadlines(summary)
    .map(
      (h) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;font-size:14px;color:#111;">
            <strong>${esc(h.label)}</strong><br/>
            <span style="color:#555;">${esc(h.detail)}</span>
          </td>
        </tr>`,
    )
    .join('')

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#111;">
    <div style="background:${BRAND};color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;font-size:20px;">Survey results</h1>
      <p style="margin:6px 0 0;font-size:14px;opacity:.9;">${esc(t.name)}</p>
    </div>
    <div style="border:1px solid #eee;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
      <p style="font-size:15px;margin:0 0 16px;">
        <strong>${summary.totalResponded}</strong> of <strong>${summary.totalInvited}</strong>
        staff responded (${summary.responseRate}%).${summary.anonymous ? ' Responses are anonymous.' : ''}
      </p>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      ${
        link
          ? `<p style="margin:24px 0 0;">
              <a href="${link}" style="background:${BRAND};color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;display:inline-block;">
                View full results
              </a>
            </p>`
          : ''
      }
    </div>
  </div>`
}
