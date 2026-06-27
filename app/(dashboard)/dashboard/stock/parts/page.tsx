import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Profile } from '@/lib/types/database'
import { getParts } from '@/lib/stock'
import { PartsTable } from '@/components/dashboard/stock/parts-table'
import { AddPartDialog } from '@/components/dashboard/stock/add-part-dialog'

export default async function PartsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const profile = profileData as Profile | null
  // Only admin/office may manage the parts catalogue.
  if (!profile || (profile.role !== 'admin' && profile.role !== 'office')) {
    redirect('/dashboard/stock')
  }

  const parts = await getParts()

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/dashboard/stock">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to stock
          </Link>
        </Button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Parts Catalogue</h1>
            <p className="text-muted-foreground">
              Define the parts you hold, their unit cost and default minimum level
            </p>
          </div>
          <AddPartDialog />
        </div>
      </div>

      <PartsTable parts={parts} />
    </div>
  )
}
