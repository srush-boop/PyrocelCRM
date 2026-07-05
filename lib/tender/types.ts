// Shared Tender AI types and display metadata. Safe to import from client and
// server code (no server-only dependencies here).

export type TenderKnowledgeType =
  | 'company_info'
  | 'accreditation'
  | 'policy'
  | 'case_study'
  | 'capability'
  | 'personnel'
  | 'commercial'
  | 'faq'

export type TenderImportance = 'critical' | 'high' | 'normal'
export type TenderStatus = 'draft' | 'in_progress' | 'submitted' | 'won' | 'lost'
export type TenderQuestionStatus = 'unanswered' | 'draft' | 'final'

export interface TenderKnowledgeItem {
  id: string
  knowledge_type: TenderKnowledgeType
  title: string
  content: string
  importance: TenderImportance
  tags: string[]
  metadata: Record<string, unknown>
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface TenderEvidence {
  id: string
  title: string
  description: string | null
  file_url: string | null
  file_name: string | null
  file_type: string | null
  tags: string[]
  expiry_date: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface TenderPrompt {
  id: string
  name: string
  description: string | null
  prompt_text: string
  category: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface TenderSettings {
  id: string
  company_tone: string
  default_instructions: string | null
  answer_model: string
  updated_by: string | null
  updated_at: string
}

export interface Tender {
  id: string
  title: string
  client_name: string | null
  reference: string | null
  status: TenderStatus
  due_date: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// A single source the AI drew on, surfaced to the user under an answer.
export interface TenderAnswerSource {
  sourceType: string
  sourceId: string
  title: string
  similarity: number
}

export interface TenderQuestion {
  id: string
  tender_id: string
  question: string
  answer: string | null
  status: TenderQuestionStatus
  sources: TenderAnswerSource[]
  sort_order: number
  is_winning_response: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

// Display labels + descriptions for each knowledge type, used across the UI.
export const KNOWLEDGE_TYPE_META: Record<
  TenderKnowledgeType,
  { label: string; description: string }
> = {
  company_info: {
    label: 'Company Information',
    description: 'Overview, history, mission, structure and turnover.',
  },
  accreditation: {
    label: 'Accreditations & Certifications',
    description: 'ISO, SafeContractor, CHAS, memberships and standards held.',
  },
  policy: {
    label: 'Policies',
    description: 'Health & safety, environmental, quality, GDPR and HR policies.',
  },
  case_study: {
    label: 'Case Studies',
    description: 'Past projects, outcomes and client references.',
  },
  capability: {
    label: 'Capabilities & Services',
    description: 'Services offered, coverage, equipment and technical expertise.',
  },
  personnel: {
    label: 'Personnel & Qualifications',
    description: 'Team structure, key staff, training and competencies.',
  },
  commercial: {
    label: 'Commercial',
    description: 'Pricing approach, insurance, financial standing and terms.',
  },
  faq: {
    label: 'FAQs & Standard Answers',
    description: 'Reusable answers to commonly asked tender questions.',
  },
}

export const IMPORTANCE_META: Record<
  TenderImportance,
  { label: string; hint: string }
> = {
  critical: { label: 'Critical', hint: 'Always included in every AI answer.' },
  high: { label: 'High', hint: 'Strongly prioritised during retrieval.' },
  normal: { label: 'Normal', hint: 'Retrieved when relevant to the question.' },
}

export const TENDER_STATUS_META: Record<TenderStatus, { label: string }> = {
  draft: { label: 'Draft' },
  in_progress: { label: 'In Progress' },
  submitted: { label: 'Submitted' },
  won: { label: 'Won' },
  lost: { label: 'Lost' },
}

export const KNOWLEDGE_TYPES = Object.keys(
  KNOWLEDGE_TYPE_META,
) as TenderKnowledgeType[]

// Convenience exports derived from the META maps above, so UI code can pull a
// simple label lookup or ordered list without recomputing.
export const KNOWLEDGE_TYPE_ORDER = KNOWLEDGE_TYPES

export const KNOWLEDGE_TYPE_LABELS = Object.fromEntries(
  KNOWLEDGE_TYPES.map((t) => [t, KNOWLEDGE_TYPE_META[t].label]),
) as Record<TenderKnowledgeType, string>

export const IMPORTANCE_ORDER: TenderImportance[] = ['critical', 'high', 'normal']

export const IMPORTANCE_LABELS = Object.fromEntries(
  IMPORTANCE_ORDER.map((i) => [i, IMPORTANCE_META[i].label]),
) as Record<TenderImportance, string>
