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
  Clock,
  CalendarCheck,
  CalendarClock,
  TrendingUp,
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
  Briefcase,
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

// "Your Tasks" — recurring internal quality/management tasks (toolbox talks,
// vehicle checks, nominations). Available to every user, including external
// sub-contractors, so it is locked (can never be permission-toggled off).
const myTasksNavItem: NavItem = {
  key: 'my-tasks',
  title: 'Your Tasks',
  href: '/dashboard/my-tasks',
  icon: ClipboardCheck,
  locked: true,
}

// "Timesheet" — weekly (Sun week-ending) timesheet. Only meaningful for users
// with timesheet_required (resolved per-user/role); the page hard-gates access,
// so the link is safe to show to internal field + office/admin roles.
const timesheetNavItem: NavItem = {
  key: 'timesheet',
  title: 'Timesheet',
  href: '/dashboard/timesheet',
  icon: Clock,
  locked: true,
}

// Service is a clickable group: clicking it opens the Service Dashboard and
// expands its children (Service Dashboard, All Calls, Map, Transfers, Defects).
// Completed calls/reports now live on the All Calls → Completed tab. The `key`
// stays `calls` so existing per-user permissions still map.
// Service Management is now a nested sub-menu that sits at the BOTTOM of the
// Service group (mirrors the Sales → Configure pattern). Routes lives here.
const adminServiceManagementChild: NavChild = {
  title: 'Service Management',
  icon: SlidersHorizontal,
  children: [
    { title: 'Areas', href: '/dashboard/areas', icon: MapPinned },
    { title: 'Routes', href: '/dashboard/routes', icon: Route },
    { title: 'Service Types', href: '/dashboard/service-types', icon: Wrench },
    { title: 'System Types', href: '/dashboard/sales/system-types', icon: Layers },
    { title: 'Checklists', href: '/dashboard/checklists', icon: ClipboardList },
    { title: 'Client Logins', href: '/dashboard/client-logins', icon: KeyRound },
  ],
}

const officeServiceManagementChild: NavChild = {
  title: 'Service Management',
  icon: SlidersHorizontal,
  children: [
    { title: 'Areas', href: '/dashboard/areas', icon: MapPinned },
    { title: 'Routes', href: '/dashboard/routes', icon: Route },
    { title: 'System Types', href: '/dashboard/sales/system-types', icon: Layers },
  ],
}

const adminCallsNavItem: NavItem = {
  key: 'calls',
  title: 'Service',
  href: '/dashboard/service',
  icon: Wrench,
  children: [
    { title: 'Service Dashboard', href: '/dashboard/service', icon: LayoutDashboard },
    { title: 'CDO Management', href: '/dashboard/cdo', icon: ClipboardCheck },
    { title: 'All Calls', href: '/dashboard/schedule', icon: Calendar },
    { title: 'Map', href: '/dashboard/schedule/map', icon: MapPinned },
    { title: 'Transfers', href: '/dashboard/transfers', icon: ArrowLeftRight },
    { title: 'On-call', href: '/dashboard/oncall', icon: LifeBuoy },
    { title: 'Lone Worker', href: '/dashboard/lone-worker', icon: ShieldCheck },
    { title: 'Chargeable Calls', href: '/dashboard/chargeable', icon: Coins },
    { title: 'Follow-ups', href: '/dashboard/follow-ups', icon: Wrench },
    { title: 'Defects', href: '/dashboard/defects', icon: AlertTriangle },
    { title: 'KPIs', href: '/dashboard/kpis', icon: Gauge },
    adminServiceManagementChild,
  ],
}

