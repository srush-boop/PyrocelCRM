import type { InternalTaskItem, InternalTaskAnswer } from '@/lib/types/database'

// ============================================================================
// Surveys — pure results-summary engine.
// Aggregates completed survey responses into a per-question summary, used by the
// admin results view and the summary email/notification. No I/O so it stays
// unit-testable; callers supply the questions, instances and a name lookup.
// ============================================================================

export interface SurveyQuestionSummary {
  itemId: string
  label: string
  type: InternalTaskItem['type']
  // Number of responses that actually answered this question.
  answered: number
  // pass_fail
  passCount?: number
  failCount?: number
  advisoryCount?: number
  naCount?: number
  // checkbox
  checkedCount?: number
  uncheckedCount?: number
  // number
  average?: number | null
  min?: number | null
  max?: number | null
  // text — respondent name is null when the survey is anonymous.
  textResponses?: { name: string | null; value: string }[]
  // table
  tableRowCount?: number
}

export interface SurveySummary {
  totalInvited: number
  totalResponded: number
  // Whole-number percentage 0..100.
  responseRate: number
  anonymous: boolean
  questions: SurveyQuestionSummary[]
}

interface SummaryInstance {
  status: string
  answers: InternalTaskAnswer[] | null
  user_id: string
}

// Block types that produce an answer worth summarising.
const ANSWERABLE = new Set(['pass_fail', 'text', 'number', 'checkbox', 'table'])

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Builds the aggregate summary for a survey. Only `completed` instances count as
 * responses. When `anonymous` is true, free-text responses carry no name.
 */
export function buildSurveySummary(params: {
  questions: InternalTaskItem[]
  instances: SummaryInstance[]
  anonymous: boolean
  nameById?: Record<string, string>
}): SurveySummary {
  const { questions, instances, anonymous, nameById = {} } = params
  const responded = instances.filter((i) => i.status === 'completed')
  const totalInvited = instances.length
  const totalResponded = responded.length

  const questionSummaries: SurveyQuestionSummary[] = []
  for (const q of questions) {
    if (!ANSWERABLE.has(q.type)) continue

    const answers = responded
      .map((i) => ({
        answer: (i.answers ?? []).find((a) => a.item_id === q.id),
        userId: i.user_id,
      }))
      .filter((r): r is { answer: InternalTaskAnswer; userId: string } => !!r.answer)

    const summary: SurveyQuestionSummary = {
      itemId: q.id,
      label: q.label,
      type: q.type,
      answered: answers.length,
    }

    switch (q.type) {
      case 'pass_fail': {
        summary.passCount = answers.filter((a) => a.answer.passed === true).length
        summary.advisoryCount = answers.filter((a) => a.answer.advisory === true).length
        summary.naCount = answers.filter((a) => a.answer.na === true).length
        summary.failCount = answers.filter(
          (a) => a.answer.passed === false && !a.answer.advisory && !a.answer.na,
        ).length
        break
      }
      case 'checkbox': {
        summary.checkedCount = answers.filter((a) => a.answer.value === true).length
        summary.uncheckedCount = answers.filter((a) => a.answer.value !== true).length
        break
      }
      case 'number': {
        const nums = answers
          .map((a) => num(a.answer.value))
          .filter((n): n is number => n != null)
        if (nums.length > 0) {
          summary.average = nums.reduce((s, n) => s + n, 0) / nums.length
          summary.min = Math.min(...nums)
          summary.max = Math.max(...nums)
        } else {
          summary.average = null
          summary.min = null
          summary.max = null
        }
        break
      }
      case 'text': {
        summary.textResponses = answers
          .map((a) => ({
            name: anonymous ? null : nameById[a.userId] ?? null,
            value: String(a.answer.value ?? '').trim(),
          }))
          .filter((r) => r.value.length > 0)
        break
      }
      case 'table': {
        summary.tableRowCount = answers.reduce(
          (sum, a) => sum + (Array.isArray(a.answer.value) ? a.answer.value.length : 0),
          0,
        )
        break
      }
    }

    questionSummaries.push(summary)
  }

  return {
    totalInvited,
    totalResponded,
    responseRate:
      totalInvited > 0 ? Math.round((totalResponded / totalInvited) * 100) : 0,
    anonymous,
    questions: questionSummaries,
  }
}

/**
 * One concise human-readable headline per question, used in the summary email
 * and in-app notification. Text questions collapse to a response count to keep
 * the digest short (full verbatim answers live on the results page).
 */
export function summaryHeadlines(summary: SurveySummary): { label: string; detail: string }[] {
  return summary.questions.map((q) => {
    let detail = ''
    switch (q.type) {
      case 'pass_fail':
        detail = `Yes ${q.passCount ?? 0} · No ${q.failCount ?? 0}` +
          ((q.advisoryCount ?? 0) > 0 ? ` · Maybe ${q.advisoryCount}` : '') +
          ((q.naCount ?? 0) > 0 ? ` · N/A ${q.naCount}` : '')
        break
      case 'checkbox':
        detail = `Ticked ${q.checkedCount ?? 0} of ${q.answered}`
        break
      case 'number':
        detail =
          q.average != null
            ? `Avg ${q.average.toFixed(1)} (min ${q.min}, max ${q.max}, ${q.answered} responses)`
            : 'No numeric responses'
        break
      case 'text':
        detail = `${q.textResponses?.length ?? 0} written response(s)`
        break
      case 'table':
        detail = `${q.tableRowCount ?? 0} row(s) across ${q.answered} responses`
        break
    }
    return { label: q.label, detail }
  })
}
