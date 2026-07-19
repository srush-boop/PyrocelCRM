import { LoginForm } from '@/components/auth/login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const notice =
    error === 'account-inactive'
      ? 'Your account is not active yet. Please contact an administrator.'
      : undefined

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <LoginForm notice={notice} />
    </div>
  )
}
