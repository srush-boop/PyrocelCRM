import { redirect } from 'next/navigation'
import { getAuthContext } from '@/lib/auth'
import { QuoteSectionsManager } from '@/components/dashboard/sales/quote-sections-manager'
import type { Profile, SystemType } from '@/lib/types/database'

export const metadata = { title: 'Quote Sections | Pyrocel' }

export default async function QuoteSectionsPage() {
  const { supabase, user, profile } = await getAuthContext()
  if (!user) redirect('/auth/login')
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const { data: systemTypes } = await supabase
    .from('system_types')
    .select('*')
    .eq('active', true)
    .order('name')

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Quote Sections</h1>
        <p className="text-muted-foreground text-pretty">
          Configure the sections and fields that appear on a quote for each system type and type of
          work. Add elements like text boxes, dropdowns and tables, choose their order, set sections
          to start collapsed, and show or hide a section based on another field&apos;s answer.
        </p>
      </div>
      <QuoteSectionsManager systemTypes={(systemTypes ?? []) as SystemType[]} />
    </div>
  )
}
