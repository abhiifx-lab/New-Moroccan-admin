// FINANCIAL ENGINE — the ONLY place financial numbers are calculated.
// Money in PAISE (integer). India timezone (Asia/Kolkata) for all dates.
// Immutability: events are NEVER edited or deleted.
// Reversals are new events with is_reversal=true and reverses=<originalId>.
// aggregate() applies sign=-1 to any is_reversal event.

export const EVENT_TYPES = {
  BOOKING: 'BOOKING',
  MEMBERSHIP_SALE: 'MEMBERSHIP_SALE',
  GIFT_CARD_SALE: 'GIFT_CARD_SALE',
  EXPENSE: 'EXPENSE',
  CASH_MOVEMENT: 'CASH_MOVEMENT',
}

export const PAY_METHODS = ['CASH', 'UPI_1', 'UPI_2', 'CARD', 'MIXED', 'MEMBERSHIP', 'GIFT_CARD']
export const EXPENSE_PAY_METHODS = ['CASH', 'UPI_1', 'UPI_2', 'CARD']
export const APPROVED_CENTRES = ['Phoenix Pallassio', 'Holiday Inn', 'Lulu Mall']

export const CASH_MOVEMENT_TYPES = [
  'BANK_DEPOSIT', 'OWNER_WITHDRAWAL',
  'CASH_TRANSFER_OUT', 'CASH_TRANSFER_IN',
  'FLOAT_ADDED', 'CASH_RECEIVED', 'CASH_HANDED_OVER',
]

