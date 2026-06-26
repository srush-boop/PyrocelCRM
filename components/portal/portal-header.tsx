'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'

const navLinks = [
  { href: '/portal', label: 'Reports' },
  { href: '/portal/quotes', label: 'Quotes' },
  { href: '/portal/logbook', label: 'Log Book' },
  { href: '/portal/kpis', label: 'Performance' },
]

interface PortalHeaderProps {
  clientName: string | null
  userName: string | null
}

export function PortalHeader({ clientName, userName }: PortalHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b bg-background px-4 md:px-6">
      <Link href="/portal" className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border bg-white p-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/pyrocel-logo.png" alt="Pyrocel logo" className="h-full w-full object-contain" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold leading-tight">
            {clientName || 'Pyrocel Client Portal'}
          </span>
          <span className="text-xs text-muted-foreground">Service Reports</span>
        </div>
      </Link>
      <nav className="flex items-center gap-1">
        {navLinks.map((link) => {
          const active =
            link.href === '/portal'
              ? pathname === '/portal'
              : pathname.startsWith(link.href)
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {link.label}
            </Link>
          )
        })}
      </nav>
      <div className="flex items-center gap-3">
        {userName && (
          <span className="hidden text-sm text-muted-foreground sm:inline">{userName}</span>
        )}
        <Button variant="outline" size="sm" onClick={handleSignOut} className="gap-2">
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </header>
  )
}
