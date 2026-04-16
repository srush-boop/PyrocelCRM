// Database types for PyrocelCRM

export type UserRole = 'admin' | 'engineer' | 'office'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

export interface ServiceType {
  id: string
  name: string
  description: string | null
  default_frequency_months: number
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
  assigned_engineer?: Profile
}

export interface Site {
  id: string
  name: string
  address: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  route_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
  route?: Route
}

export interface SiteService {
  id: string
  site_id: string
  service_type_id: string
  frequency_months: number
  last_service_date: string | null
  next_service_date: string | null
  created_at: string
  site?: Site
  service_type?: ServiceType
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
  assigned_engineer?: Profile
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
  email_sent_at: string | null
  created_at: string
  updated_at: string
  task?: Task
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
