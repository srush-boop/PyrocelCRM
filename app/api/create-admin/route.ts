import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const { email, password, fullName, setupKey } = await req.json()

    // Guard: require a setup key so this endpoint can't be called freely
    const validSetupKey = process.env.ADMIN_SETUP_KEY
    if (!validSetupKey || setupKey !== validSetupKey) {
      return NextResponse.json(
        { error: 'Invalid or missing setup key.' },
        { status: 403 },
      )
    }

    if (!email || !password || !fullName) {
      return NextResponse.json(
        { error: 'Email, password, and full name are required.' },
        { status: 400 },
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 },
      )
    }

    const adminClient = createAdminClient()

    // Create user with email_confirm bypassed (service role)
    const { data: authData, error: authError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // skip email confirmation for admin
        user_metadata: {
          full_name: fullName,
          role: 'admin',
        },
      })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Failed to create user.' },
        { status: 500 },
      )
    }

    // Upsert profile with admin role (trigger may already have run)
    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert({
        id: authData.user.id,
        email,
        full_name: fullName,
        role: 'admin',
      })

    if (profileError) {
      return NextResponse.json(
        { error: `User created but profile failed: ${profileError.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json(
      { message: 'Administrator account created successfully.' },
      { status: 201 },
    )
  } catch (err) {
    console.error('[v0] create-admin error:', err)
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 },
    )
  }
}
