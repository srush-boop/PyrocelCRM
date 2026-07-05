import { type NextRequest, NextResponse } from 'next/server'
import { put, del } from '@vercel/blob'
import { createClient } from '@/lib/supabase/server'

// Staff-only guard shared by upload + delete.
async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401, error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = (profile as { role?: string } | null)?.role
  if (!role || !['admin', 'office'].includes(role)) {
    return { ok: false as const, status: 403, error: 'Forbidden' }
  }
  return { ok: true as const }
}

const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// Upload a product image to PRIVATE Blob. Returns the pathname, which is stored
// on the catalogue item and later served through /api/file.
export async function POST(request: NextRequest) {
  const auth = await requireStaff()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image must be 5MB or smaller' }, { status: 400 })
    }

    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
    const blob = await put(`catalogue/${crypto.randomUUID()}.${ext}`, file, {
      access: 'private',
    })

    // Never return blob.url for private blobs — the pathname is used with get().
    return NextResponse.json({ pathname: blob.pathname })
  } catch (error) {
    console.error('[v0] Catalogue image upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}

// Remove an image from Blob when it's replaced or cleared.
export async function DELETE(request: NextRequest) {
  const auth = await requireStaff()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { pathname } = (await request.json()) as { pathname?: string }
    if (!pathname) return NextResponse.json({ error: 'Missing pathname' }, { status: 400 })
    await del(pathname)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[v0] Catalogue image delete error:', error)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
