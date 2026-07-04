import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDocumentAuth } from '@/lib/documents/auth'
import type { DocumentOwnerType } from '@/lib/types/database'

const OWNER_TYPES: DocumentOwnerType[] = ['client', 'site', 'site_service', 'site_engineer']

// Create a folder
export async function POST(request: NextRequest) {
  const auth = await getDocumentAuth()
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status })
  }

  const body = await request.json().catch(() => ({}))
  const ownerType = body.owner_type as DocumentOwnerType
  const ownerId = body.owner_id as string
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const parentId = body.parent_id ?? null

  if (!ownerType || !OWNER_TYPES.includes(ownerType) || !ownerId) {
    return NextResponse.json({ error: 'Invalid owner' }, { status: 400 })
  }

  // Engineers may only manage the shared engineer folder; other stores need canManage.
  const allowed = ownerType === 'site_engineer' ? auth.canManageEngineer : auth.canManage
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!name) {
    return NextResponse.json({ error: 'Name required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('document_folders')
    .insert({
      owner_type: ownerType,
      owner_id: ownerId,
      parent_id: parentId,
      name,
      created_by: auth.profile?.id ?? null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ folder: data })
}
