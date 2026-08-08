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

interface QuoteDocumentsProps {
  quoteId: string
  folders: DocumentFolder[]
  files: DocumentFile[]
  canManage: boolean
  allTags?: DocumentTag[]
  usedTags?: DocumentTag[]
}

export function QuoteDocuments({
  quoteId,
  folders,
  files,
  canManage,
  allTags = [],
  usedTags = [],
}: QuoteDocumentsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-primary" />
          Documents
        </CardTitle>
        <CardDescription>
          Files, folders and generated letters stored against this quote.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DocumentBrowser
          ownerType="quote"
          ownerId={quoteId}
          folders={folders}
          files={files}
          canManage={canManage}
          allTags={allTags}
          usedTags={usedTags}
          revalidatePath={`/dashboard/sales/${quoteId}`}
        />
      </CardContent>
    </Card>
  )
}
