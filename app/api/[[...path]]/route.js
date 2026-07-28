// app/api/[[...path]]/route.js
// Single source of truth API Router using Supabase PostgreSQL and Supabase Auth.
// Enforces required Supabase configuration and delegates to RLS-protected route handlers.

import { NextResponse } from 'next/server'
import { handleSupabaseRoute } from '@/lib/supabase-api'

// Startup validation for required Supabase environment variables
const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
]

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`CRITICAL CONFIGURATION ERROR: Missing required environment variable: ${envVar}`)
  }
}

function validateConfiguration() {
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Critical Configuration Error: Required Supabase environment variable ${envVar} is missing. The system cannot start without valid Supabase configuration.`)
    }
  }
}

function cors(res) {
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return res
}

async function handle(request, { params }) {
  if (request.method === 'OPTIONS') {
    return cors(new NextResponse(null, { status: 204 }))
  }

  try {
    validateConfiguration()
    const res = await handleSupabaseRoute(request, { params })
    return cors(res)
  } catch (err) {
    console.error('API Router Error:', err)
    return cors(NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 }))
  }
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const DELETE = handle
export const PATCH = handle
export const OPTIONS = handle
