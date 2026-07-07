import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data } = await sb.from('quotes').select('id, quote_number, title, status, quote_type, client_id, site_id, total_pence').neq('quote_type','remedial').order('created_at',{ascending:false}).limit(5)
console.log(JSON.stringify(data, null, 1))
