import { put, del } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Upload the current user's profile picture. Stored as a PUBLIC blob with an
 * unguessable random suffix (consistent with signatures) so it can be rendered
 * in <img> tags across the chat and app. Each user manages only their own.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = formData.get('avatar') as File | null
    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Avatar must be an image file.' }, { status: 400 })
    }
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ error: 'Avatar must be 4MB or smaller.' }, { status: 400 })
    }

    const safeName = file.name.replace(/[^\w.\-]+/g, '_') || 'avatar.png'
    const blob = await put(`avatars/${user.id}/${safeName}`, file, {
      access: 'public',
      addRandomSuffix: true,
    })

    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: blob.url, updated_at: new Date().toISOString() })
      .eq('id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ avatar_url: blob.url })
  } catch (err) {
    console.error('[v0] avatar upload error:', err)
    return NextResponse.json({ error: 'Avatar upload failed.' }, { status: 500 })
  }
}

/** Remove the current user's profile picture. */
export async function DELETE() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', user.id)
    .single()

  if (profile?.avatar_url) {
    try {
      await del(profile.avatar_url)
    } catch {
      // best-effort cleanup
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: null, updated_at: new Date().toISOString() })
    .eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
