// lib/supabase/server.js
// Server client for protected API server operations using service role key or user auth context.
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zciclpvqrklutlvgcfig.supabase.co'
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Service role client for privileged backend aggregations and administrative operations
export const supabaseServer = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
})

// Helper to get an authenticated user client scoped to a Bearer token or session cookie
export function getAuthClient(accessToken) {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjaWNscHZxcmtsdXRsdmdjZmlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyMzQ0NDksImV4cCI6MjEwMDgxMDQ0OX0.iy8CLz9NJGgACX-eKLZ6euF5Ghchi_v8nbc7W4aSlqg'
  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })
}

// Helper to authenticate request and fetch active user profile & centre scoping rules
export async function authenticateRequest(request) {
  const authHeader = request.headers.get('authorization') || ''
  let token = authHeader.replace(/^Bearer\s+/i, '').trim()

  // Fallback to sb-access-token cookie if Bearer token not present in header
  if (!token) {
    const cookieHeader = request.headers.get('cookie') || ''
    const match = cookieHeader.match(/sb-access-token=([^;]+)/)
    if (match && match[1]) token = decodeURIComponent(match[1])
  }

  if (!token) return { error: 'Authentication required. No token provided.', status: 401 }

  const authClient = getAuthClient(token)
  const { data: { user }, error: userErr } = await authClient.auth.getUser()
  if (userErr || !user) {
    return { error: 'Invalid or expired authentication session.', status: 401 }
  }

  // Fetch linked profile using service role to verify active status and role assignments
  const { data: profile, error: profErr } = await supabaseServer
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profErr || !profile) {
    return { error: 'User profile not found in database.', status: 403 }
  }

  if (!profile.active) {
    return { error: 'Account is deactivated. Access denied.', status: 403 }
  }

  return { user, profile, token, authClient }
}
