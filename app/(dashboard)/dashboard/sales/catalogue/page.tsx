import { redirect } from 'next/navigation'

// The Quote Catalogue moved into the Stock section. Keep this route so existing
// links and bookmarks continue to work.
export default function CatalogueRedirect() {
  redirect('/dashboard/stock/catalogue')
}
