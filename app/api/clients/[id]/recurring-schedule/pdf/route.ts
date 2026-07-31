import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderRecurringSchedulePdfBuffer } from '@/lib/pdf/recurring-schedule-pdf'
import { loadClientRecurringSchedule } from '@/lib/billing/recurring-schedule'
import type { CompanyInfo, Client, Profile } from '@/lib/types/database'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  // Office/admin only — this is an internal billing document.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = (profile as Pick<Profile, 'role'> | null)?.role
  if (role !== 'admin' && role !== 'office') {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', id)
    .maybeSingle<Pick<Client, 'id' | 'name'>>()
  if (!client) return new NextResponse('Not found', { status: 404 })

  const [schedule, { data: company }] = await Promise.all([
    loadClientRecurringSchedule(supabase, id),
    supabase.from('company_info').select('*').limit(1).maybeSingle(),
  ])

  const buffer = await renderRecurringSchedulePdfBuffer({
    clientName: client.name,
    schedule,
    company: (company ?? null) as CompanyInfo | null,
  })

  const safeName = String(client.name)
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'client'
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="billing-schedule-${safeName}.pdf"`,
    },
  })
}
