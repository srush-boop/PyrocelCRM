'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Plus, Trash2, RotateCcw } from 'lucide-react'
import type { CompanyInfo } from '@/lib/types/database'
import {
  DEFAULT_MAINTENANCE_RATES,
  resolveMaintenanceRates,
  type MaintenanceRates,
  type MonitoringPart,
} from '@/lib/maintenance-calculator'
import {
  DEFAULT_MAINTENANCE_AGREEMENT,
  resolveMaintenanceAgreement,
  type MaintenanceAgreementCopy,
  type MaintenanceCoverSection,
  type MaintenanceFaq,
} from '@/lib/maintenance'

interface MaintenanceSettingsProps {
  company: CompanyInfo | null
}

type Feedback = { type: 'success' | 'error'; text: string } | null

// Numeric rate fields exposed in the editor, with human labels + step hints.
const RATE_FIELDS: Array<{ key: keyof MaintenanceRates; label: string; step?: string; suffix?: string }> = [
  { key: 'slr', label: 'Standard labour rate', suffix: '£/hr' },
  { key: 'cdoTeamRate', label: '2-man team rate (dampers)', suffix: '£/hr' },
  { key: 'engineerCost', label: 'Engineer cost (margin only)', step: '0.01', suffix: '£/hr' },
  { key: 'cdoCost', label: 'CDO cost (margin only)', step: '0.01', suffix: '£/hr' },
  { key: 'travelMins', label: 'Travel time per visit', suffix: 'min' },
  { key: 'maxDiscount', label: 'Max direct discount', step: '0.01', suffix: '0–1' },
  { key: 'subcontractMarkup', label: 'Sub-contract mark-up', step: '0.01', suffix: '0–1' },
  { key: 'compUplift', label: 'Comprehensive uplift', step: '0.01', suffix: '0–1' },
  { key: 'accessEquipmentMarkup', label: 'Access-equipment mark-up', step: '0.01', suffix: '×' },
  { key: 'minFirePrice', label: 'Min fire price', suffix: '£' },
  { key: 'minElPrice', label: 'Min emergency-lighting price', suffix: '£' },
  { key: 'minIntruderPrice', label: 'Min intruder price', suffix: '£' },
  { key: 'minCctvPrice', label: 'Min CCTV price', suffix: '£' },
  { key: 'minAccessPrice', label: 'Min access price', suffix: '£' },
  { key: 'minDamperPrice', label: 'Min damper price', suffix: '£' },
  { key: 'weeklyFireTestPrice', label: 'Weekly fire test / visit', step: '0.01', suffix: '£' },
  { key: 'monthlyElTestPrice', label: 'Monthly EL test / visit', step: '0.01', suffix: '£' },
  { key: 'mechanicalDampersPerDay', label: 'Mechanical dampers / day', suffix: 'units' },
  { key: 'automaticDampersPerDay', label: 'Automatic dampers / day', suffix: 'units' },
  { key: 'damperHoursPerDay', label: 'Testing hours / day', step: '0.5', suffix: 'hrs' },
]

