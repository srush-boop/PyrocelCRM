'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Siren } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { bookCall } from '@/app/(dashboard)/dashboard/schedule/book-call-actions'
import { markRequestActioned } from '@/lib/actions/inbound-requests'
import type {
  InboundRequest,
  Site,
  ServiceType,
  SystemType,
  Profile,
} from '@/lib/types/database'

const NO_SYSTEM = '__none__'
const NO_ENGINEER = '__none__'
const NO_CLIENT = '__none__'

// Today's date as yyyy-MM-dd in local time.
function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function ApproveCallDialog({
  open,
  onOpenChange,
  request,
  sites,
  clients,
  reactiveServiceTypes,
  systemTypes,
  engineers,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  request: InboundRequest
  sites: Site[]
  clients: { id: string; name: string }[]
  reactiveServiceTypes: ServiceType[]
  systemTypes: SystemType[]
  engineers: Profile[]
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  // Prefill from the AI match.
  const [siteId, setSiteId] = useState<string>(request.matched_site_id ?? '')
  const [serviceTypeId, setServiceTypeId] = useState<string>(request.matched_service_type_id ?? '')
  const [systemTypeId, setSystemTypeId] = useState<string>(request.matched_system_type_id ?? NO_SYSTEM)
  const [clientId, setClientId] = useState<string>(request.matched_client_id ?? NO_CLIENT)
  const [engineerId, setEngineerId] = useState<string>(NO_ENGINEER)
  const [scheduledDate, setScheduledDate] = useState<string>(todayISO())
  const [kpiHours, setKpiHours] = useState<string>('')
  const [notes, setNotes] = useState<string>(
    request.ai_summary ? `${request.ai_summary}` : request.body_text?.slice(0, 500) ?? '',
  )
  const [sendConfirmation, setSendConfirmation] = useState(false)

  const selectedType = useMemo(
    () => reactiveServiceTypes.find((t) => t.id === serviceTypeId) ?? null,
    [reactiveServiceTypes, serviceTypeId],
  )

  // When the site changes, auto-fill its client if we have one.
  function handleSiteChange(value: string) {
    setSiteId(value)
    const site = sites.find((s) => s.id === value)
    if (site?.client_id) setClientId(site.client_id)
  }

  function handleTypeChange(value: string) {
    setServiceTypeId(value)
    const t = reactiveServiceTypes.find((st) => st.id === value)
    // Prefill KPI hours from the call type default for emergencies.
    if (t?.default_kpi_hours != null) setKpiHours(String(t.default_kpi_hours))
  }

  async function handleApprove() {
    if (!siteId) {
      toast.error('Select a site.')
      return
    }
    if (!serviceTypeId) {
      toast.error('Select a call type.')
      return
    }
    setSaving(true)
    try {
      const res = await bookCall({
        mode: 'reactive',
        siteId,
        serviceTypeId,
        systemTypeId: systemTypeId === NO_SYSTEM ? null : systemTypeId,
        clientId: clientId === NO_CLIENT ? null : clientId,
        assignedEngineerId: engineerId === NO_ENGINEER ? null : engineerId,
        scheduledDate,
        respondByHours: kpiHours === '' ? null : Number(kpiHours),
        notes: notes.trim() || null,
        sendConfirmation,
      })
      if (!res.ok || !res.taskId) {
        toast.error(res.error ?? 'Could not book the call.')
        return
      }
      const link = await markRequestActioned(request.id, res.taskId)
      if (!link.ok) {
        toast.warning(link.error ?? 'Call booked, but the request was not updated.')
      } else {
        toast.success('Call created from request.')
      }
      onOpenChange(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create call from request</DialogTitle>
          <DialogDescription className="text-pretty">
            Review the AI-matched details and create the call. Nothing is saved until you confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Call type *</Label>
            <Select value={serviceTypeId} onValueChange={handleTypeChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a call type" />
              </SelectTrigger>
              <SelectContent>
                {reactiveServiceTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="flex items-center gap-2">
                      {t.name}
                      {t.is_emergency && <Siren className="h-3.5 w-3.5 text-destructive" />}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedType?.is_emergency && (
              <Badge variant="destructive" className="w-fit gap-1">
                <Siren className="h-3 w-3" />
                Emergency call — engineer is notified on assignment
              </Badge>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Site *</Label>
            <Select value={siteId} onValueChange={handleSiteChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a site" />
              </SelectTrigger>
              <SelectContent>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name}
                    {site.postcode ? ` — ${site.postcode}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {systemTypes.length > 0 && (
            <div className="grid gap-2">
              <Label>System</Label>
              <Select value={systemTypeId} onValueChange={setSystemTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a system (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SYSTEM}>Unspecified</SelectItem>
                  {systemTypes.map((st) => (
                    <SelectItem key={st.id} value={st.id}>
                      {st.code ? `${st.code} — ${st.name}` : st.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="scheduled-date">Scheduled date *</Label>
              <Input
                id="scheduled-date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="kpi-hours">Attend within (hours)</Label>
              <Input
                id="kpi-hours"
                type="number"
                min={1}
                max={720}
                value={kpiHours}
                onChange={(e) => setKpiHours(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Assign engineer</Label>
            <Select value={engineerId} onValueChange={setEngineerId}>
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ENGINEER}>Unassigned</SelectItem>
                {engineers.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder="No client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CLIENT}>No client</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="call-notes">Call notes</Label>
            <Textarea
              id="call-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="What the engineer should know…"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={sendConfirmation}
              onChange={(e) => setSendConfirmation(e.target.checked)}
            />
            Send booking confirmation email to the site/client
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleApprove} disabled={saving}>
            {saving ? 'Creating…' : 'Create call'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
