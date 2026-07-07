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
const BANK='73267195-2ba7-423b-b642-bc040dcb1840'
// Exact-ish embed used by getCalendarData
const { data: full, error:e3 } = await eng.from('calendar_entries')
  .select('id,user:profiles(id,full_name,email,branch_id),attendees:calendar_entry_attendees(user:profiles(id,full_name,email,branch_id))')
  .neq('entry_type_id',BANK)
console.log('[engineer] entries w/ embed:', full?.length, 'err:', e3?.message||'none')
for (const f of full||[]) console.log(` entry ${f.id.slice(0,8)} user=${f.user? (f.user.full_name||f.user.id.slice(0,8)) : 'NULL'} attendees=${JSON.stringify((f.attendees||[]).map(a=>a.user? (a.user.full_name||a.user.id.slice(0,8)) : 'NULL'))}`)

const { data: tk,error:e2 } = await eng.from('tasks').select('id,status,scheduled_date,site_service:site_services(site:sites(name,branch_id))').or('status.eq.completed,status.eq.in_progress')
console.log('\n[engineer] tasks:', tk?.length, 'err:', e2?.message||'none')
for (const t of tk||[]) console.log(` task ${t.id.slice(0,8)} ${t.status} sched=${t.scheduled_date} site=${t.site_service?.site?.name||'NULL'} branch=${t.site_service?.site?.branch_id||'null'}`)
