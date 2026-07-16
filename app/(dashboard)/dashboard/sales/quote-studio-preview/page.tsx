import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Profile } from '@/lib/types/database'
import { QuoteStudio } from '@/components/dashboard/sales/quote-studio/quote-studio'

export const metadata = { title: 'Quote Studio (Preview) | Pyrocel' }

// Clickable PROTOTYPE of a proposed brief-first quoting flow. Mock data only —
// nothing here reads or writes the database. Restricted to office/admin so it
// isn't stumbled upon by engineers.
export default async function QuoteStudioPreviewPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  return <QuoteStudio />
}
