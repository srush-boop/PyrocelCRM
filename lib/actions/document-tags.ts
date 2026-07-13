'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getDocumentAuth } from '@/lib/documents/auth'
import { setFileTagRows } from '@/lib/documents/tags'
import type { DocumentTag } from '@/lib/types/database'

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

async function requireManage() {
  const auth = await getDocumentAuth()
  if (!auth.ok || !auth.canManage) {
    return { ok: false as const, error: 'You do not have permission to do this.' }
  }
  return { ok: true as const, auth }
}

// A tag plus how many files currently use it, for the tag manager.
export interface TagWithUsage extends DocumentTag {
  usage_count: number
}

export async function listTagsWithUsage(): Promise<TagWithUsage[]> {
  const supabase = await createClient()
  const [{ data: tags }, { data: links }] = await Promise.all([
    supabase.from('document_tags').select('id, name, created_by, created_at').order('name'),
    supabase.from('document_file_tags').select('tag_id'),
  ])

  const counts = new Map<string, number>()
  for (const row of (links ?? []) as { tag_id: string }[]) {
    counts.set(row.tag_id, (counts.get(row.tag_id) ?? 0) + 1)
  }

  return ((tags ?? []) as DocumentTag[]).map((t) => ({
    ...t,
    usage_count: counts.get(t.id) ?? 0,
  }))
}

export async function createTag(name: string): Promise<ActionResult<DocumentTag>> {
  const guard = await requireManage()
  if (!guard.ok) return guard

  const clean = name.trim().slice(0, 60)
  if (!clean) return { ok: false, error: 'Enter a tag name.' }

  const supabase = await createClient()

  // Case-insensitive duplicate guard on top of the DB unique index.
  const { data: existing } = await supabase
    .from('document_tags')
    .select('id')
    .ilike('name', clean)
    .maybeSingle()
  if (existing?.id) return { ok: false, error: 'That tag already exists.' }

  const { data, error } = await supabase
    .from('document_tags')
    .insert({ name: clean, created_by: guard.auth.profile?.id ?? null })
    .select('id, name, created_by, created_at')
    .single()
  if (error) return { ok: false, error: error.message }

  revalidatePath('/dashboard/settings')
  return { ok: true, data: data as DocumentTag }
}

export async function renameTag(id: string, name: string): Promise<ActionResult> {
  const guard = await requireManage()
  if (!guard.ok) return guard

  const clean = name.trim().slice(0, 60)
  if (!clean) return { ok: false, error: 'Enter a tag name.' }

  const supabase = await createClient()
  const { data: clash } = await supabase
    .from('document_tags')
    .select('id')
    .ilike('name', clean)
    .neq('id', id)
    .maybeSingle()
  if (clash?.id) return { ok: false, error: 'Another tag already has that name.' }

  const { error } = await supabase.from('document_tags').update({ name: clean }).eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/dashboard/settings')
  return { ok: true }
}

// Deleting a tag cascades to document_file_tags (join rows removed).
export async function deleteTag(id: string): Promise<ActionResult> {
  const guard = await requireManage()
  if (!guard.ok) return guard

  const supabase = await createClient()
  const { error } = await supabase.from('document_tags').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/dashboard/settings')
  return { ok: true }
}

// Replace the tags on a single file. Used by the per-file "Edit tags" control.
// Enforces the ≥1 tag rule for uploaded documents. `revalidate` refreshes the
// owning entity's Documents view.
export async function setFileTags(
  documentId: string,
  tagIds: string[],
  revalidate?: string,
): Promise<ActionResult> {
  const auth = await getDocumentAuth()
  if (!auth.ok) return { ok: false, error: 'You do not have permission to do this.' }

  const ids = [...new Set(tagIds.filter(Boolean))]

  const supabase = await createClient()

  // Determine the file's store to apply the same manage rules as upload/rename.
  const { data: doc } = await supabase
    .from('documents')
    .select('owner_type, template_id')
    .eq('id', documentId)
    .single()

  const allowed =
    doc?.owner_type === 'site_engineer'
      ? auth.canManageEngineer
      : doc?.owner_type === 'system_reference'
        ? auth.profile?.role === 'admin'
        : auth.canManage
  if (!allowed) return { ok: false, error: 'You do not have permission to do this.' }

  // Uploaded documents must keep at least one tag. Generated (mail-merge) docs
  // and system references are exempt.
  const exempt = doc?.owner_type === 'system_reference' || !!doc?.template_id
  if (!exempt && ids.length === 0) {
    return { ok: false, error: 'Choose at least one tag.' }
  }

  const err = await setFileTagRows(supabase, documentId, ids)
  if (err) return { ok: false, error: err }

  if (revalidate) revalidatePath(revalidate)
  return { ok: true }
}
