import { notFound } from 'next/navigation'
import { QuoteDocument } from '@/components/dashboard/sales/quote-document'
import { PublicQuoteApproval } from '@/components/portal/public-quote-approval'
import { PublicQuoteOptions } from '@/components/portal/public-quote-options'
import { PublicQuoteQueries } from '@/components/portal/public-quote-queries'
import { getPublicQuote } from './actions'
import type {
  Quote,
  QuoteSystem,
  QuoteLineItem,
  CompanyInfo,
  QuoteRequirement,
  QuoteMessage,
} from '@/lib/types/database'
import type { SpecCatalogueItem } from '@/lib/sales/equipment-spec'

export const metadata = {
  title: 'Your Quote',
  robots: { index: false, follow: false },
}

export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const data = await getPublicQuote(token)
  if (!data) notFound()

  const quote = data.quote as Quote
  const systems = data.systems as QuoteSystem[]
  const lines = data.lines as QuoteLineItem[]
  const company = data.company as CompanyInfo | null
  const requirements = data.requirements as QuoteRequirement[]
  const catalogue = data.catalogue as SpecCatalogueItem[]
  const messages = data.messages as QuoteMessage[]

  return (
    <main className="min-h-screen bg-muted/40 py-8">
      <div className="mx-auto max-w-4xl px-4">
        <QuoteDocument
          quote={quote}
          systems={systems}
          lines={lines}
          company={company}
          requirements={requirements}
          catalogue={catalogue}
        />
        <div className="mt-6 print:hidden">
          <PublicQuoteOptions quote={quote} systems={systems} lines={lines} token={token} />
        </div>
        <div className="mt-6 print:hidden">
          <PublicQuoteApproval quote={quote} token={token} />
        </div>
        <div className="mt-6 print:hidden">
          <PublicQuoteQueries token={token} initialMessages={messages} />
        </div>
      </div>
    </main>
  )
}
