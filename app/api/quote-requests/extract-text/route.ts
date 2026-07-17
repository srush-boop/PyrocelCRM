import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractDocumentText } from '@/lib/ai/parse-document'

// Extract readable plain text from an uploaded document (PDF / .docx / text) so
// it can seed an AI brief. A route handler (not a Server Action) is used so
// large tender documents aren't blocked by the 1 MB Server Action body limit.
export const runtime = 'nodejs'
// Native text extraction is sub-second; this headroom is only for the
// multimodal fallback used on scanned/image-only PDFs.
export const maxDuration = 120

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated.' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = (profile as { role?: string } | null)?.role
  if (!role || !['admin', 'office'].includes(role)) {
    return NextResponse.json({ ok: false, error: 'Not authorised.' }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ ok: false, error: 'No file provided.' }, { status: 400 })

    const res = await extractDocumentText(file)
    if (!res.ok || !res.text) {
      return NextResponse.json(
        { ok: false, error: res.error ?? 'Could not read the document.' },
        { status: 400 },
      )
    }
    return NextResponse.json({ ok: true, text: res.text, fileName: file.name })
  } catch (err) {
    console.error('[v0] /api/quote-requests/extract-text failed:', err)
    return NextResponse.json({ ok: false, error: 'Could not read the document.' }, { status: 500 })
  }
}
