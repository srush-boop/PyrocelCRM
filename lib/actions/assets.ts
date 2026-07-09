'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUsers } from '@/lib/notifications'
import { generateAssetUrn, addMonthsIso, todayIso } from '@/lib/assets'
import type { AssetCheckResult, AssetCheckResponsible, AssetCheckType } from '@/lib/types/database'
import { revalidatePath } from 'next/cache'

type Result = { ok: boolean; error?: string; id?: string; urn?: string }

interface AuthContext {
  userId: string
  role: string
  isManager: boolean
}

/** Resolve the current user and role. */
async function getAuth() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase: null, auth: null as AuthContext | null, error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = (profile as { role?: string } | null)?.role ?? ''
  const auth: AuthContext = {
    userId: user.id,
    role,
    isManager: ['admin', 'office'].includes(role),
  }
  return { supabase, auth, error: null }
}

/** Managers (admin/office) only. */
async function requireManager() {
  const { supabase, auth, error } = await getAuth()
  if (error || !supabase || !auth) return { supabase: null, auth: null, error: error || 'Not authenticated' }
  if (!auth.isManager) return { supabase: null, auth: null, error: 'Not authorised' }
  return { supabase, auth, error: null }
}

/** Asset-manager profile ids (recipients when a check is manager-responsible). */
export async function getAssetManagerIds(): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('id').in('role', ['admin', 'office'])
  return (data ?? []).map((r) => r.id as string)
}

