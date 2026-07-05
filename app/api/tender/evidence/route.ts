import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenderApiUser } from '@/lib/tender/access'

// Accepts multipart form data: title, description, tags (comma-separated),
// expiry_date, and an optional file. The file is stored privately in Blob.
export async function POST(request: NextRequest) {
  const user = await getTenderApiUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const form = await request.formData()
    const title = String(form.get('title') ?? '').trim()
    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

    const description = String(form.get('description') ?? '').trim() || null
    const expiryRaw = String(form.get('expiry_date') ?? '').trim()
    const expiry_date = expiryRaw || null
    const tags = String(form.get('tags') ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    const file = form.get('file') as File | null
    let file_url: string | null = null
    let file_name: string | null = null
    let file_type: string | null = null

    if (file && file.size > 0) {
      const safeName = file.name.replace(/[^\w.\-]+/g, '_')
      const blob = await put(`tender-evidence/${Date.now()}-${safeName}`, file, {
        access: 'private',
        addRandomSuffix: true,
      })
      file_url = blob.url
      file_name = file.name
      file_type = file.type || null
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('tender_evidence')
      .insert({
        title,
        description,
        tags,
        expiry_date,
        file_url,
        file_name,
        file_type,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ evidence: data })
  } catch (err) {
    console.error('[v0] evidence create failed:', err)
    return NextResponse.json({ error: 'Could not save evidence' }, { status: 500 })
  }
}
