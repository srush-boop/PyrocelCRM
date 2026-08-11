'use client'

import { FolderOpen, Info, MessageSquare } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { DocumentBrowser } from '@/components/documents/document-browser'
import { SiteFlagBadges } from './site-flag-badges'
import { SiteInternalNotes } from './site-internal-notes'
import { UploadDownloadButton } from './upload-download-button'
import { activeFlagKeys } from '@/lib/site-flags'
import type {
  DocumentFile,
  DocumentFolder,
  DocumentTag,
  ResolvedSiteFlags,
  SiteInternalNote,
} from '@/lib/types/database'

interface PreAttendancePanelProps {
  siteId: string
  flags: ResolvedSiteFlags
  notes: SiteInternalNote[]
  engineerFolders: DocumentFolder[]
  engineerFiles: DocumentFile[]
  currentUserId: string
  canModerateNotes: boolean
  /** When true (fire alarm calls), shows the "Upload Download" action. */
  isFireAlarm?: boolean
  allTags?: DocumentTag[]
  usedTags?: DocumentTag[]
}

/**
 * Read-first pre-attendance summary shown at the top of every task view so an
 * engineer sees the critical site info *before* starting the job (starting is a
 * separate, explicit action). Surfaces effective flags, a remedial callout,
 * communal notes, and the shared engineer file store.
 */
export function PreAttendancePanel({
  siteId,
  flags,
  notes,
  engineerFolders,
  engineerFiles,
  currentUserId,
  canModerateNotes,
  isFireAlarm = false,
  allTags = [],
  usedTags = [],
}: PreAttendancePanelProps) {
  const hasFlags = activeFlagKeys(flags).length > 0
  const fileCount = engineerFiles.length

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Info className="h-5 w-5 text-primary" />
          Before you attend
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Effective flags */}
        {hasFlags ? (
          <SiteFlagBadges flags={flags} variant="full" />
        ) : (
          <p className="text-sm text-muted-foreground">
            No special access requirements flagged for this site.
          </p>
        )}

        {/* Outstanding-remedial detail is now shown in one consolidated
            OutstandingRemedialCard on the call view. Here we only surface the
            site's own remedial / parts notes when present. */}
        {flags.remedial_notes && (
          <div className="rounded-md border bg-muted/50 p-3">
            <p className="text-sm font-medium">Site / parts notes</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
              {flags.remedial_notes}
            </p>
          </div>
        )}

        <Accordion type="multiple" className="w-full">
          <AccordionItem value="notes">
            <AccordionTrigger className="py-4 text-sm font-medium">
              <span className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 shrink-0" />
                Internal notes
                {notes.length > 0 && (
                  <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">
                    {notes.length}
                  </span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <SiteInternalNotes
                siteId={siteId}
                notes={notes}
                currentUserId={currentUserId}
                canModerate={canModerateNotes}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="files">
            <AccordionTrigger className="py-4 text-sm font-medium">
              <span className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 shrink-0" />
                Engineer files &amp; downloads
                {fileCount > 0 && (
                  <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">
                    {fileCount}
                  </span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              {isFireAlarm && (
                <div className="mb-4 rounded-md border bg-muted/40 p-3">
                  <UploadDownloadButton siteId={siteId} engineerFolders={engineerFolders} />
                </div>
              )}
              <DocumentBrowser
                ownerType="site_engineer"
                ownerId={siteId}
                folders={engineerFolders}
                files={engineerFiles}
                canManage
                allowCreateTags={false}
                allTags={allTags}
                usedTags={usedTags}
                revalidatePath={`/dashboard/tasks`}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  )
}
