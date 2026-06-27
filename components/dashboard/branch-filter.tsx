'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Building2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import type { Branch } from '@/lib/types/database'
import { ALL_BRANCHES } from '@/lib/branch-constants'

interface BranchFilterProps {
  branches: Branch[]
  // The currently active branch id, or null when showing all branches.
  activeBranchId: string | null
  // Hide the control entirely (e.g. for users who can't switch). Defaults to
  // rendering nothing when there's only the locked branch.
  className?: string
}

/**
 * A URL-driven branch selector for admin/office users. Writes the chosen
 * branch to the `branch` search param, which server components read via
 * `getBranchScope`. Renders nothing when there are no branches to choose from.
 */
export function BranchFilter({ branches, activeBranchId, className }: BranchFilterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  if (branches.length === 0) return null

  const value = activeBranchId ?? ALL_BRANCHES

  const handleChange = (next: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next === ALL_BRANCHES) {
      params.set('branch', ALL_BRANCHES)
    } else {
      params.set('branch', next)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className={className}>
      <Label htmlFor="branch-filter" className="sr-only">
        Filter by branch
      </Label>
      <Select value={value} onValueChange={handleChange}>
        <SelectTrigger id="branch-filter" className="w-[180px]">
          <Building2 className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="All branches" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_BRANCHES}>All branches</SelectItem>
          {branches.map((branch) => (
            <SelectItem key={branch.id} value={branch.id}>
              {branch.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
