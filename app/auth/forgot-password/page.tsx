import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'

export const metadata = {
  title: 'Reset password',
}

// The form instantiates a Supabase browser client, so this page must render at
// request time (not be statically prerendered at build, where the browser env
// vars aren't available and the client constructor would throw).
export const dynamic = 'force-dynamic'

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <ForgotPasswordForm />
    </div>
  )
}
