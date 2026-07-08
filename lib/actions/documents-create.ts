'use server'

import { put } from '@vercel/blob'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getDocumentAuth } from '@/lib/documents/auth'
import { loadMergeContext, renderTemplate } from '@/lib/documents/merge'
import { renderLetterPdfBuffer } from '@/lib/pdf/letter-pdf'
import { sendEmail } from '@/lib/email/send-email'
import type {
  DocumentFile,
  DocumentOwnerType,
  DocumentTemplate,
} from '@/lib/types/database'

// PDF generation + email can take a moment.
export const maxDuration = 60

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

async function requireManage() {
  const auth = await getDocumentAuth()
  if (!auth.ok || !auth.canManage) {
    return { ok: false as const, error: 'You do not have permission to do this.' }
  }
  return { ok: true as const, auth }
}

// --- Templates -------------------------------------------------------------

// Active templates whose entity_types include the given owner type.
export async function getTemplatesForEntity(
  ownerType: DocumentOwnerType,
): Promise<DocumentTemplate[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('document_templates')
    .select('*')
    .eq('is_active', true)
    .contains('entity_types', [ownerType])
    .order('name')
  return (data ?? []) as DocumentTemplate[]
}

export async function listTemplates(): Promise<DocumentTemplate[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('document_templates')
    .select('*')
    .order('name')
  return (data ?? []) as DocumentTemplate[]
}

export interface TemplateInput {
  id?: string
  name: string
  category: DocumentTemplate['category']
  subject: string | null
  body: string
  entity_types: DocumentOwnerType[]
  is_active: boolean
}

export async function saveTemplate(input: TemplateInput): Promise<ActionResult<DocumentTemplate>> {
  const guard = await requireManage()
  if (!guard.ok) return guard

  if (!input.name.trim()) return { ok: false, error: 'Please give the template a name.' }
  if (!input.entity_types.length)
    return { ok: false, error: 'Choose at least one entity type this template applies to.' }

  const supabase = await createClient()
  const row = {
    name: input.name.trim(),
    category: input.category,
    subject: input.subject?.trim() || null,
    body: input.body ?? '',
    entity_types: input.entity_types,
    is_active: input.is_active,
  }

  let saved
  if (input.id) {
    const { data, error } = await supabase
      .from('document_templates')
      .update(row)
      .eq('id', input.id)
      .select()
      .single()
    if (error) return { ok: false, error: error.message }
    saved = data
  } else {
    const { data, error } = await supabase
      .from('document_templates')
      .insert({ ...row, created_by: guard.auth.profile?.id ?? null })
      .select()
      .single()
    if (error) return { ok: false, error: error.message }
    saved = data
  }

  revalidatePath('/dashboard/settings')
  return { ok: true, data: saved as DocumentTemplate }
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  const guard = await requireManage()
  if (!guard.ok) return guard
  const supabase = await createClient()
  const { error } = await supabase.from('document_templates').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/dashboard/settings')
  return { ok: true }
}

// --- Preview / merge -------------------------------------------------------

export interface PreviewResult {
  subject: string
  body: string
  recipientEmail: string | null
  recipientName: string | null
}

// Merge a template (or raw body) against an entity for live preview. No writes.
export async function previewDocument(args: {
  ownerType: DocumentOwnerType
  ownerId: string
  templateId?: string
  subjectOverride?: string
  bodyOverride?: string
}): Promise<ActionResult<PreviewResult>> {
  const guard = await requireManage()
  if (!guard.ok) return guard

  const supabase = await createClient()
  let subjectTemplate = args.subjectOverride ?? ''
  let bodyTemplate = args.bodyOverride ?? ''

  if (args.templateId && args.bodyOverride === undefined) {
    const { data: tpl } = await supabase
      .from('document_templates')
      .select('*')
      .eq('id', args.templateId)
      .maybeSingle()
    if (tpl) {
      const t = tpl as DocumentTemplate
      subjectTemplate = args.subjectOverride ?? t.subject ?? ''
      bodyTemplate = t.body
    }
  }

  const ctx = await loadMergeContext(args.ownerType, args.ownerId, {
    name: guard.auth.profile?.full_name,
    email: guard.auth.profile?.email,
  })

  return {
    ok: true,
    data: {
      subject: renderTemplate(subjectTemplate, ctx.tokens),
      body: renderTemplate(bodyTemplate, ctx.tokens),
      recipientEmail: ctx.recipientEmail,
      recipientName: ctx.recipientName,
    },
  }
}

