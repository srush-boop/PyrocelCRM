import type { Metadata } from 'next'
import { requireTenderAccess } from '@/lib/tender/access'
import { getEvidence } from '@/lib/tender/data'
import { EvidenceLibrary } from '@/components/dashboard/tender-ai/evidence-library'

export const metadata: Metadata = { title: 'Evidence Library | Tender AI' }

export default async function EvidencePage() {
  await requireTenderAccess()
  const evidence = await getEvidence()

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Evidence Library</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Store certificates, accreditations and sample documents. The AI recommends relevant
          evidence to attach to each tender answer.
        </p>
      </div>
      <EvidenceLibrary evidence={evidence} />
    </div>
  )
}
