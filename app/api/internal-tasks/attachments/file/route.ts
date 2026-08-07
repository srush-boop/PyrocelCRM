import { type NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { createClient } from '@/lib/supabase/server'

// Streams a private internal-task attachment. The row is looked up with the
// user-scoped client so RLS only returns it to the owner (or a quality
// manager); we never trust a client-supplied blob path directly.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const id = request.nextUrl.searchParams.get('id')
    const download = request.nextUrl.searchParams.get('download') === '1'
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    let { data: attachment } = await supabase
      .from('internal_task_attachments')
      .select('blob_pathname, name, content_type')
      .eq('id', id)
      .single()

    // Fallback for admin/office staff: internal-task RLS only exposes the row to
    // the owner/quality manager, but staff must be able to view documents that
    // were routed to Purchase Invoices. Re-fetch via the service-role client,
    // but ONLY when the attachment belongs to a purchasing-flagged template.
    if (!attachment) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      const role = (profile as { role?: string } | null)?.role
      if (role === 'admin' || role === 'office') {
        const { createAdminClient } = await import('@/lib/supabase/admin')
        const admin = createAdminClient()
        const { data: staffRow } = await admin
          .from('internal_task_attachments')
          .select(
            'blob_pathname, name, content_type, instance:internal_task_instances(template:internal_task_templates(route_to_purchasing))',
          )
          .eq('id', id)
          .single()
        const instance = (staffRow as { instance?: unknown } | null)?.instance as
          | { template?: { route_to_purchasing?: boolean } | { route_to_purchasing?: boolean }[] }
          | { template?: { route_to_purchasing?: boolean } | { route_to_purchasing?: boolean }[] }[]
          | undefined
        const inst = Array.isArray(instance) ? instance[0] : instance
        const tpl = inst?.template
        const flagged = Array.isArray(tpl) ? tpl[0]?.route_to_purchasing : tpl?.route_to_purchasing
        if (staffRow && flagged) {
          attachment = {
            blob_pathname: (staffRow as { blob_pathname: string }).blob_pathname,
            name: (staffRow as { name: string }).name,
            content_type: (staffRow as { content_type: string | null }).content_type,
          }
        }
      }
    }

    if (!attachment) {
      return new NextResponse('Not found', { status: 404 })
    }

    const result = await get(attachment.blob_pathname, {
      access: 'private',
      ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
    })
    if (!result) {
      return new NextResponse('Not found', { status: 404 })
    }
    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: result.blob.etag, 'Cache-Control': 'private, no-cache' },
      })
    }

    const disposition = download
      ? `attachment; filename="${encodeURIComponent(attachment.name)}"`
      : `inline; filename="${encodeURIComponent(attachment.name)}"`

    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': attachment.content_type || result.blob.contentType,
        'Content-Disposition': disposition,
        ETag: result.blob.etag,
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (error) {
    console.error('[v0] Internal task attachment serve error:', error)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}
