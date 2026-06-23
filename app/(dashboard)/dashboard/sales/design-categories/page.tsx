import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DesignCategoriesManager } from '@/components/dashboard/sales/design-categories-manager'
import type { Profile, QuoteDesignCategory } from '@/lib/types/database'

export const metadata = { title: 'Design Categories | Pyrocel' }

export default async function DesignCategoriesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const { data: categories } = await supabase
    .from('quote_design_categories')
    .select('*')
    .order('name')

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Design Categories</h1>
        <p className="text-muted-foreground">
          Manage design categories and their overview text. Selecting a category on a quote system
          imports its overview, which can then be edited per quote.
        </p>
      </div>
      <DesignCategoriesManager categories={(categories ?? []) as QuoteDesignCategory[]} />
    </div>
  )
}
