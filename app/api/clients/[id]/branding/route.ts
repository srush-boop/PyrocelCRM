import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** Ensure the caller is an authenticated admin. */
async function requireAdmin() {
  const serverClient = await createClient()
  const {
    data: { user },
  } = await serverClient.auth.getUser()
  if (!user) return { ok: false as const, status: 401, error: 'Unauthorised.' }

  const { data: profile } = await serverClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return { ok: false as const, status: 403, error: 'Forbidden.' }
  }
  return { ok: true as const }
}

/**
 * Update a client's branded-login settings: upload a logo (optional) and/or
 * set the tagline. The logo is stored as a PUBLIC blob because it renders on
 * the login page before the visitor has authenticated.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin()
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status })
  }

  const { id: clientId } = await params

  try {
    const formData = await request.formData()
    const file = formData.get('logo') as File | null
    const taglineRaw = formData.get('tagline')
    const tagline =
      typeof taglineRaw === 'string' ? taglineRaw.trim() : undefined

    const update: { logo_url?: string; login_tagline?: string | null } = {}

    if (file && file.size > 0) {
      if (!file.type.startsWith('image/')) {
        return NextResponse.json(
          { error: 'Logo must be an image file.' },
          { status: 400 },
        )
      }
      if (file.size > 2 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'Logo must be 2MB or smaller.' },
          { status: 400 },
        )
      }
      const safeName = file.name.replace(/[^\w.\-]+/g, '_')
      const blob = await put(`client-logos/${clientId}/${safeName}`, file, {
        access: 'public',
        addRandomSuffix: true,
      })
      update.logo_url = blob.url
    }

    if (tagline !== undefined) {
      update.login_tagline = tagline || null
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('clients')
      .update(update)
      .eq('id', clientId)
      .select('id, logo_url, login_tagline')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ client: data })
  } catch (err) {
    console.error('[v0] client branding update error:', err)
    return NextResponse.json({ error: 'Branding update failed.' }, { status: 500 })
  }
}
