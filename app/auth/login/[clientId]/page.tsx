import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { LoginForm } from '@/components/auth/login-form'

export const dynamic = 'force-dynamic'

/**
 * Branded client login page: /auth/login/[clientId]
 *
 * Shows the client's uploaded logo and tagline. Runs before authentication,
 * so it reads branding with the service-role client, scoped to a single client
 * id and only the public branding columns. Falls back to Pyrocel branding if
 * the client hasn't set a logo/tagline yet.
 */
export default async function BrandedClientLoginPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = await params

  const supabase = createAdminClient()
  const { data: client } = await supabase
    .from('clients')
    .select('name, logo_url, login_tagline')
    .eq('id', clientId)
    .maybeSingle()

  if (!client) notFound()

  const hasLogo = Boolean(client.logo_url)

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <LoginForm
        logoUrl={hasLogo ? (client.logo_url as string) : undefined}
        logoAlt={hasLogo ? `${client.name} logo` : 'Pyrocel logo'}
        title={client.name}
        subtitle="Service & Compliance Portal"
        tagline={client.login_tagline || 'Your compliance, always in view.'}
      />
    </div>
  )
}
