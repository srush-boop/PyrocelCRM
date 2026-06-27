import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Settings } from 'lucide-react'
import { VaultGrid } from '@/components/dashboard/vault/vault-grid'
import type { Profile, VaultSection, VaultButton } from '@/lib/types/database'

export const metadata = {
  title: 'Employee Vault | Pyrocel',
  description: 'Quick links to forms, files and tools for the team.',
}

export default async function VaultPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/auth/login')
  const typedProfile = profile as Profile
  const isAdmin = typedProfile.role === 'admin'

  // RLS already filters sections/buttons to those visible to this role, so we
  // simply fetch and group them.
  const [{ data: sectionData }, { data: buttonData }] = await Promise.all([
    supabase
      .from('vault_sections')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true }),
    supabase
      .from('vault_buttons')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true }),
  ])

  const buttons = (buttonData || []) as VaultButton[]
  const sections = ((sectionData || []) as VaultSection[]).map((s) => ({
    ...s,
    buttons: buttons.filter((b) => b.section_id === s.id),
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-balance">Employee Vault</h1>
          <p className="text-muted-foreground text-pretty">
            Quick access to the forms, files and tools your team uses every day.
          </p>
        </div>
        {isAdmin && (
          <Button asChild variant="outline">
            <Link href="/dashboard/vault/manage">
              <Settings className="mr-2 h-4 w-4" />
              Configure
            </Link>
          </Button>
        )}
      </div>

      <VaultGrid sections={sections} isAdmin={isAdmin} />
    </div>
  )
}
