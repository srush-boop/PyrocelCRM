import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DownloadManualButton } from '@/components/dashboard/help/download-manual-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Building2,
  ClipboardCheck,
  GaugeCircle,
  FileSignature,
  CalendarRange,
  Boxes,
  ShieldCheck,
  Users,
} from 'lucide-react'

export const metadata = {
  title: 'About PyrocelCRM',
  description: 'An overview of what the PyrocelCRM platform does and its key features.',
}

// Short, scannable capability summaries shown in the feature grid.
const features: { icon: typeof Building2; title: string; body: string }[] = [
  {
    icon: Building2,
    title: 'Clients, sites & assets',
    body: 'A structured client and site directory with asset registers for dampers, extinguishers and emergency lighting — so you always know what equipment exists where, and when it is next due.',
  },
  {
    icon: ClipboardCheck,
    title: 'Electronic log book',
    body: 'Replaces the paper on-site logbook. Every inspection, service and remedial is recorded against the asset and site, building a continuous, tamper-resistant audit trail.',
  },
  {
    icon: GaugeCircle,
    title: 'Live compliance KPIs',
    body: 'Captured data becomes dashboards for clients and the business alike, surfacing regulatory performance and making compliance gaps visible early — before they become a liability.',
  },
  {
    icon: FileSignature,
    title: 'Defect-to-quote workflow',
    body: 'Defects raise priced remedial quotes from the catalogue and stock, sent to clients with a one-click email authorisation link. Approved work flows straight back into the schedule.',
  },
  {
    icon: CalendarRange,
    title: 'Scheduling & routes',
    body: 'A shared calendar keeps field and office teams in sync. Recurring services generate automatically from each site’s frequencies, with bulk call generation to fill any gaps.',
  },
  {
    icon: Boxes,
    title: 'Stock & catalogue',
    body: 'Parts and consumables are tracked and linked to the quoting catalogue, keeping pricing consistent across estimates, remedials and billing.',
  },
  {
    icon: Users,
    title: 'Secure client portal',
    body: 'Clients get their own logins to review sites, see compliance status, approve work and download documentation — transparency without a phone call to the office.',
  },
  {
    icon: ShieldCheck,
    title: 'Role-based access',
    body: 'Admins, office staff, engineers and clients each see exactly the right level of information, backed by an employee vault of staff documents and equipment specifications.',
  },
]

export default async function AboutPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-balance">About PyrocelCRM</h1>
          <p className="text-muted-foreground">What the platform does and its key features</p>
        </div>
        <DownloadManualButton fileName="PyrocelCRM-Overview" />
      </div>

      {/* Lead / positioning statement. */}
      <section className="overflow-hidden rounded-xl border bg-card text-card-foreground">
        <div className="border-l-4 border-primary p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Fire &amp; life-safety operations platform
          </p>
          <p className="mt-3 max-w-3xl text-lg leading-relaxed text-pretty md:text-xl">
            PyrocelCRM is an end-to-end operations and compliance platform for a fire and
            life-safety services business. It brings the office, field engineers and clients into a
            single system — so the whole service lifecycle, from booking a visit to certifying the
            work and billing for remedials, lives in one place instead of across spreadsheets, paper
            certificates and disconnected tools.
          </p>
        </div>
      </section>

      {/* Capability grid. */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Key capabilities
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="h-full">
              <CardHeader className="pb-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </span>
                <CardTitle className="pt-2 text-base">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Narrative detail for readers who want the full picture. */}
      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">One record, from defect to sign-off</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground text-pretty">
            <p>
              Each client can own multiple sites, and each site holds its own asset registers and
              service contracts. Because work is captured digitally at the point of service, the
              client and the regulator can see a live, accurate history at any time — and engineers
              no longer lose paperwork between the site and the office.
            </p>
            <p>
              When an engineer finds a defect, the system raises a priced remedial quote and sends
              it for one-click authorisation. Approved work returns to the schedule automatically,
              closing the loop from defect to quote to authorisation to booked job.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Built for compliance and confidence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground text-pretty">
            <p>
              Live regulatory and client KPIs turn captured data into clear dashboards. Clients can
              see how their estate performs against compliance obligations — what is serviced, what
              is overdue, what is outstanding — while the business tracks its own delivery against
              regulatory standards.
            </p>
            <p>
              Together with stock control, an employee document vault and role-based access,
              PyrocelCRM is both an operational engine for running the business day-to-day and a
              compliance record that protects the client and demonstrates regulatory diligence.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
