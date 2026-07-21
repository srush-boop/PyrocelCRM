import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsContent } from '@/components/dashboard/settings/settings-content'
import type { Profile, CompanyInfo, Branch, Department, Role, PropertyType, DocumentTemplate, InternalTaskTemplate } from '@/lib/types/database'
import { getGlobalConfigs } from '@/lib/actions/global-config'
import { getLoneWorkerAdminData } from '@/app/(dashboard)/dashboard/lone-worker/actions'
import { getRateCards } from '@/lib/actions/rate-cards'
import { getChargeTemplates } from '@/lib/actions/charge-templates'
import { getNominalCodes } from '@/lib/actions/nominal-codes'
import { listTagsWithUsage } from '@/lib/actions/document-tags'
import { OPENING_HOURS_KEY, parseOpeningHours } from '@/lib/oncall/opening-hours'
import { mfaRequiredForRole } from '@/lib/auth/mfa'

export default async function SettingsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, role_ref:roles(*)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/auth/login')

  const role = (profile as Profile).role
  const isAdmin = role === 'admin'
  // Document templates (mail-merge letters) are managed by office/admin.
  const canManageTemplates = role === 'admin' || role === 'office'

  // Company info, branches, departments + roles are only needed for admin tabs.
  const [companyResult, branchesResult, departmentsResult, rolesResult, propertyTypesResult] = isAdmin
    ? await Promise.all([
        supabase.from('company_info').select('*').limit(1).maybeSingle(),
        supabase.from('branches').select('*').order('name'),
        supabase.from('departments').select('*').order('name'),
        supabase.from('roles').select('*').order('name'),
        supabase.from('property_types').select('*').order('name'),
      ])
    : [{ data: null }, { data: [] }, { data: [] }, { data: [] }, { data: [] }]

  const templatesResult = canManageTemplates
    ? await supabase.from('document_templates').select('*').order('name')
    : { data: [] }

  // Rate cards (call-out + labour pricing) are managed by office/admin.
  const canManageRates = role === 'admin' || role === 'office'
  const rateCards = canManageRates ? await getRateCards() : []
  const chargeTemplates = canManageRates ? await getChargeTemplates() : []
  // Nominal codes power the Settings tab AND the department/service-type mappings.
  const nominalCodes = canManageRates ? await getNominalCodes() : []

  // Document tags (shared vocabulary) are managed by office/admin.
  const documentTags = canManageTemplates ? await listTagsWithUsage() : []

  // Internal Tasks (Quality) manager tab — managed by office/admin. Needs the
  // full template list plus the department/role/user lists for the "Applies to"
  // targeting. Departments/roles are already fetched for admins above; office
  // needs them here too, so fetch on demand when they weren't already loaded.
  const canManageInternalTasks = role === 'admin' || role === 'office'
  let internalTaskTemplates: InternalTaskTemplate[] = []
  let internalTaskUsers: Pick<Profile, 'id' | 'full_name' | 'role'>[] = []
  let internalTaskDepartments = (departmentsResult.data as Department[]) || []
  let internalTaskRoles = (rolesResult.data as Role[]) || []
  let internalTaskDocuments: { id: string; name: string }[] = []
  if (canManageInternalTasks) {
    const [tplRes, usersRes, docsRes] = await Promise.all([
      supabase
        .from('internal_task_templates')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('status', 'active')
        .order('full_name', { ascending: true }),
      // Company-wide reference documents that can be linked from a task form.
      supabase
        .from('documents')
        .select('id, name')
        .eq('owner_type', 'system_reference')
        .order('name', { ascending: true }),
    ])
    internalTaskTemplates = (tplRes.data as InternalTaskTemplate[]) || []
    internalTaskUsers =
      (usersRes.data as Pick<Profile, 'id' | 'full_name' | 'role'>[]) || []
    internalTaskDocuments = (docsRes.data as { id: string; name: string }[]) || []
    // Office isn't an admin, so departments/roles weren't loaded above.
    if (!isAdmin) {
      const [deptRes, rolesRes] = await Promise.all([
        supabase.from('departments').select('*').order('name'),
        supabase.from('roles').select('*').order('name'),
      ])
      internalTaskDepartments = (deptRes.data as Department[]) || []
      internalTaskRoles = (rolesRes.data as Role[]) || []
    }
  }

  const globalConfig = isAdmin
    ? await getGlobalConfigs([
        'po_request_overdue_days',
        'deadline_failed_reasons',
        'engagement_stats_enabled',
        OPENING_HOURS_KEY,
      ])
    : {}

  const poOverdueDays = (globalConfig['po_request_overdue_days'] as number | null) ?? 14
  const deadlineReasons = (globalConfig['deadline_failed_reasons'] as string[] | null) ?? []
  // Encouragement stats default to ON when the key has never been set.
  const engagementStatsEnabled =
    (globalConfig['engagement_stats_enabled'] as boolean | null) ?? true
  // Company opening hours (defaults preserve the historical 08:30-17:00 window).
  const openingHours = parseOpeningHours(globalConfig[OPENING_HOURS_KEY])

  // Lone worker admin tab: available to admins and nominated managers.
  const canManageLoneWorker = isAdmin || (profile as Profile).can_manage_lone_worker === true
  const loneWorkerData = canManageLoneWorker
    ? await getLoneWorkerAdminData()
    : { users: [], timings: { checkinMinutes: 60, amberMinutes: 5, redMinutes: 5, soundEnabled: true } }

  // MFA factors for the Security tab.
  const { data: factorsData } = await supabase.auth.mfa.listFactors()
  const mfaFactors = (factorsData?.totp ?? [])
    .filter((f) => f.status === 'verified')
    .map((f) => ({
      id: f.id,
      friendlyName: f.friendly_name ?? null,
      createdAt: f.created_at,
    }))
  const mfaRequired = mfaRequiredForRole(role)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and preferences
        </p>
      </div>

      <SettingsContent
        user={user}
        profile={profile as Profile}
        company={(companyResult.data as CompanyInfo) || null}
        branches={(branchesResult.data as Branch[]) || []}
        departments={(departmentsResult.data as Department[]) || []}
        roles={(rolesResult.data as Role[]) || []}
        propertyTypes={(propertyTypesResult.data as PropertyType[]) || []}
        documentTemplates={(templatesResult.data as DocumentTemplate[]) || []}
        poOverdueDays={poOverdueDays}
        deadlineReasons={deadlineReasons}
        engagementStatsEnabled={engagementStatsEnabled}
        canManageLoneWorker={canManageLoneWorker}
        loneWorkerUsers={loneWorkerData.users}
        loneWorkerTimings={loneWorkerData.timings}
        canManageRates={canManageRates}
        rateCards={rateCards}
        chargeTemplates={chargeTemplates}
        nominalCodes={nominalCodes}
        canManageTags={canManageTemplates}
        documentTags={documentTags}
        openingHours={openingHours}
        canManageInternalTasks={canManageInternalTasks}
        internalTaskTemplates={internalTaskTemplates}
        internalTaskUsers={internalTaskUsers}
        internalTaskDepartments={internalTaskDepartments}
        internalTaskRoles={internalTaskRoles}
        mfaFactors={mfaFactors}
        mfaRequired={mfaRequired}
      />
    </div>
  )
}
