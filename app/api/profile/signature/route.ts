import { put, del } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Upload the current user's signature image. Stored as a PUBLIC blob because it
 * is rendered on generated documents (reports, RAMS, receipts) that may be
 * shared with clients. Each internal user manages only their own signature.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('signature') as File | null

    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Signature must be an image file.' }, { status: 400 })
    }
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'Signature must be 2MB or smaller.' }, { status: 400 })
    }

    const safeName = file.name.replace(/[^\w.\-]+/g, '_') || 'signature.png'
    const blob = await put(`signatures/${user.id}/${safeName}`, file, {
      access: 'public',
      addRandomSuffix: true,
    })

    // RLS allows a user to update their own profile row (auth.uid() = id).
    const { error } = await supabase
      .from('profiles')
      .update({ signature_url: blob.url, updated_at: new Date().toISOString() })
      .eq('id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ signature_url: blob.url })
  } catch (err) {
    console.error('[v0] signature upload error:', err)
    return NextResponse.json({ error: 'Signature upload failed.' }, { status: 500 })
  }
}

/** Remove the current user's signature. */
export async function DELETE() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('signature_url')
    .eq('id', user.id)
    .single()

  // Best-effort blob cleanup; ignore failures (e.g. already gone).
  if (profile?.signature_url) {
    try {
      await del(profile.signature_url)
    } catch {
      // ignore
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ signature_url: null, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
