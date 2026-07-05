'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Save, Cpu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

interface SettingsFormProps {
  initialTone: string
  initialInstructions: string
  model: string | null
}

export function TenderSettingsForm({ initialTone, initialInstructions, model }: SettingsFormProps) {
  const router = useRouter()
  const [tone, setTone] = useState(initialTone)
  const [instructions, setInstructions] = useState(initialInstructions)
  const [saving, setSaving] = useState(false)

  const save = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/tender/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_tone: tone, default_instructions: instructions }),
      })
      if (!res.ok) throw new Error('Failed to save settings')
      toast.success('Settings saved')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }, [tone, instructions, router])

  return (
    <Card className="max-w-2xl">
      <CardHeader className="pb-3">
        <h2 className="font-medium">Answering behaviour</h2>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="s-tone">Company tone</Label>
          <Textarea
            id="s-tone"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            rows={3}
            placeholder="e.g. Professional, confident and concise. British English. Avoid jargon."
          />
          <p className="text-xs text-muted-foreground">
            Describes the writing style the AI should adopt in every answer.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="s-instructions">Default instructions</Label>
          <Textarea
            id="s-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={6}
            placeholder="e.g. Always reference relevant accreditations. Keep answers under 300 words unless asked otherwise. Never invent capabilities we do not have."
          />
          <p className="text-xs text-muted-foreground">
            Applied to every AI-drafted answer, alongside retrieved company knowledge.
          </p>
        </div>

        {model && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            <Cpu className="size-4" />
            Answer model: <span className="font-medium text-foreground">{model}</span>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save settings
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
