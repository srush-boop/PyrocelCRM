import pg from 'pg'

/**
 * Staff Surveys (admin-only) built on the Internal Tasks engine.
 *
 * A survey is a third `task_kind` on internal_task_templates ('survey'),
 * reusing the existing question builder + all/roles/departments/individuals
 * targeting + the fill sheet + submitInternalTask. This migration:
 *   1) widens the task_kind CHECK constraint to allow 'survey'
 *   2) adds survey-only configuration/state columns to internal_task_templates
 *
 * No new tables: survey responses are ordinary internal_task_instances whose
 * template is a survey. RLS already lets a quality manager (admin) insert
 * instances for others and read them all, and lets respondents fill their own.
 */
const { Client } = pg

const rawUrl =
  process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL || ''
if (!rawUrl) {
  console.error('No POSTGRES_URL / DATABASE_URL in environment')
  process.exit(1)
}
const connectionString = rawUrl.replace(/[?&]sslmode=[^&]+/, '')
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()

  // 1) Allow the new task_kind.
  await client.query(`
    ALTER TABLE internal_task_templates
      DROP CONSTRAINT IF EXISTS internal_task_templates_task_kind_check;
  `)
  await client.query(`
    ALTER TABLE internal_task_templates
      ADD CONSTRAINT internal_task_templates_task_kind_check
      CHECK (task_kind = ANY (ARRAY['recurring'::text, 'on_demand'::text, 'survey'::text]));
  `)

  // 2) Survey-only columns.
  await client.query(`
    ALTER TABLE internal_task_templates
      ADD COLUMN IF NOT EXISTS survey_anonymous boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS survey_closes_at timestamptz,
      ADD COLUMN IF NOT EXISTS survey_closed_at timestamptz,
      ADD COLUMN IF NOT EXISTS survey_published_at timestamptz,
      ADD COLUMN IF NOT EXISTS survey_summary_recipient_ids uuid[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS survey_summary_sent_at timestamptz;
  `)

  console.log('Surveys: task_kind check widened + survey_* columns ensured.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => client.end())
