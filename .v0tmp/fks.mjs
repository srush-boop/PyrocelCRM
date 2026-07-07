import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
function mk(uid){
  function b64(o){return Buffer.from(JSON.stringify(o)).toString('base64url')}
  const now=Math.floor(Date.now()/1000)
  const data=b64({alg:'HS256',typ:'JWT'})+'.'+b64({aud:'authenticated',role:'authenticated',sub:uid,exp:now+3600,iat:now})
  const sig=crypto.createHmac('sha256',process.env.SUPABASE_JWT_SECRET).update(data).digest('base64url')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {global:{headers:{Authorization:`Bearer ${data+'.'+sig}`}}})
}
const eng=mk('da39a908-d438-41d8-9918-4272ddfe8f87')
// EXACT tasks query from getCalendarData
const { data, error } = await eng.from('tasks').select(
  `id, scheduled_date, booked_start_time, booked_end_time, booked_duration_minutes, status, started_at, assigned_engineer_id,
     assigned_engineer:profiles(id, full_name, email, branch_id),
     site_service:site_services(site:sites(name, branch_id), service_type:service_types(name)),
     visit_type:service_visit_types(name),
     task_results(testing_start_time, testing_end_time)`,
).or('scheduled_date.not.is.null,status.eq.completed,status.eq.in_progress').neq('status','cancelled')
console.log('EXACT tasks query => rows:', data?.length, ' error:', error?.message||'none')
