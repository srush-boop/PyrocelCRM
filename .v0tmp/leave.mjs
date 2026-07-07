import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const BANK='73267195-2ba7-423b-b642-bc040dcb1840'
const { data: entries } = await sb.from('calendar_entries')
  .select('id,entry_type_id,title,start_at,end_at,approval_status,user_id,is_public')
  .neq('entry_type_id', BANK).order('start_at')
console.log('NON-BANK entries:', entries?.length)
for (const e of entries||[]) {
  const { data: att } = await sb.from('calendar_entry_attendees').select('user_id').eq('entry_id', e.id)
  console.log(JSON.stringify({...e, attendees: att?.map(a=>a.user_id)}))
}
