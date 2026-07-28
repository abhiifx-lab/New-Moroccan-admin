// FINANCIAL ENGINE — the ONLY place financial numbers are calculated.
// All amounts stored/handled in PAISE (integer). Rupees are for display only.
// Every dashboard, register, cash book, report calls aggregate() — nothing else.

export const EVENT_TYPES = {
  BOOKING: 'BOOKING',
  MEMBERSHIP_SALE: 'MEMBERSHIP_SALE',
  GIFT_CARD_SALE: 'GIFT_CARD_SALE',
  EXPENSE: 'EXPENSE',
  CASH_MOVEMENT: 'CASH_MOVEMENT',
}

export const PAY_METHODS = ['CASH', 'UPI', 'CARD', 'MIXED', 'MEMBERSHIP', 'GIFT_CARD']

export const CASH_MOVEMENT_TYPES = [
  'BANK_DEPOSIT',        // cash out of drawer (to bank)
  'OWNER_WITHDRAWAL',    // cash out (to owner)
  'CASH_TRANSFER_OUT',   // cash out (to another centre)
  'CASH_TRANSFER_IN',    // cash in (from another centre)
  'FLOAT_ADDED',         // cash in (float top-up)
  'CASH_RECEIVED',       // cash in (other)
  'CASH_HANDED_OVER',    // cash out (other)
]

const CASH_IN_MOVEMENTS = new Set(['CASH_TRANSFER_IN', 'FLOAT_ADDED', 'CASH_RECEIVED'])
const CASH_OUT_MOVEMENTS = new Set(['BANK_DEPOSIT', 'OWNER_WITHDRAWAL', 'CASH_TRANSFER_OUT', 'CASH_HANDED_OVER'])

// Given a booking/sale event, return {cash, upi, card} split in paise.
function splitByPayment(ev) {
  const amt = ev.amount || 0
  const pm = ev.payment_method
  if (pm === 'CASH') return { cash: amt, upi: 0, card: 0 }
  if (pm === 'UPI')  return { cash: 0, upi: amt, card: 0 }
  if (pm === 'CARD') return { cash: 0, upi: 0, card: amt }
  if (pm === 'MIXED') {
    const b = ev.payment_breakdown || {}
    return { cash: b.cash || 0, upi: b.upi || 0, card: b.card || 0 }
  }
  // MEMBERSHIP / GIFT_CARD redemption — no revenue, no cash movement
  return { cash: 0, upi: 0, card: 0 }
}

// The one and only aggregator. Feed it events + opening cash → get every number.
export function aggregate(events, openingCashPaise = 0) {
  const R = {
    opening_cash: openingCashPaise,

    // Revenue (Booking + Membership + Gift Card sales — REDEMPTIONS DO NOT COUNT)
    booking_sales: 0,
    membership_sales: 0,
    gift_card_sales: 0,
    total_revenue: 0,

    // Cash-flow buckets from sales (only the paid-in-cash/upi/card portion)
    cash_sales: 0,
    upi_sales: 0,
    card_sales: 0,

    // Expenses
    total_expenses: 0,
    cash_expenses: 0,
    upi_expenses: 0,
    card_expenses: 0,

    // Cash movements
    cash_deposited: 0,        // BANK_DEPOSIT
    cash_withdrawn: 0,        // OWNER_WITHDRAWAL
    cash_transfer_in: 0,
    cash_transfer_out: 0,
    float_added: 0,
    other_cash_in: 0,
    other_cash_out: 0,

    // Counts
    guests: 0,
    bookings: 0,
    redemptions: 0,
    memberships_sold: 0,
    gift_cards_sold: 0,
    expenses_count: 0,
    cash_movements_count: 0,

    // Derived
    closing_cash_expected: 0,
    net_profit: 0,
  }

  const customers = new Set()

  for (const ev of events) {
    if (ev.reversed) continue // skip reversed events

    if (ev.type === EVENT_TYPES.BOOKING) {
      R.bookings += 1
      if (ev.customer) customers.add(ev.customer)
      if (ev.payment_method === 'MEMBERSHIP' || ev.payment_method === 'GIFT_CARD') {
        R.redemptions += 1
        // No revenue, no cash. Only operational usage.
      } else {
        R.booking_sales += ev.amount || 0
        const s = splitByPayment(ev)
        R.cash_sales += s.cash
        R.upi_sales  += s.upi
        R.card_sales += s.card
      }
    } else if (ev.type === EVENT_TYPES.MEMBERSHIP_SALE) {
      R.membership_sales += ev.amount || 0
      R.memberships_sold += 1
      const s = splitByPayment(ev)
      R.cash_sales += s.cash
      R.upi_sales  += s.upi
      R.card_sales += s.card
      if (ev.customer) customers.add(ev.customer)
    } else if (ev.type === EVENT_TYPES.GIFT_CARD_SALE) {
      R.gift_card_sales += ev.amount || 0
      R.gift_cards_sold += 1
      const s = splitByPayment(ev)
      R.cash_sales += s.cash
      R.upi_sales  += s.upi
      R.card_sales += s.card
      if (ev.customer) customers.add(ev.customer)
    } else if (ev.type === EVENT_TYPES.EXPENSE) {
      R.total_expenses += ev.amount || 0
      R.expenses_count += 1
      if (ev.payment_method === 'CASH') R.cash_expenses += ev.amount || 0
      else if (ev.payment_method === 'UPI') R.upi_expenses += ev.amount || 0
      else if (ev.payment_method === 'CARD') R.card_expenses += ev.amount || 0
    } else if (ev.type === EVENT_TYPES.CASH_MOVEMENT) {
      R.cash_movements_count += 1
      const t = ev.movement_type
      const a = ev.amount || 0
      if (t === 'BANK_DEPOSIT') R.cash_deposited += a
      else if (t === 'OWNER_WITHDRAWAL') R.cash_withdrawn += a
      else if (t === 'CASH_TRANSFER_IN') R.cash_transfer_in += a
      else if (t === 'CASH_TRANSFER_OUT') R.cash_transfer_out += a
      else if (t === 'FLOAT_ADDED') R.float_added += a
      else if (t === 'CASH_RECEIVED') R.other_cash_in += a
      else if (t === 'CASH_HANDED_OVER') R.other_cash_out += a
    }
  }

  R.total_revenue = R.booking_sales + R.membership_sales + R.gift_card_sales
  R.guests = customers.size

  // Closing cash formula — the single source of truth.
  R.closing_cash_expected =
    R.opening_cash
    + R.cash_sales
    + R.cash_transfer_in
    + R.float_added
    + R.other_cash_in
    - R.cash_expenses
    - R.cash_deposited
    - R.cash_withdrawn
    - R.cash_transfer_out
    - R.other_cash_out

  R.net_profit = R.total_revenue - R.total_expenses
  return R
}

// Format helpers
export function toPaise(rupees) {
  const n = Number(rupees)
  if (!isFinite(n)) return 0
  return Math.round(n * 100)
}
export function toRupees(paise) {
  return (Number(paise || 0) / 100)
}
export function formatINR(paise) {
  const r = toRupees(paise)
  return '₹' + r.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Business date helper — YYYY-MM-DD in Asia/Kolkata
export function businessDate(d = new Date()) {
  const opts = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }
  const parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(d)
  const y = parts.find(p => p.type === 'year').value
  const m = parts.find(p => p.type === 'month').value
  const day = parts.find(p => p.type === 'day').value
  return `${y}-${m}-${day}`
}