// Metric registry — the ONE map used by drill-down + report engine.
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
      && (e.payment_method === 'CASH' || e.payment_method === 'MIXED') && cashPortion(e) > 0,
    contribute: e => cashPortion(e),
  },
  upi_1_sales: {
    label: 'UPI 1 Sales',
    filter: e => ['BOOKING','MEMBERSHIP_SALE','GIFT_CARD_SALE'].includes(e.type)
      && (e.payment_method === 'UPI_1' || e.payment_method === 'MIXED') && upi1Portion(e) > 0,
    contribute: e => upi1Portion(e),
  },
  upi_2_sales: {
    label: 'UPI 2 Sales',
    filter: e => ['BOOKING','MEMBERSHIP_SALE','GIFT_CARD_SALE'].includes(e.type)
      && (e.payment_method === 'UPI_2' || e.payment_method === 'MIXED') && upi2Portion(e) > 0,
    contribute: e => upi2Portion(e),
  },
  card_sales: {
    label: 'Card Sales',
    filter: e => ['BOOKING','MEMBERSHIP_SALE','GIFT_CARD_SALE'].includes(e.type)
      && (e.payment_method === 'CARD' || e.payment_method === 'MIXED') && cardPortion(e) > 0,
    contribute: e => cardPortion(e),
  },
  membership_redemption_value: {
    label: 'Membership Redemption (operational)',
    filter: e => e.type === 'BOOKING' && e.payment_method === 'MEMBERSHIP',
    contribute: e => e.amount || 0,
  },
  gift_card_redemption_value: {
    label: 'Gift Card Redemption (operational)',
    filter: e => e.type === 'BOOKING' && e.payment_method === 'GIFT_CARD',
    contribute: e => e.amount || 0,
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
  upi_1_expenses: {
    label: 'UPI 1 Expenses',
    filter: e => e.type === 'EXPENSE' && e.payment_method === 'UPI_1',
    contribute: e => e.amount || 0,
  },
  upi_2_expenses: {
    label: 'UPI 2 Expenses',
    filter: e => e.type === 'EXPENSE' && e.payment_method === 'UPI_2',
    contribute: e => e.amount || 0,
  },
  card_expenses: {
    label: 'Card Expenses',
    filter: e => e.type === 'EXPENSE' && e.payment_method === 'CARD',
    contribute: e => e.amount || 0,
  },
  wages_expenses: {
    label: 'Wages',
    filter: e => e.type === 'EXPENSE' && e.category === 'Wages',
    contribute: e => e.amount || 0,
  },
  cash_deposited:    { label: 'Bank Deposits',   filter: e => e.type === 'CASH_MOVEMENT' && e.movement_type === 'BANK_DEPOSIT',      contribute: e => e.amount || 0 },
  cash_withdrawn:    { label: 'Owner Withdrawals', filter: e => e.type === 'CASH_MOVEMENT' && e.movement_type === 'OWNER_WITHDRAWAL', contribute: e => e.amount || 0 },
  cash_transfer_in:  { label: 'Cash Transfer In', filter: e => e.type === 'CASH_MOVEMENT' && e.movement_type === 'CASH_TRANSFER_IN',  contribute: e => e.amount || 0 },
  cash_transfer_out: { label: 'Cash Transfer Out', filter: e => e.type === 'CASH_MOVEMENT' && e.movement_type === 'CASH_TRANSFER_OUT', contribute: e => e.amount || 0 },
  float_added:       { label: 'Float Added',      filter: e => e.type === 'CASH_MOVEMENT' && e.movement_type === 'FLOAT_ADDED',        contribute: e => e.amount || 0 },
  bookings:          { label: 'Bookings',      filter: e => e.type === 'BOOKING', contribute: () => 1, isCount: true },
  redemptions:       { label: 'Redemptions',   filter: e => e.type === 'BOOKING' && (e.payment_method === 'MEMBERSHIP' || e.payment_method === 'GIFT_CARD'), contribute: () => 1, isCount: true },
  memberships_sold:  { label: 'Memberships Sold', filter: e => e.type === 'MEMBERSHIP_SALE', contribute: () => 1, isCount: true },
  gift_cards_sold:   { label: 'Gift Cards Sold',  filter: e => e.type === 'GIFT_CARD_SALE',  contribute: () => 1, isCount: true },
  guests:            { label: 'Guests', filter: e => ['BOOKING','MEMBERSHIP_SALE','GIFT_CARD_SALE'].includes(e.type), contribute: () => 1, isCount: true, unique: 'customer' },
  net_profit:        {
    label: 'Net Profit',
    filter: e => ['BOOKING','MEMBERSHIP_SALE','GIFT_CARD_SALE','EXPENSE'].includes(e.type),
    contribute: e => {
      if (e.type === 'EXPENSE') return -(e.amount || 0)
      if (e.type === 'BOOKING' && (e.payment_method === 'MEMBERSHIP' || e.payment_method === 'GIFT_CARD')) return 0
      return e.amount || 0
    },
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
  if (pm === 'CASH')  return { cash: amt, upi_1: 0, upi_2: 0, card: 0 }
  if (pm === 'UPI_1') return { cash: 0, upi_1: amt, upi_2: 0, card: 0 }
  if (pm === 'UPI_2') return { cash: 0, upi_1: 0, upi_2: amt, card: 0 }
  if (pm === 'CARD')  return { cash: 0, upi_1: 0, upi_2: 0, card: amt }
  if (pm === 'MIXED') {
    const b = ev.payment_breakdown || {}
    return { cash: b.cash || 0, upi_1: b.upi_1 || 0, upi_2: b.upi_2 || 0, card: b.card || 0 }
  }
  return { cash: 0, upi_1: 0, upi_2: 0, card: 0 }
}
function cashPortion(e) { return paymentSplit(e).cash }
function upi1Portion(e) { return paymentSplit(e).upi_1 }
function upi2Portion(e) { return paymentSplit(e).upi_2 }
function cardPortion(e) { return paymentSplit(e).card }

function cashImpact(ev) {
  if (ev.type === 'BOOKING' || ev.type === 'MEMBERSHIP_SALE' || ev.type === 'GIFT_CARD_SALE') return cashPortion(ev)
  if (ev.type === 'EXPENSE') return ev.payment_method === 'CASH' ? -(ev.amount || 0) : 0
  if (ev.type === 'CASH_MOVEMENT') {
    const t = ev.movement_type
    const a = ev.amount || 0
    if (['CASH_TRANSFER_IN','FLOAT_ADDED','CASH_RECEIVED'].includes(t)) return a
    if (['BANK_DEPOSIT','OWNER_WITHDRAWAL','CASH_TRANSFER_OUT','CASH_HANDED_OVER'].includes(t)) return -a
  }
  return 0
}

export function eventSign(ev) { return ev.is_reversal ? -1 : 1 }

export function aggregate(events, openingCashPaise = 0) {
  const R = {
    opening_cash: openingCashPaise,
    // revenue
    booking_sales: 0, membership_sales: 0, gift_card_sales: 0, total_revenue: 0,
    revenue_reversals: 0, gross_revenue: 0, net_revenue: 0,
    // payment breakdown of net revenue
    cash_sales: 0, upi_1_sales: 0, upi_2_sales: 0, card_sales: 0,
    // operational redemption (not revenue)
    membership_redemption_value: 0, gift_card_redemption_value: 0,
    // expenses
    total_expenses: 0, cash_expenses: 0, upi_1_expenses: 0, upi_2_expenses: 0, card_expenses: 0,
    wages_expenses: 0, expense_reversals: 0, gross_expenses: 0, net_expenses: 0,
    // cash movements
    cash_deposited: 0, cash_withdrawn: 0, cash_transfer_in: 0, cash_transfer_out: 0,
    float_added: 0, other_cash_in: 0, other_cash_out: 0,
    // counts
    guests: 0, bookings: 0, redemptions: 0, memberships_sold: 0, gift_cards_sold: 0,
    expenses_count: 0, cash_movements_count: 0, reversal_count: 0,
    // derived
    closing_cash_expected: 0, net_profit: 0,
  }
  const customers = new Set()

  for (const ev of events) {
    const s = eventSign(ev)
    if (ev.is_reversal) R.reversal_count += 1
    const p = paymentSplit(ev)

    if (ev.type === 'BOOKING') {
      R.bookings += s
      if (ev.customer && !ev.is_reversal) customers.add(ev.customer)
      if (ev.payment_method === 'MEMBERSHIP') {
        R.redemptions += s
        R.membership_redemption_value += s * (ev.amount || 0)
      } else if (ev.payment_method === 'GIFT_CARD') {
        R.redemptions += s
        R.gift_card_redemption_value += s * (ev.amount || 0)
      } else {
        R.booking_sales += s * (ev.amount || 0)
        if (ev.is_reversal) R.revenue_reversals += (ev.amount || 0)
        R.cash_sales += s * p.cash
        R.upi_1_sales += s * p.upi_1
        R.upi_2_sales += s * p.upi_2
        R.card_sales += s * p.card
      }
    } else if (ev.type === 'MEMBERSHIP_SALE') {
      R.membership_sales += s * (ev.amount || 0)
      R.memberships_sold += s
      if (ev.is_reversal) R.revenue_reversals += (ev.amount || 0)
      R.cash_sales += s * p.cash
      R.upi_1_sales += s * p.upi_1
      R.upi_2_sales += s * p.upi_2
      R.card_sales += s * p.card
      if (ev.customer && !ev.is_reversal) customers.add(ev.customer)
    } else if (ev.type === 'GIFT_CARD_SALE') {
      R.gift_card_sales += s * (ev.amount || 0)
      R.gift_cards_sold += s
      if (ev.is_reversal) R.revenue_reversals += (ev.amount || 0)
      R.cash_sales += s * p.cash
      R.upi_1_sales += s * p.upi_1
      R.upi_2_sales += s * p.upi_2
      R.card_sales += s * p.card
      if (ev.customer && !ev.is_reversal) customers.add(ev.customer)
    } else if (ev.type === 'EXPENSE') {
      R.total_expenses += s * (ev.amount || 0)
      R.expenses_count += s
      if (ev.is_reversal) R.expense_reversals += (ev.amount || 0)
      if (ev.payment_method === 'CASH') R.cash_expenses += s * (ev.amount || 0)
      else if (ev.payment_method === 'UPI_1') R.upi_1_expenses += s * (ev.amount || 0)
      else if (ev.payment_method === 'UPI_2') R.upi_2_expenses += s * (ev.amount || 0)
      else if (ev.payment_method === 'CARD') R.card_expenses += s * (ev.amount || 0)
      if (ev.category === 'Wages') R.wages_expenses += s * (ev.amount || 0)
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
  // Gross revenue: reverse contributions were negative — add them back to see gross
  R.gross_revenue = R.total_revenue + R.revenue_reversals
  R.net_revenue = R.total_revenue // already net of reversals
  R.gross_expenses = R.total_expenses + R.expense_reversals
  R.net_expenses = R.total_expenses
  R.guests = customers.size

  R.closing_cash_expected =
    R.opening_cash + R.cash_sales + R.cash_transfer_in + R.float_added + R.other_cash_in
    - R.cash_expenses - R.cash_deposited - R.cash_withdrawn - R.cash_transfer_out - R.other_cash_out

  R.net_profit = R.net_revenue - R.net_expenses
  return R
}

// Drill-down: filter + compute signed contribution per event for a given metric.
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
  const sign = r < 0 ? '-' : ''
  return sign + '₹' + Math.abs(r).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
export function businessDate(d = new Date()) {
  const opts = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }
  const parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(d)
  const y = parts.find(p => p.type === 'year').value
  const m = parts.find(p => p.type === 'month').value
  const day = parts.find(p => p.type === 'day').value
  return `${y}-${m}-${day}`
}

// Period bucketing (India-timezone-safe on YYYY-MM-DD strings).
export function periodLabel(dateStr, group) {
  const [y, m, d] = dateStr.split('-')
  if (group === 'day') return dateStr
  if (group === 'month') return `${y}-${m}`
  if (group === 'year') return y
  if (group === 'week') {
    // ISO-style week using Date object interpreted at IST midnight
    const dt = new Date(`${dateStr}T00:00:00+05:30`)
    const target = new Date(dt.valueOf())
    const dayNr = (dt.getUTCDay() + 6) % 7
    target.setUTCDate(target.getUTCDate() - dayNr + 3)
    const firstThursday = target.valueOf()
    target.setUTCMonth(0, 1)
    if (target.getUTCDay() !== 4) target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7)
    const week = 1 + Math.ceil((firstThursday - target) / 604800000)
    const isoYear = new Date(firstThursday).getUTCFullYear()
    return `${isoYear}-W${String(week).padStart(2,'0')}`
  }
  return dateStr
}

export { cashImpact, paymentSplit }
