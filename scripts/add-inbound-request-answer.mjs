import pg from 'pg'

/**
 * Adds AI-prepared answer columns to `inbound_requests`. These back the
 * "research -> draft -> confirm -> send" flow: at triage the AI researches real
 * system data and drafts a reply; staff review/edit then Send now or Copy draft.
 *
 * All columns are NULLABLE (a request without a prepared answer just has them
 * NULL). No RLS change — the existing admin/office policy on the table applies.
 *
 *   answer_kind        'reports' | 'next_due' | 'quote_status' | 'service_history' | 'account_info'
 *   answer_subject     drafted email subject
 *   answer_body        drafted reply text (plain / light markdown)
 *   answer_facts       jsonb structured supporting data (report links, dates, quote rows)
 *   answer_prepared_at when the draft was prepared
 *   answer_sent_at     when it was emailed to the client
 *   answer_sent_to     recipients it was sent to
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

  await client.query(`
    ALTER TABLE inbound_requests
      ADD COLUMN IF NOT EXISTS answer_kind text,
      ADD COLUMN IF NOT EXISTS answer_subject text,
      ADD COLUMN IF NOT EXISTS answer_body text,
      ADD COLUMN IF NOT EXISTS answer_facts jsonb,
      ADD COLUMN IF NOT EXISTS answer_prepared_at timestamptz,
      ADD COLUMN IF NOT EXISTS answer_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS answer_sent_to text[];
  `)

  console.log('inbound_requests answer columns ensured.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => client.end())
