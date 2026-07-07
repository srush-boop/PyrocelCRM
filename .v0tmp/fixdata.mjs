import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const qid = '70504754-fba2-49e8-9a5e-c5df263db191'
const { data } = await sb.from('quote_line_items').select('id,description,detail,is_optional').eq('quote_id',qid).eq('is_optional',true)
for (const l of data) {
  let desc = l.description
  if (l.description === 'Annual Fire Alarm Maintenance') {
    if ((l.detail||'').includes('Comprehensive')) desc = 'Annual Fire Alarm Maintenance (Comprehensive Cover)'
    else if ((l.detail||'').includes('Standard')) desc = 'Annual Fire Alarm Maintenance (Standard Cover)'
  }
  await sb.from('quote_line_items').update({ description: desc, client_selected: null }).eq('id', l.id)
}
// recompute totals to base (no optional selected)
const { data: q } = await sb.from('quotes').select('vat_rate,discount_pence').eq('id',qid).single()
const { data: all } = await sb.from('quote_line_items').select('quantity,unit_price_pence,is_optional,client_selected').eq('quote_id',qid)
const gross = all.filter(l=>!l.is_optional).reduce((s,l)=>s+Math.round(l.quantity*l.unit_price_pence),0)
const sub = gross - (q.discount_pence||0)
const vat = Math.round(sub*(q.vat_rate||0)/100)
await sb.from('quotes').update({ subtotal_pence: sub, vat_pence: vat, total_pence: sub+vat }).eq('id',qid)
console.log('reset done. subtotal', sub, 'total', sub+vat)
