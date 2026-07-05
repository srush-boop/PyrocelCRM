// Shared, client-safe calendar entry type identifiers used by the leave
// workflow. Kept separate from `lib/leave.ts` (which is server-only) so client
// components can import them without pulling in server code.

/** The calendar entry type that represents booked annual leave. */
export const ANNUAL_LEAVE_TYPE_ID = '150124a6-481b-43f6-819f-d2d02525ed3a'

/** Company-wide bank holidays, excluded from leave day/hour calculations. */
export const BANK_HOLIDAY_TYPE_ID = '73267195-2ba7-423b-b642-bc040dcb1840'
