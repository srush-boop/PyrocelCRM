// Database types for PyrocelCRM

// The user's permission level / user type. Shown in the UI as "User Type".
// Governs access and RLS. Do not confuse with `Role` below.
// 'subcontractor' is an external worker login: an engineer-style view scoped to
// only the tasks allocated to them (via assigned_engineer_id), with all internal
// information hidden.
export type UserRole = 'admin' | 'engineer' | 'office' | 'client' | 'subcontractor'

// A descriptive, admin-managed job role (e.g. "Lead Engineer", "Estimator").
// Purely a label used on documents and communications alongside a signature;
// it does NOT affect permissions.
export interface Role {
  id: string
  name: string
  description: string | null
  active: boolean
  // Whether people with this role must submit timesheets. This is the default
  // applied to users who don't have their own override (see Profile).
  timesheet_required: boolean
  // Whether people with this role are lone-worker eligible (can start a safety
  // check-in shift). Defaults to false; enabled per role in Settings → Roles.
  lone_worker_enabled: boolean
  // Default labour cost per hour (integer pence) for people with this role. Used
  // to cost calls; a per-user `cost_per_hour_pence` override wins when set.
  cost_per_hour_pence: number | null
  // Default timesheet approver(s) + processor(s) for this role. A per-user
  // override (Profile.timesheet_approver_ids / _processor_ids) wins when set;
  // otherwise these apply; otherwise approvers fall back to the person's
  // manager and processors to office/admin. See resolveTimesheetApprovers().
  timesheet_approver_ids: string[]
  timesheet_processor_ids: string[]
  created_at: string
  updated_at: string
  }

// Resolve whether a user must submit timesheets: an explicit per-user override
// wins; otherwise fall back to the assigned role's default; otherwise false.
export function isTimesheetRequired(
  profile: Pick<Profile, 'timesheet_required'> & { role_ref?: Role | null },
): boolean {
  if (profile.timesheet_required !== null && profile.timesheet_required !== undefined) {
    return profile.timesheet_required
  }
  return profile.role_ref?.timesheet_required ?? false
}

// Resolve the *explicit* nominated approver (or processor) ids for a user:
// a non-empty per-user list wins; otherwise the assigned role's list; otherwise
// an empty array (the caller then applies the fallback — manager for approvers,
// office/admin for processors).
export function resolveExplicitTimesheetActors(
  userList: string[] | null | undefined,
  roleList: string[] | null | undefined,
): string[] {
  if (userList && userList.length > 0) return userList
  if (roleList && roleList.length > 0) return roleList
  return []
}

// Who performs a service. Independent of how the work is routed/assigned.
export type WorkerType = 'cdo' | 'engineer' | 'subcontractor'

// An engineer's discipline / trade. Drives map colour-coding, icons and the
// skill match used when dispatching a call to the best-placed engineer.
export type Discipline = 'fire' | 'security' | 'installer' | 'cdo' | 'general'

// Unit for a compliance tolerance window.
export type ToleranceUnit = 'days' | 'months'

// An operational/geographic area with one responsible worker (CDO or engineer).
export interface Area {
  id: string
  name: string
  description: string | null
  assigned_engineer_id: string | null
  created_at: string
  updated_at: string
  assigned_engineer?: Profile | null
}

export type SupplierType = 'subcontractor' | 'product'

export interface Supplier {
  id: string
  name: string
  supplier_type: SupplierType
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  website: string | null
  address: string | null
  account_number: string | null
  // Email address to send equipment orders to (product suppliers).
  order_email: string | null
  // Login details for our account on the supplier's portal.
  portal_url: string | null
  portal_username: string | null
  portal_password: string | null
  notes: string | null
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
  // Populated for sub-contractors: the service types they provide.
  service_type_ids?: string[]
  provided_services?: ServiceType[]
}

// Legacy alias — sub-contractors are now unified into the suppliers table.
export type Subcontractor = Supplier

export interface Client {
  id: string
  name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
  notes: string | null
  /** Public Blob URL of the client logo shown on their branded login page. */
  logo_url: string | null
  /** Positive tagline shown on the client's branded login page. */
  login_tagline: string | null
  /** When true, chargeable calls for this client need a PO number before invoicing. */
  requires_po: boolean
  /** When true, this client's calls are invoiced one-per-call rather than in bulk. */
  invoice_calls_individually: boolean
  /** Default customer PO, bottom of the charge->system->site->client fallback chain. */
  po_number: string | null
  /** Lifecycle status (see lib/entity-status): live=Active, new=Engaged, dead=Dormant. */
  status: 'live' | 'new' | 'dead'
  created_at: string
  updated_at: string
}

// Billing status of a billing account (sub-client):
//  - live      = contracted / active
//  - suspended = accounts hold (payment issues or other decision)
//  - dead      = account closed
export type BillingAccountStatus = 'live' | 'suspended' | 'dead'

// A billable entity under a client. A client can have many billing accounts
// (sub-clients), each with its own Sage A/C ref and invoice address, so charges
// can be invoiced separately under the same overarching client.
export interface BillingAccount {
  id: string
  client_id: string
  name: string
  /** Sage 50 A/C Ref (<=8 chars). Unique (case-insensitive) when present. */
  sage_account_ref: string | null
  status: BillingAccountStatus
  status_reason: string | null
  status_changed_at: string | null
  status_changed_by: string | null
  // Invoice address block (own address per sub-client).
  invoice_address: string | null
  invoice_postcode: string | null
  invoice_contact_name: string | null
  invoice_email: string | null
  invoice_phone: string | null
  // Billing defaults consumed by later invoicing / Sage export phases.
  payment_terms_days: number
  default_tax_code: string
  default_nominal_code: string
  /** Inform-only cadence hint shown in the ready-to-invoice queue. */
  billing_frequency: BillingFrequency
  /** The client's primary account; at most one per client. */
  is_default: boolean
  /** Optional rate-card override; null inherits the company default card. */
  rate_card_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
  client?: Client
}

// ---- Invoicing (Phase 3) ------------------------------------------------
export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'void'
/** Segregates ad-hoc/call invoices from recurring-charge invoices. */
export type InvoiceOrigin = 'adhoc' | 'recurring'
/** An invoice document or a credit note (own CRN number series). */
export type InvoiceDocumentType = 'invoice' | 'credit_note'
/** Inform-only billing cadence hint on a billing account. */
export type BillingFrequency =
  | 'weekly'
  | 'monthly'
  | 'bi_monthly'
  | 'four_monthly'
  | 'annual'
  | 'on_demand'
export type RecurringFrequency =
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'biannual'
  | 'annual'
/** When a recurring charge becomes due for invoicing relative to its period.
 *  `per_visit` splits the full annual value across the service's visits and bills
 *  a share as each visit completes (see lib/billing/recurring.ts). */
export type RecurringTiming = 'advance' | 'arrears' | 'on_completion' | 'per_visit'
/** How a recurring charge value was entered: a per-period price, or an annual
 *  total that gets divided across the periods in a year. */
export type RecurringPriceBasis = 'per_period' | 'annual'
export type InvoiceLineKind =
  | 'labour'
  | 'part'
  | 'other'
  // Job-sourced lines:
  | 'job_claim' // works-completed-to-date claim (percent or amount)
  | 'equipment' // client-issued equipment
  | 'job_line' // a selected quote line billed directly

// A CRM-owned invoice, built from reviewed chargeable calls grouped under one
// billing account. Amounts are stored in integer pence.
export interface Invoice {
  id: string
  invoice_number: string
  financial_year: number
  sequence: number
  billing_account_id: string | null
  client_id: string | null
  /** Source job when this invoice was raised from a job (null for call invoices). */
  job_id: string | null
  status: InvoiceStatus
  /** Ad-hoc/call invoice vs recurring-charge invoice (hard-segregated). */
  origin: InvoiceOrigin
  /** Invoice vs credit note. Credit notes use their own CRN number series. */
  document_type: InvoiceDocumentType
  /** For credit notes: the invoice this credits. */
  credited_invoice_id: string | null
  /** Hold parks a draft before issuing; issuing is blocked while held. */
  on_hold: boolean
  hold_reason: string | null
  held_at: string | null
  held_by: string | null
  /** Customer PO number. Set only when common across all covered calls / from the job. */
  po_number: string | null
  /** Optional site the work relates to, plus a text snapshot of its address. */
  site_id: string | null
  site_address: string | null
  // "Sent to client" milestone. sent_at IS NOT NULL locks line editing (it
  // replaces "issued" as the edit lock — invoices stay editable until sent).
  sent_at: string | null
  sent_by: string | null
  sent_to: string | null
  // Bill-to snapshot taken at issue time (the billing account can change later).
  bill_to_name: string | null
  bill_to_address: string | null
  bill_to_email: string | null
  sage_account_ref: string | null
  // Sage 50 CSV export milestone. sage_exported_at IS NOT NULL => "Sent to Sage".
  sage_exported_at: string | null
  sage_exported_by: string | null
  issue_date: string | null
  due_date: string | null
  payment_terms_days: number
  tax_rate: number
  subtotal_pence: number
  tax_pence: number
  total_pence: number
  notes: string | null
  issued_at: string | null
  issued_by: string | null
  paid_at: string | null
  paid_by: string | null
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  line_items?: InvoiceLineItem[]
  billing_account?: BillingAccount | null
  client?: Client | null
  /** Optional embedded site (name only) for the invoice-tile description line. */
  site?: { name: string } | null
}

export interface InvoiceLineItem {
  id: string
  invoice_id: string
  task_id: string | null
  part_id: string | null
  /** Source job for job-sourced lines. */
  job_id: string | null
  /** Source quote line for equipment / job_line kinds (drives dedup). */
  quote_line_item_id: string | null
  kind: InvoiceLineKind
  description: string
  quantity: number
  unit_price_pence: number
  amount_pence: number
  sort_order: number
  /** Managed nominal-code mapping (internal accounting only). */
  nominal_code_id: string | null
  /** Text snapshot of the code at issue time; survives master-list changes. */
  nominal_code: string | null
  /** Customer PO resolved (charge->system->site->client) and snapshotted on the line. */
  customer_po: string | null
  created_at: string
}

// A scheduled/standing charge billed on a cadence. The link to a site_service
// is optional so service-less fees (monitoring, rental, standing charges) work.
// Amounts are stored in integer pence.
export interface RecurringCharge {
  id: string
  billing_account_id: string
  site_service_id: string | null
  client_id: string | null
  site_id: string | null
  description: string
  /** The live sell price per unit, in pence. Always the PER-PERIOD amount billed
   *  each occurrence, even when the value was entered as an annual total. */
  unit_price_pence: number
  /** How the value was entered: a per-period price, or an annual total divided
   *  across the periods in a year to derive unit_price_pence. */
  price_basis: RecurringPriceBasis
  quantity: number
  tax_code: string | null
  nominal_code: string | null
  /** Managed nominal-code mapping (preferred over the legacy text field). */
  nominal_code_id: string | null
  timing: RecurringTiming
  frequency: RecurringFrequency
  /** For `per_visit` timing: how many visits the full annual value is split across
   *  in one cycle. When null, derived from the linked service's visit frequency. */
  visits_per_cycle: number | null
  /** 1-12: the month the annual price is reviewed for renewal. */
  renewal_month: number | null
  /** Optional label to force a separate invoice within an account. */
  group_key: string | null
  is_subcontracted: boolean
  /** Buy price when subcontracted, in pence. */
  subcontract_price_pence: number | null
  active: boolean
  start_date: string | null
  end_date: string | null
  last_invoiced_date: string | null
  notice_sent_at: string | null
  created_at: string
  created_by: string | null
  updated_at: string
  billing_account?: BillingAccount | null
  site_service?: SiteService | null
}

// One row per (recurring charge × completed visit) billed under `per_visit`
// timing. Acts as both an audit trail and the idempotency guard: the UNIQUE
// (recurring_charge_id, task_id) constraint means a given visit can only ever be
// billed once for a given charge, whether raised automatically on completion or
// manually from the due queue.
export interface RecurringVisitBilling {
  id: string
  recurring_charge_id: string
  task_id: string
  invoice_id: string | null
  invoice_line_item_id: string | null
  /** 0-based position of this visit within its cycle (drives the split share). */
  cycle_index: number
  /** How many visits the cycle's full value was split across. */
  visits_in_cycle: number
  amount_pence: number
  created_at: string
}

// Managed master list of Sage-style nominal (accounting) codes. INTERNAL only —
// codes never appear on client-facing invoices.
export interface NominalCode {
  id: string
  code: string
  name: string
  active: boolean
  created_at: string
  created_by: string | null
  updated_at: string
}

