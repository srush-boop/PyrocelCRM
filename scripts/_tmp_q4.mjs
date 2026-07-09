import { createClient } from '@supabase/supabase-js'
const c = createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}})
const id='51572632-f6b2-487a-9648-97d7bfc8d58a'
const { data: ss } = await c.from('site_services').select('id').eq('site_id', id)
const ids = (ss||[]).map(s=>s.id)
const filter = ids.length>0 ? `site_id.eq.${id},site_service_id.in.(${ids.join(',')})` : `site_id.eq.${id}`
const open = await c.from('tasks').select(`*, site_service:site_services(*, service_type:service_types(*)), service_type:service_types(id, name), assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(*)`).or(filter).in('status',['pending','in_progress','paused']).order('scheduled_date',{ascending:true})
console.log('OPEN ERR', open.error?.message||'none', 'rows', open.data?.length)
console.log('SAMPLE', JSON.stringify((open.data||[]).slice(0,3).map(d=>({status:d.status, svc:d.site_service?.service_type?.name||d.service_type?.name, eng:d.assigned_engineer?.full_name||null}))))
const comp = await c.from('tasks').select(`*, site_service:site_services(*, service_type:service_types(*)), assigned_engineer:profiles!tasks_assigned_engineer_id_fkey(*), task_result:task_results(*)`).or(filter).eq('status','completed')
console.log('COMPLETED ERR', comp.error?.message||'none', 'rows', comp.data?.length)
