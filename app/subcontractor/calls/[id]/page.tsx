import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  ExternalLink,
  MapPin,
  Siren,
  User,
  Wrench,
} from 'lucide-react'
import { formatDateUK } from '@/lib/utils'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeTaskAccess } from '@/lib/subcontractor/authorize'
import { getCompanyWorkers, type SubcontractorContext } from '@/lib/subcontractor/portal-data'
import { SubcontractorUploads } from '@/components/subcontractor/subcontractor-uploads'
import { ReassignWorker } from '@/components/subcontractor/reassign-worker'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  paused: 'Paused',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export default async function SubcontractorCallPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const auth = await authorizeTaskAccess(id)
  if (auth.status === 401) redirect('/auth/login')
  if (!auth.ok || !auth.caller) {
    // 403/404 both resolve to not-found so we don't leak call existence.
    notFound()
  }

  const admin = createAdminClient()
  const { data: task } = await admin
    .from('tasks')
    .select(
      `
      id, status, scheduled_date, is_emergency, is_remedial, assigned_engineer_id, notes,
      assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(id, full_name),
      site_service:site_services(
        site:sites(id, name, address, postcode, client:clients(id, name)),
        service_type:service_types(id, name, system_type:system_types(id, name))
      )
    `,
    )
    .eq('id', id)
    .single()

  if (!task) notFound()

  const site = (task as any).site_service?.site
  const serviceType = (task as any).site_service?.service_type
  const assignedName = (task as any).assigned_engineer?.full_name ?? null

  // The reassign picker is lead-only.
  const workers = auth.caller.isLead
    ? await getCompanyWorkers({
        profile: auth.caller.profile,
        supplierId: auth.caller.supplierId,
        isLead: true,
      } as SubcontractorContext)
    : []

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 gap-2 text-muted-foreground">
          <Link href="/subcontractor">
            <ArrowLeft className="h-4 w-4" />
            Back to calls
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{site?.name || 'Call'}</h1>
          <Badge variant="secondary">{STATUS_LABELS[(task as any).status] ?? (task as any).status}</Badge>
          {(task as any).is_emergency && (
            <Badge variant="destructive" className="gap-1">
              <Siren className="h-3 w-3" aria-hidden="true" />
              Emergency
            </Badge>
          )}
          {(task as any).is_remedial && (
            <Badge variant="secondary" className="gap-1">
              <Wrench className="h-3 w-3" aria-hidden="true" />
              Remedial
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Call details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Detail icon={Wrench} label="Service">
                {serviceType?.name || 'Service'}
                {serviceType?.system_type?.name ? ` · ${serviceType.system_type.name}` : ''}
              </Detail>
              <Detail icon={CalendarClock} label="Scheduled">
                {(task as any).scheduled_date ? formatDateUK((task as any).scheduled_date) : 'Unscheduled'}
              </Detail>
              <Detail icon={Building2} label="Client">
                {site?.client?.name || '—'}
              </Detail>
              <Detail icon={User} label="Assigned to">
                {assignedName || 'Unassigned'}
              </Detail>
              <Detail icon={MapPin} label="Address">
                {[site?.address, site?.postcode].filter(Boolean).join(', ') || '—'}
              </Detail>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quotes &amp; information</CardTitle>
            </CardHeader>
            <CardContent>
              <SubcontractorUploads taskId={id} currentUserId={auth.caller.profile.id} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Carry out this call</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Open the inspection to record results and complete the call.
              </p>
              <Button asChild className="w-full gap-2">
                <Link href={`/dashboard/tasks/${id}`}>
                  <ExternalLink className="h-4 w-4" />
                  Open inspection
                </Link>
              </Button>
            </CardContent>
          </Card>

          {auth.caller.isLead && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Issue to a worker</CardTitle>
              </CardHeader>
              <CardContent>
                <ReassignWorker
                  taskId={id}
                  workers={workers.map((w) => ({ id: w.id, fullName: w.fullName, email: w.email }))}
                  currentAssigneeId={(task as any).assigned_engineer_id ?? null}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </p>
      <p className="text-sm text-foreground">{children}</p>
    </div>
  )
}
