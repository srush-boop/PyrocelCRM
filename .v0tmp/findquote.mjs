import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data: opt } = await sb.from('quote_line_items').select('quote_id, description, is_optional, option_group, client_selected, line_total_pence').eq('is_optional', true).limit(20)
console.log('optional lines found:', opt?.length ?? 0)
console.log(JSON.stringify(opt, null, 2))
if (opt && opt.length) {
  const ids = [...new Set(opt.map(o => o.quote_id))]
  const { data: q } = await sb.from('quotes').select('id, quote_number, status, share_token, subtotal_pence, total_pence, show_line_items').in('id', ids)
  console.log('quotes:', JSON.stringify(q, null, 2))
}
