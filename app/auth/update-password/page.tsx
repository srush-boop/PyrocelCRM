import { UpdatePasswordForm } from '@/components/auth/update-password-form'

export const metadata = {
  title: 'Set new password',
}

export default function UpdatePasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <UpdatePasswordForm />
    </div>
  )
}
