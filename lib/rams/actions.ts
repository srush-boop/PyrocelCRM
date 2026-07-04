'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthContext } from '@/lib/auth'
import { sendEmail } from '@/lib/email/send-email'
import type {
  RamsCompanySettings,
  SelectedHazard,
  MethodStep,
  KeyPerson,
  EmergencyHospitalInfo,
} from './types'

type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string }

async function requireStaff() {
  const { user, profile } = await getAuthContext()
  if (!user || !profile) throw new Error('Not authenticated')
  if (!['admin', 'office', 'engineer'].includes(profile.role)) {
    throw new Error('Not authorised')
  }
  return { user, profile }
}

function isApprover(role: string) {
  return role === 'admin' || role === 'office'
}

// ---------------------------------------------------------------------------
// Company settings
// ---------------------------------------------------------------------------

export async function getRamsSettings(): Promise<RamsCompanySettings | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('rams_company_settings')
    .select('*')
    .limit(1)
    .maybeSingle()
  return (data as RamsCompanySettings) ?? null
}

export async function saveRamsSettings(
  values: Partial<RamsCompanySettings>,
): Promise<ActionResult> {
  const { profile } = await requireStaff()
  if (!isApprover(profile.role)) return { success: false, error: 'Not authorised' }
  const supabase = await createClient()

  const existing = await supabase
    .from('rams_company_settings')
    .select('id')
    .limit(1)
    .maybeSingle()

  const payload = { ...values, updated_at: new Date().toISOString() }
  if (existing.data?.id) {
    const { error } = await supabase
      .from('rams_company_settings')
      .update(payload)
      .eq('id', existing.data.id)
    if (error) return { success: false, error: error.message }
  } else {
    const { error } = await supabase.from('rams_company_settings').insert(payload)
    if (error) return { success: false, error: error.message }
  }
  revalidatePath('/dashboard/rams/admin/settings')
  return { success: true }
}

// ---------------------------------------------------------------------------
// Numbering
// ---------------------------------------------------------------------------

async function generateRamsNumber(templateCode: string): Promise<string> {
  // Use the service-role client so the atomic sequence bump is never blocked by
  // RLS and stays consistent across users.
  const admin = createAdminClient()
  const year = new Date().getFullYear()
  const code = (templateCode || 'GEN').toUpperCase()

  const settings = await admin
    .from('rams_company_settings')
    .select('rams_prefix')
    .limit(1)
    .maybeSingle()
  const prefix = settings.data?.rams_prefix || 'RAMS'

  const { data: seq } = await admin
    .from('rams_sequences')
    .select('*')
    .eq('template_code', code)
    .eq('year', year)
    .maybeSingle()

  let next = 1
  if (seq) {
    next = (seq.last_number || 0) + 1
    await admin
      .from('rams_sequences')
      .update({ last_number: next })
      .eq('id', seq.id)
  } else {
    await admin
      .from('rams_sequences')
      .insert({ template_code: code, year, last_number: next })
  }

  return `${prefix}-${code}-${year}-${String(next).padStart(3, '0')}`
}

// ---------------------------------------------------------------------------
// Projects (bridge between a RAMS document and a CRM site)
// ---------------------------------------------------------------------------

