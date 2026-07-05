import type { Metadata } from 'next'
import { FileText } from 'lucide-react'
import { requireTenderAccess } from '@/lib/tender/access'
import { ComingSoon } from '@/components/dashboard/tender-ai/coming-soon'

export const metadata: Metadata = { title: 'Requested Documents | Tender AI' }

export default async function RequestedDocumentsPage() {
  await requireTenderAccess()

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Requested Documents</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Track the documents each tender asks you to provide.
        </p>
      </div>
      <ComingSoon
        icon={FileText}
        title="Document checklists"
        description="Capture every document a tender requires and tick them off as you attach evidence from your library."
        bullets={[
          'Per-tender document checklists',
          'Link requested items to Evidence Library entries',
          'Completion progress and outstanding items',
        ]}
      />
    </div>
  )
}
