import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Profile } from '@/lib/types/database'
import {
  listRota,
  listShifts,
  listCoverRequests,
  listChangeLog,
  getOncallSummary,
  getOncallRates,
  getBranches,
  getExternalToken,
} from '@/lib/oncall/queries'
import { OncallIndex } from '@/components/dashboard/oncall/oncall-index'

export const metadata = {
  title: 'On-call rota',
  description: 'Out-of-hours emergency on-call rota, cover requests and swaps',
}

/** Month range (yyyy-mm-dd) for a given year/month (0-based month). */
function monthRange(year: number, month: number) {
  const from = new Date(year, month, 1)
  const to = new Date(year, month + 1, 0)
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { fromISO: iso(from), toISO: iso(to) }
}

export default async function OncallPage(props: {
  searchParams: Promise<{ month?: string; branch?: string }>
}) {
  const searchParams = await props.searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profileData } = await supabase
    .from('profiles')
    .select('id, role, full_name, branch_id')
    .eq('id', user.id)
    .single()
  const profile = profileData as (Pick<Profile, 'id' | 'role' | 'full_name'> & { branch_id: string | null }) | null
  if (!profile || profile.role === 'client') redirect('/dashboard')

  const isManager = ['admin', 'office'].includes(profile.role)

  // Resolve the visible month (default current) and range.
  const now = new Date()
  const monthParam = searchParams.month // format yyyy-mm
  let year = now.getFullYear()
  let month = now.getMonth()
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split('-').map(Number)
    year = y
    month = m - 1
  }
  const { fromISO, toISO } = monthRange(year, month)

  const [branches, rota, shifts, coverRequests, changeLog, summary, rates, engineersData] =
    await Promise.all([
      getBranches(),
      listRota(),
      listShifts(fromISO, toISO),
      listCoverRequests({ includeMessages: true }),
      listChangeLog(undefined, 100),
      getOncallSummary(fromISO, toISO),
      getOncallRates(),
      supabase
        .from('profiles')
        .select('id, full_name, branch_id, phone')
        .eq('role', 'engineer')
        .eq('status', 'active')
        .order('full_name'),
    ])

  const engineers = (engineersData.data ?? []) as {
    id: string
    full_name: string | null
    branch_id: string | null
    phone: string | null
  }[]

  // Only managers manage the external call-handler link, so only fetch it then.
  const externalToken = isManager ? await getExternalToken() : null

  return (
    <OncallIndex
      isManager={isManager}
      currentUserId={user.id}
      currentUserBranchId={profile.branch_id}
      month={`${year}-${String(month + 1).padStart(2, '0')}`}
      branches={branches}
      rota={rota}
      shifts={shifts}
      coverRequests={coverRequests}
      changeLog={changeLog}
      summary={summary}
      rates={rates}
      engineers={engineers}
      externalToken={externalToken}
    />
  )
}
