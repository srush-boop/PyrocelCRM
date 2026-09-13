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
  const total = data?.totalWaiting ?? 0

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="relative gap-2 text-muted-foreground hover:text-foreground"
        aria-label={`To-Do${total > 0 ? `, ${total} waiting on you` : ''}`}
      >
        <ListChecks className="h-5 w-5" />
        <span className="hidden lg:inline">To-Do</span>
        {total > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {total > 99 ? '99+' : total}
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
