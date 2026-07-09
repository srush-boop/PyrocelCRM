import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Uploads an asset check / calibration certificate to private Blob storage and
// returns its pathname/url. Any staff member (admin/office/engineer) can upload,
// since engineers complete checks on their own assets.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = (profile as { role?: string } | null)?.role
  if (!role || !['admin', 'office', 'engineer'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const safeName = file.name.replace(/[^\w.\-]+/g, '_')
    const pathname = `asset-certificates/${user.id}/${Date.now()}-${safeName}`

    const blob = await put(pathname, file, {
      access: 'private',
      addRandomSuffix: true,
    })

    return NextResponse.json({
      pathname: blob.pathname,
      url: blob.url,
      name: file.name,
    })
  } catch (error) {
    console.error('[v0] Asset certificate upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
