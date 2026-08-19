# Pyrocel CRM — User Manual

This manual explains how to use the Pyrocel fire-safety service management
platform. It is organised by **user type**, so you can jump straight to the
section that applies to you.

- [Key concepts (read this first)](#key-concepts)
- [Administrator](#administrator)
- [Office](#office)
- [Engineer](#engineer)
- [Sub-contractor](#sub-contractor)
- [Client](#client-portal)
- [Section-by-section guide (every area of the app)](#section-by-section-guide)
- [Public QR Log Book (anyone on site)](#public-qr-log-book)
- [Glossary](#glossary)

---

## Key concepts

A few ideas appear throughout the platform. Understanding them makes every
screen easier to use.

### User types (roles)

| Role | Where they work | What they do |
| --- | --- | --- |
| **Admin** | Dashboard | Full access — manages everything, including users, service types and checklists. |
| **Office** | Dashboard | Day-to-day operations — clients, sites, scheduling, reporting. No user/service-type administration. |
| **Engineer** | Schedule | Carries out and records on-site services. |
| **Sub-contractor** | Schedule | External engineer with a restricted view — only their assigned work. |
| **Client** | Portal | Views their own reports, performance and digital log book. |

### How work flows through the system

1. A **Client** owns one or more **Sites**.
2. Each Site has one or more **Services** (e.g. weekly fire alarm test,
   extinguisher service, damper inspection, emergency lighting).
3. Each Service runs on a **frequency** (e.g. weekly, monthly, annually). The
   system automatically creates the next **Task** (a scheduled visit, also
   called a "call") when the previous one is completed.
4. Tasks are **assigned to an engineer**, either directly, via a **Route**, or
   via an **Area**.
5. An engineer completes the task on-site, which produces a **Report**.
6. The report is emailed to the client and made available in the **Client
   Portal** and the site's **digital Log Book**.

### How tasks get assigned

A task's engineer is resolved in this priority order:

1. **Direct assignment** on the service (always wins).
2. The engineer assigned to the service's **Route**.
3. The engineer assigned to the service's **Area**.

Because of this, **reallocating a route automatically reassigns all of that
route's open (pending) calls** to the new engineer. The same happens when
services are added to or removed from a route.

### Task / report outcomes

| Outcome | Meaning | Treated as failure? |
| --- | --- | --- |
| **Pass** | Service completed, everything in order. | No |
| **Partial** | Completed, but some items need remedial action. | Yes (defect alert sent) |
| **Fail** | Completed, defects found. | Yes (defect alert sent) |
| **No Access** | Engineer attended but could not get into the site. | **No** — not a failure |

### KPIs: Regulatory vs Client

- **Regulatory KPI** — the legal/standard deadline tolerance for a service
  type. This is the default baseline.
- **Client KPI (optional)** — a tighter, per-site override. If left blank, the
  site inherits the regulatory standard.

Compliance tiers and performance reporting are calculated from the client
override where one is set, otherwise from the regulatory standard.

---

## Administrator

Admins have full access to every area via the left-hand sidebar.

### Navigation

- **Dashboard** — headline counts (sites, routes, pending, completed) and
  upcoming tasks.
- **Clients** — manage client companies.
- **Sites** — manage sites and their services.
- **Assets** — Dampers, Extinguishers, Emergency Lights registers.
- **Routes** — geographic rounds, each assigned to an engineer.
- **Areas** — alternative grouping, each assigned to an engineer.
- **Users** — invite/manage staff (admin, office, engineer).
- **Client Logins** — create and manage client portal accounts.
- **Sub-contractors** — manage third-party providers.
- **Service Types** — define services, frequencies and KPIs.
- **Checklists** — define the on-site checklist for each service.
- **Schedule** — the master task calendar/list.
- **Reports** — every completed service report.
- **KPIs** — compliance performance across the business.
- **Documents** — shared file storage with folders.
- **Settings** — your account.

### Managing clients and sites

1. Create the **Client** under **Clients**.
2. Under **Sites**, add a site. Required details include the address and a
   **Contact Email** (mandatory — reports are sent here).
3. Optionally record the **UPRN** (Unique Property Reference Number).
4. The **Site ID (CASH)** doubles as the access code for that site's public QR
   fire-safety log book.
5. Add **Services** to the site and set each one's frequency and, if needed, a
   **Client KPI** override.

### Service Types, KPIs and checklists

- Under **Service Types**, define each service and set its **Regulatory KPI**
  (the default standard). Per-site tightening is done with the Client KPI
  override on the site's service.
- Under **Checklists**, define the items engineers complete for each service.

### Users and client logins

- **Users** — invite engineers and office staff and set their role.
- **Client Logins** — create portal accounts so clients can self-serve reports.

### Routes and Areas

- Assign an engineer to a **Route** or **Area**. Changing that assignment
  automatically moves all open calls to the new engineer.
- Use the **Route Planner** ("Manage services") to add/remove sites and
  services from a route; affected calls are re-synced to the route's engineer.

---

## Office

Office users handle day-to-day operations. The sidebar is the same as Admin
**except** that office users do **not** have access to **Users**, **Client
Logins**, **Service Types**, or **Checklists** (those are admin-only).

Office can:

- Manage **Clients** and **Sites** (including services and KPI overrides).
- Maintain **Assets**, **Routes**, **Areas** and **Sub-contractors**.
- Use the **Schedule** to create tasks and monitor progress.
- Review **Reports** and **KPIs**.
- Manage shared **Documents**.

### Scheduling work

- Open **Schedule** to see all tasks across **Upcoming**, **Overdue** and
  **Completed** tabs.
- Switch between **Grid**, **List**, **By route** and **By area** views.
- **Sort by Due date or Postcode**, filter by engineer/date, and search.
- Use **Create Task** to add a one-off visit, or **Scan QR** to jump to a
  site's assets.

---

## Engineer

Engineers have a deliberately streamlined view. After signing in they land
directly on the **Schedule** — this is their single work surface (there is no
separate "My Tasks" page). They also have **Settings** and the **Scan QR**
button.

### The Schedule

- **Upcoming / Overdue / Completed** tabs show your own tasks.
- **Sort by Due date** (default) or **Postcode** to plan your round.
- **Grid**, **List**, **By route** and **By area** views.
- **Scan QR** opens a site/asset directly by scanning its on-site code.

### Completing a task

1. Open a task and press **Start** (or **Continue**).
2. Work through the checklist, recording each item's result.
3. Add photos where prompted (especially for any defects).
4. Press **Complete & Submit** when the required items are done.

On submit, the report is generated, the client is emailed, the next recurring
task is scheduled automatically, and any defects trigger an internal alert.

### Weekly fire alarm testing (call points / MCPs)

- The task shows the site's **call point register**. Add call points if any are
  missing (location/reference).
- For each call point you can run the checklist, or use **Pass all** to mark
  every item on that call point as passed.
- Use the task-level **Mark all passed** (with confirmation) to pass every call
  point at once.

### "No Access"

If you attend but cannot get into the site:

1. Press **No Access** in the action bar.
2. Add optional **notes** explaining why (e.g. building locked, no key holder).
3. Confirm.

This closes the visit as **No Access** — it is **not** recorded as a failure,
no defect alert is raised, and the next scheduled visit is still created. The
client receives a neutral "visit could not be completed" notice.

### First sign-in

If your account was created for you, the first time you sign in you will be
asked to **set your own password** before you can continue. Choose a new
password (at least 12 characters) and you will be taken straight to your work.

---

## Sub-contractor

Sub-contractors are external engineers with a deliberately **restricted** view.
You sign in to the **Schedule** and see only the work assigned to you —
internal-only tools, pricing, parts and reporting extras are hidden.

### What you can do

- See your assigned calls in the **Upcoming**, **Overdue** and **Completed**
  tabs.
- Open a call, work through its checklist and record each item's result.
- Add photos where prompted, then **Complete & Submit**.
- Use **No Access** if you attend but cannot get in.

### What you will not see

Internal features such as parts requests, further-works pricing, labour costs,
other engineers' work and office reporting are not available to sub-contractor
accounts.

---

## Client Portal

Clients sign in to a focused portal (not the staff dashboard) at the same login
page. They only ever see data for their own organisation.

The portal has three tabs:

- **Reports** — every service report for your sites, with Pass / Fail / Partial
  / No Access status. Open a report to see full detail, including any defect
  photos.
- **Log Book** — the digital fire-safety log book for each of your sites.
- **Performance** — your KPI/compliance performance.

Use **Sign out** in the top-right when finished.

---

## Section-by-section guide

Every area of the app, with a short **overview** and a simple **how to use it**
guide. Your sidebar may show a subset — visibility is controlled per role and
per page under **Settings → Menu access**.

### Service & scheduling

The day-to-day heart of the system — where recurring service visits (calls) are
planned, tracked and closed out.

- **All Calls (Schedule)** — the master list of every visit across Upcoming,
  Overdue and Completed. Pick a view (Grid / List / By route / By area), filter
  by engineer or date, sort by Due date or Postcode, then click a call to view,
  reassign, book, cancel (with a reason) or open its report.
- **Service Dashboard** — a live overview of service health. Scan the tiles for
  anything overdue or escalated, then click through to the filtered list.
- **CDO Management** — everything for CDO-delivered services, grouped by route.
  Review Overdue / Upcoming / Unassigned and assign any unrouted services.
- **Map** — a geographic view of calls; filter by engineer or date to plan
  travel.
- **Chargeable Calls** — reactive/out-of-scope work. Check parts and labour on
  each completed call, add ad-hoc charges, capture the client reference / PO,
  then approve for invoicing.
- **Follow-ups** — return visits raised when a call needs further works. Review
  the request and parts, then approve to book a linked follow-up call.
- **Defects** — faults found on visits. Open one to see detail and photos, then
  raise a remedial quote or call from it.
- **On-call & Lone Worker** — the out-of-hours emergency rota, and safety
  monitoring for staff working alone (missed check-ins escalate automatically).
- **KPIs** — compliance performance, split into Regulatory and Client tiers.
  Filter by branch/service/system and assign reasons to any misses.

### Clients, sites & assets

- **Clients** — the companies you serve. Add a client, then their site(s), and
  set a lifecycle status (Active / Engaged / Dormant).
- **Sites** — individual premises. Add the address and contact email (reports
  are sent here), then add systems and services under the Systems tab. The Site
  ID (CASH) doubles as the public log book access code.
- **Assets** — company registers (dampers, extinguishers, emergency lights and
  more) with QR labels and reminders. Scan an asset's QR code on site to jump
  straight to it.

### Service setup

- **Service Types & System Types** — the catalogue of services and the systems
  they sit under, including the Regulatory KPI and default chargeable flag.
- **Checklists** — the on-site items engineers record, including conditional and
  advisory rules.
- **Routes & Areas** — two ways to group and assign work. Reassigning a route or
  area automatically moves all its open calls to the new engineer.
- **Client Logins** — portal accounts that let clients self-serve their reports
  (admin-only).

### Sales & quoting

- **Quotes & Quote Bank** — build, send and track quotes; on acceptance a quote
  can auto-create a contract, job or remedial calls. The Quote Bank stores
  reusable priced items.
- **Quote Studio** — brief-first, AI-assisted fire-alarm quoting that drafts a
  device schedule and BS 5839-1 spec, priced live.
- **Tender AI** — a workspace for responding to tenders using a knowledge and
  evidence library.

### Jobs, purchasing & stock

- **Jobs** — larger installations run as staged projects with live cost and
  margin tracking. Use the progress tracker to move through contract review →
  ordering → in progress → commissioning → handover.
- **Purchasing & Suppliers** — raise purchase orders against a job or call and
  manage the suppliers behind them.
- **Products / Stock** — parts inventory across locations, with transfers and
  catalogues.

### Invoicing & billing

- **Invoices** — recurring, per-visit and remedial invoices with managed nominal
  codes and a Sage-ready export. Every line needs a nominal code before issuing.
- **Purchase Invoices** — upload and allocate supplier invoices to a call or
  job, then assign an authoriser to approve for payment.
- **Renewals & Projected Revenue** — upcoming contract renewals and an
  annualised 12-month revenue forecast by branch and service.

### People & HR

- **Approvals** — a single place for items awaiting a manager decision.
- **Timesheets** — weekly timesheets with overtime, night-shift and on-call
  calculation; staff submit, managers approve.
- **Training & Leave** — training records, plus annual-leave booking (My Leave)
  and a team Leave Summary; balances update automatically.
- **Employee Vault** — secure storage for staff documents.

### Communication, quality & oversight

- **Requests inbox** — incoming client requests, AI-triaged and matched to a
  site/service, ready to turn into booked calls.
- **Internal tasks / My Tasks** — recurring form-style tasks (toolbox talks,
  vehicle checks); complete yours by their due date.
- **Team Chat** — internal messaging between staff, separate from client
  communication.
- **Knowledge Centre** — a shared library of reference documents and guidance.
- **Documents** — shared file storage organised by client, site and service,
  with tags.
- **Activity Log** — an audit trail of key changes (admin & office). Filter by
  user, what changed, where, or a date range.
- **Users & account (admin)** — manage staff accounts and menu access. You can
  email a new user their login details, and they set their own password on first
  sign-in.

---

## Public QR Log Book

Every site has a public **digital fire-safety log book** reachable by scanning
the site's QR code (or visiting its log book link). This is intended for anyone
physically on site — e.g. the responsible person or a visiting inspector — and
does **not** require a staff or client account.

1. Scan the QR code or open the log book URL.
2. Enter the site **access code** (the Site ID / CASH code) to unlock.
3. View the site's service history and compliance status.

Access is granted per-site only; entering one site's code does not reveal any
other site.

---

## Glossary

| Term | Meaning |
| --- | --- |
| **Task / Call** | A single scheduled service visit. |
| **Service** | A recurring service on a site (with a frequency). |
| **Job** | A larger, staged piece of work (e.g. an installation) tracked from quote to handover. |
| **Route** | A geographic round of sites/services, assigned to an engineer. |
| **Area** | An alternative grouping of services, assigned to an engineer. |
| **Worker type** | Who performs the work: CDO, Engineer, or Sub-contractor. |
| **Defect** | A fault found during a visit; can raise a priced remedial quote. |
| **Follow-up** | A linked return visit raised when a call needs further works. |
| **Chargeable call** | Reactive/out-of-scope work reviewed, priced and invoiced. |
| **Remedial** | Corrective work to fix a defect, usually from an approved quote. |
| **Internal task** | A recurring form/checklist for staff (e.g. toolbox talk, vehicle check). |
| **Lone worker** | Safety shift check-ins with escalation for staff working alone. |
| **On-call** | The out-of-hours rota covering emergencies. |
| **MCP** | Manual Call Point (fire alarm call point). |
| **UPRN** | Unique Property Reference Number (UK national property identifier). |
| **Regulatory KPI** | The default/legal deadline tolerance for a service type. |
| **Client KPI** | An optional, tighter per-site deadline tolerance. |
| **Site ID (CASH)** | The site reference that also acts as the log book access code. |