// A reusable, preconfigured charge in the catalog (Settings → Charges).
// Picking one prefills a recurring charge's description, price and codes; the
// values can then be overridden per site service. Amounts in integer pence.
export interface ChargeTemplate {
  id: string
  name: string
  description: string | null
  default_unit_price_pence: number
  default_tax_code: string | null
  default_nominal_code: string | null
  /** Managed nominal-code mapping (preferred over the legacy text field). */
  nominal_code_id: string | null
  active: boolean
  created_at: string
  created_by: string | null
  updated_at: string
}

export interface RecurringChargePriceHistory {
  id: string
  recurring_charge_id: string
  old_price_pence: number | null
  new_price_pence: number
  reason: string | null
  changed_at: string
  changed_by: string | null
}

// A quantity of a job's physical quote line issued/delivered to the client.
// Drives the "invoice issued equipment" mode; issued-but-un-invoiced qty is
// the issued total minus quantities already billed on that quote line.
export interface JobIssuedItem {
  id: string
  job_id: string
  quote_line_item_id: string | null
  quantity: number
  note: string | null
  issued_at: string
  issued_by: string | null
}

// A single day's working hours. `start`/`end` are 24h "HH:MM" strings and
// `break_minutes` is the unpaid break to deduct when computing net hours.
export interface WorkDayHoursEntry {
  start: string
  end: string
  break_minutes: number
}

// Per-day working hours keyed by ISO weekday number ("1" = Monday ... "7" =
// Sunday). Absent keys mean the day is not worked.
export type WorkDayHours = Record<string, WorkDayHoursEntry>

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  status: 'active' | 'inactive'
  client_id: string | null
  department_id: string | null
  // Branch this user belongs to; their views default to this branch.
  branch_id: string | null
  invited_at: string | null
  accepted_at: string | null
  // Legacy single working-hours fields (24h "HH:MM[:SS]") and daily lunch
  // allowance in minutes. Superseded by `work_day_hours` (per-day). Retained for
  // backwards compatibility / historical data.
  work_start_time: string | null
  work_end_time: string | null
  lunch_minutes: number | null
  // Days normally worked, as ISO weekday numbers (1 = Monday ... 7 = Sunday).
  // Kept in sync with the keys of `work_day_hours`. Defaults to Monday–Friday.
  work_days: number[] | null
  // Per-day working hours, keyed by ISO weekday number ("1" = Monday ... "7" =
  // Sunday). Only worked days appear. Each entry records the start/finish time
  // and the break to deduct, from which net daily hours are derived.
  work_day_hours: WorkDayHours | null
  // Annual holiday entitlement, recorded as a single figure per user. Days and
  // hours are entered independently (no automatic conversion between them).
  holiday_entitlement_days: number | null
  holiday_entitlement_hours: number | null
  // Per-user top-level menu visibility override. NULL/undefined = use role
  // defaults. Otherwise an array of enabled top-level menu keys.
  menu_permissions: string[] | null
  // Per-user dashboard tile colour overrides, keyed by tile title -> hex value
  // (e.g. { "Service": "#2563eb" }). Empty object = use default theme colour.
  dashboard_tile_colors: Record<string, string> | null
  // Per-user ordered list of dashboard module tile titles (e.g. ["Service",
  // "Jobs", ...]). Empty array = default order; unknown/new titles appended.
  dashboard_tile_positions: string[] | null
  // Per-user dashboard quick-shortcut destination keys (max 3), e.g.
  // ["calendar","invoices","sites"]. Missing entries = unset slot.
  dashboard_shortcuts: string[] | null
  // Nominated line manager for this user (self-referencing). Recorded for HR /
  // future approvals wiring. NULL = no manager set.
  manager_id: string | null
  // HR employee/payroll reference. Used to match rows during training CSV
  // imports and to anonymise client-facing training exports.
  employee_number: string | null
  // Job title (free text). Legacy/optional; the managed `role_id` is preferred
  // for the label shown on documents.
  job_title: string | null
  // Assigned descriptive job role (see Role). NULL = none assigned.
  role_id: string | null
  // Public Blob URL of the user's signature image, applied to reports, RAMS and
  // other documents they generate or sign off.
  signature_url: string | null
  // Public Blob URL of the user's profile picture, shown in team chat and
  // across the app. NULL = use initials fallback.
  avatar_url: string | null
  // Per-user timesheet requirement override. NULL = inherit from the assigned
  // role; an explicit true/false overrides the role default. Resolve with
  // `isTimesheetRequired()`.
  timesheet_required: boolean | null
  // Per-user timesheet approver(s) + processor(s). When non-empty these override
  // the role defaults. Empty = inherit from role, then fall back (approvers ->
  // manager; processors -> office/admin). See resolveTimesheetApprovers().
  timesheet_approver_ids: string[]
  timesheet_processor_ids: string[]
  // Engineer home location — the start/finish anchor for the calls-map route
  // preview and closeness hints. `home_postcode` is user-entered; the lat/lng
  // are geocoded from it (postcodes.io) on save, and re-tried on read if null.
  home_postcode: string | null
  home_latitude: number | null
  home_longitude: number | null
  home_geocoded_at: string | null
  // Engineer live location sharing. When enabled the app stores the engineer's
  // current GPS coordinates so colleagues can see distance to their van/location.
  location_sharing_enabled: boolean
  location_lat: number | null
  location_lng: number | null
  location_updated_at: string | null
  // Lone-worker per-user controls. `can_manage_lone_worker` nominates a
  // non-admin who may monitor and disable others. `lone_worker_disabled_until`
  // temporarily suppresses the feature for this user (e.g. unexpected sick
  // leave) until the given time; null = active.
  can_manage_lone_worker: boolean
  lone_worker_disabled_until: string | null
  lone_worker_disabled_reason: string | null
  lone_worker_disabled_by: string | null
  // Engineer discipline / trade. Drives map colour-coding, iconography and the
  // skill match when dispatching a call. NULL for non-engineers.
  discipline: Discipline | null
  // For 'subcontractor' role logins: the supplier org (suppliers.id,
  // supplier_type='subcontractor') this external worker belongs to. NULL for all
  // other roles. Reference/reporting only — task allocation is via
  // assigned_engineer_id like an engineer.
  subcontractor_id: string | null
  // Primary mobile contact number. Used on documents at times and shown in the
  // on-call rota / out-of-hours call-handling view.
  phone: string | null
  // Optional secondary contact number, shown ONLY in the on-call rota and the
  // out-of-hours call-handling view.
  secondary_phone: string | null
  // Labour costing. `cost_per_hour_pence` is the per-user override that wins over
  // the assigned role's default when set (resolve with `resolveCostPerHourPence`).
  // `can_view_labour_costs` gates visibility of cost/profit/margin figures and is
  // only grantable by the owner (steve.rush@pyrocel.co.uk).
  cost_per_hour_pence: number | null
  can_view_labour_costs: boolean
  // Owner-granted access to the admin Query Builder + User Cost Calculator
  // tools. Only grantable by the owner (steve.rush@pyrocel.co.uk).
  can_use_query_tools: boolean
  // Per-user grant to preview/edit/send invoices from the invoice lists. Admins
  // are implicitly allowed; office users require this grant (see lib/auth/invoices).
  can_edit_invoices: boolean
  created_at: string
  updated_at: string
  department?: Department | null
  branch?: Branch | null
  manager?: Profile | null
  // Joined descriptive role, when selected with `*, role:roles(*)`.
  role_ref?: Role | null
  }

// A single training/qualification record for an employee. Managed by staff;
// users can read their own. Powers the master training grid and the anonymised
// client PDF export.
export interface TrainingRecord {
  id: string
  profile_id: string
  training_type: string
  course_name: string
  provider: string | null
  completed_date: string | null
  expiry_date: string | null
  // Certificate evidence. Either an uploaded file (certificate_pathname points
  // at the private blob) or an external link (certificate_pathname is null).
  // certificate_url is the openable URL; certificate_name is a display label.
  certificate_url: string | null
  certificate_pathname: string | null
  certificate_name: string | null
  created_at: string
  updated_at: string
  profile?: Profile | null
}

// A company department with its own default sales margin.
export interface Department {
  id: string
  name: string
  default_margin_percent: number
  /** Default nominal code for anything under this department (first fallback). */
  nominal_code_id: string | null
  active: boolean
  created_at: string
  updated_at: string
}

// An admin-configurable property/building type that a site can be tagged with.
export interface PropertyType {
  id: string
  name: string
  active: boolean
  created_at: string
  updated_at: string
}

// A site a client login is permitted to view (join row).
export interface ClientSiteAccess {
  id: string
  profile_id: string
  site_id: string
  client_id: string
  created_at: string
}

// A client login row enriched for the management table.
export interface ClientLogin extends Profile {
  client_name: string | null
  site_ids: string[]
}

// A top-level system category (e.g. Fire Alarm = FA, CCTV). Carries the short
// queryable code used to identify a system in quotes and drive analytics.
// Service types sit underneath a system type.
export interface SystemType {
  id: string
  name: string
  code: string | null
  description: string | null
  color: string | null
  status: 'live' | 'dead'
  active: boolean
  // When false, services under this system type are charge-only and NEVER
  // generate recurring PPM visits (e.g. Remote Monitoring). Effective recurrence
  // of a service = service_type.is_recurring AND this flag.
  requires_recurring_visits: boolean
  position: number
  created_at: string
  updated_at: string
}

export interface ServiceType {
  id: string
  name: string
  // Parent system type (e.g. Fire Alarm). The queryable code lives on the
  // system type now, not here.
  system_type_id: string | null
  /** Nominal code for work of this service type (second fallback). */
  nominal_code_id: string | null
  description: string | null
  default_frequency_months?: number // Legacy field
  default_frequency_value: number
  default_frequency_unit: 'weeks' | 'months'
  default_deadline_tolerance_days: number
  // Two-tier compliance tolerances (value + unit). Regulatory = legal baseline,
  // client = the (usually tighter) target shared with clients.
  regulatory_tolerance_value: number
  regulatory_tolerance_unit: ToleranceUnit
  client_tolerance_value: number
  client_tolerance_unit: ToleranceUnit
  color?: string | null
  icon?: string | null
  defects_to_email: string | null
  default_worker_type: WorkerType
  // The kind of call this service type represents:
  // - 'recurring': schedules recurring PPM visits (deadline-driven).
  // - 'reactive': ad-hoc on-demand call with an "attend within X hours" KPI
  //   (e.g. Reactive, Emergency Callout).
  // - 'planned': a scheduled one-off (e.g. Commissioning) with NO deadline/KPI
  //   and never an emergency; can be assigned to multiple systems.
  // `is_recurring`/`is_emergency` are kept in sync for backward compatibility.
  call_kind: 'recurring' | 'reactive' | 'planned'
  // Whether this service type schedules recurring PPM visits. Mirrors
  // `call_kind === 'recurring'`. Kept for backward compatibility.
  is_recurring: boolean
  // Marks a non-recurring type as an emergency call type (pulsing map marker +
  // engineer emergency notification on assignment).
  is_emergency: boolean
  // Default "attend within X hours" KPI applied when logging a call of this
  // type (editable at booking). NULL = no default KPI.
  default_kpi_hours: number | null
  // When true, completed calls of this service type are deemed chargeable and
  // automatically sent to the Chargeable Calls review queue on completion
  // (feeds future invoicing). Parts used on a call always force chargeable too.
  default_chargeable: boolean
  // Only meaningful when default_worker_type === 'cdo'. When true, CDO-delivered
  // services of this type may be allocated to a route; when false they are
  // delivered by a CDO but never routed (e.g. fire extinguisher servicing, fire
  // & smoke damper testing). Non-CDO delivery is never routed regardless.
  route_eligible: boolean
  status: 'live' | 'dead'
  created_at: string
  system_type?: SystemType | null
  // Optional ordered set of distinct visits within one service cycle (e.g.
  // Fire Alarm Maintenance = Annual, Periodic). Empty/length 1 = single visit.
  visit_types?: ServiceVisitType[]
}

// A distinct visit within a multi-visit service cycle. Visits are evenly split
// across the service frequency (2 visits over 12 months = 6 months apart).
  export interface ServiceVisitType {
  id: string
  service_type_id: string
  name: string
  sort_order: number
  // Relative share of a cycle's revenue this visit carries when a cycle mixes
  // differently valued visit types. Defaults to 1 (equal split).
  revenue_weight: number
  // How many times per year a visit of this type occurs (e.g. weekly fire
  // alarm = 1 Annual + 51 Periodic). Revenue is apportioned as
  // annual_net * weight / Σ(occurrences_per_year * weight). 0 = not configured.
  occurrences_per_year: number
  created_at: string
  updated_at: string
  }

// A reusable, global non-product service that can be added to any quote system
// (e.g. Installation, Decommission redundant equipment). Configured under
// Sales → Quote Services and surfaced via the quote builder's "Add service".
export interface QuoteService {
  id: string
  name: string
  description: string | null
  default_price_pence: number | null
  position: number
  active: boolean
  created_at: string
  updated_at: string
}