function revalidateAssets(urn?: string) {
  revalidatePath('/dashboard/assets')
  if (urn) revalidatePath(`/dashboard/assets/${urn}`)
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export interface AssetInput {
  id?: string
  name: string
  sage_reference?: string | null
  category_id?: string | null
  manufacturer?: string | null
  model?: string | null
  serial_number?: string | null
  description?: string | null
  value?: number | null
  purchase_date?: string | null
  assigned_to?: string | null
  storage_location?: string | null
  is_test_equipment?: boolean
}

export async function saveAsset(input: AssetInput): Promise<Result> {
  const { supabase, auth, error } = await requireManager()
  if (error || !supabase || !auth) return { ok: false, error: error! }

  if (!input.name?.trim()) return { ok: false, error: 'Name is required' }

  const payload = {
    name: input.name.trim(),
    sage_reference: input.sage_reference?.trim() || null,
    category_id: input.category_id || null,
    manufacturer: input.manufacturer?.trim() || null,
    model: input.model?.trim() || null,
    serial_number: input.serial_number?.trim() || null,
    description: input.description?.trim() || null,
    value: input.value ?? null,
    purchase_date: input.purchase_date || null,
    assigned_to: input.assigned_to || null,
    storage_location: input.storage_location?.trim() || null,
    is_test_equipment: Boolean(input.is_test_equipment),
    updated_at: new Date().toISOString(),
  }

  if (input.id) {
    // Detect a holder change so we can log an assignment row.
    const { data: existing } = await supabase
      .from('assets')
      .select('assigned_to, storage_location, urn')
      .eq('id', input.id)
      .single()

    const { error: upErr } = await supabase.from('assets').update(payload).eq('id', input.id)
    if (upErr) return { ok: false, error: upErr.message }

    const prevHolder = (existing as { assigned_to?: string | null } | null)?.assigned_to ?? null
    if (prevHolder !== payload.assigned_to) {
      await logAssignment(input.id, payload.assigned_to, payload.storage_location, auth.userId, null, null)
    }
    revalidateAssets((existing as { urn?: string } | null)?.urn)
    return { ok: true, id: input.id, urn: (existing as { urn?: string } | null)?.urn }
  }

  // Create: generate a unique urn (retry on the rare collision).
  let urn = generateAssetUrn()
  for (let i = 0; i < 5; i++) {
    const { data: clash } = await supabase.from('assets').select('id').eq('urn', urn).maybeSingle()
    if (!clash) break
    urn = generateAssetUrn()
  }

  const { data: created, error: insErr } = await supabase
    .from('assets')
    .insert({ ...payload, urn })
    .select('id, urn')
    .single()
  if (insErr || !created) return { ok: false, error: insErr?.message || 'Failed to create asset' }

  // Log the initial assignment / storage placement.
  await logAssignment(created.id, payload.assigned_to, payload.storage_location, auth.userId, null, null)

  revalidateAssets(created.urn)
  return { ok: true, id: created.id, urn: created.urn }
}

/** Insert an assignment-history row and close the previous open one. */
async function logAssignment(
  assetId: string,
  assignedTo: string | null,
  storageLocation: string | null,
  assignedBy: string,
  transferCheckId: string | null,
  notes: string | null,
) {
  const admin = createAdminClient()
  // Close any currently-open assignment for this asset.
  await admin
    .from('asset_assignments')
    .update({ returned_at: new Date().toISOString() })
    .eq('asset_id', assetId)
    .is('returned_at', null)

  await admin.from('asset_assignments').insert({
    asset_id: assetId,
    assigned_to: assignedTo,
    storage_location: storageLocation,
    assigned_by: assignedBy,
    transfer_check_id: transferCheckId,
    notes,
  })
}

export interface TransferInput {
  assetId: string
  toHolderId?: string | null
  storageLocation?: string | null
  notes?: string | null
  // Optional one-off inspection captured at handover.
  inspection?: {
    result: AssetCheckResult
    notes?: string | null
    certificateUrl?: string | null
  } | null
}

export async function transferAsset(input: TransferInput): Promise<Result> {
  const { supabase, auth, error } = await requireManager()
  if (error || !supabase || !auth) return { ok: false, error: error! }

  const { data: asset } = await supabase
    .from('assets')
    .select('id, urn, status')
    .eq('id', input.assetId)
    .single()
  if (!asset) return { ok: false, error: 'Asset not found' }
  if ((asset as { status: string }).status === 'disposed') {
    return { ok: false, error: 'Cannot transfer a disposed asset' }
  }

  const toHolder = input.toHolderId || null
  const storage = toHolder ? null : input.storageLocation?.trim() || null

  // Optional one-off transfer inspection (schedule_id stays null).
  let transferCheckId: string | null = null
  if (input.inspection) {
    const admin = createAdminClient()
    const { data: chk } = await admin
      .from('asset_checks')
      .insert({
        asset_id: input.assetId,
        schedule_id: null,
        check_date: todayIso(),
        performed_by: auth.userId,
        result: input.inspection.result,
        is_transfer_inspection: true,
        notes: input.inspection.notes?.trim() || null,
        certificate_url: input.inspection.certificateUrl || null,
      })
      .select('id')
      .single()
    transferCheckId = (chk as { id?: string } | null)?.id ?? null
  }

  const { error: upErr } = await supabase
    .from('assets')
    .update({ assigned_to: toHolder, storage_location: storage, updated_at: new Date().toISOString() })
    .eq('id', input.assetId)
  if (upErr) return { ok: false, error: upErr.message }

  await logAssignment(input.assetId, toHolder, storage, auth.userId, transferCheckId, input.notes?.trim() || null)

  // Notify the new holder that an asset was assigned to them.
  if (toHolder && toHolder !== auth.userId) {
    await notifyUsers({
      userIds: [toHolder],
      title: 'Asset assigned to you',
      body: 'An asset has been transferred into your care. Review its check schedule.',
      url: `/dashboard/assets/${(asset as { urn: string }).urn}`,
      category: 'asset',
      createdBy: auth.userId,
    })
  }

  revalidateAssets((asset as { urn: string }).urn)
  return { ok: true, id: input.assetId, urn: (asset as { urn: string }).urn }
}

export async function disposeAsset(input: {
  assetId: string
  reason?: string | null
  disposalValue?: number | null
}): Promise<Result> {
  const { supabase, auth, error } = await requireManager()
  if (error || !supabase || !auth) return { ok: false, error: error! }

  const { data: asset } = await supabase
    .from('assets')
    .select('urn')
    .eq('id', input.assetId)
    .single()

  const { error: upErr } = await supabase
    .from('assets')
    .update({
      status: 'disposed',
      assigned_to: null,
      storage_location: null,
      disposed_at: new Date().toISOString(),
      disposal_reason: input.reason?.trim() || null,
      disposal_value: input.disposalValue ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.assetId)
  if (upErr) return { ok: false, error: upErr.message }

  // Deactivate its schedules so it stops appearing in reminders.
  await supabase.from('asset_check_schedules').update({ active: false }).eq('asset_id', input.assetId)
  // Close open assignment.
  await logAssignment(input.assetId, null, null, auth.userId, null, 'Disposed')

  revalidateAssets((asset as { urn?: string } | null)?.urn)
  return { ok: true, id: input.assetId, urn: (asset as { urn?: string } | null)?.urn }
}

// ---------------------------------------------------------------------------
// Check schedules
// ---------------------------------------------------------------------------

export interface ScheduleInput {
  id?: string
  asset_id: string
  name: string
  check_type: AssetCheckType
  interval_months: number
  responsible: AssetCheckResponsible
  requires_certificate?: boolean
  // When creating, an optional starting due date; otherwise due immediately.
  next_due_date?: string | null
}

export async function saveSchedule(input: ScheduleInput): Promise<Result> {
  const { supabase, error } = await requireManager()
  if (error || !supabase) return { ok: false, error: error! }
  if (!input.name?.trim()) return { ok: false, error: 'Name is required' }

  const { data: asset } = await supabase.from('assets').select('urn').eq('id', input.asset_id).single()

  if (input.id) {
    const { error: upErr } = await supabase
      .from('asset_check_schedules')
      .update({
        name: input.name.trim(),
        check_type: input.check_type,
        interval_months: input.interval_months,
        responsible: input.responsible,
        requires_certificate: Boolean(input.requires_certificate),
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id)
    if (upErr) return { ok: false, error: upErr.message }
  } else {
    const { error: insErr } = await supabase.from('asset_check_schedules').insert({
      asset_id: input.asset_id,
      name: input.name.trim(),
      check_type: input.check_type,
      interval_months: input.interval_months,
      responsible: input.responsible,
      requires_certificate: Boolean(input.requires_certificate),
      // Not yet completed → due on the chosen date or today.
      next_due_date: input.next_due_date || todayIso(),
    })
    if (insErr) return { ok: false, error: insErr.message }
  }

  revalidateAssets((asset as { urn?: string } | null)?.urn)
  return { ok: true }
}

export async function deleteSchedule(scheduleId: string, urn?: string): Promise<Result> {
  const { supabase, error } = await requireManager()
  if (error || !supabase) return { ok: false, error: error! }
  const { error: delErr } = await supabase.from('asset_check_schedules').delete().eq('id', scheduleId)
  if (delErr) return { ok: false, error: delErr.message }
  revalidateAssets(urn)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Completing checks (managers, or the engineer holding the asset)
// ---------------------------------------------------------------------------

export interface CompleteCheckInput {
  scheduleId: string
  checkDate?: string | null
  result: AssetCheckResult
  notes?: string | null
  certificateUrl?: string | null
  // For calibration/test schedules, an explicit next calibration-due date.
  calibrationDueDate?: string | null
}

export async function completeCheck(input: CompleteCheckInput): Promise<Result> {
  const { supabase, auth, error } = await getAuth()
  if (error || !supabase || !auth) return { ok: false, error: error || 'Not authenticated' }

  // Load the schedule + its asset to verify permission and recompute next-due.
  const { data: schedule } = await supabase
    .from('asset_check_schedules')
    .select('id, asset_id, interval_months, asset:assets(id, urn, assigned_to)')
    .eq('id', input.scheduleId)
    .single()
  if (!schedule) return { ok: false, error: 'Schedule not found' }

  const rawAsset = (schedule as { asset?: unknown }).asset
  const asset = (Array.isArray(rawAsset) ? rawAsset[0] : rawAsset) as
    | { id: string; urn: string; assigned_to: string | null }
    | undefined
  const mayComplete = auth.isManager || (asset && asset.assigned_to === auth.userId)
  if (!mayComplete) return { ok: false, error: 'Not authorised to complete this check' }

  const checkDate = input.checkDate || todayIso()
  const admin = createAdminClient()

  // Insert the completed check.
  const { error: insErr } = await admin.from('asset_checks').insert({
    asset_id: (schedule as { asset_id: string }).asset_id,
    schedule_id: input.scheduleId,
    check_date: checkDate,
    performed_by: auth.userId,
    result: input.result,
    is_transfer_inspection: false,
    notes: input.notes?.trim() || null,
    certificate_url: input.certificateUrl || null,
    calibration_due_date: input.calibrationDueDate || null,
  })
  if (insErr) return { ok: false, error: insErr.message }

  // Recompute the cached next-due: an explicit calibration date wins, else
  // check_date + interval.
  const nextDue =
    input.calibrationDueDate ||
    addMonthsIso(checkDate, (schedule as { interval_months: number }).interval_months)

  await admin
    .from('asset_check_schedules')
    .update({ last_completed_date: checkDate, next_due_date: nextDue, updated_at: new Date().toISOString() })
    .eq('id', input.scheduleId)

  revalidateAssets(asset?.urn)
  return { ok: true, urn: asset?.urn }
}
