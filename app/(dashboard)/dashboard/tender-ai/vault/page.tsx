import type { Metadata } from 'next'
import { requireTenderAccess } from '@/lib/tender/access'
import { getVaultEntries } from '@/lib/tender/data'
import { TenderVault } from '@/components/dashboard/tender-ai/tender-vault'

export const metadata: Metadata = { title: 'Tender Vault | Tender AI' }

export default async function TenderVaultPage() {
  await requireTenderAccess()
  const entries = await getVaultEntries()

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tender Vault</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Upload completed tenders, mark whether they were successful, and capture client feedback.
          Their summaries and feedback are indexed so the AI can learn from past wins and losses when
          assessing new bids.
        </p>
      </div>

      <TenderVault entries={entries} />
    </div>
  )
}
