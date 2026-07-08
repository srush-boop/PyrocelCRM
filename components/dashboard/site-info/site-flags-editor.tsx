'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { EDITABLE_SITE_FLAG_KEYS, SITE_FLAG_META, type SiteFlagKey } from '@/lib/site-flags'

type SiteValues = {
  booking_required: boolean
  access_required: boolean
  keys_required: boolean
  two_engineers_required: boolean
  remedial_notes: string | null
}

// Service and system values are tri-state: true / false / null (inherit).
type ServiceValues = {
  booking_required: boolean | null
  access_required: boolean | null
  keys_required: boolean | null
  two_engineers_required: boolean | null
  remedial_notes: string | null
}

interface SiteFlagsEditorProps {
  target: 'site' | 'system' | 'service'
  id: string
  initial: SiteValues | ServiceValues
  /**
   * The inherited defaults shown in the "Inherit (…)" option. For a service
   * under a system this is the resolved site→system default; for a system it is
   * the site default.
   */
  siteDefaults?: SiteValues
  canEdit?: boolean
}

const INHERIT = 'inherit'

export function SiteFlagsEditor({
  target,
  id,
  initial,
  siteDefaults,
  canEdit = true,
}: SiteFlagsEditorProps) {
  const router = useRouter()
  const [values, setValues] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  function setFlag(key: SiteFlagKey, value: boolean | null) {
    setValues((prev) => ({ ...prev, [key]: value }))
    setSavedAt(null)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/site-info', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, id, ...values }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Could not save')
      }
      setSavedAt(Date.now())
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {EDITABLE_SITE_FLAG_KEYS.map((key) => {
          const meta = SITE_FLAG_META[key]
          const Icon = meta.icon
          const value = values[key]

          return (
            <div
              key={key}
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <Label className="cursor-default text-sm font-medium">{meta.label}</Label>
              </div>

              {target === 'service' || target === 'system' ? (
                <Select
                  disabled={!canEdit}
                  value={value === null || value === undefined ? INHERIT : value ? 'yes' : 'no'}
                  onValueChange={(v) =>
                    setFlag(key, v === INHERIT ? null : v === 'yes')
                  }
                >
                  <SelectTrigger className="w-32 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={INHERIT}>
                      Inherit{siteDefaults ? ` (${siteDefaults[key] ? 'Yes' : 'No'})` : ''}
                    </SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Switch
                  disabled={!canEdit}
                  checked={Boolean(value)}
                  onCheckedChange={(checked) => setFlag(key, checked)}
                />
              )}
            </div>
          )
        })}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`remedial-notes-${id}`} className="text-sm font-medium">
          Remedial / parts notes
        </Label>
        <Textarea
          id={`remedial-notes-${id}`}
          disabled={!canEdit}
          placeholder="e.g. Faulty detector head zone 3 — bring spare. Panel battery due for replacement."
          value={values.remedial_notes ?? ''}
          onChange={(e) => {
            setValues((prev) => ({ ...prev, remedial_notes: e.target.value }))
            setSavedAt(null)
          }}
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          Visible to all staff before attending. Use this to flag remedial works that may not yet
          have a call issued, so the right parts can be taken.
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {canEdit && (
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save
          </Button>
          <span
            className={cn(
              'text-xs text-muted-foreground transition-opacity',
              savedAt ? 'opacity-100' : 'opacity-0',
            )}
          >
            Saved
          </span>
        </div>
      )}
    </div>
  )
}
