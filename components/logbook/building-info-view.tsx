import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateUK } from '@/lib/utils'
import type { SiteBuildingInfo } from '@/lib/types/database'
import { User, ShieldCheck, FileText, Phone } from 'lucide-react'

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value?.trim() ? value : '—'}</dd>
    </div>
  )
}

/**
 * Read-only "General Building Information" panel shown to clients in the portal
 * log book. Staff maintain the underlying data from the dashboard.
 */
export function BuildingInfoView({ info }: { info: SiteBuildingInfo | null }) {
  if (!info) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          General building information has not been recorded yet. Please contact Pyrocel if you need
          this added.
        </CardContent>
      </Card>
    )
  }

  const contacts = Array.isArray(info.emergency_contacts) ? info.emergency_contacts : []

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <User className="h-4 w-4 text-primary" aria-hidden="true" />
          <CardTitle className="text-base">Responsible person</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4">
            <Field label="Name" value={info.responsible_person_name} />
            <Field label="Role" value={info.responsible_person_role} />
            <Field label="Phone" value={info.responsible_person_phone} />
            <Field label="Email" value={info.responsible_person_email} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
          <CardTitle className="text-base">Competent person</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4">
            <Field label="Name" value={info.competent_person_name} />
            <Field label="Company" value={info.competent_person_company} />
            <Field label="Phone" value={info.competent_person_phone} />
            <Field label="Email" value={info.competent_person_email} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
          <CardTitle className="text-base">Fire Risk Assessment</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4">
            <Field label="Assessor" value={info.fra_assessor} />
            <Field label="Document location" value={info.fra_location} />
            <Field
              label="Last review"
              value={info.fra_last_date ? formatDateUK(info.fra_last_date) : null}
            />
            <Field
              label="Next review"
              value={info.fra_next_date ? formatDateUK(info.fra_next_date) : null}
            />
            <div className="col-span-2">
              <Field label="Notes" value={info.fra_notes} />
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <Phone className="h-4 w-4 text-primary" aria-hidden="true" />
          <CardTitle className="text-base">Emergency contacts</CardTitle>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No emergency contacts recorded.</p>
          ) : (
            <ul className="space-y-3">
              {contacts.map((c, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 border-b pb-2 last:border-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.name || '—'}</p>
                    {c.role ? <p className="text-xs text-muted-foreground">{c.role}</p> : null}
                  </div>
                  <span className="text-sm text-foreground">{c.phone || '—'}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
