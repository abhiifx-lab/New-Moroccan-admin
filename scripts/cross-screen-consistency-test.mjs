#!/usr/bin/env node
// scripts/cross-screen-consistency-test.mjs
// Asserts: Dashboard === Reports === Master Register === Cash Book === Business Day
// for Holiday Inn on today's business date.

import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import { businessDate } from '../lib/financial-engine.js'

// Load .env.local manually
import { readFileSync } from 'fs'
const envText = readFileSync('.env.local', 'utf8')
const env = {}
for (const line of envText.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim()
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const BASE_URL = 'http://localhost:3000'

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const failures = []
const pass = (msg) => console.log(`  ✅ PASS: ${msg}`)
const fail = (msg) => { console.log(`  ❌ FAIL: ${msg}`); failures.push(msg) }
const fmt = (p) => '₹' + ((p||0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })

async function apiGet(path) {
  const r = await fetch(`${BASE_URL}/api${path}`)
  return r.json()
}

const HOLIDAY_INN_UUID = 'd15176b8-418e-4c76-a9eb-a2d2947ba5d9'
const TEST_DATE = businessDate()

console.log('\n╔══════════════════════════════════════════════════════╗')
console.log('║   CROSS-SCREEN FINANCIAL CONSISTENCY TEST           ║')
console.log('╚══════════════════════════════════════════════════════╝')
console.log(`  Centre: Holiday Inn (${HOLIDAY_INN_UUID})`)
console.log(`  Date:   ${TEST_DATE}\n`)

// Verify centre exists
const { data: centre } = await db.from('centres').select('*').eq('id', HOLIDAY_INN_UUID).single()
if (!centre) { console.error('❌ Holiday Inn not found'); process.exit(1) }
pass(`Holiday Inn resolved: "${centre.name}"`)

// Clean slate for today
await db.from('events').delete().eq('centre_id', HOLIDAY_INN_UUID).eq('business_date', TEST_DATE)
await db.from('business_days').delete().eq('centre_id', HOLIDAY_INN_UUID).eq('business_date', TEST_DATE)

// Seed business_day with ₹15,000 opening
await db.from('business_days').insert({
  id: uuidv4(), centre_id: HOLIDAY_INN_UUID,
  business_date: TEST_DATE, date: TEST_DATE,
  status: 'OPEN', opening_cash: 1500000,
  opened_at: new Date().toISOString(),
})
pass('Seeded business day: opening ₹15,000')

// Seed events: cash booking ₹6,000 + UPI1 booking ₹3,000 + cash expense ₹2,500
await db.from('events').insert([
  { id: uuidv4(), event_type:'BOOKING', type:'BOOKING', centre_id:HOLIDAY_INN_UUID, business_date:TEST_DATE, created_at:new Date().toISOString(), created_by:'consistency-test', customer:'Alice', therapist:'T1', service_name:'Swedish Massage', amount:600000, payment_method:'CASH', is_reversal:false },
  { id: uuidv4(), event_type:'BOOKING', type:'BOOKING', centre_id:HOLIDAY_INN_UUID, business_date:TEST_DATE, created_at:new Date().toISOString(), created_by:'consistency-test', customer:'Bob', therapist:'T2', service_name:'Deep Tissue', amount:300000, payment_method:'UPI_1', is_reversal:false },
  { id: uuidv4(), event_type:'EXPENSE', type:'EXPENSE', centre_id:HOLIDAY_INN_UUID, business_date:TEST_DATE, created_at:new Date().toISOString(), created_by:'consistency-test', category:'Supplies', vendor:'Test Vendor', amount:250000, payment_method:'CASH', is_reversal:false },
])
pass('Seeded 3 events: Cash Booking ₹6,000 + UPI1 Booking ₹3,000 + Cash Expense ₹2,500')

const EXP = {
  opening_cash:1500000, net_revenue:900000, total_expenses:250000,
  cash_sales:600000, upi_1_sales:300000, closing_cash_expected:1850000, net_profit:650000
}

const chk = (screen, field, got, exp) => {
  if ((got??0) === exp) pass(`${screen}.${field} = ${fmt(exp)}`)
  else fail(`${screen}.${field}: expected ${fmt(exp)}, got ${fmt(got??0)}`)
}

// --- Dashboard ---
console.log('\n--- [DASHBOARD] ---')
const dash = await apiGet(`/dashboard?centre_id=${HOLIDAY_INN_UUID}&date=${TEST_DATE}`)
const da = dash?.agg || dash?.single_centre?.agg || dash?.consolidated || {}
chk('Dashboard','net_revenue',da.net_revenue,EXP.net_revenue)
chk('Dashboard','total_expenses',da.total_expenses,EXP.total_expenses)
chk('Dashboard','opening_cash',da.opening_cash,EXP.opening_cash)
chk('Dashboard','closing_cash_expected',da.closing_cash_expected,EXP.closing_cash_expected)
chk('Dashboard','cash_sales',da.cash_sales,EXP.cash_sales)
chk('Dashboard','net_profit',da.net_profit,EXP.net_profit)

// --- Reports ---
console.log('\n--- [REPORTS] ---')
const rpt = await apiGet(`/reports/pl?centre_id=${HOLIDAY_INN_UUID}&from=${TEST_DATE}&to=${TEST_DATE}&group=day`)
const rt = rpt?.totals?.consolidated || {}
chk('Reports','net_revenue',rt.net_revenue,EXP.net_revenue)
chk('Reports','total_expenses',rt.total_expenses,EXP.total_expenses)
chk('Reports','closing_cash_expected',rt.closing_cash_expected,EXP.closing_cash_expected)
chk('Reports','cash_sales',rt.cash_sales,EXP.cash_sales)
chk('Reports','net_profit',rt.net_profit,EXP.net_profit)

// --- Master Register ---
console.log('\n--- [MASTER REGISTER] ---')
const reg = await apiGet(`/master-register?centre_id=${HOLIDAY_INN_UUID}&from=${TEST_DATE}&to=${TEST_DATE}`)
const regRows = reg?.rows || []
if (regRows.length === 0) { fail('Master Register: 0 rows returned') } else {
  pass(`Master Register: ${regRows.length} row(s) returned`)
  const rr = regRows[0]
  chk('MasterRegister','net_revenue',rr.net_revenue,EXP.net_revenue)
  chk('MasterRegister','total_expenses',rr.total_expenses,EXP.total_expenses)
  chk('MasterRegister','opening_cash',rr.opening_cash,EXP.opening_cash)
  chk('MasterRegister','closing_cash_expected',rr.closing_cash_expected,EXP.closing_cash_expected)
  chk('MasterRegister','cash_sales',rr.cash_sales,EXP.cash_sales)
}

// --- Cash Book ---
console.log('\n--- [CASH BOOK] ---')
const cb = await apiGet(`/cash-book?centre_id=${HOLIDAY_INN_UUID}&date=${TEST_DATE}`)
const cba = cb?.agg || {}
chk('CashBook','opening_cash',cba.opening_cash,EXP.opening_cash)
chk('CashBook','closing_cash_expected',cba.closing_cash_expected,EXP.closing_cash_expected)
chk('CashBook','cash_sales',cba.cash_sales,EXP.cash_sales)
chk('CashBook','total_expenses',cba.total_expenses,EXP.total_expenses)
const nonOpening = (cb?.lines||[]).filter(l=>l.ref!=='OPENING')
if (nonOpening.length >= 2) pass(`CashBook: ${nonOpening.length} ledger rows`)
else fail(`CashBook: expected ≥2 ledger rows, got ${nonOpening.length}`)

// --- Business Day ---
console.log('\n--- [BUSINESS DAY] ---')
const bd = await apiGet(`/business-day?centre_id=${HOLIDAY_INN_UUID}&date=${TEST_DATE}`)
chk('BusinessDay','opening_cash',bd?.opening_cash,EXP.opening_cash)

// --- Cross-Screen Assert ---
console.log('\n--- [CROSS-SCREEN TRUTH ASSERTION] ---')
const dc=da.closing_cash_expected??0, rc=rt.closing_cash_expected??0, mc=regRows[0]?.closing_cash_expected??0, cc=cba.closing_cash_expected??0
if (dc===rc && rc===cc && (regRows.length===0||mc===dc)) pass(`Expected Closing consistent: ${fmt(dc)}`)
else fail(`Expected Closing INCONSISTENT: Dash=${fmt(dc)} Rpt=${fmt(rc)} Reg=${fmt(mc)} CB=${fmt(cc)}`)

const dr=da.net_revenue??0, rr2=rt.net_revenue??0, mr=regRows[0]?.net_revenue??0
if (dr===rr2 && (regRows.length===0||mr===dr)) pass(`Net Revenue consistent: ${fmt(dr)}`)
else fail(`Net Revenue INCONSISTENT: Dash=${fmt(dr)} Rpt=${fmt(rr2)} Reg=${fmt(mr)}`)

// --- Summary ---
console.log('\n════════════════════════════════════════════════════════')
console.log(`Failures: ${failures.length}`)
if (failures.length === 0) {
  console.log('✅ ALL SCREENS REPORT THE SAME FINANCIAL TRUTH')
  console.log(`   Net Revenue:      ${fmt(EXP.net_revenue)}`)
  console.log(`   Net Expenses:     ${fmt(EXP.total_expenses)}`)
  console.log(`   Expected Closing: ${fmt(EXP.closing_cash_expected)}`)
  console.log(`   Net Profit:       ${fmt(EXP.net_profit)}`)
} else {
  console.log('❌ INCONSISTENCIES DETECTED:')
  failures.forEach(f => console.log(`   • ${f}`))
  process.exit(1)
}
