import { FileText, Paperclip } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateUK } from '@/lib/utils'
import type { DocumentFile } from '@/lib/types/database'

/**
 * Read-only list of the documents a subcontractor uploaded against this call
 * (quotes, photos, information). Rendered on the internal task page so office /
 * admin can see everything the subcontractor attached. Files download through
 * the subcontractor documents route, which authorises staff too.
 */
export function SubcontractorUploadsPanel({ files }: { files: DocumentFile[] }) {
  if (files.length === 0) return null
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          Subcontractor uploads
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {files.map((file) => (
          <a
            key={file.id}
            href={`/api/subcontractor/documents/${file.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-md border p-2 text-sm transition-colors hover:bg-muted"
          >
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatDateUK(file.created_at)}
            </span>
          </a>
        ))}
      </CardContent>
    </Card>
  )
}
