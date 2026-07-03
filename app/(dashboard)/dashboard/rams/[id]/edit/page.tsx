import { notFound, redirect } from 'next/navigation'
import { getAuthContext } from '@/lib/auth'
import { RamsWizard } from '@/components/rams/rams-wizard'
import { loadWizardData } from '@/lib/rams/wizard-data'
import type { RamsDocument } from '@/lib/rams/types'

export const dynamic = 'force-dynamic'

export default async function EditRamsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { supabase, user, profile } = await getAuthContext()
  if (!user || !profile) redirect('/auth/login')
  if (!['admin', 'office', 'engineer'].includes(profile.role)) redirect('/dashboard/rams')

  const { data: doc } = await supabase
    .from('rams_documents')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!doc) notFound()

  // Only drafts (or rejected docs sent back for changes) may be edited in place.
  if (!['draft', 'rejected'].includes(doc.status)) {
    redirect(`/dashboard/rams/${id}`)
  }

  const { templates, hazards, systemHazards, clients, sites } = await loadWizardData()

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit {doc.rams_number}
        </h1>
        <p className="text-sm text-muted-foreground">Update this draft RAMS.</p>
      </div>
      <RamsWizard
        templates={templates}
        hazards={hazards}
        systemHazards={systemHazards}
        clients={clients}
        sites={sites}
        existing={doc as RamsDocument}
      />
    </div>
  )
}
