import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface ComingSoonProps {
  icon: LucideIcon
  title: string
  description: string
  bullets?: string[]
}

// Lightweight placeholder for planned Tender AI modules. Keeps the nav complete
// and communicates intent without shipping half-built features.
export function ComingSoon({ icon: Icon, title, description, bullets }: ComingSoonProps) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-muted">
          <Icon className="size-7 text-muted-foreground" />
        </div>
        <div className="max-w-md">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">{description}</p>
        </div>
        {bullets && bullets.length > 0 && (
          <ul className="flex flex-col gap-1.5 text-left text-sm text-muted-foreground">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                {b}
              </li>
            ))}
          </ul>
        )}
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          Coming soon
        </span>
      </CardContent>
    </Card>
  )
}