// --- Create ----------------------------------------------------------------

export interface CreateDocumentArgs {
  ownerType: DocumentOwnerType
  ownerId: string
  templateId?: string
  title: string
  // The (already merged / user-edited) letter body to render.
  body: string
  action: 'save' | 'email'
  // Email-only fields:
  to?: string
  cc?: string[]
  subject?: string
  message?: string
  // Path to revalidate so the entity's Documents list refreshes.
  revalidate?: string
}

export async function createDocument(
  args: CreateDocumentArgs,
): Promise<ActionResult<{ document: DocumentFile }>> {
  const guard = await requireManage()
  if (!guard.ok) return guard

  const title = args.title.trim() || 'Letter'
  if (!args.body.trim()) return { ok: false, error: 'The document body is empty.' }

  // Resolve branding + recipient for the letterhead (already-merged body is used
  // as-is, but we still want the company block and recipient name).
  const ctx = await loadMergeContext(args.ownerType, args.ownerId, {
    name: guard.auth.profile?.full_name,
    email: guard.auth.profile?.email,
  })

  let pdf: Buffer
  try {
    pdf = await renderLetterPdfBuffer({
      company: ctx.company,
      title,
      bodyText: args.body,
      recipientName: ctx.recipientName,
      recipientAddress: ctx.tokens['client.address'] || ctx.tokens['site.address'] || null,
    })
  } catch (e) {
    console.error('[v0] Letter PDF generation failed:', e)
    return { ok: false, error: 'Could not generate the document PDF.' }
  }

  const safeName = title.replace(/[^\w.\-]+/g, '_')
  const fileName = `${safeName}.pdf`
  const pathname = `documents/${args.ownerType}/${args.ownerId}/${Date.now()}-${safeName}.pdf`

  let blob
  try {
    blob = await put(pathname, pdf, {
      access: 'private',
      addRandomSuffix: true,
      contentType: 'application/pdf',
    })
  } catch (e) {
    console.error('[v0] Letter PDF upload failed:', e)
    return { ok: false, error: 'Could not save the document.' }
  }

  const supabase = await createClient()
  const { data: inserted, error } = await supabase
    .from('documents')
    .insert({
      owner_type: args.ownerType,
      owner_id: args.ownerId,
      name: fileName,
      blob_pathname: blob.pathname,
      blob_url: blob.url,
      content_type: 'application/pdf',
      size_bytes: pdf.byteLength,
      uploaded_by: guard.auth.profile?.id ?? null,
      template_id: args.templateId ?? null,
    })
    .select()
    .single()

  if (error) return { ok: false, error: error.message }

  // Optionally email the generated PDF to the client.
  if (args.action === 'email') {
    const to = (args.to || ctx.recipientEmail || '').trim()
    if (!to) {
      return {
        ok: false,
        error:
          'The document was saved, but no recipient email is set for this record. Add a contact email or enter one to send.',
      }
    }
    const companyName = ctx.company?.name || 'Pyrocel Ltd'
    const messageHtml = (args.message || '').trim()
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0f172a;line-height:1.5">
      ${messageHtml ? `<p>${messageHtml.replace(/\n/g, '<br/>')}</p>` : `<p>Please find the attached letter from ${companyName}.</p>`}
      <p style="color:#64748b">${companyName}</p>
    </div>`
    const result = await sendEmail(to, (args.subject || title).trim(), html, {
      cc: args.cc,
      attachments: [{ filename: fileName, content: pdf }],
    })
    if (!result.success) {
      if (result.error === 'Email service not configured') {
        return {
          ok: false,
          error:
            'The document was saved to Documents, but email isn’t configured in this environment (no RESEND_API_KEY), so it could not be sent. You can download it from Documents and send it manually.',
        }
      }
      return { ok: false, error: `The document was saved, but the email failed: ${result.error}` }
    }
  }

  if (args.revalidate) revalidatePath(args.revalidate)

  return { ok: true, data: { document: inserted as DocumentFile } }
}
