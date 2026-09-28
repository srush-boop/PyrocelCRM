import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getAuthContext } from '@/lib/auth'
import { loadLibraryData } from '@/lib/rams/library-actions'
import { LibraryAdmin } from '@/components/rams/library-admin'

export const dynamic = 'force-dynamic'

export default async function RamsLibraryPage() {
  const { user, profile } = await getAuthContext()
  if (!user || !profile) redirect('/auth/login')
  if (profile.role !== 'admin' && profile.role !== 'office') redirect('/dashboard/rams')

  const data = await loadLibraryData()

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/dashboard/rams"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to RAMS
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">RAMS Library</h1>
        <p className="text-sm text-muted-foreground">
          Manage the hazards, system and activity types, method statements and scopes of works the
          RAMS wizard draws on.
        </p>
      </div>
      <LibraryAdmin data={data} />
    </div>
  )
}
