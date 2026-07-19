import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scanForMalware } from '@/lib/uploads/validate'

/**
 * Upload an image to attach to a chat message. The Blob store is private, so we
 * return the object *pathname*; the client passes it to the sendMessage action,
 * which stores it in chat_messages.image_url. Bytes are served via /api/blob.
 * Membership is enforced when the message itself is inserted.
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
    const scan = await scanForMalware(file)
    if (!scan.ok) return scan.response

    const safeName = file.name.replace(/[^\w.\-]+/g, '_') || 'image.png'
    const blob = await put(`chat/${user.id}/${safeName}`, file, {
      access: 'private',
      addRandomSuffix: true,
    })
    // Store the pathname; the delivery URL is built when rendering.
    return NextResponse.json({
      pathname: blob.pathname,
      url: `/api/blob?pathname=${encodeURIComponent(blob.pathname)}`,
    })
  } catch (err) {
    console.error('[v0] chat image upload error:', err)
    return NextResponse.json({ error: 'Image upload failed.' }, { status: 500 })
  }
}
