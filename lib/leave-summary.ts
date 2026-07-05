import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Determines whether the current user may view the diary summary (Accounts dept
// members and admins only). Returns the profile when allowed, else null.
export async function getSummaryViewer(): Promise<{ allowed: boolean; userId: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { allowed: false, userId: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, department:departments(name)')
    .eq('id', user.id)
    .single()

  const dept = (profile as { department: { name: string | null } | null } | null)?.department
  const role = (profile as { role: string } | null)?.role
  const allowed = role === 'admin' || (dept?.name ?? '').toLowerCase() === 'accounts'
  return { allowed, userId: user.id }
}

export interface SummaryFilters {
  from?: string
  to?: string
  entryTypeIds?: string[]
  departmentIds?: string[]
  branchIds?: string[]
  userIds?: string[]
}

export interface SummaryEntry {
  id: string
  entryTypeName: string | null
  entryTypeColor: string | null
  userName: string
  departmentName: string | null
  branchName: string | null
  startAt: string
  endAt: string
  allDay: boolean
  approvalStatus: 'requested' | 'approved' | 'rejected' | null
  notes: string | null
}

// Options used to populate the summary's filter dropdowns.
export interface SummaryFilterOptions {
  entryTypes: { id: string; name: string }[]
  departments: { id: string; name: string }[]
  branches: { id: string; name: string }[]
  users: { id: string; name: string }[]
}

interface SummaryQueryRow {
  id: string
  start_at: string
  end_at: string
  all_day: boolean
  notes: string | null
  approval_status: 'requested' | 'approved' | 'rejected' | null
  entry_type: { id: string; name: string | null; color: string | null } | null
  user: {
    id: string
    full_name: string | null
    department_id: string | null
    branch_id: string | null
    department: { name: string | null } | null
    branch: { name: string | null } | null
  } | null
}

// Loads the filter dropdown options (admin client — summary viewers are trusted
// staff who legitimately see all departments/branches/users).
export async function getSummaryFilterOptions(): Promise<SummaryFilterOptions> {
  const admin = createAdminClient()
  const [{ data: entryTypes }, { data: departments }, { data: branches }, { data: users }] =
    await Promise.all([
      admin.from('calendar_entry_types').select('id, name').order('name'),
      admin.from('departments').select('id, name').order('name'),
      admin.from('branches').select('id, name').order('name'),
      admin.from('profiles').select('id, full_name').neq('role', 'client').order('full_name'),
    ])

  return {
    entryTypes: (entryTypes ?? []).map((t) => ({ id: t.id as string, name: (t.name as string) ?? '' })),
    departments: (departments ?? []).map((d) => ({ id: d.id as string, name: (d.name as string) ?? '' })),
    branches: (branches ?? []).map((b) => ({ id: b.id as string, name: (b.name as string) ?? '' })),
    users: (users ?? []).map((u) => ({ id: u.id as string, name: (u.full_name as string) ?? 'Unknown' })),
  }
}

// Fetches diary entries matching the given filters for the summary view. Uses
// the admin client so accounts/admins get a complete cross-team picture.
// Department and branch are filtered in-app because they live on the related
// profile rather than the entry itself.
export async function getSummaryEntries(filters: SummaryFilters): Promise<SummaryEntry[]> {
  const admin = createAdminClient()

  let query = admin
    .from('calendar_entries')
    .select(
      `id, start_at, end_at, all_day, notes, approval_status,
       entry_type:calendar_entry_types(id, name, color),
       user:profiles!calendar_entries_user_id_fkey(
         id, full_name, department_id, branch_id,
         department:departments(name),
         branch:branches(name)
       )`,
    )
    .order('start_at', { ascending: false })
    .limit(500)

  if (filters.from) query = query.gte('start_at', `${filters.from}T00:00:00.000Z`)
  if (filters.to) query = query.lte('start_at', `${filters.to}T23:59:59.999Z`)
  if (filters.entryTypeIds?.length) query = query.in('entry_type_id', filters.entryTypeIds)
  if (filters.userIds?.length) query = query.in('user_id', filters.userIds)

  const { data } = await query
  const rows = (data as SummaryQueryRow[] | null) ?? []

  const deptSet = filters.departmentIds?.length ? new Set(filters.departmentIds) : null
  const branchSet = filters.branchIds?.length ? new Set(filters.branchIds) : null

  return rows
    .filter((r) => {
      if (deptSet && !(r.user?.department_id && deptSet.has(r.user.department_id))) return false
      if (branchSet && !(r.user?.branch_id && branchSet.has(r.user.branch_id))) return false
      return true
    })
    .map((r) => ({
      id: r.id,
      entryTypeName: r.entry_type?.name ?? null,
      entryTypeColor: r.entry_type?.color ?? null,
      userName: r.user?.full_name ?? 'Unknown',
      departmentName: r.user?.department?.name ?? null,
      branchName: r.user?.branch?.name ?? null,
      startAt: r.start_at,
      endAt: r.end_at,
      allDay: r.all_day,
      approvalStatus: r.approval_status,
      notes: r.notes,
    }))
}
