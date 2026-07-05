import { requireTenderAccess } from '@/lib/tender/access'
import { getKnowledgeItems } from '@/lib/tender/data'
import { KnowledgeCentre } from '@/components/dashboard/tender-ai/knowledge-centre'

export default async function KnowledgePage() {
  await requireTenderAccess()
  const items = await getKnowledgeItems()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Knowledge Centre</h1>
        <p className="text-muted-foreground">
          The single source of truth the AI draws on to answer tenders. Mark items as
          critical to have them included in every answer.
        </p>
      </div>
      <KnowledgeCentre items={items} />
    </div>
  )
}
