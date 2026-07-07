'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, RotateCcw } from 'lucide-react'
import type { CompanyInfo } from '@/lib/types/database'
import {
  DEFAULT_INSTALLATION_RATES,
  resolveInstallationRates,
  type InstallationRates,
  type InstallDevice,
  type InstallCable,
  type InstallMaterial,
} from '@/lib/installation-calculator'

interface InstallationSettingsProps {
  company: CompanyInfo | null
}

type Feedback = { type: 'success' | 'error'; text: string } | null

// Global numeric fields exposed in the editor.
const GLOBAL_FIELDS: Array<{
  key: keyof InstallationRates
  label: string
  step?: string
  suffix?: string
}> = [
  { key: 'labourSell', label: 'Labour sell rate', step: '0.01', suffix: '£/hr' },
  { key: 'labourCost', label: 'Labour cost (margin only)', step: '0.01', suffix: '£/hr' },
  { key: 'materialMarkup', label: 'Material mark-up', step: '0.01', suffix: '0–1' },
  { key: 'defaultMetresPerDevice', label: 'Default cable m / device', step: '0.5', suffix: 'm' },
  { key: 'defaultTrayFraction', label: 'Default % on tray', step: '0.05', suffix: '0–1' },
]

const CABLE_GROUP_LABELS: Record<InstallCable['group'], string> = {
  loop: 'Loop',
  network: 'Network',
  other: 'Other',
}

