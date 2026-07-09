'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ChevronRight, Settings, BookOpen, HelpCircle } from 'lucide-react'
import type { Profile } from '@/lib/types/database'
import { getVisibleMenu, type NavItem, type NavChild } from '@/lib/config/navigation'
import { ChatNavBadge } from '@/components/dashboard/chat/chat-nav-badge'

interface DashboardSidebarProps {
  profile: Profile
}

// Renders the nested children of a top-level group (handles one extra level of
// nesting, e.g. "Sales Configuration" inside "Sales").
function NavChildren({ children }: { children: NavChild[] }) {
  const pathname = usePathname()
  return (
    <SidebarMenuSub>
      {children.map((child) =>
        child.children ? (
          <Collapsible
            key={child.title}
            asChild
            defaultOpen={child.children.some((sub) => pathname === sub.href)}
            className="group/subcollapsible"
          >
            <SidebarMenuSubItem>
              <CollapsibleTrigger asChild>
                <SidebarMenuSubButton>
                  <child.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{child.title}</span>
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0 transition-transform group-data-[state=open]/subcollapsible:rotate-90" />
                </SidebarMenuSubButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {child.children.map((sub) => (
                    <SidebarMenuSubItem key={sub.href}>
                      <SidebarMenuSubButton asChild isActive={pathname === sub.href}>
                        <Link href={sub.href}>
                          <sub.icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{sub.title}</span>
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuSubItem>
          </Collapsible>
        ) : (
          <SidebarMenuSubItem key={child.href}>
            <SidebarMenuSubButton asChild isActive={pathname === child.href}>
              <Link href={child.href!}>
                <child.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{child.title}</span>
              </Link>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        ),
      )}
    </SidebarMenuSub>
  )
}

// A top-level group item. When `item.href` is present it is a "clickable group":
// clicking the label navigates to the href AND opens the group; the chevron
// toggles open/closed independently.
function NavGroupItem({ item }: { item: NavItem }) {
  const pathname = usePathname()
  const children = item.children!
  const containsActive = children.some(
    (child) =>
      pathname === child.href || child.children?.some((sub) => pathname === sub.href),
  )
  const [open, setOpen] = useState(containsActive)

  if (item.href) {
    const isActive = pathname === item.href
    return (
      <Collapsible open={open} onOpenChange={setOpen} asChild className="group/collapsible">
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
            <Link href={item.href} onClick={() => setOpen(true)}>
              <item.icon className="h-4 w-4" />
              <span>{item.title}</span>
            </Link>
          </SidebarMenuButton>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-label={`Toggle ${item.title} menu`}
              className="absolute right-1 top-1.5 flex h-6 w-6 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <NavChildren children={children} />
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    )
  }

  // Non-clickable group: the whole row toggles.
  return (
    <Collapsible asChild defaultOpen={containsActive} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.title}>
            <item.icon className="h-4 w-4" />
            <span>{item.title}</span>
            <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <NavChildren children={children} />
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

export function DashboardSidebar({ profile }: DashboardSidebarProps) {
  const pathname = usePathname()
  const navItems = getVisibleMenu(profile.role, profile.menu_permissions)

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-6 py-4">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/pyrocel-logo.png"
              alt="Pyrocel logo"
              className="h-9 w-9 object-contain"
            />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-sidebar-foreground">Pyrocel</span>
            <span className="text-xs text-sidebar-foreground/60 capitalize">{profile.role}</span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) =>
                item.children ? (
                  <NavGroupItem key={item.key} item={item} />
                ) : (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton asChild isActive={pathname === item.href}>
                      <Link href={item.href!}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.key === 'chat' && <ChatNavBadge />}
                  </SidebarMenuItem>
                ),
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === '/dashboard/about'}>
              <Link href="/dashboard/about">
                <BookOpen className="h-4 w-4" />
                <span>About</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === '/dashboard/help'}>
              <Link href="/dashboard/help">
                <HelpCircle className="h-4 w-4" />
                <span>Help</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === '/dashboard/settings'}>
              <Link href="/dashboard/settings">
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
