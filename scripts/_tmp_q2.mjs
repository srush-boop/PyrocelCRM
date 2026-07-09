import { createClient } from '@supabase/supabase-js'
const c = createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}})
const id='51572632-f6b2-487a-9648-97d7bfc8d58a'
// site_service ids
const { data: ss } = await c.from('site_services').select('id').eq('site_id', id)
const ids = (ss||[]).map(s=>s.id)
const filter = ids.length>0 ? `site_id.eq.${id},site_service_id.in.(${ids.join(',')})` : `site_id.eq.${id}`
const { data, error } = await c.from('tasks').select(`
  *,
  site_service:site_services(*, service_type:service_types(*)),
  service_type:service_types(id, name),
  assigned_engineer:profiles(*)
`).or(filter).in('status',['pending','in_progress','paused']).order('scheduled_date',{ascending:true})
console.log('ERR', error?.message||'none')
console.log('ROWS', data?.length)
console.log('SAMPLE', JSON.stringify((data||[]).slice(0,2).map(d=>({status:d.status, svc:d.site_service?.service_type?.name||d.service_type?.name, sid:d.site_id, ssid:d.site_service_id}))))
