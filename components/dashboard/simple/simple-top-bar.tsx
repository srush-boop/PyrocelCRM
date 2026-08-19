'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogOut, User, Monitor } from 'lucide-react'
import { NotificationBell } from '@/components/dashboard/notifications/notification-bell'
import { ViewModeToggle } from './view-mode-toggle'
import type { Profile } from '@/lib/types/database'

// Compact top bar for the simplified app. Deliberately minimal: identity, the
// shared notification bell, a "full site" escape hatch, and an account menu.
export function SimpleTopBar({ profile }: { profile: Profile }) {
  const router = useRouter()
  const supabase = createClient()

  const initials = profile.full_name
    ? profile.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : profile.email.slice(0, 2).toUpperCase()

  const firstName = (profile.full_name || 'there').split(' ')[0]

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-background/90 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">Hi, {firstName}</p>
        <p className="truncate text-xs text-muted-foreground">Pyrocel</p>
      </div>
      <ViewModeToggle mode="to-full" className="text-muted-foreground" />
      <NotificationBell />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="relative h-9 w-9 rounded-full"
            aria-label="Account menu"
          >
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
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href="/dashboard/settings" className="cursor-pointer">
              <User className="mr-2 h-4 w-4" />
              Profile Settings
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href="/dashboard/my-tasks" className="cursor-pointer">
              <Monitor className="mr-2 h-4 w-4" />
              Tasks & Forms
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
