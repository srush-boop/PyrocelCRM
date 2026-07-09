import { createClient } from '@supabase/supabase-js'
const c = createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}})
const id='51572632-f6b2-487a-9648-97d7bfc8d58a'
// completed tasks query (as in page)
const filter = `site_id.eq.${id}`
const r1 = await c.from('tasks').select(`*, site_service:site_services(*, service_type:service_types(*)), assigned_engineer:profiles(*), task_result:task_results(*)`).or(filter).eq('status','completed')
console.log('COMPLETED ERR', r1.error?.message||'none', 'rows', r1.data?.length)
// site_services query
const r2 = await c.from('site_services').select(`*, service_type:service_types(*), route:routes(*), area:areas(*), subcontractor:suppliers!site_services_subcontractor_id_fkey(*), assigned_engineer:profiles(*)`).eq('site_id', id)
console.log('SITESERVICES ERR', r2.error?.message||'none', 'rows', r2.data?.length)
