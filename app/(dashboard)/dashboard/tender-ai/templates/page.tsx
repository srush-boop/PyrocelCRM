import type { Metadata } from 'next'
import { LayoutList } from 'lucide-react'
import { requireTenderAccess } from '@/lib/tender/access'
import { ComingSoon } from '@/components/dashboard/tender-ai/coming-soon'

export const metadata: Metadata = { title: 'Templates | Tender AI' }

export default async function TemplatesPage() {
  await requireTenderAccess()

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Reusable document templates for common tender formats.
        </p>
      </div>
      <ComingSoon
        icon={LayoutList}
        title="Tender templates"
        description="Build standardised response templates that pre-fill with your company knowledge and winning answers."
        bullets={[
          'Method statement and quality plan templates',
          'Health & safety and environmental templates',
          'Auto-populate from the Knowledge Centre',
        ]}
      />
    </div>
  )
}
