import { ListChecks } from 'lucide-react'
import { TodoBoard } from '@/components/dashboard/todo/todo-board'

export const metadata = {
  title: 'To-Do | PyrocelCRM',
}

export default function TodoPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <ListChecks className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">To-Do</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Everything waiting on you, plus your own reminders, lists and tasks.
        </p>
      </header>
      <TodoBoard />
    </div>
  )
}
