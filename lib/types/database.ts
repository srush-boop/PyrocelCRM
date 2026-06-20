// Database types for PyrocelCRM

export type UserRole = 'admin' | 'engineer' | 'office'

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
  invited_at: string | null
  accepted_at: string | null
  created_at: string
  updated_at: string
}

export interface ServiceType {
  id: string
  name: string
  description: string | null
  default_frequency_months?: number // Legacy field
  default_frequency_value: number
  default_frequency_unit: 'weeks' | 'months'
  default_deadline_tolerance_days: number
  color?: string | null
  icon?: string | null
  created_at: string
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
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  route_id: string | null
  client_id: string | null
  site_id_cash: string | null
  status: 'live' | 'dead'
  notes: string | null
  reporting_emails: string[]
  has_remote_monitoring: boolean
  remote_monitoring_type: RemoteMonitoringType | null
  route_position: number | null
  created_at: string
  updated_at: string
  route?: Route
  client?: Client
}

export interface SiteService {
  id: string
  site_id: string
  service_type_id: string
  frequency_months?: number // Legacy field
  frequency_value: number
  frequency_unit: 'weeks' | 'months'
  last_service_date: string | null
  next_service_date: string | null
  deadline_tolerance_days: number
  route_id: string | null
  assigned_engineer_id: string | null
  reporting_emails: string[]
  created_at: string
  site?: Site
  service_type?: ServiceType
  route?: Route
  assigned_engineer?: Profile
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

export type TaskResultStatus = 'pending' | 'pass' | 'fail' | 'partial'

export interface TaskResult {
  id: string
  task_id: string
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

// Extended types for dashboard views
export interface TaskWithDetails extends Task {
  site_service: SiteService & {
    site: Site
    service_type: ServiceType
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
  comments: string | null
  photos: string[]
  created_at: string
  mcp?: Mcp
  inspector?: Profile | null
}
