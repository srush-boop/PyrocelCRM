'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Pencil } from 'lucide-react'
import { EditSiteDialog } from './edit-site-dialog'
import type { Site, Route, Client } from '@/lib/types/database'

interface EditSiteButtonProps {
  site: Site & { route: Route | null; client?: Client | null }
  clients: Client[]
}

export function EditSiteButton({ site, clients }: EditSiteButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" />
        Edit Site
      </Button>
      <EditSiteDialog site={site} clients={clients} open={open} onOpenChange={setOpen} />
    </>
  )
}
