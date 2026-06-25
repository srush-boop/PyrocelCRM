'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ReceiptText,
  Landmark,
  BookOpen,
  Coins,
  Layers,
  Boxes,
  FileText,
  SlidersHorizontal,
  PencilRuler,
  LayoutList,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type SalesNavLink = {
  title: string
  href: string
  icon: LucideIcon
}

// The sales sub-sections shown in the horizontal menu header. The first entry
// is the dashboard landing; the rest are the quoting tools and config areas.
const links: SalesNavLink[] = [
  { title: 'Dashboard', href: '/dashboard/sales', icon: LayoutDashboard },
  { title: 'Quotes', href: '/dashboard/sales/quotes', icon: ReceiptText },
  { title: 'Quote Bank', href: '/dashboard/sales/quote-bank', icon: Landmark },
  { title: 'Catalogue', href: '/dashboard/sales/catalogue', icon: BookOpen },
  { title: 'Direct Costs', href: '/dashboard/sales/direct-costs', icon: Coins },
  { title: 'System Types', href: '/dashboard/sales/system-types', icon: Layers },
  { title: 'Asset Types', href: '/dashboard/sales/asset-types', icon: Boxes },
  { title: 'Spec Templates', href: '/dashboard/sales/spec-templates', icon: FileText },
  { title: 'Work-type Fields', href: '/dashboard/sales/work-type-fields', icon: SlidersHorizontal },
  { title: 'Quote Sections', href: '/dashboard/sales/quote-sections', icon: LayoutList },
  { title: 'Design Categories', href: '/dashboard/sales/design-categories', icon: PencilRuler },
]

// Section slugs that have their own menu entry. Any other single segment under
// /dashboard/sales (e.g. "new" or a quote id) is the full-page quote editor,
// where the menu header is hidden.
const sectionSlugs = new Set(
  links
    .map((l) => l.href.split('/')[3])
    .filter((slug): slug is string => Boolean(slug)),
)

function isEditorRoute(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean) // ['dashboard','sales', ...]
  if (segments.length <= 2) return false // /dashboard/sales -> dashboard
  const slug = segments[2]
  // A known section is not an editor; anything else (new / quote id) is.
  return !sectionSlugs.has(slug)
}

export function SalesNav() {
  const pathname = usePathname()

  if (isEditorRoute(pathname)) return null

  return (
    <nav
      aria-label="Sales sections"
      className="-mx-4 border-b border-border px-4 sm:mx-0 sm:px-0"
    >
      <ul className="flex items-center gap-1 overflow-x-auto pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {links.map((link) => {
          const active =
            link.href === '/dashboard/sales'
              ? pathname === '/dashboard/sales'
              : pathname === link.href || pathname.startsWith(`${link.href}/`)
          return (
            <li key={link.href} className="shrink-0">
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                <link.icon className="h-4 w-4" />
                {link.title}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
