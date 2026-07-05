import type { Metadata } from 'next'
import { requireTenderAccess } from '@/lib/tender/access'
import { getSettings } from '@/lib/tender/data'
import { TenderSettingsForm } from '@/components/dashboard/tender-ai/settings-form'

export const metadata: Metadata = { title: 'AI Settings | Tender AI' }

export default async function TenderSettingsPage() {
  await requireTenderAccess()
  const settings = await getSettings()

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Settings</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Control the tone and default instructions the AI uses when drafting tender answers.
        </p>
      </div>
      <TenderSettingsForm
        initialTone={settings?.company_tone ?? ''}
        initialInstructions={settings?.default_instructions ?? ''}
        model={settings?.answer_model ?? null}
      />
    </div>
  )
}
