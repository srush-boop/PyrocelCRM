// Area planner: postcode rules per area + a map colour on each area.
//
// area_postcodes.prefix is a normalised UK postcode prefix at one of three
// levels — area letters ("NE"), district ("NE2") or sector ("NE2 4"). A prefix
// belongs to exactly one area (unique), and the most specific match wins.
//
// Run: node --env-file-if-exists=/vercel/share/.env.project scripts/add-area-postcodes.mjs
import pg from 'pg'

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
if (!url) {
  console.error('[v0] No POSTGRES_URL(_NON_POOLING) in env')
  process.exit(1)
}
const clean = url.replace(/[?&]sslmode=[^&]*/g, '')
const client = new pg.Client({ connectionString: clean, ssl: { rejectUnauthorized: false } })

const STAFF = `EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin','office']))`

async function main() {
  await client.connect()
  await client.query(`ALTER TABLE areas ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#2563eb'`)

  await client.query(`
    CREATE TABLE IF NOT EXISTS area_postcodes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      area_id uuid NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
      prefix text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await client.query(`CREATE INDEX IF NOT EXISTS idx_area_postcodes_area ON area_postcodes(area_id)`)
  await client.query(`ALTER TABLE area_postcodes ENABLE ROW LEVEL SECURITY`)

  const policies = [
    ['area_postcodes_select_all', 'SELECT', 'USING (auth.uid() IS NOT NULL)'],
    ['area_postcodes_insert_staff', 'INSERT', `WITH CHECK (${STAFF})`],
    ['area_postcodes_update_staff', 'UPDATE', `USING (${STAFF}) WITH CHECK (${STAFF})`],
    ['area_postcodes_delete_staff', 'DELETE', `USING (${STAFF})`],
  ]
  for (const [name, cmd, body] of policies) {
    await client.query(`DROP POLICY IF EXISTS ${name} ON area_postcodes`)
    await client.query(`CREATE POLICY ${name} ON area_postcodes FOR ${cmd} TO authenticated ${body}`)
  }
  console.log('[v0] area_postcodes + areas.color ready')
  await client.end()
}

main().catch(async (e) => {
  console.error('[v0] migration failed', e)
  await client.end().catch(() => {})
  process.exit(1)
})
