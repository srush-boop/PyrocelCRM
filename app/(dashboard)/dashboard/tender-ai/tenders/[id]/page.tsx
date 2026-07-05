import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireTenderAccess } from '@/lib/tender/access'
import { getTender, getTenderQuestions } from '@/lib/tender/data'
import { TenderWorkspace } from '@/components/dashboard/tender-ai/tender-workspace'

export const metadata: Metadata = { title: 'Tender | Tender AI' }

export default async function TenderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireTenderAccess()
  const { id } = await params
  const tender = await getTender(id)
  if (!tender) notFound()
  const questions = await getTenderQuestions(id)

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/dashboard/tender-ai/tenders"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          All tenders
        </Link>
      </div>
      <TenderWorkspace tender={tender} initialQuestions={questions} />
    </div>
  )
}
