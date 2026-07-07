import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
for (const col of ['id','description','detail','is_optional','option_group','standard','client_selected','line_total_pence']) {
  const r = await sb.from('quote_line_items').select(col).limit(1)
  console.log(' -', col, r.error ? 'MISSING ('+r.error.message+')' : 'OK')
}
