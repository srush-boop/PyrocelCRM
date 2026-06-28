import Link from 'next/link'
import { ChevronRight, ExternalLink, Vault } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { getVaultIcon } from '@/lib/vault-icons'
import type { VaultSection } from '@/lib/types/database'

interface VaultGridProps {
  sections: VaultSection[]
  isAdmin: boolean
}

export function VaultGrid({ sections, isAdmin }: VaultGridProps) {
  const populated = sections.filter((s) => (s.buttons?.length ?? 0) > 0 || isAdmin)

  if (populated.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Vault className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">Nothing here yet</p>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? 'Use Configure to add sections and buttons for your team.'
              : 'Your administrator has not added any items yet.'}
          </p>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-8">
      {populated.map((section) => (
        <details
          key={section.id}
          className="group rounded-lg border bg-card [&[open]>summary_.vault-chevron]:rotate-90"
        >
          <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="vault-chevron h-4 w-4 shrink-0 text-muted-foreground transition-transform" />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-tight">{section.title}</h2>
              {section.description && (
                <p className="text-sm text-muted-foreground text-pretty">
                  {section.description}
                </p>
              )}
            </div>
          </summary>

          <div className="border-t p-4">
            {section.buttons && section.buttons.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.buttons.map((button) => {
                const Icon = getVaultIcon(button.icon)
                return (
                  <Link
                    key={button.id}
                    href={button.url}
                    target={button.open_in_new_tab ? '_blank' : undefined}
                    rel={button.open_in_new_tab ? 'noopener noreferrer' : undefined}
                    className="group flex items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary hover:bg-accent"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium leading-tight">{button.label}</span>
                        {button.open_in_new_tab && (
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        )}
                      </div>
                      {button.description && (
                        <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2 text-pretty">
                          {button.description}
                        </p>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No buttons in this section yet.
            </p>
            )}
          </div>
        </details>
      ))}
    </div>
  )
}
