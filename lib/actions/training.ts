'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type Result = { ok: boolean; error?: string }

// Training records are HR data → managed by admin/office only. Engineers can
// read their own rows via RLS but never manage them here.
async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase: null, error: 'Not authenticated' as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = (profile as { role?: string } | null)?.role
  if (!role || !['admin', 'office'].includes(role)) {
    return { supabase: null, error: 'Not authorised' as const }
  }
  return { supabase, error: null }
}

// Normalises a user-entered date (or CSV cell) to an ISO "YYYY-MM-DD" string,
// or null when blank/invalid. Accepts ISO and common UK "DD/MM/YYYY" input.
function normaliseDate(value: string | null | undefined): string | null | 'invalid' {
  if (value == null) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  // ISO already.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed + 'T00:00:00')
    return Number.isNaN(d.getTime()) ? 'invalid' : trimmed
  }
  // UK DD/MM/YYYY or DD-MM-YYYY.
  const uk = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (uk) {
    const [, dd, mm, yyyy] = uk
    const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
    const d = new Date(iso + 'T00:00:00')
    return Number.isNaN(d.getTime()) ? 'invalid' : iso
  }
  return 'invalid'
}

export async function saveTrainingRecord(input: {
  id?: string
  profile_id: string
  training_type: string
  course_name: string
  provider: string | null
  completed_date: string | null
  expiry_date: string | null
  certificate_url?: string | null
  certificate_pathname?: string | null
  certificate_name?: string | null
}): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  if (!input.profile_id) return { ok: false, error: 'An employee is required' }
  if (!input.training_type.trim()) return { ok: false, error: 'A training type is required' }
  if (!input.course_name.trim()) return { ok: false, error: 'A course name is required' }

  const completed = normaliseDate(input.completed_date)
  const expiry = normaliseDate(input.expiry_date)
  if (completed === 'invalid') return { ok: false, error: 'Completed date is not a valid date' }
  if (expiry === 'invalid') return { ok: false, error: 'Expiry date is not a valid date' }

  // Certificate: either an uploaded file (pathname + url both set) or an
  // external link (url only). A bare pathname without url is meaningless.
  const certPathname = input.certificate_pathname?.trim() || null
  const certUrl = input.certificate_url?.trim() || null
  if (certUrl && !certPathname && !/^https?:\/\//i.test(certUrl)) {
    return { ok: false, error: 'Certificate link must start with http:// or https://' }
  }
  const certName = input.certificate_name?.trim() || null

  const payload = {
    profile_id: input.profile_id,
    training_type: input.training_type.trim(),
    course_name: input.course_name.trim(),
    provider: input.provider?.trim() || null,
    completed_date: completed,
    expiry_date: expiry,
    certificate_url: certUrl,
    certificate_pathname: certPathname,
    certificate_name: certName,
  }

  const query = input.id
    ? supabase
        .from('training_records')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', input.id)
    : supabase.from('training_records').insert(payload)

  const { error: dbError } = await query
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/training')
  return { ok: true }
}

export async function deleteTrainingRecord(id: string): Promise<Result> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error }
  const { error: dbError } = await supabase.from('training_records').delete().eq('id', id)
  if (dbError) return { ok: false, error: dbError.message }
  revalidatePath('/dashboard/training')
  return { ok: true }
}

export interface TrainingImportRow {
  employee_number: string
  training_type: string
  course_name: string
  provider: string
  completed_date: string
  expiry_date: string
}

export interface TrainingImportResult {
  ok: boolean
  error?: string
  inserted: number
  errors: { row: number; employee_number: string; message: string }[]
}

// Bulk-imports training rows parsed from a CSV. Matches each row to an employee
// by employee_number, validates required fields + dates, and inserts valid
// rows. Returns a per-row error report so the admin can fix and re-upload.
export async function bulkImportTraining(
  rows: TrainingImportRow[],
): Promise<TrainingImportResult> {
  const { supabase, error } = await requireStaff()
  if (!supabase) return { ok: false, error, inserted: 0, errors: [] }
  if (!rows.length) {
    return { ok: false, error: 'No rows found in the file', inserted: 0, errors: [] }
  }

  // Build an employee_number → profile_id lookup for all internal users.
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, employee_number')
    .neq('role', 'client')
  if (pErr) return { ok: false, error: pErr.message, inserted: 0, errors: [] }

  const byEmployeeNumber = new Map<string, string>()
  for (const p of (profiles ?? []) as { id: string; employee_number: string | null }[]) {
    if (p.employee_number) byEmployeeNumber.set(p.employee_number.trim().toLowerCase(), p.id)
  }

  const errors: TrainingImportResult['errors'] = []
  const toInsert: {
    profile_id: string
    training_type: string
    course_name: string
    provider: string | null
    completed_date: string | null
    expiry_date: string | null
  }[] = []

  rows.forEach((row, i) => {
    const rowNumber = i + 2 // account for the header row in the source file
    const emp = row.employee_number?.trim() ?? ''
    if (!emp) {
      errors.push({ row: rowNumber, employee_number: '', message: 'Missing employee number' })
      return
    }
    const profileId = byEmployeeNumber.get(emp.toLowerCase())
    if (!profileId) {
      errors.push({ row: rowNumber, employee_number: emp, message: 'No employee matches this number' })
      return
    }
    if (!row.training_type?.trim()) {
      errors.push({ row: rowNumber, employee_number: emp, message: 'Missing training type' })
      return
    }
    if (!row.course_name?.trim()) {
      errors.push({ row: rowNumber, employee_number: emp, message: 'Missing course name' })
      return
    }
    const completed = normaliseDate(row.completed_date)
    const expiry = normaliseDate(row.expiry_date)
    if (completed === 'invalid') {
      errors.push({ row: rowNumber, employee_number: emp, message: 'Invalid completed date' })
      return
    }
    if (expiry === 'invalid') {
      errors.push({ row: rowNumber, employee_number: emp, message: 'Invalid expiry date' })
      return
    }
    toInsert.push({
      profile_id: profileId,
      training_type: row.training_type.trim(),
      course_name: row.course_name.trim(),
      provider: row.provider?.trim() || null,
      completed_date: completed,
      expiry_date: expiry,
    })
  })

  let inserted = 0
  if (toInsert.length) {
    const { error: dbError } = await supabase.from('training_records').insert(toInsert)
    if (dbError) return { ok: false, error: dbError.message, inserted: 0, errors }
    inserted = toInsert.length
  }

  revalidatePath('/dashboard/training')
  return { ok: errors.length === 0, inserted, errors }
}
