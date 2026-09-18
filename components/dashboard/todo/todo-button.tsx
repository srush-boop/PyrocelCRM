'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ListChecks } from 'lucide-react'
import { useTodo } from './use-todo'
import { TodoPanel } from './todo-panel'

// Header entry point for the To-Do feature: a button with a live "waiting on
// you" badge that opens the slide-over panel.
export function TodoButton() {
  const [open, setOpen] = useState(false)
  const { data } = useTodo()
  // Badge counts ONLY the user's own open, NOTABLE to-dos. The "waiting on you"
  // aggregation is notification-style and is surfaced by the bell, so it is
  // intentionally excluded here. Items marked as not notable are quiet reminders
  // the user deliberately kept out of the tally.
  const total = (data?.items ?? []).filter(
    (i) => !i.parent_id && i.status !== 'done' && i.notable !== false,
  ).length

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant={total > 0 ? 'default' : 'outline'}
        size="sm"
        onClick={() => setOpen(true)}
        className="relative gap-2 font-semibold shadow-sm"
        aria-label={`To-Do${total > 0 ? `, ${total} needing attention` : ''}`}
      >
        <ListChecks className="h-5 w-5" />
        <span className="hidden sm:inline">To-Do</span>
        {total > 0 && (
          <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-background px-1.5 text-xs font-bold text-foreground shadow-sm">
            {total > 99 ? '99+' : total}
          </span>
        )}
        {total > 0 && (
          <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
          </span>
        )}
      </Button>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            To-Do
          </SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1">
          <TodoPanel onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
