import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import { aggregate, drillDown, businessDate, EVENT_TYPES, CASH_MOVEMENT_TYPES, METRICS, cashImpact, paymentSplit } from '@/lib/financial-engine'

let client, db
async function getDb() {
  if (!client) {
    client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
    db = client.db(process.env.DB_NAME)
    await ensureSeed(db)
    await ensureIndexes(db)
  }
  return db
}

async function ensureIndexes(db) {
  await db.collection('events').createIndex({ centre_id: 1, business_date: 1, created_at: 1 })
  await db.collection('events').createIndex({ business_date: 1 })
  await db.collection('events').createIndex({ id: 1 }, { unique: true })
  await db.collection('events').createIndex({ reverses: 1 })
  await db.collection('business_days').createIndex({ centre_id: 1, business_date: 1 }, { unique: true })
  await db.collection('memberships').createIndex({ code: 1 }, { unique: true })
  await db.collection('gift_cards').createIndex({ code: 1 }, { unique: true })
  await db.collection('audit_log').createIndex({ created_at: -1 })
  await db.collection('audit_log').createIndex({ target_event_id: 1 })
}

async function ensureSeed(db) {
  const c = await db.collection('centres').countDocuments()
  if (c === 0) {
    const centres = [
      { name: 'Lulu Mall', code: 'LULU', city: 'Kochi' },
      { name: 'Holiday Inn', code: 'HINN', city: 'Mumbai' },
      { name: 'Phoenix', code: 'PHNX', city: 'Bangalore' },
      { name: 'Gomti Nagar', code: 'GMTI', city: 'Lucknow' },
    ].map(x => ({ id: uuidv4(), ...x, active: true, created_at: new Date() }))
    await db.collection('centres').insertMany(centres)
  }
  const s = await db.collection('services').countDocuments()
  if (s === 0) {
    const services = [
      { name: 'Signature Massage 60m', duration: 60, price_paise: 350000 },
      { name: 'Deep Tissue 90m',       duration: 90, price_paise: 550000 },
      { name: 'Aromatherapy 60m',      duration: 60, price_paise: 400000 },
      { name: 'Couple Ritual 120m',    duration: 120, price_paise: 1200000 },
      { name: 'Facial Glow 45m',       duration: 45, price_paise: 250000 },
    ].map(x => ({ id: uuidv4(), ...x, active: true }))
    await db.collection('services').insertMany(services)
  }
}

function cors(res) {
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return res
}
export async function OPTIONS() { return cors(new NextResponse(null, { status: 200 })) }

function clean(doc) { if (!doc) return doc; const { _id, ...r } = doc; return r }
function cleanArr(arr) { return arr.map(clean) }

async function ensureBusinessDay(db, centre_id, date) {
  let bd = await db.collection('business_days').findOne({ centre_id, business_date: date })
  if (!bd) {
    const prev = await db.collection('business_days')
      .find({ centre_id, business_date: { $lt: date }, status: 'CLOSED' })
      .sort({ business_date: -1 }).limit(1).toArray()
    const opening = prev[0]?.closing_cash_declared ?? prev[0]?.closing_cash_expected ?? 0
    bd = {
      id: uuidv4(), centre_id, business_date: date, status: 'OPEN',
      opening_cash: opening, closing_cash_declared: null, closing_cash_expected: null,
      opened_at: new Date(), closed_at: null, closed_by: null, reopen_count: 0,
    }
    await db.collection('business_days').insertOne(bd)
  }
  return bd
}

async function writeAudit(db, entry) {
  await db.collection('audit_log').insertOne({ id: uuidv4(), created_at: new Date(), ...entry })
}

