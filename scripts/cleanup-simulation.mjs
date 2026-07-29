import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=')
    if (k && v.length) process.env[k.trim()] = v.join('=').trim()
  })
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})

const TAG = 'SIM-JULY-2026'

async function cleanup() {
  console.log(`🧹 STARTING SIMULATION CLEANUP FOR TAG: "${TAG}"`)

  // 1. Fetch all simulation event IDs
  let allEvents = []
  let fromOffset = 0
  let hasMore = true
  while (hasMore) {
    const { data, error } = await supabase
      .from('events')
      .select('id')
      .eq('created_by', TAG)
      .range(fromOffset, fromOffset + 999)
    if (error) {
      console.error('❌ Failed to fetch simulation events:', error.message)
      process.exit(1)
    }
    allEvents = allEvents.concat(data || [])
    if (!data || data.length < 1000) {
      hasMore = false
    } else {
      fromOffset += 1000
    }
  }

  const eventIds = allEvents ? allEvents.map(e => e.id) : []
  console.log(`Found ${eventIds.length} simulation events in database.`)

  if (eventIds.length > 0) {
    // Delete from child tables in chunks of 100 to avoid PostgREST URI length limits
    const CHUNK_SIZE = 100
    for (let i = 0; i < eventIds.length; i += CHUNK_SIZE) {
      const chunk = eventIds.slice(i, i + CHUNK_SIZE)
      
      const { error: errBk } = await supabase.from('bookings').delete().in('event_id', chunk)
      if (errBk) console.error('Warning deleting bookings chunk:', errBk.message)

      const { error: errExp } = await supabase.from('expenses').delete().in('event_id', chunk)
      if (errExp) console.error('Warning deleting expenses chunk:', errExp.message)

      const { error: errCm } = await supabase.from('cash_movements').delete().in('event_id', chunk)
      if (errCm) console.error('Warning deleting cash movements chunk:', errCm.message)

      const { error: errMb } = await supabase.from('memberships').delete().in('source_event_id', chunk)
      if (errMb) console.error('Warning deleting memberships chunk:', errMb.message)

      const { error: errGc } = await supabase.from('gift_cards').delete().in('source_event_id', chunk)
      if (errGc) console.error('Warning deleting gift cards chunk:', errGc.message)

      const { error: errAl } = await supabase.from('audit_logs').delete().in('target_event_id', chunk)
      if (errAl) console.error('Warning deleting audit logs chunk:', errAl.message)
    }
  }

  // Delete from other tables by text identifier
  console.log('Purging customers...')
  const { error: errCust } = await supabase.from('customers').delete().like('name', `%${TAG}%`)
  if (errCust) console.error('Warning deleting customers:', errCust.message)

  console.log('Purging therapists...')
  const { error: errTher } = await supabase.from('therapists').delete().like('name', `%${TAG}%`)
  if (errTher) console.error('Warning deleting therapists:', errTher.message)

  console.log('Purging business days for July 2026...')
  const { error: errBd } = await supabase.from('business_days').delete().like('business_date', '2026-07-%')
  if (errBd) console.error('Warning deleting business days:', errBd.message)

  console.log('Purging extra audit logs by actor...')
  const { error: errAlActor } = await supabase.from('audit_logs').delete().eq('actor', TAG)
  if (errAlActor) console.error('Warning deleting audit logs by actor:', errAlActor.message)

  // Attempt to delete from events table directly (will fail if trigger is enabled, which is expected and documented)
  console.log('Attempting to delete simulation events directly (expecting trigger restriction)...')
  const { error: errEv } = await supabase.from('events').delete().like('business_date', '2026-07-%')
  if (errEv) {
    console.log('ℹ️ Immutable events table delete was blocked by database triggers as expected.')
    console.log('\n👉 TO CLEAN UP THE IMMUTABLE EVENTS TABLE, PLEASE RUN THE FOLLOWING SQL IN YOUR SUPABASE SQL EDITOR:\n')
    console.log(`ALTER TABLE events DISABLE TRIGGER trg_prevent_event_update_delete;`)
    console.log(`DELETE FROM events WHERE business_date LIKE '2026-07-%';`)
    console.log(`ALTER TABLE events ENABLE TRIGGER trg_prevent_event_update_delete;\n`)
  } else {
    console.log('✅ Cleaned up events table successfully (triggers were not active).')
  }

  console.log('🎉 Cleanup script execution completed!')
}

cleanup()