export function MaintenanceSettings({ company }: MaintenanceSettingsProps) {
  const router = useRouter()
  const supabase = createClient()

  const initialRates = resolveMaintenanceRates(
    (company?.maintenance_rates ?? null) as Partial<MaintenanceRates> | null,
  )
  const initialCopy = resolveMaintenanceAgreement(
    (company?.maintenance_agreement ?? null) as Partial<MaintenanceAgreementCopy> | null,
  )

  // Rates state (numeric fields kept as strings for smooth editing).
  const [rateValues, setRateValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(RATE_FIELDS.map((f) => [f.key, String(initialRates[f.key] ?? '')])),
  )
  const [monitoring, setMonitoring] = useState<MonitoringPart[]>(initialRates.monitoringParts)

  // Agreement copy state.
  const [strapline, setStrapline] = useState(initialCopy.strapline)
  const [intro, setIntro] = useState(initialCopy.introParagraphs.join('\n\n'))
  const [closing, setClosing] = useState(initialCopy.closingParagraphs.join('\n\n'))
  const [coverSections, setCoverSections] = useState<MaintenanceCoverSection[]>(initialCopy.coverSections)
  const [faqs, setFaqs] = useState<MaintenanceFaq[]>(initialCopy.faqs)
  const [services, setServices] = useState(initialCopy.servicesOffered.join('\n'))
  const [accreditations, setAccreditations] = useState(initialCopy.accreditations.join('\n'))

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<Feedback>(null)

  function resetRates() {
    setRateValues(
      Object.fromEntries(RATE_FIELDS.map((f) => [f.key, String(DEFAULT_MAINTENANCE_RATES[f.key] ?? '')])),
    )
    setMonitoring(DEFAULT_MAINTENANCE_RATES.monitoringParts)
  }

  function resetAgreement() {
    setStrapline(DEFAULT_MAINTENANCE_AGREEMENT.strapline)
    setIntro(DEFAULT_MAINTENANCE_AGREEMENT.introParagraphs.join('\n\n'))
    setClosing(DEFAULT_MAINTENANCE_AGREEMENT.closingParagraphs.join('\n\n'))
    setCoverSections(DEFAULT_MAINTENANCE_AGREEMENT.coverSections)
    setFaqs(DEFAULT_MAINTENANCE_AGREEMENT.faqs)
    setServices(DEFAULT_MAINTENANCE_AGREEMENT.servicesOffered.join('\n'))
    setAccreditations(DEFAULT_MAINTENANCE_AGREEMENT.accreditations.join('\n'))
  }

  const splitLines = (v: string) =>
    v
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  const splitParas = (v: string) =>
    v
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean)

  async function handleSave() {
    setSaving(true)
    setMessage(null)

    // Build the rates payload from the numeric fields + monitoring list.
    const rates: MaintenanceRates = {
      ...DEFAULT_MAINTENANCE_RATES,
      ...Object.fromEntries(
        RATE_FIELDS.map((f) => [
          f.key,
          Number.parseFloat(rateValues[f.key]) || DEFAULT_MAINTENANCE_RATES[f.key],
        ]),
      ),
      monitoringParts: monitoring.map((m) => ({
        partNo: m.partNo,
        label: m.label,
        cost: Number(m.cost) || 0,
        sell: Number(m.sell) || 0,
      })),
      accessEquipmentOptions: DEFAULT_MAINTENANCE_RATES.accessEquipmentOptions,
    } as MaintenanceRates

    const agreement: MaintenanceAgreementCopy = {
      strapline: strapline.trim() || DEFAULT_MAINTENANCE_AGREEMENT.strapline,
      introParagraphs: splitParas(intro),
      coverSections: coverSections
        .map((s) => ({ title: s.title.trim(), body: s.body.trim() }))
        .filter((s) => s.title || s.body),
      closingParagraphs: splitParas(closing),
      faqs: faqs
        .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }))
        .filter((f) => f.question || f.answer),
      servicesOffered: splitLines(services),
      accreditations: splitLines(accreditations),
    }

    const payload = {
      maintenance_rates: rates as unknown as Record<string, unknown>,
      maintenance_agreement: agreement as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    }

    const { error } = company
      ? await supabase.from('company_info').update(payload).eq('id', company.id)
      : await supabase.from('company_info').insert({ name: 'Pyrocel Ltd', ...payload })

    setSaving(false)
    if (error) {
      setMessage({ type: 'error', text: 'Failed to save maintenance settings.' })
    } else {
      setMessage({ type: 'success', text: 'Maintenance settings saved.' })
      router.refresh()
    }
  }

  return (
    <div className="space-y-4">
      {/* Rates */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Maintenance Rates</CardTitle>
              <CardDescription>
                Global rates and minimum prices used by the maintenance calculator. Leave a field
                blank to fall back to the seeded default.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={resetRates}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset to defaults
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {RATE_FIELDS.map((f) => (
              <div key={f.key} className="grid gap-1.5">
                <Label htmlFor={`rate-${f.key}`} className="text-xs">
                  {f.label}
                  {f.suffix ? <span className="ml-1 text-muted-foreground">({f.suffix})</span> : null}
                </Label>
                <Input
                  id={`rate-${f.key}`}
                  type="number"
                  step={f.step ?? '1'}
                  value={rateValues[f.key] ?? ''}
                  onChange={(e) => setRateValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          <div>
            <Label className="text-sm font-semibold">Monitoring price list</Label>
            <p className="mb-2 text-xs text-muted-foreground">
              Cost and sell prices per monitoring device.
            </p>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="p-2 font-semibold">Device</th>
                    <th className="w-28 p-2 font-semibold">Cost (£)</th>
                    <th className="w-28 p-2 font-semibold">Sell (£)</th>
                  </tr>
                </thead>
                <tbody>
                  {monitoring.map((m, i) => (
                    <tr key={m.partNo} className="border-b last:border-0">
                      <td className="p-2">{m.label}</td>
                      <td className="p-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={String(m.cost)}
                          onChange={(e) =>
                            setMonitoring((prev) =>
                              prev.map((p, idx) =>
                                idx === i ? { ...p, cost: Number(e.target.value) || 0 } : p,
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
                          value={String(m.sell)}
                          onChange={(e) =>
                            setMonitoring((prev) =>
                              prev.map((p, idx) =>
                                idx === i ? { ...p, sell: Number(e.target.value) || 0 } : p,
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
          </div>
        </CardContent>
      </Card>

      {/* Agreement copy */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Service Agreement Copy</CardTitle>
              <CardDescription>
                Text shown on the maintenance service-agreement pages appended to maintenance
                quotes. Separate paragraphs with a blank line.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={resetAgreement}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset to defaults
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="agr-strapline">Strapline</Label>
            <Input
              id="agr-strapline"
              value={strapline}
              onChange={(e) => setStrapline(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="agr-intro">Introduction paragraphs</Label>
            <Textarea
              id="agr-intro"
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              rows={5}
            />
          </div>

          {/* Cover sections */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Overview-of-service sections</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCoverSections((prev) => [...prev, { title: '', body: '' }])}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add section
              </Button>
            </div>
            {coverSections.map((s, i) => (
              <div key={i} className="rounded-md border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Input
                    placeholder="Section title"
                    value={s.title}
                    onChange={(e) =>
                      setCoverSections((prev) =>
                        prev.map((p, idx) => (idx === i ? { ...p, title: e.target.value } : p)),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setCoverSections((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label="Remove section"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Textarea
                  placeholder="Section body"
                  value={s.body}
                  onChange={(e) =>
                    setCoverSections((prev) =>
                      prev.map((p, idx) => (idx === i ? { ...p, body: e.target.value } : p)),
                    )
                  }
                  rows={3}
                />
              </div>
            ))}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="agr-closing">Closing paragraphs</Label>
            <Textarea
              id="agr-closing"
              value={closing}
              onChange={(e) => setClosing(e.target.value)}
              rows={3}
            />
          </div>

          {/* FAQs */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Frequently asked questions</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFaqs((prev) => [...prev, { question: '', answer: '' }])}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add FAQ
              </Button>
            </div>
            {faqs.map((f, i) => (
              <div key={i} className="rounded-md border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Input
                    placeholder="Question"
                    value={f.question}
                    onChange={(e) =>
                      setFaqs((prev) =>
                        prev.map((p, idx) => (idx === i ? { ...p, question: e.target.value } : p)),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setFaqs((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label="Remove FAQ"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Textarea
                  placeholder="Answer"
                  value={f.answer}
                  onChange={(e) =>
                    setFaqs((prev) =>
                      prev.map((p, idx) => (idx === i ? { ...p, answer: e.target.value } : p)),
                    )
                  }
                  rows={3}
                />
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="agr-services">Systems offered (one per line)</Label>
              <Textarea
                id="agr-services"
                value={services}
                onChange={(e) => setServices(e.target.value)}
                rows={5}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="agr-accreditations">Accreditations (one per line)</Label>
              <Textarea
                id="agr-accreditations"
                value={accreditations}
                onChange={(e) => setAccreditations(e.target.value)}
                rows={5}
              />
            </div>
          </div>
        </CardContent>
      </Card>

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
          Save maintenance settings
        </Button>
      </div>
    </div>
  )
}
