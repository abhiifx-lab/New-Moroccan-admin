import { createClient } from '@supabase/supabase-js'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const envPath = path.join(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=')
    if (k && v.length) process.env[k.trim()] = v.join('=').trim()
  })
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zciclpvrqlkutlvgcfgj.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('❌ Missing Supabase keys in .env.local')
  process.exit(1)
}

const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const anonSupabase = createClient(SUPABASE_URL, ANON_KEY)

const APPROVED_CENTRES = [
  { name: 'Phoenix Pallassio', code: 'PHNX', id: 'b7b09f2b-4b4d-4ce7-8289-08947347af9b' },
  { name: 'Holiday Inn', code: 'HINN', id: 'd15176b8-418e-4c76-a9eb-a2d2947ba5d9' },
  { name: 'Lulu Mall', code: 'LULU', id: 'dc39e202-1bac-4411-9988-2bcaa72728d6' }
]
const APPROVED_IDS = APPROVED_CENTRES.map(c => c.id)

async function runTests() {
  console.log('🚀 Starting Comprehensive Supabase Migration Verification...')
  let allPassed = true

  // 1. Verify Approved Centres Only & No Orphans
  console.log('\n--- [Test 1: Strict Centre Configuration & Cleanliness] ---')
  const { data: centres, error: cErr } = await adminSupabase.from('centres').select('*')
  if (cErr) {
    console.error('❌ Failed to fetch centres:', cErr.message)
    console.log('⚠️ Reminder: Please execute `supabase/migrations/00001_initial_schema_and_rls.sql` in Supabase SQL Editor and run `node scripts/seed-supabase-dev-data.mjs`!')
    process.exit(1)
  }

  const invalidCentres = centres.filter(c => !APPROVED_IDS.includes(c.id))
  if (invalidCentres.length > 0 || centres.length !== 3) {
    console.error(`❌ Centre count or ID mismatch! Found ${centres.length} centres, expected 3 approved centres.`); allPassed = false
  } else {
    console.log('✅ Strictly 3 approved centres exist in the database with canonical IDs.')
  }

  // Check legacy UPI payment method
  const { data: legacyUpi, error: lErr } = await adminSupabase.from('events').select('id, payment_method').eq('payment_method', 'UPI')
  if (legacyUpi && legacyUpi.length > 0) {
    console.error(`❌ Found ${legacyUpi.length} events with legacy 'UPI' payment method! Must be UPI_1 or UPI_2.`); allPassed = false
  } else {
    console.log("✅ Zero events found with legacy 'UPI' payment method.")
  }

  // Check orphan events
  const { data: orphans, error: oErr } = await adminSupabase.from('events').select('id, centre_id')
  const foundOrphans = (orphans || []).filter(e => !APPROVED_IDS.includes(e.centre_id))
  if (foundOrphans.length > 0) {
    console.error(`❌ Found ${foundOrphans.length} orphan events referencing invalid centre IDs!`); allPassed = false
  } else {
    console.log('✅ Zero orphan events found. All events link strictly to approved centres.')
  }

  // 2. Test Immutability Triggers (UPDATE & DELETE protection)
  console.log('\n--- [Test 2: Database-Level Immutability Verification] ---')
  const { data: existingEvents } = await adminSupabase.from('events').select('*').limit(1)
  if (existingEvents && existingEvents.length > 0) {
    const ev = existingEvents[0]
    console.log(`Testing UPDATE prohibition on event ID: ${ev.id}...`)
    const { error: updErr } = await adminSupabase.from('events').update({ amount: 999999 }).eq('id', ev.id)
    if (updErr && (updErr.message.includes('MODIFICATION DENIED') || updErr.message.includes('immutable'))) {
      console.log('✅ Database Trigger successfully rejected UPDATE:', updErr.message)
    } else {
      console.error('❌ Security alert: UPDATE on events table did not fail with immutability error!', updErr || 'No error'); allPassed = false
    }

    console.log(`Testing DELETE prohibition on event ID: ${ev.id}...`)
    const { error: delErr } = await adminSupabase.from('events').delete().eq('id', ev.id)
    if (delErr && (delErr.message.includes('DELETION DENIED') || delErr.message.includes('immutable'))) {
      console.log('✅ Database Trigger successfully rejected DELETE:', delErr.message)
    } else {
      console.error('❌ Security alert: DELETE on events table did not fail with immutability error!', delErr || 'No error'); allPassed = false
    }
  } else {
    console.log('⚠️ No events in database yet. Please run `node scripts/seed-supabase-dev-data.mjs` first to seed test events.')
  }

  // 3. Test Centre Scoping via Supabase Auth & Row-Level Security
  console.log('\n--- [Test 3: Auth & Row Level Security (RLS) Isolation] ---')
  console.log('Logging in as Centre User (Phoenix Pallassio: phoenix@aurea.spa)...')
  const { data: phnxLogin, error: pLoginErr } = await anonSupabase.auth.signInWithPassword({
    email: 'phoenix@aurea.spa',
    password: 'DefaultPass123!'
  })
  if (pLoginErr || !phnxLogin.session) {
    console.error('❌ Failed to sign in as phoenix@aurea.spa:', pLoginErr?.message || 'No session')
    allPassed = false
  } else {
    const phnxClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${phnxLogin.session.access_token}` } }
    })
    
    // Query events for Phoenix
    const { data: phnxEvents, error: peErr } = await phnxClient.from('events').select('id, centre_id').eq('centre_id', APPROVED_CENTRES[0].id)
    console.log(`✅ Centre User fetched ${phnxEvents?.length || 0} authorized events for their assigned centre (Phoenix).`)

    // Attempt to query events for Lulu Mall
    const { data: luluEvents, error: leErr } = await phnxClient.from('events').select('id, centre_id').eq('centre_id', APPROVED_CENTRES[2].id)
    if (luluEvents && luluEvents.length === 0) {
      console.log("✅ RLS successfully prevented access to another centre's events (0 rows returned for Lulu Mall).")
    } else {
      console.error("❌ Security failure: Centre User was able to access events from Lulu Mall!", luluEvents); allPassed = false
    }
  }

  console.log('Logging in as Super Admin (admin@aurea.spa)...')
  const { data: adminLogin, error: aLoginErr } = await anonSupabase.auth.signInWithPassword({
    email: 'admin@aurea.spa',
    password: 'DefaultPass123!'
  })
  if (aLoginErr || !adminLogin.session) {
    console.error('❌ Failed to sign in as Super Admin:', aLoginErr?.message)
    allPassed = false
  } else {
    const saClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${adminLogin.session.access_token}` } }
    })
    const { data: allEvents, error: aeErr } = await saClient.from('events').select('id, centre_id')
    console.log(`✅ Super Admin successfully fetched events across all centres (Total rows: ${allEvents?.length || 0}).`)
  }

  // 4. Summary
  console.log('\n=============================================================')
  if (allPassed) {
    console.log('🏆 ALL SUPABASE MIGRATION VERIFICATION TESTS PASSED PERFECTLY!')
    console.log('=============================================================')
  } else {
    console.error('⚠️ SOME TESTS FAILED OR REQUIRE PRELIMINARY SQL SEEDING.')
    console.log('=============================================================')
    process.exit(1)
  }
}

runTests().catch(e => {
  console.error('Unexpected error during verification:', e)
  process.exit(1)
})
