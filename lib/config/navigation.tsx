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
  Truck,
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
  Hammer,
  ShoppingCart,
  Package,
  QrCode,
  LifeBuoy,
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

// Service is a clickable group: clicking it opens the Service Dashboard and
// expands its children (Service Dashboard, All Calls, Map, Transfers, Reports,
// Defects). The `key` stays `calls` so existing per-user permissions still map.
const adminCallsNavItem: NavItem = {
  key: 'calls',
  title: 'Service',
  href: '/dashboard/service',
  icon: Wrench,
  children: [
    { title: 'Service Dashboard', href: '/dashboard/service', icon: LayoutDashboard },
    { title: 'All Calls', href: '/dashboard/schedule', icon: Calendar },
    { title: 'Map', href: '/dashboard/schedule/map', icon: MapPinned },
    { title: 'Transfers', href: '/dashboard/transfers', icon: ArrowLeftRight },
    { title: 'Reports', href: '/dashboard/reports', icon: FileText },
    { title: 'Defects', href: '/dashboard/defects', icon: AlertTriangle },
  ],
}

const officeCallsNavItem: NavItem = {
  key: 'calls',
  title: 'Service',
  href: '/dashboard/service',
  icon: Wrench,
  children: [
    { title: 'Service Dashboard', href: '/dashboard/service', icon: LayoutDashboard },
    { title: 'All Calls', href: '/dashboard/schedule', icon: Calendar },
    { title: 'Map', href: '/dashboard/schedule/map', icon: MapPinned },
    { title: 'Transfers', href: '/dashboard/transfers', icon: ArrowLeftRight },
    { title: 'Reports', href: '/dashboard/reports', icon: FileText },
    { title: 'Defects', href: '/dashboard/defects', icon: AlertTriangle },
  ],
}

// Engineers don't have the management Service Dashboard, so their Service group
// opens the Schedule directly and keeps their field-focused children.
const engineerCallsNavItem: NavItem = {
  key: 'calls',
  title: 'Service',
  href: '/dashboard/schedule',
  icon: Wrench,
  children: [
    { title: 'All Calls', href: '/dashboard/schedule', icon: Calendar },
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
    { title: 'Areas', href: '/dashboard/areas', icon: MapPinned },
    { title: 'Service Types', href: '/dashboard/service-types', icon: Wrench },
    { title: 'System Types', href: '/dashboard/sales/system-types', icon: Layers },
    { title: 'Checklists', href: '/dashboard/checklists', icon: ClipboardList },
    { title: 'Client Logins', href: '/dashboard/client-logins', icon: KeyRound },
  ],
}

