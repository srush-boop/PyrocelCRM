// Database types for PyrocelCRM

// The user's permission level / user type. Shown in the UI as "User Type".
// Governs access and RLS. Do not confuse with `Role` below.
export type UserRole = 'admin' | 'engineer' | 'office' | 'client'

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

// Who performs a service. Independent of how the work is routed/assigned.
export type WorkerType = 'cdo' | 'engineer' | 'subcontractor'

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
  created_at: string
  updated_at: string
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
  // Per-user timesheet requirement override. NULL = inherit from the assigned
  // role; an explicit true/false overrides the role default. Resolve with
  // `isTimesheetRequired()`.
  timesheet_required: boolean | null
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

export interface ChecklistItem {
  id: string
  label: string
  type: 'pass_fail' | 'text' | 'number' | 'checkbox'
  required: boolean
}

export interface ChecklistTemplate {
  id: string
  service_type_id: string
  // When set, this template applies only to the matching visit type. When null,
  // it is the service-wide fallback used by visits with no specific template.
  visit_type_id?: string | null
  name: string
  items: ChecklistItem[]
  created_at: string
  updated_at: string
  service_type?: ServiceType
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
  site_id_cash: string | null
  // Unique Property Reference Number (UK national property identifier).
  uprn: string | null
  // Admin-configurable property/building type (see PropertyType).
  property_type_id: string | null
  // Default sub-contractor for sub-contracted services at this site.
  default_subcontractor_id: string | null
  status: 'live' | 'dead'
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
  // Cached geocode of the postcode (via postcodes.io), used for "nearby calls".
  latitude: number | null
  longitude: number | null
  geocoded_at: string | null
  created_at: string
  updated_at: string
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
    active: boolean
    position: number
    /** Default sub-contractor for sub-contracted services under this system. */
    default_subcontractor_id: string | null
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
  assigned_engineer_id: string | null
  reporting_emails: string[]
  defects_to_email: string | null
  // When true (default) the next recurring task anchors to the original
  // scheduled date (fixed cadence); when false it anchors to completion date.
  anchor_next_to_schedule: boolean
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
  created_at: string
  site?: Site
  site_system?: SiteSystem | null
  service_type?: ServiceType
  route?: Route
  area?: Area | null
  subcontractor?: Subcontractor | null
  assigned_engineer?: Profile
}

// Document store: folders + files attached to a client, site, a site's service,
// or a site's shared engineer folder (engineer-contributable downloads/drawings).
export type DocumentOwnerType = 'client' | 'site' | 'site_service' | 'site_engineer'

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

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

export interface Task {
  id: string
  site_service_id: string
  // Client this call is billed to. Defaults to the site's client at scheduling
  // time but can be overridden.
  client_id: string | null
  assigned_engineer_id: string | null
  scheduled_date: string
  // Optional booked appointment slot on the scheduled date (24h "HH:MM[:SS]").
  booked_start_time: string | null
  booked_end_time: string | null
  status: TaskStatus
  started_at: string | null
  completed_at: string | null
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
  site_service?: SiteService
  assigned_engineer?: Profile | null
  visit_type?: ServiceVisitType | null
  client?: Client | null
  }

  export interface ChecklistResult {
  item_id: string
  label: string
  type: 'pass_fail' | 'text' | 'number' | 'checkbox'
  value: boolean | string | number
  passed: boolean | null
  notes?: string
  // When a system has configured panels, the general checklist is repeated once
  // per panel. These tag each result with the panel it belongs to. Absent on
  // legacy/non-panel results, which keeps older reports rendering unchanged.
  panel_id?: string | null
  panel_name?: string | null
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
  client_signature: string | null
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
  service_type_id: string | null
  system_type_id: string | null
  default_unit: string | null
  // Unit cost and gross margin %. The sell price (default_unit_price_pence) is
  // derived as cost / (1 - margin%). Cost is the primary input going forward.
  unit_cost_pence: number
  margin_percent: number
  default_unit_price_pence: number
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  service_type?: ServiceType | null
  system_type?: SystemType | null
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
  prospect_name: string | null
  prospect_contact: string | null
  prospect_email: string | null
  prospect_phone: string | null
  prospect_address: string | null
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
  // When true (default), the quote document/PDF shows each system's design
  // overview + design/survey details. Hidden when false.
  show_design_overview: boolean
  valid_until: string | null
  sent_at: string | null
  decided_at: string | null
  decision_note: string | null
  // Public client-approval link + signature/PO capture.
  share_token: string | null
  require_signature: boolean
  po_number: string | null
  signature_name: string | null
  signature_image_url: string | null
  signed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  client?: Client | null
  site?: Site | null
  // The staff member who prepared the quote (joined from profiles via created_by).
  preparer?: { id: string; full_name: string | null } | null
}

export interface QuoteWithDetails extends Quote {
  systems: QuoteSystem[]
  line_items: QuoteLineItem[]
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
  system_type?: SystemType | null
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
  unit: string
  unit_cost: number
  default_min_level: number
  is_active: boolean
  // Product supplier this part is ordered from (see Supplier of type 'product').
  supplier_id: string | null
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

// The serialisable shape of the calendar's filter controls. Values mirror the
// calendar toolbar: 'all' for no filter, a kind ('task'|'route'|'entry'), an
// owner id (or 'company'), and an entry type name. `view` restores the layout.
export interface CalendarFilterState {
  kindFilter?: string
  personFilter?: string
  typeFilter?: string
  view?: 'day' | 'week' | 'month' | 'list'
}

// A normalised item the calendar can render, derived from a booked task, a
// general entry, or a recurring route. `start`/`end` are ISO datetime strings.
export type CalendarItemKind = 'task' | 'entry' | 'route'

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
