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
// Try disambiguating by column name hint
for (const hint of ['user_id','calendar_entries_user_id_fkey']) {
  const { data, error } = await eng.from('calendar_entries')
    .select(`id, user:profiles!${hint}(id, full_name, email, branch_id)`).limit(2)
  console.log(`hint '${hint}':`, error? 'ERR '+error.message : 'OK rows='+data.length)
}
