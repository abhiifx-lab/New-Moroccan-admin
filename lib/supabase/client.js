// lib/supabase/client.js
// Browser client for user-safe frontend authentication and RLS-protected queries.
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zciclpvqrklutlvgcfig.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjaWNscHZxcmtsdXRsdmdjZmlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyMzQ0NDksImV4cCI6MjEwMDgxMDQ0OX0.iy8CLz9NJGgACX-eKLZ6euF5Ghchi_v8nbc7W4aSlqg'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})
