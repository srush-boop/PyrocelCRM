'use client'

import {
  ClipboardCheck,
  ClipboardList,
  MessageSquareText,
  Inbox,
  Bell,
  CircleDot,
  type LucideIcon,
} from 'lucide-react'

// Maps the string icon names emitted by the aggregation engine (which runs on
// the server and cannot ship component references) to lucide components.
const MAP: Record<string, LucideIcon> = {
  ClipboardCheck,
  ClipboardList,
  MessageSquareText,
  Inbox,
  Bell,
}

export function BucketIcon({ name, className }: { name: string; className?: string }) {
  const Icon = MAP[name] ?? CircleDot
  return <Icon className={className} />
}
