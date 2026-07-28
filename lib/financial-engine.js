// FINANCIAL ENGINE — the ONLY place financial numbers are calculated.
// All amounts stored/handled in PAISE (integer). Rupees are for display only.
// Every dashboard, register, cash book, report calls aggregate() — nothing else.
//
// IMMUTABILITY: events are NEVER edited or deleted.
// Reversals are new events with is_reversal=true and reverses=<originalId>.
// aggregate() negates the contribution of any is_reversal event via sign=-1.

export const EVENT_TYPES = {
  BOOKING: 'BOOKING',
  MEMBERSHIP_SALE: 'MEMBERSHIP_SALE',
  GIFT_CARD_SALE: 'GIFT_CARD_SALE',
  EXPENSE: 'EXPENSE',
  CASH_MOVEMENT: 'CASH_MOVEMENT',
}

export const PAY_METHODS = ['CASH', 'UPI', 'CARD', 'MIXED', 'MEMBERSHIP', 'GIFT_CARD']

export const CASH_MOVEMENT_TYPES = [
  'BANK_DEPOSIT',
  'OWNER_WITHDRAWAL',
  'CASH_TRANSFER_OUT',
  'CASH_TRANSFER_IN',
  'FLOAT_ADDED',
  'CASH_RECEIVED',
  'CASH_HANDED_OVER',
]

// Metric registry — the single map of "metric name → filter + per-event contribution".
// Every drill-down, dashboard number, register column reads from here.
export const METRICS = {
  total_revenue: {
    label: 'Total Revenue',
    filter: e => (e.type === 'MEMBERSHIP_SALE' || e.type === 'GIFT_CARD_SALE' ||
      (e.type === 'BOOKING' && e.payment_method !== 'MEMBERSHIP' && e.payment_method !== 'GIFT_CARD')),
    contribute: e => e.amount || 0,
  },
  booking_sales: {
    label: 'Booking Sales',
    filter: e => e.type === 'BOOKING' && e.payment_method !== 'MEMBERSHIP' && e.payment_method !== 'GIFT_CARD',
    contribute: e => e.amount || 0,
  },
  membership_sales: {
    label: 'Membership Sales',
    filter: e => e.type === 'MEMBERSHIP_SALE',
    contribute: e => e.amount || 0,
  },
  gift_card_sales: {
    label: 'Gift Card Sales',
    filter: e => e.type === 'GIFT_CARD_SALE',
    contribute: e => e.amount || 0,
  },
  cash_sales: {
    label: 'Cash Sales',
    filter: e => ['BOOKING','MEMBERSHIP_SALE','GIFT_CARD_SALE'].includes(e.type)
      && (e.payment_method === 'CASH' || e.payment_method === 'MIXED')
      && cashPortion(e) > 0,
    contribute: e => cashPortion(e),
  },
  upi_sales: {
    label: 'UPI Sales',
    filter: e => ['BOOKING','MEMBERSHIP_SALE','GIFT_CARD_SALE'].includes(e.type)
      && (e.payment_method === 'UPI' || e.payment_method === 'MIXED')
      && upiPortion(e) > 0,
    contribute: e => upiPortion(e),
  },
  card_sales: {
    label: 'Card Sales',
    filter: e => ['BOOKING','MEMBERSHIP_SALE','GIFT_CARD_SALE'].includes(e.type)
      && (e.payment_method === 'CARD' || e.payment_method === 'MIXED')
      && cardPortion(e) > 0,
    contribute: e => cardPortion(e),
  },
  total_expenses: {
    label: 'Expenses',
    filter: e => e.type === 'EXPENSE',
    contribute: e => e.amount || 0,
  },
  cash_expenses: {
    label: 'Cash Expenses',
    filter: e => e.type === 'EXPENSE' && e.payment_method === 'CASH',
    contribute: e => e.amount || 0,
  },
  upi_expenses: {
    label: 'UPI Expenses',
    filter: e => e.type === 'EXPENSE' && e.payment_method === 'UPI',
    contribute: e => e.amount || 0,
  },
  card_expenses: {
    label: 'Card Expenses',
    filter: e => e.type === 'EXPENSE' && e.payment_method === 'CARD',
    contribute: e => e.amount || 0,
  },
  cash_deposited: {
    label: 'Bank Deposits',
    filter: e => e.type === 'CASH_MOVEMENT' && e.movement_type === 'BANK_DEPOSIT',
    contribute: e => e.amount || 0,
  },
  cash_withdrawn: {
    label: 'Owner Withdrawals',
    filter: e => e.type === 'CASH_MOVEMENT' && e.movement_type === 'OWNER_WITHDRAWAL',
    contribute: e => e.amount || 0,
  },
  cash_transfer_in: {
    label: 'Cash Transfer In',
    filter: e => e.type === 'CASH_MOVEMENT' && e.movement_type === 'CASH_TRANSFER_IN',
    contribute: e => e.amount || 0,
  },
  cash_transfer_out: {
    label: 'Cash Transfer Out',
    filter: e => e.type === 'CASH_MOVEMENT' && e.movement_type === 'CASH_TRANSFER_OUT',
    contribute: e => e.amount || 0,
  },
  float_added: {
    label: 'Float Added',
    filter: e => e.type === 'CASH_MOVEMENT' && e.movement_type === 'FLOAT_ADDED',
    contribute: e => e.amount || 0,
  },
  bookings: {
    label: 'Bookings',
    filter: e => e.type === 'BOOKING',
    contribute: () => 1,
    isCount: true,
  },
  redemptions: {
    label: 'Redemptions',
    filter: e => e.type === 'BOOKING' && (e.payment_method === 'MEMBERSHIP' || e.payment_method === 'GIFT_CARD'),
    contribute: () => 1,
    isCount: true,
  },
  memberships_sold: {
    label: 'Memberships Sold',
    filter: e => e.type === 'MEMBERSHIP_SALE',
    contribute: () => 1,
    isCount: true,
  },
  gift_cards_sold: {
    label: 'Gift Cards Sold',
    filter: e => e.type === 'GIFT_CARD_SALE',
    contribute: () => 1,
    isCount: true,
  },
  guests: {
    label: 'Guests',
    filter: e => ['BOOKING','MEMBERSHIP_SALE','GIFT_CARD_SALE'].includes(e.type),
    contribute: () => 1,
    isCount: true,
    unique: 'customer',
  },
  net_profit: {
    label: 'Net Profit',
    filter: e => ['BOOKING','MEMBERSHIP_SALE','GIFT_CARD_SALE','EXPENSE'].includes(e.type),
    contribute: e => {
      if (e.type === 'EXPENSE') return -(e.amount || 0)
      if (e.type === 'BOOKING' && (e.payment_method === 'MEMBERSHIP' || e.payment_method === 'GIFT_CARD')) return 0
      return e.amount || 0
    },
  },
  opening_cash: {
    label: 'Opening Cash',
    filter: () => false, // opening cash is not an event; handled specially
    contribute: () => 0,
  },
  closing_cash_expected: {
    label: 'Expected Closing Cash',
    filter: e => cashImpact(e) !== 0,
    contribute: e => cashImpact(e),
  },
}

