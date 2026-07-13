import type { createClient } from '@/lib/supabase/server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

// Resolve a set of existing tag ids + brand-new tag names into a final list of
// tag ids, creating any new tags in the shared vocabulary. Case-insensitive:
// a "new" name that already exists (any casing) reuses the existing tag.
// Returns null on error.
export async function resolveOrCreateTagIds(
  supabase: SupabaseClient,
  tagIds: string[],
  newTagNames: string[],
  createdBy: string | null,
): Promise<string[] | null> {
  const finalIds = new Set<string>(tagIds.filter(Boolean))

  const cleanedNames = [
    ...new Set(
      newTagNames
        .map((n) => n.trim())
        .filter((n) => n.length > 0)
        .map((n) => n.slice(0, 60)),
    ),
  ]

  for (const name of cleanedNames) {
    // Reuse an existing tag if one matches case-insensitively.
    const { data: existing } = await supabase
      .from('document_tags')
      .select('id')
      .ilike('name', name)
      .maybeSingle()

    if (existing?.id) {
      finalIds.add(existing.id)
      continue
    }

    const { data: created, error } = await supabase
      .from('document_tags')
      .insert({ name, created_by: createdBy })
      .select('id')
      .single()

    if (error) {
      // Unique-violation race: fetch the tag that now exists.
      const { data: retry } = await supabase
        .from('document_tags')
        .select('id')
        .ilike('name', name)
        .maybeSingle()
      if (retry?.id) {
        finalIds.add(retry.id)
        continue
      }
      return null
    }
    if (created?.id) finalIds.add(created.id)
  }

  return [...finalIds]
}

// Replace all tags on a document with the given set. Removes rows not in the
// set and inserts any missing ones.
export async function setFileTagRows(
  supabase: SupabaseClient,
  documentId: string,
  tagIds: string[],
): Promise<string | null> {
  // Wipe existing then re-insert — the join table is tiny per file.
  const { error: delErr } = await supabase
    .from('document_file_tags')
    .delete()
    .eq('document_id', documentId)
  if (delErr) return delErr.message

  if (tagIds.length === 0) return null

  const rows = tagIds.map((tag_id) => ({ document_id: documentId, tag_id }))
  const { error: insErr } = await supabase.from('document_file_tags').insert(rows)
  return insErr ? insErr.message : null
}
