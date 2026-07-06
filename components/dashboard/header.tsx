'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { LogOut, User, ArrowLeft } from 'lucide-react'
import { GlobalSiteSearch } from '@/components/dashboard/global-site-search'
import { NotificationBell } from '@/components/dashboard/notifications/notification-bell'
import type { Profile } from '@/lib/types/database'

interface DashboardHeaderProps {
  profile: Profile
}

export function DashboardHeader({ profile }: DashboardHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const supabase = createClient()

  // The dashboard root is the top-level page, so it has nowhere to go "back" to.
  const showBack = pathname !== '/dashboard'

  const handleBack = () => {
    // 1. Prefer an explicit origin passed by the linking page (?from=). Detail
    //    screens such as a task open from the schedule/calendar and carry their
    //    origin here, so "Back" is deterministic. This also avoids landing on
    //    non-existent parent routes: e.g. tasks live only at
    //    /dashboard/tasks/[id] — there is no /dashboard/tasks list page, so the
    //    parent-segment heuristic below would navigate to a dead route.
    const from = searchParams.get('from')
    if (from && from.startsWith('/') && !from.startsWith('//')) {
      router.push(from)
      return
    }

    // 2. Fall back to navigating up one path segment (e.g. /dashboard/defects ->
    //    /dashboard). This is deterministic and always works, unlike
    //    router.back(), which does nothing when there's no in-app history
    //    (direct link / fresh load / sidebar navigation) and can land on an
    //    unexpected page otherwise.
    const segments = pathname.split('/').filter(Boolean)
    const parent = segments.length > 1 ? `/${segments.slice(0, -1).join('/')}` : '/dashboard'
    router.push(parent)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const initials = profile.full_name
    ? profile.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : profile.email.slice(0, 2).toUpperCase()

  return (
    <header data-dashboard-header className="flex h-16 items-center gap-2 border-b border-border bg-background px-3 sm:gap-4 sm:px-6">
      <SidebarTrigger className="-ml-2" />
      <Separator orientation="vertical" className="h-6" />
      {showBack && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      )}
      <div className="flex-1" />
      {(profile.role === 'admin' || profile.role === 'office') && (
        <GlobalSiteSearch />
      )}
      <NotificationBell />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-9 w-9 rounded-full">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium">{profile.full_name || 'User'}</p>
              <p className="text-xs text-muted-foreground">{profile.email}</p>
              <p className="text-xs text-muted-foreground capitalize">Role: {profile.role}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href="/dashboard/settings" className="cursor-pointer">
              <User className="mr-2 h-4 w-4" />
              Profile Settings
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="text-destructive cursor-pointer">
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
