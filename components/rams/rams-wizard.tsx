'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Loader2,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Check,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { PPE_OPTIONS } from '@/lib/rams/risk'
import { RiskScoreBadge } from '@/components/rams/risk-matrix'
import {
  createRamsDocument,
  updateRamsDocument,
  type RamsDocumentInput,
} from '@/lib/rams/actions'
import type {
  RamsMasterTemplate,
  RamsHazard,
  RamsSystemHazard,
  RamsDocument,
  SelectedHazard,
  MethodStep,
  KeyPerson,
} from '@/lib/rams/types'

interface SiteOption {
  id: string
  name: string
  address: string | null
  client_id: string | null
  contact_email: string | null
}

interface RamsWizardProps {
  templates: RamsMasterTemplate[]
  hazards: RamsHazard[]
  systemHazards: RamsSystemHazard[]
  clients: { id: string; name: string }[]
  sites: SiteOption[]
  existing?: RamsDocument | null
}

const STEPS = [
  'Details',
  'Hazards & Risk',
  'PPE & Equipment',
  'Method & Emergency',
  'Review',
]

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

export function RamsWizard({
  templates,
  hazards,
  systemHazards,
  clients,
  sites,
  existing,
}: RamsWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  const activityTemplates = templates.filter(
    (t) => t.template_type !== 'system' && t.is_active,
  )
  const systemTemplates = templates.filter(
    (t) => t.template_type === 'system' && t.is_active,
  )

  const [form, setForm] = useState(() => ({
    templateId: existing?.template_id ?? '',
    systemTypeId: existing?.system_type_id ?? '',
    clientId: existing?.client_id ?? '',
    siteId: existing?.site_id ?? '',
    title: existing?.title ?? '',
    jobNumber: existing?.job_number ?? '',
    workDescription: existing?.work_description ?? '',
    workLocation: existing?.work_location ?? '',
    plannedStartDate: existing?.planned_start_date ?? '',
    plannedEndDate: existing?.planned_end_date ?? '',
    noEndDate: existing?.no_end_date ?? false,
    ppeRequirements: existing?.ppe_requirements ?? [],
    equipmentList: existing?.equipment_list ?? [],
    emergencyProcedures: existing?.emergency_procedures ?? '',
    hospitalName: existing?.emergency_hospital_info?.name ?? '',
    hospitalAddress: existing?.emergency_hospital_info?.address ?? '',
    hospitalPhone: existing?.emergency_hospital_info?.phone ?? '',
    siteSpecificConsiderations: existing?.site_specific_considerations ?? '',
  }))

  const [selectedHazards, setSelectedHazards] = useState<SelectedHazard[]>(
    existing?.selected_hazards ?? [],
  )
  const [methodSteps, setMethodSteps] = useState<MethodStep[]>(
    existing?.method_steps?.length
      ? existing.method_steps
      : [{ step: 1, description: '' }],
  )
  const [keyPersonnel, setKeyPersonnel] = useState<KeyPerson[]>(
    existing?.key_personnel ?? [],
  )
  const [equipInput, setEquipInput] = useState('')

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const filteredSites = useMemo(
    () =>
      form.clientId
        ? sites.filter((s) => s.client_id === form.clientId)
        : sites,
    [sites, form.clientId],
  )

  // Applying a template pre-fills default PPE/equipment/method steps + hazards.
  function applyTemplate(templateId: string) {
    const t = activityTemplates.find((x) => x.id === templateId)
    set('templateId', templateId)
    if (!t) return
    if (!form.title) set('title', t.name)
    setForm((f) => ({
      ...f,
      ppeRequirements:
        f.ppeRequirements.length > 0 ? f.ppeRequirements : t.default_ppe || [],
      equipmentList:
        f.equipmentList.length > 0 ? f.equipmentList : t.default_equipment || [],
    }))
    if (t.default_method_steps && methodSteps.every((s) => !s.description)) {
      const steps = t.default_method_steps
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((description, i) => ({ step: i + 1, description }))
      if (steps.length) setMethodSteps(steps)
    }
  }

  function addLibraryHazard(h: RamsHazard) {
    if (selectedHazards.some((s) => s.description === h.description)) return
    setSelectedHazards((prev) => [
      ...prev,
      {
        id: uid(),
        category: h.category,
        description: h.description,
        potential_consequences: h.potential_consequences,
        likelihood: h.default_likelihood ?? 3,
        severity: h.default_severity ?? 3,
        residual_likelihood: Math.max(1, (h.default_likelihood ?? 3) - 1),
        residual_severity: h.default_severity ?? 3,
        controls: h.standard_controls ?? [],
      },
    ])
  }

  function addSystemHazard(h: RamsSystemHazard) {
    if (selectedHazards.some((s) => s.description === h.hazard_name)) return
    setSelectedHazards((prev) => [
      ...prev,
      {
        id: uid(),
        category: h.category,
        description: h.hazard_name,
        potential_consequences: h.potential_consequences ?? h.hazard_description,
        likelihood: h.default_likelihood,
        severity: h.default_severity,
        residual_likelihood: Math.max(1, h.default_likelihood - 1),
        residual_severity: h.default_severity,
        controls: h.standard_controls ?? [],
      },
    ])
  }

  function addBlankHazard() {
    setSelectedHazards((prev) => [
      ...prev,
      {
        id: uid(),
        category: 'General',
        description: '',
        potential_consequences: '',
        likelihood: 3,
        severity: 3,
        residual_likelihood: 2,
        residual_severity: 3,
        controls: [],
      },
    ])
  }

  function updateHazard(id: string, patch: Partial<SelectedHazard>) {
    setSelectedHazards((prev) =>
      prev.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    )
  }

  function removeHazard(id: string) {
    setSelectedHazards((prev) => prev.filter((h) => h.id !== id))
  }

  function togglePpe(item: string) {
    setForm((f) => ({
      ...f,
      ppeRequirements: f.ppeRequirements.includes(item)
        ? f.ppeRequirements.filter((p) => p !== item)
        : [...f.ppeRequirements, item],
    }))
  }

  function addEquipment() {
    const v = equipInput.trim()
    if (!v) return
    if (!form.equipmentList.includes(v))
      set('equipmentList', [...form.equipmentList, v])
    setEquipInput('')
  }

  function addStep() {
    setMethodSteps((prev) => [
      ...prev,
      { step: prev.length + 1, description: '' },
    ])
  }
  function updateStep(index: number, description: string) {
    setMethodSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, description } : s)),
    )
  }
  function removeStep(index: number) {
    setMethodSteps((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, step: i + 1 })),
    )
  }

  function addPerson() {
    setKeyPersonnel((prev) => [...prev, { name: '', role: '', phone: '' }])
  }
  function updatePerson(index: number, patch: Partial<KeyPerson>) {
    setKeyPersonnel((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    )
  }
  function removePerson(index: number) {
    setKeyPersonnel((prev) => prev.filter((_, i) => i !== index))
  }

  const canProceed = step !== 0 || (form.title.trim() && form.clientId)

  async function handleSave() {
    if (!form.title.trim()) {
      toast.error('A title is required')
      setStep(0)
      return
    }
    setSaving(true)
    const template = activityTemplates.find((t) => t.id === form.templateId)
    const site = sites.find((s) => s.id === form.siteId)

    const input: RamsDocumentInput = {
      templateId: form.templateId || null,
      templateCode: template?.code || null,
      systemTypeId: form.systemTypeId || null,
      clientId: form.clientId || null,
      siteId: form.siteId || null,
      siteName: site?.name || null,
      siteAddress: site?.address || null,
      title: form.title.trim(),
      jobNumber: form.jobNumber || null,
      workDescription: form.workDescription || null,
      workLocation: form.workLocation || site?.address || null,
      plannedStartDate: form.plannedStartDate || null,
      plannedEndDate: form.plannedEndDate || null,
      noEndDate: form.noEndDate,
      selectedHazards,
      ppeRequirements: form.ppeRequirements,
      equipmentList: form.equipmentList,
      methodSteps: methodSteps.filter((s) => s.description.trim()),
      keyPersonnel: keyPersonnel.filter((p) => p.name.trim()),
      emergencyProcedures: form.emergencyProcedures || null,
      emergencyHospitalInfo:
        form.hospitalName || form.hospitalAddress || form.hospitalPhone
          ? {
              name: form.hospitalName || null,
              address: form.hospitalAddress || null,
              phone: form.hospitalPhone || null,
              distance: null,
            }
          : null,
      siteSpecificConsiderations: form.siteSpecificConsiderations || null,
    }

    const result = existing
      ? await updateRamsDocument(existing.id, input)
      : await createRamsDocument(input)

    setSaving(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success(existing ? 'RAMS updated' : 'RAMS created')
    const id = existing ? existing.id : (result as { data: { id: string } }).data.id
    router.push(`/dashboard/rams/${id}`)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex flex-wrap items-center gap-2">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => i <= step && setStep(i)}
            className={cn(
              'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
              i === step
                ? 'border-primary bg-primary text-primary-foreground'
                : i < step
                  ? 'border-primary/40 bg-primary/10 text-foreground'
                  : 'border-border bg-muted text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full text-xs',
                i < step ? 'bg-primary text-primary-foreground' : 'bg-background/60',
              )}
            >
              {i < step ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Step 0: Details */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Document Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label>Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="e.g. Fire Alarm Installation — RAMS"
              />
            </div>
            <div className="grid gap-2">
              <Label>Document Template</Label>
              <Select value={form.templateId} onValueChange={applyTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {activityTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>System Type</Label>
              <Select
                value={form.systemTypeId}
                onValueChange={(v) => set('systemTypeId', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a system type" />
                </SelectTrigger>
                <SelectContent>
                  {systemTemplates.length === 0 && (
                    <SelectItem value="none" disabled>
                      No system types configured
                    </SelectItem>
                  )}
                  {systemTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Client *</Label>
              <Select
                value={form.clientId}
                onValueChange={(v) => {
                  set('clientId', v)
                  set('siteId', '')
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Site</Label>
              <Select value={form.siteId} onValueChange={(v) => set('siteId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a site" />
                </SelectTrigger>
                <SelectContent>
                  {filteredSites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Job Number</Label>
              <Input
                value={form.jobNumber}
                onChange={(e) => set('jobNumber', e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="grid gap-2">
              <Label>Work Location</Label>
              <Input
                value={form.workLocation}
                onChange={(e) => set('workLocation', e.target.value)}
                placeholder="Site address / area"
              />
            </div>
            <div className="grid gap-2">
              <Label>Planned Start</Label>
              <Input
                type="date"
                value={form.plannedStartDate}
                onChange={(e) => set('plannedStartDate', e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Planned End</Label>
              <Input
                type="date"
                value={form.plannedEndDate}
                disabled={form.noEndDate}
                onChange={(e) => set('plannedEndDate', e.target.value)}
              />
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={form.noEndDate}
                  onCheckedChange={(c) => set('noEndDate', Boolean(c))}
                />
                Ongoing / no fixed end date
              </label>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label>Work Description</Label>
              <Textarea
                value={form.workDescription}
                onChange={(e) => set('workDescription', e.target.value)}
                placeholder="Describe the works covered by this RAMS"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Hazards & Risk */}
      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add Hazards</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {systemHazards.length > 0 && form.systemTypeId && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground">
                    System-specific hazards
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {systemHazards
                      .filter((h) => h.system_type_id === form.systemTypeId)
                      .map((h) => (
                        <Button
                          key={h.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addSystemHazard(h)}
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          {h.hazard_name}
                        </Button>
                      ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-xs uppercase text-muted-foreground">
                  Hazard library
                </Label>
                <div className="flex flex-wrap gap-2">
                  {hazards.map((h) => (
                    <Button
                      key={h.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addLibraryHazard(h)}
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      {h.description}
                    </Button>
                  ))}
                </div>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={addBlankHazard}>
                <Plus className="mr-2 h-4 w-4" />
                Add custom hazard
              </Button>
            </CardContent>
          </Card>

          {selectedHazards.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No hazards added yet. Add hazards from the library or system list above.
            </p>
          ) : (
            selectedHazards.map((h) => (
              <Card key={h.id}>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <Input
                        value={h.description}
                        onChange={(e) =>
                          updateHazard(h.id, { description: e.target.value })
                        }
                        placeholder="Hazard description"
                        className="font-medium"
                      />
                      <Input
                        value={h.potential_consequences ?? ''}
                        onChange={(e) =>
                          updateHazard(h.id, {
                            potential_consequences: e.target.value,
                          })
                        }
                        placeholder="Potential consequences"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeHazard(h.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2 rounded-md border p-3">
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Initial risk
                      </p>
                      <div className="flex items-center gap-2">
                        <ScoreSelect
                          label="L"
                          value={h.likelihood}
                          onChange={(v) => updateHazard(h.id, { likelihood: v })}
                        />
                        <ScoreSelect
                          label="S"
                          value={h.severity}
                          onChange={(v) => updateHazard(h.id, { severity: v })}
                        />
                        <RiskScoreBadge
                          likelihood={h.likelihood}
                          severity={h.severity}
                        />
                      </div>
                    </div>
                    <div className="space-y-2 rounded-md border p-3">
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Residual risk
                      </p>
                      <div className="flex items-center gap-2">
                        <ScoreSelect
                          label="L"
                          value={h.residual_likelihood}
                          onChange={(v) =>
                            updateHazard(h.id, { residual_likelihood: v })
                          }
                        />
                        <ScoreSelect
                          label="S"
                          value={h.residual_severity}
                          onChange={(v) =>
                            updateHazard(h.id, { residual_severity: v })
                          }
                        />
                        <RiskScoreBadge
                          likelihood={h.residual_likelihood}
                          severity={h.residual_severity}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground">
                      Control measures (one per line)
                    </Label>
                    <Textarea
                      value={h.controls.join('\n')}
                      onChange={(e) =>
                        updateHazard(h.id, {
                          controls: e.target.value.split('\n').filter(Boolean),
                        })
                      }
                      rows={3}
                      placeholder="List the control measures to reduce this risk"
                    />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Step 2: PPE & Equipment */}
      {step === 2 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>PPE Requirements</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {PPE_OPTIONS.map((item) => (
                <label
                  key={item}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm',
                    form.ppeRequirements.includes(item) &&
                      'border-primary bg-primary/5',
                  )}
                >
                  <Checkbox
                    checked={form.ppeRequirements.includes(item)}
                    onCheckedChange={() => togglePpe(item)}
                  />
                  {item}
                </label>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Equipment & Tools</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={equipInput}
                  onChange={(e) => setEquipInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault()
                      addEquipment()
                    }
                  }}
                  placeholder="Add equipment and press Enter"
                />
                <Button type="button" onClick={addEquipment}>
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {form.equipmentList.map((item) => (
                  <Badge
                    key={item}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() =>
                      set(
                        'equipmentList',
                        form.equipmentList.filter((e) => e !== item),
                      )
                    }
                  >
                    {item}
                    <Trash2 className="ml-1 h-3 w-3" />
                  </Badge>
                ))}
                {form.equipmentList.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No equipment added yet.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 3: Method & Emergency */}
      {step === 3 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Method Statement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {methodSteps.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="mt-2 flex items-center gap-1 text-muted-foreground">
                    <GripVertical className="h-4 w-4" />
                    <span className="w-6 text-sm font-medium">{i + 1}</span>
                  </div>
                  <Textarea
                    value={s.description}
                    onChange={(e) => updateStep(i, e.target.value)}
                    placeholder={`Step ${i + 1} description`}
                    rows={2}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeStep(i)}
                    disabled={methodSteps.length === 1}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={addStep}>
                <Plus className="mr-2 h-4 w-4" />
                Add step
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Key Personnel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {keyPersonnel.map((p, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <Input
                    value={p.name}
                    onChange={(e) => updatePerson(i, { name: e.target.value })}
                    placeholder="Name"
                  />
                  <Input
                    value={p.role}
                    onChange={(e) => updatePerson(i, { role: e.target.value })}
                    placeholder="Role"
                  />
                  <Input
                    value={p.phone ?? ''}
                    onChange={(e) => updatePerson(i, { phone: e.target.value })}
                    placeholder="Phone"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removePerson(i)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={addPerson}>
                <Plus className="mr-2 h-4 w-4" />
                Add person
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Emergency Arrangements</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label>Emergency Procedures</Label>
                <Textarea
                  value={form.emergencyProcedures}
                  onChange={(e) => set('emergencyProcedures', e.target.value)}
                  rows={3}
                  placeholder="First aid, evacuation, incident reporting..."
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label>Nearest Hospital</Label>
                  <Input
                    value={form.hospitalName}
                    onChange={(e) => set('hospitalName', e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Hospital Address</Label>
                  <Input
                    value={form.hospitalAddress}
                    onChange={(e) => set('hospitalAddress', e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Hospital Phone</Label>
                  <Input
                    value={form.hospitalPhone}
                    onChange={(e) => set('hospitalPhone', e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Site-specific Considerations</Label>
                <Textarea
                  value={form.siteSpecificConsiderations}
                  onChange={(e) =>
                    set('siteSpecificConsiderations', e.target.value)
                  }
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Review & Save</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <ReviewRow label="Title" value={form.title} />
            <ReviewRow
              label="Client"
              value={clients.find((c) => c.id === form.clientId)?.name || '—'}
            />
            <ReviewRow
              label="Site"
              value={sites.find((s) => s.id === form.siteId)?.name || '—'}
            />
            <ReviewRow label="Hazards" value={`${selectedHazards.length} identified`} />
            <ReviewRow
              label="PPE"
              value={form.ppeRequirements.join(', ') || '—'}
            />
            <ReviewRow
              label="Method steps"
              value={`${methodSteps.filter((s) => s.description.trim()).length} steps`}
            />
            <p className="text-muted-foreground">
              Saving creates the RAMS as a draft. You can then send it for approval
              from the document page.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Nav */}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canProceed}
          >
            Next
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {existing ? 'Save Changes' : 'Create RAMS'}
          </Button>
        )}
      </div>
    </div>
  )
}

function ScoreSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger className="h-8 w-14">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[1, 2, 3, 4, 5].map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}
