import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// The AI-triaged inbound Requests inbox is hidden for all users while the triage
// flow is paused. The nav entry has been removed; this guard also blocks direct
// URL access. Restore the previous implementation (see git history) to re-enable.
export default async function RequestsPage() {
  redirect('/dashboard')
}