export function InstallationSettings({ company }: InstallationSettingsProps) {
  const router = useRouter()
  const supabase = createClient()

  const initial = resolveInstallationRates(
    (company?.installation_rates ?? null) as Partial<InstallationRates> | null,
  )

  const [globals, setGlobals] = useState<Record<string, string>>(() =>
    Object.fromEntries(GLOBAL_FIELDS.map((f) => [f.key, String(initial[f.key] ?? '')])),
  )
  const [devices, setDevices] = useState<InstallDevice[]>(initial.devices)
  const [cables, setCables] = useState<InstallCable[]>(initial.cables)
  const [containment, setContainment] = useState<InstallMaterial[]>(initial.containment)
  const [sundries, setSundries] = useState<InstallMaterial[]>(initial.sundries)

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<Feedback>(null)

  function resetAll() {
    setGlobals(
      Object.fromEntries(GLOBAL_FIELDS.map((f) => [f.key, String(DEFAULT_INSTALLATION_RATES[f.key] ?? '')])),
    )
    setDevices(DEFAULT_INSTALLATION_RATES.devices)
    setCables(DEFAULT_INSTALLATION_RATES.cables)
    setContainment(DEFAULT_INSTALLATION_RATES.containment)
    setSundries(DEFAULT_INSTALLATION_RATES.sundries)
  }

  const num = (v: string, fallback = 0) => {
    const n = Number.parseFloat(v)
    return Number.isFinite(n) ? n : fallback
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)

    const rates: InstallationRates = {
      ...DEFAULT_INSTALLATION_RATES,
      ...Object.fromEntries(
        GLOBAL_FIELDS.map((f) => [f.key, num(globals[f.key], DEFAULT_INSTALLATION_RATES[f.key] as number)]),
      ),
      devices: devices.map((d) => ({ ...d, installHours: Number(d.installHours) || 0 })),
      cables: cables.map((c) => ({
        ...c,
        fabricHours: Number(c.fabricHours) || 0,
        trayHours: Number(c.trayHours) || 0,
        ductHours: c.ductHours != null ? Number(c.ductHours) || 0 : undefined,
        nettPerM: Number(c.nettPerM) || 0,
        metresPerDevice: c.metresPerDevice != null ? Number(c.metresPerDevice) || 0 : undefined,
      })),
      containment: containment.map((m) => ({
        ...m,
        installHours: Number(m.installHours) || 0,
        nettPer: Number(m.nettPer) || 0,
      })),
      sundries: sundries.map((m) => ({
        ...m,
        installHours: Number(m.installHours) || 0,
        nettPer: Number(m.nettPer) || 0,
      })),
    } as InstallationRates

    const payload = {
      installation_rates: rates as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    }

    const { error } = company
      ? await supabase.from('company_info').update(payload).eq('id', company.id)
      : await supabase.from('company_info').insert({ name: 'Pyrocel Ltd', ...payload })

    setSaving(false)
    if (error) {
      setMessage({ type: 'error', text: 'Failed to save installation settings.' })
    } else {
      setMessage({ type: 'success', text: 'Installation settings saved.' })
      router.refresh()
    }
  }

  return (
    <div className="space-y-4">
      {/* Global rates */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Installation Rates</CardTitle>
              <CardDescription>
                Global rates used by the installation calculator, seeded from the Projects
                Installation Workbook.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={resetAll}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset to defaults
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {GLOBAL_FIELDS.map((f) => (
              <div key={f.key} className="grid gap-1.5">
                <Label htmlFor={`inst-${f.key}`} className="text-xs">
                  {f.label}
                  {f.suffix ? <span className="ml-1 text-muted-foreground">({f.suffix})</span> : null}
                </Label>
                <Input
                  id={`inst-${f.key}`}
                  type="number"
                  step={f.step ?? '1'}
                  value={globals[f.key] ?? ''}
                  onChange={(e) => setGlobals((prev) => ({ ...prev, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Devices */}
      <Card>
        <CardHeader>
          <CardTitle>Devices</CardTitle>
          <CardDescription>Install hours per device (labour only).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="p-2 font-semibold">Device</th>
                  <th className="w-36 p-2 font-semibold">Install hrs</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d, i) => (
                  <tr key={d.key} className="border-b last:border-0">
                    <td className="p-2">{d.label}</td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="0.05"
                        value={String(d.installHours)}
                        onChange={(e) =>
                          setDevices((prev) =>
                            prev.map((p, idx) =>
                              idx === i ? { ...p, installHours: Number(e.target.value) || 0 } : p,
                            ),
                          )
                        }
                        className="h-8"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Cables */}
      <Card>
        <CardHeader>
          <CardTitle>Cable</CardTitle>
          <CardDescription>
            Install hours per metre by fixing method and nett cost per metre.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="p-2 font-semibold">Cable</th>
                  <th className="w-20 p-2 font-semibold">Group</th>
                  <th className="w-24 p-2 font-semibold">Fabric h/m</th>
                  <th className="w-24 p-2 font-semibold">Tray h/m</th>
                  <th className="w-24 p-2 font-semibold">Duct h/m</th>
                  <th className="w-24 p-2 font-semibold">Nett £/m</th>
                  <th className="w-24 p-2 font-semibold">m / device</th>
                </tr>
              </thead>
              <tbody>
                {cables.map((c, i) => (
                  <tr key={c.key} className="border-b last:border-0">
                    <td className="p-2">{c.label}</td>
                    <td className="p-2 text-xs text-muted-foreground">{CABLE_GROUP_LABELS[c.group]}</td>
                    {(['fabricHours', 'trayHours', 'ductHours', 'nettPerM', 'metresPerDevice'] as const).map(
                      (field) => (
                        <td key={field} className="p-2">
                          <Input
                            type="number"
                            step="0.01"
                            value={c[field] != null ? String(c[field]) : ''}
                            onChange={(e) =>
                              setCables((prev) =>
                                prev.map((p, idx) =>
                                  idx === i
                                    ? {
                                        ...p,
                                        [field]:
                                          e.target.value === '' ? undefined : Number(e.target.value) || 0,
                                      }
                                    : p,
                                ),
                              )
                            }
                            className="h-8"
                          />
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Containment + Sundries */}
      <MaterialTableCard
        title="Containment"
        description="Trunking, conduit, Unistrut and tray — install hours and nett cost per unit."
        items={containment}
        onChange={setContainment}
      />
      <MaterialTableCard
        title="Fixings & Sundries"
        description="Glands, boxes, tie-wraps, Gripple/Zipclip and clips."
        items={sundries}
        onChange={setSundries}
      />

      {message && (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save installation settings
        </Button>
      </div>
    </div>
  )
}

function MaterialTableCard({
  title,
  description,
  items,
  onChange,
}: {
  title: string
  description: string
  items: InstallMaterial[]
  onChange: (updater: (prev: InstallMaterial[]) => InstallMaterial[]) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="p-2 font-semibold">Item</th>
                <th className="w-20 p-2 font-semibold">Unit</th>
                <th className="w-28 p-2 font-semibold">Install hrs</th>
                <th className="w-28 p-2 font-semibold">Nett £</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m, i) => (
                <tr key={m.key} className="border-b last:border-0">
                  <td className="p-2">{m.label}</td>
                  <td className="p-2 text-xs text-muted-foreground">{m.unit}</td>
                  <td className="p-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={String(m.installHours)}
                      onChange={(e) =>
                        onChange((prev) =>
                          prev.map((p, idx) =>
                            idx === i ? { ...p, installHours: Number(e.target.value) || 0 } : p,
                          ),
                        )
                      }
                      className="h-8"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={String(m.nettPer)}
                      onChange={(e) =>
                        onChange((prev) =>
                          prev.map((p, idx) =>
                            idx === i ? { ...p, nettPer: Number(e.target.value) || 0 } : p,
                          ),
                        )
                      }
                      className="h-8"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