// Enrich event with related entities for detail views.
async function enrichEvent(db, ev) {
  if (!ev) return null
  const centre = await db.collection('centres').findOne({ id: ev.centre_id })
  const enriched = { ...ev, centre: centre ? clean(centre) : null }
  if (ev.type === 'MEMBERSHIP_SALE') {
    const m = await db.collection('memberships').findOne({ code: ev.membership_code })
    enriched.membership = m ? clean(m) : null
  }
  if (ev.type === 'GIFT_CARD_SALE') {
    const g = await db.collection('gift_cards').findOne({ code: ev.gift_card_code })
    enriched.gift_card = g ? clean(g) : null
  }
  if (ev.type === 'BOOKING' && ev.redemption_ref) {
    if (ev.payment_method === 'MEMBERSHIP') {
      const m = await db.collection('memberships').findOne({ code: ev.redemption_ref })
      enriched.membership = m ? clean(m) : null
    } else if (ev.payment_method === 'GIFT_CARD') {
      const g = await db.collection('gift_cards').findOne({ code: ev.redemption_ref })
      enriched.gift_card = g ? clean(g) : null
    }
  }
  // Ledger impact (signed)
  const sign = ev.is_reversal ? -1 : 1
  const split = paymentSplit(ev)
  enriched.ledger_impact = {
    revenue: (ev.type === 'BOOKING' && (ev.payment_method === 'MEMBERSHIP' || ev.payment_method === 'GIFT_CARD'))
      ? 0
      : (['BOOKING','MEMBERSHIP_SALE','GIFT_CARD_SALE'].includes(ev.type) ? sign * (ev.amount || 0) : 0),
    expense: ev.type === 'EXPENSE' ? sign * (ev.amount || 0) : 0,
    cash: sign * cashImpact(ev),
    upi: ['BOOKING','MEMBERSHIP_SALE','GIFT_CARD_SALE'].includes(ev.type) ? sign * split.upi : (ev.type==='EXPENSE' && ev.payment_method==='UPI' ? -sign * (ev.amount||0) : 0),
    card: ['BOOKING','MEMBERSHIP_SALE','GIFT_CARD_SALE'].includes(ev.type) ? sign * split.card : (ev.type==='EXPENSE' && ev.payment_method==='CARD' ? -sign * (ev.amount||0) : 0),
    liability_delta: ev.type === 'MEMBERSHIP_SALE' || ev.type === 'GIFT_CARD_SALE' ? sign * (ev.amount || 0)
      : (ev.type === 'BOOKING' && (ev.payment_method === 'MEMBERSHIP' || ev.payment_method === 'GIFT_CARD') ? -sign * (ev.amount || 0) : 0),
  }
  // Audit history
  enriched.audit_history = cleanArr(
    await db.collection('audit_log').find({ target_event_id: ev.id }).sort({ created_at: 1 }).toArray()
  )
  // Related reversal (if any)
  if (ev.reversed_by_event_id) {
    enriched.reversal_event = clean(await db.collection('events').findOne({ id: ev.reversed_by_event_id }))
  }
  if (ev.reverses) {
    enriched.original_event = clean(await db.collection('events').findOne({ id: ev.reverses }))
  }
  return enriched
}