function paymentSplit(ev) {
  const amt = ev.amount || 0
  const pm = ev.payment_method
  if (pm === 'CASH') return { cash: amt, upi: 0, card: 0 }
  if (pm === 'UPI')  return { cash: 0, upi: amt, card: 0 }
  if (pm === 'CARD') return { cash: 0, upi: 0, card: amt }
  if (pm === 'MIXED') {
    const b = ev.payment_breakdown || {}
    return { cash: b.cash || 0, upi: b.upi || 0, card: b.card || 0 }
  }
  return { cash: 0, upi: 0, card: 0 }
}
function cashPortion(e) { return paymentSplit(e).cash }
function upiPortion(e)  { return paymentSplit(e).upi }
function cardPortion(e) { return paymentSplit(e).card }

// The net effect on drawer cash for a single event (positive = cash-in).
function cashImpact(ev) {
  if (ev.type === 'BOOKING' || ev.type === 'MEMBERSHIP_SALE' || ev.type === 'GIFT_CARD_SALE') {
    return cashPortion(ev)
  }
  if (ev.type === 'EXPENSE') {
    return ev.payment_method === 'CASH' ? -(ev.amount || 0) : 0
  }
  if (ev.type === 'CASH_MOVEMENT') {
    const t = ev.movement_type
    const a = ev.amount || 0
    if (['CASH_TRANSFER_IN','FLOAT_ADDED','CASH_RECEIVED'].includes(t)) return a
    if (['BANK_DEPOSIT','OWNER_WITHDRAWAL','CASH_TRANSFER_OUT','CASH_HANDED_OVER'].includes(t)) return -a
  }
  return 0
}

export function eventSign(ev) { return ev.is_reversal ? -1 : 1 }

