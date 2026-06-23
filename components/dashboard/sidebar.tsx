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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
  Lightbulb,
  Gauge,
  ChevronRight,
  HelpCircle,
  ReceiptText,
  BookOpen,
  Coins,
  Landmark,
  FileText as FileTextIcon,
  SlidersHorizontal,
  PencilRuler,
} from 'lucide-react'
import type { Profile } from '@/lib/types/database'
import type { LucideIcon } from 'lucide-react'

interface DashboardSidebarProps {
  profile: Profile
}

type NavItem = {
  title: string
  href?: string
  icon: LucideIcon
  children?: { title: string; href: string; icon: LucideIcon }[]
}

// Sites now acts as a parent grouping its asset registers (dampers,
// extinguishers, emergency lights) alongside the sites list itself.
const sitesNavItem: NavItem = {
  title: 'Sites',
  icon: Building2,
  children: [
    { title: 'All Sites', href: '/dashboard/sites', icon: Building2 },
    { title: 'Dampers', href: '/dashboard/dampers', icon: Wind },
    { title: 'Extinguishers', href: '/dashboard/extinguishers', icon: FireExtinguisher },
    { title: 'Emergency Lights', href: '/dashboard/emergency-lights', icon: Lightbulb },
  ],
}

// Service Management groups the operational setup of how services are
// delivered: routes, areas, service types and their checklists.
const adminServiceManagementNavItem: NavItem = {
  title: 'Service Management',
  icon: Wrench,
  children: [
    { title: 'Routes', href: '/dashboard/routes', icon: Route },
    { title: 'Areas', href: '/dashboard/areas', icon: MapPinned },
    { title: 'Service Types', href: '/dashboard/service-types', icon: Wrench },
    { title: 'Checklists', href: '/dashboard/checklists', icon: ClipboardList },
  ],
}

// Office users only have access to routes and areas within service management.
const officeServiceManagementNavItem: NavItem = {
  title: 'Service Management',
  icon: Wrench,
  children: [
    { title: 'Routes', href: '/dashboard/routes', icon: Route },
    { title: 'Areas', href: '/dashboard/areas', icon: MapPinned },
  ],
}

// Sales groups quoting and the reusable line-item catalogue.
const salesNavItem: NavItem = {
  title: 'Sales',
  icon: ReceiptText,
  children: [
    { title: 'Quotes', href: '/dashboard/sales', icon: ReceiptText },
    { title: 'Quote Bank', href: '/dashboard/sales/quote-bank', icon: Landmark },
    { title: 'Catalogue', href: '/dashboard/sales/catalogue', icon: BookOpen },
    { title: 'Direct Costs', href: '/dashboard/sales/direct-costs', icon: Coins },
    { title: 'Spec Templates', href: '/dashboard/sales/spec-templates', icon: FileTextIcon },
    { title: 'Work-type Fields', href: '/dashboard/sales/work-type-fields', icon: SlidersHorizontal },
    { title: 'Design Categories', href: '/dashboard/sales/design-categories', icon: PencilRuler },
  ],
}

const adminNavItems: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Clients', href: '/dashboard/clients', icon: Building },
  sitesNavItem,
  { title: 'Schedule', href: '/dashboard/schedule', icon: Calendar },
  adminServiceManagementNavItem,
  { title: 'Users', href: '/dashboard/engineers', icon: Users },
  { title: 'Client Logins', href: '/dashboard/client-logins', icon: KeyRound },
  { title: 'Sub-contractors', href: '/dashboard/subcontractors', icon: HardHat },
  salesNavItem,
  { title: 'Reports', href: '/dashboard/reports', icon: FileText },
  { title: 'KPIs', href: '/dashboard/kpis', icon: Gauge },
  { title: 'Documents', href: '/dashboard/documents', icon: FolderOpen },
]

const engineerNavItems: NavItem[] = [
  { title: 'Schedule', href: '/dashboard/schedule', icon: Calendar },
]

const officeNavItems: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Clients', href: '/dashboard/clients', icon: Building },
  sitesNavItem,
  { title: 'Schedule', href: '/dashboard/schedule', icon: Calendar },
  officeServiceManagementNavItem,
  { title: 'Sub-contractors', href: '/dashboard/subcontractors', icon: HardHat },
  salesNavItem,
  { title: 'Reports', href: '/dashboard/reports', icon: FileText },
  { title: 'KPIs', href: '/dashboard/kpis', icon: Gauge },
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
              {navItems.map((item) =>
                item.children ? (
                  <Collapsible
                    key={item.title}
                    asChild
                    defaultOpen={item.children.some((child) => pathname === child.href)}
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                          <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {item.children.map((child) => (
                            <SidebarMenuSubItem key={child.href}>
                              <SidebarMenuSubButton asChild isActive={pathname === child.href}>
                                <Link href={child.href}>
                                  <child.icon className="h-4 w-4" />
                                  <span>{child.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                ) : (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={pathname === item.href}>
                      <Link href={item.href!}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
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
