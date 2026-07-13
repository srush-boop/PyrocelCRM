'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ReceiptText,
  Landmark,
  Coins,
  Layers,
  Boxes,
  FileText,
  SlidersHorizontal,
  PencilRuler,
  LayoutList,
  PanelsTopLeft,
  Radio,
  Settings,
  ChevronDown,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type SalesNavLink = {
  title: string
  href: string
  icon: LucideIcon
}

// Top-level sales tabs: the dashboard landing plus the day-to-day quoting tools.
const topLevelLinks: SalesNavLink[] = [
  { title: 'Dashboard', href: '/dashboard/sales', icon: LayoutDashboard },
  { title: 'Quotes', href: '/dashboard/sales/quotes', icon: ReceiptText },
  { title: 'Quote Bank', href: '/dashboard/sales/quote-bank', icon: Landmark },
]

// Setup areas grouped under the "Sales Configuration" dropdown.
const configLinks: SalesNavLink[] = [
  { title: 'Direct Costs', href: '/dashboard/sales/direct-costs', icon: Coins },
  { title: 'System Types', href: '/dashboard/sales/system-types', icon: Layers },
  { title: 'Asset Types', href: '/dashboard/sales/asset-types', icon: Boxes },
  { title: 'Spec Templates', href: '/dashboard/sales/spec-templates', icon: FileText },
  { title: 'Work-type Fields', href: '/dashboard/sales/work-type-fields', icon: SlidersHorizontal },
  { title: 'Panel Fields', href: '/dashboard/sales/panel-fields', icon: PanelsTopLeft },
  { title: 'Remote Monitoring', href: '/dashboard/sales/rem-mon', icon: Radio },
  { title: 'Quote Sections', href: '/dashboard/sales/quote-sections', icon: LayoutList },
  { title: 'Design Categories', href: '/dashboard/sales/design-categories', icon: PencilRuler },
]

// Section slugs that have their own menu entry. Any other single segment under
// /dashboard/sales (e.g. "new" or a quote id) is the full-page quote editor,
// where the menu header is hidden.
const sectionSlugs = new Set(
  [...topLevelLinks, ...configLinks]
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

const tabClass =
  'flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors'

export function SalesNav() {
  const pathname = usePathname()

  if (isEditorRoute(pathname)) return null

  const configActive = configLinks.some(
    (link) => pathname === link.href || pathname.startsWith(`${link.href}/`),
  )

  return (
    <nav
      aria-label="Sales sections"
      className="-mx-4 border-b border-border px-4 sm:mx-0 sm:px-0"
    >
      <ul className="flex flex-wrap items-center gap-1 pb-px">
        {topLevelLinks.map((link) => {
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
                  tabClass,
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

        <li className="shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                tabClass,
                configActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
              )}
            >
              <Settings className="h-4 w-4" />
              Configure
              <ChevronDown className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {configLinks.map((link) => {
                const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
                return (
                  <DropdownMenuItem key={link.href} asChild>
                    <Link
                      href={link.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn('flex items-center gap-2', active && 'font-medium text-foreground')}
                    >
                      <link.icon className="h-4 w-4" />
                      {link.title}
                    </Link>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      </ul>
    </nav>
  )
}
