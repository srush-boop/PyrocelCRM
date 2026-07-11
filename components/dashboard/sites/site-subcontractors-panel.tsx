'use client'

import { useMemo, useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { HardHat, Mail, Phone, Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { emailSubcontractor } from '@/lib/actions/subcontractor'
import type { ServiceType, SiteService, Supplier } from '@/lib/types/database'

type ServiceRow = SiteService & {
  service_type: ServiceType
  subcontractor?: Supplier | null
}

interface SiteSubcontractorsPanelProps {
  siteId: string
  siteName: string
  siteServices: ServiceRow[]
}

interface SubInUse {
  sub: Supplier
  serviceNames: string[]
}

export function SiteSubcontractorsPanel({
  siteId,
  siteName,
  siteServices,
}: SiteSubcontractorsPanelProps) {
  // Derive the distinct sub-contractors actually in use across this site's
  // services (worker_type 'subcontractor' with an assigned party).
  const subsInUse = useMemo<SubInUse[]>(() => {
    const byId = new Map<string, SubInUse>()
    for (const svc of siteServices) {
      if (svc.worker_type !== 'subcontractor') continue
      const sub = svc.subcontractor
      if (!sub) continue
      const existing = byId.get(sub.id)
      const serviceName = svc.service_type?.name ?? 'Service'
      if (existing) {
        if (!existing.serviceNames.includes(serviceName)) {
          existing.serviceNames.push(serviceName)
        }
      } else {
        byId.set(sub.id, { sub, serviceNames: [serviceName] })
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.sub.name.localeCompare(b.sub.name))
  }, [siteServices])

  const [emailTarget, setEmailTarget] = useState<Supplier | null>(null)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  const openEmail = (sub: Supplier) => {
    setEmailTarget(sub)
    setSubject(`${siteName} — `)
    setMessage('')
  }

  const handleSend = async () => {
    if (!emailTarget) return
    setSending(true)
    const res = await emailSubcontractor({
      subcontractorId: emailTarget.id,
      siteId,
      subject,
      message,
    })
    setSending(false)
    if (!res.ok) {
      toast.error(res.error || 'Failed to send email')
      return
    }
    toast.success(`Email sent to ${emailTarget.name}`)
    setEmailTarget(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HardHat className="h-4 w-4" />
          Sub-contractors
        </CardTitle>
        <CardDescription>
          Sub-contractors delivering services at this site. Assign them per service in the list
          below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {subsInUse.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No sub-contractors are used at this site.
          </p>
        ) : (
          <ul className="divide-y">
            {subsInUse.map(({ sub, serviceNames }) => (
              <li
                key={sub.id}
                className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{sub.name}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {sub.contact_email && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        {sub.contact_email}
                      </span>
                    )}
                    {sub.contact_phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        {sub.contact_phone}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {serviceNames.map((name) => (
                      <Badge key={name} variant="secondary" className="text-xs font-normal">
                        {name}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1"
                  onClick={() => openEmail(sub)}
                  disabled={!sub.contact_email}
                  title={sub.contact_email ? undefined : 'No contact email on file'}
                >
                  <Mail className="h-3.5 w-3.5" />
                  Email
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {/* Compose email dialog */}
      <Dialog open={!!emailTarget} onOpenChange={(o) => !o && setEmailTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Email {emailTarget?.name}</DialogTitle>
            <DialogDescription>
              Sends from PyrocelCRM to {emailTarget?.contact_email}. You&apos;ll be CC&apos;d so
              replies reach you.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="sub-email-subject">Subject</Label>
              <Input
                id="sub-email-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sub-email-message">Message</Label>
              <Textarea
                id="sub-email-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your message…"
                rows={7}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailTarget(null)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={sending} className="gap-1">
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
