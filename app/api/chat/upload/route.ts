import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Upload an image to attach to a chat message. Returns the blob URL, which the
 * client then passes to the sendMessage server action. Public blob with a
 * random suffix so it renders inline; membership is enforced when the message
 * itself is inserted.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = formData.get('image') as File | null
    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed.' }, { status: 400 })
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image must be 8MB or smaller.' }, { status: 400 })
    }

    const safeName = file.name.replace(/[^\w.\-]+/g, '_') || 'image.png'
    const blob = await put(`chat/${user.id}/${safeName}`, file, {
      access: 'public',
      addRandomSuffix: true,
    })
    return NextResponse.json({ url: blob.url })
  } catch (err) {
    console.error('[v0] chat image upload error:', err)
    return NextResponse.json({ error: 'Image upload failed.' }, { status: 500 })
  }
}
