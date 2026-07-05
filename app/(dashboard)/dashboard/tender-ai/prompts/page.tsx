import type { Metadata } from 'next'
import { requireTenderAccess } from '@/lib/tender/access'
import { getPrompts } from '@/lib/tender/data'
import { PromptLibrary } from '@/components/dashboard/tender-ai/prompt-library'

export const metadata: Metadata = { title: 'AI Prompt Library | Tender AI' }

export default async function PromptsPage() {
  await requireTenderAccess()
  const prompts = await getPrompts()

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Prompt Library</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Save reusable instructions and question styles. Active prompts also feed the AI&apos;s
          retrieval so it answers in your preferred way.
        </p>
      </div>
      <PromptLibrary prompts={prompts} />
    </div>
  )
}
