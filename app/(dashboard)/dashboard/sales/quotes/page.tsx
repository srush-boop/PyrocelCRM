import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { QuotesTable } from '@/components/dashboard/sales/quotes-table'
import { BranchFilter } from '@/components/dashboard/branch-filter'
import { getBranchScope } from '@/lib/branches'
import { getSavedGridViews, getSharedGridViews } from '@/lib/actions/grid-views'
import type { Profile, Quote } from '@/lib/types/database'

export const metadata = {
  title: 'Quotes | Pyrocel',
  description: 'Create and manage quotes across the fire & security portfolio.',
}

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const { branch } = await searchParams
  const scope = await getBranchScope(profile as Profile, branch)

  const { data: rawQuotes } = await supabase
    .from('quotes')
    .select(
      '*, client:clients(id, name), site:sites(id, name, branch_id), preparer:profiles!quotes_created_by_fkey(id, full_name)',
    )
    .order('created_at', { ascending: false })

  // Scope by the quote's site branch when a branch is active.
  const quotes = scope.activeBranchId
    ? ((rawQuotes ?? []) as Quote[]).filter(
        (q) => (q.site as { branch_id?: string | null } | null)?.branch_id === scope.activeBranchId,
      )
    : ((rawQuotes ?? []) as Quote[])

  // Count unread client queries per quote for the "new questions" row badge.
  const { data: unreadRows } = await supabase
    .from('quote_messages')
    .select('quote_id')
    .eq('author_type', 'client')
    .is('read_at', null)
  const unreadQueries = ((unreadRows ?? []) as Array<{ quote_id: string }>).reduce<
    Record<string, number>
  >((acc, row) => {
    acc[row.quote_id] = (acc[row.quote_id] ?? 0) + 1
    return acc
  }, {})

  const [savedViews, sharedViews] = await Promise.all([
    getSavedGridViews('quotes'),
    getSharedGridViews('quotes'),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 no-print sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Quotes</h1>
          <p className="text-muted-foreground">
            Quote supply, installation, commissioning, remedial work and service contracts.
          </p>
        </div>
        <BranchFilter branches={scope.branches} activeBranchId={scope.activeBranchId} />
      </div>

      <QuotesTable
        quotes={quotes}
        unreadQueries={unreadQueries}
        savedViews={savedViews}
        sharedViews={sharedViews}
        currentUserId={user.id}
      />
    </div>
  )
}
