import { type NextRequest, NextResponse } from 'next/server'
import { analyzeClientRequest } from '@/lib/ai/analyze-client-request'

// Client-request analysis runs through a route handler (not a Server Action) so
// large tender documents aren't rejected by the 1 MB Server Action body limit.
// mammoth (.docx) needs the Node runtime, and PDF understanding can be slow.
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const result = await analyzeClientRequest(formData)
    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  } catch (err) {
    console.error('[v0] /api/quote-requests/analyze failed:', err)
    return NextResponse.json(
      { ok: false, error: 'Could not analyse the document. Please try again.' },
      { status: 500 },
    )
  }
}
