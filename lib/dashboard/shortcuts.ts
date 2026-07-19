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

// A single user-selectable dashboard quick-shortcut destination. `key` is the
// stable identifier persisted on the profile; `href`/`label`/`icon` drive the UI.
export interface ShortcutDef {
  key: string
  label: string
  href: string
  icon: LucideIcon
}

// The catalogue of destinations a user can pin to one of their 3 shortcut slots.
// Keep keys stable — they are what gets stored in `profiles.dashboard_shortcuts`.
export const SHORTCUT_CATALOGUE: ShortcutDef[] = [
  { key: 'calendar', label: 'Calendar', href: '/dashboard/calendar', icon: CalendarDays },
  { key: 'schedule', label: 'Calls', href: '/dashboard/schedule', icon: Calendar },
  { key: 'service', label: 'Service', href: '/dashboard/service', icon: Wrench },
  { key: 'jobs', label: 'Jobs', href: '/dashboard/jobs', icon: Hammer },
  { key: 'tasks', label: 'Tasks', href: '/dashboard/tasks', icon: ClipboardList },
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

const BY_KEY = new Map(SHORTCUT_CATALOGUE.map((s) => [s.key, s]))

export function resolveShortcut(key: string | null | undefined): ShortcutDef | null {
  if (!key) return null
  return BY_KEY.get(key) ?? null
}

// Normalise a stored shortcut array to exactly 3 slots (padded with nulls),
// dropping unknown keys and duplicates while preserving order.
export function normaliseShortcuts(stored: string[] | null | undefined): (string | null)[] {
  const seen = new Set<string>()
  const clean: (string | null)[] = []
  for (const k of stored ?? []) {
    if (clean.length >= 3) break
    if (typeof k !== 'string' || seen.has(k) || !BY_KEY.has(k)) continue
    seen.add(k)
    clean.push(k)
  }
  while (clean.length < 3) clean.push(null)
  return clean
}
