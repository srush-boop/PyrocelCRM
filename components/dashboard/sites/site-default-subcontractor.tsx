'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { HardHat, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Supplier } from '@/lib/types/database'

const NONE_VALUE = '__none__'

interface SiteDefaultSubcontractorProps {
  siteId: string
  defaultSubcontractorId: string | null
  subcontractors: Supplier[]
}

export function SiteDefaultSubcontractor({
  siteId,
  defaultSubcontractorId,
  subcontractors,
}: SiteDefaultSubcontractorProps) {
  const [value, setValue] = useState(defaultSubcontractorId ?? NONE_VALUE)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleChange = async (next: string) => {
    setValue(next)
    setSaving(true)
    const { error } = await supabase
      .from('sites')
      .update({ default_subcontractor_id: next === NONE_VALUE ? null : next })
      .eq('id', siteId)
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Default sub-contractor updated')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HardHat className="h-4 w-4" />
          Default sub-contractor
        </CardTitle>
        <CardDescription>
          Sub-contracted services at this site default to this party unless a system or the
          service itself overrides it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid max-w-sm gap-2">
          <Label htmlFor="site-default-sub" className="sr-only">
            Default sub-contractor
          </Label>
          <div className="flex items-center gap-2">
            <Select value={value} onValueChange={handleChange} disabled={saving}>
              <SelectTrigger id="site-default-sub">
                <SelectValue placeholder="No default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>No default</SelectItem>
                {subcontractors.map((sub) => (
                  <SelectItem key={sub.id} value={sub.id}>
                    {sub.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
