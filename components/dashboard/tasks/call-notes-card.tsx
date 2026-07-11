import { StickyNote } from 'lucide-react'

interface CallNotesCardProps {
  notes: string | null
}

/**
 * Shows the description / logging notes captured when the call was logged.
 * Rendered prominently near the top of the call for everyone (engineers,
 * office and admin) so the reason for the visit is never hidden.
 */
export function CallNotesCard({ notes }: CallNotesCardProps) {
  const text = notes?.trim()
  if (!text) return null

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center gap-2">
        <StickyNote className="h-4 w-4 shrink-0 text-primary" />
        <p className="text-sm font-semibold text-foreground">Call notes</p>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</p>
    </div>
  )
}
