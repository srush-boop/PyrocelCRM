import { redirect } from 'next/navigation'

// Sub-contractors are now managed within the unified Suppliers module. Keep this
// route so existing links and bookmarks continue to work.
export default function SubcontractorsRedirect() {
  redirect('/dashboard/suppliers')
}
