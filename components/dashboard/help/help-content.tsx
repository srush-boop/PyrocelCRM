import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Profile } from '@/lib/types/database'
import {
  KeyRound,
  Workflow,
  UserCog,
  CalendarCheck,
  ShieldCheck,
  QrCode,
  BookOpen,
  HardHat,
  LayoutGrid,
} from 'lucide-react'

interface HelpContentProps {
  role: Profile['role']
}

export function HelpContent({ role }: HelpContentProps) {
  const roleLabel =
    role === 'admin'
      ? 'Administrator'
      : role === 'office'
        ? 'Office'
        : role === 'subcontractor'
          ? 'Sub-contractor'
          : role === 'client'
            ? 'Client'
            : 'Engineer'
  const isStaff = role === 'admin' || role === 'office'

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border bg-card text-card-foreground">
        <div className="border-l-4 border-primary p-6">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              User manual
            </p>
          </div>
          <h2 className="mt-2 text-lg font-semibold">
            You are signed in as {roleLabel}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground text-pretty">
            This guide is tailored to your role. The{' '}
            <span className="font-medium text-foreground">Key concepts</span> below apply to
            everyone; the <span className="font-medium text-foreground">{roleLabel}</span> section
            explains your day-to-day workflow.
          </p>
        </div>
      </section>

      <KeyConcepts />

      {role === 'admin' && <AdminSection />}
      {role === 'office' && <OfficeSection />}
      {role === 'engineer' && <EngineerSection />}
      {role === 'subcontractor' && <SubcontractorSection />}

      {isStaff && <SectionGuideBlock />}

      <QrLogBookSection />
      <Glossary />
    </div>
  )
}

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof KeyRound
  title: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <CardTitle>{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm leading-relaxed">{children}</CardContent>
    </Card>
  )
}

function KeyConcepts() {
  return (
    <SectionCard icon={Workflow} title="Key concepts (read this first)">
      <div>
        <h3 className="mb-2 font-semibold text-foreground">User types</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Works in</TableHead>
              <TableHead>What they do</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Admin</TableCell>
              <TableCell>Dashboard</TableCell>
              <TableCell>Full access, including users, service types and checklists.</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Office</TableCell>
              <TableCell>Dashboard</TableCell>
              <TableCell>Day-to-day operations: clients, sites, scheduling, reporting.</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Engineer</TableCell>
              <TableCell>Schedule</TableCell>
              <TableCell>Carries out and records on-site services.</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Sub-contractor</TableCell>
              <TableCell>Schedule</TableCell>
              <TableCell>External engineer with a restricted view — only their assigned work.</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Client</TableCell>
              <TableCell>Portal</TableCell>
              <TableCell>Views their own reports, performance and log book.</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-foreground">How work flows through the system</h3>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>A <span className="text-foreground">Client</span> owns one or more <span className="text-foreground">Sites</span>.</li>
          <li>Each Site has one or more <span className="text-foreground">Services</span> (e.g. weekly fire alarm test, extinguisher service).</li>
          <li>Each Service runs on a <span className="text-foreground">frequency</span>; the next <span className="text-foreground">Task</span> (a scheduled visit, or &ldquo;call&rdquo;) is created automatically when one completes.</li>
          <li>Tasks are <span className="text-foreground">assigned to an engineer</span> directly, via a <span className="text-foreground">Route</span>, or via an <span className="text-foreground">Area</span>.</li>
          <li>The engineer completes the task on-site, producing a <span className="text-foreground">Report</span>.</li>
          <li>The report is emailed to the client and shown in the <span className="text-foreground">Client Portal</span> and the site&apos;s <span className="text-foreground">Log Book</span>.</li>
        </ol>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-foreground">How tasks get assigned</h3>
        <p className="text-muted-foreground">A task&apos;s engineer is resolved in priority order:</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li><span className="text-foreground">Direct assignment</span> on the service (always wins).</li>
          <li>The engineer assigned to the service&apos;s <span className="text-foreground">Route</span>.</li>
          <li>The engineer assigned to the service&apos;s <span className="text-foreground">Area</span>.</li>
        </ol>
        <p className="mt-2 text-muted-foreground">
          Because of this, <span className="text-foreground">reallocating a route automatically reassigns all of that route&apos;s open (pending) calls</span> to the new engineer.
        </p>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-foreground">Task / report outcomes</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Outcome</TableHead>
              <TableHead>Meaning</TableHead>
              <TableHead>Failure?</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell><Badge className="bg-green-600 text-white hover:bg-green-600/90">Pass</Badge></TableCell>
              <TableCell>Service completed, everything in order.</TableCell>
              <TableCell>No</TableCell>
            </TableRow>
            <TableRow>
              <TableCell><Badge className="bg-amber-500 text-white hover:bg-amber-500/90">Partial</Badge></TableCell>
              <TableCell>Completed, but some items need remedial action.</TableCell>
              <TableCell>Yes</TableCell>
            </TableRow>
            <TableRow>
              <TableCell><Badge variant="destructive">Fail</Badge></TableCell>
              <TableCell>Completed, defects found.</TableCell>
              <TableCell>Yes</TableCell>
            </TableRow>
            <TableRow>
              <TableCell><Badge className="bg-amber-500 text-white hover:bg-amber-500/90">No Access</Badge></TableCell>
              <TableCell>Engineer attended but could not get into the site.</TableCell>
              <TableCell>No</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-foreground">KPIs: Regulatory vs Client</h3>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li><span className="text-foreground">Regulatory KPI</span> — the legal/standard deadline tolerance for a service type. This is the default baseline.</li>
          <li><span className="text-foreground">Client KPI (optional)</span> — a tighter, per-site override. If left blank, the site inherits the regulatory standard.</li>
        </ul>
      </div>
    </SectionCard>
  )
}

