// Migration: preserve engineer attribution on completed calls so an engineer
// account can be deleted without losing who closed their historical work.
//
// Root cause this fixes: deleting a profile nulls tasks.assigned_engineer_id via
// ON DELETE SET NULL, but the prevent_completed_task_reassignment() trigger
// rejected ANY assignee change on a completed call — including that null — so
// the whole delete aborted with "Completed calls cannot be reassigned".
//
// Approach ("snapshot then unassign"):
//   1. Add tasks.completed_engineer_name (text, nullable).
//   2. Backfill it for every completed call that still has an assignee.
//   3. Rewrite the trigger to (a) snapshot the engineer name on completion,
//      (b) allow unassign-to-NULL on a completed call (capturing the name from
//      the outgoing engineer first), and (c) still block genuine engineer->
//      engineer reassignment of a completed call.
//
// DDL here needs the direct (non-pooling) connection — the pooled URL throws
// InitPostgres on schema changes in this project.
import pg from 'pg'

const rawUrl =
  process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL || ''
if (!rawUrl) {
  console.error('No Postgres connection string found in env.')
  process.exit(1)
}
// Supabase's verify-full cert is self-signed for `pg`; strip sslmode and relax.
const url = rawUrl.replace(/[?&]sslmode=[^&]*/i, '')

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()
  try {
    await client.query('BEGIN')

    // 1. Column.
    await client.query(`
      ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS completed_engineer_name text;
    `)

    // 2. Backfill from current assignee for completed calls missing a snapshot.
    const backfill = await client.query(`
      UPDATE tasks t
      SET completed_engineer_name = p.full_name
      FROM profiles p
      WHERE t.assigned_engineer_id = p.id
        AND t.status = 'completed'
        AND (t.completed_engineer_name IS NULL OR t.completed_engineer_name = '');
    `)
    console.log(`Backfilled completed_engineer_name on ${backfill.rowCount} completed call(s).`)

    // 3. Rewrite the trigger function.
    await client.query(`
      CREATE OR REPLACE FUNCTION prevent_completed_task_reassignment()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $fn$
      BEGIN
        -- Snapshot the engineer's name onto the completed call so attribution
        -- survives if that engineer's account is later deleted.
        IF new.status = 'completed'
           AND new.assigned_engineer_id IS NOT NULL
           AND (new.completed_engineer_name IS NULL OR new.completed_engineer_name = '') THEN
          SELECT full_name INTO new.completed_engineer_name
          FROM profiles WHERE id = new.assigned_engineer_id;
        END IF;

        -- Unassigning a completed call (e.g. the engineer's account is deleted,
        -- which nulls this FK via ON DELETE SET NULL) is allowed. Capture the
        -- outgoing engineer's name first if we don't already have it.
        IF old.status = 'completed'
           AND new.status = 'completed'
           AND old.assigned_engineer_id IS NOT NULL
           AND new.assigned_engineer_id IS NULL THEN
          IF new.completed_engineer_name IS NULL OR new.completed_engineer_name = '' THEN
            SELECT full_name INTO new.completed_engineer_name
            FROM profiles WHERE id = old.assigned_engineer_id;
          END IF;
          RETURN new;
        END IF;

        -- Otherwise keep the original guard: a completed call must not be moved
        -- from one engineer to a DIFFERENT engineer.
        IF old.status = 'completed'
           AND new.status = 'completed'
           AND new.assigned_engineer_id IS DISTINCT FROM old.assigned_engineer_id THEN
          RAISE EXCEPTION 'Completed calls cannot be reassigned'
            USING errcode = 'check_violation';
        END IF;

        RETURN new;
      END;
      $fn$;
    `)

    await client.query('COMMIT')
    console.log('Trigger prevent_completed_task_reassignment() updated. Migration complete.')
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('Migration failed, rolled back:', e.message)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

main()
