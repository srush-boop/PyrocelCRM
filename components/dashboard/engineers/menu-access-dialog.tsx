'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Loader2, RotateCcw, Lock } from 'lucide-react'
import type { Profile } from '@/lib/types/database'
import { getMenuForRole, getDefaultMenuKeys } from '@/lib/config/navigation'

interface MenuAccessDialogProps {
  user: Profile | null
  onOpenChange: (open: boolean) => void
}

export function MenuAccessDialog({ user, onOpenChange }: MenuAccessDialogProps) {
  const router = useRouter()
  const supabase = createClient()
  const [enabled, setEnabled] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The full role menu defines which items can be toggled. Client-role users
  // don't use this staff sidebar, so fall back to an empty list.
  const menu = useMemo(
    () => (user ? getMenuForRole(user.role) : []),
    [user],
  )

  // Seed the dialog from the user's stored permissions, or the role defaults
  // when no override is set.
  useEffect(() => {
    if (!user) return
    const defaults = getDefaultMenuKeys(user.role)
    const initial =
      user.menu_permissions && user.menu_permissions.length >= 0
        ? user.menu_permissions
        : defaults
    setEnabled(new Set(user.menu_permissions ? initial : defaults))
    setError(null)
  }, [user])

  const isOverridden = !!user?.menu_permissions

  const toggle = (key: string, locked?: boolean) => {
    if (locked) return
    setEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const resetToRoleDefaults = () => {
    if (!user) return
    setEnabled(new Set(getDefaultMenuKeys(user.role)))
  }

  const handleSave = async (useDefaults: boolean) => {
    if (!user) return
    setSaving(true)
    setError(null)

    // When saving, always force locked items on so the user can't be locked out.
    const lockedKeys = menu.filter((m) => m.locked).map((m) => m.key)
    const finalKeys = Array.from(new Set([...enabled, ...lockedKeys]))

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        menu_permissions: useDefaults ? null : finalKeys,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && !saving && onOpenChange(false)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Menu Access</DialogTitle>
          <DialogDescription>
            Choose which top-level menu items{' '}
            <strong>{user?.full_name || user?.email}</strong> can see. By default
            this follows their <span className="capitalize">{user?.role}</span>{' '}
            role.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {isOverridden ? 'Using a custom override' : 'Using role defaults'}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={resetToRoleDefaults}
            disabled={saving}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to role defaults
          </Button>
        </div>

        <div className="space-y-1">
          {menu.map((item) => {
            const checked = item.locked || enabled.has(item.key)
            return (
              <label
                key={item.key}
                htmlFor={`menu-${item.key}`}
                className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
              >
                <Checkbox
                  id={`menu-${item.key}`}
                  checked={checked}
                  disabled={item.locked || saving}
                  onCheckedChange={() => toggle(item.key, item.locked)}
                />
                <item.icon className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 text-sm">{item.title}</span>
                {item.locked && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    Always on
                  </span>
                )}
              </label>
            )
          })}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleSave(true)}
            disabled={saving}
          >
            Use role defaults
          </Button>
          <Button type="button" onClick={() => handleSave(false)} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save custom access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
