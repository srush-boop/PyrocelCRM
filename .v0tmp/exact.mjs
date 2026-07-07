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
// EXACT query from getCalendarData
const { data, error } = await eng.from('calendar_entries').select(
  `id, entry_type_id, user_id, title, start_at, end_at, all_day, is_public, notes, approval_status,
     start_portion, end_portion, start_hours, end_hours,
     entry_type:calendar_entry_types(*),
     user:profiles(id, full_name, email, branch_id),
     attendees:calendar_entry_attendees(user:profiles(id, full_name, email, branch_id))`,
).order('start_at', { ascending: true })
console.log('EXACT getCalendarData entries query =>')
console.log('  rows:', data?.length, ' error:', error?.message || 'none')
