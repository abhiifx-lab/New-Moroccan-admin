// lib/supabase-db.js
// Dedicated Supabase Data Access Layer for the Spa ERP.
// Replaces MongoDB collection operations while preserving 100% of single source of truth calculations and immutability.
import { supabaseServer } from './supabase/server.js'
import { v4 as uuidv4 } from 'uuid'
import { APPROVED_CENTRES, paymentSplit, cashImpact, eventSign, aggregate, drillDown, businessDate, membershipRedemption, giftCardRedemption } from './financial-engine.js'

export function clean(doc) {
  if (!doc) return null
  const r = { ...doc }
  // Ensure dual convention aliases are always populated for UI/financial engine
  if (r.event_type && !r.type) r.type = r.event_type
  if (r.type && !r.event_type) r.event_type = r.type
  if (r.date && !r.business_date) r.business_date = r.date
  if (r.business_date && !r.date) r.date = r.business_date
  return r
}

export function cleanArr(arr) {
  if (!arr || !Array.isArray(arr)) return []
  return arr.map(clean)
}

// Ensure business day exists or create one carrying forward closing cash
export async function ensureBusinessDay(supabaseClient, centre_id, date) {
  const client = supabaseClient || supabaseServer
  const { data: existing } = await client
    .from('business_days')
    .select('*')
    .eq('centre_id', centre_id)
    .eq('business_date', date)
    .single()

  if (existing) return clean(existing)

  // Find previous closed business day for opening cash carryover
  const { data: prev } = await client
    .from('business_days')
    .select('*')
    .eq('centre_id', centre_id)
    .lt('business_date', date)
    .eq('status', 'CLOSED')
    .order('business_date', { ascending: false })
    .limit(1)

  const prevDay = prev && prev[0]
  const opening = prevDay?.closing_cash_declared ?? prevDay?.closing_cash_expected ?? prevDay?.actual_closing_cash ?? 0

  const newDay = {
    id: uuidv4(),
    centre_id,
    date,
    business_date: date,
    status: 'OPEN',
    opening_cash: opening,
    closing_cash_declared: null,
    actual_closing_cash: null,
    closing_cash_expected: null,
    expected_closing_cash: 0,
    shortage_or_excess: 0,
    variance: 0,
    opened_at: new Date().toISOString(),
    closed_at: null,
    closed_by: null,
    reopen_count: 0
  }

  const { data: created, error } = await client
    .from('business_days')
    .insert(newDay)
    .select()
    .single()

  if (error && error.code !== '23505') {
    // If concurrent insert happened, fetch and return
    const { data: refetched } = await client
      .from('business_days')
      .select('*')
      .eq('centre_id', centre_id)
      .eq('business_date', date)
      .single()
    if (refetched) return clean(refetched)
    throw new Error(`Failed to ensure business day: ${error.message}`)
  }

  return clean(created || newDay)
}

export async function validateCentre(supabaseClient, centre_id) {
  const client = supabaseClient || supabaseServer
  const { data: c, error } = await client
    .from('centres')
    .select('*')
    .eq('id', centre_id)
    .eq('active', true)
    .single()

  if (error || !c) throw new Error(`Invalid or unknown centre_id: ${centre_id}`)
  if (!APPROVED_CENTRES.includes(c.name)) throw new Error(`Centre "${c.name}" is not approved`)
  return clean(c)
}

export async function writeAudit(supabaseClient, entry) {
  const client = supabaseClient || supabaseServer
  const logEntry = {
    id: uuidv4(),
    action: entry.action,
    actor: entry.actor || 'system',
    role: entry.role || null,
    centre_id: entry.centre_id || null,
    business_date: entry.business_date || null,
    target_event_id: entry.target_event_id || null,
    new_value: entry.new_value || null,
    created_at: new Date().toISOString()
  }
  await client.from('audit_logs').insert(logEntry)
}

