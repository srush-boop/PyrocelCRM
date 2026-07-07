import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Entry types
const { data: types } = await sb.from('calendar_entry_types').select('id,name,is_active').order('name')
console.log('ENTRY TYPES:'); types.forEach(t=>console.log(` ${t.is_active?'✓':'✗'} ${t.name} (${t.id})`))

// Entries count by type
const { data: entries } = await sb.from('calendar_entries').select('id,entry_type_id,title,start_at,end_at,approval_status,user_id')
console.log('\nTOTAL calendar_entries:', entries?.length)
const byType = {}
for (const e of entries||[]) byType[e.entry_type_id] = (byType[e.entry_type_id]||0)+1
console.log('by type id:', JSON.stringify(byType,null,1))
console.log('\nsample entries:', JSON.stringify((entries||[]).slice(0,8),null,1))

// Completed tasks
const { data: tasks } = await sb.from('tasks').select('id,scheduled_date,status,started_at,booked_start_time').or('status.eq.completed,status.eq.in_progress').limit(20)
console.log('\nCOMPLETED/IN_PROGRESS tasks:', tasks?.length)
console.log(JSON.stringify((tasks||[]).slice(0,8),null,1))
