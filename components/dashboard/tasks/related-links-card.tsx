import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Briefcase, Building2, ChevronRight, FileText, Link2 } from 'lucide-react'

export interface RelatedJob {
  id: string
  jobNumber: string | null
  title: string | null
  status: string | null
  /** True when this job is the one that spawned the call (commissioning). */
  linked: boolean
}

export interface RelatedQuote {
  id: string
  quoteNumber: string | null
  reference: string | null
  title: string | null
  status: string | null
  /** True when this quote is the one that spawned the call (remedial). */
  linked: boolean
}

/**
 * "Related" — a compact office/admin-only card near the top of the call view
 * that links out to the wider paperwork around this call: the site it belongs
 * to, plus every job and quote attached to that site. The job/quote that
 * directly spawned this call (commissioning / remedial) is flagged "Linked".
 * Rendered only for office/admin; engineers don't see it.
 */
export function RelatedLinksCard({
  siteId,
  siteName,
  clientName,
  jobs,
  quotes,
}: {
  siteId: string
  siteName: string | null
  clientName: string | null
  jobs: RelatedJob[]
  quotes: RelatedQuote[]
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <span>Related</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {/* Site */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Site</p>
          <Link
            href={`/dashboard/sites/${siteId}`}
            className="-mx-2 flex items-center justify-between gap-3 rounded px-2 py-2 transition-colors hover:bg-accent/40"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-foreground">
                  {siteName ?? 'View site'}
                </span>
                {clientName && (
                  <span className="truncate text-xs text-muted-foreground">{clientName}</span>
                )}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        </div>

        {/* Jobs */}
        <div className="space-y-1.5">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Jobs
            <span className="font-normal normal-case">({jobs.length})</span>
          </p>
          {jobs.length === 0 ? (
            <p className="px-2 py-1 text-sm text-muted-foreground">No jobs for this site.</p>
          ) : (
            <ul className="divide-y">
              {jobs.map((job) => (
                <li key={job.id}>
                  <Link
                    href={`/dashboard/jobs/${job.id}`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded px-2 py-2 transition-colors hover:bg-accent/40"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
                          {job.jobNumber ?? job.title ?? 'Job'}
                          {job.linked && (
                            <Badge variant="secondary" className="text-[10px]">
                              Linked
                            </Badge>
                          )}
                        </span>
                        {job.jobNumber && job.title && (
                          <span className="truncate text-xs text-muted-foreground">{job.title}</span>
                        )}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {job.status && (
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {job.status.replace(/_/g, ' ')}
                        </Badge>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Quotes */}
        <div className="space-y-1.5">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Quotes
            <span className="font-normal normal-case">({quotes.length})</span>
          </p>
          {quotes.length === 0 ? (
            <p className="px-2 py-1 text-sm text-muted-foreground">No quotes for this site.</p>
          ) : (
            <ul className="divide-y">
              {quotes.map((quote) => (
                <li key={quote.id}>
                  <Link
                    href={`/dashboard/sales/${quote.id}`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded px-2 py-2 transition-colors hover:bg-accent/40"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
                          {quote.quoteNumber ?? quote.reference ?? 'Quote'}
                          {quote.linked && (
                            <Badge variant="secondary" className="text-[10px]">
                              Linked
                            </Badge>
                          )}
                        </span>
                        {quote.title && (
                          <span className="truncate text-xs text-muted-foreground">
                            {quote.title}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {quote.status && (
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {quote.status.replace(/_/g, ' ')}
                        </Badge>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
