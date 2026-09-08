'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Plus, X } from 'lucide-react'
import { FilenamePatternEditor } from '@/components/dashboard/reports/filename-pattern-editor'
import {
  getClientFilenameContext,
  saveFilenamePattern,
} from '@/lib/actions/report-filename-patterns'
import {
  resolveFilenamePattern,
  DEFAULT_FILENAME_PATTERN,
} from '@/lib/reports/pdf-filename'
import type { Client, ServiceType, ReportFilenamePattern } from '@/lib/types/database'

const DEFAULT_KEY = 'default'

export function ClientFilenamesDialog({
  client,
  serviceTypes,
  open,
  onOpenChange,
}: {
  client: Client
  serviceTypes: ServiceType[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [companyPatterns, setCompanyPatterns] = useState<ReportFilenamePattern[]>([])
  // Draft values keyed by service id ('default' = the client-wide default).
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  // Which service-specific override rows are shown.
  const [overrideIds, setOverrideIds] = useState<string[]>([])
  const [addServiceId, setAddServiceId] = useState<string>('')

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    setError(null)
    getClientFilenameContext(client.id)
      .then((ctx) => {
        if (!active) return
        setCompanyPatterns(ctx.company)
        const next: Record<string, string> = {}
        const ids: string[] = []
        for (const row of ctx.client) {
          if (row.service_type_id === null) {
            next[DEFAULT_KEY] = row.pattern
          } else {
            next[row.service_type_id] = row.pattern
            ids.push(row.service_type_id)
          }
        }
        setDrafts(next)
        setOverrideIds(ids)
      })
      .catch(() => active && setError('Could not load filename settings.'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [open, client.id])

  const serviceName = (id: string) =>
    serviceTypes.find((s) => s.id === id)?.name ?? 'Service'

  // Placeholder for the client default = the company tier it inherits from.
  const clientDefaultPlaceholder =
    resolveFilenamePattern(companyPatterns, null, null) || DEFAULT_FILENAME_PATTERN

  // Placeholder for a service override = the client default (if set) else the
  // company tier for that service.
  function servicePlaceholder(serviceId: string): string {
    const clientDefault = (drafts[DEFAULT_KEY] ?? '').trim()
    if (clientDefault) return clientDefault
    return resolveFilenamePattern(companyPatterns, null, serviceId) || DEFAULT_FILENAME_PATTERN
  }

  function setDraft(key: string, value: string) {
    setDrafts((d) => ({ ...d, [key]: value }))
  }

  function addOverride() {
    if (!addServiceId) return
    if (!overrideIds.includes(addServiceId)) {
      setOverrideIds((ids) => [...ids, addServiceId])
    }
    setAddServiceId('')
  }

  function removeOverride(serviceId: string) {
    setOverrideIds((ids) => ids.filter((id) => id !== serviceId))
    // Persist the removal as "inherit" on save by blanking the draft.
    setDraft(serviceId, '')
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    // Save the client default plus every currently-shown / removed override.
    const jobs: Promise<{ ok: boolean; error?: string }>[] = []
    jobs.push(
      saveFilenamePattern({
        clientId: client.id,
        serviceTypeId: null,
        pattern: drafts[DEFAULT_KEY] ?? '',
      }),
    )
    // Every service id that has a draft entry (shown or removed) is reconciled.
    const serviceKeys = Object.keys(drafts).filter((k) => k !== DEFAULT_KEY)
    for (const serviceId of serviceKeys) {
      jobs.push(
        saveFilenamePattern({
          clientId: client.id,
          serviceTypeId: serviceId,
          pattern: overrideIds.includes(serviceId) ? (drafts[serviceId] ?? '') : '',
        }),
      )
    }
    const results = await Promise.all(jobs)
    setSaving(false)
    const failed = results.find((r) => !r.ok)
    if (failed) {
      setError(failed.error ?? 'Failed to save.')
      return
    }
    onOpenChange(false)
  }

  const availableToAdd = serviceTypes.filter((s) => !overrideIds.includes(s.id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Report file names — {client.name}</DialogTitle>
          <DialogDescription>
            Name the report PDF attached to this client&apos;s emails. Use the tokens to
            build a site, system and service specific name. Blank fields inherit the
            company default.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Default for all services</Label>
              <FilenamePatternEditor
                value={drafts[DEFAULT_KEY] ?? ''}
                onChange={(v) => setDraft(DEFAULT_KEY, v)}
                placeholder={clientDefaultPlaceholder}
              />
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <Label>Per-service overrides</Label>
              </div>

              {overrideIds.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No service-specific overrides. Add one below to name a particular
                  service differently.
                </p>
              )}

              {overrideIds.map((serviceId) => (
                <div key={serviceId} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{serviceName(serviceId)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => removeOverride(serviceId)}
                      aria-label={`Remove ${serviceName(serviceId)} override`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <FilenamePatternEditor
                    value={drafts[serviceId] ?? ''}
                    onChange={(v) => setDraft(serviceId, v)}
                    placeholder={servicePlaceholder(serviceId)}
                  />
                </div>
              ))}

              {availableToAdd.length > 0 && (
                <div className="flex items-end gap-2">
                  <div className="grid flex-1 gap-1.5">
                    <Label className="text-xs text-muted-foreground">Add a service override</Label>
                    <Select value={addServiceId} onValueChange={setAddServiceId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a service…" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableToAdd.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="button" variant="outline" onClick={addOverride} disabled={!addServiceId}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add
                  </Button>
                </div>
              )}
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save file names
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
