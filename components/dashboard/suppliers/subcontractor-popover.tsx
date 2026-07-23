'use client'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Mail, Phone, Globe, MapPin, Hash, HardHat } from 'lucide-react'
import type { Supplier } from '@/lib/types/database'
import { cn } from '@/lib/utils'

/**
 * Renders a sub-contractor's name as an inline trigger that opens a small
 * popover card of their contact details — used in the site service overview so
 * staff can check who is doing the work without navigating away from the page.
 *
 * The trigger is a plain button (keyboard accessible) styled like a link. The
 * popover surfaces the key contact channels (email/phone are click-to-action),
 * the address, account number and the services they provide.
 */
export function SubcontractorPopover({
  supplier,
  className,
}: {
  supplier: Supplier
  className?: string
}) {
  const rows: { icon: typeof Mail; label: string; node: React.ReactNode }[] = []

  if (supplier.contact_email) {
    rows.push({
      icon: Mail,
      label: 'Email',
      node: (
        <a
          href={`mailto:${supplier.contact_email}`}
          className="text-primary hover:underline"
        >
          {supplier.contact_email}
        </a>
      ),
    })
  }
  if (supplier.contact_phone) {
    rows.push({
      icon: Phone,
      label: 'Phone',
      node: (
        <a href={`tel:${supplier.contact_phone}`} className="text-primary hover:underline">
          {supplier.contact_phone}
        </a>
      ),
    })
  }
  if (supplier.website) {
    const href = supplier.website.startsWith('http')
      ? supplier.website
      : `https://${supplier.website}`
    rows.push({
      icon: Globe,
      label: 'Website',
      node: (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate text-primary hover:underline"
        >
          {supplier.website}
        </a>
      ),
    })
  }
  if (supplier.address) {
    rows.push({ icon: MapPin, label: 'Address', node: <span>{supplier.address}</span> })
  }
  if (supplier.account_number) {
    rows.push({
      icon: Hash,
      label: 'Account',
      node: <span className="tabular-nums">{supplier.account_number}</span>,
    })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'font-medium text-primary underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none',
            className,
          )}
          title={`View ${supplier.name} details`}
        >
          {supplier.name}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="flex items-start gap-2 border-b px-4 py-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
            <HardHat className="h-4 w-4 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">{supplier.name}</p>
            <p className="text-xs text-muted-foreground">
              Sub-contractor
              {supplier.contact_name ? ` · ${supplier.contact_name}` : ''}
            </p>
          </div>
        </div>

        <div className="px-4 py-3">
          {rows.length > 0 ? (
            <dl className="space-y-2 text-xs">
              {rows.map((row) => (
                <div key={row.label} className="flex items-start gap-2">
                  <row.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <dd className="min-w-0 break-words">{row.node}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-xs text-muted-foreground">No contact details on file.</p>
          )}

          {supplier.provided_services && supplier.provided_services.length > 0 && (
            <div className="mt-3 border-t pt-3">
              <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                Provides
              </p>
              <div className="flex flex-wrap gap-1">
                {supplier.provided_services.map((s) => (
                  <Badge key={s.id} variant="secondary" className="text-[10px] font-normal">
                    {s.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
