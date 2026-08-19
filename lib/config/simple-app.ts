import type { LucideIcon } from 'lucide-react'
import {
  CalendarDays,
  ClipboardCheck,
  CheckCircle2,
  Bell,
  CalendarClock,
  MessageSquare,
} from 'lucide-react'
import type { UserRole } from '@/lib/types/database'
import { resolveEnabledSet } from '@/lib/config/navigation'

// The simplified "on-the-go" app is a device-aware MODE, not a separate app.
// It surfaces a small, tap-friendly subset of the product for non-engineer
// staff on phone/tablet. Which of these sections a given user actually sees is
// driven entirely by their existing per-user Menu Access (`menu_permissions`),
// so there is no separate configuration surface to maintain.

export type SimpleSectionKey =
  | 'calendar'
  | 'tasks'
  | 'approvals'
  | 'notifications'
  | 'leave'
  | 'chat'

export interface SimpleSection {
  key: SimpleSectionKey
  title: string
  /** One-word label used on the compact bottom nav. */
  shortTitle: string
  href: string
  icon: LucideIcon
  /**
   * The identifier checked against the user's resolved Menu Access set. Leaf
   * top-level items are keyed by their menu `key` (e.g. `calendar`, `chat`,
   * `my-tasks`); pages nested inside a group are keyed by their href.
   */
  permissionId: string
}

// Order here is the order tiles and nav items appear in.
export const SIMPLE_SECTIONS: SimpleSection[] = [
  {
    key: 'calendar',
    title: 'Calendar',
    shortTitle: 'Calendar',
    href: '/dashboard/calendar',
    icon: CalendarDays,
    permissionId: 'calendar',
  },
  {
    key: 'tasks',
    title: 'Tasks & Forms',
    shortTitle: 'Tasks',
    href: '/dashboard/my-tasks',
    icon: ClipboardCheck,
    permissionId: 'my-tasks',
  },
  {
    key: 'approvals',
    title: 'Approvals',
    shortTitle: 'Approvals',
    href: '/dashboard/approvals',
    icon: CheckCircle2,
    permissionId: '/dashboard/approvals',
  },
  {
    key: 'notifications',
    title: 'Reminders',
    shortTitle: 'Alerts',
    href: '/dashboard/notifications',
    icon: Bell,
    permissionId: '/dashboard/notifications',
  },
  {
    key: 'leave',
    title: 'My Leave',
    shortTitle: 'Leave',
    href: '/dashboard/my-leave',
    icon: CalendarClock,
    permissionId: '/dashboard/my-leave',
  },
  {
    key: 'chat',
    title: 'Chat',
    shortTitle: 'Chat',
    href: '/dashboard/chat',
    icon: MessageSquare,
    permissionId: 'chat',
  },
]

/** Only non-engineer office staff get Simple Mode; field roles keep their own UI. */
export function isSimpleEligibleRole(role: UserRole): boolean {
  return role === 'admin' || role === 'office'
}

/**
 * The Simple-Mode sections this user can see, = the six capable sections
 * intersected with their resolved Menu Access. Preserves SIMPLE_SECTIONS order.
 */
export function getSimpleSectionsForUser(
  role: UserRole,
  menuPermissions: string[] | null | undefined,
): SimpleSection[] {
  if (!isSimpleEligibleRole(role)) return []
  const enabled = resolveEnabledSet(role, menuPermissions)
  return SIMPLE_SECTIONS.filter((s) => enabled.has(s.permissionId))
}

/** True when the user is eligible AND has at least one visible Simple section. */
export function isSimpleCapable(
  role: UserRole,
  menuPermissions: string[] | null | undefined,
): boolean {
  return getSimpleSectionsForUser(role, menuPermissions).length > 0
}
