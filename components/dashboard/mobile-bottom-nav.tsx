'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, Navigation, CalendarDays, Boxes, Menu, Home } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useSidebar } from '@/components/ui/sidebar'
import { getVisibleMenu } from '@/lib/config/navigation'
import { cn } from '@/lib/utils'
import type { Profile } from '@/lib/types/database'

type BottomNavItem = {
  // `menuKey` gates the item against the engineer's visible top-level menu so
  // the bar stays consistent with per-user permissions.
  menuKey: string
  title: string
  href: string
  icon: LucideIcon
}

const engineerItems: BottomNavItem[] = [
  { menuKey: 'home', title: 'Home', href: '/dashboard', icon: Home },
  { menuKey: 'calls', title: 'Calls', href: '/dashboard/schedule', icon: Calendar },
  { menuKey: 'calls', title: 'Nearby', href: '/dashboard/nearby', icon: Navigation },
  { menuKey: 'calendar', title: 'Calendar', href: '/dashboard/calendar', icon: CalendarDays },
  { menuKey: 'stock', title: 'Stock', href: '/dashboard/stock', icon: Boxes },
]

export function MobileBottomNav({ profile }: { profile: Profile }) {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()

  const visibleKeys = new Set(
    getVisibleMenu(profile.role, profile.menu_permissions).map((item) => item.key),
  )
  const items = engineerItems.filter((item) => visibleKeys.has(item.menuKey))

  const isActive = (href: string) =>
    // The dashboard root must match exactly, otherwise it would light up on
    // every /dashboard/* route.
    href === '/dashboard'
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden"
    >
      <ul
        className="flex items-stretch justify-around"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {items.map((item) => {
          const active = isActive(item.href)
          return (
            <li key={item.title} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-medium transition-colors',
                  active
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <item.icon className={cn('h-6 w-6', active && 'stroke-[2.5]')} />
                <span className="leading-none">{item.title}</span>
              </Link>
            </li>
          )
        })}
        <li className="flex-1">
          <button
            type="button"
            onClick={() => setOpenMobile(true)}
            className="flex min-h-16 w-full flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Menu className="h-6 w-6" />
            <span className="leading-none">More</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}
