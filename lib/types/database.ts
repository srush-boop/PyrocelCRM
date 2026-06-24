// Database types for PyrocelCRM

export type UserRole = 'admin' | 'engineer' | 'office' | 'client'

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

export interface Subcontractor {
  id: string
  name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  notes: string | null
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export interface Client {
  id: string
  name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  status: 'active' | 'inactive'
  client_id: string | null
  invited_at: string | null
  accepted_at: string | null
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
  name: string
  items: ChecklistItem[]
  created_at: string
  updated_at: string
  service_type?: ServiceType
}

export interface Route {
  id: string
  name: string
  description: string | null
  assigned_engineer_id: string | null
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
  site_id_cash: string | null
  // Unique Property Reference Number (UK national property identifier).
  uprn: string | null
  status: 'live' | 'dead'
  notes: string | null
  reporting_emails: string[]
  has_remote_monitoring: boolean
  remote_monitoring_type: RemoteMonitoringType | null
  monitoring_station_name: string | null
  monitoring_station_phone: string | null
  monitoring_station_url: string | null
  route_position: number | null
  created_at: string
  updated_at: string
  route?: Route
  client?: Client
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
    active: boolean
    position: number
    created_at: string
    updated_at: string
    site?: Site
    system_type?: SystemType | null
    site_services?: SiteService[]
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
  created_at: string
  site?: Site
  site_system?: SiteSystem | null
  service_type?: ServiceType
  route?: Route
  area?: Area | null
  subcontractor?: Subcontractor | null
  assigned_engineer?: Profile
}

// Document store: folders + files attached to a client, site, or a site's service.
export type DocumentOwnerType = 'client' | 'site' | 'site_service'

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

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

export interface Task {
  id: string
  site_service_id: string
  assigned_engineer_id: string | null
  scheduled_date: string
  status: TaskStatus
  started_at: string | null
  completed_at: string | null
  notes: string | null
  public_token: string
  created_at: string
  updated_at: string
  site_service?: SiteService
  assigned_engineer?: Profile | null
  }

export interface ChecklistResult {
  item_id: string
  label: string
  type: 'pass_fail' | 'text' | 'number' | 'checkbox'
  value: boolean | string | number
  passed: boolean | null
  notes?: string
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
  valid_until: string | null
  sent_at: string | null
  decided_at: string | null
  decision_note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  client?: Client | null
  site?: Site | null
}

export interface QuoteWithDetails extends Quote {
  systems: QuoteSystem[]
  line_items: QuoteLineItem[]
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
  label: string
  field_key: string
  field_type: 'text' | 'number' | 'select' | 'boolean'
  options: string[]
  position: number
  active: boolean
  created_at: string
  updated_at: string
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
