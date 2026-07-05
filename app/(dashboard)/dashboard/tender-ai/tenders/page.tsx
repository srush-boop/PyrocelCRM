import type { Metadata } from 'next'
import { requireTenderAccess } from '@/lib/tender/access'
import { getTenders } from '@/lib/tender/data'
import { TendersList } from '@/components/dashboard/tender-ai/tenders-list'

export const metadata: Metadata = { title: 'Active Tenders | Tender AI' }

export default async function TendersPage() {
  await requireTenderAccess()
  const tenders = await getTenders()

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Active Tenders</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Create a tender, add its questions, and let the AI draft answers grounded in your
          company knowledge.
        </p>
      </div>
      <TendersList tenders={tenders} />
    </div>
  )
}
