import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { getRamsSettings } from '@/lib/rams/actions'
import { renderRamsPdf } from '@/lib/rams/pdf'
import { signatureSrc } from '@/lib/blob'
import type { RamsDocument } from '@/lib/rams/types'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { supabase, user } = await getAuthContext()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: doc } = await supabase
    .from('rams_documents')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!doc) return new NextResponse('Not found', { status: 404 })

  const [settings, clientRes, siteRes, preparerRes, approverRes, templateRes, confirmRes] = await Promise.all([
    getRamsSettings(),
    doc.client_id
      ? supabase.from('clients').select('name').eq('id', doc.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    doc.site_id
      ? supabase.from('sites').select('name, address, postcode').eq('id', doc.site_id).maybeSingle()
      : Promise.resolve({ data: null }),
    doc.prepared_by
      ? supabase
          .from('profiles')
          .select('full_name, signature_url, job_title, role_ref:roles(name)')
          .eq('id', doc.prepared_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    doc.approved_by
      ? supabase.from('profiles').select('full_name').eq('id', doc.approved_by).maybeSingle()
      : Promise.resolve({ data: null }),
    doc.template_id
      ? supabase.from('rams_master_templates').select('name, code').eq('id', doc.template_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('rams_engineer_confirmations')
      .select('status, confirmed_at, signature_data, engineer:profiles!rams_engineer_confirmations_engineer_id_fkey(full_name)')
      .eq('rams_id', id)
      .eq('status', 'confirmed')
      .order('confirmed_at'),
  ])

  const site = siteRes.data as { name?: string; address?: string | null; postcode?: string | null } | null
  const template = templateRes.data as { name?: string; code?: string } | null
  const engineerSignOffs = ((confirmRes.data || []) as unknown as {
    confirmed_at: string | null
    signature_data: string | null
    engineer: { full_name: string | null } | { full_name: string | null }[] | null
  }[]).map((c) => {
    const eng = Array.isArray(c.engineer) ? c.engineer[0] : c.engineer
    return {
      name: eng?.full_name || 'Engineer',
      signedAt: c.confirmed_at,
      signatureUrl: c.signature_data?.startsWith('data:') ? c.signature_data : null,
    }
  })

  const preparer = preparerRes.data as {
    full_name?: string | null
    signature_url?: string | null
    job_title?: string | null
    role_ref?: { name?: string } | null
  } | null

  const buffer = await renderRamsPdf({
    doc: doc as RamsDocument,
    settings,
    clientName: (clientRes.data as { name?: string } | null)?.name ?? null,
    siteName: site?.name ?? null,
    siteAddress: [site?.address, site?.postcode].filter(Boolean).join(', ') || null,
    templateName: template?.name ? `${template.name}${template.code ? ` (${template.code})` : ''}` : null,
    approvedByName: (approverRes.data as { full_name?: string | null } | null)?.full_name ?? null,
    engineerSignOffs,
    preparedByName: preparer?.full_name ?? null,
    preparedByRole: preparer?.role_ref?.name ?? preparer?.job_title ?? null,
    // @react-pdf fetches this image server-side (no session), so resolve the
    // private signature pathname to an absolute public delivery URL.
    preparedBySignatureUrl: signatureSrc(preparer?.signature_url, { absolute: true }),
  })

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${doc.rams_number}.pdf"`,
    },
  })
}
