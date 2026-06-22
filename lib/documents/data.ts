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
