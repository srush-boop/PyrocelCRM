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

  const [settings, clientRes, siteRes, preparerRes] = await Promise.all([
    getRamsSettings(),
    doc.client_id
      ? supabase.from('clients').select('name').eq('id', doc.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    doc.site_id
      ? supabase.from('sites').select('name').eq('id', doc.site_id).maybeSingle()
      : Promise.resolve({ data: null }),
    doc.prepared_by
      ? supabase
          .from('profiles')
          .select('full_name, signature_url, job_title, role_ref:roles(name)')
          .eq('id', doc.prepared_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

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
    siteName: (siteRes.data as { name?: string } | null)?.name ?? null,
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