// A conditional rule attached to a checklist item. When the engineer's answer to
// the parent item meets the `when` trigger, the rule becomes "active" and the
// engineer must satisfy its requirements (a photo, a note and/or the follow-up
// questions) before the task can be submitted.
export interface ChecklistCondition {
  id: string
  // What answer on the parent item activates this rule.
  // - fail/advisory/pass  → pass_fail items
  // - checked/unchecked   → checkbox items
  // - number              → number items (uses comparator + threshold)
  when: 'fail' | 'advisory' | 'pass' | 'checked' | 'unchecked' | 'number'
  // Number triggers only: how to compare the entered value against `threshold`.
  comparator?: 'gt' | 'lt' | 'gte' | 'lte' | 'eq'
  threshold?: number
  // Requirements the engineer must satisfy while the rule is active.
  requirePhoto?: boolean
  requireNote?: boolean
  // Extra follow-up questions revealed while active. One level deep — a follow-up
  // item cannot itself carry conditions.
  items?: ChecklistItem[]
  // Internal Tasks only: profile ids to notify when this rule fires on submit.
  // Ignored by service/damper/extinguisher checklists (they use notify_on_issue).
  notifyUserIds?: string[]
}

export interface ChecklistItem {
  id: string
  label: string
  type: 'pass_fail' | 'text' | 'number' | 'checkbox'
  required: boolean
  // Conditional rules that reveal extra requirements based on this item's answer.
  conditions?: ChecklistCondition[]
}

export interface ChecklistTemplate {
  id: string
  service_type_id: string
  // When set, this template applies only to the matching visit type. When null,
  // it is the service-wide fallback used by visits with no specific template.
  visit_type_id?: string | null
  // When set, this template applies only when the booked call is for the
  // matching system type. When null, it is the general/any-system fallback.
  // Used by non-recurring (reactive/planned) call types that span multiple
  // systems, each with its own checklist.
  system_type_id?: string | null
  name: string
  items: ChecklistItem[]
  created_at: string
  updated_at: string
  service_type?: ServiceType
  system_type?: SystemType | null
}

// Client-specific checklist items appended to the engineer's checklist. Scoped
// by client and, optionally, by system type(s) and service type(s). An empty
// array for either scope means "applies to all" of that dimension.
export interface ClientChecklistItem {
  id: string
  client_id: string
  label: string
  type: 'pass_fail' | 'text' | 'number' | 'checkbox'
  required: boolean
  system_type_ids: string[]
  service_type_ids: string[]
  position: number
  created_at: string
  updated_at: string
}

// Client-specific reference URL link. When sendable_to_engineers is true and
// the (optional) system/service scope matches a task, the link is surfaced to
// the engineer on that task. Empty scope arrays mean "applies to all".
export interface ClientLink {
  id: string
  client_id: string
  label: string
  url: string
  description: string | null
  sendable_to_engineers: boolean
  system_type_ids: string[]
  service_type_ids: string[]
  position: number
  created_at: string
  updated_at: string
}

// ============================================================================
// Internal Tasks / Quality module
// Recurring internal quality/management tasks (toolbox talks, vehicle checks,
// annual nominations) built like forms with conditional questions + photos.
// ============================================================================

export type InternalTaskFrequency =
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'annual'
  | 'one_off'

export type InternalTaskStatus = 'pending' | 'completed' | 'overdue'

// A user-defined column of a fillable table block on an internal task form.
export interface InternalTaskTableColumn {
  id: string
  label: string
  type: 'text' | 'number' | 'date'
}

// A form block on an internal task. This is a SUPERSET of ChecklistItem: it
// keeps every ChecklistItem field (so basic question types + conditions behave
// identically) and adds internal-tasks-only block types. It is intentionally
// separate from ChecklistItem so the shared service/damper/extinguisher
// checklist schema is never polluted with these blocks.
//   - section  : a heading/divider between questions (display only, no answer)
//   - doc_link : a link to a file in the company document library (display only)
//   - url_link : an external URL link (display only)
//   - table    : a fillable table; author defines columns, user adds rows
export interface InternalTaskItem {
  id: string
  label: string
  type:
    | 'pass_fail'
    | 'text'
    | 'number'
    | 'checkbox'
    | 'section'
    | 'doc_link'
    | 'url_link'
    | 'table'
  required: boolean
  conditions?: ChecklistCondition[]
  // section: optional supporting copy shown beneath the heading.
  description?: string
  // doc_link: the linked company document (documents.id) + cached display name.
  documentId?: string | null
  documentName?: string | null
  // url_link: the external URL to open.
  url?: string
  // table: the column definitions the user fills row-by-row at completion.
  columns?: InternalTaskTableColumn[]
}

// One filled row of a table block: maps a column id to its cell text.
export type InternalTaskTableRow = Record<string, string>

// A user's answer to one internal task block. Superset of ChecklistResult that
// widens `type` to the internal-task block types and lets a table block's value
// be an array of row objects. Section/doc/url blocks are display-only and never
// produce an answer. Kept separate from ChecklistResult so the shared checklist
// result schema is not polluted.
export interface InternalTaskAnswer
  extends Omit<ChecklistResult, 'type' | 'value'> {
  type: InternalTaskItem['type']
  value: boolean | string | number | InternalTaskTableRow[]
}

// A recurring internal task definition. `questions` uses InternalTaskItem[] (a
// superset of ChecklistItem) so it also supports section/doc/url/table blocks.
export interface InternalTaskTemplate {
  id: string
  name: string
  description: string | null
  category: string | null
  active: boolean
  sort_order: number
  // Recurrence
  frequency: InternalTaskFrequency
  week_ending_dow: number // 0=Sun..6=Sat, weekly period end
  anchor_month: number | null // annual/quarterly window shift (1-12)
  anchor_day: number | null // annual/quarterly window shift (1-31)
  one_off_due_date: string | null
  grace_days: number // days after period_end the task is due
  due_time: string // 'HH:MM[:SS]' deadline time on the due day
  reminder_days_before: number[]
  warn_overdue: boolean
  // Content
  questions: InternalTaskItem[]
  requires_reference: boolean
  reference_label: string | null
  // Targeting (union / combine-all)
  applies_to_all: boolean
  role_names: string[]
  department_ids: string[]
  user_ids: string[]
  // Escalation: who to alert when a completed instance has a failure/advisory.
  // In-app notification to these profile ids, plus an optional email address.
  notify_on_issue_user_ids: string[]
  notify_on_issue_email: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// One occurrence of a template for one user, for one period.
export interface InternalTaskInstance {
  id: string
  template_id: string
  user_id: string
  period_start: string
  period_end: string
  due_at: string
  status: InternalTaskStatus
  completed_at: string | null
  reference_number: string | null
  answers: InternalTaskAnswer[]
  created_at: string
  updated_at: string
  // Optional embeds
  template?: InternalTaskTemplate
  user?: Profile
}

export interface InternalTaskAttachment {
  id: string
  instance_id: string | null
  uploaded_by: string | null
  name: string
  blob_pathname: string
  blob_url: string
  content_type: string | null
  size_bytes: number | null
  created_at: string
}

// ============================================================================
// Timesheets module
// ============================================================================

export type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

export interface Timesheet {
  id: string
  user_id: string
  week_ending: string // Sunday "YYYY-MM-DD"
  status: TimesheetStatus
  submitted_at: string | null
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
  manual_note: string | null
  late: boolean
  // Frozen computed TimesheetSummary snapshot (see lib/timesheets/compute.ts).
  summary: unknown | null
  confirmed_task_instance_ids: string[]
  toolbox_reference: string | null
  // Processing stage: once approved, a nominated processor confirms it as
  // processed (toggleable). approved_by/approved_at hold the approver identity.
  processed: boolean
  processed_by: string | null
  processed_at: string | null
  // Dates the user confirmed as night-shift working. null = unset (UI falls back
  // to the auto-suggested nights); an array (possibly empty) = explicit set.
  night_shift_dates: string[] | null
  created_at: string
  updated_at: string
  // Optional embeds
  user?: Profile
}

export interface TimesheetManualEntry {
  id: string
  timesheet_id: string
  entry_date: string
  start_at: string
  end_at: string
  description: string | null
  created_at: string
}

// Engineer-initiated request to take over a nearby open call.
export interface TaskTransferRequest {
  id: string
  task_id: string
  requested_by: string
  current_engineer_id: string | null
  status: 'pending' | 'approved' | 'declined' | 'cancelled'
  message: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
}

// Per-recipient in-app notification. Browser push is a best-effort mirror.
export interface AppNotification {
  id: string
  user_id: string
  title: string
  body: string | null
  url: string | null
  category: string
  data: Record<string, unknown>
  read_at: string | null
  created_by: string | null
  created_at: string
}

export interface Route {
  id: string
  name: string
  description: string | null
  assigned_engineer_id: string | null
  // Colour used to render this route's recurring weekly band on the calendar.
  color: string
  created_at: string
  updated_at: string
  assigned_engineer?: Profile | null
}

export type RemoteMonitoringType = 'fire' | 'fire_and_fault' | 'fault'

export interface Site {
  id: string
  name: string
  address: string
  postcode: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  route_id: string | null
  client_id: string | null
  branch_id: string | null
  // Billing account this site is invoiced under. null = inherit the client's
  // default billing account (see resolveBillingAccount).
  billing_account_id: string | null
  // Site-level rate card override. null = inherit customer/default. Resolution:
  // service -> site -> customer (billing account) -> company default.
  rate_card_id: string | null
  /** Site-level customer PO; used when no system/service PO is set. */
  po_number: string | null
  /** Pre-authorised spend limit (pence) for NON-recurring works at this site. */
  authorised_works_limit_pence: number | null
  /** PO to stamp on non-recurring calls that fall within the authorised limit. */
  authorised_works_po: string | null
  site_id_cash: string | null
  // Unique Property Reference Number (UK national property identifier).
  uprn: string | null
  // Admin-configurable property/building type (see PropertyType).
  property_type_id: string | null
  // Default sub-contractor for sub-contracted services at this site.
  default_subcontractor_id: string | null
  // 'new' = auto-created from an accepted prospect quote; treated as off-contract
  // for scheduling (like 'dead') until formally onboarded.
  status: 'live' | 'dead' | 'new'
  notes: string | null
  // Pre-attendance flags engineers/office can set at site level. Individual
  // site_services may override these (see SiteService); null override = inherit.
  booking_required: boolean
  access_required: boolean
  keys_required: boolean
  two_engineers_required: boolean
  remedial_required: boolean
  remedial_notes: string | null
  reporting_emails: string[]
  has_remote_monitoring: boolean
  remote_monitoring_type: RemoteMonitoringType | null
  monitoring_station_name: string | null
  monitoring_station_phone: string | null
  monitoring_station_url: string | null
  route_position: number | null
  billing_account?: BillingAccount | null
  // Cached geocode of the postcode (via postcodes.io), used for "nearby calls".
  latitude: number | null
  longitude: number | null
  geocoded_at: string | null
  created_at: string
  updated_at: string
  // Staff member who set the site up (null for legacy/system-created sites).
  created_by: string | null
  route?: Route
  client?: Client
  branch?: Branch | null
  property_type?: PropertyType | null
  default_subcontractor?: Supplier | null
  }

  export type LogbookEntryType =
    | 'weekly_alarm_test'
    | 'monthly_emergency_light_test'
    | 'fire_drill'
    | 'false_alarm'
    | 'fault_defect'
    | 'note'
    | 'fire_door_check'
    | 'firefighting_equipment_check'
    | 'staff_training'
    | 'frs_visit'

  export interface LogbookEntry {
    id: string
    site_id: string
    entry_type: LogbookEntryType
    entry_date: string
    title: string | null
    details: string | null
    /** Outcome of the check, e.g. Pass / Fail / observation summary. */
    result: string | null
    /** Manual call point number/URN tested (weekly fire alarm test). */
    call_point_ref: string | null
    /** Description/location of the call point tested (weekly fire alarm test). */
    call_point_location: string | null
    performed_by: string | null
    source: 'occupier' | 'staff'
    created_by: string | null
    created_at: string
  }

  export interface EmergencyContact {
    name: string
    role: string
    phone: string
  }

  export interface SiteBuildingInfo {
    site_id: string
    responsible_person_name: string | null
    responsible_person_role: string | null
    responsible_person_phone: string | null
    responsible_person_email: string | null
    competent_person_name: string | null
    competent_person_company: string | null
    competent_person_phone: string | null
    competent_person_email: string | null
    fra_location: string | null
    fra_last_date: string | null
    fra_next_date: string | null
    fra_assessor: string | null
    fra_notes: string | null
    emergency_contacts: EmergencyContact[]
    updated_at: string
    updated_by: string | null
  }

