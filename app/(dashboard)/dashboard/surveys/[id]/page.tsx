import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types/database'
import { getSurveyResults } from '@/lib/actions/surveys'
import { SurveyResultsView } from '@/components/dashboard/surveys/survey-results-view'

export const dynamic = 'force-dynamic'

export default async function SurveyResultsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  // Surveys are an admin-only feature.
  if ((profile as Pick<Profile, 'role'> | null)?.role !== 'admin') {
    redirect('/dashboard')
  }

  const res = await getSurveyResults(id)
  if (!res.ok || !res.template || !res.summary) {
    redirect('/dashboard/settings?tab=tasks')
  }

  return (
    <SurveyResultsView
      template={res.template}
      summary={res.summary}
      outstanding={res.outstanding}
    />
  )
}