// The one and only aggregator.
export function aggregate(events, openingCashPaise = 0) {
  const R = {
    opening_cash: openingCashPaise,
    booking_sales: 0, membership_sales: 0, gift_card_sales: 0, total_revenue: 0,
    cash_sales: 0, upi_sales: 0, card_sales: 0,
    total_expenses: 0, cash_expenses: 0, upi_expenses: 0, card_expenses: 0,
    cash_deposited: 0, cash_withdrawn: 0, cash_transfer_in: 0, cash_transfer_out: 0,
    float_added: 0, other_cash_in: 0, other_cash_out: 0,
    guests: 0, bookings: 0, redemptions: 0, memberships_sold: 0, gift_cards_sold: 0,
    expenses_count: 0, cash_movements_count: 0, reversal_count: 0,
    closing_cash_expected: 0, net_profit: 0,
  }
  const customers = new Set()

  for (const ev of events) {
    const s = eventSign(ev)
    if (ev.is_reversal) R.reversal_count += 1

    if (ev.type === 'BOOKING') {
      R.bookings += s
      if (ev.customer && !ev.is_reversal) customers.add(ev.customer)
      if (ev.payment_method === 'MEMBERSHIP' || ev.payment_method === 'GIFT_CARD') {
        R.redemptions += s
      } else {
        R.booking_sales += s * (ev.amount || 0)
        const p = paymentSplit(ev)
        R.cash_sales += s * p.cash
        R.upi_sales  += s * p.upi
        R.card_sales += s * p.card
      }
    } else if (ev.type === 'MEMBERSHIP_SALE') {
      R.membership_sales += s * (ev.amount || 0)
      R.memberships_sold += s
      const p = paymentSplit(ev)
      R.cash_sales += s * p.cash
      R.upi_sales  += s * p.upi
      R.card_sales += s * p.card
      if (ev.customer && !ev.is_reversal) customers.add(ev.customer)
    } else if (ev.type === 'GIFT_CARD_SALE') {
      R.gift_card_sales += s * (ev.amount || 0)
      R.gift_cards_sold += s
      const p = paymentSplit(ev)
      R.cash_sales += s * p.cash
      R.upi_sales  += s * p.upi
      R.card_sales += s * p.card
      if (ev.customer && !ev.is_reversal) customers.add(ev.customer)
    } else if (ev.type === 'EXPENSE') {
      R.total_expenses += s * (ev.amount || 0)
      R.expenses_count += s
      if (ev.payment_method === 'CASH') R.cash_expenses += s * (ev.amount || 0)
      else if (ev.payment_method === 'UPI') R.upi_expenses += s * (ev.amount || 0)
      else if (ev.payment_method === 'CARD') R.card_expenses += s * (ev.amount || 0)
    } else if (ev.type === 'CASH_MOVEMENT') {
      R.cash_movements_count += s
      const t = ev.movement_type
      const a = s * (ev.amount || 0)
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
  R.closing_cash_expected =
    R.opening_cash + R.cash_sales + R.cash_transfer_in + R.float_added + R.other_cash_in
    - R.cash_expenses - R.cash_deposited - R.cash_withdrawn - R.cash_transfer_out - R.other_cash_out
  R.net_profit = R.total_revenue - R.total_expenses
  return R
}

// Filter events for a given metric + compute each event's signed contribution.
// Used by /drill-down endpoint.
export function drillDown(events, metric) {
  const m = METRICS[metric]
  if (!m) return { events: [], total: 0, unknown: true }
  let total = 0
  const uniq = new Set()
  const items = []
  for (const ev of events) {
    if (!m.filter(ev)) continue
    const sign = eventSign(ev)
    const raw = m.contribute(ev) || 0
    let contribution = raw * sign
    // unique-count metrics (guests): only include originals; skip reversals; dedupe by field
    if (m.unique) {
      const key = ev[m.unique]
      if (ev.is_reversal) continue
      if (!key || uniq.has(key)) continue
      uniq.add(key)
      contribution = 1
    }
    total += contribution
    items.push({ event: ev, contribution })
  }
  return { events: items, total, isCount: !!m.isCount, unique: m.unique || null, label: m.label }
}

// Format helpers
export function toPaise(rupees) {
  const n = Number(rupees)
  if (!isFinite(n)) return 0
  return Math.round(n * 100)
}
export function toRupees(paise) { return (Number(paise || 0) / 100) }
export function formatINR(paise) {
  const r = toRupees(paise)
  return '₹' + r.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
export function businessDate(d = new Date()) {
  const opts = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }
  const parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(d)
  const y = parts.find(p => p.type === 'year').value
  const m = parts.find(p => p.type === 'month').value
  const day = parts.find(p => p.type === 'day').value
  return `${y}-${m}-${day}`
}

// Cash-impact helper is exported so route.js reuses for /events/:id.
export { cashImpact, paymentSplit }
