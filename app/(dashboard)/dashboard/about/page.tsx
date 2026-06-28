import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DownloadManualButton } from '@/components/dashboard/help/download-manual-button'

export const metadata = {
  title: 'About PyrocelCRM',
  description: 'An overview of what the PyrocelCRM platform does and its key features.',
}

const paragraphs: string[] = [
  'PyrocelCRM is an end-to-end operations and compliance platform built for a fire and life-safety services business. It ties together everything the office, field engineers, and clients need into a single system: a client and site directory, an interactive electronic log book, asset registers for dampers, extinguishers and emergency lighting, scheduling, quoting, stock control, and a secure customer portal. Rather than juggling spreadsheets, paper certificates, and disconnected tools, the whole service lifecycle - from booking a visit to certifying the work and billing for remedials - lives in one place.',
  'At its core is a structured client and site model. Each client can own multiple sites, and each site holds its own asset registers and service contracts, so the business always knows exactly what equipment exists where, when it was last serviced, and when it is next due. Clients get their own secure logins to a dedicated portal where they can review their sites, see compliance status, approve work, and download documentation - giving them transparency without needing to phone the office.',
  'The interactive electronic log book replaces the traditional paper logbook kept on site. Every inspection, service, and remedial action is recorded against the specific asset and site, building a continuous, tamper-resistant audit trail. Because everything is captured digitally at the point of work, the client and the regulator can see a live, accurate history at any time, and engineers no longer lose paperwork between the site and the office.',
  'The platform surfaces live client and regulatory KPI performance metrics, turning that captured data into dashboards. Clients can see how their estate is performing against compliance obligations - what is serviced, what is overdue, what is outstanding - while the business tracks its own service delivery against regulatory standards. This makes compliance gaps visible early, before they become a liability, and gives clients confidence that their statutory duties are being met.',
  'When an engineer finds a defect, the system supports automatic raising of quotes for remedial actions, drawing on the priced product catalogue and stock so estimates are fast and consistent. Those quotes can be sent to the client with an email authorisation link, letting them approve remedial work with a single click rather than waiting on printed paperwork or chasing sign-off. Approved work flows straight back into the schedule, closing the loop from defect to quote to authorisation to booked job.',
  'A shared calendar and scheduling feature lets engineers book jobs that synchronise directly with the office, so field and back-office teams always see the same up-to-date plan. Recurring services are generated automatically from each site service frequencies, and the office can fill gaps or generate upcoming calls in bulk, ensuring nothing falls through the cracks.',
  'Supporting all of this is a stock control system that tracks parts and consumables, links them to the quoting catalogue, and keeps pricing in sync, plus an employee vault of staff documents and resources, equipment specification sheets, and role-based access that gives admins, office staff, engineers, and clients exactly the right level of visibility. Together these features make PyrocelCRM both an operational engine for running the business day-to-day and a compliance record that protects the client and demonstrates regulatory diligence.',
]

export default async function AboutPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">About PyrocelCRM</h1>
          <p className="text-muted-foreground">
            What the platform does and its key features
          </p>
        </div>
        <DownloadManualButton fileName="PyrocelCRM-Overview" />
      </div>

      <article className="max-w-3xl space-y-4 rounded-lg border bg-card p-6 text-card-foreground">
        {paragraphs.map((text, index) => (
          <p key={index} className="leading-relaxed text-pretty">
            {text}
          </p>
        ))}
      </article>
    </div>
  )
}
