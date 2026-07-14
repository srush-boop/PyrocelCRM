import { redirect } from 'next/navigation'
import { requireQueryToolsUser } from '@/lib/auth/query-tools'
import { QueryBuilderView } from '@/components/dashboard/query-builder/query-builder-view'

export const dynamic = 'force-dynamic'
// The query runner uses the `pg` package, which requires the Node.js runtime.
export const runtime = 'nodejs'

// Admin SQL Query Builder. Runs arbitrary SQL directly against Postgres,
// bypassing RLS — hard-gated to the owner and explicitly-granted users. Writes
// go through a rolled-back preview + typed confirmation before committing.
export default async function QueryBuilderPage() {
  const access = await requireQueryToolsUser()
  if (!access) redirect('/dashboard')

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Query builder</h1>
        <p className="text-muted-foreground text-pretty">
          Run SQL directly against the live database. Reads run immediately; anything that changes
          data is previewed inside a rolled-back transaction and must be confirmed before it
          commits. This bypasses all access rules — use with care.
        </p>
      </div>

      <QueryBuilderView />
    </div>
  )
}
