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
import { Loader2, RotateCcw, Lock } from 'lucide-react'
import type { Profile } from '@/lib/types/database'
import {
  getMenuForRole,
  collectChildHrefs,
  resolveEnabledSet,
  type NavItem,
  type NavChild,
} from '@/lib/config/navigation'

interface MenuAccessDialogProps {
  user: Profile | null
  onOpenChange: (open: boolean) => void
}

// Tri-state helper for a set of page hrefs.
type TriState = boolean | 'indeterminate'
function triState(hrefs: string[], enabled: Set<string>): TriState {
  if (hrefs.length === 0) return false
  const on = hrefs.filter((h) => enabled.has(h)).length
  if (on === 0) return false
  if (on === hrefs.length) return true
  return 'indeterminate'
}

export function MenuAccessDialog({ user, onOpenChange }: MenuAccessDialogProps) {
  const router = useRouter()
  const supabase = createClient()
  const [enabled, setEnabled] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The full role menu defines which items can be toggled. Client-role users
  // don't use this staff sidebar, so fall back to an empty list.
  const menu = useMemo(() => (user ? getMenuForRole(user.role) : []), [user])

  // Seed the dialog from the user's resolved permissions (legacy group-only
  // overrides expand to all their pages), or the role defaults when unset.
  useEffect(() => {
    if (!user) return
    setEnabled(resolveEnabledSet(user.role, user.menu_permissions))
    setError(null)
  }, [user])

  const isOverridden = !!user?.menu_permissions

  // ---- granular toggles -------------------------------------------------

  const toggleHref = (href: string) =>
    setEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(href)) next.delete(href)
      else next.add(href)
      return next
    })

  const setHrefs = (hrefs: string[], on: boolean) =>
    setEnabled((prev) => {
      const next = new Set(prev)
      for (const h of hrefs) {
        if (on) next.add(h)
        else next.delete(h)
      }
      return next
    })

  const toggleLeaf = (key: string, locked?: boolean) => {
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
    setEnabled(resolveEnabledSet(user.role, null))
  }

  const handleSave = async (useDefaults: boolean) => {
    if (!user) return
    setSaving(true)
    setError(null)

    // Build the stored override: leaf top-level items keyed by `key`; grouped
    // items store their `key` (so group visibility + mobile nav keep working)
    // plus each enabled page href. Locked items are always forced on.
    const finalKeys: string[] = []
    for (const item of menu) {
      if (item.children && item.children.length) {
        const hrefs = collectChildHrefs(item)
        if (item.locked) {
          finalKeys.push(item.key, ...hrefs)
          continue
        }
        const on = hrefs.filter((h) => enabled.has(h))
        if (on.length) finalKeys.push(item.key, ...on)
      } else if (item.locked || enabled.has(item.key)) {
        finalKeys.push(item.key)
      }
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        menu_permissions: useDefaults ? null : Array.from(new Set(finalKeys)),
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

  // ---- rendering --------------------------------------------------------

  // A single page (leaf) checkbox row.
  const renderLeaf = (child: NavChild, locked: boolean) => (
    <label
      key={child.href}
      className="flex items-center gap-3 rounded-md py-1.5 pl-9 pr-2 hover:bg-muted/50"
    >
      <Checkbox
        checked={locked || enabled.has(child.href!)}
        disabled={locked || saving}
        onCheckedChange={() => toggleHref(child.href!)}
      />
      <child.icon className="h-4 w-4 text-muted-foreground" />
      <span className="flex-1 text-sm">{child.title}</span>
    </label>
  )

  // A nested sub-menu (e.g. Sales → Configure): a parent row that toggles all
  // its pages, then the indented pages.
  const renderWrapper = (child: NavChild, locked: boolean) => {
    const hrefs = (child.children ?? []).map((s) => s.href)
    return (
      <div key={child.title}>
        <label className="flex items-center gap-3 rounded-md py-1.5 pl-6 pr-2 hover:bg-muted/50">
          <Checkbox
            checked={locked ? true : triState(hrefs, enabled)}
            disabled={locked || saving}
            onCheckedChange={(v) => setHrefs(hrefs, v === true)}
          />
          <child.icon className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1 text-sm font-medium">{child.title}</span>
        </label>
        <div className="ml-3 border-l pl-1">
          {(child.children ?? []).map((sub) =>
            renderLeaf(sub as NavChild, locked),
          )}
        </div>
      </div>
    )
  }

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && !saving && onOpenChange(false)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Menu Access</DialogTitle>
          <DialogDescription>
            Choose which menu groups and individual pages{' '}
            <strong>{user?.full_name || user?.email}</strong> can see. By default this
            follows their <span className="capitalize">{user?.role}</span> role. A group
            stays visible as long as at least one of its pages is enabled.
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

        <div className="space-y-0.5">
          {menu.map((item) => {
            const isGroup = !!(item.children && item.children.length)

            // Top-level leaf item (no children): a single checkbox keyed by `key`.
            if (!isGroup) {
              const checked = item.locked || enabled.has(item.key)
              return (
                <label
                  key={item.key}
                  className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={checked}
                    disabled={item.locked || saving}
                    onCheckedChange={() => toggleLeaf(item.key, item.locked)}
                  />
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-sm font-medium">{item.title}</span>
                  {item.locked && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Lock className="h-3 w-3" />
                      Always on
                    </span>
                  )}
                </label>
              )
            }

            // Grouped item: a parent "select all" checkbox + its pages.
            const hrefs = collectChildHrefs(item)
            return (
              <div key={item.key} className="rounded-md">
                <label className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50">
                  <Checkbox
                    checked={item.locked ? true : triState(hrefs, enabled)}
                    disabled={item.locked || saving}
                    onCheckedChange={(v) => setHrefs(hrefs, v === true)}
                  />
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-sm font-semibold">{item.title}</span>
                  {item.locked && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Lock className="h-3 w-3" />
                      Always on
                    </span>
                  )}
                </label>
                <div>
                  {(item.children ?? []).map((child) =>
                    child.children && child.children.length
                      ? renderWrapper(child, !!item.locked)
                      : renderLeaf(child, !!item.locked),
                  )}
                </div>
              </div>
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
