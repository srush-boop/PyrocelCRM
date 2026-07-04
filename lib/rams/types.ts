// RAMS module types. Self-contained; mirrors the `rams_*` tables in the CRM
// Supabase database. Master tables (clients, sites, profiles) are referenced
// via the shared `@/lib/types/database` interfaces where needed.

export type RamsStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'archived'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export type EngineerConfirmationStatus = 'pending' | 'confirmed'

// A selected hazard row within a RAMS document (stored in `selected_hazards`).
export interface SelectedHazard {
  id: string
  category: string
  description: string
  potential_consequences: string | null
  likelihood: number
  severity: number
  // Residual (post-control) scores.
  residual_likelihood: number
  residual_severity: number
  controls: string[]
}

// A single method statement step (stored in `method_steps`).
export interface MethodStep {
  step: number
  description: string
}

// A named person on the job (stored in `key_personnel`).
export interface KeyPerson {
  name: string
  role: string
  phone: string | null
}

// Nearest hospital / emergency info (stored in `emergency_hospital_info`).
export interface EmergencyHospitalInfo {
  name: string | null
  address: string | null
  phone: string | null
  distance: string | null
}

// A CRM site option offered when linking a RAMS document to an existing site.
export interface SiteOption {
  id: string
  name: string
  address: string | null
  client_id: string | null
  contact_email: string | null
}

export interface RamsMasterTemplate {
  id: string
  code: string
  name: string
  description: string | null
  category: string
  default_hazards: unknown[]
  default_ppe: string[]
  default_equipment: string[]
  default_method_steps: string | null
  template_type: string // 'activity' | 'system'
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface RamsHazard {
  id: string
  category: string
  description: string
  potential_consequences: string | null
  default_likelihood: number | null
  default_severity: number | null
  standard_controls: string[] | null
  is_active: boolean
  created_at: string
}

export interface RamsSystemHazard {
  id: string
  system_type_id: string
  hazard_name: string
  hazard_description: string | null
  potential_consequences: string | null
  category: string
  default_likelihood: number
  default_severity: number
  standard_controls: string[]
  is_active: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export interface RamsCompanySettings {
  id: string
  company_name: string | null
  company_number: string | null
  company_address: string | null
  company_phone: string | null
  company_email: string | null
  company_website: string | null
  rams_prefix: string | null
  default_review_period: number | null
  manager_email: string | null
  health_safety_email: string | null
  created_at: string
  updated_at: string
}

export interface RamsProject {
  id: string
  client_id: string | null
  name: string
  site_address: string | null
  project_number: string | null
  status: string | null
  site_id: string | null
  proposed_completion_date: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface RamsDocument {
  id: string
  rams_number: string
  template_id: string | null
  project_id: string | null
  client_id: string | null
  system_type_id: string | null
  title: string
  revision: number
  status: RamsStatus
  work_description: string | null
  work_location: string | null
  job_number: string | null
  planned_start_date: string | null
  planned_end_date: string | null
  no_end_date: boolean | null
  selected_hazards: SelectedHazard[]
  ppe_requirements: string[]
  equipment_list: string[]
  emergency_procedures: string | null
  emergency_hospital_info: EmergencyHospitalInfo | null
  method_steps: MethodStep[]
  key_personnel: KeyPerson[]
  site_specific_considerations: string | null
  prepared_by: string | null
  prepared_date: string | null
  reviewed_by: string | null
  reviewed_date: string | null
  approved_by: string | null
  approved_date: string | null
  approved_at: string | null
  client_email: string | null
  manager_email: string | null
  engineer_email: string | null
  parent_rams_id: string | null
  is_current_revision: boolean | null
  revision_notes: string | null
  site_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Joined relations (optional, populated by queries).
  template?: RamsMasterTemplate | null
  project?: RamsProject | null
  client?: { id: string; name: string } | null
  prepared_by_profile?: { id: string; full_name: string | null } | null
  approved_by_profile?: { id: string; full_name: string | null } | null
}

// A lightweight summary of one document in a revision lineage, used to render
// the revision history timeline on the detail view.
export interface RamsRevisionSummary {
  id: string
  revision: number
  status: RamsStatus
  created_at: string
  is_current_revision: boolean | null
  revision_notes: string | null
}

export interface RamsApproval {
  id: string
  rams_id: string
  approval_type: string
  recipient_email: string
  recipient_name: string | null
  token: string
  status: ApprovalStatus
  sent_at: string | null
  responded_at: string | null
  ip_address: string | null
  comments: string | null
  created_at: string
}

export interface RamsSignature {
  id: string
  rams_id: string | null
  user_id: string | null
  signature_type: string
  signature_data: string | null
  signed_at: string | null
  ip_address: string | null
}

export interface RamsEngineerConfirmation {
  id: string
  rams_id: string
  engineer_id: string
  status: EngineerConfirmationStatus
  confirmed_at: string | null
  signature_data: string | null
  notes: string | null
  created_at: string
  updated_at: string
  engineer?: { id: string; full_name: string | null; email: string } | null
}