const officeCallsNavItem: NavItem = {
  key: 'calls',
  title: 'Service',
  href: '/dashboard/service',
  icon: Wrench,
  children: [
    { title: 'Service Dashboard', href: '/dashboard/service', icon: LayoutDashboard },
    { title: 'CDO Management', href: '/dashboard/cdo', icon: ClipboardCheck },
    { title: 'All Calls', href: '/dashboard/schedule', icon: Calendar },
    { title: 'Map', href: '/dashboard/schedule/map', icon: MapPinned },
    { title: 'Transfers', href: '/dashboard/transfers', icon: ArrowLeftRight },
    { title: 'On-call', href: '/dashboard/oncall', icon: LifeBuoy },
    { title: 'Lone Worker', href: '/dashboard/lone-worker', icon: ShieldCheck },
    { title: 'Chargeable Calls', href: '/dashboard/chargeable', icon: Coins },
    { title: 'Follow-ups', href: '/dashboard/follow-ups', icon: Wrench },
    { title: 'Defects', href: '/dashboard/defects', icon: AlertTriangle },
    { title: 'KPIs', href: '/dashboard/kpis', icon: Gauge },
    officeServiceManagementChild,
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
    { title: 'On-call', href: '/dashboard/oncall', icon: LifeBuoy },
    { title: 'KPIs', href: '/dashboard/kpis', icon: Gauge },
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

// Invoicing: promoted out of the Service group into its own top-level clickable
// group. The trigger opens the invoices list and reveals Renewals and Projected
// Revenue. Shared by admin and office.
const invoicingNavItem: NavItem = {
  key: 'invoices',
  title: 'Invoicing',
  href: '/dashboard/invoices',
  icon: ReceiptText,
  children: [
    { title: 'Invoices', href: '/dashboard/invoices', icon: ReceiptText },
    { title: 'Renewals', href: '/dashboard/invoices/renewals', icon: CalendarClock },
    { title: 'Projected Revenue', href: '/dashboard/invoices/projected-revenue', icon: TrendingUp },
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

// Purchasing: purchase orders raised against jobs. A clickable group opening the
// purchasing dashboard and revealing Suppliers (the supplier directory now lives
// here rather than as a separate top-level item).
const purchasingNavItem: NavItem = {
  key: 'purchasing',
  title: 'Purchasing',
  href: '/dashboard/purchasing',
  icon: ShoppingCart,
  children: [
    { title: 'Purchase Orders', href: '/dashboard/purchasing', icon: ShoppingCart },
    { title: 'Suppliers', href: '/dashboard/suppliers', icon: Truck },
  ],
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

// People: consolidates staff/HR concerns into one group. Users now lives in the
// Company group (which carries the lockout protection instead).
const adminPeopleNavItem: NavItem = {
  key: 'people',
  title: 'People',
  icon: Users,
  children: [
    { title: 'Approvals', href: '/dashboard/approvals', icon: ClipboardCheck },
    { title: 'Timesheets', href: '/dashboard/timesheet/review', icon: Clock },
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
    { title: 'Timesheets', href: '/dashboard/timesheet/review', icon: Clock },
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
// Managers (admin/office) get the full register via the Company group (see
// `companyAssetsChild`); engineers get a simple link showing only their assets.
const engineerAssetsNavItem: NavItem = {
  key: 'assets',
  title: 'My Assets',
  href: '/dashboard/assets',
  icon: Package,
}

// Assets as a nested sub-menu (used inside the Company group for managers): the
// full register plus a QR label print sheet.
const companyAssetsChild: NavChild = {
  title: 'Assets',
  icon: Package,
  children: [
    { title: 'Register', href: '/dashboard/assets', icon: Package },
    { title: 'Print QR Labels', href: '/dashboard/assets/labels', icon: QrCode },
  ],
}

// Company: internal company administration. Groups Users, the Assets register and
// Notifications. The admin variant includes Users and is `locked` so an admin can
// never hide their own access to user/menu management and lock everyone out.
const adminCompanyNavItem: NavItem = {
  key: 'company',
  title: 'Company',
  icon: Briefcase,
  locked: true,
  children: [
    { title: 'Users', href: '/dashboard/engineers', icon: Users },
    companyAssetsChild,
    { title: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  ],
}

const officeCompanyNavItem: NavItem = {
  key: 'company',
  title: 'Company',
  icon: Briefcase,
  children: [
    companyAssetsChild,
    { title: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  ],
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
  // Requests inbox hidden for all users while the AI triage flow is paused.
  // { key: 'requests', title: 'Requests', href: '/dashboard/requests', icon: Inbox },
  { key: 'clients', title: 'Clients', href: '/dashboard/clients', icon: Building },
  sitesNavItem,
  adminCallsNavItem,
  { key: 'calendar', title: 'Calendar', href: '/dashboard/calendar', icon: CalendarDays },
  myTasksNavItem,
  timesheetNavItem,
  chatNavItem,
  salesNavItem,
  jobsNavItem,
  invoicingNavItem,
  purchasingNavItem,
  managerStockNavItem,
  adminPeopleNavItem,
  documentsNavItem,
  tenderAiNavItem,
  adminCompanyNavItem,
]

const officeNavItems: NavItem[] = [
  { key: 'dashboard', title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  // Requests inbox hidden for all users while the AI triage flow is paused.
  // { key: 'requests', title: 'Requests', href: '/dashboard/requests', icon: Inbox },
  { key: 'clients', title: 'Clients', href: '/dashboard/clients', icon: Building },
  sitesNavItem,
  officeCallsNavItem,
  { key: 'calendar', title: 'Calendar', href: '/dashboard/calendar', icon: CalendarDays },
  myTasksNavItem,
  timesheetNavItem,
  chatNavItem,
  salesNavItem,
  jobsNavItem,
  invoicingNavItem,
  purchasingNavItem,
  managerStockNavItem,
  officePeopleNavItem,
  documentsNavItem,
  tenderAiNavItem,
  officeCompanyNavItem,
]

const engineerNavItems: NavItem[] = [
  { key: 'home', title: 'Home', href: '/dashboard', icon: LayoutDashboard, locked: true },
  engineerCallsNavItem,
  { key: 'calendar', title: 'Calendar', href: '/dashboard/calendar', icon: CalendarDays },
  myTasksNavItem,
  timesheetNavItem,
  chatNavItem,
  engineerPeopleNavItem,
  engineerStockNavItem,
  engineerAssetsNavItem,
]

// Sub-contractors are external workers. They only ever see the calls allocated
// to them plus the ability to pick up / book nearby calls — nothing internal
// (no chat, people, stock, assets, calendar, reports, KPIs, etc.). Their Service
// group opens straight to their Calls list. Every item is locked so it can never
// be permission-toggled into exposing more of the app.
const subcontractorCallsNavItem: NavItem = {
  key: 'calls',
  title: 'Calls',
  href: '/dashboard/schedule',
  icon: Wrench,
  locked: true,
  children: [
    { title: 'My Calls', href: '/dashboard/schedule', icon: Calendar },
    { title: 'Nearby Calls', href: '/dashboard/nearby', icon: Navigation },
  ],
}

const subcontractorNavItems: NavItem[] = [
  { key: 'home', title: 'Home', href: '/dashboard', icon: LayoutDashboard, locked: true },
  subcontractorCallsNavItem,
  myTasksNavItem,
]

// Returns the full default top-level menu for a role (before applying any
// per-user permission overrides).
export function getMenuForRole(role: UserRole): NavItem[] {
  switch (role) {
    case 'admin':
      return adminNavItems
    case 'office':
      return officeNavItems
    case 'subcontractor':
      return subcontractorNavItems
    default:
      return engineerNavItems
  }
}

// Collects every leaf page href beneath a top-level group's children,
// recursing through nested sub-menus (e.g. Sales → Configure). Used for
// page-level (granular) permissioning where each page is keyed by its href.
export function collectChildHrefs(item: NavItem): string[] {
  const out: string[] = []
  const walk = (children?: NavChild[]) => {
    if (!children) return
    for (const child of children) {
      if (child.children && child.children.length) {
        for (const sub of child.children) if (sub.href) out.push(sub.href)
      } else if (child.href) {
        out.push(child.href)
      }
    }
  }
  walk(item.children)
  return out
}

// Every toggleable identifier for a role: leaf top-level items are keyed by
// their `key`; grouped items contribute their `key` plus every descendant page
// href. This is the full "everything on" set used for role defaults.
export function getAllMenuIdentifiers(role: UserRole): string[] {
  const ids: string[] = []
  for (const item of getMenuForRole(role)) {
    if (item.children && item.children.length) {
      ids.push(item.key, ...collectChildHrefs(item))
    } else {
      ids.push(item.key)
    }
  }
  return Array.from(new Set(ids))
}

// The default set of enabled identifiers for a role (all groups + all pages).
export function getDefaultMenuKeys(role: UserRole): string[] {
  return getAllMenuIdentifiers(role)
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
  vault: 'people',
  rams: 'documents',
  // Service Management is now nested inside the Service group, so it follows the
  // `calls` permission rather than being individually toggleable.
  'service-management': 'calls',
  // KPIs moved into the Service group.
  kpis: 'calls',
  // On-call moved into the Service group.
  oncall: 'calls',
  // Suppliers moved into the Purchasing group.
  suppliers: 'purchasing',
  // Users, Assets and Notifications moved into the new Company group.
  users: 'company',
  assets: 'company',
  notifications: 'company',
}

export function migratePermissionKeys(keys: string[]): string[] {
  return Array.from(new Set(keys.map((k) => PERMISSION_KEY_MIGRATION[k] ?? k)))
}

// Resolves a per-user permission override into the concrete set of enabled
// identifiers (top-level keys + individual page hrefs). Shared by the sidebar
// resolver and the Menu Access configurator so both agree exactly.
//
// Backward compatibility: older overrides stored ONLY top-level group keys
// (e.g. `calls`, `sales`). When a group key is enabled but the override carries
// no explicit page hrefs for that group, every page in the group is granted —
// so nobody loses access when the model becomes page-level. New overrides that
// list specific page hrefs are respected exactly.
export function resolveEnabledSet(
  role: UserRole,
  menuPermissions: string[] | null | undefined,
): Set<string> {
  if (!menuPermissions) return new Set(getAllMenuIdentifiers(role))

  const menu = getMenuForRole(role)
  const enabled = new Set(migratePermissionKeys(menuPermissions))
  // Requests/Invoicing were promoted out of the Service (`calls`) group into
  // top-level items; existing overrides only stored `calls`, so inherit from it.
  if (enabled.has('calls')) {
    enabled.add('requests')
    enabled.add('invoices')
  }

  for (const item of menu) {
    if (!(item.children && item.children.length)) {
      if (item.locked) enabled.add(item.key)
      continue
    }
    const hrefs = collectChildHrefs(item)
    const hasAnyHref = hrefs.some((h) => enabled.has(h))
    // Legacy group-level override (group on, no page hrefs) OR a locked group
    // → grant every page in the group.
    if ((item.locked || enabled.has(item.key)) && !hasAnyHref) {
      for (const h of hrefs) enabled.add(h)
    }
    if (item.locked) enabled.add(item.key)
  }
  return enabled
}

// Applies a per-user permission override to a role's menu, filtering BOTH the
// top-level groups and the individual pages inside them. `menuPermissions` is
// either null/undefined (use role defaults = show everything) or an array of
// enabled identifiers. A group stays visible as long as at least one of its
// pages is enabled; only unchecked pages disappear. Locked items are always
// kept in full regardless of the override.
export function getVisibleMenu(
  role: UserRole,
  menuPermissions: string[] | null | undefined,
): NavItem[] {
  const menu = getMenuForRole(role)
  if (!menuPermissions) return menu
  const enabled = resolveEnabledSet(role, menuPermissions)

  const filterChildren = (children: NavChild[]): NavChild[] =>
    children.reduce<NavChild[]>((acc, child) => {
      if (child.children && child.children.length) {
        const subs = child.children.filter((sub) => enabled.has(sub.href))
        if (subs.length) acc.push({ ...child, children: subs })
      } else if (child.href && enabled.has(child.href)) {
        acc.push(child)
      }
      return acc
    }, [])

  const result: NavItem[] = []
  for (const item of menu) {
    if (item.children && item.children.length) {
      // Locked groups are always shown in full (prevents lockout).
      if (item.locked) {
        result.push(item)
        continue
      }
      const children = filterChildren(item.children)
      if (children.length) result.push({ ...item, children })
    } else if (item.locked || enabled.has(item.key)) {
      result.push(item)
    }
  }
  return result
}
