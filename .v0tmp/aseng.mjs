import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
function mk(uid,email){
  function b64(o){return Buffer.from(JSON.stringify(o)).toString('base64url')}
  const now=Math.floor(Date.now()/1000)
  const payload={aud:'authenticated',role:'authenticated',sub:uid,exp:now+3600,iat:now,email}
  const data=b64({alg:'HS256',typ:'JWT'})+'.'+b64(payload)
  const sig=crypto.createHmac('sha256',process.env.SUPABASE_JWT_SECRET).update(data).digest('base64url')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {global:{headers:{Authorization:`Bearer ${data+'.'+sig}`}}})
}
const eng=mk('da39a908-d438-41d8-9918-4272ddfe8f87','eng')
const BANK='73267195-2ba7-423b-b642-bc040dcb1840'
const { data: ent, error:e1 } = await eng.from('calendar_entries').select('id,entry_type_id,title,start_at,all_day,user_id,is_public').neq('entry_type_id',BANK)
console.log('[engineer] non-bank entries visible:', ent?.length, e1?.message||'')
console.log(JSON.stringify(ent,null,1))
// attendees embed test (the actual query joins attendees)
const { data: full, error:e3 } = await eng.from('calendar_entries').select('id,attendees:calendar_entry_attendees(user:profiles(id,full_name,email,branch_id))').neq('entry_type_id',BANK)
console.log('\n[engineer] with attendees embed:', full?.length, e3?.message||'')
if(full) console.log(JSON.stringify(full.slice(0,3),null,1))
const { data: tk,error:e2 } = await eng.from('tasks').select('id,status,scheduled_date').or('status.eq.completed,status.eq.in_progress')
console.log('\n[engineer] completed/in_progress tasks visible:', tk?.length, e2?.message||'')
