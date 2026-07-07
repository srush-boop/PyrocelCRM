import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data } = await sb.from('jobs').select('stage, contract_reviewed_at, contract_reviewed_by').eq('job_number','J-TEST1').single()
console.log('job state:', JSON.stringify(data))
const { data: h } = await sb.from('job_status_history').select('from_stage,to_stage,note').eq('job_id','4016a835-3bad-4ce3-a6fa-1ad82ae8f143').order('changed_at')
console.log('history:', JSON.stringify(h))