function AdminSection() {
  return (
    <SectionCard icon={UserCog} title="Administrator">
      <p className="text-muted-foreground">
        Admins have full access to every area via the left-hand sidebar.
      </p>

      <div>
        <h3 className="mb-2 font-semibold text-foreground">Managing clients and sites</h3>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Create the <span className="text-foreground">Client</span> under Clients.</li>
          <li>Under Sites, add a site. The address and a <span className="text-foreground">Contact Email</span> are mandatory — reports are sent here.</li>
          <li>Optionally record the <span className="text-foreground">UPRN</span> (Unique Property Reference Number).</li>
          <li>The <span className="text-foreground">Site ID (CASH)</span> also acts as the access code for that site&apos;s public QR log book.</li>
          <li>Add Services to the site and set each one&apos;s frequency and, if needed, a <span className="text-foreground">Client KPI</span> override.</li>
        </ol>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-foreground">Admin-only areas</h3>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li><span className="text-foreground">Service Types</span> — define services, frequencies and the Regulatory KPI.</li>
          <li><span className="text-foreground">Checklists</span> — define the on-site checklist items for each service.</li>
          <li><span className="text-foreground">Users</span> — invite/manage staff (admin, office, engineer).</li>
          <li><span className="text-foreground">Client Logins</span> — create and manage client portal accounts.</li>
        </ul>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-foreground">Routes and Areas</h3>
        <p className="text-muted-foreground">
          Assign an engineer to a Route or Area; changing that assignment automatically moves all open
          calls to the new engineer. Use the Route Planner (&ldquo;Manage services&rdquo;) to add/remove
          services from a route — affected calls are re-synced to the route&apos;s engineer.
        </p>
      </div>
    </SectionCard>
  )
}

function OfficeSection() {
  return (
    <SectionCard icon={CalendarCheck} title="Office">
      <p className="text-muted-foreground">
        Office users handle day-to-day operations. The sidebar matches Admin{' '}
        <span className="text-foreground">except</span> for Users, Client Logins, Service Types and
        Checklists, which are admin-only.
      </p>

      <div>
        <h3 className="mb-2 font-semibold text-foreground">You can</h3>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Manage Clients and Sites (including services and KPI overrides).</li>
          <li>Maintain Assets, Routes, Areas and Sub-contractors.</li>
          <li>Use the Schedule to create tasks and monitor progress.</li>
          <li>Review Reports and KPIs, and manage shared Documents.</li>
        </ul>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-foreground">Scheduling work</h3>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Open Schedule for all tasks across Upcoming, Overdue and Completed tabs.</li>
          <li>Switch between Grid, List, By route and By area views.</li>
          <li>Sort by Due date or Postcode, filter by engineer/date, and search.</li>
          <li>Use Create Task for a one-off visit, or Scan QR to jump to a site&apos;s assets.</li>
        </ul>
      </div>
    </SectionCard>
  )
}

