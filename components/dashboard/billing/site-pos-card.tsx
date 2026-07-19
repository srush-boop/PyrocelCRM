'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ChevronDown, Loader2, Check } from 'lucide-react'
import { setCustomerPo } from '@/lib/actions/customer-po'

type Level = 'site' | 'system' | 'service'

interface SystemRow {
  id: string
  name: string
  po_number: string | null
}
interface ServiceRow {
  id: string
  name: string
  siteSystemId: string | null
  po_number: string | null
}

interface SitePosCardProps {
  siteId: string
  sitePo: string | null
  clientPo: string | null
  systems: SystemRow[]
  services: ServiceRow[]
}

/**
 * Manage the customer-PO hierarchy for a site: a site-level PO plus per-system
 * and per-service overrides. Invoices resolve the PO service -> system -> site
 * -> client, so this card explains the fallback and lets staff set each level.
 */
export function SitePosCard({ siteId, sitePo, clientPo, systems, services }: SitePosCardProps) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [pending, startTransition] = useTransition()
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState<string | null>(null)
  // Local edit buffer keyed by `${level}:${id}`.
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = { [`site:${siteId}`]: sitePo ?? '' }
    for (const s of systems) init[`system:${s.id}`] = s.po_number ?? ''
    for (const s of services) init[`service:${s.id}`] = s.po_number ?? ''
    return init
  })

  const key = (level: Level, id: string) => `${level}:${id}`

  const save = (level: Level, id: string, original: string | null) => {
    const k = key(level, id)
    const next = values[k] ?? ''
    if (next.trim() === (original ?? '').trim()) return
    setBusyKey(k)
    setSavedKey(null)
    startTransition(async () => {
      const res = await setCustomerPo(level, id, next)
      setBusyKey(null)
      if (res.error) {
        // Roll back to the original on failure.
        setValues((prev) => ({ ...prev, [k]: original ?? '' }))
        return
      }
      setSavedKey(k)
      router.refresh()
    })
  }

  const field = (
    level: Level,
    id: string,
    original: string | null,
    label: string,
    placeholder: string,
    indent = false,
  ) => {
    const k = key(level, id)
    return (
      <div key={k} className={`grid gap-1.5 ${indent ? 'pl-4' : ''}`}>
        <Label htmlFor={`po-${k}`} className="text-xs">
          {label}
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id={`po-${k}`}
            value={values[k] ?? ''}
            onChange={(e) => setValues((prev) => ({ ...prev, [k]: e.target.value }))}
            onBlur={() => save(level, id, original)}
            placeholder={placeholder}
            className="h-8"
            disabled={pending && busyKey === k}
          />
          {busyKey === k ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          ) : savedKey === k ? (
            <Check className="h-4 w-4 shrink-0 text-primary" />
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <CardTitle className="text-base">Purchase orders</CardTitle>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground text-pretty">
            Invoices use the most specific PO available: service charge, then system, then site,
            then the client default
            {clientPo ? ` (currently "${clientPo}")` : ' (none set)'}.
          </p>

          {field('site', siteId, sitePo, 'Site PO', 'Customer PO for this site')}

          {systems.length > 0 && (
            <div className="space-y-3 border-t pt-3">
              {systems.map((sys) => {
                const sysServices = services.filter((sv) => sv.siteSystemId === sys.id)
                return (
                  <div key={sys.id} className="space-y-2">
                    {field('system', sys.id, sys.po_number, `${sys.name} — system PO`, 'Inherit site PO')}
                    {sysServices.map((sv) =>
                      field(
                        'service',
                        sv.id,
                        sv.po_number,
                        `${sv.name} — service PO`,
                        'Inherit system PO',
                        true,
                      ),
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Services not attached to a system. */}
          {services.filter((sv) => !sv.siteSystemId).length > 0 && (
            <div className="space-y-2 border-t pt-3">
              {services
                .filter((sv) => !sv.siteSystemId)
                .map((sv) =>
                  field('service', sv.id, sv.po_number, `${sv.name} — service PO`, 'Inherit site PO'),
                )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