const officeServiceManagementNavItem: NavItem = {
  key: 'service-management',
  title: 'Service Management',
  icon: Wrench,
  children: [
    { title: 'Areas', href: '/dashboard/areas', icon: MapPinned },
    { title: 'System Types', href: '/dashboard/sales/system-types', icon: Layers },
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
      title: 'Configure',
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

// Jobs: the operational delivery of won quotes. A clickable group opening the
// jobs dashboard and revealing the full jobs list. Shared by admin and office.
const jobsNavItem: NavItem = {
  key: 'jobs',
  title: 'Jobs',
  href: '/dashboard/jobs',
  icon: Hammer,
  children: [
    { title: 'Dashboard', href: '/dashboard/jobs', icon: LayoutDashboard },
    { title: 'All Jobs', href: '/dashboard/jobs/list', icon: LayoutList },
  ],
}

// Purchasing: purchase orders raised against jobs. Top-level so buyers can reach
// it directly; also surfaced within each job's detail page.
const purchasingNavItem: NavItem = {
  key: 'purchasing',
  title: 'Purchasing',
  href: '/dashboard/purchasing',
  icon: ShoppingCart,
}

const managerStockNavItem: NavItem = {
  key: 'stock',
  title: 'Products',
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
  title: 'Products',
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

// People: consolidates staff/HR concerns into one group. The admin variant
// includes Users and is `locked` so an admin can never hide their own access to
// user/menu management and lock everyone out.
const adminPeopleNavItem: NavItem = {
  key: 'people',
  title: 'People',
  icon: Users,
  locked: true,
  children: [
    { title: 'Users', href: '/dashboard/engineers', icon: Users },
    { title: 'Approvals', href: '/dashboard/approvals', icon: ClipboardCheck },
    { title: 'Training', href: '/dashboard/training', icon: GraduationCap },
    { title: 'My Leave', href: '/dashboard/my-leave', icon: CalendarClock },
    { title: 'Leave Summary', href: '/dashboard/leave-summary', icon: CalendarCheck },
    { title: 'Employee Vault', href: '/dashboard/vault', icon: Vault },
  ],
}

const officePeopleNavItem: NavItem = {
  key: 'people',
  title: 'People',
  icon: Users,
  children: [
    { title: 'Approvals', href: '/dashboard/approvals', icon: ClipboardCheck },
    { title: 'Training', href: '/dashboard/training', icon: GraduationCap },
    { title: 'My Leave', href: '/dashboard/my-leave', icon: CalendarClock },
    { title: 'Leave Summary', href: '/dashboard/leave-summary', icon: CalendarCheck },
    { title: 'Employee Vault', href: '/dashboard/vault', icon: Vault },
  ],
}

const engineerPeopleNavItem: NavItem = {
  key: 'people',
  title: 'People',
  icon: Users,
  children: [
    { title: 'My Leave', href: '/dashboard/my-leave', icon: CalendarClock },
    { title: 'Approvals', href: '/dashboard/approvals', icon: ClipboardCheck },
    { title: 'Employee Vault', href: '/dashboard/vault', icon: Vault },
  ],
}

// Documents: groups the two document stores (general Documents + RAMS).
const documentsNavItem: NavItem = {
  key: 'documents',
  title: 'Documents',
  icon: FolderOpen,
  children: [
    { title: 'Documents', href: '/dashboard/documents', icon: FolderOpen },
    { title: 'RAMS', href: '/dashboard/rams', icon: ShieldCheck },
  ],
}

// Assets: company asset register (tools, vehicles, access & test equipment, IT).
// Managers (admin/office) get the full register plus a QR label print sheet;
// engineers get a simple link showing only the assets assigned to them.
const managerAssetsNavItem: NavItem = {
  key: 'assets',
  title: 'Assets',
  href: '/dashboard/assets',
  icon: Package,
  children: [
    { title: 'Register', href: '/dashboard/assets', icon: Package },
    { title: 'Print QR Labels', href: '/dashboard/assets/labels', icon: QrCode },
  ],
}

const engineerAssetsNavItem: NavItem = {
  key: 'assets',
  title: 'My Assets',
  href: '/dashboard/assets',
  icon: Package,
}

// On-call: out-of-hours emergency rota. Available to all roles — engineers use
// it to see their shifts and request cover; managers build the rota and review
// pay. It sits alongside Calendar as a time/scheduling concern.
const oncallNavItem: NavItem = {
  key: 'oncall',
  title: 'On-call',
  href: '/dashboard/oncall',
  icon: LifeBuoy,
}

// Chat: internal team messaging (branch channels + direct messages). Available
// to all active staff.
const chatNavItem: NavItem = {
  key: 'chat',
  title: 'Chat',
  href: '/dashboard/chat',
  icon: MessageSquareText,
}

// ---------------------------------------------------------------------------
// Role default menus
// ---------------------------------------------------------------------------

const adminNavItems: NavItem[] = [
  { key: 'dashboard', title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { key: 'clients', title: 'Clients', href: '/dashboard/clients', icon: Building },
  { key: 'suppliers', title: 'Suppliers', href: '/dashboard/suppliers', icon: Truck },
  sitesNavItem,
  adminCallsNavItem,
  { key: 'calendar', title: 'Calendar', href: '/dashboard/calendar', icon: CalendarDays },
  oncallNavItem,
  chatNavItem,
  { key: 'kpis', title: 'KPIs', href: '/dashboard/kpis', icon: Gauge },
  adminServiceManagementNavItem,
  salesNavItem,
  jobsNavItem,
  purchasingNavItem,
  managerStockNavItem,
  managerAssetsNavItem,
  adminPeopleNavItem,
  documentsNavItem,
  tenderAiNavItem,
  { key: 'notifications', title: 'Notifications', href: '/dashboard/notifications', icon: Bell },
]

const officeNavItems: NavItem[] = [
  { key: 'dashboard', title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { key: 'clients', title: 'Clients', href: '/dashboard/clients', icon: Building },
  { key: 'suppliers', title: 'Suppliers', href: '/dashboard/suppliers', icon: Truck },
  sitesNavItem,
  officeCallsNavItem,
  { key: 'calendar', title: 'Calendar', href: '/dashboard/calendar', icon: CalendarDays },
  oncallNavItem,
  chatNavItem,
  { key: 'kpis', title: 'KPIs', href: '/dashboard/kpis', icon: Gauge },
  officeServiceManagementNavItem,
  salesNavItem,
  jobsNavItem,
  purchasingNavItem,
  managerStockNavItem,
  managerAssetsNavItem,
  officePeopleNavItem,
  documentsNavItem,
  tenderAiNavItem,
  { key: 'notifications', title: 'Notifications', href: '/dashboard/notifications', icon: Bell },
]

const engineerNavItems: NavItem[] = [
  { key: 'home', title: 'Home', href: '/dashboard', icon: LayoutDashboard, locked: true },
  engineerCallsNavItem,
  { key: 'calendar', title: 'Calendar', href: '/dashboard/calendar', icon: CalendarDays },
  oncallNavItem,
  chatNavItem,
  { key: 'kpis', title: 'KPIs', href: '/dashboard/kpis', icon: Gauge },
  engineerPeopleNavItem,
  engineerStockNavItem,
  engineerAssetsNavItem,
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

// Menu items were regrouped (leave/HR items merged into `people`, RAMS merged
// into `documents`). Older per-user permission arrays stored the pre-grouping
// keys, so we translate them to their new group key on read. This keeps
// existing overrides working without a data migration.
const PERMISSION_KEY_MIGRATION: Record<string, string> = {
  'my-leave': 'people',
  'leave-summary': 'people',
  approvals: 'people',
  training: 'people',
  users: 'people',
  vault: 'people',
  rams: 'documents',
}

export function migratePermissionKeys(keys: string[]): string[] {
  return Array.from(new Set(keys.map((k) => PERMISSION_KEY_MIGRATION[k] ?? k)))
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
  const enabled = new Set(migratePermissionKeys(menuPermissions))
  return menu.filter((item) => item.locked || enabled.has(item.key))
}
