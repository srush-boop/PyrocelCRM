import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsContent } from '@/components/dashboard/settings/settings-content'
import type { Profile, CompanyInfo, Branch, Department, Role, PropertyType, DocumentTemplate } from '@/lib/types/database'
import { getGlobalConfigs } from '@/lib/actions/global-config'
import { getLoneWorkerAdminData } from '@/app/(dashboard)/dashboard/lone-worker/actions'
import { getRateCards } from '@/lib/actions/rate-cards'
import { listTagsWithUsage } from '@/lib/actions/document-tags'
import { OPENING_HOURS_KEY, parseOpeningHours } from '@/lib/oncall/opening-hours'

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

  // Document tags (shared vocabulary) are managed by office/admin.
  const documentTags = canManageTemplates ? await listTagsWithUsage() : []

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
        canManageTags={canManageTemplates}
        documentTags={documentTags}
        openingHours={openingHours}
      />
    </div>
  )
}
