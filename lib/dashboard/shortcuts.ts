import type { LucideIcon } from 'lucide-react'
import {
  CalendarDays,
  Calendar,
  Wrench,
  ClipboardList,
  Building2,
  Users,
  ReceiptText,
  FileText,
  Boxes,
  ShoppingCart,
  BadgeCheck,
  Bell,
  ShieldCheck,
  Clock,
  Plane,
  Radio,
  Hammer,
  BookOpen,
  QrCode,
} from 'lucide-react'
import { getMenuForRole } from '@/lib/config/navigation'
import type { UserRole } from '@/lib/types/database'

// A single user-selectable dashboard quick-shortcut destination. `key` is the
// stable identifier persisted on the profile; `href`/`label`/`icon` drive the UI.
// `section` groups the destination in the picker (undefined = the curated
// top-level "Main" group).
export interface ShortcutDef {
  key: string
  label: string
  href: string
  icon: LucideIcon
  section?: string
}

// The catalogue of destinations a user can pin to one of their 3 shortcut slots.
// Keep keys stable — they are what gets stored in `profiles.dashboard_shortcuts`.
export const SHORTCUT_CATALOGUE: ShortcutDef[] = [
  { key: 'calendar', label: 'Calendar', href: '/dashboard/calendar', icon: CalendarDays },
  { key: 'schedule', label: 'Calls', href: '/dashboard/schedule', icon: Calendar },
  { key: 'service', label: 'Service', href: '/dashboard/service', icon: Wrench },
  { key: 'jobs', label: 'Jobs', href: '/dashboard/jobs', icon: Hammer },
  { key: 'tasks', label: 'Tasks & Forms', href: '/dashboard/my-tasks', icon: ClipboardList },
  { key: 'sites', label: 'Sites', href: '/dashboard/sites', icon: Building2 },
  { key: 'clients', label: 'Clients', href: '/dashboard/clients', icon: Users },
  { key: 'invoices', label: 'Invoices', href: '/dashboard/invoices', icon: ReceiptText },
  { key: 'reports', label: 'Reports', href: '/dashboard/reports', icon: FileText },
  { key: 'stock', label: 'Stock', href: '/dashboard/stock', icon: Boxes },
  { key: 'purchasing', label: 'Purchasing', href: '/dashboard/purchasing', icon: ShoppingCart },
  { key: 'approvals', label: 'Approvals', href: '/dashboard/approvals', icon: BadgeCheck },
  { key: 'notifications', label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { key: 'lone-worker', label: 'Lone Worker', href: '/dashboard/lone-worker', icon: ShieldCheck },
  { key: 'timesheet', label: 'Timesheet', href: '/dashboard/timesheet', icon: Clock },
  { key: 'my-leave', label: 'My Leave', href: '/dashboard/my-leave', icon: Plane },
  { key: 'oncall', label: 'On-call', href: '/dashboard/oncall', icon: Radio },
  { key: 'training', label: 'Training', href: '/dashboard/training', icon: BookOpen },
  { key: 'nearby', label: 'Nearby', href: '/dashboard/nearby', icon: QrCode },
]

// Maximum number of quick-shortcut slots a user can pin.
export const MAX_SHORTCUTS = 6

// Maximum number of micro-icon shortcuts a user can pin to the main header.
export const MAX_HEADER_SHORTCUTS = 8

// Roles whose menus we harvest for selectable sub-menu destinations. Combining
// every role's menu gives one comprehensive, role-agnostic catalogue (the same
// shortcut list is offered to all users, matching the curated list's behaviour).
const HARVEST_ROLES: UserRole[] = ['admin', 'office', 'engineer', 'subcontractor']

// Walk every role's navigation tree and collect each sub-menu leaf page as a
// selectable shortcut, keyed by its href (hrefs are stable + unique). Anything
// already present in the curated top-level catalogue is skipped so we don't show
// duplicate destinations. Grouped under their top-level section title.
function buildSubmenuShortcuts(): ShortcutDef[] {
  const out: ShortcutDef[] = []
  const seen = new Set<string>(SHORTCUT_CATALOGUE.map((s) => s.href))
  const add = (
    href: string | undefined,
    label: string,
    icon: LucideIcon,
    section: string,
  ) => {
    if (!href || seen.has(href)) return
    seen.add(href)
    out.push({ key: href, href, label, icon, section })
  }
  for (const role of HARVEST_ROLES) {
    for (const item of getMenuForRole(role)) {
      if (!item.children?.length) continue
      const section = item.title
      for (const child of item.children) {
        if (child.children?.length) {
          for (const sub of child.children) add(sub.href, sub.title, sub.icon, section)
        } else {
          add(child.href, child.title, child.icon, section)
        }
      }
    }
  }
  return out
}

const SUBMENU_SHORTCUTS = buildSubmenuShortcuts()

// The full flat catalogue: curated top-level destinations followed by every
// sub-menu page. Used for key resolution (persistence stores keys from here).
export const ALL_SHORTCUTS: ShortcutDef[] = [...SHORTCUT_CATALOGUE, ...SUBMENU_SHORTCUTS]

// A section of selectable shortcuts, for grouped rendering in the pickers.
export interface ShortcutGroup {
  section: string
  items: ShortcutDef[]
}

// The catalogue grouped by section for the pickers: the curated set first (as
// "Main"), then each navigation group with its sub-pages, in menu order.
export const SHORTCUT_GROUPS: ShortcutGroup[] = (() => {
  const groups = new Map<string, ShortcutDef[]>()
  const order: string[] = []
  const push = (section: string, def: ShortcutDef) => {
    if (!groups.has(section)) {
      groups.set(section, [])
      order.push(section)
    }
    groups.get(section)!.push(def)
  }
  for (const s of SHORTCUT_CATALOGUE) push(s.section ?? 'Main', s)
  for (const s of SUBMENU_SHORTCUTS) push(s.section ?? 'More', s)
  return order.map((section) => ({ section, items: groups.get(section)! }))
})()

const BY_KEY = new Map(ALL_SHORTCUTS.map((s) => [s.key, s]))

export function resolveShortcut(key: string | null | undefined): ShortcutDef | null {
  if (!key) return null
  return BY_KEY.get(key) ?? null
}

// Normalise stored header shortcut keys to a compact, valid list (no padding):
// drops unknown keys + duplicates, preserves order, caps at MAX_HEADER_SHORTCUTS.
export function normaliseHeaderShortcutKeys(stored: string[] | null | undefined): string[] {
  const seen = new Set<string>()
  const clean: string[] = []
  for (const k of stored ?? []) {
    if (clean.length >= MAX_HEADER_SHORTCUTS) break
    if (typeof k !== 'string' || seen.has(k) || !BY_KEY.has(k)) continue
    seen.add(k)
    clean.push(k)
  }
  return clean
}

// Resolve stored header shortcut keys to their catalogue definitions, in order.
export function resolveHeaderShortcuts(stored: string[] | null | undefined): ShortcutDef[] {
  return normaliseHeaderShortcutKeys(stored)
    .map((k) => BY_KEY.get(k))
    .filter((s): s is ShortcutDef => !!s)
}

// Normalise a stored shortcut array to exactly MAX_SHORTCUTS slots (padded with
// nulls), dropping unknown keys and duplicates while preserving order.
export function normaliseShortcuts(stored: string[] | null | undefined): (string | null)[] {
  const seen = new Set<string>()
  const clean: (string | null)[] = []
  for (const k of stored ?? []) {
    if (clean.length >= MAX_SHORTCUTS) break
    if (typeof k !== 'string' || seen.has(k) || !BY_KEY.has(k)) continue
    seen.add(k)
    clean.push(k)
  }
  while (clean.length < MAX_SHORTCUTS) clean.push(null)
  return clean
}
