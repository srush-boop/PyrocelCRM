import { redirect } from 'next/navigation'

/**
 * The standalone Service Reports view has been merged into the All Calls →
 * Completed tab (office/admin see the rich reports-style table there). This
 * route now redirects to that merged view. The report VIEWER lives at
 * /dashboard/reports/[taskId] and is unaffected.
 */
export default function ReportsRedirectPage() {
  redirect('/dashboard/schedule?tab=completed')
}
