import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const quoteId = '0771f2bb-78f5-4483-bff4-8c0c3ef2eb94'
const { data: q } = await sb.from('quotes').select('*').eq('id', quoteId).single()
const { data: job, error } = await sb.from('jobs').insert({
  quote_id: quoteId, client_id: q.client_id, site_id: q.site_id, branch_id: q.branch_id,
  title: q.title, stage: 'contract_review', status: 'open',
  quoted_total_pence: q.total_pence ?? 0, quoted_cost_pence: 900000,
  quoted_subtotal_pence: q.subtotal_pence ?? 0, quoted_vat_pence: q.vat_pence ?? 0,
  po_number: q.po_number ?? null, job_number: 'J-TEST1',
}).select('id, job_number').single()
if (error) { console.log('ERR', error.message); process.exit(1) }
await sb.from('job_status_history').insert({ job_id: job.id, from_stage: null, to_stage: 'contract_review', note: 'Test job.', })
console.log('JOB', JSON.stringify(job))
