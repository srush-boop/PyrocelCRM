import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ACCEPTED = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
])

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = (profile as { role?: string } | null)?.role
  if (!role || !['admin', 'office'].includes(role)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 })

    const isXlsxName = /\.(xlsx|xls)$/i.test(file.name)
    if (!ACCEPTED.has(file.type) && !isXlsxName) {
      return NextResponse.json({ error: 'Please upload an Excel (.xlsx) file.' }, { status: 400 })
    }

    // Store privately under a stable folder; randomSuffix keeps versions distinct.
    const blob = await put(`product-sheets/${file.name}`, file, {
      access: 'private',
      addRandomSuffix: true,
    })

    // Mark previous sheets as not current, then record this upload.
    await supabase.from('product_sheets').update({ is_current: false }).eq('is_current', true)

    const { data: inserted, error: insErr } = await supabase
      .from('product_sheets')
      .insert({
        filename: file.name,
        blob_pathname: blob.pathname,
        size_bytes: file.size,
        uploaded_by: user.id,
        is_current: true,
      })
      .select('id')
      .single()

    if (insErr || !inserted) {
      return NextResponse.json({ error: 'Could not record the upload.' }, { status: 500 })
    }

    return NextResponse.json({ id: (inserted as { id: string }).id, pathname: blob.pathname })
  } catch (error) {
    console.error('[v0] Product sheet upload error:', error)
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500 })
  }
}
