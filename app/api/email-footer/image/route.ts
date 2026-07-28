import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateUpload, IMAGE_MIME_TYPES, MB } from '@/lib/uploads/validate'

/**
 * Upload an email-footer image. Stored as a PUBLIC blob because it is embedded
 * in outgoing report emails — email clients fetch the image anonymously and
 * cannot authenticate to a proxy, so the URL must be publicly reachable.
 *
 * Any authenticated user may upload (each user configures their own footer;
 * admins/office also manage the company default). Returns the public URL to be
 * saved into the footer's `image_url`.
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
    const file = formData.get('image') as File | null

    const check = validateUpload(file, { allow: IMAGE_MIME_TYPES, maxBytes: 2 * MB })
    if (!check.ok) return check.response

    const safeName = (file as File).name.replace(/[^\w.\-]+/g, '_')
    const blob = await put(`email-footers/${user.id}/${safeName}`, file as File, {
      access: 'public',
      addRandomSuffix: true,
    })

    return NextResponse.json({ url: blob.url })
  } catch (err) {
    console.error('[v0] email footer image upload error:', err)
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500 })
  }
}
