'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Menu } from 'lucide-react'
import { useSidebar } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { SIMPLE_SECTIONS, type SimpleSectionKey } from '@/lib/config/simple-app'

// Tap-friendly bottom nav for Simple Mode. Shows Home plus the user's enabled
// sections; if there are more than four, the last slot becomes "More" which
// opens the full off-canvas sidebar for everything else.
export function SimpleBottomNav({ enabledKeys }: { enabledKeys: SimpleSectionKey[] }) {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()

  const sections = SIMPLE_SECTIONS.filter((s) => enabledKeys.includes(s.key))
  const overflow = sections.length > 4
  const primary = overflow ? sections.slice(0, 4) : sections

  const isActive = (href: string) =>
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
        <li className="flex-1">
          <Link
            href="/dashboard"
            aria-current={isActive('/dashboard') ? 'page' : undefined}
            className={cn(
              'flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-medium transition-colors',
              isActive('/dashboard')
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Home className={cn('h-6 w-6', isActive('/dashboard') && 'stroke-[2.5]')} />
            <span className="leading-none">Home</span>
          </Link>
        </li>

        {primary.map((item) => {
          const active = isActive(item.href)
          return (
            <li key={item.key} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <item.icon className={cn('h-6 w-6', active && 'stroke-[2.5]')} />
                <span className="leading-none">{item.shortTitle}</span>
              </Link>
            </li>
          )
        })}

        {overflow && (
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setOpenMobile(true)}
              aria-label="More options"
              className="flex min-h-16 w-full flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Menu className="h-6 w-6" />
              <span className="leading-none">More</span>
            </button>
          </li>
        )}
      </ul>
    </nav>
  )
}