async function ensureRamsProject(input: {
  clientId: string | null
  siteId: string | null
  name: string
  siteAddress: string | null
  projectNumber: string | null
  createdBy: string
}): Promise<string | null> {
  const supabase = await createClient()

  if (input.siteId) {
    const { data: existing } = await supabase
      .from('rams_projects')
      .select('id')
      .eq('site_id', input.siteId)
      .maybeSingle()
    if (existing?.id) {
      await supabase
        .from('rams_projects')
        .update({
          name: input.name,
          site_address: input.siteAddress,
          project_number: input.projectNumber,
          client_id: input.clientId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      return existing.id
    }
  }

  const { data, error } = await supabase
    .from('rams_projects')
    .insert({
      client_id: input.clientId,
      site_id: input.siteId,
      name: input.name,
      site_address: input.siteAddress,
      project_number: input.projectNumber,
      created_by: input.createdBy,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[v0] ensureRamsProject error:', error.message)
    return null
  }
  return data.id
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export interface RamsDocumentInput {
  templateId: string | null
  templateCode: string | null
  systemTypeId: string | null
  clientId: string | null
  siteId: string | null
  siteName: string | null
  siteAddress: string | null
  title: string
  jobNumber: string | null
  workDescription: string | null
  workLocation: string | null
  plannedStartDate: string | null
  plannedEndDate: string | null
  noEndDate: boolean
  selectedHazards: SelectedHazard[]
  ppeRequirements: string[]
  equipmentList: string[]
  methodSteps: MethodStep[]
  keyPersonnel: KeyPerson[]
  emergencyProcedures: string | null
  emergencyHospitalInfo: EmergencyHospitalInfo | null
  siteSpecificConsiderations: string | null
}

function toRow(input: RamsDocumentInput, projectId: string | null) {
  return {
    template_id: input.templateId,
    system_type_id: input.systemTypeId,
    project_id: projectId,
    client_id: input.clientId,
    site_id: input.siteId,
    title: input.title,
    job_number: input.jobNumber,
    work_description: input.workDescription,
    work_location: input.workLocation,
    planned_start_date: input.plannedStartDate,
    planned_end_date: input.noEndDate ? null : input.plannedEndDate,
    no_end_date: input.noEndDate,
    selected_hazards: input.selectedHazards,
    ppe_requirements: input.ppeRequirements,
    equipment_list: input.equipmentList,
    method_steps: input.methodSteps,
    key_personnel: input.keyPersonnel,
    emergency_procedures: input.emergencyProcedures,
    emergency_hospital_info: input.emergencyHospitalInfo,
    site_specific_considerations: input.siteSpecificConsiderations,
    updated_at: new Date().toISOString(),
  }
}

export async function createRamsDocument(
  input: RamsDocumentInput,
): Promise<ActionResult<{ id: string }>> {
  const { user } = await requireStaff()
  const supabase = await createClient()

  const projectId = await ensureRamsProject({
    clientId: input.clientId,
    siteId: input.siteId,
    name: input.siteName || input.title,
    siteAddress: input.siteAddress,
    projectNumber: input.jobNumber,
    createdBy: user.id,
  })

  const ramsNumber = await generateRamsNumber(input.templateCode || 'GEN')

  const { data, error } = await supabase
    .from('rams_documents')
    .insert({
      ...toRow(input, projectId),
      rams_number: ramsNumber,
      status: 'draft',
      revision: 0,
      is_current_revision: true,
      created_by: user.id,
      prepared_by: user.id,
      prepared_date: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/rams')
  return { success: true, data: { id: data.id } }
}

export async function updateRamsDocument(
  id: string,
  input: RamsDocumentInput,
): Promise<ActionResult> {
  const { user } = await requireStaff()
  const supabase = await createClient()

  const projectId = await ensureRamsProject({
    clientId: input.clientId,
    siteId: input.siteId,
    name: input.siteName || input.title,
    siteAddress: input.siteAddress,
    projectNumber: input.jobNumber,
    createdBy: user.id,
  })

  const { error } = await supabase
    .from('rams_documents')
    .update(toRow(input, projectId))
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/rams')
  revalidatePath(`/dashboard/rams/${id}`)
  return { success: true }
}

export async function deleteRamsDocument(id: string): Promise<ActionResult> {
  const { profile } = await requireStaff()
  if (!isApprover(profile.role)) return { success: false, error: 'Not authorised' }
  const supabase = await createClient()
  const { error } = await supabase.from('rams_documents').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/rams')
  return { success: true }
}

// ---------------------------------------------------------------------------
// Approval workflow
// ---------------------------------------------------------------------------

export async function submitForApproval(
  id: string,
  recipient: { email: string; name: string | null },
  options?: { subject?: string; message?: string },
): Promise<ActionResult> {
  const { user } = await requireStaff()
  const supabase = await createClient()

  const { data: doc, error: docErr } = await supabase
    .from('rams_documents')
    .select('id, rams_number, title')
    .eq('id', id)
    .single()
  if (docErr || !doc) return { success: false, error: docErr?.message || 'Not found' }

  const { data: approval, error: apprErr } = await supabase
    .from('rams_approvals')
    .insert({
      rams_id: id,
      approval_type: 'manager',
      recipient_email: recipient.email,
      recipient_name: recipient.name,
      status: 'pending',
      sent_at: new Date().toISOString(),
    })
    .select('token')
    .single()
  if (apprErr) return { success: false, error: apprErr.message }

  const { error: updErr } = await supabase
    .from('rams_documents')
    .update({
      status: 'pending_approval',
      manager_email: recipient.email,
      reviewed_by: user.id,
      reviewed_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (updErr) return { success: false, error: updErr.message }

  // Best-effort approval-notification email with the public link.
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : ''
  const link = `${baseUrl}/approve/${approval.token}`

  // Escape user/AI-supplied text before embedding it in the HTML email.
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

  const subject = options?.subject?.trim() || `RAMS approval requested: ${doc.rams_number}`

  // If a custom (AI-drafted or edited) message was supplied, render it as the
  // covering note; otherwise fall back to the standard boilerplate.
  const introHtml = options?.message?.trim()
    ? escapeHtml(options.message.trim())
        .split(/\n{2,}/)
        .map((para) => `<p>${para.replace(/\n/g, '<br/>')}</p>`)
        .join('\n')
    : `<p>Hello${recipient.name ? ` ${escapeHtml(recipient.name)}` : ''},</p>
       <p>A Risk Assessment &amp; Method Statement (<strong>${doc.rams_number}</strong> — ${doc.title}) has been submitted for your approval.</p>`

  await sendEmail(
    recipient.email,
    subject,
    `${introHtml}
     <p><a href="${link}">Review and respond to this RAMS</a></p>
     <p>If the link above does not work, copy this URL into your browser:<br/>${link}</p>`,
  )

  revalidatePath('/dashboard/rams')
  revalidatePath(`/dashboard/rams/${id}`)
  return { success: true }
}

// Internal approve/reject (for admin/office signing off inside the CRM).
export async function decideRams(
  id: string,
  decision: 'approved' | 'rejected',
  comments: string | null,
): Promise<ActionResult> {
  const { user, profile } = await requireStaff()
  if (!isApprover(profile.role)) return { success: false, error: 'Not authorised' }
  const supabase = await createClient()

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('rams_documents')
    .update({
      status: decision,
      approved_by: decision === 'approved' ? user.id : null,
      approved_date: decision === 'approved' ? now : null,
      approved_at: decision === 'approved' ? now : null,
      revision_notes: comments,
      updated_at: now,
    })
    .eq('id', id)
  if (error) return { success: false, error: error.message }

  await supabase
    .from('rams_approvals')
    .update({ status: decision, responded_at: now, comments })
    .eq('rams_id', id)
    .eq('status', 'pending')

  revalidatePath('/dashboard/rams')
  revalidatePath(`/dashboard/rams/${id}`)
  return { success: true }
}

// ---------------------------------------------------------------------------
// Revisions
// ---------------------------------------------------------------------------

export async function createRevision(
  id: string,
  notes: string | null,
): Promise<ActionResult<{ id: string }>> {
  const { user } = await requireStaff()
  const supabase = await createClient()

  const { data: current, error } = await supabase
    .from('rams_documents')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !current) return { success: false, error: error?.message || 'Not found' }

  // Mark the existing record as superseded.
  await supabase
    .from('rams_documents')
    .update({ is_current_revision: false })
    .eq('id', id)

  const {
    id: _omitId,
    created_at: _omitCreated,
    updated_at: _omitUpdated,
    ...rest
  } = current as Record<string, unknown>

  const { data: copy, error: insErr } = await supabase
    .from('rams_documents')
    .insert({
      ...rest,
      status: 'draft',
      revision: (current.revision || 0) + 1,
      parent_rams_id: current.parent_rams_id || id,
      is_current_revision: true,
      revision_notes: notes,
      approved_by: null,
      approved_date: null,
      approved_at: null,
      reviewed_by: null,
      reviewed_date: null,
      prepared_by: user.id,
      prepared_date: new Date().toISOString(),
      created_by: user.id,
    })
    .select('id')
    .single()
  if (insErr) return { success: false, error: insErr.message }

  revalidatePath('/dashboard/rams')
  return { success: true, data: { id: copy.id } }
}

// ---------------------------------------------------------------------------
// Engineer read-&-understood confirmations
// ---------------------------------------------------------------------------

export async function requestEngineerConfirmations(
  id: string,
  engineerIds: string[],
): Promise<ActionResult> {
  await requireStaff()
  const supabase = await createClient()

  const rows = engineerIds.map((engineerId) => ({
    rams_id: id,
    engineer_id: engineerId,
    status: 'pending' as const,
  }))
  // Insert only those that do not already exist.
  const { data: existing } = await supabase
    .from('rams_engineer_confirmations')
    .select('engineer_id')
    .eq('rams_id', id)
  const existingIds = new Set((existing || []).map((r) => r.engineer_id))
  const toInsert = rows.filter((r) => !existingIds.has(r.engineer_id))

  if (toInsert.length > 0) {
    const { error } = await supabase
      .from('rams_engineer_confirmations')
      .insert(toInsert)
    if (error) return { success: false, error: error.message }
  }
  revalidatePath(`/dashboard/rams/${id}`)
  return { success: true }
}

export async function confirmRams(
  id: string,
  signatureData: string | null,
  notes: string | null,
): Promise<ActionResult> {
  const { user } = await requireStaff()
  const supabase = await createClient()

  const now = new Date().toISOString()
  const { data: existing } = await supabase
    .from('rams_engineer_confirmations')
    .select('id')
    .eq('rams_id', id)
    .eq('engineer_id', user.id)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await supabase
      .from('rams_engineer_confirmations')
      .update({ status: 'confirmed', confirmed_at: now, signature_data: signatureData, notes, updated_at: now })
      .eq('id', existing.id)
    if (error) return { success: false, error: error.message }
  } else {
    const { error } = await supabase.from('rams_engineer_confirmations').insert({
      rams_id: id,
      engineer_id: user.id,
      status: 'confirmed',
      confirmed_at: now,
      signature_data: signatureData,
      notes,
    })
    if (error) return { success: false, error: error.message }
  }

  // Record a signature row too, for the audit trail / PDF.
  await supabase.from('rams_signatures').insert({
    rams_id: id,
    user_id: user.id,
    signature_type: 'engineer',
    signature_data: signatureData,
    signed_at: now,
  })

  revalidatePath(`/dashboard/rams/${id}`)
  return { success: true }
}

// ---------------------------------------------------------------------------
// Admin: hazard library & system hazards
// ---------------------------------------------------------------------------

export async function saveHazard(
  values: {
    id?: string
    category: string
    description: string
    potential_consequences: string | null
    default_likelihood: number | null
    default_severity: number | null
    standard_controls: string[]
  },
): Promise<ActionResult> {
  const { profile } = await requireStaff()
  if (!isApprover(profile.role)) return { success: false, error: 'Not authorised' }
  const supabase = await createClient()

  if (values.id) {
    const { id, ...rest } = values
    const { error } = await supabase.from('rams_hazards').update(rest).eq('id', id)
    if (error) return { success: false, error: error.message }
  } else {
    const { error } = await supabase.from('rams_hazards').insert(values)
    if (error) return { success: false, error: error.message }
  }
  revalidatePath('/dashboard/rams/admin/hazards')
  return { success: true }
}

export async function deleteHazard(id: string): Promise<ActionResult> {
  const { profile } = await requireStaff()
  if (!isApprover(profile.role)) return { success: false, error: 'Not authorised' }
  const supabase = await createClient()
  const { error } = await supabase.from('rams_hazards').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/rams/admin/hazards')
  return { success: true }
}

export async function saveTemplate(
  values: {
    id?: string
    code: string
    name: string
    description: string | null
    category: string
    template_type: string
    default_ppe: string[]
    default_equipment: string[]
    default_method_steps: string | null
  },
): Promise<ActionResult> {
  const { profile } = await requireStaff()
  if (!isApprover(profile.role)) return { success: false, error: 'Not authorised' }
  const supabase = await createClient()

  if (values.id) {
    const { id, ...rest } = values
    const { error } = await supabase
      .from('rams_master_templates')
      .update({ ...rest, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return { success: false, error: error.message }
  } else {
    const { error } = await supabase.from('rams_master_templates').insert(values)
    if (error) return { success: false, error: error.message }
  }
  revalidatePath('/dashboard/rams/admin/templates')
  return { success: true }
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  const { profile } = await requireStaff()
  if (!isApprover(profile.role)) return { success: false, error: 'Not authorised' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('rams_master_templates')
    .update({ is_active: false })
    .eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/rams/admin/templates')
  return { success: true }
}
