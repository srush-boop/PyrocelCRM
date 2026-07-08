import Link from 'next/link'
import { Hammer, FileText, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { DocumentBrowser } from '@/components/documents/document-browser'
import type { DocumentFile, DocumentFolder } from '@/lib/types/database'

interface CommissioningJobPanelProps {
  jobId: string
  jobNumber: string | null
  jobTitle: string | null
  poNumber: string | null
  jobNotes: string | null
  folders: DocumentFolder[]
  files: DocumentFile[]
  /** Office/admin can jump to the full job page; engineers get the folder only. */
  canOpenJob: boolean
}

/**
 * Shown at the top of a commissioning call. Gives the attending engineer the key
 * job context copied from the source job plus read-only access to the job's
 * documents folder.
 */
export function CommissioningJobPanel({
  jobId,
  jobNumber,
  jobTitle,
  poNumber,
  jobNotes,
  folders,
  files,
  canOpenJob,
}: CommissioningJobPanelProps) {
  const fileCount = files.length

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Hammer className="h-4 w-4 text-primary" />
            Commissioning — {jobNumber ?? 'Job'}
          </CardTitle>
          {jobTitle ? <p className="text-sm text-muted-foreground text-pretty">{jobTitle}</p> : null}
        </div>
        {canOpenJob ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/jobs/${jobId}`}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Open job
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {poNumber ? (
            <div className="flex flex-col">
              <dt className="text-muted-foreground">Customer PO</dt>
              <dd className="font-medium text-foreground">{poNumber}</dd>
            </div>
          ) : null}
        </dl>

        {jobNotes ? (
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Job notes
            </p>
            <p className="whitespace-pre-wrap text-sm text-foreground text-pretty">{jobNotes}</p>
          </div>
        ) : null}

        <Accordion type="single" collapsible>
          <AccordionItem value="job-files" className="border-b-0">
            <AccordionTrigger className="text-sm">
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Job documents
                {fileCount > 0 && (
                  <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">
                    {fileCount}
                  </span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <DocumentBrowser
                ownerType="job"
                ownerId={jobId}
                folders={folders}
                files={files}
                canManage={false}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  )
}
