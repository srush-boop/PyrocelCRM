import Link from 'next/link'
import { FolderOpen } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DocumentBrowser } from '@/components/documents/document-browser'
import type { DocumentFile, DocumentFolder } from '@/lib/types/database'

interface SiteDocumentsProps {
  siteId: string
  folders: DocumentFolder[]
  files: DocumentFile[]
  canManage: boolean
}

export function SiteDocuments({ siteId, folders, files, canManage }: SiteDocumentsProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            Documents
          </CardTitle>
          <CardDescription>
            Files and folders stored against this site.
          </CardDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/dashboard/documents?ownerType=site&ownerId=${siteId}`}>
            Open full view
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <DocumentBrowser
          ownerType="site"
          ownerId={siteId}
          folders={folders}
          files={files}
          canManage={canManage}
        />
      </CardContent>
    </Card>
  )
}
