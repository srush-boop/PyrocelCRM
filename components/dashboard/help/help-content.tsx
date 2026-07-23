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

      {isStaff && <ModulesSection />}

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

function ModulesSection() {
  const modules: [string, string][] = [
    ['Requests inbox', 'Incoming client requests are triaged with AI, matched to a site/service and turned into booked calls.'],
    ['Jobs', 'Larger installations and won quotes run as staged projects — contract review, ordering, delivery, commissioning and handover — with live cost and margin tracking.'],
    ['Sales & quoting', 'Build quotes (including the AI Quote Studio), send them for authorisation, and on acceptance auto-create contracts or remedial calls.'],
    ['Chargeable calls', 'Reactive and out-of-scope work is flagged for review, priced and invoiced, with a client reference / PO workflow.'],
    ['Invoicing & billing', 'Recurring service charges, per-visit billing and remedial invoices, with a Sage-ready export and managed nominal codes.'],
    ['Timesheets', 'Weekly timesheets for eligible staff, with overtime, night-shift and on-call calculation and a manager approval step.'],
    ['Internal tasks / Quality', 'Recurring form-style tasks (toolbox talks, vehicle checks) assigned across roles, teams or individuals.'],
    ['Lone worker & on-call', 'Field-safety shift monitoring with escalation, plus an out-of-hours on-call rota.'],
    ['Team chat', 'Internal messaging between staff, kept separate from client communication.'],
    ['Knowledge Centre', 'A shared library of reference documents and guidance for the team.'],
  ]
  return (
    <SectionCard icon={LayoutGrid} title="More across the app">
      <p className="text-muted-foreground">
        Beyond scheduling and reporting, these modules appear in the sidebar (subject to your menu
        permissions). Each has its own screen; here is what they are for.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[210px]">Module</TableHead>
            <TableHead>What it does</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {modules.map(([name, desc]) => (
            <TableRow key={name}>
              <TableCell className="font-medium">{name}</TableCell>
              <TableCell className="text-muted-foreground">{desc}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-muted-foreground">
        Menu visibility is controlled per role and per page under{' '}
        <span className="text-foreground">Settings → Menu access</span>, so your sidebar may show a
        subset of the above.
      </p>
    </SectionCard>
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