// Enrich event without EVER mutating original events
export async function enrichEvent(supabaseClient, evRaw) {
  if (!evRaw) return null
  const ev = clean(evRaw)
  const client = supabaseClient || supabaseServer

  const { data: centre } = await client
    .from('centres')
    .select('*')
    .eq('id', ev.centre_id)
    .single()
  const enriched = { ...ev, centre: centre ? clean(centre) : null }

  // Derived: is this event reversed by another?
  const { data: reversal } = await client
    .from('events')
    .select('*')
    .eq('reverses', ev.id)
    .eq('is_reversal', true)
    .limit(1)

  const revEvent = reversal && reversal[0]
  enriched.reversed = !!revEvent
  enriched.reversal_event = revEvent ? clean(revEvent) : null

  // Derived: is this itself a reversal?
  if (ev.reverses) {
    const { data: orig } = await client
      .from('events')
      .select('*')
      .eq('id', ev.reverses)
      .single()
    enriched.original_event = orig ? clean(orig) : null
  }

  if (ev.type === 'MEMBERSHIP_SALE' && ev.membership_code) {
    const { data: m } = await client.from('memberships').select('*').eq('code', ev.membership_code).single()
    enriched.membership = m ? clean(m) : null
  }
  if (ev.type === 'GIFT_CARD_SALE' && ev.gift_card_code) {
    const { data: g } = await client.from('gift_cards').select('*').eq('code', ev.gift_card_code).single()
    enriched.gift_card = g ? clean(g) : null
  }
  if (ev.type === 'BOOKING' && ev.redemption_ref) {
    if (ev.payment_method === 'MEMBERSHIP') {
      const { data: m } = await client.from('memberships').select('*').eq('code', ev.redemption_ref).single()
      enriched.membership = m ? clean(m) : null
    } else if (ev.payment_method === 'GIFT_CARD') {
      const { data: g } = await client.from('gift_cards').select('*').eq('code', ev.redemption_ref).single()
      enriched.gift_card = g ? clean(g) : null
    }
  }

  if (ev.type === 'BOOKING') {
    const { data: booking } = await client.from('bookings').select('*').eq('event_id', ev.id).single()
    enriched.booking = booking ? clean(booking) : null
  }

  const sign = ev.is_reversal ? -1 : 1
  const split = paymentSplit(ev)
  const membershipRedeemed = membershipRedemption(ev)
  const giftCardRedeemed = giftCardRedemption(ev)
  enriched.ledger_impact = {
    revenue: (ev.type === 'BOOKING' && (ev.payment_method === 'MEMBERSHIP' || ev.payment_method === 'GIFT_CARD'))
      ? 0
      : (['BOOKING','MEMBERSHIP_SALE','GIFT_CARD_SALE'].includes(ev.type) ? sign * (ev.amount || 0) : 0),
    expense: ev.type === 'EXPENSE' ? sign * (ev.amount || 0) : 0,
    cash: sign * cashImpact(ev),
    upi_1: ['BOOKING','MEMBERSHIP_SALE','GIFT_CARD_SALE'].includes(ev.type) ? sign * split.upi_1 : (ev.type==='EXPENSE' && ev.payment_method==='UPI_1' ? -sign * (ev.amount||0) : 0),
    upi_2: ['BOOKING','MEMBERSHIP_SALE','GIFT_CARD_SALE'].includes(ev.type) ? sign * split.upi_2 : (ev.type==='EXPENSE' && ev.payment_method==='UPI_2' ? -sign * (ev.amount||0) : 0),
    card:  ['BOOKING','MEMBERSHIP_SALE','GIFT_CARD_SALE'].includes(ev.type) ? sign * split.card  : (ev.type==='EXPENSE' && ev.payment_method==='CARD'  ? -sign * (ev.amount||0) : 0),
    liability_delta: ev.type === 'MEMBERSHIP_SALE' || ev.type === 'GIFT_CARD_SALE' ? sign * (ev.amount || 0)
      : (ev.type === 'BOOKING' ? -sign * (membershipRedeemed + giftCardRedeemed) : 0),
  }

  const { data: logs } = await client
    .from('audit_logs')
    .select('*')
    .eq('target_event_id', ev.id)
    .order('created_at', { ascending: true })

  enriched.audit_history = cleanArr(logs || [])
  return enriched
}

export async function getEventsByFilter(supabaseClient, filter = {}) {
  const client = supabaseClient || supabaseServer
  let query = client.from('events').select('*')

  if (filter.centre_id && filter.centre_id !== 'ALL') {
    query = query.eq('centre_id', filter.centre_id)
  }
  if (filter.business_date) {
    if (typeof filter.business_date === 'object') {
      if (filter.business_date.$gte) query = query.gte('business_date', filter.business_date.$gte)
      if (filter.business_date.$lte) query = query.lte('business_date', filter.business_date.$lte)
    } else {
      query = query.eq('business_date', filter.business_date)
    }
  }
  if (filter.type || filter.event_type) {
    query = query.eq('event_type', filter.type || filter.event_type)
  }

  const { data, error } = await query.order('created_at', { ascending: false }).limit(5000)
  if (error) throw new Error(`Supabase read events error: ${error.message}`)
  return cleanArr(data)
}
