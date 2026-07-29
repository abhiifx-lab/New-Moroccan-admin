// lib/supabase-api.js
// Supabase REST API & RBAC Route Handlers replacing MongoDB operations.
// Preserves 100% of single source of truth calculations, immutability rules, and response contracts.

import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { supabaseServer, authenticateRequest } from './supabase/server.js'
import { clean, cleanArr, ensureBusinessDay, validateCentre, writeAudit, enrichEvent, getEventsByFilter } from './supabase-db.js'
import { EVENT_TYPES, METRICS, aggregate, drillDown, businessDate, periodLabel, eventSign, cashImpact, paymentSplit } from './financial-engine.js'

function cors(res) {
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return res
}

function toCsv(rows, columns) {
  const escape = v => {
    if (v == null) return ''
    const s = String(v)
    if (s.includes('"') || s.includes(',') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }
  const header = columns.map(c => escape(c.label)).join(',')
  const body = rows.map(r => columns.map(c => escape(c.get(r))).join(',')).join('\n')
  return header + '\n' + body
}

// Ensure RBAC Centre scoping: Centre Users can only access their assigned centre
function enforceCentreReadScope(authContext, requestedCentreId) {
  if (!authContext || !authContext.profile) return { error: 'Unauthorized', status: 401 }
  const { profile } = authContext

  if (profile.role === 'SUPER_ADMIN') {
    return { centre_id: requestedCentreId || 'ALL' }
  }

  if (profile.role === 'CENTRE_USER') {
    // Centre User cannot request ALL or another centre's ID
    if (requestedCentreId && requestedCentreId !== 'ALL' && requestedCentreId !== profile.centre_id) {
      return { error: 'Forbidden: Centre User cannot access or export data for another centre.', status: 403 }
    }
    if (requestedCentreId === 'ALL') {
      return { error: 'Forbidden: Centre User cannot request ALL centres.', status: 403 }
    }
    return { centre_id: profile.centre_id }
  }

  return { error: 'Forbidden: Invalid user role assignment.', status: 403 }
}

function enforceCentreWriteScope(authContext, bodyCentreId) {
  if (!authContext || !authContext.profile) return { error: 'Unauthorized', status: 401 }
  const { profile } = authContext

  if (profile.role === 'SUPER_ADMIN') {
    return { centre_id: bodyCentreId }
  }

  if (profile.role === 'CENTRE_USER') {
    if (bodyCentreId && bodyCentreId !== profile.centre_id) {
      return { error: 'Forbidden: Centre User cannot override assigned centre_id in request body.', status: 403 }
    }
    return { centre_id: profile.centre_id }
  }

  return { error: 'Forbidden: Invalid role.', status: 403 }
}

// The database currently has two persisted roles. A centre user is the
// operational manager for their assigned centre; this mapping is intentionally
// server-side so a request body can never elevate privileges.
function operationalRole(authContext) {
  if (authContext?.profile?.role === 'SUPER_ADMIN') return 'SUPER_ADMIN'
  if (authContext?.profile?.role === 'CENTRE_USER') return 'MANAGER'
  return null
}

function requireManager(authContext) {
  const role = operationalRole(authContext)
  return role ? { role } : { error: 'Forbidden: Manager+ required', status: 403 }
}

export async function handleSupabaseRoute(request, { params }) {
  const { path = [] } = await params
  const route = '/' + path.join('/')
  const method = request.method
  const url = new URL(request.url)
  const q = Object.fromEntries(url.searchParams)
  const db = supabaseServer

  try {
    if (route === '/' || route === '/root') return cors(NextResponse.json({ ok: true, app: 'Spa ERP (Supabase Engine)' }))

    // ---------------- AUTHENTICATION ENDPOINTS ----------------
    if (route === '/auth/login' && method === 'POST') {
      const { email, password } = await request.json()
      const { data: authData, error: authErr } = await db.auth.signInWithPassword({ email, password })
      if (authErr || !authData.user) {
        return cors(NextResponse.json({ error: authErr ? authErr.message : 'Invalid credentials' }, { status: 401 }))
      }

      const { data: profile, error: profErr } = await db.from('profiles').select('*').eq('id', authData.user.id).single()
      if (profErr || !profile) {
        return cors(NextResponse.json({ error: 'User profile not found or inactive' }, { status: 403 }))
      }
      if (!profile.active) {
        return cors(NextResponse.json({ error: 'User account is deactivated' }, { status: 403 }))
      }

      let centre = null
      if (profile.centre_id) {
        const { data: c } = await db.from('centres').select('*').eq('id', profile.centre_id).single()
        centre = clean(c)
      }

      const res = NextResponse.json({ ok: true, user: authData.user, profile, centre, token: authData.session.access_token })
      res.cookies.set('sb-access-token', authData.session.access_token, { httpOnly: true, path: '/', sameSite: 'strict', maxAge: 86400 })
      return cors(res)
    }

    if (route === '/auth/logout' && method === 'POST') {
      const res = NextResponse.json({ ok: true })
      res.cookies.set('sb-access-token', '', { httpOnly: true, path: '/', maxAge: 0 })
      return cors(res)
    }

    if (route === '/auth/me' && method === 'GET') {
      const auth = await authenticateRequest(request)
      if (auth.error) return cors(NextResponse.json({ error: auth.error }, { status: auth.status }))
      let centre = null
      if (auth.profile.centre_id) {
        const { data: c } = await db.from('centres').select('*').eq('id', auth.profile.centre_id).single()
        centre = clean(c)
      }
      return cors(NextResponse.json({ ok: true, user: auth.user, profile: auth.profile, centre }))
    }

    if (route === '/auth/reset-password' && method === 'POST') {
      const { email } = await request.json()
      const { error } = await db.auth.resetPasswordForEmail(email)
      if (error) return cors(NextResponse.json({ error: error.message }, { status: 400 }))
      return cors(NextResponse.json({ ok: true, message: 'Password reset email sent' }))
    }

    // ---------------- USER MANAGEMENT (Super Admin Only) ----------------
    if (route === '/users' && method === 'GET') {
      const auth = await authenticateRequest(request)
      if (auth.error || auth.profile.role !== 'SUPER_ADMIN') return cors(NextResponse.json({ error: 'Forbidden: Super Admin required' }, { status: 403 }))
      const { data: profiles } = await db.from('profiles').select('*').order('created_at', { ascending: false })
      return cors(NextResponse.json(cleanArr(profiles)))
    }

    if (route === '/users' && method === 'POST') {
      const auth = await authenticateRequest(request)
      if (auth.error || auth.profile.role !== 'SUPER_ADMIN') return cors(NextResponse.json({ error: 'Forbidden: Super Admin required' }, { status: 403 }))
      const { email, password, full_name, role, centre_id } = await request.json()
      if (role === 'CENTRE_USER' && !centre_id) return cors(NextResponse.json({ error: 'centre_id required for CENTRE_USER' }, { status: 400 }))
      if (!password || password.length < 8) return cors(NextResponse.json({ error: 'Secure temporary password (min 8 chars) required' }, { status: 400 }))

      const { data: created, error: createErr } = await db.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name, force_password_reset: true, temporary_password: true }
      })
      if (createErr) return cors(NextResponse.json({ error: createErr.message }, { status: 400 }))

      const newProfile = {
        id: created.user.id, email, full_name, role, centre_id: role === 'SUPER_ADMIN' ? null : centre_id, active: true, updated_at: new Date().toISOString()
      }
      await db.from('profiles').upsert(newProfile)
      return cors(NextResponse.json({ ok: true, profile: newProfile }))
    }

    // ---------------- REFERENCE ENDPOINTS ----------------
    if (route === '/centres' && method === 'GET') {
      const { data: centres } = await db.from('centres').select('*').eq('active', true).order('name')
      return cors(NextResponse.json(cleanArr(centres)))
    }

    if (route === '/services' && method === 'GET') {
      const { data: s } = await db.from('services').select('*').eq('active', true)
      return cors(NextResponse.json(cleanArr(s)))
    }

    if (route === '/metrics' && method === 'GET') {
      const out = {}
      for (const [k, v] of Object.entries(METRICS)) out[k] = { label: v.label, isCount: !!v.isCount, unique: v.unique || null }
      return cors(NextResponse.json(out))
    }

    // The service-role database client bypasses RLS, so every operational route
    // below must authenticate before it reads or writes business data.
    const auth = await authenticateRequest(request)
    if (auth.error) return cors(NextResponse.json({ error: auth.error }, { status: auth.status }))
    const isProtected = true

    // ---------------- EVENTS READ ----------------
    if (route === '/events' && method === 'GET') {
      let scopedCentreId = q.centre_id || 'ALL'
      if (isProtected) {
        const scope = enforceCentreReadScope(auth, scopedCentreId)
        if (scope.error) return cors(NextResponse.json({ error: scope.error }, { status: scope.status }))
        scopedCentreId = scope.centre_id
      }
      const filter = { centre_id: scopedCentreId }
      if (q.date) filter.business_date = q.date
      if (q.from && q.to) filter.business_date = { $gte: q.from, $lte: q.to }
      if (q.type) filter.type = q.type
      const events = await getEventsByFilter(db, filter)
      return cors(NextResponse.json(events))
    }

    if (route.startsWith('/events/') && !route.includes('/reverse') && method === 'GET') {
      const id = route.split('/')[2]
      const { data: ev } = await db.from('events').select('*').eq('id', id).single()
      if (!ev) return cors(NextResponse.json({ error: 'Not found' }, { status: 404 }))

      if (isProtected && auth.profile.role === 'CENTRE_USER' && ev.centre_id !== auth.profile.centre_id) {
        return cors(NextResponse.json({ error: 'Forbidden: Centre User cannot access another centre event' }, { status: 403 }))
      }

      const enriched = await enrichEvent(db, ev)
      return cors(NextResponse.json(enriched))
    }

    // ---------------- EVENTS CREATE ----------------
    if (route === '/events/booking' && method === 'POST') {
      const b = await request.json()
      let centreId = b.centre_id
      if (isProtected) {
        const scope = enforceCentreWriteScope(auth, b.centre_id)
        if (scope.error) return cors(NextResponse.json({ error: scope.error }, { status: scope.status }))
        centreId = scope.centre_id
      }

      await validateCentre(db, centreId)
      const date = b.business_date || businessDate()
      const bd = await ensureBusinessDay(db, centreId, date)
      if (bd.status === 'CLOSED') return cors(NextResponse.json({ error: 'Business day is closed. Authorized reopen required.' }, { status: 400 }))

      const event = {
        id: uuidv4(),
        event_type: EVENT_TYPES.BOOKING,
        type: EVENT_TYPES.BOOKING,
        centre_id: centreId,
        business_date: date,
        created_at: new Date().toISOString(),
        created_by: auth.profile.email,
        customer: b.customer,
        therapist: b.therapist || '',
        service_id: b.service_id || null,
        service_name: b.service_name || '',
        amount: Number(b.amount) || 0,
        payment_method: b.payment_method,
        payment_breakdown: b.payment_breakdown || null,
        booking_time: b.booking_time || new Date().toISOString(),
        status: b.status || 'COMPLETED',
        redemption_ref: b.redemption_ref || null,
        notes: b.notes || '',
        is_reversal: false,
        reverses: null
      }

      if (event.payment_method === 'MEMBERSHIP') {
        const { data: m } = await db.from('memberships').select('*').eq('code', event.redemption_ref).single()
        if (!m) return cors(NextResponse.json({ error: 'Membership not found' }, { status: 400 }))
        if (m.reversed) return cors(NextResponse.json({ error: 'Membership was reversed' }, { status: 400 }))
        if ((m.remaining_paise || 0) < event.amount) return cors(NextResponse.json({ error: 'Insufficient membership balance' }, { status: 400 }))

        const updatedRedemptions = [...(m.redemptions || []), { event_id: event.id, centre_id: event.centre_id, amount: event.amount, date }]
        await db.from('memberships').update({
          remaining_paise: m.remaining_paise - event.amount,
          redemption_count: (m.redemption_count || 0) + 1,
          redemptions: updatedRedemptions
        }).eq('code', m.code)
      }

      if (event.payment_method === 'GIFT_CARD') {
        const { data: g } = await db.from('gift_cards').select('*').eq('code', event.redemption_ref).single()
        if (!g) return cors(NextResponse.json({ error: 'Gift card not found' }, { status: 400 }))
        if (g.reversed) return cors(NextResponse.json({ error: 'Gift card was reversed' }, { status: 400 }))
        if ((g.remaining_paise || 0) < event.amount) return cors(NextResponse.json({ error: 'Insufficient gift card balance' }, { status: 400 }))

        const updatedRedemptions = [...(g.redemptions || []), { event_id: event.id, centre_id: event.centre_id, amount: event.amount, date }]
        await db.from('gift_cards').update({
          remaining_paise: g.remaining_paise - event.amount,
          redemption_count: (g.redemption_count || 0) + 1,
          redemptions: updatedRedemptions
        }).eq('code', g.code)
      }

      const { error: insErr } = await db.from('events').insert(event)
      if (insErr) throw new Error(`Booking insert error: ${insErr.message}`)

      // Operational reference insert
      await db.from('bookings').insert({
        id: uuidv4(), event_id: event.id, centre_id: event.centre_id, customer: event.customer,
        therapist: event.therapist, service_id: event.service_id, service_name: event.service_name,
        amount_paise: event.amount, business_date: date, status: event.status
      })

      await writeAudit(db, {
        action: 'CREATE_EVENT', actor: event.created_by, role: operationalRole(auth),
        centre_id: event.centre_id, business_date: date, target_event_id: event.id,
        new_value: { type: event.type, amount: event.amount, payment_method: event.payment_method }
      })
      return cors(NextResponse.json(clean(event)))
    }

    if (route === '/events/membership' && method === 'POST') {
      const b = await request.json()
      let centreId = b.centre_id
      if (isProtected) {
        const scope = enforceCentreWriteScope(auth, b.centre_id)
        if (scope.error) return cors(NextResponse.json({ error: scope.error }, { status: scope.status }))
        centreId = scope.centre_id
      }
      await validateCentre(db, centreId)
      const date = b.business_date || businessDate()
      const bd = await ensureBusinessDay(db, centreId, date)
      if (bd.status === 'CLOSED') return cors(NextResponse.json({ error: 'Business day is closed. Authorized reopen required.' }, { status: 400 }))

      const code = 'MEM-' + uuidv4().slice(0, 8).toUpperCase()
      const event = {
        id: uuidv4(), event_type: EVENT_TYPES.MEMBERSHIP_SALE, type: EVENT_TYPES.MEMBERSHIP_SALE,
        centre_id: centreId, business_date: date, created_at: new Date().toISOString(), created_by: auth.profile.email,
        customer: b.buyer, amount: Number(b.price_paise) || 0, payment_method: b.payment_method, payment_breakdown: b.payment_breakdown || null,
        membership_code: code, is_reversal: false, reverses: null, notes: b.notes || ''
      }
      const membership = {
        code, buyer: b.buyer, recipient: b.recipient || b.buyer,
        original_paise: Number(b.value_paise) || 0, remaining_paise: Number(b.value_paise) || 0,
        price_paise: Number(b.price_paise) || 0, sold_at_centre_id: centreId, sold_at_date: date,
        payment_method: b.payment_method, active: true, reversed: false, source_event_id: event.id, redemptions: []
      }
      await db.from('events').insert(event)
      await db.from('memberships').insert(membership)
      await writeAudit(db, { action: 'SELL_MEMBERSHIP', actor: event.created_by, role: operationalRole(auth), centre_id: centreId, business_date: date, target_event_id: event.id, new_value: { code, value: membership.original_paise } })
      return cors(NextResponse.json({ ok: true, event: clean(event), membership: clean(membership) }))
    }

    if (route === '/events/gift-card' && method === 'POST') {
      const b = await request.json()
      let centreId = b.centre_id
      if (isProtected) {
        const scope = enforceCentreWriteScope(auth, b.centre_id)
        if (scope.error) return cors(NextResponse.json({ error: scope.error }, { status: scope.status }))
        centreId = scope.centre_id
      }
      await validateCentre(db, centreId)
      const date = b.business_date || businessDate()
      const bd = await ensureBusinessDay(db, centreId, date)
      if (bd.status === 'CLOSED') return cors(NextResponse.json({ error: 'Business day is closed. Authorized reopen required.' }, { status: 400 }))

      const code = 'GC-' + uuidv4().slice(0, 8).toUpperCase()
      const event = {
        id: uuidv4(), event_type: EVENT_TYPES.GIFT_CARD_SALE, type: EVENT_TYPES.GIFT_CARD_SALE,
        centre_id: centreId, business_date: date, created_at: new Date().toISOString(), created_by: auth.profile.email,
        customer: b.buyer, amount: Number(b.price_paise) || 0, payment_method: b.payment_method, payment_breakdown: b.payment_breakdown || null,
        gift_card_code: code, is_reversal: false, reverses: null, notes: b.notes || ''
      }
      const giftCard = {
        code, buyer: b.buyer, recipient: b.recipient || b.buyer,
        original_paise: Number(b.value_paise) || 0, remaining_paise: Number(b.value_paise) || 0,
        price_paise: Number(b.price_paise) || 0, sold_at_centre_id: centreId, sold_at_date: date,
        payment_method: b.payment_method, active: true, reversed: false, source_event_id: event.id, redemptions: []
      }
      await db.from('events').insert(event)
      await db.from('gift_cards').insert(giftCard)
      await writeAudit(db, { action: 'SELL_GIFT_CARD', actor: event.created_by, role: operationalRole(auth), centre_id: centreId, business_date: date, target_event_id: event.id, new_value: { code, value: giftCard.original_paise } })
      return cors(NextResponse.json({ ok: true, event: clean(event), gift_card: clean(giftCard) }))
    }

    if (route === '/events/expense' && method === 'POST') {
      const b = await request.json()
      let centreId = b.centre_id
      if (isProtected) {
        const scope = enforceCentreWriteScope(auth, b.centre_id)
        if (scope.error) return cors(NextResponse.json({ error: scope.error }, { status: scope.status }))
        centreId = scope.centre_id
      }
      await validateCentre(db, centreId)
      const date = b.business_date || businessDate()
      const bd = await ensureBusinessDay(db, centreId, date)
      if (bd.status === 'CLOSED') return cors(NextResponse.json({ error: 'Business day is closed. Authorized reopen required.' }, { status: 400 }))

      const event = {
        id: uuidv4(), event_type: EVENT_TYPES.EXPENSE, type: EVENT_TYPES.EXPENSE,
        centre_id: centreId, business_date: date, created_at: new Date().toISOString(), created_by: auth.profile.email,
        amount: Number(b.amount) || 0, payment_method: b.payment_method || 'CASH', category: b.category || 'General',
        notes: b.notes || '', is_reversal: false, reverses: null
      }
      await db.from('events').insert(event)
      await db.from('expenses').insert({ id: uuidv4(), event_id: event.id, centre_id: centreId, category: event.category, amount_paise: event.amount, payment_method: event.payment_method, business_date: date, notes: event.notes })
      await writeAudit(db, { action: 'CREATE_EXPENSE', actor: event.created_by, role: operationalRole(auth), centre_id: centreId, business_date: date, target_event_id: event.id, new_value: { category: event.category, amount: event.amount } })
      return cors(NextResponse.json(clean(event)))
    }

    if (route === '/events/cash-movement' && method === 'POST') {
      const b = await request.json()
      let centreId = b.centre_id
      if (isProtected) {
        const scope = enforceCentreWriteScope(auth, b.centre_id)
        if (scope.error) return cors(NextResponse.json({ error: scope.error }, { status: scope.status }))
        centreId = scope.centre_id
      }
      await validateCentre(db, centreId)
      const date = b.business_date || businessDate()
      const bd = await ensureBusinessDay(db, centreId, date)
      if (bd.status === 'CLOSED') return cors(NextResponse.json({ error: 'Business day is closed. Authorized reopen required.' }, { status: 400 }))

      // A transfer is always initiated from the sending centre. The database
      // RPC creates both ledger rows, mirrors, and audit record in one transaction.
      if (b.movement_type === 'CASH_TRANSFER_IN' && b.counterparty_centre_id) {
        return cors(NextResponse.json({ error: 'Initiate an inter-centre transfer from the sending centre as CASH_TRANSFER_OUT.' }, { status: 400 }))
      }
      if (b.movement_type === 'CASH_TRANSFER_OUT' && b.counterparty_centre_id) {
        const sourceCentreId = centreId
        const destCentreId = b.counterparty_centre_id
        const amount = Number(b.amount)
        if (!Number.isInteger(amount) || amount <= 0) return cors(NextResponse.json({ error: 'Transfer amount must be a positive paise integer' }, { status: 400 }))
        if (sourceCentreId === destCentreId) return cors(NextResponse.json({ error: 'Source and destination centres must be different' }, { status: 400 }))

        await validateCentre(db, destCentreId)
        const destBd = await ensureBusinessDay(db, destCentreId, date)
        if (destBd.status === 'CLOSED') return cors(NextResponse.json({ error: 'Destination counterparty business day is closed. Authorized reopen required.' }, { status: 400 }))

        const transferRef = 'TRF-' + uuidv4().slice(0, 8).toUpperCase()
        const actor = auth.profile.email
        const { data: transfer, error: transferErr } = await db.rpc('create_intercentre_cash_transfer', {
          p_source_centre_id: sourceCentreId,
          p_destination_centre_id: destCentreId,
          p_business_date: date,
          p_amount: amount,
          p_created_by: actor,
          p_notes: b.notes || '',
          p_transfer_ref: transferRef,
          p_role: operationalRole(auth)
        })
        if (transferErr) throw new Error(`Inter-centre transfer failed: ${transferErr.message}`)

        const result = Array.isArray(transfer) ? transfer[0] : transfer
        const { data: outEvent, error: outErr } = await db.from('events').select('*').eq('id', result?.out_event_id).single()
        if (outErr || !outEvent) throw new Error('Transfer created but source event could not be read')
        return cors(NextResponse.json({ ...clean(outEvent), transfer_ref: transferRef, counterparty_centre_id: destCentreId, linked_event_id: result.in_event_id }))
      }

      const event = {
        id: uuidv4(), event_type: EVENT_TYPES.CASH_MOVEMENT, type: EVENT_TYPES.CASH_MOVEMENT,
        centre_id: centreId, business_date: date, created_at: new Date().toISOString(), created_by: auth.profile.email,
        amount: Number(b.amount) || 0, payment_method: 'CASH', movement_type: b.movement_type,
        notes: b.notes || '', is_reversal: false, reverses: null
      }
      await db.from('events').insert(event)
      await db.from('cash_movements').insert({ id: uuidv4(), event_id: event.id, centre_id: centreId, movement_type: event.movement_type, amount_paise: event.amount, business_date: date, notes: event.notes })
      await writeAudit(db, { action: 'CASH_MOVEMENT', actor: event.created_by, role: operationalRole(auth), centre_id: centreId, business_date: date, target_event_id: event.id, new_value: { movement_type: event.movement_type, amount: event.amount } })
      return cors(NextResponse.json(clean(event)))
    }

    // ---------------- REVERSAL WRITES (Immutability Preservation) ----------------
    if (route.startsWith('/events/') && route.endsWith('/reverse') && method === 'POST') {
      const id = route.split('/')[2]
      const { reason = '' } = await request.json()
      const manager = requireManager(auth)
      if (manager.error) return cors(NextResponse.json({ error: manager.error }, { status: manager.status }))
      if (!reason.trim()) return cors(NextResponse.json({ error: 'Non-empty reason required for reversal' }, { status: 400 }))

      const { data: origRaw } = await db.from('events').select('*').eq('id', id).single()
      if (!origRaw) return cors(NextResponse.json({ error: 'Original event not found' }, { status: 404 }))
      const original = clean(origRaw)

      if (isProtected && auth.profile.role === 'CENTRE_USER' && original.centre_id !== auth.profile.centre_id) {
        return cors(NextResponse.json({ error: 'Forbidden: Cannot reverse event from another centre' }, { status: 403 }))
      }

      // Reject reversal if business day is closed
      const origBd = await ensureBusinessDay(db, original.centre_id, original.business_date)
      if (origBd.status === 'CLOSED') {
        return cors(NextResponse.json({ error: 'Business day is closed. Authorized reopen required.' }, { status: 400 }))
      }

      if (original.is_reversal) return cors(NextResponse.json({ error: 'Cannot reverse a reversal' }, { status: 400 }))
      if (original.transfer_ref && ['CASH_TRANSFER_OUT', 'CASH_TRANSFER_IN'].includes(original.movement_type)) {
        return cors(NextResponse.json({ error: 'Paired inter-centre transfers cannot be reversed one side at a time.' }, { status: 400 }))
      }

      const { data: existingRev } = await db.from('events').select('*').eq('reverses', id).eq('is_reversal', true).limit(1)
      if (existingRev && existingRev.length > 0) return cors(NextResponse.json({ error: 'Event already reversed' }, { status: 400 }))

      const reversal = {
        id: uuidv4(),
        event_type: original.event_type || original.type,
        type: original.event_type || original.type,
        centre_id: original.centre_id,
        business_date: original.business_date,
        created_at: new Date().toISOString(),
        created_by: auth.profile.email,
        customer: original.customer,
        therapist: original.therapist,
        service_id: original.service_id,
        service_name: original.service_name,
        amount: original.amount,
        payment_method: original.payment_method,
        payment_breakdown: original.payment_breakdown,
        booking_time: original.booking_time,
        status: original.status,
        redemption_ref: original.redemption_ref,
        movement_type: original.movement_type,
        category: original.category,
        membership_code: original.membership_code,
        gift_card_code: original.gift_card_code,
        notes: `Reversal of ${original.id}`,
        is_reversal: true,
        reverses: original.id
      }

      // Insert new event; NEVER edit original event
      const { error: revErr } = await db.from('events').insert(reversal)
      if (revErr) throw new Error(`Reversal insert failed: ${revErr.message}`)

      // State entities update
      if (original.type === 'MEMBERSHIP_SALE' && original.membership_code) {
        await db.from('memberships').update({ reversed: true, active: false, remaining_paise: 0 }).eq('code', original.membership_code)
      }
      if (original.type === 'GIFT_CARD_SALE' && original.gift_card_code) {
        await db.from('gift_cards').update({ reversed: true, active: false, remaining_paise: 0 }).eq('code', original.gift_card_code)
      }
      if (original.type === 'BOOKING' && original.payment_method === 'MEMBERSHIP' && original.redemption_ref) {
        const { data: m } = await db.from('memberships').select('*').eq('code', original.redemption_ref).single()
        if (m) {
          await db.from('memberships').update({ remaining_paise: m.remaining_paise + (original.amount || 0), redemption_count: Math.max(0, (m.redemption_count||1)-1) }).eq('code', m.code)
        }
      }
      if (original.type === 'BOOKING' && original.payment_method === 'GIFT_CARD' && original.redemption_ref) {
        const { data: g } = await db.from('gift_cards').select('*').eq('code', original.redemption_ref).single()
        if (g) {
          await db.from('gift_cards').update({ remaining_paise: g.remaining_paise + (original.amount || 0), redemption_count: Math.max(0, (g.redemption_count||1)-1) }).eq('code', g.code)
        }
      }

      await writeAudit(db, { action: 'REVERSE_EVENT', actor: auth.profile.email, role: manager.role, centre_id: original.centre_id, business_date: original.business_date, target_event_id: original.id, new_value: { reversed: true, reversal_event_id: reversal.id, reason } })
      return cors(NextResponse.json({ ok: true, reversal_event: clean(reversal) }))
    }

    // ---------------- BUSINESS DAY ----------------
    if (route === '/business-day' && method === 'GET') {
      let centreId = q.centre_id
      if (isProtected && auth.profile.role === 'CENTRE_USER') centreId = auth.profile.centre_id
      if (!centreId || centreId === 'ALL') return cors(NextResponse.json({ error: 'Specific centre_id required' }, { status: 400 }))
      const bd = await ensureBusinessDay(db, centreId, q.date || businessDate())
      return cors(NextResponse.json(bd))
    }

    if (route === '/business-day/close' && method === 'POST') {
      const b = await request.json()
      const manager = requireManager(auth)
      if (manager.error) return cors(NextResponse.json({ error: manager.error }, { status: manager.status }))
      let centreId = b.centre_id
      if (isProtected) {
        const scope = enforceCentreWriteScope(auth, b.centre_id)
        if (scope.error) return cors(NextResponse.json({ error: scope.error }, { status: scope.status }))
        centreId = scope.centre_id
      }
      const date = b.business_date || businessDate()
      const bd = await ensureBusinessDay(db, centreId, date)

      if (bd.status === 'CLOSED') {
        return cors(NextResponse.json({ error: 'Business day is already closed. Authorized reopen required.' }, { status: 400 }))
      }

      const { data: eventsRaw } = await db.from('events').select('*').eq('centre_id', centreId).eq('business_date', date)
      const agg = aggregate(cleanArr(eventsRaw), bd.opening_cash || 0)
      const declared = Number(b.closing_cash_declared) || 0
      
      await db.from('business_days').update({
        status: 'CLOSED',
        closing_cash_declared: declared,
        actual_closing_cash: declared,
        closing_cash_expected: agg.closing_cash_expected,
        expected_closing_cash: agg.closing_cash_expected,
        variance: declared - agg.closing_cash_expected,
        shortage_or_excess: declared - agg.closing_cash_expected,
        closed_at: new Date().toISOString(),
        closed_by: auth.profile.email,
        closing_notes: b.notes || ''
      }).eq('id', bd.id)

      // Propagate closing cash to the next chronologically open business day if it exists
      const { data: nextDays } = await db
        .from('business_days')
        .select('*')
        .eq('centre_id', centreId)
        .gt('business_date', date)
        .order('business_date', { ascending: true })
        .limit(1)

      const nextDay = nextDays && nextDays[0]
      if (nextDay && nextDay.status === 'OPEN') {
        await db.from('business_days').update({ opening_cash: declared }).eq('id', nextDay.id)
      }

      await writeAudit(db, { action: 'CLOSE_DAY', actor: auth.profile.email, role: manager.role, centre_id: centreId, business_date: date, previous_value: { status: 'OPEN' }, new_value: { status: 'CLOSED', declared, expected: agg.closing_cash_expected } })
      return cors(NextResponse.json({ ok: true, expected: agg.closing_cash_expected, declared, variance: declared - agg.closing_cash_expected }))
    }

    if (route === '/business-day/reopen' && method === 'POST') {
      const b = await request.json()
      const manager = requireManager(auth)
      if (manager.error) return cors(NextResponse.json({ error: manager.error }, { status: manager.status }))
      const scope = enforceCentreWriteScope(auth, b.centre_id)
      if (scope.error) return cors(NextResponse.json({ error: scope.error }, { status: scope.status }))

      const reason = (b.reason || '').trim()
      if (!reason) {
        return cors(NextResponse.json({ error: 'Non-empty reason required for reopening a business day' }, { status: 400 }))
      }

      const { data: bd } = await db.from('business_days').select('*').eq('centre_id', scope.centre_id).eq('business_date', b.business_date).single()
      if (!bd) return cors(NextResponse.json({ error: 'Business day not found' }, { status: 404 }))

      await db.from('business_days').update({ status: 'OPEN', reopen_count: (bd.reopen_count || 0) + 1 }).eq('id', bd.id)
      await writeAudit(db, { action: 'REOPEN_DAY', actor: auth.profile.email, role: manager.role, centre_id: scope.centre_id, business_date: b.business_date, target_event_id: null, new_value: { status: 'OPEN', reason, reopen_count: (bd.reopen_count || 0) + 1 } })
      return cors(NextResponse.json({ ok: true, message: 'Business day reopened successfully' }))
    }

    if (route === '/business-day/set-opening' && method === 'POST') {
      const b = await request.json()
      const manager = requireManager(auth)
      if (manager.error) return cors(NextResponse.json({ error: manager.error }, { status: manager.status }))
      const scope = enforceCentreWriteScope(auth, b.centre_id)
      if (scope.error) return cors(NextResponse.json({ error: scope.error }, { status: scope.status }))

      const bd = await ensureBusinessDay(db, scope.centre_id, b.business_date || businessDate())
      if (bd.status === 'CLOSED') return cors(NextResponse.json({ error: 'Business day is closed. Authorized reopen required.' }, { status: 400 }))
      const opening = Number(b.opening_cash) || 0
      await db.from('business_days').update({ opening_cash: opening }).eq('id', bd.id)
      await writeAudit(db, { action: 'SET_OPENING_CASH', actor: auth.profile.email, role: manager.role, centre_id: scope.centre_id, business_date: bd.business_date, target_event_id: null, new_value: { opening_cash: opening } })
      return cors(NextResponse.json({ ok: true, opening_cash: opening }))
    }

    // ---------------- DASHBOARD & DRILL DOWN (Single Source of Truth) ----------------
    if (route === '/dashboard' && method === 'GET') {
      let centre_id = q.centre_id || 'ALL'
      if (isProtected) {
        const scope = enforceCentreReadScope(auth, centre_id)
        if (scope.error) return cors(NextResponse.json({ error: scope.error }, { status: scope.status }))
        centre_id = scope.centre_id
      }
      const date = q.date || businessDate()
      const { data: centres } = await db.from('centres').select('*').eq('active', true).order('name')
      const targetCentres = centre_id === 'ALL' ? centres : centres.filter(c => c.id === centre_id)

      let totalOpening = 0
      const centreData = []
      for (const c of targetCentres) {
        const bd = await ensureBusinessDay(db, c.id, date)
        let evQuery = db.from('events').select('*').eq('centre_id', c.id).eq('business_date', date)
        if (q.created_by) {
          evQuery = evQuery.eq('created_by', q.created_by)
        }
        const { data: evs } = await evQuery
        const evsClean = cleanArr(evs)
        const agg = aggregate(evsClean, bd.opening_cash || 0)
        totalOpening += (bd.opening_cash || 0)
        centreData.push({ centre: clean(c), business_day: bd, agg, events_count: evsClean.length })
      }

      // Consolidated aggregate by summing individual centre aggregates (Single Source of Truth)
      const fieldsToSum = [
        'opening_cash', 'booking_sales', 'membership_sales', 'gift_card_sales', 'total_revenue',
        'revenue_reversals', 'gross_revenue', 'net_revenue', 'cash_sales', 'upi_1_sales', 'upi_2_sales',
        'card_sales', 'membership_redemption_value', 'gift_card_redemption_value', 'total_expenses',
        'cash_expenses', 'upi_1_expenses', 'upi_2_expenses', 'card_expenses', 'wages_expenses',
        'expense_reversals', 'gross_expenses', 'net_expenses', 'cash_deposited', 'cash_withdrawn',
        'cash_transfer_in', 'cash_transfer_out', 'float_added', 'other_cash_in', 'other_cash_out',
        'guests', 'bookings', 'redemptions', 'memberships_sold', 'gift_cards_sold', 'expenses_count',
        'cash_movements_count', 'reversal_count', 'closing_cash_expected', 'net_profit'
      ]

      const consolidatedAgg = { ...centreData[0]?.agg }
      for (const key of fieldsToSum) {
        consolidatedAgg[key] = centreData.reduce((sum, item) => sum + (item.agg ? (item.agg[key] || 0) : 0), 0)
      }
      
      const activeAgg = targetCentres.length === 1 ? (centreData[0]?.agg || consolidatedAgg) : consolidatedAgg
      return cors(NextResponse.json({
        date, centre_id, count: targetCentres.length, centres: centreData, consolidated: consolidatedAgg,
        single_centre: targetCentres.length === 1 ? centreData[0] : null,
        agg: activeAgg
      }))
    }

    if (route === '/drill-down' && method === 'GET') {
      let centre_id = q.centre_id || 'ALL'
      if (isProtected) {
        const scope = enforceCentreReadScope(auth, centre_id)
        if (scope.error) return cors(NextResponse.json({ error: scope.error }, { status: scope.status }))
        centre_id = scope.centre_id
      }
      const date = q.date || businessDate()
      const metric = q.metric || 'total_revenue'
      let query = db.from('events').select('*')
      if (centre_id !== 'ALL') query = query.eq('centre_id', centre_id)
      if (q.from && q.to) query = query.gte('business_date', q.from).lte('business_date', q.to)
      else query = query.eq('business_date', date)

      const { data: events } = await query.order('created_at', { ascending: true })
      const res = drillDown(cleanArr(events), metric)
      return cors(NextResponse.json({ date, centre_id, metric, ...res, count: res.events.length }))
    }

    if (route === '/master-register' && method === 'GET') {
      let centre_id = q.centre_id || 'ALL'
      if (isProtected) {
        const scope = enforceCentreReadScope(auth, centre_id)
        if (scope.error) return cors(NextResponse.json({ error: scope.error }, { status: scope.status }))
        centre_id = scope.centre_id
      }
      const from = q.from || businessDate(), to = q.to || from

      // 1. Fetch active centres
      const { data: centresRaw } = await db.from('centres').select('*').eq('active', true).order('name')
      const allCentres = cleanArr(centresRaw)
      const targetCentres = centre_id === 'ALL' ? allCentres : allCentres.filter(c => c.id === centre_id)

      if (targetCentres.length === 0) {
        return cors(NextResponse.json({ from, to, centre_id, count: 0, rows: [] }))
      }

      // Collect all business dates in range [from, to]
      const dateSet = new Set()
      let curr = new Date(from + 'T00:00:00Z')
      const end = new Date(to + 'T00:00:00Z')
      while (curr <= end) {
        dateSet.add(curr.toISOString().split('T')[0])
        curr.setDate(curr.getDate() + 1)
      }

      // 2. Compute per-centre day rows independently
      const centreRowsMap = {} // centreId -> array of day objects

      for (const c of targetCentres) {
        // Find base opening cash at start date 'from'
        const { data: curBD } = await db.from('business_days')
          .select('*')
          .eq('centre_id', c.id)
          .eq('business_date', from)
          .single()

        let runningOpeningCash = 0
        if (curBD && curBD.opening_cash != null) {
          runningOpeningCash = curBD.opening_cash
        } else {
          const { data: prevBDs } = await db.from('business_days')
            .select('*')
            .eq('centre_id', c.id)
            .lt('business_date', from)
            .order('business_date', { ascending: false })
            .limit(1)

          if (prevBDs && prevBDs.length > 0) {
            const prevBD = prevBDs[0]
            runningOpeningCash = prevBD.closing_cash_declared ?? prevBD.actual_closing_cash ?? prevBD.closing_cash_expected ?? prevBD.opening_cash ?? 0
          }
        }

        // Fetch events for this centre in range [from, to]
        let evQuery = db.from('events').select('*').eq('centre_id', c.id).gte('business_date', from).lte('business_date', to)
        if (q.created_by) evQuery = evQuery.eq('created_by', q.created_by)
        const { data: evRaw } = await evQuery.order('created_at', { ascending: true })
        const events = cleanArr(evRaw)

        // Fetch business_days records for this centre in range [from, to]
        const { data: bdRaw } = await db.from('business_days')
          .select('*')
          .eq('centre_id', c.id)
          .gte('business_date', from)
          .lte('business_date', to)
        const bds = cleanArr(bdRaw)
        const bdMap = {}
        for (const bd of bds) bdMap[bd.business_date] = bd

        // Group events by date
        const eventsByDate = {}
        for (const ev of events) {
          const d = ev.business_date
          if (!eventsByDate[d]) eventsByDate[d] = []
          eventsByDate[d].push(ev)
          dateSet.add(d)
        }

        const sortedDatesForCentre = Array.from(dateSet).sort()
        const cRows = []

        for (const d of sortedDatesForCentre) {
          const dayEvents = eventsByDate[d] || []
          const bd = bdMap[d]

          // If Day 1 of range had an explicit business_date record with opening_cash and runningOpeningCash was 0
          if (d === from && bd && bd.opening_cash != null && runningOpeningCash === 0) {
            runningOpeningCash = bd.opening_cash
          }

          const agg = aggregate(dayEvents, runningOpeningCash)
          const rowObj = {
            business_date: d,
            centre_id: c.id,
            opening_cash: runningOpeningCash,
            status: bd?.status || 'OPEN',
            ...agg
          }
          cRows.push(rowObj)

          // Carry forward closing cash to next day's opening cash
          if (bd?.status === 'CLOSED' && bd.closing_cash_declared != null) {
            runningOpeningCash = bd.closing_cash_declared
          } else {
            runningOpeningCash = agg.closing_cash_expected
          }
        }
        centreRowsMap[c.id] = cRows
      }

      const allSortedDates = Array.from(dateSet).sort().filter(d => d >= from && d <= to)

      // 3. Format final result
      let finalRows = []

      if (targetCentres.length === 1) {
        // Single centre view
        finalRows = (centreRowsMap[targetCentres[0].id] || []).filter(r => r.business_date >= from && r.business_date <= to)
      } else {
        // "ALL Centres" mode: Aggregate already-calculated results of each centre for date d
        for (const d of allSortedDates) {
          let openCashSum = 0
          let statusOverall = 'CLOSED'

          // Combine each centre's calculated row for date d
          const centreDayRows = targetCentres.map(c => (centreRowsMap[c.id] || []).find(r => r.business_date === d)).filter(Boolean)

          for (const cRow of centreDayRows) {
            openCashSum += (cRow.opening_cash || 0)
            if (cRow.status === 'OPEN') statusOverall = 'OPEN'
          }

          const combinedRow = {
            business_date: d,
            centre_id: 'ALL',
            opening_cash: openCashSum,
            status: statusOverall,
            booking_sales: centreDayRows.reduce((s, r) => s + (r.booking_sales || 0), 0),
            membership_sales: centreDayRows.reduce((s, r) => s + (r.membership_sales || 0), 0),
            gift_card_sales: centreDayRows.reduce((s, r) => s + (r.gift_card_sales || 0), 0),
            total_revenue: centreDayRows.reduce((s, r) => s + (r.total_revenue || 0), 0),
            revenue_reversals: centreDayRows.reduce((s, r) => s + (r.revenue_reversals || 0), 0),
            gross_revenue: centreDayRows.reduce((s, r) => s + (r.gross_revenue || 0), 0),
            net_revenue: centreDayRows.reduce((s, r) => s + (r.net_revenue || 0), 0),
            cash_sales: centreDayRows.reduce((s, r) => s + (r.cash_sales || 0), 0),
            upi_1_sales: centreDayRows.reduce((s, r) => s + (r.upi_1_sales || 0), 0),
            upi_2_sales: centreDayRows.reduce((s, r) => s + (r.upi_2_sales || 0), 0),
            card_sales: centreDayRows.reduce((s, r) => s + (r.card_sales || 0), 0),
            membership_redemption_value: centreDayRows.reduce((s, r) => s + (r.membership_redemption_value || 0), 0),
            gift_card_redemption_value: centreDayRows.reduce((s, r) => s + (r.gift_card_redemption_value || 0), 0),
            total_expenses: centreDayRows.reduce((s, r) => s + (r.total_expenses || 0), 0),
            cash_expenses: centreDayRows.reduce((s, r) => s + (r.cash_expenses || 0), 0),
            upi_1_expenses: centreDayRows.reduce((s, r) => s + (r.upi_1_expenses || 0), 0),
            upi_2_expenses: centreDayRows.reduce((s, r) => s + (r.upi_2_expenses || 0), 0),
            card_expenses: centreDayRows.reduce((s, r) => s + (r.card_expenses || 0), 0),
            wages_expenses: centreDayRows.reduce((s, r) => s + (r.wages_expenses || 0), 0),
            expense_reversals: centreDayRows.reduce((s, r) => s + (r.expense_reversals || 0), 0),
            gross_expenses: centreDayRows.reduce((s, r) => s + (r.gross_expenses || 0), 0),
            net_expenses: centreDayRows.reduce((s, r) => s + (r.net_expenses || 0), 0),
            cash_deposited: centreDayRows.reduce((s, r) => s + (r.cash_deposited || 0), 0),
            cash_withdrawn: centreDayRows.reduce((s, r) => s + (r.cash_withdrawn || 0), 0),
            cash_transfer_in: centreDayRows.reduce((s, r) => s + (r.cash_transfer_in || 0), 0),
            cash_transfer_out: centreDayRows.reduce((s, r) => s + (r.cash_transfer_out || 0), 0),
            float_added: centreDayRows.reduce((s, r) => s + (r.float_added || 0), 0),
            other_cash_in: centreDayRows.reduce((s, r) => s + (r.other_cash_in || 0), 0),
            other_cash_out: centreDayRows.reduce((s, r) => s + (r.other_cash_out || 0), 0),
            guests: centreDayRows.reduce((s, r) => s + (r.guests || 0), 0),
            bookings: centreDayRows.reduce((s, r) => s + (r.bookings || 0), 0),
            redemptions: centreDayRows.reduce((s, r) => s + (r.redemptions || 0), 0),
            memberships_sold: centreDayRows.reduce((s, r) => s + (r.memberships_sold || 0), 0),
            gift_cards_sold: centreDayRows.reduce((s, r) => s + (r.gift_cards_sold || 0), 0),
            expenses_count: centreDayRows.reduce((s, r) => s + (r.expenses_count || 0), 0),
            cash_movements_count: centreDayRows.reduce((s, r) => s + (r.cash_movements_count || 0), 0),
            reversal_count: centreDayRows.reduce((s, r) => s + (r.reversal_count || 0), 0),
            closing_cash_expected: centreDayRows.reduce((s, r) => s + (r.closing_cash_expected || 0), 0),
            net_profit: centreDayRows.reduce((s, r) => s + (r.net_profit || 0), 0)
          }

          finalRows.push(combinedRow)
        }
      }

      return cors(NextResponse.json({ from, to, centre_id, count: finalRows.length, rows: finalRows }))
    }


    if (route === '/cash-book' && method === 'GET') {
      let centre_id = q.centre_id
      if (isProtected && auth.profile.role === 'CENTRE_USER') centre_id = auth.profile.centre_id
      if (!centre_id || centre_id === 'ALL') return cors(NextResponse.json({ error: 'Specific centre_id required for Cash Book' }, { status: 400 }))
      const date = q.date || businessDate()
      const bd = await ensureBusinessDay(db, centre_id, date)
      const { data: eventsRaw } = await db.from('events').select('*').eq('centre_id', centre_id).eq('business_date', date).order('created_at', { ascending: true })
      const events = cleanArr(eventsRaw)

      let running = bd.opening_cash || 0
      const lines = [{ time: bd.opened_at, ref: 'OPENING', desc: 'Opening Cash Balance', in: bd.opening_cash || 0, out: 0, running, event_id: null, is_reversal: false }]
      for (const ev of events) {
        const sign = eventSign(ev)
        const split = paymentSplit(ev)
        let inAmt = 0, outAmt = 0, desc = ''
        const ref = ev.type === 'BOOKING' ? `BOOK-${ev.id.slice(-6)}` : `EV-${ev.id.slice(-6)}`
        if (['BOOKING','MEMBERSHIP_SALE','GIFT_CARD_SALE'].includes(ev.type) && (ev.payment_method === 'CASH' || ev.payment_method === 'MIXED')) {
          if (split.cash > 0) {
            const signed = sign * split.cash
            if (signed >= 0) inAmt = signed; else outAmt = -signed
            desc = `${ev.is_reversal ? 'REVERSAL: ' : ''}${ev.type} – ${ev.customer || ''}`
          } else continue
        } else if (ev.type === 'EXPENSE' && ev.payment_method === 'CASH') {
          const signed = -sign * (ev.amount || 0)
          if (signed >= 0) inAmt = signed; else outAmt = -signed
          desc = `${ev.is_reversal ? 'REVERSAL: ' : ''}Expense – ${ev.category || ''}`
        } else if (ev.type === 'CASH_MOVEMENT') {
          const t = ev.movement_type
          const isIn = ['CASH_TRANSFER_IN','FLOAT_ADDED','CASH_RECEIVED'].includes(t)
          const isOut = ['BANK_DEPOSIT','OWNER_WITHDRAWAL','CASH_TRANSFER_OUT','CASH_HANDED_OVER'].includes(t)
          if (!isIn && !isOut) continue
          const signed = (isIn ? 1 : -1) * sign * (ev.amount || 0)
          if (signed >= 0) inAmt = signed; else outAmt = -signed
          desc = `${ev.is_reversal ? 'REVERSAL: ' : ''}${t.replace(/_/g,' ')}`
        } else continue
        running = running + inAmt - outAmt
        lines.push({ time: ev.created_at, ref, desc, in: inAmt, out: outAmt, running, event_id: ev.id, is_reversal: !!ev.is_reversal })
      }
      const agg = aggregate(events, bd.opening_cash || 0)
      return cors(NextResponse.json({ business_day: bd, lines, agg }))
    }

    // ---------------- REPORTS & CSV EXPORT ----------------
    if (route === '/reports/pl' && method === 'GET') {
      let centre_id = q.centre_id || 'ALL'
      if (isProtected) {
        const scope = enforceCentreReadScope(auth, centre_id)
        if (scope.error) return cors(NextResponse.json({ error: scope.error }, { status: scope.status }))
        centre_id = scope.centre_id
      }
      const from = q.from, to = q.to, group = q.group || 'month'
      if (!from || !to) return cors(NextResponse.json({ error: 'from, to required' }, { status: 400 }))

      const { data: centres } = await db.from('centres').select('*').eq('active', true).order('name')
      const targetCentres = centre_id === 'ALL' ? centres : centres.filter(c => c.id === centre_id)
      const targetIds = targetCentres.map(c => c.id)

      const { data: evRaw } = await db.from('events').select('*').in('centre_id', targetIds).gte('business_date', from).lte('business_date', to)
      const { data: bdRaw } = await db.from('business_days').select('*').in('centre_id', targetIds).gte('business_date', from).lte('business_date', to)
      const events = cleanArr(evRaw), bds = cleanArr(bdRaw)

      // Map of centre_id -> start opening cash at date 'from'
      const startOpeningMap = {}
      for (const c of targetCentres) {
        const bdFrom = bds.find(b => b.centre_id === c.id && b.business_date === from)
        if (bdFrom && bdFrom.opening_cash != null) {
          startOpeningMap[c.id] = bdFrom.opening_cash
        } else {
          const { data: prevBDs } = await db.from('business_days')
            .select('*')
            .eq('centre_id', c.id)
            .lt('business_date', from)
            .order('business_date', { ascending: false })
            .limit(1)

          if (prevBDs && prevBDs.length > 0) {
            const prevBD = prevBDs[0]
            startOpeningMap[c.id] = prevBD.closing_cash_declared ?? prevBD.actual_closing_cash ?? prevBD.closing_cash_expected ?? prevBD.opening_cash ?? 0
          } else {
            startOpeningMap[c.id] = 0
          }
        }
      }

      // Group events and identify unique periods
      const bucket = new Map(), periods = new Set()
      for (const ev of events) {
        const p = periodLabel(ev.business_date, group)
        periods.add(p)
        const key = p + '|' + ev.centre_id
        if (!bucket.has(key)) bucket.set(key, [])
        bucket.get(key).push(ev)
      }

      for (const bd of bds) {
        periods.add(periodLabel(bd.business_date, group))
      }

      const fieldsToSum = [
        'opening_cash', 'booking_sales', 'membership_sales', 'gift_card_sales', 'total_revenue',
        'revenue_reversals', 'gross_revenue', 'net_revenue', 'cash_sales', 'upi_1_sales', 'upi_2_sales',
        'card_sales', 'membership_redemption_value', 'gift_card_redemption_value', 'total_expenses',
        'cash_expenses', 'upi_1_expenses', 'upi_2_expenses', 'card_expenses', 'wages_expenses',
        'expense_reversals', 'gross_expenses', 'net_expenses', 'cash_deposited', 'cash_withdrawn',
        'cash_transfer_in', 'cash_transfer_out', 'float_added', 'other_cash_in', 'other_cash_out',
        'guests', 'bookings', 'redemptions', 'memberships_sold', 'gift_cards_sold', 'expenses_count',
        'cash_movements_count', 'reversal_count', 'closing_cash_expected', 'net_profit'
      ]

      const rows = []
      const sortedPeriods = Array.from(periods).sort()

      // For period breakdown
      for (const p of sortedPeriods) {
        const perCentre = []
        for (const c of targetCentres) {
          const key = p + '|' + c.id
          const evs = bucket.get(key) || []
          const bdsInPeriod = bds.filter(b => b.centre_id === c.id && periodLabel(b.business_date, group) === p).sort((a,b) => a.business_date.localeCompare(b.business_date))
          const periodStartDate = bdsInPeriod[0]?.business_date || from
          let periodOpening = startOpeningMap[c.id] || 0
          if (periodStartDate > from) {
            const firstBd = bdsInPeriod[0]
            periodOpening = firstBd?.opening_cash ?? periodOpening
          }
          if (evs.length === 0 && bdsInPeriod.length === 0) continue
          const agg = aggregate(evs, periodOpening)
          perCentre.push({ centre_id: c.id, centre_name: c.name, opening_cash: periodOpening, ...agg })
        }

        const consolidated = { ...perCentre[0] }
        if (perCentre.length > 0) {
          for (const key of fieldsToSum) {
            consolidated[key] = perCentre.reduce((s, item) => s + (item[key] || 0), 0)
          }
        }
        rows.push({ period: p, per_centre: perCentre, consolidated })
      }

      // Grand Totals across entire range [from, to]
      const grandPerCentre = []
      for (const c of targetCentres) {
        const evs = events.filter(e => e.centre_id === c.id)
        const cStartOpening = startOpeningMap[c.id] || 0
        const agg = aggregate(evs, cStartOpening)
        grandPerCentre.push({ centre_id: c.id, centre_name: c.name, opening_cash: cStartOpening, ...agg })
      }

      const grandConsolidated = { ...grandPerCentre[0] }
      if (grandPerCentre.length > 0) {
        for (const key of fieldsToSum) {
          grandConsolidated[key] = grandPerCentre.reduce((s, item) => s + (item[key] || 0), 0)
        }
      }

      return cors(NextResponse.json({ group, from, to, centre_id, rows, totals: { per_centre: grandPerCentre, consolidated: grandConsolidated } }))
    }

    if (route === '/reports/csv' && method === 'GET') {
      let centre_id = q.centre_id || 'ALL'
      if (isProtected) {
        const scope = enforceCentreReadScope(auth, centre_id)
        if (scope.error) return cors(NextResponse.json({ error: scope.error }, { status: scope.status }))
        centre_id = scope.centre_id
      }
      const from = q.from, to = q.to, group = q.group || 'day'
      if (!from || !to) return cors(NextResponse.json({ error: 'from, to required' }, { status: 400 }))

      const { data: centres } = await db.from('centres').select('*').eq('active', true).order('name')
      const targetCentres = centre_id === 'ALL' ? centres : centres.filter(c => c.id === centre_id)
      const targetIds = targetCentres.map(c => c.id)

      const { data: evRaw } = await db.from('events').select('*').in('centre_id', targetIds).gte('business_date', from).lte('business_date', to)
      const { data: bdRaw } = await db.from('business_days').select('*').in('centre_id', targetIds).gte('business_date', from).lte('business_date', to)
      const events = cleanArr(evRaw), bds = cleanArr(bdRaw)

      const startOpeningMap = {}
      for (const c of targetCentres) {
        const bdFrom = bds.find(b => b.centre_id === c.id && b.business_date === from)
        if (bdFrom && bdFrom.opening_cash != null) {
          startOpeningMap[c.id] = bdFrom.opening_cash
        } else {
          const { data: prevBDs } = await db.from('business_days')
            .select('*')
            .eq('centre_id', c.id)
            .lt('business_date', from)
            .order('business_date', { ascending: false })
            .limit(1)

          if (prevBDs && prevBDs.length > 0) {
            const prevBD = prevBDs[0]
            startOpeningMap[c.id] = prevBD.closing_cash_declared ?? prevBD.actual_closing_cash ?? prevBD.closing_cash_expected ?? prevBD.opening_cash ?? 0
          } else {
            startOpeningMap[c.id] = 0
          }
        }
      }

      const bucket = new Map(), periods = new Set()
      for (const ev of events) {
        const p = periodLabel(ev.business_date, group)
        periods.add(p)
        const key = p + '|' + ev.centre_id
        if (!bucket.has(key)) bucket.set(key, [])
        bucket.get(key).push(ev)
      }
      for (const bd of bds) {
        periods.add(periodLabel(bd.business_date, group))
      }

      const flat = []
      for (const p of Array.from(periods).sort()) {
        for (const c of targetCentres) {
          const key = p + '|' + c.id
          const evs = bucket.get(key) || []
          const bdsInPeriod = bds.filter(b => b.centre_id === c.id && periodLabel(b.business_date, group) === p).sort((a,b) => a.business_date.localeCompare(b.business_date))
          const periodStartDate = bdsInPeriod[0]?.business_date || from
          let periodOpening = startOpeningMap[c.id] || 0
          if (periodStartDate > from) {
            const firstBd = bdsInPeriod[0]
            periodOpening = firstBd?.opening_cash ?? periodOpening
          }
          if (evs.length === 0 && bdsInPeriod.length === 0) continue
          const agg = aggregate(evs, periodOpening)
          flat.push({ period: p, centre_name: c.name, centre_code: c.code || c.name.slice(0,4).toUpperCase(), ...agg })
        }
      }

      const cols = [
        { label: 'Period', get: r => r.period }, { label: 'Centre Name', get: r => r.centre_name }, { label: 'Centre Code', get: r => r.centre_code },
        { label: 'Opening Cash (₹)', get: r => (r.opening_cash/100).toFixed(2) }, { label: 'Booking Sales (₹)', get: r => (r.booking_sales/100).toFixed(2) },
        { label: 'Membership Sales (₹)', get: r => (r.membership_sales/100).toFixed(2) }, { label: 'Gift Card Sales (₹)', get: r => (r.gift_card_sales/100).toFixed(2) },
        { label: 'Total Revenue (₹)', get: r => (r.total_revenue/100).toFixed(2) }, { label: 'Gross Revenue (₹)', get: r => (r.gross_revenue/100).toFixed(2) },
        { label: 'Revenue Reversals (₹)', get: r => (r.revenue_reversals/100).toFixed(2) }, { label: 'Net Revenue (₹)', get: r => (r.net_revenue/100).toFixed(2) },
        { label: 'Cash Sales (₹)', get: r => (r.cash_sales/100).toFixed(2) }, { label: 'UPI 1 Sales (₹)', get: r => (r.upi_1_sales/100).toFixed(2) },
        { label: 'UPI 2 Sales (₹)', get: r => (r.upi_2_sales/100).toFixed(2) }, { label: 'Card Sales (₹)', get: r => (r.card_sales/100).toFixed(2) },
        { label: 'Total Expenses (₹)', get: r => (r.total_expenses/100).toFixed(2) }, { label: 'Net Profit (₹)', get: r => (r.net_profit/100).toFixed(2) },
        { label: 'Expected Closing Cash (₹)', get: r => (r.closing_cash_expected/100).toFixed(2) }, { label: 'Bookings Count', get: r => r.bookings },
        { label: 'Guests Count', get: r => r.guests }, { label: 'Reversals Count', get: r => r.reversal_count }
      ]

      const csv = toCsv(flat, cols)
      return cors(new NextResponse(csv, { status: 200, headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="spa_report_${from}_${to}.csv"` } }))
    }

    // ---------------- MEMBERSHIPS, GIFT CARDS, AUDIT LOGS ----------------
    if (route === '/memberships' && method === 'GET') {
      let centre_id = q.centre_id || 'ALL'
      if (isProtected) {
        const scope = enforceCentreReadScope(auth, centre_id)
        if (scope.error) return cors(NextResponse.json({ error: scope.error }, { status: scope.status }))
        centre_id = scope.centre_id
      }
      let query = db.from('memberships').select('*')
      if (centre_id !== 'ALL') query = query.eq('sold_at_centre_id', centre_id)
      const { data } = await query.order('created_at', { ascending: false })
      return cors(NextResponse.json(cleanArr(data)))
    }

    if (route.startsWith('/memberships/') && method === 'GET') {
      const code = route.split('/')[2]
      const { data } = await db.from('memberships').select('*').eq('code', code).single()
      if (!data) return cors(NextResponse.json({ error: 'Not found' }, { status: 404 }))
      if (isProtected && auth.profile.role === 'CENTRE_USER' && data.sold_at_centre_id !== auth.profile.centre_id) {
        return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
      }
      return cors(NextResponse.json(clean(data)))
    }

    if (route === '/gift-cards' && method === 'GET') {
      let centre_id = q.centre_id || 'ALL'
      if (isProtected) {
        const scope = enforceCentreReadScope(auth, centre_id)
        if (scope.error) return cors(NextResponse.json({ error: scope.error }, { status: scope.status }))
        centre_id = scope.centre_id
      }
      let query = db.from('gift_cards').select('*')
      if (centre_id !== 'ALL') query = query.eq('sold_at_centre_id', centre_id)
      const { data } = await query.order('created_at', { ascending: false })
      return cors(NextResponse.json(cleanArr(data)))
    }

    if (route.startsWith('/gift-cards/') && method === 'GET') {
      const code = route.split('/')[2]
      const { data } = await db.from('gift_cards').select('*').eq('code', code).single()
      if (!data) return cors(NextResponse.json({ error: 'Not found' }, { status: 404 }))
      if (isProtected && auth.profile.role === 'CENTRE_USER' && data.sold_at_centre_id !== auth.profile.centre_id) {
        return cors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
      }
      return cors(NextResponse.json(clean(data)))
    }

    if (route === '/audit-log' && method === 'GET') {
      let centre_id = q.centre_id || 'ALL'
      if (isProtected) {
        const scope = enforceCentreReadScope(auth, centre_id)
        if (scope.error) return cors(NextResponse.json({ error: scope.error }, { status: scope.status }))
        centre_id = scope.centre_id
      }
      let query = db.from('audit_logs').select('*')
      if (centre_id !== 'ALL') query = query.eq('centre_id', centre_id)
      if (q.target_event_id) query = query.eq('target_event_id', q.target_event_id)
      const { data } = await query.order('created_at', { ascending: false }).limit(200)
      return cors(NextResponse.json(cleanArr(data)))
    }

    return cors(NextResponse.json({ error: 'Endpoint not found or method unsupported in Supabase engine', route, method }, { status: 404 }))
  } catch (err) {
    console.error('Supabase API Route error:', err)
    return cors(NextResponse.json({ error: err.message }, { status: 500 }))
  }
}
