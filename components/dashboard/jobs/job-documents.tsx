import { FolderOpen } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DocumentBrowser } from '@/components/documents/document-browser'
import type { DocumentFile, DocumentFolder, DocumentTag } from '@/lib/types/database'

interface JobDocumentsProps {
  jobId: string
  folders: DocumentFolder[]
  files: DocumentFile[]
  canManage: boolean
  allTags?: DocumentTag[]
  usedTags?: DocumentTag[]
}

export function JobDocuments({
  jobId,
  folders,
  files,
  canManage,
  allTags = [],
  usedTags = [],
}: JobDocumentsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-primary" />
          Documents
        </CardTitle>
        <CardDescription>
          Files, folders and generated letters stored against this job.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DocumentBrowser
          ownerType="job"
          ownerId={jobId}
          folders={folders}
          files={files}
          canManage={canManage}
          allTags={allTags}
          usedTags={usedTags}
          revalidatePath={`/dashboard/jobs/${jobId}`}
        />
      </CardContent>
    </Card>
  )
}
