'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
} from '@/components/ui/sidebar'
import {
  LayoutDashboard,
  Building2,
  Building,
  Route,
  Users,
  ClipboardList,
  Settings,
  Wrench,
  Calendar,
  FileText,
  Wind,
  FireExtinguisher,
  MapPinned,
  HardHat,
  KeyRound,
  FolderOpen,
} from 'lucide-react'
import type { Profile } from '@/lib/types/database'

interface DashboardSidebarProps {
  profile: Profile
}

const adminNavItems = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Clients', href: '/dashboard/clients', icon: Building },
  { title: 'Sites', href: '/dashboard/sites', icon: Building2 },
  { title: 'Dampers', href: '/dashboard/dampers', icon: Wind },
  { title: 'Extinguishers', href: '/dashboard/extinguishers', icon: FireExtinguisher },
  { title: 'Routes', href: '/dashboard/routes', icon: Route },
  { title: 'Areas', href: '/dashboard/areas', icon: MapPinned },
  { title: 'Users', href: '/dashboard/engineers', icon: Users },
  { title: 'Client Logins', href: '/dashboard/client-logins', icon: KeyRound },
  { title: 'Sub-contractors', href: '/dashboard/subcontractors', icon: HardHat },
  { title: 'Service Types', href: '/dashboard/service-types', icon: Wrench },
  { title: 'Checklists', href: '/dashboard/checklists', icon: ClipboardList },
  { title: 'Schedule', href: '/dashboard/schedule', icon: Calendar },
  { title: 'Reports', href: '/dashboard/reports', icon: FileText },
  { title: 'Documents', href: '/dashboard/documents', icon: FolderOpen },
]

const engineerNavItems = [
  { title: 'My Tasks', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Schedule', href: '/dashboard/schedule', icon: Calendar },
]

const officeNavItems = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Clients', href: '/dashboard/clients', icon: Building },
  { title: 'Sites', href: '/dashboard/sites', icon: Building2 },
  { title: 'Dampers', href: '/dashboard/dampers', icon: Wind },
  { title: 'Extinguishers', href: '/dashboard/extinguishers', icon: FireExtinguisher },
  { title: 'Routes', href: '/dashboard/routes', icon: Route },
  { title: 'Areas', href: '/dashboard/areas', icon: MapPinned },
  { title: 'Sub-contractors', href: '/dashboard/subcontractors', icon: HardHat },
  { title: 'Schedule', href: '/dashboard/schedule', icon: Calendar },
  { title: 'Reports', href: '/dashboard/reports', icon: FileText },
  { title: 'Documents', href: '/dashboard/documents', icon: FolderOpen },
]

export function DashboardSidebar({ profile }: DashboardSidebarProps) {
  const pathname = usePathname()
  
  const navItems = profile.role === 'admin' 
    ? adminNavItems 
    : profile.role === 'office' 
    ? officeNavItems 
    : engineerNavItems

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
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href}>
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-4">
        <SidebarMenu>
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
