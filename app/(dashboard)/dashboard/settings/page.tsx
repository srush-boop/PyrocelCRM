import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsContent } from '@/components/dashboard/settings/settings-content'
import type { Profile, CompanyInfo, Branch, Department, Role, PropertyType, DocumentTemplate } from '@/lib/types/database'

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
      />
    </div>
  )
}