function EngineerSection() {
  return (
    <SectionCard icon={CalendarCheck} title="Engineer">
      <p className="text-muted-foreground">
        After signing in you land directly on the <span className="text-foreground">Schedule</span> —
        your single work surface. You also have Settings and the Scan QR button.
      </p>

      <div>
        <h3 className="mb-2 font-semibold text-foreground">The Schedule</h3>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Upcoming / Overdue / Completed tabs show your own tasks.</li>
          <li>Sort by Due date (default) or Postcode to plan your round.</li>
          <li>Grid, List, By route and By area views.</li>
          <li>Scan QR opens a site/asset directly by scanning its on-site code.</li>
        </ul>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-foreground">Completing a task</h3>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Open a task and press Start (or Continue).</li>
          <li>Work through the checklist, recording each item&apos;s result.</li>
          <li>Add photos where prompted (especially for any defects).</li>
          <li>Press Complete &amp; Submit when the required items are done.</li>
        </ol>
        <p className="mt-2 text-muted-foreground">
          On submit, the report is generated, the client is emailed, the next recurring task is
          scheduled automatically, and any defects trigger an internal alert.
        </p>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-foreground">Weekly fire alarm testing (call points / MCPs)</h3>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>The task shows the site&apos;s call point register. Add call points if any are missing.</li>
          <li>For each call point, run the checklist or use <span className="text-foreground">Pass all</span> to mark every item passed.</li>
          <li>Use the task-level <span className="text-foreground">Mark all passed</span> (with confirmation) to pass every call point at once.</li>
        </ul>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-foreground">&ldquo;No Access&rdquo;</h3>
        <p className="text-muted-foreground">If you attend but cannot get into the site:</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Press <span className="text-foreground">No Access</span> in the action bar.</li>
          <li>Add optional notes explaining why (e.g. building locked, no key holder).</li>
          <li>Confirm.</li>
        </ol>
        <p className="mt-2 text-muted-foreground">
          This closes the visit as No Access — it is <span className="text-foreground">not</span> a
          failure, no defect alert is raised, and the next scheduled visit is still created. The client
          receives a neutral &ldquo;visit could not be completed&rdquo; notice.
        </p>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-foreground">Further works &amp; follow-ups</h3>
        <p className="text-muted-foreground">
          If a call needs more work than you can do on the day, raise a{' '}
          <span className="text-foreground">follow-up</span> from the task. Note what is required and
          any parts needed; the office reviews it and books a linked follow-up call, reserving or
          ordering parts as needed.
        </p>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-foreground">Your Tasks (internal &amp; quality)</h3>
        <p className="text-muted-foreground">
          Alongside site visits you may be assigned recurring internal tasks — toolbox talks, vehicle
          checks and similar. These appear under <span className="text-foreground">My Tasks</span> and
          on your home screen; complete them like a checklist by their due date.
        </p>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-foreground">Lone-worker safety check-ins</h3>
        <p className="text-muted-foreground">
          If lone working is enabled for you, use <span className="text-foreground">Start shift</span>{' '}
          when you begin and <span className="text-foreground">Finish shift</span> when you are done.
          If a check-in is missed the system escalates to the office (and, out of hours, the on-call
          manager) so someone always knows you are safe.
        </p>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-foreground">Working offline</h3>
        <p className="text-muted-foreground">
          You can keep working with no signal — your progress is saved on the device and syncs
          automatically once you are back online. A status badge shows when changes are pending. Final
          submission requires a connection.
        </p>
      </div>
    </SectionCard>
  )
}

function SubcontractorSection() {
  return (
    <SectionCard icon={HardHat} title="Sub-contractor">
      <p className="text-muted-foreground">
        Sub-contractors are external engineers with a deliberately{' '}
        <span className="text-foreground">restricted</span> view. You sign in to the{' '}
        <span className="text-foreground">Schedule</span> and see only the work assigned to you —
        internal-only tools, pricing, parts and reporting extras are hidden.
      </p>

      <div>
        <h3 className="mb-2 font-semibold text-foreground">What you can do</h3>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>See your assigned calls in the Upcoming, Overdue and Completed tabs.</li>
          <li>Open a call, work through its checklist and record each item&apos;s result.</li>
          <li>Add photos where prompted, then Complete &amp; Submit.</li>
          <li>Use &ldquo;No Access&rdquo; if you attend but cannot get in.</li>
        </ul>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-foreground">What you will not see</h3>
        <p className="text-muted-foreground">
          Internal features such as parts requests, further-works pricing, labour costs, other
          engineers&apos; work and office reporting are not available to sub-contractor accounts.
        </p>
      </div>
    </SectionCard>
  )
}

interface SectionGuide {
  name: string
  overview: string
  steps: string[]
}

interface SectionGroup {
  title: string
  intro: string
  sections: SectionGuide[]
}

