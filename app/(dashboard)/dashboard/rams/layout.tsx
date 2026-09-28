import { redirect } from 'next/navigation'
import { Archive } from 'lucide-react'
import { getAuthContext } from '@/lib/auth'

// The legacy RAMS module is archived (kept, not deleted) until the replacement
// RAMS app is integrated and proven. Code and data are untouched; only admins
// can still reach it by direct URL, read-only reference, everyone else is sent
// back to Documents.
export default async function ArchivedRamsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, profile } = await getAuthContext()
  if (!user || !profile) redirect('/auth/login')
  if (profile.role !== 'admin') redirect('/dashboard/documents')

  return (
    <div className="flex flex-col gap-4">
      <div
        role="status"
        className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      >
        <Archive className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p className="leading-relaxed">
          <span className="font-medium">Archived.</span> This RAMS module is hidden from the menu while
          the new RAMS app is integrated. Existing documents are kept for reference; only admins can see
          this page.
        </p>
      </div>
      {children}
    </div>
  )
}
