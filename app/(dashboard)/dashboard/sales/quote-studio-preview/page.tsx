import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Profile } from '@/lib/types/database'
import { QuoteStudio, type StudioClient } from '@/components/dashboard/sales/quote-studio/quote-studio'
import { getStudioConfig, listStudioDisciplines } from '@/app/(dashboard)/dashboard/sales/quote-studio/actions'

export const metadata = { title: 'Quote Studio | Pyrocel' }

// Brief-first fire-alarm quoting flow: AI drafts understanding + device
// schedule, the designer confirms, the studio prices from the catalogue and
// generates a BS 5839-1 / BAFE spec, then saves a real quote. Office/admin only.
export default async function QuoteStudioPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'office'].includes((profile as Profile).role)) {
    redirect('/dashboard')
  }

  const [{ ok, config, error }, { data: clientRows }, disciplinesRes] = await Promise.all([
    getStudioConfig(),
    supabase
      .from('clients')
      .select('id, name, sites:sites(id, name)')
      .order('name'),
    listStudioDisciplines(),
  ])

  if (!ok || !config) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm">
          <p className="font-semibold text-destructive">Quote Studio is not configured yet.</p>
          <p className="mt-1 text-muted-foreground">
            {error ?? 'The Fire Alarm system type, device types or kit rules could not be loaded.'}
          </p>
        </div>
      </div>
    )
  }

  const clients: StudioClient[] = ((clientRows ?? []) as Array<{ id: string; name: string; sites: { id: string; name: string }[] | null }>).map(
    (c) => ({
      id: c.id,
      name: c.name,
      sites: (c.sites ?? []).map((s) => ({ id: s.id, name: s.name })),
    }),
  )

  return <QuoteStudio config={config} clients={clients} disciplines={disciplinesRes.disciplines ?? []} />
}
