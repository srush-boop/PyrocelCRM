import { notFound } from 'next/navigation'
import { QuoteDocument } from '@/components/dashboard/sales/quote-document'
import { PublicQuoteApproval } from '@/components/portal/public-quote-approval'
import { getPublicQuote } from './actions'
import type {
  Quote,
  QuoteSystem,
  QuoteLineItem,
  CompanyInfo,
  QuoteRequirement,
} from '@/lib/types/database'

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

  return (
    <main className="min-h-screen bg-muted/40 py-8">
      <div className="mx-auto max-w-4xl px-4">
        <QuoteDocument
          quote={quote}
          systems={systems}
          lines={lines}
          company={company}
          requirements={requirements}
        />
        <div className="mt-6 print:hidden">
          <PublicQuoteApproval quote={quote} token={token} />
        </div>
      </div>
    </main>
  )
}
