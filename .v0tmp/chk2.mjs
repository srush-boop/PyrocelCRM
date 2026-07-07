import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data } = await sb.from('jobs').select('contract_reviewed_at, contract_reviewed_by').eq('job_number','J-TEST1').single()
console.log('reviewed_at:', data.contract_reviewed_at, '| by:', data.contract_reviewed_by)