  // A per-site system instance (e.g. "Fire Alarm — Gent panel"). Services are
  // nested underneath a site system.
  export interface SiteSystem {
    id: string
    site_id: string
    system_type_id: string | null
    name: string
    description: string | null
    location: string | null
    install_date: string | null
  /** URL to the Nimbus fire alarm monitoring portal for this system. */
  nimbus_url: string | null
  /** Lifecycle status (see lib/entity-status). `active` is kept in sync = status==='live'. */
  status: 'live' | 'new' | 'dead'
  active: boolean
  position: number
  /** Default sub-contractor for sub-contracted services under this system. */
  default_subcontractor_id: string | null
    // Per-system attendance overrides. `null` inherits the site default; an
    // explicit boolean overrides it (and is itself overridden per service).
    booking_required: boolean | null
    access_required: boolean | null
    keys_required: boolean | null
    two_engineers_required: boolean | null
    remedial_notes: string | null
    // When true, multi-panel visits spread the heavy (Annual) inspections across
    // the cycle's visit occurrences per panel_visit_assignments (opt-in).
    panel_rotation_enabled: boolean
    /** System-level customer PO; used when no service PO is set, above the site PO. */
    po_number: string | null
    /** Pre-authorised additional-service spend (pence) written on quote acceptance. */
    additional_service_limit_pence: number | null
    /** PO covering additional maintenance services for this system. */
    additional_service_po: string | null
    created_at: string
    updated_at: string
    site?: Site
    system_type?: SystemType | null
    site_services?: SiteService[]
    panels?: SystemPanel[]
    default_subcontractor?: Supplier | null
  }

  // Admin-configurable definition of a panel field, scoped to a system type.
  // Mirrors WorkTypeField. Drives the dynamic "Add panel" form.
  export interface PanelFieldDef {
    id: string
    system_type_id: string
    label: string
    field_key: string
    field_type: 'text' | 'number' | 'select' | 'boolean'
    options: string[]
    required: boolean
    position: number
    active: boolean
    created_at: string
    updated_at: string
    system_type?: SystemType | null
  }

  // A panel instance belonging to a site system. field_values is keyed by the
  // panel_field_defs.field_key for that system type. Internal-use only.
  export interface SystemPanel {
    id: string
    site_system_id: string
    name: string
    position: number
    field_values: Record<string, string | number | boolean | null>
    created_at: string
    updated_at: string
  }

  // ---------- Remote Monitoring (REM-MON) configurable section ----------

  export type RemMonFieldType = 'text' | 'textarea' | 'number' | 'date' | 'select'

  // Where a REM-MON link points. 'online' opens an external URL entered per site;
  // 'in_app' deep-links to one of this site's own pages (target resolved from the
  // site id at render time).
  export type RemMonLinkTargetKind = 'online' | 'in_app'
  export type RemMonInAppTarget =
    | 'overview'
    | 'systems'
    | 'documents'
    | 'assets'
    | 'calls'
    | 'logbook'
    | 'quotes'
    | 'custom'

  // Admin-configurable custom field for the REM-MON section master template,
  // scoped to a system type (the Remote Monitoring system). Mirrors PanelFieldDef.
  export interface RemMonFieldDef {
    id: string
    system_type_id: string
    label: string
    field_key: string
    field_type: RemMonFieldType
    options: string[]
    required: boolean
    position: number
    active: boolean
    created_at: string
    updated_at: string
    system_type?: SystemType | null
  }

  // Admin-configurable link slot for the REM-MON section master template. Each
  // site fills the actual URL/override in RemMonEntry.link_values keyed by link_key.
  export interface RemMonLinkDef {
    id: string
    system_type_id: string
    label: string
    link_key: string
    target_kind: RemMonLinkTargetKind
    in_app_target: RemMonInAppTarget | null
    position: number
    active: boolean
    created_at: string
    updated_at: string
    system_type?: SystemType | null
  }

  // A per-site REM-MON entry belonging to a site system (multiple allowed, like
  // panels). field_values is keyed by rem_mon_field_defs.field_key; link_values is
  // keyed by rem_mon_link_defs.link_key (URL for 'online', optional path for 'custom').
  export interface RemMonEntry {
    id: string
    site_system_id: string
    name: string
    position: number
    field_values: Record<string, string | number | boolean | null>
    link_values: Record<string, string | null>
    created_at: string
    updated_at: string
  }

  // Panel-level visit rotation. For a multi-panel system with rotation enabled,
  // each panel is assigned, per scheduled visit occurrence (`visit_type_id`), the
  // checklist level actually applied to it (`applied_visit_type_id`). This spreads
  // the heavy (Annual) inspections across the cycle's visits.
  export interface PanelVisitAssignment {
    id: string
    site_system_id: string
    panel_id: string
    visit_type_id: string
    applied_visit_type_id: string
    created_at: string
    updated_at: string
  }

  export interface SiteService {
  id: string
  site_id: string
  site_system_id: string | null
  service_type_id: string
  frequency_months?: number // Legacy field
  frequency_value: number
  frequency_unit: 'weeks' | 'months'
  last_service_date: string | null
  next_service_date: string | null
  deadline_tolerance_days: number
  deadline_tolerance_unit: ToleranceUnit
  // Optional client KPI override for this site/service. NULL = inherit the
  // service type's regulatory KPI as the client default.
  client_tolerance_value: number | null
  client_tolerance_unit: ToleranceUnit | null
  // Who performs the work (CDO / Engineer / Sub-contractor).
  worker_type: WorkerType
  // How the work is routed. Any of these may be set depending on worker_type;
  // a directly-assigned engineer always overrides route/area resolution.
  route_id: string | null
  area_id: string | null
  subcontractor_id: string | null
  // Fixed annual cost (pence) paid to the sub-contractor for this service. Used
  // to show the true margin vs the annualised recurring revenue. Only meaningful
  // when worker_type = 'subcontractor'.
  subcontractor_annual_cost_pence: number | null
  // Service-level rate card override (most specific). null = inherit site,
  // then customer (billing account), then company default.
  rate_card_id: string | null
  assigned_engineer_id: string | null
  reporting_emails: string[]
  defects_to_email: string | null
  // When true (default) the next recurring task anchors to the original
  // scheduled date (fixed cadence); when false it anchors to completion date.
  anchor_next_to_schedule: boolean
  // Lifecycle status (see lib/entity-status). `active` is kept in sync via DB
  // trigger = status==='live', so all existing active-filtered visit/billing
  // queries treat Engaged (new) and Dormant (dead) as off automatically.
  status: 'live' | 'new' | 'dead'
  // When false, the service is inactive: no new calls are generated for it
  // (recurrence, bulk generation, manual scheduling all suppressed).
  active: boolean
  // Pre-attendance flag overrides. null = inherit the site-level value;
  // an explicit true/false overrides the site setting for this service only.
  booking_required: boolean | null
  access_required: boolean | null
  keys_required: boolean | null
  two_engineers_required: boolean | null
  remedial_required: boolean | null
  remedial_notes: string | null
  // When true, this system is under comprehensive cover for the client/site.
  // Used in future charging logic to decide what a chargeable call costs the
  // client (comprehensive cover typically means no/reduced charge). Store-only today.
  comprehensive_cover: boolean
  comprehensive_cover_note: string | null
  // % uplift baked into a comprehensive service's charge, stripped out to leave
  // the base service revenue used for profitability. null = no uplift.
  comprehensive_uplift_pct: number | null
  // Billing account this specific service is invoiced under. null = inherit the
  // site's billing account (which itself falls back to the client default). This
  // is how a single service can be billed to a different (sub-)client than its
  // site — "change the client at service level".
  billing_account_id: string | null
  /** Service/charge-level customer PO; top of the fallback chain. */
  po_number: string | null
  created_at: string
  site?: Site
  site_system?: SiteSystem | null
  service_type?: ServiceType
  route?: Route
  area?: Area | null
  subcontractor?: Subcontractor | null
  assigned_engineer?: Profile
  billing_account?: BillingAccount | null
}

// Document store: folders + files attached to a client, site, a site's service,
// or a site's shared engineer folder (engineer-contributable downloads/drawings).
// 'system_reference' is a global store of AI reference guides assigned to a
// system type (see SYSTEM_REFERENCE_OWNER_ID).
export type DocumentOwnerType =
  | 'client'
  | 'site'
  | 'site_service'
  | 'site_engineer'
  | 'system_reference'
  // Entities that support generated (mail-merge) documents in addition to uploads.
  | 'task'
  | 'quote'
  | 'job'

// Category of a mail-merge letter template (drives which starter copy / grouping).
export type DocumentTemplateCategory =
  | 'cancellation_ack'
  | 'complaint_response'
  | 'general_letter'
  | 'payment_request'
  | 'other'

// A reusable letter template whose body contains {{merge.tokens}} that are filled
// from the chosen entity + company branding. `entity_types` limits which owner
// types a template is offered for. Managed by office/admin under Settings.
export interface DocumentTemplate {
  id: string
  name: string
  category: DocumentTemplateCategory
  subject: string | null
  body: string
  entity_types: DocumentOwnerType[]
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

// A communal internal note left by staff (engineers/office/admin) against a site.
export interface SiteInternalNote {
  id: string
  site_id: string
  author_id: string | null
  body: string
  created_at: string
  author?: Pick<Profile, 'id' | 'full_name' | 'role'> | null
}

// The resolved pre-attendance flags for a task, after applying service-level
// overrides on top of the site-level defaults.
export interface ResolvedSiteFlags {
  booking_required: boolean
  access_required: boolean
  keys_required: boolean
  two_engineers_required: boolean
  remedial_required: boolean
  remedial_notes: string | null
}

export interface DocumentFolder {
  id: string
  owner_type: DocumentOwnerType
  owner_id: string
  parent_id: string | null
  name: string
  created_by: string | null
  created_at: string
}

// A shared, company-wide tag used to categorise uploaded documents and drive
// the folder "Type" filter. Vocabulary is managed by office/admin under Settings.
export interface DocumentTag {
  id: string
  name: string
  created_by: string | null
  created_at: string
}

export interface DocumentFile {
  id: string
  owner_type: DocumentOwnerType
  owner_id: string
  folder_id: string | null
  name: string
  blob_pathname: string
  blob_url: string
  content_type: string | null
  size_bytes: number | null
  uploaded_by: string | null
  created_at: string
  // System reference fields (only populated for owner_type = 'system_reference').
  description?: string | null
  system_type_id?: string | null
  extracted_text?: string | null
  // Set when this document was generated from a mail-merge template (null for uploads).
  template_id?: string | null
  // Tags applied to this file (uploaded documents require at least one).
  tags?: DocumentTag[]
}

export interface TaskAttachment {
  id: string
  task_id: string
  name: string
  blob_pathname: string
  blob_url: string
  content_type: string | null
  size_bytes: number | null
  uploaded_by: string | null
  created_at: string
  uploader?: {
    id: string
    full_name: string | null
    email: string | null
  } | null
}

// 'paused' = an inspection an engineer started but left before completing (e.g.
// they need to return another day). It keeps its progress/checklist intact and
// still counts as active/open work, but the engineer is no longer on site.
export type TaskStatus = 'pending' | 'in_progress' | 'paused' | 'completed' | 'cancelled'

export interface Task {
  id: string
  // Human-facing call reference (PYR-YYYY-NNNNNN). Assigned at creation by a DB
  // trigger for EVERY call (recurring + reactive) and locked thereafter. The
  // call's task_result inherits this same number so the call and its report
  // share one reference.
  reference_number: string | null
  // Recurring PPM calls hang off a site_service. Reactive / emergency calls have
  // no recurring service, so this is null and the call is anchored by site_id +
  // service_type_id + system_type_id instead. Exactly one anchor is guaranteed
  // by a CHECK constraint.
  site_service_id: string | null
  // Direct anchors. Always populated for reactive/emergency calls, and
  // backfilled on existing recurring calls (from the linked service) so reads
  // can rely on them regardless of call kind.
  site_id: string | null
  service_type_id: string | null
  system_type_id: string | null
  // Emergency call: shown with a pulsing map marker until started and triggers a
  // prominent engineer notification on assignment.
  is_emergency: boolean
  // "Attend within X hours" KPI deadline. NULL = no KPI on this call.
  respond_by: string | null
  // When an engineer was assigned (drives KPI/response reporting).
  assigned_at: string | null
  // Client this call is billed to. Defaults to the site's client at scheduling
  // time but can be overridden.
  client_id: string | null
  assigned_engineer_id: string | null
  scheduled_date: string
  // Optional booked appointment slot on the scheduled date (24h "HH:MM[:SS]").
  booked_start_time: string | null
  booked_end_time: string | null
  // Anticipated time to complete the visit, in minutes (days + hours entered by
  // the engineer). Drives how long the task blocks out on the calendar; a
  // working day is treated as 8 hours (480 minutes).
  booked_duration_minutes: number | null
  status: TaskStatus
  started_at: string | null
  completed_at: string | null
  // Set when the task is paused (engineer left site before completing). Cleared
  // on resume. `started_at` is preserved across a pause so elapsed/first-started
  // reporting stays intact.
  paused_at: string | null
  pause_note: string | null
  paused_by: string | null
  notes: string | null
  public_token: string
  created_at: string
  updated_at: string
  // The visit type this task fulfils (null = single/legacy service-wide visit).
  visit_type_id?: string | null
  // True when this call was raised as remedial works (e.g. auto-created when a
  // remedial quote is accepted). Drives the automatic "remedial works required"
  // pre-attendance alert at site and service level.
  is_remedial: boolean
  // When this is a remedial call, the quote/defect it originated from.
  source_quote_id: string | null
  source_defect_id: string | null
  // When the call was booked from a job (e.g. a commissioning visit), the job it
  // belongs to. `is_commissioning` flags commissioning calls, which copy key job
  // info into the notes and expose the job's documents folder to the engineer.
  source_job_id: string | null
  is_commissioning: boolean
  // Charge review (feeds the Chargeable Calls queue + future invoicing). Set
  // automatically on completion: chargeable when the service type defaults to
  // chargeable OR any parts were used. Adding parts to a completed call always
  // forces chargeable + re-opens review.
  //  - charge_review_status: 'none' (not chargeable / N/A) | 'pending' | 'reviewed'
  //  - charge_reason: 'service_default' | 'parts_added' | 'manual' | null
  chargeable: boolean
  charge_review_status: 'none' | 'pending' | 'reviewed'
  charge_reason: string | null
  charge_reviewed_at: string | null
  charge_reviewed_by: string | null
  // Optional client PO reference, entered at review/logging time
  client_ref: string | null
  // True when client_ref was auto-imported from the site/system authorised-works
  // PO at booking (so no PO request is needed and the call is invoiceable).
  po_auto_authorised: boolean
  // Invoiced status — set after the call has been sent for invoicing
  charge_invoiced_at: string | null
  charge_invoiced_by: string | null
  // Deadline-missed logging: reason + free-text note when respond_by was missed
  deadline_failed_reason: string | null
  deadline_failed_note: string | null
  // Follow-up chain: when this call is a follow-up to an earlier call that could
  // not be resolved on the day, this points at the previous call. `fix_attempt`
  // counts visits in the chain (1 = original, 2 = first follow-up, …).
  // `first_time_fix` is set to false on an emergency ORIGINAL when a follow-up is
  // raised (null otherwise), for first-time-fix KPI reporting.
  follow_up_to_id: string | null
  first_time_fix: boolean | null
  fix_attempt: number
  site_service?: SiteService
  // Direct joins for reactive/emergency calls (and available on recurring calls
  // via the backfilled ids).
  site?: Site | null
  service_type?: ServiceType | null
  system_type?: SystemType | null
  assigned_engineer?: Profile | null
  visit_type?: ServiceVisitType | null
  client?: Client | null
  // The call this one follows up on (when follow_up_to_id is set).
  follow_up_to?: Task | null
  }

