import {
  LayoutDashboard,
  Building2,
  Building,
  Route,
  Users,
  ClipboardList,
  Wrench,
  Calendar,
  CalendarDays,
  FileText,
  MapPinned,
  HardHat,
  KeyRound,
  FolderOpen,
  Gauge,
  ReceiptText,
  BookOpen,
  Coins,
  Percent,
  Landmark,
  FileText as FileTextIcon,
  SlidersHorizontal,
  PencilRuler,
  LayoutList,
  Layers,
  Boxes,
  AlertTriangle,
  Vault,
  Bell,
  Navigation,
  ArrowLeftRight,
  Settings,
  ShieldCheck,
  GraduationCap,
  ClipboardCheck,
  CalendarCheck,
  CalendarClock,
  Sparkles,
  FileSignature,
  Paperclip,
  MessageSquareText,
  History,
  Archive,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { UserRole } from '@/lib/types/database'

// A leaf or nested child of a top-level menu item. Children are NOT individually
// permissioned (permissions are top-level only) — they follow their parent.
export type NavChild = {
  title: string
  href?: string
  icon: LucideIcon
  children?: { title: string; href: string; icon: LucideIcon }[]
}

// A top-level menu item. Every top-level item has a stable `key` used for
// per-user permission storage. `href` makes it a link; `children` makes it an
// expandable group. When both are present, it is a clickable group: the trigger
// navigates to `href` AND toggles the children.
export type NavItem = {
  key: string
  title: string
  href?: string
  icon: LucideIcon
  children?: NavChild[]
  // When true, this item can never be hidden by permissions (prevents lockout).
  locked?: boolean
}

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

const sitesNavItem: NavItem = {
  key: 'sites',
  title: 'Sites',
  href: '/dashboard/sites',
  icon: Building2,
}

// Calls is a clickable group: clicking it opens the calls list (Schedule) and
// expands its children (Schedule, Transfers, Reports, Defects).
const adminCallsNavItem: NavItem = {
  key: 'calls',
  title: 'Calls',
  href: '/dashboard/schedule',
  icon: Calendar,
  children: [
    { title: 'Schedule', href: '/dashboard/schedule', icon: Calendar },
    { title: 'Transfers', href: '/dashboard/transfers', icon: ArrowLeftRight },
    { title: 'Reports', href: '/dashboard/reports', icon: FileText },
    { title: 'Defects', href: '/dashboard/defects', icon: AlertTriangle },
  ],
}

const officeCallsNavItem: NavItem = {
  key: 'calls',
  title: 'Calls',
  href: '/dashboard/schedule',
  icon: Calendar,
  children: [
    { title: 'Schedule', href: '/dashboard/schedule', icon: Calendar },
    { title: 'Transfers', href: '/dashboard/transfers', icon: ArrowLeftRight },
    { title: 'Reports', href: '/dashboard/reports', icon: FileText },
    { title: 'Defects', href: '/dashboard/defects', icon: AlertTriangle },
  ],
}

const engineerCallsNavItem: NavItem = {
  key: 'calls',
  title: 'Calls',
  href: '/dashboard/schedule',
  icon: Calendar,
  children: [
    { title: 'Schedule', href: '/dashboard/schedule', icon: Calendar },
    { title: 'Nearby Calls', href: '/dashboard/nearby', icon: Navigation },
    { title: 'Transfers', href: '/dashboard/transfers', icon: ArrowLeftRight },
  ],
}

// Service Management now also contains Client Logins and Sub-contractors.
const adminServiceManagementNavItem: NavItem = {
  key: 'service-management',
  title: 'Service Management',
  icon: Wrench,
  children: [
    { title: 'Routes', href: '/dashboard/routes', icon: Route },
    { title: 'Areas', href: '/dashboard/areas', icon: MapPinned },
    { title: 'Service Types', href: '/dashboard/service-types', icon: Wrench },
    { title: 'System Types', href: '/dashboard/sales/system-types', icon: Layers },
    { title: 'Checklists', href: '/dashboard/checklists', icon: ClipboardList },
    { title: 'Client Logins', href: '/dashboard/client-logins', icon: KeyRound },
    { title: 'Sub-contractors', href: '/dashboard/subcontractors', icon: HardHat },
  ],
}

const officeServiceManagementNavItem: NavItem = {
  key: 'service-management',
  title: 'Service Management',
  icon: Wrench,
  children: [
    { title: 'Routes', href: '/dashboard/routes', icon: Route },
    { title: 'Areas', href: '/dashboard/areas', icon: MapPinned },
    { title: 'System Types', href: '/dashboard/sales/system-types', icon: Layers },
    { title: 'Sub-contractors', href: '/dashboard/subcontractors', icon: HardHat },
  ],
}

const salesNavItem: NavItem = {
  key: 'sales',
  title: 'Sales',
  icon: ReceiptText,
  children: [
    { title: 'Dashboard', href: '/dashboard/sales', icon: LayoutDashboard },
    { title: 'Quotes', href: '/dashboard/sales/quotes', icon: ReceiptText },
    { title: 'Quote Bank', href: '/dashboard/sales/quote-bank', icon: Landmark },
    {
      title: 'Sales Configuration',
      icon: Settings,
      children: [
        { title: 'Direct Costs', href: '/dashboard/sales/direct-costs', icon: Coins },
        { title: 'Set Margins', href: '/dashboard/sales/margins', icon: Percent },
        { title: 'Asset Types', href: '/dashboard/sales/asset-types', icon: Boxes },
        { title: 'Spec Templates', href: '/dashboard/sales/spec-templates', icon: FileTextIcon },
        { title: 'Work-type Fields', href: '/dashboard/sales/work-type-fields', icon: SlidersHorizontal },
        { title: 'Quote Sections', href: '/dashboard/sales/quote-sections', icon: LayoutList },
        { title: 'Quote Services', href: '/dashboard/sales/quote-services', icon: Wrench },
        { title: 'Design Categories', href: '/dashboard/sales/design-categories', icon: PencilRuler },
      ],
    },
  ],
}

const managerStockNavItem: NavItem = {
  key: 'stock',
  title: 'Stock',
  icon: Boxes,
  children: [
    { title: 'Overview', href: '/dashboard/stock', icon: Boxes },
    { title: 'Transfer Stock', href: '/dashboard/stock/transfer', icon: Route },
    { title: 'Parts Catalogue', href: '/dashboard/stock/parts', icon: BookOpen },
    { title: 'Quote Catalogue', href: '/dashboard/stock/catalogue', icon: BookOpen },
    { title: 'Transfers Report', href: '/dashboard/stock/report', icon: FileText },
  ],
}

const engineerStockNavItem: NavItem = {
  key: 'stock',
  title: 'Stock',
  icon: Boxes,
  children: [
    { title: 'Overview', href: '/dashboard/stock', icon: Boxes },
    { title: 'Transfer Stock', href: '/dashboard/stock/transfer', icon: Route },
  ],
}

// Tender AI: an expandable group. The trigger opens the module dashboard and
// reveals the nine sub-sections. Shared by admin and office.
const tenderAiNavItem: NavItem = {
  key: 'tender-ai',
  title: 'Tender AI',
  href: '/dashboard/tender-ai',
  icon: Sparkles,
  children: [
    { title: 'Dashboard', href: '/dashboard/tender-ai', icon: LayoutDashboard },
    { title: 'Active Tenders', href: '/dashboard/tender-ai/tenders', icon: FileSignature },
    { title: 'Knowledge Centre', href: '/dashboard/tender-ai/knowledge', icon: BookOpen },
    { title: 'Evidence Library', href: '/dashboard/tender-ai/evidence', icon: Paperclip },
    { title: 'AI Prompt Library', href: '/dashboard/tender-ai/prompts', icon: MessageSquareText },
    { title: 'Templates', href: '/dashboard/tender-ai/templates', icon: LayoutList },
    { title: 'Previous Responses', href: '/dashboard/tender-ai/previous-responses', icon: History },
    { title: 'Tender Vault', href: '/dashboard/tender-ai/vault', icon: Archive },
    { title: 'Requested Documents', href: '/dashboard/tender-ai/requested-documents', icon: FileText },
    { title: 'AI Settings', href: '/dashboard/tender-ai/settings', icon: SlidersHorizontal },
  ],
}

// ---------------------------------------------------------------------------
// Role default menus
// ---------------------------------------------------------------------------

const adminNavItems: NavItem[] = [
  { key: 'dashboard', title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { key: 'clients', title: 'Clients', href: '/dashboard/clients', icon: Building },
  sitesNavItem,
  adminCallsNavItem,
  { key: 'kpis', title: 'KPIs', href: '/dashboard/kpis', icon: Gauge },
  { key: 'calendar', title: 'Calendar', href: '/dashboard/calendar', icon: CalendarDays },
  { key: 'my-leave', title: 'My Leave', href: '/dashboard/my-leave', icon: CalendarClock },
  { key: 'approvals', title: 'Approvals', href: '/dashboard/approvals', icon: ClipboardCheck },
  { key: 'leave-summary', title: 'Leave Summary', href: '/dashboard/leave-summary', icon: CalendarCheck },
  adminServiceManagementNavItem,
  // Users is locked so an admin can never hide their own access to user/menu
  // management and lock everyone out.
  { key: 'users', title: 'Users', href: '/dashboard/engineers', icon: Users, locked: true },
  { key: 'training', title: 'Training', href: '/dashboard/training', icon: GraduationCap },
  { key: 'notifications', title: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  salesNavItem,
  managerStockNavItem,
  { key: 'documents', title: 'Documents', href: '/dashboard/documents', icon: FolderOpen },
  { key: 'rams', title: 'RAMS', href: '/dashboard/rams', icon: ShieldCheck },
  tenderAiNavItem,
  { key: 'vault', title: 'Employee Vault', href: '/dashboard/vault', icon: Vault },
]

const officeNavItems: NavItem[] = [
  { key: 'dashboard', title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { key: 'clients', title: 'Clients', href: '/dashboard/clients', icon: Building },
  sitesNavItem,
  officeCallsNavItem,
  { key: 'kpis', title: 'KPIs', href: '/dashboard/kpis', icon: Gauge },
  { key: 'calendar', title: 'Calendar', href: '/dashboard/calendar', icon: CalendarDays },
  { key: 'my-leave', title: 'My Leave', href: '/dashboard/my-leave', icon: CalendarClock },
  { key: 'approvals', title: 'Approvals', href: '/dashboard/approvals', icon: ClipboardCheck },
  { key: 'leave-summary', title: 'Leave Summary', href: '/dashboard/leave-summary', icon: CalendarCheck },
  officeServiceManagementNavItem,
  { key: 'training', title: 'Training', href: '/dashboard/training', icon: GraduationCap },
  { key: 'notifications', title: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  salesNavItem,
  managerStockNavItem,
  { key: 'documents', title: 'Documents', href: '/dashboard/documents', icon: FolderOpen },
  { key: 'rams', title: 'RAMS', href: '/dashboard/rams', icon: ShieldCheck },
  tenderAiNavItem,
  { key: 'vault', title: 'Employee Vault', href: '/dashboard/vault', icon: Vault },
]

const engineerNavItems: NavItem[] = [
  engineerCallsNavItem,
  { key: 'kpis', title: 'KPIs', href: '/dashboard/kpis', icon: Gauge },
  { key: 'calendar', title: 'Calendar', href: '/dashboard/calendar', icon: CalendarDays },
  { key: 'my-leave', title: 'My Leave', href: '/dashboard/my-leave', icon: CalendarClock },
  { key: 'approvals', title: 'Approvals', href: '/dashboard/approvals', icon: ClipboardCheck },
  engineerStockNavItem,
  { key: 'vault', title: 'Employee Vault', href: '/dashboard/vault', icon: Vault },
]

// Returns the full default top-level menu for a role (before applying any
// per-user permission overrides).
export function getMenuForRole(role: UserRole): NavItem[] {
  switch (role) {
    case 'admin':
      return adminNavItems
    case 'office':
      return officeNavItems
    default:
      return engineerNavItems
  }
}

// The default set of enabled top-level keys for a role.
export function getDefaultMenuKeys(role: UserRole): string[] {
  return getMenuForRole(role).map((item) => item.key)
}

// Applies a per-user permission override to a role's menu. `menuPermissions` is
// either null/undefined (use role defaults) or an array of enabled keys.
// Locked items are always kept regardless of the override.
export function getVisibleMenu(
  role: UserRole,
  menuPermissions: string[] | null | undefined,
): NavItem[] {
  const menu = getMenuForRole(role)
  if (!menuPermissions) return menu
  const enabled = new Set(menuPermissions)
  return menu.filter((item) => item.locked || enabled.has(item.key))
}
