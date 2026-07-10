// Follow-Up Calls — shared constants and label helpers.
//
// A follow-up call is raised when an engineer cannot resolve an issue on a
// non-recurring call (reactive / emergency / planned). It routes through a
// review queue, then becomes a linked "Planned Call". This is distinct from
// remedial works, which arise from recurring PPM work and require a quote.

import type { Task } from '@/lib/types/database'

// Service type used for the follow-up call itself.
export const PLANNED_CALL_SERVICE_TYPE_ID = '2404800c-b86d-45e0-9785-4b769db4c426'

// Descriptive roles (profiles.role_id → roles.id).
export const SERVICE_MANAGER_ROLE_ID = '2d096fcb-1249-4f8a-8e7d-5d80e2c59e15'
export const STORES_PERSON_ROLE_ID = 'c4773d75-8303-45e8-b7ad-daef35d367ac'

// A call is "non-recurring" (eligible for a follow-up) when it is not anchored
// to a recurring site_service — i.e. reactive, emergency, or planned calls.
export function isNonRecurringCall(task: Pick<Task, 'site_service_id'>): boolean {
  return !task.site_service_id
}

// Human label for a position in the fix chain. 1 = original visit.
export function fixAttemptLabel(attempt: number): string {
  if (attempt <= 1) return 'First visit'
  return `Follow-up #${attempt - 1}`
}

// Human label describing a failure to fix at a given attempt number. The
// attempt here is the attempt that FAILED (the visit that raised the follow-up).
export function fixFailureLabel(failedAttempt: number, isEmergency: boolean): string {
  if (failedAttempt <= 1) {
    return isEmergency ? 'First-time fix failed (emergency)' : 'First-time fix failed'
  }
  if (failedAttempt === 2) return 'Second-time fix failed'
  return 'Third-time fix failed — escalated'
}

// A follow-up raised off an attempt >= 3 (i.e. a second follow-up visit that
// still failed) escalates to the Service Manager.
export function shouldEscalate(failedAttempt: number): boolean {
  return failedAttempt >= 3
}
