import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import {
  aggregate, drillDown, businessDate, periodLabel,
  EVENT_TYPES, CASH_MOVEMENT_TYPES, METRICS, APPROVED_CENTRES,
  cashImpact, paymentSplit,
} from '@/lib/financial-engine'

let client, db
async function getDb() {
  if (!client) {
    client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
    db = client.db(process.env.DB_NAME)
    await cleanupInvalidCentres(db)
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

// Purge any centre that is not in the approved list, and CASCADE-delete
// every operational record referencing it. Also delete any events with
// legacy UPI payment_method (before the UPI_1/UPI_2 split) since they can't
// be attributed and would poison reports.
async function cleanupInvalidCentres(db) {
  const all = await db.collection('centres').find({}).toArray()
  const invalid = all.filter(c => !APPROVED_CENTRES.includes(c.name))
  const invalidIds = invalid.map(c => c.id)

  // Rename legacy "Phoenix" to "Phoenix Pallassio" (preserving centre id + history)
  const legacyPhoenix = all.find(c => c.name === 'Phoenix')
  if (legacyPhoenix) {
    await db.collection('centres').updateOne({ id: legacyPhoenix.id }, { $set: { name: 'Phoenix Pallassio' } })
    // Not invalid anymore — remove from invalidIds
    const i = invalidIds.indexOf(legacyPhoenix.id)
    if (i >= 0) invalidIds.splice(i, 1)
  }

  if (invalidIds.length > 0) {
    await db.collection('events').deleteMany({ centre_id: { $in: invalidIds } })
    await db.collection('business_days').deleteMany({ centre_id: { $in: invalidIds } })
    await db.collection('memberships').deleteMany({ sold_at_centre_id: { $in: invalidIds } })
    await db.collection('gift_cards').deleteMany({ sold_at_centre_id: { $in: invalidIds } })
    await db.collection('audit_log').deleteMany({ centre_id: { $in: invalidIds } })
    await db.collection('centres').deleteMany({ id: { $in: invalidIds } })
  }

  // Legacy UPI events → wipe (payment method split changed). This is a one-time cleanup.
  const legacyUpiEvents = await db.collection('events').find({ payment_method: 'UPI' }).toArray()
  if (legacyUpiEvents.length > 0) {
    const ids = legacyUpiEvents.map(e => e.id)
    await db.collection('events').deleteMany({ id: { $in: ids } })
    // Also remove reversals that reversed a deleted event
    await db.collection('events').deleteMany({ reverses: { $in: ids } })
  }
}

async function ensureSeed(db) {
  for (const name of APPROVED_CENTRES) {
    const exists = await db.collection('centres').findOne({ name })
    if (!exists) {
      const code = name === 'Phoenix Pallassio' ? 'PHNX' : name === 'Holiday Inn' ? 'HINN' : 'LULU'
      const city = name === 'Phoenix Pallassio' ? 'Lucknow' : name === 'Holiday Inn' ? 'Lucknow' : 'Lucknow'
      await db.collection('centres').insertOne({
        id: uuidv4(), name, code, city, active: true, created_at: new Date(),
      })
    }
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

async function validateCentre(db, centre_id) {
  const c = await db.collection('centres').findOne({ id: centre_id, active: true })
  if (!c) throw new Error(`Invalid or unknown centre_id: ${centre_id}`)
  if (!APPROVED_CENTRES.includes(c.name)) throw new Error(`Centre "${c.name}" is not approved`)
  return c
}

async function writeAudit(db, entry) {
  await db.collection('audit_log').insertOne({ id: uuidv4(), created_at: new Date(), ...entry })
}

// Enrich event with derived state. Original event is NEVER mutated.
// "reversed" state is derived by looking for a reversal event with reverses=<id>.
async function enrichEvent(db, ev) {
  if (!ev) return null
  const centre = await db.collection('centres').findOne({ id: ev.centre_id })
  const enriched = { ...ev, centre: centre ? clean(centre) : null }

  // Derived: is this event reversed by another?
  const reversal = await db.collection('events').findOne({ reverses: ev.id, is_reversal: true })
  enriched.reversed = !!reversal
  enriched.reversal_event = reversal ? clean(reversal) : null

  // Derived: is this itself a reversal?
  if (ev.reverses) {
    enriched.original_event = clean(await db.collection('events').findOne({ id: ev.reverses }))
  }

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
  const sign = ev.is_reversal ? -1 : 1
  const split = paymentSplit(ev)
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
      : (ev.type === 'BOOKING' && (ev.payment_method === 'MEMBERSHIP' || ev.payment_method === 'GIFT_CARD') ? -sign * (ev.amount || 0) : 0),
  }
  enriched.audit_history = cleanArr(
    await db.collection('audit_log').find({ target_event_id: ev.id }).sort({ created_at: 1 }).toArray()
  )
  return enriched
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

    // ---------------- SERVICES ----------------
    if (route === '/services' && method === 'GET') {
      const s = await db.collection('services').find({ active: true }).toArray()
      return cors(NextResponse.json(cleanArr(s)))
    }

    // ---------------- METRICS ----------------
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
      const events = await db.collection('events').find(filter).sort({ created_at: -1 }).limit(5000).toArray()
      return cors(NextResponse.json(cleanArr(events)))
    }
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
      await validateCentre(db, b.centre_id)
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
        is_reversal: false, reverses: null,
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
      await validateCentre(db, b.centre_id)
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
        is_reversal: false, reverses: null,
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
      await validateCentre(db, b.centre_id)
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
        is_reversal: false, reverses: null,
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
      await validateCentre(db, b.centre_id)
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
        is_reversal: false, reverses: null,
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
      await validateCentre(db, b.centre_id)
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
        is_reversal: false, reverses: null,
      }
      await db.collection('events').insertOne(event)
      await writeAudit(db, {
        action: 'CREATE_EVENT', actor: event.created_by, role: b.role || 'RECEPTION',
        centre_id: event.centre_id, business_date: date, target_event_id: event.id,
        new_value: { type: event.type, amount: event.amount, movement_type: event.movement_type },
      })
      return cors(NextResponse.json(clean(event)))
    }

    // ---------------- IMMUTABLE REVERSAL (never mutates original event) ----------------
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

      // Derive "already reversed" state without touching original
      const existingReversal = await db.collection('events').findOne({ reverses: id, is_reversal: true })
      if (existingReversal) return cors(NextResponse.json({ error: 'Event is already reversed' }, { status: 400 }))

      const bd = await db.collection('business_days').findOne({ centre_id: original.centre_id, business_date: original.business_date })
      if (bd?.status === 'CLOSED' && !['MANAGER', 'OPS', 'SUPER'].includes(role)) {
        return cors(NextResponse.json({ error: 'Business day is closed. Manager approval required to reverse.' }, { status: 403 }))
      }

      // Build reversal event: NEW UUID, NEW timestamp, is_reversal=true, reverses=originalId.
      // All financial fields copied so aggregate() can negate them via sign=-1.
      const reversal = {
        id: uuidv4(),
        type: original.type,
        centre_id: original.centre_id,                 // SAME CENTRE
        business_date: original.business_date,         // same date — reversal on same day for simplicity
        created_at: new Date(),                        // NEW timestamp
        created_by: actor,
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
        counterparty_centre_id: original.counterparty_centre_id,
        category: original.category,
        vendor: original.vendor,
        membership_code: original.membership_code,
        gift_card_code: original.gift_card_code,
        notes: `Reversal of ${original.id}`,
        is_reversal: true,
        reverses: original.id,
        reversal_reason: reason,
        reversal_role: role,
      }
      Object.keys(reversal).forEach(k => reversal[k] === undefined && delete reversal[k])
      await db.collection('events').insertOne(reversal)

      // IMPORTANT: The original event is NOT modified in any way. No updateOne on it.
      // "Reversed" state is derived by querying for a reversal event where reverses=<id>.

      // Update liability aggregate state (memberships/gift_cards are state — not events).
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
      const bd = await ensureBusinessDay(db, q.centre_id, q.date || businessDate())
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
    if (route === '/drill-down' && method === 'GET') {
      const metric = q.metric
      if (!metric || !METRICS[metric]) return cors(NextResponse.json({ error: `Unknown metric: ${metric}` }, { status: 400 }))
      const filter = {}
      if (q.centre_id && q.centre_id !== 'ALL') filter.centre_id = q.centre_id
      if (q.date) filter.business_date = q.date
      if (q.from && q.to) filter.business_date = { $gte: q.from, $lte: q.to }
      if (q.type) filter.type = q.type
      const events = await db.collection('events').find(filter).sort({ created_at: -1 }).limit(10000).toArray()
      const result = drillDown(cleanArr(events), metric)
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
      const events = await db.collection('events').find({ centre_id, business_date: date }).sort({ created_at: 1 }).toArray()
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
      return cors(NextResponse.json({ business_day: clean(bd), lines, agg }))
    }

    // ---------------- REPORTS ----------------
    // /reports/pl?centre_id=&from=&to=&group=day|week|month|year
    if (route === '/reports/pl' && method === 'GET') {
      const centre_id = q.centre_id || 'ALL'
      const from = q.from, to = q.to
      const group = q.group || 'month'
      if (!from || !to) return cors(NextResponse.json({ error: 'from, to required (YYYY-MM-DD)' }, { status: 400 }))

      const centres = await db.collection('centres').find({ active: true }).sort({ name: 1 }).toArray()
      const centreIds = centres.map(c => c.id)
      const centreById = Object.fromEntries(centres.map(c => [c.id, c]))

      const evFilter = { business_date: { $gte: from, $lte: to }, centre_id: { $in: centre_id === 'ALL' ? centreIds : [centre_id] } }
      const bdFilter = { business_date: { $gte: from, $lte: to }, centre_id: { $in: centre_id === 'ALL' ? centreIds : [centre_id] } }
      const events = await db.collection('events').find(evFilter).toArray()
      const bds = await db.collection('business_days').find(bdFilter).toArray()

      // Bucket by (period, centre_id)
      const bucket = new Map()      // key = period|centreId → events[]
      const openings = new Map()    // key = period|centreId → paise
      const periods = new Set()
      for (const ev of events) {
        const p = periodLabel(ev.business_date, group)
        periods.add(p)
        const key = p + '|' + ev.centre_id
        if (!bucket.has(key)) bucket.set(key, [])
        bucket.get(key).push(ev)
      }
      for (const bd of bds) {
        const p = periodLabel(bd.business_date, group)
        periods.add(p)
        const key = p + '|' + bd.centre_id
        openings.set(key, (openings.get(key) || 0) + (bd.opening_cash || 0))
      }
      const includedCentres = centre_id === 'ALL' ? centres : [centreById[centre_id]].filter(Boolean)

      const rows = []
      for (const p of Array.from(periods).sort()) {
        const perCentre = []
        let consolidatedEvents = []
        let consolidatedOpening = 0
        for (const c of includedCentres) {
          const key = p + '|' + c.id
          const evs = bucket.get(key) || []
          const opening = openings.get(key) || 0
          if (evs.length === 0 && opening === 0) continue
          const agg = aggregate(evs, opening)
          perCentre.push({ centre_id: c.id, centre_name: c.name, opening_cash: opening, ...agg })
          consolidatedEvents = consolidatedEvents.concat(evs)
          consolidatedOpening += opening
        }
        rows.push({
          period: p,
          per_centre: perCentre,
          consolidated: { opening_cash: consolidatedOpening, ...aggregate(consolidatedEvents, consolidatedOpening) },
        })
      }

      // Grand totals
      const grandPerCentre = []
      for (const c of includedCentres) {
        const evs = events.filter(e => e.centre_id === c.id)
        const opening = bds.filter(b => b.centre_id === c.id).reduce((s, b) => s + (b.opening_cash || 0), 0)
        if (evs.length === 0 && opening === 0) continue
        grandPerCentre.push({ centre_id: c.id, centre_name: c.name, opening_cash: opening, ...aggregate(evs, opening) })
      }
      const totalOpening = bds.reduce((s, b) => s + (b.opening_cash || 0), 0)
      const grandConsolidated = { opening_cash: totalOpening, ...aggregate(events, totalOpening) }

      return cors(NextResponse.json({
        group, from, to, centre_id,
        rows, totals: { per_centre: grandPerCentre, consolidated: grandConsolidated },
      }))
    }

    // /reports/csv — same shape as /reports/pl but returns CSV.
    if (route === '/reports/csv' && method === 'GET') {
      const centre_id = q.centre_id || 'ALL'
      const from = q.from, to = q.to
      const group = q.group || 'month'
      if (!from || !to) return cors(NextResponse.json({ error: 'from, to required' }, { status: 400 }))
      const params = new URLSearchParams({ centre_id, from, to, group })
      const plUrl = new URL(url.href.replace('/reports/csv', '/reports/pl'))
      plUrl.search = params.toString()
      // Recompute inline to avoid HTTP self-call
      const centres = await db.collection('centres').find({ active: true }).sort({ name: 1 }).toArray()
      const centreIds = centres.map(c => c.id)
      const evFilter = { business_date: { $gte: from, $lte: to }, centre_id: { $in: centre_id === 'ALL' ? centreIds : [centre_id] } }
      const bdFilter = evFilter
      const events = await db.collection('events').find(evFilter).toArray()
      const bds = await db.collection('business_days').find(bdFilter).toArray()

      const bucket = new Map(), openings = new Map(), periods = new Set()
      for (const ev of events) { const p = periodLabel(ev.business_date, group); periods.add(p); const k = p+'|'+ev.centre_id; if(!bucket.has(k)) bucket.set(k,[]); bucket.get(k).push(ev) }
      for (const bd of bds) { const p = periodLabel(bd.business_date, group); periods.add(p); const k = p+'|'+bd.centre_id; openings.set(k, (openings.get(k)||0)+(bd.opening_cash||0)) }
      const includedCentres = centre_id === 'ALL' ? centres : centres.filter(c => c.id === centre_id)

      const flat = []
      for (const p of Array.from(periods).sort()) {
        for (const c of includedCentres) {
          const evs = bucket.get(p+'|'+c.id) || []
          const opening = openings.get(p+'|'+c.id) || 0
          if (evs.length === 0 && opening === 0) continue
          flat.push({ period: p, centre: c.name, opening, agg: aggregate(evs, opening) })
        }
        if (includedCentres.length > 1) {
          const evs = includedCentres.flatMap(c => bucket.get(p+'|'+c.id) || [])
          const opening = includedCentres.reduce((s,c) => s + (openings.get(p+'|'+c.id) || 0), 0)
          if (evs.length > 0 || opening > 0) flat.push({ period: p, centre: 'ALL CENTRES', opening, agg: aggregate(evs, opening) })
        }
      }

      const toR = paise => (Number(paise||0)/100).toFixed(2)
      const cols = [
        { label: 'Period', get: r => r.period },
        { label: 'Centre', get: r => r.centre },
        { label: 'Opening Cash', get: r => toR(r.opening) },
        { label: 'Booking Sales', get: r => toR(r.agg.booking_sales) },
        { label: 'Membership Sales', get: r => toR(r.agg.membership_sales) },
        { label: 'Gift Card Sales', get: r => toR(r.agg.gift_card_sales) },
        { label: 'Gross Revenue', get: r => toR(r.agg.gross_revenue) },
        { label: 'Revenue Reversals', get: r => toR(r.agg.revenue_reversals) },
        { label: 'Net Revenue', get: r => toR(r.agg.net_revenue) },
        { label: 'Cash Sales', get: r => toR(r.agg.cash_sales) },
        { label: 'UPI 1 Sales', get: r => toR(r.agg.upi_1_sales) },
        { label: 'UPI 2 Sales', get: r => toR(r.agg.upi_2_sales) },
        { label: 'Card Sales', get: r => toR(r.agg.card_sales) },
        { label: 'Membership Redemption', get: r => toR(r.agg.membership_redemption_value) },
        { label: 'Gift Card Redemption', get: r => toR(r.agg.gift_card_redemption_value) },
        { label: 'Cash Expenses', get: r => toR(r.agg.cash_expenses) },
        { label: 'UPI 1 Expenses', get: r => toR(r.agg.upi_1_expenses) },
        { label: 'UPI 2 Expenses', get: r => toR(r.agg.upi_2_expenses) },
        { label: 'Card Expenses', get: r => toR(r.agg.card_expenses) },
        { label: 'Wages', get: r => toR(r.agg.wages_expenses) },
        { label: 'Gross Expenses', get: r => toR(r.agg.gross_expenses) },
        { label: 'Expense Reversals', get: r => toR(r.agg.expense_reversals) },
        { label: 'Net Expenses', get: r => toR(r.agg.net_expenses) },
        { label: 'Net Profit', get: r => toR(r.agg.net_profit) },
        { label: 'Bank Deposits', get: r => toR(r.agg.cash_deposited) },
        { label: 'Owner Withdrawals', get: r => toR(r.agg.cash_withdrawn) },
        { label: 'Cash Transfer In', get: r => toR(r.agg.cash_transfer_in) },
        { label: 'Cash Transfer Out', get: r => toR(r.agg.cash_transfer_out) },
        { label: 'Float Added', get: r => toR(r.agg.float_added) },
        { label: 'Expected Closing Cash', get: r => toR(r.agg.closing_cash_expected) },
        { label: 'Bookings', get: r => r.agg.bookings },
        { label: 'Redemptions', get: r => r.agg.redemptions },
        { label: 'Guests', get: r => r.agg.guests },
      ]
      const csv = toCsv(flat, cols)
      const meta = `# Aurea Spa ERP — P&L Report\n# Centre: ${centre_id === 'ALL' ? 'All Centres' : includedCentres[0]?.name || centre_id}\n# Period: ${from} to ${to} • Group: ${group}\n\n`
      return new NextResponse(meta + csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename=spa-erp-${group}-${from}-to-${to}.csv`,
        }
      })
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
