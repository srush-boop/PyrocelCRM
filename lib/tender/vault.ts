import 'server-only'
import { indexSource, removeSource } from './embeddings'
import type { TenderVaultEntry, TenderVaultOutcome } from './types'

/**
 * Does this vault entry have any text worth embedding? A file-only entry (no
 * pasted summary/winning content/feedback) can't teach the AI anything, so we
 * skip indexing it to avoid empty chunks.
 */
export function vaultHasIndexableContent(
  entry: Pick<TenderVaultEntry, 'summary' | 'winning_content' | 'client_feedback'>,
): boolean {
  return Boolean(
    entry.summary?.trim() ||
      entry.winning_content?.trim() ||
      entry.client_feedback?.trim(),
  )
}

function outcomeLine(outcome: TenderVaultOutcome): string {
  switch (outcome) {
    case 'won':
      return 'OUTCOME: WON. This submission was successful — treat its approach and wording as a proven, winning example to emulate.'
    case 'lost':
      return 'OUTCOME: LOST. This submission was unsuccessful — learn from the client feedback below and avoid repeating the weaknesses it identifies.'
    default:
      return 'OUTCOME: AWAITING DECISION. This submission has been made but not yet scored.'
  }
}

/**
 * Builds the text body that gets embedded for a vault entry. The outcome is
 * stated up front so the drafting model knows whether to emulate or learn from
 * the content, and each section is clearly labelled.
 */
export function buildVaultEmbedBody(entry: TenderVaultEntry): string {
  const parts: string[] = [outcomeLine(entry.outcome)]

  if (entry.client_name?.trim()) parts.push(`Client: ${entry.client_name.trim()}`)
  if (entry.summary?.trim()) parts.push(`SUMMARY:\n${entry.summary.trim()}`)
  if (entry.winning_content?.trim())
    parts.push(`KEY RESPONSE CONTENT:\n${entry.winning_content.trim()}`)
  if (entry.client_feedback?.trim())
    parts.push(`CLIENT FEEDBACK:\n${entry.client_feedback.trim()}`)

  return parts.join('\n\n')
}

/**
 * (Re)indexes a vault entry into the shared RAG store, or removes it if there
 * is no indexable content. Won submissions are weighted 'high' so proven
 * winning language surfaces more readily during retrieval.
 */
export async function indexVaultEntry(entry: TenderVaultEntry): Promise<void> {
  if (!vaultHasIndexableContent(entry)) {
    await removeSource('completed_tender', entry.id)
    return
  }

  await indexSource({
    sourceType: 'completed_tender',
    sourceId: entry.id,
    title: `Completed tender: ${entry.title}${
      entry.reference ? ` (${entry.reference})` : ''
    }`,
    content: buildVaultEmbedBody(entry),
    importance: entry.outcome === 'won' ? 'high' : 'normal',
  })
}
