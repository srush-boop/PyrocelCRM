'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { User, Lock, LogOut, Loader2, Building2, Users, Briefcase, Home, Wrench } from 'lucide-react'
import type { User as AuthUser } from '@supabase/supabase-js'
import type { Profile, CompanyInfo, Branch, Department, Role, PropertyType } from '@/lib/types/database'
import { CompanySettings } from './company-settings'
import { DepartmentsSettings } from './departments-settings'
import { RolesSettings } from './roles-settings'
import { PropertyTypesSettings } from './property-types-settings'
import { MaintenanceSettings } from './maintenance-settings'
import { SignatureManager } from './signature-manager'

interface SettingsContentProps {
  user: AuthUser
  profile: Profile
  company: CompanyInfo | null
  branches: Branch[]
  departments: Department[]
  roles: Role[]
  propertyTypes: PropertyType[]
}

export function SettingsContent({ user, profile, company, branches, departments, roles, propertyTypes }: SettingsContentProps) {
  const isAdmin = profile.role === 'admin'
  const userTypeLabel = profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
  const assignedRole = profile.role_ref?.name ?? profile.job_title ?? 'Not assigned'
  const [fullName, setFullName] = useState(profile.full_name || '')
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [loadingPassword, setLoadingPassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoadingProfile(true)
    setMessage(null)

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', user.id)

    setLoadingProfile(false)

    if (error) {
      setMessage({ type: 'error', text: 'Failed to update profile' })
    } else {
      setMessage({ type: 'success', text: 'Profile updated successfully' })
    }
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoadingPassword(true)
    setMessage(null)

    if (newPassword !== confirmPassword) {
      setLoadingPassword(false)
      setMessage({ type: 'error', text: 'Passwords do not match' })
      return
    }

    if (newPassword.length < 6) {
      setLoadingPassword(false)
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' })
      return
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    setLoadingPassword(false)

    if (error) {
      setMessage({ type: 'error', text: 'Failed to update password' })
    } else {
      setMessage({ type: 'success', text: 'Password updated successfully' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <Tabs defaultValue="account" className="space-y-6">
      <TabsList>
        <TabsTrigger value="account" className="gap-2">
          <User className="h-4 w-4" />
          Account
        </TabsTrigger>
        <TabsTrigger value="password" className="gap-2">
          <Lock className="h-4 w-4" />
          Password
        </TabsTrigger>
        {isAdmin && (
          <TabsTrigger value="company" className="gap-2">
            <Building2 className="h-4 w-4" />
            Company
          </TabsTrigger>
        )}
        {isAdmin && (
          <TabsTrigger value="departments" className="gap-2">
            <Users className="h-4 w-4" />
            Departments
          </TabsTrigger>
        )}
        {isAdmin && (
          <TabsTrigger value="roles" className="gap-2">
            <Briefcase className="h-4 w-4" />
            Roles
          </TabsTrigger>
        )}
        {isAdmin && (
          <TabsTrigger value="property-types" className="gap-2">
            <Home className="h-4 w-4" />
            Property Types
          </TabsTrigger>
        )}
        {isAdmin && (
          <TabsTrigger value="maintenance" className="gap-2">
            <Wrench className="h-4 w-4" />
            Maintenance
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="account" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>Update your account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={user.email || ''}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">Email cannot be changed</p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="user_type">User Type</Label>
                  <Input
                    id="user_type"
                    type="text"
                    value={userTypeLabel}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Controls your access. Managed by an administrator.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="role">Role</Label>
                  <Input
                    id="role"
                    type="text"
                    value={assignedRole}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Shown on your documents. Set by an administrator.
                  </p>
                </div>
              </div>

              {message && (
                <div
                  className={`rounded-lg p-3 text-sm ${
                    message.type === 'success'
                      ? 'bg-green-50 text-green-800'
                      : 'bg-red-50 text-red-800'
                  }`}
                >
                  {message.text}
                </div>
              )}

              <Button type="submit" disabled={loadingProfile}>
                {loadingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Signature</CardTitle>
            <CardDescription>
              Your signature is applied to reports, RAMS, documents and receipt confirmations you
              generate. Upload an image or draw one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignatureManager signatureUrl={profile.signature_url} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="password" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>Update your password to keep your account secure</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="new_password">New Password</Label>
                <Input
                  id="new_password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="confirm_password">Confirm Password</Label>
                <Input
                  id="confirm_password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                />
              </div>

              {message && (
                <div
                  className={`rounded-lg p-3 text-sm ${
                    message.type === 'success'
                      ? 'bg-green-50 text-green-800'
                      : 'bg-red-50 text-red-800'
                  }`}
                >
                  {message.text}
                </div>
              )}

              <Button type="submit" disabled={loadingPassword}>
                {loadingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Password
              </Button>
            </form>
          </CardContent>
        </Card>
      </TabsContent>

      {isAdmin && (
        <TabsContent value="company" className="space-y-4">
          <CompanySettings company={company} branches={branches} />
        </TabsContent>
      )}

      {isAdmin && (
        <TabsContent value="departments" className="space-y-4">
          <DepartmentsSettings departments={departments} />
        </TabsContent>
      )}

      {isAdmin && (
        <TabsContent value="roles" className="space-y-4">
          <RolesSettings roles={roles} />
        </TabsContent>
      )}

      {isAdmin && (
        <TabsContent value="property-types" className="space-y-4">
          <PropertyTypesSettings propertyTypes={propertyTypes} />
        </TabsContent>
      )}

      {isAdmin && (
        <TabsContent value="maintenance" className="space-y-4">
          <MaintenanceSettings company={company} />
        </TabsContent>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sign Out</CardTitle>
          <CardDescription>Sign out from your account</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleSignOut} variant="destructive" className="gap-2">
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </Tabs>
  )
}