  // ── Follow-up calls ────────────────────────────────────────────────────────
  export type FollowUpStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
  export type FollowUpPartAction = 'none' | 'reserve' | 'order'
  export type FollowUpReservationStatus = 'pending' | 'confirmed'

  // A follow-up review-queue row, created when an engineer flags "further works
  // required". Reviewed by office before the linked Planned Call is created.
  export interface FollowUpRequest {
  id: string
  original_task_id: string
  site_id: string | null
  requested_by: string | null
  fix_attempt: number
  issue_summary: string
  status: FollowUpStatus
  proposed_date: string | null
  assigned_engineer_id: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  reject_reason: string | null
  created_task_id: string | null
  escalated: boolean
  escalated_at: string | null
  resolved_at: string | null
  created_at: string
  // Joins.
  original_task?: Task | null
  site?: Site | null
  requested_by_profile?: Profile | null
  assigned_engineer?: Profile | null
  parts?: FollowUpPart[]
  }

  // An engineer-suggested part for a follow-up, with optional reserve/order action.
  export interface FollowUpPart {
  id: string
  request_id: string
  part_id: string | null
  description: string | null
  quantity: number
  action: FollowUpPartAction
  location_id: string | null
  reservation_status: FollowUpReservationStatus | null
  location_ref: string | null
  notes: string | null
  created_at: string
  // Joins.
  part?: Part | null
  location?: StockLocation | null
  }

  export interface ChecklistResult {
  item_id: string
  label: string
  type: 'pass_fail' | 'text' | 'number' | 'checkbox'
  value: boolean | string | number
  passed: boolean | null
  // Third state for pass/fail items: neither a pass nor a fail, but an
  // observation worth noting (e.g. wear, minor issue, recommendation).
  // When true, `passed` is null and the item is excluded from the pass/fail
  // outcome, but it is still surfaced in the defects log for review.
  advisory?: boolean
  // Not applicable: the engineer has marked this item as N/A for this visit.
  // Available on ALL item types. When true the item is excluded from the
  // pass/fail outcome and defect sync, never blocks submission, and never
  // activates conditional follow-up questions. `passed` is null when na.
  na?: boolean
  notes?: string
  // When a system has configured panels, the general checklist is repeated once
  // per panel. These tag each result with the panel it belongs to. Absent on
  // legacy/non-panel results, which keeps older reports rendering unchanged.
  panel_id?: string | null
  panel_name?: string | null
  // When panel rotation is active, the visit-type/level label actually applied to
  // this panel on this visit (e.g. "Annual" / "Periodic"). Absent otherwise.
  panel_level?: string | null
  // Conditional rules copied from the template item onto its (parent) result row
  // at build time, so execution and reports can evaluate triggers without the
  // template. Present only on top-level rows that have rules. Panel repetition
  // copies these onto each panel's row.
  conditions?: ChecklistCondition[]
  // Conditional follow-up rows: when this result was produced by a triggered
  // condition on another item, these tag the parent item and the condition that
  // spawned it. Absent on normal (top-level) rows. Reports hide these rows unless
  // the owning condition was actually active and the row was answered.
  parent_item_id?: string
  condition_id?: string
  // Whether this (follow-up) row must be answered before submit. Mirrors the
  // template item's `required` flag; only meaningful on conditional child rows.
  required?: boolean
  // Per-item photos captured during execution. Metadata comes from the
  // task_attachments upload; the file is served via the attachments file route.
  photos?: { id: string; name: string; url: string }[]
  }

// PO request log: one row per request sent to the client for a PO number.
export interface PurchaseOrderRequest {
  id: string
  task_id: string
  requested_by: string
  note: string | null
  email_sent_at: string | null
  email_sent_to: string[] | null
  special_note: string | null
  po_number: string | null
  authorised_by_name: string | null
  authorised_at: string | null
  authorisation_token: string | null
  // When the public authorisation link stops working (30-day window).
  token_expires_at: string | null
  created_at: string
  updated_at: string
  // Joined fields
  requester?: { full_name: string | null; email: string }
}

// Key/value config for global application settings.
export interface GlobalConfig {
  key: string
  value: unknown
  updated_at: string
  updated_by: string | null
}

// Defect tracking: one row per failed report (task_result with overall_status='fail').
// Auto-maintained by a DB trigger; lifecycle open -> quoted -> resolved/dismissed.
export type DefectStatus = 'open' | 'quoted' | 'resolved' | 'dismissed'

export interface Defect {
  id: string
  task_result_id: string
  task_id: string | null
  site_id: string | null
  client_id: string | null
  reference_number: string | null
  failed_count: number
  status: DefectStatus
  quote_id: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

// 'no_access' is used when an engineer attended but could not gain access to
// the site. It is a distinct outcome and is NOT treated as a failure.
export type TaskResultStatus = 'pending' | 'pass' | 'fail' | 'partial' | 'no_access'

export interface TaskResult {
  id: string
  task_id: string
  reference_number: string
  checklist_results: ChecklistResult[]
  overall_status: TaskResultStatus
  photos: string[]
  engineer_notes: string | null
  // On-site client sign-off captured on non-recurring calls. client_signature is
  // a PNG data URL (self-contained), client_signature_name is the printed name.
  client_signature: string | null
  client_signature_name: string | null
  testing_start_time: string | null
  testing_end_time: string | null
  email_sent_at: string | null
  created_at: string
  updated_at: string
  task?: Task
}

// Fire & Smoke Damper Testing types

export type DamperType = 'fire' | 'smoke' | 'fire_smoke'
export type DamperResult = 'pass' | 'fail' | 'remedial' | 'na'
export type DamperCondition = 'good' | 'fair' | 'poor'
export type DamperPhotoCategory = 'as_found' | 'when_tested' | 'fire_compartment' | 'additional'

export type DamperPhotoCategories = Record<DamperPhotoCategory, string[]>

export interface Damper {
  id: string
  site_id: string
  urn: string
  reference: string | null
  floor: string | null
  location: string | null
  damper_type: DamperType
  size_mm: string | null
  notes: string | null
  latest_result: DamperResult | null
  last_inspected_date: string | null
  created_at: string
  updated_at: string
  site?: Site
  inspections?: DamperInspection[]
}

export interface DamperInspection {
  id: string
  damper_id: string
  task_id: string | null
  inspected_by: string | null
  inspection_date: string
  accessible: boolean
  access_notes: string | null
  drop_test_pass: boolean | null
  fire_barrier_intact: boolean | null
  installation_correct: boolean | null
  fusible_link_ok: boolean | null
  spring_operation_ok: boolean | null
  actuator_ok: boolean | null
  damper_clean: boolean | null
  condition: DamperCondition | null
  overall_result: DamperResult
  remedial_action: string | null
  comments: string | null
  photos: string[]
  photo_categories: DamperPhotoCategories | null
  created_at: string
  damper?: Damper
  inspector?: Profile | null
}

// Fire Extinguisher Servicing types (BS 5306-3)

export type ExtinguisherType =
  | 'water'
  | 'foam'
  | 'co2'
  | 'powder'
  | 'wet_chemical'
  | 'water_mist'
export type ExtinguisherResult = 'pass' | 'fail' | 'remedial' | 'na'
export type ExtinguisherCondition = 'good' | 'fair' | 'poor'
export type ExtinguisherServiceLevel = 'basic' | 'extended' | 'overhaul' | 'recharge'
export type ExtinguisherPhotoCategory =
  | 'as_found'
  | 'gauge'
  | 'label'
  | 'additional'

export type ExtinguisherPhotoCategories = Record<ExtinguisherPhotoCategory, string[]>

export interface Extinguisher {
  id: string
  site_id: string
  urn: string
  reference: string | null
  floor: string | null
  location: string | null
  extinguisher_type: ExtinguisherType
  capacity: string | null
  serial_number: string | null
  manufacture_date: string | null
  commissioned_date: string | null
  notes: string | null
  latest_result: ExtinguisherResult | null
  last_inspected_date: string | null
  created_at: string
  updated_at: string
  site?: Site
  inspections?: ExtinguisherInspection[]
}

export interface ExtinguisherInspection {
  id: string
  extinguisher_id: string
  task_id: string | null
  inspected_by: string | null
  inspection_date: string
  accessible: boolean
  access_notes: string | null
  service_level: ExtinguisherServiceLevel
  correct_location: boolean | null
  signage_present: boolean | null
  seal_pin_intact: boolean | null
  pressure_gauge_ok: boolean | null
  weight_ok: boolean | null
  body_condition_ok: boolean | null
  hose_horn_ok: boolean | null
  label_legible: boolean | null
  mounting_secure: boolean | null
  condition: ExtinguisherCondition | null
  overall_result: ExtinguisherResult
  remedial_action: string | null
  comments: string | null
  photos: string[]
  photo_categories: ExtinguisherPhotoCategories | null
  created_at: string
  extinguisher?: Extinguisher
  inspector?: Profile | null
}

export interface ReportTemplate {
  id: string
  service_type_id: string
  name: string
  company_name: string | null
  company_logo_url?: string | null
  header_color: string | null
  footer_text: string | null
  include_signature: boolean
  sections: {
    company_address?: string
    company_phone?: string
    company_email?: string
    signatory_name?: string
    signatory_title?: string
    standards?: string
    [key: string]: unknown
  } | null
  created_at?: string
  updated_at?: string
}

export interface CompanyInfo {
  id: string
  name: string
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  registration_number: string | null
  vat_number: string | null
  logo_url: string | null
  // Default gross margin % pre-filled on new quote systems/lines.
  default_margin_percent: number
  // Company-level VAT: the numeric rate (%) drives invoice totals, the Sage tax
  // code (e.g. T1) drives the Sage export Tax Code column. Applied to all new
  // invoices; there are no per-charge overrides.
  default_vat_rate: number
  default_tax_code: string
  // Editable maintenance pricing rate tables (seeded from the Excel calculator).
  // NULL = use the built-in DEFAULT_MAINTENANCE_RATES. Typed as MaintenanceRates.
  maintenance_rates: Record<string, unknown> | null
  // Editable installation pricing rate tables (seeded from the Projects
  // Installation Workbook). NULL = use the built-in DEFAULT_INSTALLATION_RATES.
  // Typed as InstallationRates.
  installation_rates: Record<string, unknown> | null
  // Editable maintenance service-agreement copy (cover letter, cover sections,
  // FAQs, accreditations). NULL = use the built-in modernised defaults.
  maintenance_agreement: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
  }
  
