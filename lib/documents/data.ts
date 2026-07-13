import { createClient } from '@/lib/supabase/server'
import type {
  DocumentFile,
  DocumentFolder,
  DocumentOwnerType,
  DocumentTag,
} from '@/lib/types/database'

export type OwnerDocuments = {
  folders: DocumentFolder[]
  files: DocumentFile[]
  // Distinct tags actually applied to files in this owner, sorted by name.
  // Drives the folder "Type" filter (only tags used here appear).
  usedTags: DocumentTag[]
}

export { SYSTEM_REFERENCE_OWNER_ID } from '@/lib/documents/utils'

// Fetch all system reference documents (AI grounding guides), newest first.
export async function getSystemReferences(): Promise<DocumentFile[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('documents')
    .select('*')
    .eq('owner_type', 'system_reference')
    .order('created_at', { ascending: false })
  return (data ?? []) as DocumentFile[]
}

// The full shared tag vocabulary, sorted by name. Used by the upload picker,
// edit-tags control and the tag manager.
export async function getAllDocumentTags(): Promise<DocumentTag[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('document_tags')
    .select('id, name, created_by, created_at')
    .order('name')
  return (data ?? []) as DocumentTag[]
}

// Shape returned by the file<->tag embed. Supabase returns the joined tag as a
// nested object (or array depending on the relationship inference).
type FileTagRow = {
  document_id: string
  document_tags: DocumentTag | DocumentTag[] | null
}

// Fetch every folder + file for a given owner (client / site / site_service).
// Folder navigation is then handled client-side by parent_id. Each file is
// hydrated with its tags, and the distinct set of used tags is returned.
export async function getOwnerDocuments(
  ownerType: DocumentOwnerType,
  ownerId: string,
): Promise<OwnerDocuments> {
  const supabase = await createClient()

  const [{ data: folders }, { data: files }] = await Promise.all([
    supabase
      .from('document_folders')
      .select('*')
      .eq('owner_type', ownerType)
      .eq('owner_id', ownerId)
      .order('name'),
    supabase
      .from('documents')
      .select('*')
      .eq('owner_type', ownerType)
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false }),
  ])

  const fileList = (files ?? []) as DocumentFile[]

  // Load tags for these files in one query, then attach them per file.
  const tagsByFile = new Map<string, DocumentTag[]>()
  const usedById = new Map<string, DocumentTag>()
  if (fileList.length > 0) {
    const { data: fileTags } = await supabase
      .from('document_file_tags')
      .select('document_id, document_tags(id, name, created_by, created_at)')
      .in(
        'document_id',
        fileList.map((f) => f.id),
      )

    for (const row of (fileTags ?? []) as FileTagRow[]) {
      const tag = Array.isArray(row.document_tags)
        ? row.document_tags[0]
        : row.document_tags
      if (!tag) continue
      const list = tagsByFile.get(row.document_id) ?? []
      list.push(tag)
      tagsByFile.set(row.document_id, list)
      usedById.set(tag.id, tag)
    }
  }

  const filesWithTags = fileList.map((f) => ({
    ...f,
    tags: (tagsByFile.get(f.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
  }))

  const usedTags = [...usedById.values()].sort((a, b) => a.name.localeCompare(b.name))

  return {
    folders: (folders ?? []) as DocumentFolder[],
    files: filesWithTags,
    usedTags,
  }
}
