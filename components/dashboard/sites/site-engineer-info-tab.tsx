import { MessageSquare, FolderOpen, ShieldAlert } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DocumentBrowser } from '@/components/documents/document-browser'
import { SiteFlagsEditor } from '@/components/dashboard/site-info/site-flags-editor'
import { SiteInternalNotes } from '@/components/dashboard/site-info/site-internal-notes'
import type {
  DocumentFile,
  DocumentFolder,
  Site,
  SiteInternalNote,
} from '@/lib/types/database'

interface SiteEngineerInfoTabProps {
  site: Site
  notes: SiteInternalNote[]
  engineerFolders: DocumentFolder[]
  engineerFiles: DocumentFile[]
  currentUserId: string
  canModerateNotes: boolean
}

/**
 * Site-level "Engineer Info" tab: pre-attendance flags editor, communal internal
 * notes, and the shared engineer file store. All staff (incl. engineers) can
 * contribute; the flags here are the site defaults that individual services may
 * override on their own service line.
 */
export function SiteEngineerInfoTab({
  site,
  notes,
  engineerFolders,
  engineerFiles,
  currentUserId,
  canModerateNotes,
}: SiteEngineerInfoTabProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            Attendance requirements
          </CardTitle>
          <CardDescription>
            Site defaults shown to engineers before they attend. Individual services can
            override these on their own service line.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SiteFlagsEditor
            target="site"
            id={site.id}
            initial={{
              booking_required: site.booking_required ?? false,
              access_required: site.access_required ?? false,
              keys_required: site.keys_required ?? false,
              two_engineers_required: site.two_engineers_required ?? false,
              remedial_notes: site.remedial_notes ?? null,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Internal notes
          </CardTitle>
          <CardDescription>
            A shared space for engineers and office staff to leave notes about this site.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SiteInternalNotes
            siteId={site.id}
            notes={notes}
            currentUserId={currentUserId}
            canModerate={canModerateNotes}
          />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            Engineer folder
          </CardTitle>
          <CardDescription>
            Downloads, drawings, technical info and site-specific instructions engineers can
            access and contribute to.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentBrowser
            ownerType="site_engineer"
            ownerId={site.id}
            folders={engineerFolders}
            files={engineerFiles}
            canManage
          />
        </CardContent>
      </Card>
    </div>
  )
}
