import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'
import { VaultManager } from '@/components/dashboard/vault/vault-manager'
import type { Profile, VaultSection, VaultButton } from '@/lib/types/database'

export const metadata = {
  title: 'Configure Employee Vault | Pyrocel',
}

export default async function VaultManagePage() {
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

  // Only admins configure the vault.
  if (!profile || (profile as Profile).role !== 'admin') {
    redirect('/dashboard/vault')
  }

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
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link href="/dashboard/vault">
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back to Employee Vault
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Configure Employee Vault</h1>
        <p className="text-muted-foreground text-pretty">
          Create sections and buttons that link to pages, Jotform forms, Dropbox folders and
          more. Control who can see each item by role.
        </p>
      </div>

      <VaultManager sections={sections} />
    </div>
  )
}
