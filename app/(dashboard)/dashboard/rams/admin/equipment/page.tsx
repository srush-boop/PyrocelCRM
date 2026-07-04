import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getAuthContext } from '@/lib/auth'
import { loadEquipmentAdminData } from '@/lib/rams/equipment-actions'
import { EquipmentAdmin } from '@/components/rams/equipment-admin'

export const dynamic = 'force-dynamic'

export default async function EquipmentAdminPage() {
  const { user, profile } = await getAuthContext()
  if (!user || !profile) redirect('/auth/login')
  // Only approvers (admin/office) manage reference data.
  if (profile.role !== 'admin' && profile.role !== 'office') {
    redirect('/dashboard/rams')
  }

  const { equipment, systemTemplates } = await loadEquipmentAdminData()

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
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          Equipment Management
        </h1>
        <p className="text-sm text-muted-foreground">
          Maintain the equipment library and the default equipment auto-imported
          for each system type.
        </p>
      </div>
      <EquipmentAdmin equipment={equipment} systemTemplates={systemTemplates} />
    </div>
  )
}
