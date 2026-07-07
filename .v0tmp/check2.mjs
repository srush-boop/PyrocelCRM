import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data } = await sb.from('quote_line_items').select('description,is_optional,client_selected,line_total_pence').eq('quote_id','70504754-fba2-49e8-9a5e-c5df263db191').eq('is_optional',true)
console.log(JSON.stringify(data,null,1))
const { data: q } = await sb.from('quotes').select('subtotal_pence,total_pence').eq('id','70504754-fba2-49e8-9a5e-c5df263db191').single()
console.log('quote totals:', JSON.stringify(q))
