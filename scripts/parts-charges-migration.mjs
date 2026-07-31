// Migration for: parts on not-yet-started calls + ad-hoc charges at review.
//
// (1) Loosen call_parts insert/update/delete so the ASSIGNED ENGINEER can manage
//     parts while a call is 'pending' OR 'in_progress' (was 'in_progress' only).
//     Completed calls stay engineer-locked; is_staff() branch unchanged.
// (2) Create call_charges: ad-hoc chargeable lines (labour/other) added to a call
//     at the chargeable review stage, flowing into the generated invoice.
//
// Run: node --env-file-if-exists=/vercel/share/.env.project scripts/parts-charges-migration.mjs
import pg from 'pg'

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
if (!url) {
  console.error('[v0] No POSTGRES_URL(_NON_POOLING) in env')
  process.exit(1)
}

const clean = url.replace(/[?&]sslmode=[^&]*/g, '')
const client = new pg.Client({ connectionString: clean, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()

  // (1) call_parts: allow the assigned engineer to manage parts on pending calls.
  const engineerBranch = `(EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = call_parts.task_id
        AND t.assigned_engineer_id = auth.uid()
        AND t.status IN ('pending', 'in_progress')
    ))`

  await client.query(`DROP POLICY IF EXISTS call_parts_insert ON call_parts`)
  await client.query(
    `CREATE POLICY call_parts_insert ON call_parts FOR INSERT
     WITH CHECK (is_staff() OR ${engineerBranch})`,
  )

  await client.query(`DROP POLICY IF EXISTS call_parts_update ON call_parts`)
  await client.query(
    `CREATE POLICY call_parts_update ON call_parts FOR UPDATE
     USING (is_staff() OR ${engineerBranch})
     WITH CHECK (is_staff() OR ${engineerBranch})`,
  )

  await client.query(`DROP POLICY IF EXISTS call_parts_delete ON call_parts`)
  await client.query(
    `CREATE POLICY call_parts_delete ON call_parts FOR DELETE
     USING (is_staff() OR ${engineerBranch})`,
  )
  console.log('[v0] call_parts policies now allow pending + in_progress for engineers')

  // (2) call_charges table.
  await client.query(`
    CREATE TABLE IF NOT EXISTS call_charges (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      description text NOT NULL,
      quantity numeric NOT NULL DEFAULT 1,
      unit_price_pence integer NOT NULL DEFAULT 0,
      kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('labour', 'other')),
      nominal_code_id uuid REFERENCES nominal_codes(id) ON DELETE SET NULL,
      created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await client.query(
    `CREATE INDEX IF NOT EXISTS call_charges_task_id_idx ON call_charges(task_id)`,
  )
  await client.query(`ALTER TABLE call_charges ENABLE ROW LEVEL SECURITY`)

  // RLS: staff full manage; assigned engineer read-only (mirror call_parts_select).
  await client.query(`DROP POLICY IF EXISTS call_charges_select ON call_charges`)
  await client.query(`
    CREATE POLICY call_charges_select ON call_charges FOR SELECT
    USING (is_staff() OR (EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = call_charges.task_id AND t.assigned_engineer_id = auth.uid()
    )))
  `)
  await client.query(`DROP POLICY IF EXISTS call_charges_insert ON call_charges`)
  await client.query(
    `CREATE POLICY call_charges_insert ON call_charges FOR INSERT WITH CHECK (is_staff())`,
  )
  await client.query(`DROP POLICY IF EXISTS call_charges_update ON call_charges`)
  await client.query(
    `CREATE POLICY call_charges_update ON call_charges FOR UPDATE USING (is_staff()) WITH CHECK (is_staff())`,
  )
  await client.query(`DROP POLICY IF EXISTS call_charges_delete ON call_charges`)
  await client.query(
    `CREATE POLICY call_charges_delete ON call_charges FOR DELETE USING (is_staff())`,
  )
  console.log('[v0] call_charges table + RLS ensured')

  await client.end()
}

main().catch((err) => {
  console.error('[v0] migration failed:', err)
  process.exit(1)
})