const SECTION_GUIDE: SectionGroup[] = [
  {
    title: 'Service & scheduling',
    intro: 'The day-to-day heart of the system — where recurring service visits (calls) are planned, assigned, tracked and closed out. This is where most office and engineer time is spent.',
    sections: [
      {
        name: 'All Calls (Schedule)',
        overview:
          'The master list of every service visit. Tabs split work into Upcoming, Overdue and Completed, and four view modes let you look at the same calls in the way that suits the job in hand. Each tile shows the site, service, due date (or a red “Complete by” date once a tolerance is breached) and an approximate time-on-site learned from the last five similar calls.',
        steps: [
          'Choose a view — Grid (visual tiles), List (dense rows), By route or By area — and a tab (Upcoming / Overdue / Completed).',
          'Filter by engineer or date, sort by Due date or Postcode, and use the search box to jump to a site, client or call reference.',
          'Save the current filters as a personal view, or share a view (with a note and comment thread) so the team works from the same list; print any filtered view for a paper round sheet.',
          'Click a call to open the quick-view, where you can reassign it, book a date/time, cancel it (a reason is required) or open the completed report.',
          'The Completed tab shows the rich report table for office/admin, with per-report filters and links straight to each service report.',
        ],
      },
      {
        name: 'Service Dashboard',
        overview:
          'A live command centre for service health. Colour-coded tiles surface overdue, unassigned and upcoming calls, follow-up escalations, no-access calls awaiting a decision, and pending contract reviews so nothing slips.',
        steps: [
          'Scan for red first — overdue calls, third-visit escalations and the no-access queue need attention soonest.',
          'Click any tile to drop straight into the filtered list of exactly those calls.',
          'Use the no-access queue to rearrange or dismiss calls where the engineer attended but could not get in (optionally charging the wasted attendance).',
        ],
      },
      {
        name: 'CDO Management',
        overview:
          'A dedicated view for CDO-delivered services, grouped by route. Shows CDO engineers, route compliance over the last 90 days, and any services that are not yet on a route.',
        steps: [
          'Review the Overdue / Upcoming / Unassigned tabs for CDO calls.',
          'Use the routes overview to spot unrouted services and assign them to the right route.',
          'Check the compliance figures to see which routes are keeping pace.',
        ],
      },
      {
        name: 'Map',
        overview:
          'A geographic view of calls that plots the round on an interactive map so you can plan travel, spot clusters of nearby work, and sequence a day sensibly.',
        steps: [
          'Open Map and filter by engineer or date to see where the work is.',
          'Use it alongside the route planner to build efficient rounds.',
        ],
      },
      {
        name: 'Route Planner',
        overview:
          'A per-route day plan with a live map and a drag-reorderable list of the day’s sites. It anchors the first site at 08:30, back-calculates a leave-home time, and works lunch and driving legs into the schedule.',
        steps: [
          'Open a route to see its ordered sites on the map with driving legs between them.',
          'Drag sites to reorder the day; timings recalculate automatically.',
          'Give each route an explicit weekday so recurring calls land on the right day (a Monday choice warns about bank holidays).',
        ],
      },
      {
        name: 'Chargeable Calls',
        overview:
          'The review queue for reactive or out-of-scope work that must be priced and invoiced. Completed calls flagged chargeable land here with their parts and labour ready to check.',
        steps: [
          'Open the review queue and check the parts and labour recorded on each completed call.',
          'Add any ad-hoc labour or sundry charges, then capture the client reference / PO number.',
          'Approve for invoicing; the client reference locks once an invoice has been raised.',
        ],
      },
      {
        name: 'Follow-ups',
        overview:
          'Return visits raised by an engineer when a call needs further works or parts they could not complete on the day. Repeated failed fixes escalate so a manager steps in.',
        steps: [
          'Review each follow-up request, the works described and any parts noted.',
          'Approve it to book a linked follow-up call, reserving or ordering the parts as needed.',
          'Watch the red escalation tile for third-visit failures that need intervention.',
        ],
      },
      {
        name: 'Defects',
        overview:
          'A log of faults found during visits, with photos and advisory notes. Defects can be turned into priced remedial quotes or booked directly as remedial calls.',
        steps: [
          'Open a defect to see the detail, severity and photos.',
          'Raise a remedial quote, or a remedial call (choosing an engineer and date), directly from it.',
        ],
      },
      {
        name: 'On-call & Lone Worker',
        overview:
          'The out-of-hours emergency rota, and real-time safety monitoring for staff working alone. Lone-worker shifts use a two-stage amber→red escalation and capture location if a check-in is missed.',
        steps: [
          'On-call: use “Create block” to generate a rota so every out-of-hours period has named cover.',
          'Lone Worker: monitor active shifts on the office page; missed check-ins escalate to the office and, out of hours, the on-call manager.',
          'Temporarily disable lone-working for a user (with a nominated manager and double confirmation) when appropriate.',
        ],
      },
      {
        name: 'KPIs',
        overview:
          'Compliance performance across the business, split into a Regulatory tier (legal deadlines) and a Client tier (any tighter per-site promises). Includes a monthly breakdown and a review tool for assigning reasons to missed deadlines.',
        steps: [
          'Filter by branch, service type or system type to focus the view.',
          'Read the monthly compliance table per tier, honouring your filters.',
          'Use the deadline-failed review (office/admin) to assign or change a reason on any late/overdue miss; excused reasons can be excluded from the score.',
        ],
      },
    ],
  },
  {
    title: 'Clients, sites & assets',
    intro: 'The record of who you work for, where, and the equipment on each site. Everything the service side generates hangs off this structure.',
    sections: [
      {
        name: 'Clients',
        overview:
          'The companies you provide services to, each owning one or more sites. A lifecycle status controls whether new work is generated, and billing accounts let a client be split into separately-invoiced sub-accounts.',
        steps: [
          'Add a client (the address finder can pull name, address and postcode from a business search), then add their site(s).',
          'Set a lifecycle status — Active (Live), Engaged (New) or Dormant (Dead) — to control whether recurring work is created.',
          'Add billing accounts where a client needs multiple invoice destinations; sites and services inherit the right account.',
        ],
      },
      {
        name: 'Sites',
        overview:
          'Individual premises with their systems, recurring services, documents and billing. The Systems tab is where systems, services, frequencies and charges are managed, and the site’s overview surfaces open calls and upcoming visits.',
        steps: [
          'Add a site with its address and a contact email — completed reports are sent here.',
          'Optionally record the UPRN; the Site ID (CASH) doubles as the public log book access code.',
          'Under the Systems tab, add systems and their services, set each service’s frequency, charge and any Client KPI override, and follow the “set up service charges” prompt for any chargeless service.',
          'Use the site documents folder, per-system rotation and Remote Monitoring toggle as needed.',
        ],
      },
      {
        name: 'Assets',
        overview:
          'Company asset registers (dampers, extinguishers, emergency lights, MCPs and more) with printable QR labels and automatic servicing reminders.',
        steps: [
          'Browse or search the register for a site.',
          'Scan an asset’s QR code on site to jump straight to it during a visit.',
          'Let the reminders cron flag assets that are due so nothing is missed.',
        ],
      },
    ],
  },
  {
    title: 'Service setup',
    intro: 'Define how services behave and how work is grouped and routed. Most of these are admin-only and set the rules the rest of the system follows.',
    sections: [
      {
        name: 'Service Types & System Types',
        overview:
          'The catalogue of services and the systems they sit under. Each service type carries its default frequency, its Regulatory KPI tolerance, whether it is chargeable by default, and whether it counts toward regulatory compliance. Per-visit types can carry an expected time on site.',
        steps: [
          'Create a service type and set its frequency and Regulatory KPI tolerance.',
          'Group it under the appropriate system type, and mark whether that system type requires recurring visits.',
          'Toggle “regulatory compliance” off for non-regulatory services so they stay out of the regulatory KPI tier.',
          'Set default and per-visit expected times to feed the call-tile time estimates.',
        ],
      },
      {
        name: 'Checklists',
        overview:
          'The on-site items an engineer records for each service. Supports pass/fail with an advisory state, numeric and text items, N/A, conditional rules, and shared checklists that apply across multiple service or system types.',
        steps: [
          'Build the checklist for a service or system type, or a shared checklist that applies to several.',
          'Add conditions where needed (e.g. a fail requires a photo and a note, or reveals follow-up questions).',
          'Use the advisory state for items that are neither a clean pass nor a defect.',
        ],
      },
      {
        name: 'Routes & Areas',
        overview:
          'Two ways to group work and assign it to an engineer in bulk. A route is an ordered round of sites (with a weekday); an area is an alternative grouping. Assignment cascades to every open call in the group.',
        steps: [
          'Assign an engineer to a route (choosing its weekday) or an area.',
          'Reassigning the route/area automatically moves all of that group’s open calls to the new engineer.',
          'Use the route planner to add or remove sites and sequence the day.',
        ],
      },
      {
        name: 'Client Logins',
        overview:
          'Portal accounts that let clients self-serve their own reports, compliance and log book (admin-only).',
        steps: [
          'Create a login for a client contact.',
          'They sign in at the same login page and land in their read-only portal.',
        ],
      },
    ],
  },
  {
    title: 'Sales & quoting',
    intro: 'Winning and configuring new work, from a quick quote to a full AI-assisted fire-alarm design, and turning an accepted quote into live services or a job.',
    sections: [
      {
        name: 'Quotes & Quote Bank',
        overview:
          'Build, send and track quotes; the Quote Bank stores reusable priced catalogue items. An accepted quote can flow straight into the rest of the system.',
        steps: [
          'Start a quote, add catalogue items and margins, and send it for authorisation.',
          'On acceptance, a routine-maintenance quote drafts a contract review; a remedial quote can create enriched remedial call(s); larger works can create a job.',
          'Keep catalogue pricing current — editing a linked part pushes its cost through to the quote catalogue item.',
        ],
      },
      {
        name: 'Contract Reviews',
        overview:
          'The staging area between an accepted maintenance quote and live services. It builds a draft client/site/system/service/charge graph (with fuzzy auto-matching) that a manager approves before it goes live.',
        steps: [
          'Open a pending review from the queue or the Service Dashboard tile.',
          'Check the auto-matched sites, systems and services and adjust as needed.',
          'Commit the review to create the live records in the correct order.',
        ],
      },
      {
        name: 'Quote Studio',
        overview:
          'Brief-first, AI-assisted fire-alarm quoting. Paste a brief and it drafts an understanding, requirements and a first-pass device schedule, prices it live against the catalogue, and can generate a BS 5839-1 / BAFE specification.',
        steps: [
          'Paste the brief and let the AI draft the takeoff.',
          'Adjust the device schedule; pricing updates live as you edit.',
          'Generate the spec, then save it as a real quote (it is re-priced server-side on save).',
        ],
      },
      {
        name: 'Tender AI',
        overview:
          'A workspace for responding to tenders using a knowledge and evidence library, with a prompt library to speed up drafting.',
        steps: [
          'Add a tender, then draft answers drawing on the knowledge and evidence libraries.',
          'Reuse prompts from the library, and store finished responses for future tenders.',
        ],
      },
    ],
  },
  {
    title: 'Jobs, purchasing & stock',
    intro: 'Delivering larger installations as staged projects and keeping parts, suppliers and purchase orders in order.',
    sections: [
      {
        name: 'Jobs',
        overview:
          'Larger installations run as staged projects with live cost and margin tracking. The progress tracker shows each stage with real evidence (orders raised, calls done, invoices issued) and suggests the next stage.',
        steps: [
          'Open a job and use the progress tracker to move it through its stages (contract review → ordering → in progress → commissioning → handover → complete).',
          'Watch the finance strip for contract value, quoted margin, committed spend and remaining budget.',
          'Manage the job’s purchase orders, linked calls, invoices and documents from the one page.',
        ],
      },
      {
        name: 'Purchasing & Suppliers',
        overview:
          'Raise purchase orders against jobs or calls and manage the suppliers behind them.',
        steps: [
          'Create a purchase order against a job or call.',
          'Record it against the supplier and track it through to receipt.',
        ],
      },
      {
        name: 'Products / Stock',
        overview:
          'Parts inventory across vans and stores, with transfers, a parts catalogue and the quote catalogue. Parts filtering and bulk percentage price changes keep the catalogue maintainable.',
        steps: [
          'Check stock levels on the Overview and use Transfer Stock to move parts between locations.',
          'Filter the parts catalogue and select parts to apply a bulk percentage price change.',
          'Editing a part syncs its cost and details one-way to the linked quote catalogue item.',
        ],
      },
    ],
  },
  {
    title: 'Invoicing & billing',
    intro: 'Turning completed work and recurring contracts into invoices, with managed nominal codes and a Sage-ready export.',
    sections: [
      {
        name: 'Invoices',
        overview:
          'Recurring, per-visit and remedial invoices. VAT and the Sage tax code are set once at company level; every line carries a managed nominal code, and invoices can be exported to Sage 50.',
        steps: [
          'Review a draft invoice; every line needs a nominal code before it can be issued.',
          'Issue the invoice, then export a batch to Sage when ready.',
          'For per-visit billing, one invoice is drafted automatically as each visit in the cycle completes.',
        ],
      },
      {
        name: 'Purchase Invoices',
        overview:
          'A document store and approval-for-payment workflow for supplier invoices, with allocation to the call or job they belong to.',
        steps: [
          'Upload the supplier invoice (bulk upload is supported) and allocate it to a call or job.',
          'Assign an authoriser, who approves or rejects it for payment.',
        ],
      },
      {
        name: 'Renewals & Projected Revenue',
        overview:
          'Upcoming contract renewals and an annualised forecast of recurring revenue, broken down by branch and service type with cost and margin.',
        steps: [
          'Review upcoming renewals and act before they lapse.',
          'Use Projected Revenue to see the 12-month run-rate, filtered by system or service type.',
        ],
      },
      {
        name: 'Labour Costs',
        overview:
          'Profitability analysis for calls, combining labour (on-site time minus pauses, at each user’s cost rate) and parts against invoiced or apportioned revenue. Access is restricted.',
        steps: [
          'Open the labour-costs dashboard (visible only to granted users) and filter as needed.',
          'Review per-call cost vs revenue and the resulting margin.',
        ],
      },
    ],
  },
  {
    title: 'People & HR',
    intro: 'Staff time, leave, training and the approvals that sit on top of them.',
    sections: [
      {
        name: 'Approvals',
        overview:
          'A single place for items awaiting a manager decision — timesheets, purchase invoices, leave and more.',
        steps: ['Work through the pending items and approve or reject each with any required note.'],
      },
      {
        name: 'Timesheets',
        overview:
          'Weekly (Sunday-ending) timesheets for eligible staff. Hours come from the working-day span, with weekday overtime (outside normal hours, less a travel allowance), weekend overtime, night-shift and on-call counts. Days that were booked as leave but also worked are flagged as conflicts.',
        steps: [
          'Staff submit their week by the Monday 09:00 deadline.',
          'Managers review and approve under Timesheets, checking any amber leave-vs-shift conflict warnings.',
        ],
      },
      {
        name: 'Training & Leave',
        overview:
          'Training records, plus annual-leave booking, approvals and a team leave summary. Cancelling leave keeps an audit trail rather than deleting it.',
        steps: [
          'Book leave under My Leave; balances update automatically and it routes to your approver.',
          'Managers see everyone’s bookings under Leave Summary; cancelled leave frees the days back up.',
        ],
      },
      {
        name: 'Employee Vault',
        overview:
          'Secure storage for staff documentation, organised into folders with role-based visibility and an admin broadcast for “document updated” notices.',
        steps: [
          'Open a person’s vault to view or add their documents.',
          'Use folders and the search to find documentation quickly.',
        ],
      },
    ],
  },
  {
    title: 'Communication, quality & oversight',
    intro: 'How the team communicates, captures quality checks and staff surveys, and keeps a full audit trail.',
    sections: [
      {
        name: 'Requests inbox',
        overview:
          'Incoming client requests triaged with AI and matched to a likely site and service, ready to be turned into a booked call. Inbound email can feed it directly.',
        steps: [
          'Open a request, confirm the matched site/service, and turn it into a booked call.',
          'Use the AI-prepared answer as a starting point for the reply.',
        ],
      },
      {
        name: 'Internal tasks / My Tasks',
        overview:
          'Recurring form-style tasks (toolbox talks, vehicle checks, and more) assigned across roles, teams or individuals. Supports rich blocks — sections, document links, tables — and conditional notifications when an answer fires a rule.',
        steps: [
          'Complete your assigned tasks under My Tasks by their due date, like a checklist.',
          'Managers build templates in Settings, choosing who they apply to and any conditional alerts.',
        ],
      },
      {
        name: 'Surveys',
        overview:
          'Admin-only staff surveys built on the internal-tasks engine, with an aggregated results view and an emailed summary.',
        steps: [
          'Publish a survey to the chosen audience; staff answer it through My Tasks.',
          'Review aggregated results, and close and summarise the survey when done.',
        ],
      },
      {
        name: 'Scheduled reports',
        overview:
          'Configurable automated emails summarising task/form responses — expected vs actual, overdue and a submission summary — on a daily, weekly or monthly schedule to chosen recipients.',
        steps: [
          'Set up a schedule in the submissions admin, choosing the template(s), frequency and recipients (users, roles or emails).',
          'The cron delivers each report automatically for the due window.',
        ],
      },
      {
        name: 'Team Chat',
        overview:
          'Internal messaging between staff, kept separate from client communication, with branch channels and direct messages.',
        steps: ['Use branch channels or direct messages to talk to colleagues.'],
      },
      {
        name: 'Knowledge Centre',
        overview:
          'A shared library of reference documents and guidance, with AI extraction to make documents searchable.',
        steps: ['Search or browse for a document; granted managers can add new ones.'],
      },
      {
        name: 'Documents',
        overview:
          'Shared file storage organised by client, site, service and job, with company-wide tags and a per-folder type filter.',
        steps: ['Upload a file, apply at least one tag, and file it under the right owner.'],
      },
      {
        name: 'Activity Log',
        overview:
          'An audit trail of key changes — who did what, where and when — open to admin and office.',
        steps: [
          'Filter by user, what changed, where, or a date range, and free-text search.',
          'Use it to trace security and business events such as call cancellations and invoice changes.',
        ],
      },
      {
        name: 'Users & account (admin)',
        overview:
          'Managing staff accounts, page-level menu access and security. New accounts can be emailed their login details and are forced to set their own password on first sign-in.',
        steps: [
          'Add a team member under Users (or copy an existing user to inherit their settings); optionally email their credentials.',
          'Control who sees what — down to individual pages — under Settings → Menu access.',
          'Grant restricted capabilities (e.g. query tools, labour-cost visibility) only where needed.',
        ],
      },
    ],
  },
  {
    title: 'Personalisation & tools',
    intro: 'Ways to tailor the app to how you work, plus power-user data tools for those granted access.',
    sections: [
      {
        name: 'Home dashboard',
        overview:
          'The manager home screen is customisable — add or remove module tiles, create custom shortcut tiles, colour-code them, and choose a background. Header micro-shortcuts give quick access to your most-used pages.',
        steps: [
          'Add or remove tiles and drag to reorder them; recolour a tile from its colour dot.',
          'Pin header shortcuts (up to eight) via the gear/plus popover, and pick a dashboard background in Settings.',
        ],
      },
      {
        name: 'Simple Mode',
        overview:
          'A stripped-back, big-tile mobile/tablet shell for non-engineer office staff, built from each user’s own menu access. A “Full site” override is always available.',
        steps: [
          'On a small screen, office staff see Simple Mode automatically.',
          'Switch to the full site at any time with the “Full site” toggle.',
        ],
      },
      {
        name: 'To-Do',
        overview:
          'Personal and shared to-dos with subtasks, tags, file attachments, assignees and lists. Items can be marked “notable”; non-notable items stay in your lists but are excluded from the open-todo counts and the header badge.',
        steps: [
          'Add a to-do, then expand it to add subtasks, tags, attachments or assignees.',
          'Mark an item “Don’t count in totals” to keep it quiet; star or pin the ones that matter.',
          'Filter by list, tag, person or date, and save the view you use most.',
        ],
      },
      {
        name: 'Bulk data (Settings → Data)',
        overview:
          'Admin-only bulk Excel export and import across the core datasets, with a preview and merge step and FK-by-name/SKU matching.',
        steps: [
          'Export a dataset to Excel, edit it, then import it back.',
          'Review the preview and resolve any matches before committing the merge.',
        ],
      },
      {
        name: 'Query tools',
        overview:
          'Owner-granted power tools: a SQL Query Builder with read/preview-rollback/commit safety, and a user cost calculator that derives hourly cost from work patterns.',
        steps: [
          'Run read-only queries first; preview a change and roll back before committing.',
          'Use the cost calculator to turn a Name + cost spreadsheet into per-user hourly costs.',
        ],
      },
    ],
  },
]