  export interface Branch {
  id: string
  name: string
  address: string | null
  phone: string | null
  email: string | null
  created_at?: string
  updated_at?: string
}

// Extended types for dashboard views
export interface TaskWithDetails extends Task {
  site_service: SiteService & {
    site: Site
    service_type: ServiceType
    route?: Route | null
    area?: Area | null
    subcontractor?: Subcontractor | null
  }
  assigned_engineer: Profile | null
  task_result?: TaskResult
}

export interface SiteWithServices extends Site {
  site_services: (SiteService & { service_type: ServiceType })[]
}

export interface RouteWithSites extends Route {
  sites: Site[]
  assigned_engineer: Profile | null
}

// Editable, shared damper size/shape options
export interface DamperSizeOption {
  id: string
  label: string
  created_by: string | null
  created_at: string
}

// Manual Call Point (MCP) types — fire alarm asset register

export type McpResult = 'pass' | 'fail' | 'remedial' | 'na'

export interface Mcp {
  id: string
  site_id: string
  urn: string | null
  map_reference: string | null
  location: string | null
  floor: string | null
  test_key_type: string | null
  notes: string | null
  photos: string[]
  asset_image_url: string | null
  created_at: string
  updated_at: string
  site?: Site
  inspections?: McpInspection[]
  latest_result?: McpResult | null
  last_inspected_date?: string | null
}

export interface McpInspection {
  id: string
  mcp_id: string
  task_id: string | null
  inspector_id: string | null
  inspection_date: string
  result: McpResult
  checklist?: Record<string, 'pass' | 'fail' | 'na'>
  comments: string | null
  photos: string[]
  created_at: string
  mcp?: Mcp
  inspector?: Profile | null
}

// Emergency Lighting asset register + inspections

export type EmergencyLightResult = 'pass' | 'fail' | 'remedial' | 'na'

export interface EmergencyLight {
  id: string
  site_id: string
  urn: string | null
  map_reference: string | null
  location: string | null
  floor: string | null
  fitting_type: string | null
  notes: string | null
  photos: string[]
  created_at: string
  updated_at: string
  site?: Site
  inspections?: EmergencyLightInspection[]
  latest_result?: EmergencyLightResult | null
  last_inspected_date?: string | null
}

export interface EmergencyLightInspection {
  id: string
  emergency_light_id: string
  task_id: string | null
  inspector_id: string | null
  inspection_date: string
  result: EmergencyLightResult
  // Keyed by checklist item id -> pass/fail/na for that check
  checklist: Record<string, 'pass' | 'fail' | 'na'>
  comments: string | null
  photos: string[]
  created_at: string
  emergency_light?: EmergencyLight
  inspector?: Profile | null
}

// =====================================================================
// Sales / Quoting
// Money is stored as integer pence everywhere. Totals are recomputed
// server-side from line items, never trusted from the client.
// =====================================================================

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'

export interface QuoteCatalogueItem {
  id: string
  name: string
  // Supplier/product code from the imported spreadsheet (e.g. "000081").
  // Used to match items on re-import and as a secondary search key.
  product_code: string | null
  description: string | null
  category: string | null
  // Manufacturer / brand of the item (e.g. Apollo, Hochiki). Optional free text.
  // Carried onto the stock part when the item is added to stock.
  manufacturer: string | null
  service_type_id: string | null
  system_type_id: string | null
  default_unit: string | null
  // Unit cost and gross margin %. The sell price (default_unit_price_pence) is
  // derived as cost / (1 - margin%). Cost is the primary input going forward.
  unit_cost_pence: number
  margin_percent: number
  default_unit_price_pence: number
  // Price when sold on a service call/job (parts sold on calls).
  service_sale_price_pence: number
  // Price for an e-commerce/online store listing.
  ecommerce_price_pence: number
  // Product supplier we order this item from (see Supplier of type 'product').
  supplier_id: string | null
  // Private Vercel Blob pathname for the product image; served via /api/file.
  image_pathname: string | null
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  service_type?: ServiceType | null
  system_type?: SystemType | null
  supplier?: Supplier | null
}

export interface QuoteLineItem {
  id: string
  quote_id: string
  system_id: string | null
  catalogue_item_id: string | null
  service_type_id: string | null
  // True for non-product service lines (Installation, Decommission, etc.).
  // These are grouped into a separate "Services" sub-section on the quote.
  is_service: boolean
  // Manufacturer/supplier product code. Typing a code can link the line to a
  // catalogue item (sets catalogue_item_id, description, cost).
  product_code: string | null
  description: string
  detail: string | null
  quantity: number
  unit: string | null
  // Unit cost and gross margin %. unit_price_pence (sell) is derived as
  // cost / (1 - margin%). margin_percent null = inherit the system margin.
  unit_cost_pence: number
  margin_percent: number | null
  unit_price_pence: number
  line_total_pence: number
  position: number
  // Client-selectable option support. is_optional lines are excluded from the
  // core total until chosen; lines sharing a non-null option_group are mutually
  // exclusive. standard names the relevant industry standard (e.g. BS 5839-1).
  // client_selected records the client's electronic choice (null = undecided).
  is_optional: boolean
  option_group: string | null
  standard: string | null
  client_selected: boolean | null
  // Per-system maintenance additional-service allowance line (default £350).
  // The client can amend the value, opt out, and must supply a PO (or reuse the
  // maintenance PO) at sign-off; these overrides live on the line.
  is_maintenance_allowance: boolean
  /** Client-amended value (pence) for a maintenance-allowance line; null = use unit_price. */
  client_amount_pence: number | null
  /** PO the client supplied at sign-off for the allowance. */
  client_po: string | null
  /** When true the allowance should reuse the site/system/site maintenance PO. */
  use_maintenance_po: boolean
  // Serialised inputs + result of the calculator (installation / maintenance)
  // that produced this line, enabling it to be re-opened and viewed later.
  // NULL for hand-entered lines. Typed as CalculatorSnapshot.
  calculator_snapshot: Record<string, unknown> | null
  created_at: string
}

// A "system" within a quote, based on a system type. Carries a queryable
// code (snapshot of the system type code), a work-type code, an editable
// specification (pre-filled from a template), conditional "IF" answers, and
// design/survey metadata.
export interface QuoteSystem {
  id: string
  quote_id: string
  system_type_id: string | null
  service_type_id: string | null
  system_name: string
  system_code: string | null
  work_type: string
  specification: string | null
  conditional_values: Record<string, string | number | boolean>
  design_category_id: string | null
  design_overview: string | null
  designed_by: string | null
  designed_by_name: string | null
  drawing_reference: string | null
  survey_carried_out: boolean
  survey_by: string | null
  survey_date: string | null
  // Default gross margin % applied to this system's lines unless a line
  // overrides it with its own margin_percent.
  margin_percent: number
  position: number
  subtotal_pence: number
  created_at: string
  line_items?: QuoteLineItem[]
}

export interface Quote {
  id: string
  quote_number: string | null
  // Stable reference shared across a master quote and its clones/revisions.
  reference: string | null
  master_quote_id: string | null
  revision: number
  variant_label: string | null
  is_master: boolean
  title: string
  quote_type: string
  status: QuoteStatus
  client_id: string | null
  site_id: string | null
  // Branch issuing the quote (defaults from the preparer's profile). Its
  // contact details render on the quote document.
  branch_id: string | null
  prospect_name: string | null
  prospect_contact: string | null
  prospect_email: string | null
  prospect_phone: string | null
  prospect_address: string | null
  // New-prospect SITE details, independent of the client above (a quote can pair
  // an existing client with a new site, or a new client with a new site).
  prospect_site_name: string | null
  prospect_site_address: string | null
  prospect_site_contact: string | null
  prospect_site_email: string | null
  prospect_site_phone: string | null
  summary: string | null
  notes: string | null
  terms: string | null
  currency: string
  vat_rate: number
  discount_pence: number
  subtotal_pence: number
  vat_pence: number
  total_pence: number
  // When false, the PDF/quote document hides the itemised product lines and
  // shows only each system's total (and the overall total).
  show_line_items: boolean
  // When true, the client-facing quote/PDF renders the requirements compliance
  // matrix imported from the client's request. Internal-only when false.
  show_requirements_matrix: boolean
  // When true, the quote document/PDF appends a full equipment specification
  // (catalogue part numbers + standard descriptions + spec detail).
  show_equipment_spec: boolean
  // When true (default), the maintenance quote document/PDF appends the service
  // agreement pages (cover letter, cover summary, FAQ, accreditations).
  show_maintenance_agreement: boolean
  // When true (default), the quote document/PDF shows each system's design
  // overview + design/survey details. Hidden when false.
  show_design_overview: boolean
  // When true, optional extra line items are shown to the client on the public
  // quote/PDF. Defaults off so extras are hidden unless staff opt in.
  show_optional_extras: boolean
  valid_until: string | null
  sent_at: string | null
  decided_at: string | null
  decision_note: string | null
  // Public client-approval link + signature/PO capture.
  share_token: string | null
  // When the public share link stops working (90-day window, renewed on re-share).
  token_expires_at: string | null
  require_signature: boolean
  po_number: string | null
  signature_name: string | null
  signature_image_url: string | null
  signed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Quote Studio design payload (understanding, spec, and the product-combination
  // options considered). Null for quotes not produced by the studio.
  design_spec: QuoteDesignSpec | null
  client?: Client | null
  site?: Site | null
  // The issuing branch (joined from branches via branch_id).
  branch?: Branch | null
  // The staff member who prepared the quote (joined from profiles via created_by).
  preparer?: { id: string; full_name: string | null } | null
}

// A priced product combination considered by Quote Studio, summarised on the
// quote document so the client can see the recommended choice vs alternatives.
export interface QuoteDesignOption {
  rangeId: string | null
  name: string
  recommended: boolean
  // Total sell price (ex VAT) for the SAME device schedule on this combination.
  sellPence: number
  pros: string[]
  cons: string[]
}

export interface QuoteDesignSpec {
  options?: QuoteDesignOption[]
  // Other studio design fields (understanding, spec, etc.) are stored here too
  // but are not strongly typed for document rendering yet.
  [key: string]: unknown
}

export interface QuoteWithDetails extends Quote {
  systems: QuoteSystem[]
  line_items: QuoteLineItem[]
}

// ---------------------------------------------------------------------------
// Jobs — the operational record of a won (accepted) quote being delivered.
// ---------------------------------------------------------------------------

// Built-in delivery pipeline stage. Fixed set for now (see lib/jobs/stages.ts).
export type JobStage =
  | 'contract_review'
  | 'ordering'
  | 'in_progress'
  | 'commissioning'
  | 'handover'
  | 'complete'

export type JobStatus = 'open' | 'on_hold' | 'complete' | 'cancelled'

export interface Job {
  id: string
  job_number: string | null
  // Source won quote (nullable so jobs can outlive a deleted quote / be manual).
  quote_id: string | null
  client_id: string | null
  site_id: string | null
  branch_id: string | null
  title: string | null
  stage: JobStage
  status: JobStatus
  // Project manager / owner.
  owner_id: string | null
  department_id: string | null
  // Financial snapshot captured at conversion (pence). Margin = value - cost.
  quoted_total_pence: number
  quoted_cost_pence: number
  quoted_subtotal_pence: number
  quoted_vat_pence: number
  // Customer purchase-order reference (copied from the quote).
  po_number: string | null
  notes: string | null
  contract_reviewed_at: string | null
  contract_reviewed_by: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Optional joined relations.
  client?: Client | null
  site?: Site | null
  branch?: Branch | null
  owner?: { id: string; full_name: string | null } | null
  quote?: Quote | null
}

export interface JobStatusHistory {
  id: string
  job_id: string
  from_stage: string | null
  to_stage: string | null
  note: string | null
  changed_by: string | null
  changed_at: string
}

// draft -> sent -> part_received -> received; cancelled at any point.
export type PurchaseOrderStatus =
  | 'draft'
  | 'sent'
  | 'part_received'
  | 'received'
  | 'cancelled'

export interface PurchaseOrder {
  id: string
  po_number: string | null
  job_id: string | null
  quote_id: string | null
  supplier_id: string | null
  branch_id: string | null
  status: PurchaseOrderStatus
  // Supplier order email captured when the PO was sent.
  order_email: string | null
  subtotal_pence: number
  notes: string | null
  sent_at: string | null
  received_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Optional joined relations.
  supplier?: Supplier | null
  job?: Job | null
  branch?: Branch | null
  lines?: PurchaseOrderLine[]
  // Convenience aggregate used by list views.
  line_count?: number
}

export interface PurchaseOrderLine {
  id: string
  purchase_order_id: string
  catalogue_item_id: string | null
  quote_line_item_id: string | null
  description: string
  product_code: string | null
  quantity: number
  unit: string
  unit_cost_pence: number
  line_total_pence: number
  quantity_received: number
  position: number
  created_at: string
}

// One line of the client-request compliance matrix: a requirement extracted
// from the client's brief and how our quote responds to it.
export type QuoteRequirementStatus = 'included' | 'partial' | 'excluded' | 'query'

export interface QuoteRequirement {
  id: string
  quote_id: string
  category: string | null
  requirement: string
  our_response: string | null
  status: QuoteRequirementStatus
  position: number
  created_at: string
  updated_at: string
}

// The original client brief a requirements matrix was extracted from (a pasted
// email/spec or an uploaded document), kept for provenance.
export interface QuoteRequirementSource {
  id: string
  quote_id: string
  source_type: 'paste' | 'file'
  file_name: string | null
  file_url: string | null
  mime_type: string | null
  raw_text: string | null
  summary: string | null
  created_by: string | null
  created_at: string
}

// Editable master specification keyed by system type x work type. Pre-fills
// a system's specification when it is added to a quote.
export interface SystemSpecTemplate {
  id: string
  system_type_id: string | null
  work_type: string
  specification: string | null
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  // Optional uploaded sample specification document (e.g. a BAFE SP203 spec).
  // source_text is the parsed plain text used to ground the AI spec builder.
  source_file_url: string | null
  source_file_name: string | null
  source_mime_type: string | null
  source_text: string | null
  system_type?: SystemType | null
}

// A single message in a quote's client<->staff query thread. Clients raise
// queries from the public/portal quote page; staff reply from the dashboard.
export interface QuoteMessage {
  id: string
  quote_id: string
  author_type: 'client' | 'staff'
  author_name: string | null
  body: string
  read_at: string | null
  created_by: string | null
  created_at: string
}

// Admin-managed conditional "IF" field definition shown on a system based on
// its work type (e.g. cable type for install). Answers are stored in
// QuoteSystem.conditional_values keyed by field_key.
export interface WorkTypeField {
  id: string
  work_type: string
  // Fields are now scoped to a specific system type; they only show when that
  // system type AND work type are both selected on a system.
  system_type_id: string
  label: string
  field_key: string
  field_type: 'text' | 'number' | 'select' | 'boolean'
  options: string[]
  position: number
  active: boolean
  created_at: string
  updated_at: string
  // Optional join
  system_type?: SystemType | null
}

// Admin-defined gross margin % for a system type + work type combination.
// Selecting that combination on a system auto-fills the system margin, and
// parts added to the system inherit it.
export interface SystemWorkTypeMargin {
  id: string
  system_type_id: string
  work_type: string
  margin_percent: number
  created_at: string
  updated_at: string
  system_type?: SystemType | null
}

// Per-work-type settings, e.g. whether the design & survey section applies.
export interface WorkTypeSetting {
  work_type: string
  // Each flag controls whether an optional quote section appears for this work type.
  requires_design: boolean
  requires_ppm: boolean
  requires_questions: boolean
  updated_at: string
}

// --- Configurable quote sections (JotForm-style builder) ----------------
// A quote section is an admin-defined, ordered, optionally-collapsible group of
// elements shown on a quote system for a specific system type x work type combo.
export type QuoteElementType =
  | 'text'
  | 'paragraph'
  | 'select'
  | 'yesno'
  | 'number'
  | 'price'
  | 'table'
  // Picks one of the configured asset types (from the Asset Types admin page).
  | 'asset_type'
  // A long-text block pre-fillable from the matching system spec template.
  | 'spec_template'
  // Picks one of the configured design categories (from the Design Categories
  // admin page). Writes to the system's design_category_id and imports its
  // overview, rather than storing in conditional_values.
  | 'design_category'

// Column definition for a 'table' element.
export interface QuoteTableColumn {
  key: string
  label: string
}

export interface QuoteSectionElement {
  id: string
  section_id: string
  label: string
  // Key under which the answer is stored in QuoteSystem.conditional_values.
  element_key: string
  element_type: QuoteElementType
  // For 'select': string[] of options. For 'table': QuoteTableColumn[].
  options: string[] | QuoteTableColumn[]
  required: boolean
  position: number
  active: boolean
  created_at: string
  updated_at: string
}

export interface QuoteSection {
  id: string
  system_type_id: string
  work_type: string
  title: string
  position: number
  default_collapsed: boolean
  // Optional single show/hide rule: show only when the element keyed by
  // condition_element_key equals condition_value. NULL = always show.
  condition_element_key: string | null
  condition_value: string | null
  active: boolean
  created_at: string
  updated_at: string
  // Optional joins
  elements?: QuoteSectionElement[]
  system_type?: SystemType | null
}

// Editable design category with an importable overview, selectable per system.
export interface QuoteDesignCategory {
  id: string
  name: string
  overview: string | null
  active: boolean
  created_at: string
  updated_at: string
}

// Admin-managed library of asset types that can appear on a system, grouped by
// system type. Each carries a default test time (minutes) used by the PPM
// service-contract calculator.
export interface AssetType {
  id: string
  system_type_id: string | null
  name: string
  description: string | null
  default_minutes: number
  active: boolean
  position: number
  created_at: string
  updated_at: string
  system_type?: SystemType | null
}

// A single asset row inside a PPM calculation snapshot.
export interface PpmAssetRow {
  // Optional reference back to the asset_types library row it came from.
  asset_type_id: string | null
  name: string
  minutes: number
  quantity: number
}

// A single visit inside a PPM calculation snapshot. coverage_percent is the
// share of assets tested on this visit (e.g. 100 on visit 1, 25 on visit 2).
export interface PpmVisitRow {
  label: string
  coverage_percent: number
}

// Saved PPM service-contract calculator breakdown, 1:1 with a quote system.
export interface QuoteSystemPpm {
  id: string
  quote_system_id: string
  num_visits: number
  round_trip_miles: number
  mileage_rate_pence: number
  travel_minutes_per_visit: number
  hourly_cost_pence: number
  download_required: boolean
  download_minutes_per_visit: number
  access_minutes_per_visit: number
  remote_monitored: boolean
  remote_minutes_per_visit: number
  out_of_hours: boolean
  ooh_uplift_percent: number
  margin_percent: number
  computed_cost_pence: number
  computed_price_pence: number
  assets: PpmAssetRow[]
  visits: PpmVisitRow[]
  notes: string | null
  created_at: string
  updated_at: string
}

// ---------- Contract Review (accepted quote -> live records) ----------

export type ContractReviewStatus = 'draft' | 'committed' | 'cancelled'

// The kind of live entity a draft item will create or link. Also drives the
// dependency order used on commit: client -> site -> system -> service -> charge.
export type ContractReviewEntity = 'client' | 'site' | 'system' | 'service' | 'charge'

// How the reviewer chose to resolve a draft item on commit.
export type ContractReviewAction = 'create' | 'link' | 'skip'

// A holding-area draft bundle created when a Routine Maintenance quote is
// accepted. One per quote (unique). The reviewer confirms/amends each item and
// then commits, turning drafts into live clients/sites/systems/services/charges.
export interface ContractReview {
  id: string
  quote_id: string
  status: ContractReviewStatus
  notes: string | null
  created_by: string | null
  committed_by: string | null
  committed_at: string | null
  // Set when the approved (committed) contract copy has been emailed to the client.
  contract_sent_at: string | null
  created_at: string
  updated_at: string
  // Optional joins
  quote?: Quote | null
  items?: ContractReviewItem[]
}

// One draft entity within a review. `payload` holds the editable field values
// for the entity (names, prices, subcontractor, frequency, etc.). Parent/child
// wiring uses local_key/parent_key before real ids exist.
export interface ContractReviewItem {
  id: string
  review_id: string
  entity_type: ContractReviewEntity
  action: ContractReviewAction
  linked_id: string | null
  suggested_id: string | null
  match_confidence: number | null
  local_key: string
  parent_key: string | null
  payload: Record<string, unknown>
  source_quote_system_id: string | null
  committed_id: string | null
  position: number
  created_at: string
  updated_at: string
}

// A single row of the quote_bank_values view (historical system values for
// benchmarking, filtered to sent/accepted quotes).
export interface QuoteBankValue {
  system_id: string
  quote_id: string
  reference: string | null
  quote_number: string | null
  status: QuoteStatus
  quote_title: string
  system_name: string
  system_code: string | null
  work_type: string
  subtotal_pence: number
  created_at: string
  client_id: string | null
  client_name: string | null
  site_id: string | null
  site_name: string | null
  created_by: string | null
  quoted_by_name: string | null
  department_id: string | null
  department_name: string | null
}

// Direct labour cost per role (hourly), used to underpin estimates.
// Money stored as integer pence.
export interface DirectCost {
  id: string
  role: string
  hourly_cost_pence: number
  notes: string | null
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

// Uploaded products spreadsheet (stored privately in Vercel Blob). Importing
// a sheet seeds/updates the quote catalogue used to build estimates & specs.
export interface ProductSheet {
  id: string
  filename: string
  blob_pathname: string
  size_bytes: number | null
  uploaded_by: string | null
  uploaded_at: string
  row_count: number | null
  imported_at: string | null
  imported_count: number | null
  is_current: boolean
}

// =====================================================================
// Stock / Inventory
// A "stock profile" is a part held at a location (stock_items row). Money
// (unit_cost) is stored as pounds (numeric) on the part, not pence.
// =====================================================================

export type StockLocationKind = 'warehouse' | 'van' | 'other'

export interface StockLocation {
  id: string
  name: string
  kind: StockLocationKind
  // When set, this is an engineer's personal (van) location.
  engineer_id: string | null
  branch_id: string | null
  is_active: boolean
  created_at: string
  engineer?: Profile | null
  branch?: Branch | null
}

export interface Part {
  id: string
  sku: string | null
  name: string
  description: string | null
  // Manufacturer / brand of the part (e.g. Apollo, Hochiki). Optional free text.
  manufacturer: string | null
  unit: string
  unit_cost: number
  default_min_level: number
  is_active: boolean
  // Product supplier this part is ordered from (see Supplier of type 'product').
  supplier_id: string | null
  /** Nominal code override for this product/part (wins over dept/service). */
  nominal_code_id: string | null
  created_at: string
  supplier?: Supplier | null
}

// An internal-only suggested part an engineer attaches to a task when a defect
// is found. Linked to the task (1:1 with the task's defect) so it surfaces in
// the open defects summary. Never shown to clients.
export interface DefectSuggestedPart {
  id: string
  task_id: string
  part_id: string
  quantity: number
  suggested_by: string | null
  created_at: string
  updated_at: string
  part?: Part | null
}

// Lightweight shape used by the suggested-parts picker (part joined in).
export interface SuggestedPartLine {
  part_id: string
  quantity: number
  name: string
  sku: string | null
  unit: string
}

// A catalogue part actually used/fitted on a call (task). Distinct from the
// defect "suggested parts" flow: always available (no defect required) and
// editable by the assigned engineer (while in progress) or office/admin (any
// time). Money is stored in integer pence. The charge-related columns are
// groundwork for a future charging pass and have no UI yet. Never shown to
// clients.
export interface CallPart {
  id: string
  task_id: string
  part_id: string
  quantity: number
  // Our cost snapshot (pence) captured when the part was added.
  unit_cost_pence: number | null
  // Charge groundwork (no UI yet).
  chargeable: boolean
  sale_unit_price_pence: number | null
  charge_status: 'pending' | 'quoted' | 'invoiced' | 'non_chargeable'
  notes: string | null
  added_by: string | null
  // Stock reconciliation: which vehicle/location the part was pulled from and how
  // much was actually deducted (may be less than `quantity` if the vehicle was
  // short, or 0 if the engineer had no linked vehicle). Kept in sync so edits and
  // removals return the right amount to stock.
  stock_location_id: string | null
  stock_deducted_qty: number
  created_at: string
  updated_at: string
  part?: Part | null
}

// Lightweight shape used by the call-parts picker (part joined in). Includes
// the cost snapshot so the picker can show line/total cost (info only).
export interface CallPartLine {
  part_id: string
  quantity: number
  name: string
  sku: string | null
  unit: string
  unit_cost_pence: number | null
  // How much of `quantity` was actually pulled from vehicle stock. Absent on
  // search results; present on saved lines so the picker can show whether the
  // line was deducted from the vehicle or just logged.
  stock_deducted_qty?: number
}

// A part held at a location, with its own minimum re-order level and the
// target (ideal) quantity that defines the location's stock profile.
export interface StockItem {
  id: string
  location_id: string
  part_id: string
  quantity: number
  min_level: number
  target_level: number
  updated_at: string
  part?: Part
  location?: StockLocation
}

export type StockMovementType = 'transfer' | 'usage' | 'receipt' | 'adjustment'

export interface StockMovement {
  id: string
  part_id: string
  from_location_id: string | null
  to_location_id: string | null
  quantity: number
  movement_type: StockMovementType
  // When stock is used on a job, the task it was used on plus a reference.
  task_id: string | null
  job_reference: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  part?: Part | null
  from_location?: StockLocation | null
  to_location?: StockLocation | null
  created_by_profile?: Profile | null
  task?: Task | null
}

// A location enriched with the rolled-up figures shown on the overview.
export interface StockLocationSummary extends StockLocation {
  itemCount: number
  totalQuantity: number
  heldValue: number
  lowStockCount: number
}

// A request from one engineer to borrow/transfer a part from another's location.
export type PartRequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled'

export interface PartRequest {
  id: string
  part_id: string
  location_id: string
  requested_by: string
  quantity: number
  message: string | null
  status: PartRequestStatus
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  // Joined relations
  part?: Part | null
  location?: StockLocation | null
  requester?: Profile | null
  resolver?: Profile | null
}

// A low-stock alert row (a stock_item at or below its min level).
export interface LowStockAlert {
  stock_item_id: string
  location_id: string
  location_name: string
  part_id: string
  part_name: string
  sku: string | null
  unit: string
  quantity: number
  min_level: number
}

// =====================================================================
// Calendar
// A master calendar merges two sources: booked service tasks (with an
// optional booked time slot) and general entries (annual leave, sickness,
// training, etc.) whose types are configured by an admin.
// =====================================================================

// Admin-configurable entry type, e.g. "Annual Leave" rendered in a colour.
export interface CalendarEntryType {
  id: string
  name: string
  color: string
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface CalendarEntry {
  id: string
  entry_type_id: string
  // null = a company-wide entry (e.g. bank holiday)
  user_id: string | null
  title: string | null
  start_at: string
  end_at: string
  all_day: boolean
  // Partial-day leave. Portions describe how much of the first/last working day
  // the leave covers: 'full' = whole day, 'am'/'pm' = half day, 'hours' = a
  // custom number of hours (see start_hours/end_hours). Middle days of a range
  // are always full. Defaults to 'full' so ordinary entries behave as before.
  start_portion: LeavePortion
  end_portion: LeavePortion
  // Hours booked on the first/last day when the matching portion is 'hours'.
  start_hours: number | null
  end_hours: number | null
  // Visible to all staff (incl. engineers) when true.
  is_public: boolean
  notes: string | null
  created_by: string | null
  // Non-null for imported entries (e.g. 'uk-bank-holiday'); `source_uid` keys
  // the upsert so imports stay idempotent.
  source: string | null
  source_uid: string | null
  // Leave approval workflow. Only used by leave-type entries (e.g. Annual Leave);
  // null means "not applicable" (ordinary entries). 'requested' entries are
  // pending a manager's decision; balances only count 'approved' entries.
  approval_status: LeaveApprovalStatus | null
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
  entry_type?: CalendarEntryType
  user?: Profile | null
  // Populated in oversight/approval views.
  approver?: Profile | null
}

export type LeaveApprovalStatus = 'requested' | 'approved' | 'rejected'

// How much of a working day a leave entry covers on its first/last day.
// 'full' = whole day, 'am'/'pm' = morning/afternoon half, 'hours' = a custom
// number of hours (part-time staff who work, e.g., 4-hour days).
export type LeavePortion = 'full' | 'am' | 'pm' | 'hours'

// A saved set of calendar filters a user can quickly re-apply. One template per
// user may be flagged as their default (auto-applied on load).
export interface CalendarFilterTemplate {
  id: string
  user_id: string
  name: string
  filters: CalendarFilterState
  is_default: boolean
  created_at: string
  updated_at: string
}

// The serialisable shape of the calendar's filter controls. The toolbar now
// uses multi-select checklists, so each filter is an array of selected values
// (an empty/absent array means "no filter"). Values: kinds ('task'|'route'|
// 'entry'), person ids (or the special 'company' for unassigned/company-wide
// items), entry type names, and department ids. `view` restores the layout.
//
// The legacy single-value fields (kindFilter/personFilter/typeFilter) are kept
// optional so templates saved before the multi-select change still load — they
// are converted to single-element arrays on read.
export interface CalendarFilterState {
  kinds?: string[]
  personIds?: string[]
  types?: string[]
  departmentIds?: string[]
  view?: 'day' | 'week' | 'month' | 'list'
  // Legacy (pre multi-select) fields — read-only for back-compat.
  kindFilter?: string
  personFilter?: string
  typeFilter?: string
}

// A normalised item the calendar can render, derived from a booked task, a
// general entry, or a recurring route. `start`/`end` are ISO datetime strings.
export type CalendarItemKind = 'task' | 'entry' | 'route' | 'oncall'

export interface CalendarItem {
  id: string
  kind: CalendarItemKind
  title: string
  start: string
  end: string
  allDay: boolean
  color: string
  // The person this item belongs to (engineer for tasks/routes, user for entries).
  ownerId: string | null
  ownerName: string | null
  // Extra context for the detail popover / list row.
  subtitle: string | null
  // Original source ids so the UI can link through.
  taskId?: string
  entryId?: string
  routeId?: string
  entryTypeName?: string
  isPublic?: boolean
  // Leave approval state for leave-type entries; drives calendar styling
  // (e.g. pending requests render muted/hatched).
  approvalStatus?: LeaveApprovalStatus | null
  // For on-call shift items: the branch whose rota this shift belongs to, and
  // the pay-rate band, so the calendar can label them per branch.
  oncallBranchName?: string
  oncallBand?: 'weekday_evening' | 'weekend' | 'bank_holiday'
  }

// A route that recurs weekly on the calendar. The weekday is derived from the
// route's name (e.g. "Friday 01" recurs every Friday). `weekday` follows the
// JS convention (0 = Sunday … 6 = Saturday); null means no weekday could be
// parsed from the name, so the route is not shown as a recurrence.
export interface RouteCalendarSource {
  id: string
  name: string
  color: string
  weekday: number | null
  engineerId: string | null
  engineerName: string | null
}

// =====================================================================
// Employee Vault
// An admin-configured launcher of titled sections containing buttons that
// link out to pages, Jotform forms, Dropbox folders, etc. Visibility of each
// section and button is gated by role.
// =====================================================================

export interface VaultButton {
  id: string
  section_id: string
  label: string
  url: string
  description: string | null
  // A lucide icon name (see VAULT_ICONS); null falls back to a default.
  icon: string | null
  open_in_new_tab: boolean
  sort_order: number
  visible_roles: UserRole[]
  created_at: string
}

export interface VaultSection {
  id: string
  title: string
  description: string | null
  sort_order: number
  visible_roles: UserRole[]
  created_at: string
  buttons?: VaultButton[]
}

// ============ Company Asset Management ============

export type AssetStatus = 'active' | 'disposed'
export type AssetCheckType = 'check' | 'inspection' | 'calibration' | 'test'
export type AssetCheckResponsible = 'holder' | 'asset_manager'
export type AssetCheckResult = 'pass' | 'fail' | 'advisory' | 'na'

export interface AssetCategory {
  id: string
  name: string
  is_test_equipment: boolean
  sort_order: number
  created_at: string
}

export interface Asset {
  id: string
  urn: string
  sage_reference: string | null
  name: string
  category_id: string | null
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  description: string | null
  value: number | null
  purchase_date: string | null
  status: AssetStatus
  assigned_to: string | null
  storage_location: string | null
  is_test_equipment: boolean
  disposed_at: string | null
  disposal_reason: string | null
  disposal_value: number | null
  created_at: string
  updated_at: string
  // Embedded relations
  category?: AssetCategory | null
  holder?: Pick<Profile, 'id' | 'full_name' | 'email'> | null
  schedules?: AssetCheckSchedule[]
  checks?: AssetCheck[]
  assignments?: AssetAssignment[]
}

export interface AssetCheckSchedule {
  id: string
  asset_id: string
  name: string
  check_type: AssetCheckType
  interval_months: number
  responsible: AssetCheckResponsible
  requires_certificate: boolean
  last_completed_date: string | null
  next_due_date: string | null
  active: boolean
  created_at: string
  updated_at: string
  asset?: Asset | null
}

export interface AssetCheck {
  id: string
  asset_id: string
  schedule_id: string | null
  check_date: string
  performed_by: string | null
  result: AssetCheckResult
  is_transfer_inspection: boolean
  notes: string | null
  certificate_url: string | null
  calibration_due_date: string | null
  created_at: string
  schedule?: AssetCheckSchedule | null
  performer?: Pick<Profile, 'id' | 'full_name'> | null
}

export interface AssetAssignment {
  id: string
  asset_id: string
  assigned_to: string | null
  storage_location: string | null
  assigned_by: string | null
  assigned_at: string
  returned_at: string | null
  transfer_check_id: string | null
  notes: string | null
  holder?: Pick<Profile, 'id' | 'full_name'> | null
  assigner?: Pick<Profile, 'id' | 'full_name'> | null
}

// ── Inbound request inbox ──────────────────���─────────────────────────────────
// A request that arrived by email (forwarded to the system address) or was added
// manually by a staff member. AI triages it, matching it to an existing
// client/site/service and proposing actions that a human approves.
export type InboundRequestSource = 'email' | 'manual'
export type InboundRequestStatus = 'new' | 'triaged' | 'actioned' | 'dismissed'
export type InboundRequestIntent =
  | 'new_call'
  | 'chase_up'
  | 'complaint'
  | 'quote_request'
  | 'send_report'
  | 'general'
  | 'unknown'
export type InboundRequestUrgency = 'emergency' | 'high' | 'normal' | 'low'

export type SuggestedActionKind =
  | 'create_call'
  | 'chase_up'
  | 'reply'
  | 'send_report'
  | 'create_quote'
  | 'dismiss'

// Fully-parameterised payload produced by triage so the action can be executed
// deterministically (no second AI pass). All fields optional — only those
// relevant to the action's `kind` are populated.
export interface SuggestedActionPayload {
  // Shared match context.
  siteId?: string | null
  clientId?: string | null
  serviceTypeId?: string | null
  systemTypeId?: string | null
  // create_call.
  urgency?: InboundRequestUrgency
  suggestedDate?: string | null // yyyy-MM-dd
  notes?: string | null
  respondByHours?: number | null
  // chase_up.
  note?: string | null
  // create_quote.
  quoteType?: string | null
  title?: string | null
  summary?: string | null
}

// One AI-proposed action. `kind` drives which control the inbox renders. The
// first entry is the primary, fully-parameterised recommendation; the human
// always confirms before anything is created (calls in particular).
export interface SuggestedAction {
  kind: SuggestedActionKind
  label: string
  payload?: SuggestedActionPayload
}

// A stored attachment (in private Blob) carried on the request.
export interface InboundAttachment {
  name: string
  pathname: string
  mimeType: string | null
}

export interface InboundRequest {
  id: string
  source: InboundRequestSource
  received_at: string
  from_email: string | null
  from_name: string | null
  to_email: string | null
  subject: string | null
  body_text: string | null
  body_html: string | null
  attachments: InboundAttachment[]
  forwarded_by: string | null
  status: InboundRequestStatus
  // Triage output (populated once triaged).
  ai_summary: string | null
  ai_proposed_action: string | null
  ai_intent: InboundRequestIntent | null
  ai_urgency: InboundRequestUrgency | null
  ai_reply_draft: string | null
  ai_confidence: number | null
  matched_client_id: string | null
  matched_site_id: string | null
  matched_service_type_id: string | null
  matched_system_type_id: string | null
  suggested_actions: SuggestedAction[]
  ai_raw: unknown | null
  triaged_at: string | null
  triage_error: string | null
  // Hard-links to the entity a request was raised from (nullable).
  related_quote_id: string | null
  related_job_id: string | null
  related_site_id: string | null
  related_task_id: string | null
  related_defect_id: string | null
  // Outcome.
  created_task_id: string | null
  actioned_at: string | null
  actioned_by: string | null
  created_at: string
  updated_at: string
  // Embeds (optional, populated by list queries).
  matched_client?: Pick<Client, 'id' | 'name'> | null
  matched_site?: Pick<Site, 'id' | 'name' | 'postcode'> | null
  matched_service_type?: Pick<ServiceType, 'id' | 'name'> | null
  matched_system_type?: Pick<SystemType, 'id' | 'name'> | null
  forwarded_by_profile?: Pick<Profile, 'id' | 'full_name' | 'email'> | null
}
