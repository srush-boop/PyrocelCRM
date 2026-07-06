import { createClient } from '@/lib/supabase/server'
import type {
  DocumentFile,
  DocumentFolder,
  DocumentOwnerType,
} from '@/lib/types/database'

export type OwnerDocuments = {
  folders: DocumentFolder[]
  files: DocumentFile[]
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

// Fetch every folder + file for a given owner (client / site / site_service).
// Folder navigation is then handled client-side by parent_id.
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

  return {
    folders: (folders ?? []) as DocumentFolder[],
    files: (files ?? []) as DocumentFile[],
  }
}