function SectionGuideBlock() {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border bg-card text-card-foreground">
        <div className="border-l-4 border-primary p-6">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" />
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Section-by-section guide
            </p>
          </div>
          <h2 className="mt-2 text-lg font-semibold">Every area of the app, explained</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground text-pretty">
            Each section below has a short <span className="font-medium text-foreground">overview</span>{' '}
            and a simple <span className="font-medium text-foreground">how to use it</span> guide. Your
            sidebar may show a subset — visibility is controlled per role and per page under{' '}
            <span className="font-medium text-foreground">Settings → Menu access</span>.
          </p>
        </div>
      </section>

      {SECTION_GUIDE.map((group) => (
        <SectionCard key={group.title} icon={LayoutGrid} title={group.title}>
          <p className="text-muted-foreground">{group.intro}</p>
          <div className="space-y-5">
            {group.sections.map((section) => (
              <div key={section.name} className="rounded-lg border bg-muted/30 p-4">
                <h3 className="font-semibold text-foreground">{section.name}</h3>
                <p className="mt-1 text-muted-foreground">{section.overview}</p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  How to use it
                </p>
                <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">
                  {section.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </SectionCard>
      ))}
    </div>
  )
}

function QrLogBookSection() {
  return (
    <SectionCard icon={QrCode} title="Public QR Log Book (anyone on site)">
      <p className="text-muted-foreground">
        Every site has a public digital fire-safety log book reachable by scanning the site&apos;s QR
        code. It is intended for anyone physically on site (e.g. the responsible person or a visiting
        inspector) and does not require a staff or client account.
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>Scan the QR code or open the log book URL.</li>
        <li>Enter the site <span className="text-foreground">access code</span> (the Site ID / CASH code) to unlock.</li>
        <li>View the site&apos;s service history and compliance status.</li>
      </ol>
      <p className="text-muted-foreground">
        Access is granted per-site only; entering one site&apos;s code does not reveal any other site.
      </p>
    </SectionCard>
  )
}

function Glossary() {
  const terms: [string, string][] = [
    ['Task / Call', 'A single scheduled service visit.'],
    ['Service', 'A recurring service on a site (with a frequency).'],
    ['Job', 'A larger, staged piece of work (e.g. an installation) tracked from quote to handover.'],
    ['Route', 'A geographic round of sites/services, assigned to an engineer.'],
    ['Area', 'An alternative grouping of services, assigned to an engineer.'],
    ['Worker type', 'Who performs the work: CDO, Engineer, or Sub-contractor.'],
    ['Defect', 'A fault found during a visit; can raise a priced remedial quote.'],
    ['Follow-up', 'A linked return visit raised when a call needs further works.'],
    ['Chargeable call', 'Reactive/out-of-scope work reviewed, priced and invoiced.'],
    ['Remedial', 'Corrective work to fix a defect, usually from an approved quote.'],
    ['Internal task', 'A recurring form/checklist for staff (e.g. toolbox talk, vehicle check).'],
    ['Lone worker', 'Safety shift check-ins with escalation for staff working alone.'],
    ['On-call', 'The out-of-hours rota covering emergencies.'],
    ['MCP', 'Manual Call Point (fire alarm call point).'],
    ['UPRN', 'Unique Property Reference Number (UK national property identifier).'],
    ['Regulatory KPI', 'The default/legal deadline tolerance for a service type.'],
    ['Client KPI', 'An optional, tighter per-site deadline tolerance.'],
    ['Site ID (CASH)', 'The site reference that also acts as the log book access code.'],
  ]
  return (
    <SectionCard icon={ShieldCheck} title="Glossary">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">Term</TableHead>
            <TableHead>Meaning</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {terms.map(([term, meaning]) => (
            <TableRow key={term}>
              <TableCell className="font-medium">{term}</TableCell>
              <TableCell className="text-muted-foreground">{meaning}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SectionCard>
  )
}
