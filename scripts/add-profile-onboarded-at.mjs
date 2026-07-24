import pg from 'pg'

/**
 * Adds a nullable `onboarded_at timestamptz` column to `profiles`. When NULL the
 * user has not yet completed (or skipped) the first-login profile walkthrough.
 *
 * Existing users are treated as already onboarded so the wizard only ever shows
 * to genuinely new accounts — we backfill them to now().
 */
const { Client } = pg

// Supabase's pooled URL includes sslmode=require which node-postgres' verify-full
// rejects against the self-signed chain; strip it and disable strict verify.
const rawUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL || ''
if (!rawUrl) {
  console.error('No POSTGRES_URL / DATABASE_URL in environment')
  process.exit(1)
}
const connectionString = rawUrl.replace(/[?&]sslmode=[^&]+/, '')

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()

  await client.query(`
    ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;
  `)

  // Backfill: anyone who already exists has effectively finished onboarding.
  const res = await client.query(`
    UPDATE profiles
    SET onboarded_at = now()
    WHERE onboarded_at IS NULL;
  `)

  console.log(`onboarded_at column ensured; backfilled ${res.rowCount} existing profile(s).`)

  await client.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