async function handle(request, { params }) {
  const { path = [] } = await params
  const route = '/' + path.join('/')
  const method = request.method
  const url = new URL(request.url)
  const q = Object.fromEntries(url.searchParams)

  try {
    const db = await getDb()

    if (route === '/' || route === '/root') return cors(NextResponse.json({ ok: true, app: 'Spa ERP' }))

    // ---------------- CENTRES ----------------
    if (route === '/centres' && method === 'GET') {
      const centres = await db.collection('centres').find({ active: true }).sort({ name: 1 }).toArray()
      return cors(NextResponse.json(cleanArr(centres)))
    }
    if (route === '/centres' && method === 'POST') {
      const b = await request.json()
      const doc = { id: uuidv4(), name: b.name, code: b.code, city: b.city || '', active: true, created_at: new Date() }
      await db.collection('centres').insertOne(doc)
      return cors(NextResponse.json(clean(doc)))
    }

    // ---------------- SERVICES ----------------
    if (route === '/services' && method === 'GET') {
      const s = await db.collection('services').find({ active: true }).toArray()
      return cors(NextResponse.json(cleanArr(s)))
    }

    // ---------------- METRICS (list) ----------------
    if (route === '/metrics' && method === 'GET') {
      const out = {}
      for (const [k, v] of Object.entries(METRICS)) out[k] = { label: v.label, isCount: !!v.isCount, unique: v.unique || null }
      return cors(NextResponse.json(out))
    }

    // ---------------- EVENTS READ ----------------
    if (route === '/events' && method === 'GET') {
      const filter = {}
      if (q.centre_id && q.centre_id !== 'ALL') filter.centre_id = q.centre_id
      if (q.date) filter.business_date = q.date
      if (q.from && q.to) filter.business_date = { $gte: q.from, $lte: q.to }
      if (q.type) filter.type = q.type
      if (q.include_reversals !== '1') { /* still include reversals; they have their own type */ }
      const events = await db.collection('events').find(filter).sort({ created_at: -1 }).limit(2000).toArray()
      return cors(NextResponse.json(cleanArr(events)))
    }

    // Single event with full detail
    if (route.startsWith('/events/') && !route.includes('/reverse') && method === 'GET') {
      const id = route.split('/')[2]
      const ev = await db.collection('events').findOne({ id })
      if (!ev) return cors(NextResponse.json({ error: 'Not found' }, { status: 404 }))
      const enriched = await enrichEvent(db, clean(ev))
      return cors(NextResponse.json(enriched))
    }

    // ---------------- EVENTS CREATE ----------------
    if (route === '/events/booking' && method === 'POST') {
      const b = await request.json()
      const date = b.business_date || businessDate()
      const bd = await ensureBusinessDay(db, b.centre_id, date)
      if (bd.status === 'CLOSED') return cors(NextResponse.json({ error: 'Business day is closed. Reopen required.' }, { status: 400 }))

      const event = {
        id: uuidv4(), type: EVENT_TYPES.BOOKING,
        centre_id: b.centre_id, business_date: date,
        created_at: new Date(), created_by: b.created_by || 'reception',
        customer: b.customer, therapist: b.therapist || '',
        service_id: b.service_id || null, service_name: b.service_name || '',
        amount: Number(b.amount) || 0,
        payment_method: b.payment_method, payment_breakdown: b.payment_breakdown || null,
        booking_time: b.booking_time || new Date().toISOString(),
        status: b.status || 'COMPLETED',
        redemption_ref: b.redemption_ref || null, notes: b.notes || '',
        is_reversal: false, reverses: null, reversed_by_event_id: null,
      }

      if (event.payment_method === 'MEMBERSHIP') {
        const m = await db.collection('memberships').findOne({ code: event.redemption_ref })
        if (!m) return cors(NextResponse.json({ error: 'Membership not found' }, { status: 400 }))
        if (m.reversed) return cors(NextResponse.json({ error: 'Membership was reversed' }, { status: 400 }))
        if ((m.remaining_paise || 0) < event.amount) return cors(NextResponse.json({ error: 'Insufficient membership balance' }, { status: 400 }))
        await db.collection('memberships').updateOne({ code: m.code }, {
          $inc: { remaining_paise: -event.amount, redemption_count: 1 },
          $push: { redemptions: { event_id: event.id, centre_id: event.centre_id, amount: event.amount, date } },
        })
      }
      if (event.payment_method === 'GIFT_CARD') {
        const g = await db.collection('gift_cards').findOne({ code: event.redemption_ref })
        if (!g) return cors(NextResponse.json({ error: 'Gift card not found' }, { status: 400 }))
        if (g.reversed) return cors(NextResponse.json({ error: 'Gift card was reversed' }, { status: 400 }))
        if ((g.remaining_paise || 0) < event.amount) return cors(NextResponse.json({ error: 'Insufficient gift card balance' }, { status: 400 }))
        await db.collection('gift_cards').updateOne({ code: g.code }, {
          $inc: { remaining_paise: -event.amount, redemption_count: 1 },
          $push: { redemptions: { event_id: event.id, centre_id: event.centre_id, amount: event.amount, date } },
        })
      }

      await db.collection('events').insertOne(event)
      await writeAudit(db, {
        action: 'CREATE_EVENT', actor: event.created_by, role: b.role || 'RECEPTION',
        centre_id: event.centre_id, business_date: date, target_event_id: event.id,
        new_value: { type: event.type, amount: event.amount, payment_method: event.payment_method },
      })
      return cors(NextResponse.json(clean(event)))
    }

    if (route === '/events/membership' && method === 'POST') {
      const b = await request.json()
      const date = b.business_date || businessDate()
      const bd = await ensureBusinessDay(db, b.centre_id, date)
      if (bd.status === 'CLOSED') return cors(NextResponse.json({ error: 'Business day is closed' }, { status: 400 }))

      const code = b.code || ('M-' + Date.now().toString(36).toUpperCase())
      const membership = {
        id: uuidv4(), code, customer: b.customer, phone: b.phone || '',
        sold_at_centre_id: b.centre_id, sold_business_date: date,
        initial_paise: Number(b.amount) || 0, remaining_paise: Number(b.amount) || 0,
        redemption_count: 0, redemptions: [], active: true, reversed: false,
        created_at: new Date(),
      }
      await db.collection('memberships').insertOne(membership)

      const event = {
        id: uuidv4(), type: EVENT_TYPES.MEMBERSHIP_SALE,
        centre_id: b.centre_id, business_date: date,
        created_at: new Date(), created_by: b.created_by || 'reception',
        customer: b.customer, amount: Number(b.amount) || 0,
        payment_method: b.payment_method, payment_breakdown: b.payment_breakdown || null,
        membership_code: code, notes: b.notes || '',
        is_reversal: false, reverses: null, reversed_by_event_id: null,
      }
      await db.collection('events').insertOne(event)
      await db.collection('memberships').updateOne({ code }, { $set: { source_event_id: event.id } })
      await writeAudit(db, {
        action: 'CREATE_EVENT', actor: event.created_by, role: b.role || 'RECEPTION',
        centre_id: event.centre_id, business_date: date, target_event_id: event.id,
        new_value: { type: event.type, amount: event.amount, code },
      })
      return cors(NextResponse.json({ event: clean(event), membership: clean(membership) }))
    }

    if (route === '/events/gift-card' && method === 'POST') {
      const b = await request.json()
      const date = b.business_date || businessDate()
      const bd = await ensureBusinessDay(db, b.centre_id, date)
      if (bd.status === 'CLOSED') return cors(NextResponse.json({ error: 'Business day is closed' }, { status: 400 }))

      const code = b.code || ('GC-' + Date.now().toString(36).toUpperCase())
      const gc = {
        id: uuidv4(), code, buyer: b.customer, recipient: b.recipient || b.customer,
        sold_at_centre_id: b.centre_id, sold_business_date: date,
        initial_paise: Number(b.amount) || 0, remaining_paise: Number(b.amount) || 0,
        redemption_count: 0, redemptions: [], active: true, reversed: false,
        created_at: new Date(),
      }
      await db.collection('gift_cards').insertOne(gc)

      const event = {
        id: uuidv4(), type: EVENT_TYPES.GIFT_CARD_SALE,
        centre_id: b.centre_id, business_date: date,
        created_at: new Date(), created_by: b.created_by || 'reception',
        customer: b.customer, amount: Number(b.amount) || 0,
        payment_method: b.payment_method, payment_breakdown: b.payment_breakdown || null,
        gift_card_code: code, notes: b.notes || '',
        is_reversal: false, reverses: null, reversed_by_event_id: null,
      }
      await db.collection('events').insertOne(event)
      await db.collection('gift_cards').updateOne({ code }, { $set: { source_event_id: event.id } })
      await writeAudit(db, {
        action: 'CREATE_EVENT', actor: event.created_by, role: b.role || 'RECEPTION',
        centre_id: event.centre_id, business_date: date, target_event_id: event.id,
        new_value: { type: event.type, amount: event.amount, code },
      })
      return cors(NextResponse.json({ event: clean(event), gift_card: clean(gc) }))
    }

    if (route === '/events/expense' && method === 'POST') {
      const b = await request.json()
      const date = b.business_date || businessDate()
      const bd = await ensureBusinessDay(db, b.centre_id, date)
      if (bd.status === 'CLOSED') return cors(NextResponse.json({ error: 'Business day is closed' }, { status: 400 }))
      const event = {
        id: uuidv4(), type: EVENT_TYPES.EXPENSE,
        centre_id: b.centre_id, business_date: date,
        created_at: new Date(), created_by: b.created_by || 'reception',
        amount: Number(b.amount) || 0, payment_method: b.payment_method,
        category: b.category, vendor: b.vendor || '', receipt_url: b.receipt_url || '',
        notes: b.notes || '',
        is_reversal: false, reverses: null, reversed_by_event_id: null,
      }
      await db.collection('events').insertOne(event)
      await writeAudit(db, {
        action: 'CREATE_EVENT', actor: event.created_by, role: b.role || 'RECEPTION',
        centre_id: event.centre_id, business_date: date, target_event_id: event.id,
        new_value: { type: event.type, amount: event.amount, category: event.category },
      })
      return cors(NextResponse.json(clean(event)))
    }

    if (route === '/events/cash-movement' && method === 'POST') {
      const b = await request.json()
      const date = b.business_date || businessDate()
      const bd = await ensureBusinessDay(db, b.centre_id, date)
      if (bd.status === 'CLOSED') return cors(NextResponse.json({ error: 'Business day is closed' }, { status: 400 }))
      if (!CASH_MOVEMENT_TYPES.includes(b.movement_type)) return cors(NextResponse.json({ error: 'Invalid movement_type' }, { status: 400 }))
      const event = {
        id: uuidv4(), type: EVENT_TYPES.CASH_MOVEMENT,
        centre_id: b.centre_id, business_date: date,
        created_at: new Date(), created_by: b.created_by || 'reception',
        amount: Number(b.amount) || 0, movement_type: b.movement_type,
        counterparty_centre_id: b.counterparty_centre_id || null, notes: b.notes || '',
        is_reversal: false, reverses: null, reversed_by_event_id: null,
      }
      await db.collection('events').insertOne(event)
      await writeAudit(db, {
        action: 'CREATE_EVENT', actor: event.created_by, role: b.role || 'RECEPTION',
        centre_id: event.centre_id, business_date: date, target_event_id: event.id,
        new_value: { type: event.type, amount: event.amount, movement_type: event.movement_type },
      })
      return cors(NextResponse.json(clean(event)))
    }

    // ---------------- IMMUTABLE REVERSAL ----------------
    // Creates a new opposite event; never edits the original.
    if (route.startsWith('/events/') && route.endsWith('/reverse') && method === 'POST') {
      const id = route.split('/')[2]
      const b = await request.json()
      const reason = (b.reason || '').trim()
      if (!reason) return cors(NextResponse.json({ error: 'Reversal reason is mandatory' }, { status: 400 }))
      const actor = b.actor || 'unknown'
      const role = b.role || 'RECEPTION'

      const original = await db.collection('events').findOne({ id })
      if (!original) return cors(NextResponse.json({ error: 'Event not found' }, { status: 404 }))
      if (original.is_reversal) return cors(NextResponse.json({ error: 'Cannot reverse a reversal event' }, { status: 400 }))
      if (original.reversed_by_event_id) return cors(NextResponse.json({ error: 'Event is already reversed' }, { status: 400 }))

      const bd = await db.collection('business_days').findOne({ centre_id: original.centre_id, business_date: original.business_date })
      if (bd?.status === 'CLOSED' && !['MANAGER', 'OPS', 'SUPER'].includes(role)) {
        return cors(NextResponse.json({ error: 'Business day is closed. Manager approval required to reverse.' }, { status: 403 }))
      }

      // Build the reversal event: a clone with is_reversal=true, same amount and metadata.
      // aggregate() negates its contribution via sign=-1.
      const reversal = {
        ...original,
        _id: undefined,
        id: uuidv4(),
        created_at: new Date(),
        created_by: actor,
        is_reversal: true,
        reverses: original.id,
        reversal_reason: reason,
        reversal_role: role,
        reversed_by_event_id: null,
      }
      delete reversal._id
      await db.collection('events').insertOne(reversal)

      // Point original at its reversal (metadata field only — original amounts untouched).
      await db.collection('events').updateOne({ id: original.id }, { $set: { reversed_by_event_id: reversal.id, reversed_at: new Date(), reversed_by: actor, reversal_reason: reason } })

      // Restore liability balances.
      if (original.type === 'MEMBERSHIP_SALE' && original.membership_code) {
        await db.collection('memberships').updateOne(
          { code: original.membership_code },
          { $set: { reversed: true, reversed_at: new Date(), reversed_reason: reason, active: false, remaining_paise: 0 } }
        )
      }
      if (original.type === 'GIFT_CARD_SALE' && original.gift_card_code) {
        await db.collection('gift_cards').updateOne(
          { code: original.gift_card_code },
          { $set: { reversed: true, reversed_at: new Date(), reversed_reason: reason, active: false, remaining_paise: 0 } }
        )
      }
      if (original.type === 'BOOKING' && original.payment_method === 'MEMBERSHIP' && original.redemption_ref) {
        await db.collection('memberships').updateOne(
          { code: original.redemption_ref },
          { $inc: { remaining_paise: original.amount || 0, redemption_count: -1 },
            $push: { restorations: { event_id: reversal.id, restored_amount: original.amount || 0, date: new Date() } } }
        )
      }
      if (original.type === 'BOOKING' && original.payment_method === 'GIFT_CARD' && original.redemption_ref) {
        await db.collection('gift_cards').updateOne(
          { code: original.redemption_ref },
          { $inc: { remaining_paise: original.amount || 0, redemption_count: -1 },
            $push: { restorations: { event_id: reversal.id, restored_amount: original.amount || 0, date: new Date() } } }
        )
      }

      await writeAudit(db, {
        action: 'REVERSE_EVENT', actor, role,
        centre_id: original.centre_id, business_date: original.business_date,
        target_event_id: original.id,
        reversal_event_id: reversal.id,
        previous_value: { amount: original.amount, type: original.type, payment_method: original.payment_method },
        new_value: { reversed: true, reversal_event_id: reversal.id },
        reason,
      })

      return cors(NextResponse.json({ ok: true, reversal_event: clean(reversal) }))
    }

    // ---------------- BUSINESS DAY ----------------
    if (route === '/business-day' && method === 'GET') {
      const centre_id = q.centre_id
      const date = q.date || businessDate()
      const bd = await ensureBusinessDay(db, centre_id, date)
      return cors(NextResponse.json(clean(bd)))
    }
    if (route === '/business-day/close' && method === 'POST') {
      const b = await request.json()
      const date = b.business_date || businessDate()
      const bd = await ensureBusinessDay(db, b.centre_id, date)
      const events = await db.collection('events').find({ centre_id: b.centre_id, business_date: date }).toArray()
      const agg = aggregate(events, bd.opening_cash || 0)
      const declared = Number(b.closing_cash_declared) || 0
      await db.collection('business_days').updateOne(
        { id: bd.id },
        { $set: {
          status: 'CLOSED', closing_cash_declared: declared, closing_cash_expected: agg.closing_cash_expected,
          variance: declared - agg.closing_cash_expected, closed_at: new Date(),
          closed_by: b.actor || 'reception', close_notes: b.notes || '',
        }})
      await writeAudit(db, {
        action: 'CLOSE_DAY', actor: b.actor || 'reception', role: b.role || 'RECEPTION',
        centre_id: b.centre_id, business_date: date,
        previous_value: { status: 'OPEN' },
        new_value: { status: 'CLOSED', declared, expected: agg.closing_cash_expected },
      })
      return cors(NextResponse.json({ ok: true, expected: agg.closing_cash_expected, declared, variance: declared - agg.closing_cash_expected }))
    }
    if (route === '/business-day/reopen' && method === 'POST') {
      const b = await request.json()
      if (!['MANAGER', 'OPS', 'SUPER'].includes(b.role)) return cors(NextResponse.json({ error: 'Manager+ required' }, { status: 403 }))
      const bd = await db.collection('business_days').findOne({ centre_id: b.centre_id, business_date: b.business_date })
      if (!bd) return cors(NextResponse.json({ error: 'Not found' }, { status: 404 }))
      await db.collection('business_days').updateOne({ id: bd.id }, { $set: { status: 'OPEN' }, $inc: { reopen_count: 1 } })
      await writeAudit(db, {
        action: 'REOPEN_DAY', actor: b.actor, role: b.role, centre_id: b.centre_id, business_date: b.business_date,
        previous_value: { status: 'CLOSED' }, new_value: { status: 'OPEN' }, reason: b.reason || '',
      })
      return cors(NextResponse.json({ ok: true }))
    }
    if (route === '/business-day/set-opening' && method === 'POST') {
      const b = await request.json()
      const bd = await ensureBusinessDay(db, b.centre_id, b.business_date || businessDate())
      await db.collection('business_days').updateOne({ id: bd.id }, { $set: { opening_cash: Number(b.opening_cash) || 0 } })
      return cors(NextResponse.json({ ok: true }))
    }

    // ---------------- DASHBOARD ----------------
    if (route === '/dashboard' && method === 'GET') {
      const date = q.date || businessDate()
      const filter = { business_date: date }
      if (q.centre_id && q.centre_id !== 'ALL') filter.centre_id = q.centre_id
      const events = await db.collection('events').find(filter).toArray()
      let opening = 0
      if (q.centre_id && q.centre_id !== 'ALL') {
        const bd = await ensureBusinessDay(db, q.centre_id, date)
        opening = bd.opening_cash || 0
      } else {
        const bds = await db.collection('business_days').find({ business_date: date }).toArray()
        opening = bds.reduce((s, b) => s + (b.opening_cash || 0), 0)
      }
      const agg = aggregate(events, opening)
      return cors(NextResponse.json({ date, agg, event_count: events.length }))
    }

    // ---------------- DRILL-DOWN ----------------
    // ?metric=<key>&centre_id=&date= OR &from=&to=
    if (route === '/drill-down' && method === 'GET') {
      const metric = q.metric
      if (!metric || !METRICS[metric]) return cors(NextResponse.json({ error: `Unknown metric: ${metric}` }, { status: 400 }))
      const filter = {}
      if (q.centre_id && q.centre_id !== 'ALL') filter.centre_id = q.centre_id
      if (q.date) filter.business_date = q.date
      if (q.from && q.to) filter.business_date = { $gte: q.from, $lte: q.to }
      if (q.type) filter.type = q.type
      const events = await db.collection('events').find(filter).sort({ created_at: -1 }).limit(5000).toArray()
      const result = drillDown(cleanArr(events), metric)
      // Group breakdown by event type for the top-level view.
      const breakdown = {}
      for (const item of result.events) {
        const t = item.event.type
        if (!breakdown[t]) breakdown[t] = { count: 0, total: 0 }
        breakdown[t].count += 1
        breakdown[t].total += item.contribution
      }
      return cors(NextResponse.json({
        metric, label: result.label, total: result.total, isCount: result.isCount || false,
        breakdown, events: result.events,
      }))
    }

    // ---------------- MASTER REGISTER ----------------
    if (route === '/master-register' && method === 'GET') {
      const centre_id = q.centre_id, from = q.from, to = q.to
      if (!centre_id || !from || !to) return cors(NextResponse.json({ error: 'centre_id, from, to required' }, { status: 400 }))
      const evFilter = { business_date: { $gte: from, $lte: to } }
      if (centre_id !== 'ALL') evFilter.centre_id = centre_id
      const bdFilter = { business_date: { $gte: from, $lte: to } }
      if (centre_id !== 'ALL') bdFilter.centre_id = centre_id
      const events = await db.collection('events').find(evFilter).toArray()
      const bds = await db.collection('business_days').find(bdFilter).toArray()

      const rows = []
      const dates = new Set(events.map(e => e.business_date).concat(bds.map(b => b.business_date)))
      const sorted = Array.from(dates).sort()
      for (const d of sorted) {
        const dayEvents = events.filter(e => e.business_date === d)
        const dayBds = bds.filter(b => b.business_date === d)
        const opening = dayBds.reduce((s, b) => s + (b.opening_cash || 0), 0)
        const agg = aggregate(dayEvents, opening)
        rows.push({
          business_date: d, opening_cash: opening, ...agg,
          declared_closing: dayBds.reduce((s, b) => s + (b.closing_cash_declared || 0), 0),
          status: dayBds.every(b => b.status === 'CLOSED') && dayBds.length > 0 ? 'CLOSED' : 'OPEN',
        })
      }
      return cors(NextResponse.json({ rows }))
    }

    // ---------------- CASH BOOK ----------------
    if (route === '/cash-book' && method === 'GET') {
      const centre_id = q.centre_id
      const date = q.date || businessDate()
      if (!centre_id) return cors(NextResponse.json({ error: 'centre_id required' }, { status: 400 }))
      const bd = await ensureBusinessDay(db, centre_id, date)
      const events = await db.collection('events')
        .find({ centre_id, business_date: date }).sort({ created_at: 1 }).toArray()

      const lines = []
      let running = bd.opening_cash || 0
      lines.push({ time: null, ref: 'OPENING', desc: 'Opening Cash', in: bd.opening_cash || 0, out: 0, running })

      for (const ev of events) {
        const sign = ev.is_reversal ? -1 : 1
        let inAmt = 0, outAmt = 0, desc = '', ref = ev.type
        if (ev.type === 'BOOKING' || ev.type === 'MEMBERSHIP_SALE' || ev.type === 'GIFT_CARD_SALE') {
          const cash = paymentSplit(ev).cash
          if (cash > 0) {
            const signed = sign * cash
            if (signed >= 0) { inAmt = signed } else { outAmt = -signed }
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
      return cors(NextResponse.json({ business_day: clean(bd), lines, agg }))
    }

    // ---------------- MEMBERSHIPS / GIFT CARDS ----------------
    if (route === '/memberships' && method === 'GET') {
      const list = await db.collection('memberships').find({}).sort({ created_at: -1 }).limit(500).toArray()
      return cors(NextResponse.json(cleanArr(list)))
    }
    if (route.startsWith('/memberships/') && method === 'GET') {
      const code = decodeURIComponent(route.split('/')[2])
      const m = await db.collection('memberships').findOne({ code })
      return cors(NextResponse.json(m ? clean(m) : null))
    }
    if (route === '/gift-cards' && method === 'GET') {
      const list = await db.collection('gift_cards').find({}).sort({ created_at: -1 }).limit(500).toArray()
      return cors(NextResponse.json(cleanArr(list)))
    }
    if (route.startsWith('/gift-cards/') && method === 'GET') {
      const code = decodeURIComponent(route.split('/')[2])
      const g = await db.collection('gift_cards').findOne({ code })
      return cors(NextResponse.json(g ? clean(g) : null))
    }

    // ---------------- AUDIT LOG ----------------
    if (route === '/audit-log' && method === 'GET') {
      const filter = {}
      if (q.target_event_id) filter.target_event_id = q.target_event_id
      if (q.action) filter.action = q.action
      const list = await db.collection('audit_log').find(filter).sort({ created_at: -1 }).limit(1000).toArray()
      return cors(NextResponse.json(cleanArr(list)))
    }

    return cors(NextResponse.json({ error: `Route ${route} not found` }, { status: 404 }))
  } catch (err) {
    console.error('API Error:', err)
    return cors(NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 }))
  }
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const DELETE = handle
export const PATCH = handle
