import { redirect } from 'next/navigation'
import {
  getSummaryViewer,
  getSummaryFilterOptions,
  getSummaryEntries,
} from '@/lib/leave-summary'
import { LeaveSummary } from '@/components/dashboard/leave-summary/leave-summary'

// Parses a comma-separated query param into a string array.
function parseList(value: string | string[] | undefined): string[] {
  if (!value) return []
  const raw = Array.isArray(value) ? value.join(',') : value
  return raw.split(',').filter(Boolean)
}

export default async function LeaveSummaryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { allowed } = await getSummaryViewer()
  if (!allowed) redirect('/dashboard')

  const sp = await searchParams
  const from = typeof sp.from === 'string' ? sp.from : undefined
  const to = typeof sp.to === 'string' ? sp.to : undefined
  const entryTypeIds = parseList(sp.types)
  const departmentIds = parseList(sp.depts)
  const branchIds = parseList(sp.branches)
  const userIds = parseList(sp.users)

  const [options, entries] = await Promise.all([
    getSummaryFilterOptions(),
    getSummaryEntries({ from, to, entryTypeIds, departmentIds, branchIds, userIds }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Leave Summary</h1>
        <p className="text-muted-foreground">
          Diary-entry overview across the business, filterable by type, team, branch and person
        </p>
      </div>
      <LeaveSummary
        entries={entries}
        options={options}
        initial={{ from, to, entryTypeIds, departmentIds, branchIds, userIds }}
      />
    </div>
  )
}
