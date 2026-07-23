import { UpdatePasswordForm } from '@/components/auth/update-password-form'

export const metadata = {
  title: 'Set new password',
}

// The form instantiates a Supabase browser client, so this page must render at
// request time rather than being statically prerendered at build.
export const dynamic = 'force-dynamic'

export default function UpdatePasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <UpdatePasswordForm />
    </div>
  )
}
