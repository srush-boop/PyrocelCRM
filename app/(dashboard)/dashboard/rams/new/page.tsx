import { redirect } from 'next/navigation'
import { getAuthContext } from '@/lib/auth'
import { RamsWizard } from '@/components/rams/rams-wizard'
import { loadWizardData } from '@/lib/rams/wizard-data'

export const dynamic = 'force-dynamic'

export default async function NewRamsPage() {
  const { user, profile } = await getAuthContext()
  if (!user || !profile) redirect('/auth/login')
  if (!['admin', 'office', 'engineer'].includes(profile.role)) redirect('/dashboard/rams')

  const { templates, hazards, systemHazards, equipmentLibrary, clients, sites } =
    await loadWizardData()

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">New RAMS</h1>
        <p className="text-sm text-muted-foreground">
          Build a Risk Assessment &amp; Method Statement step by step.
        </p>
      </div>
      <RamsWizard
        templates={templates}
        hazards={hazards}
        systemHazards={systemHazards}
        equipmentLibrary={equipmentLibrary}
        clients={clients}
        sites={sites}
      />
    </div>
  )
}
