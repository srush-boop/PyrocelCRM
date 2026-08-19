import pg from 'pg'

/**
 * Forced first-login password change.
 *
 * When an admin creates a staff account they set the initial password (and can
 * email it to the user). `profiles.must_change_password` flags that the user is
 * still on that admin-set password: the dashboard layout redirects them to a
 * forced change-password screen until they set their own. Cleared to false once
 * they choose a new password.
 *
 * NOT NULL default false, so all pre-existing users are unaffected (they never
 * see the prompt).
 */
const { Client } = pg

// Supabase's pooled URL includes sslmode=require which node-postgres' verify-full
// rejects against the self-signed chain; strip it and disable strict verify.
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
    ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
  `)

  console.log('profiles.must_change_password column ensured.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => client.end())
