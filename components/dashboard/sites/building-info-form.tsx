'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  saveSiteBuildingInfo,
  type BuildingInfoValues,
} from '@/app/(dashboard)/dashboard/sites/[id]/logbook-actions'
import type { EmergencyContact, SiteBuildingInfo } from '@/lib/types/database'

interface BuildingInfoFormProps {
  siteId: string
  info: SiteBuildingInfo | null
  /**
   * Persist handler. Defaults to the staff dashboard action, but the public
   * (QR) log book passes an occupier-facing action so clients can edit too.
   */
  onSave?: (
    siteId: string,
    values: BuildingInfoValues,
  ) => Promise<{ ok: boolean; error?: string }>
  submitLabel?: string
}

function initialValues(info: SiteBuildingInfo | null): BuildingInfoValues {
  return {
    responsible_person_name: info?.responsible_person_name ?? '',
    responsible_person_role: info?.responsible_person_role ?? '',
    responsible_person_phone: info?.responsible_person_phone ?? '',
    responsible_person_email: info?.responsible_person_email ?? '',
    competent_person_name: info?.competent_person_name ?? '',
    competent_person_company: info?.competent_person_company ?? '',
    competent_person_phone: info?.competent_person_phone ?? '',
    competent_person_email: info?.competent_person_email ?? '',
    fra_location: info?.fra_location ?? '',
    fra_last_date: info?.fra_last_date ?? '',
    fra_next_date: info?.fra_next_date ?? '',
    fra_assessor: info?.fra_assessor ?? '',
    fra_notes: info?.fra_notes ?? '',
    emergency_contacts: Array.isArray(info?.emergency_contacts) ? info!.emergency_contacts : [],
  }
}

export function BuildingInfoForm({
  siteId,
  info,
  onSave = saveSiteBuildingInfo,
  submitLabel = 'Save building information',
}: BuildingInfoFormProps) {
  const router = useRouter()
  const [values, setValues] = useState<BuildingInfoValues>(() => initialValues(info))
  const [submitting, setSubmitting] = useState(false)

  function set<K extends keyof BuildingInfoValues>(key: K, value: BuildingInfoValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function updateContact(index: number, patch: Partial<EmergencyContact>) {
    setValues((prev) => {
      const next = [...prev.emergency_contacts]
      next[index] = { ...next[index], ...patch }
      return { ...prev, emergency_contacts: next }
    })
  }

  function addContact() {
    set('emergency_contacts', [...values.emergency_contacts, { name: '', role: '', phone: '' }])
  }

  function removeContact(index: number) {
    set(
      'emergency_contacts',
      values.emergency_contacts.filter((_, i) => i !== index),
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const result = await onSave(siteId, values)
    setSubmitting(false)
    if (!result.ok) {
      toast.error(result.error ?? 'Could not save building information.')
      return
    }
    toast.success('Building information saved')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-8">
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Responsible person</h3>
          <p className="text-sm text-muted-foreground">
            The person with legal responsibility for fire safety at this premises.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="rp_name">Name</Label>
            <Input
              id="rp_name"
              value={values.responsible_person_name}
              onChange={(e) => set('responsible_person_name', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rp_role">Role</Label>
            <Input
              id="rp_role"
              value={values.responsible_person_role}
              onChange={(e) => set('responsible_person_role', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rp_phone">Phone</Label>
            <Input
              id="rp_phone"
              value={values.responsible_person_phone}
              onChange={(e) => set('responsible_person_phone', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rp_email">Email</Label>
            <Input
              id="rp_email"
              type="email"
              value={values.responsible_person_email}
              onChange={(e) => set('responsible_person_email', e.target.value)}
            />
          </div>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Competent person</h3>
          <p className="text-sm text-muted-foreground">
            The person or company appointed to assist with fire safety duties.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cp_name">Name</Label>
            <Input
              id="cp_name"
              value={values.competent_person_name}
              onChange={(e) => set('competent_person_name', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp_company">Company</Label>
            <Input
              id="cp_company"
              value={values.competent_person_company}
              onChange={(e) => set('competent_person_company', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp_phone">Phone</Label>
            <Input
              id="cp_phone"
              value={values.competent_person_phone}
              onChange={(e) => set('competent_person_phone', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp_email">Email</Label>
            <Input
              id="cp_email"
              type="email"
              value={values.competent_person_email}
              onChange={(e) => set('competent_person_email', e.target.value)}
            />
          </div>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Fire Risk Assessment</h3>
          <p className="text-sm text-muted-foreground">Details of the current Fire Risk Assessment.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fra_assessor">Assessor</Label>
            <Input
              id="fra_assessor"
              value={values.fra_assessor}
              onChange={(e) => set('fra_assessor', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fra_location">Document location</Label>
            <Input
              id="fra_location"
              value={values.fra_location}
              onChange={(e) => set('fra_location', e.target.value)}
              placeholder="e.g. Reception folder / shared drive"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fra_last">Last review date</Label>
            <Input
              id="fra_last"
              type="date"
              value={values.fra_last_date}
              onChange={(e) => set('fra_last_date', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fra_next">Next review date</Label>
            <Input
              id="fra_next"
              type="date"
              value={values.fra_next_date}
              onChange={(e) => set('fra_next_date', e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fra_notes">Notes</Label>
          <Textarea
            id="fra_notes"
            rows={3}
            value={values.fra_notes}
            onChange={(e) => set('fra_notes', e.target.value)}
            placeholder="Significant findings, outstanding actions…"
          />
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Emergency contacts</h3>
            <p className="text-sm text-muted-foreground">Key contacts in the event of an emergency.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addContact} className="gap-1">
            <Plus className="h-4 w-4" />
            Add contact
          </Button>
        </div>

        {values.emergency_contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No emergency contacts added yet.</p>
        ) : (
          <div className="space-y-3">
            {values.emergency_contacts.map((contact, index) => (
              <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                <div className="space-y-2">
                  <Label htmlFor={`ec_name_${index}`} className="text-xs">
                    Name
                  </Label>
                  <Input
                    id={`ec_name_${index}`}
                    value={contact.name}
                    onChange={(e) => updateContact(index, { name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`ec_role_${index}`} className="text-xs">
                    Role
                  </Label>
                  <Input
                    id={`ec_role_${index}`}
                    value={contact.role}
                    onChange={(e) => updateContact(index, { role: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`ec_phone_${index}`} className="text-xs">
                    Phone
                  </Label>
                  <Input
                    id={`ec_phone_${index}`}
                    value={contact.phone}
                    onChange={(e) => updateContact(index, { phone: e.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeContact(index)}
                  aria-label="Remove contact"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <Button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : submitLabel}
      </Button>
    </form>
  )
}
