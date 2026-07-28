'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast, Toaster } from 'sonner'
import {
  LayoutDashboard, CalendarCheck2, CreditCard, Gift, Receipt, ArrowLeftRight,
  BookOpen, Wallet, Lock, ShieldCheck, Building2, Sparkles, RefreshCw, Plus, ChevronRight
} from 'lucide-react'

// ---------- utils ----------
const toPaise = (r) => Math.round((Number(r) || 0) * 100)
const formatINR = (paise) => '₹' + (Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const todayStr = () => {
  const d = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  return `${parts.find(p=>p.type==='year').value}-${parts.find(p=>p.type==='month').value}-${parts.find(p=>p.type==='day').value}`
}
const apiGet = async (path) => { const r = await fetch('/api'+path); return r.json() }
const apiPost = async (path, body) => { const r = await fetch('/api'+path, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }); return r.json() }

const ROLES = [
  { id: 'RECEPTION', label: 'Reception' },
  { id: 'MANAGER', label: 'Centre Manager' },
  { id: 'OPS', label: 'Operations' },
  { id: 'OWNER', label: 'Owner' },
  { id: 'SUPER', label: 'Super Admin' },
]

const NAV = [
  { id: 'dashboard',   label: 'Dashboard',       icon: LayoutDashboard },
  { id: 'booking',     label: 'Bookings',        icon: CalendarCheck2 },
  { id: 'membership',  label: 'Memberships',     icon: CreditCard },
  { id: 'giftcard',    label: 'Gift Cards',      icon: Gift },
  { id: 'expense',     label: 'Expenses',        icon: Receipt },
  { id: 'cash',        label: 'Cash Movement',   icon: ArrowLeftRight },
  { id: 'register',    label: 'Master Register', icon: BookOpen },
  { id: 'cashbook',    label: 'Cash Book',       icon: Wallet },
  { id: 'close',       label: 'Business Day',    icon: Lock },
  { id: 'audit',       label: 'Audit Log',       icon: ShieldCheck },
]

// ---------- Stat card ----------
function Stat({ label, value, hint, accent }) {
  return (
    <Card className="border-border/50 bg-card/60 backdrop-blur">
      <CardContent className="p-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-semibold ${accent||''}`}>{value}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  )
}

// ---------- DASHBOARD ----------
function DashboardView({ centre, refreshTick }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(todayStr())
  const load = useCallback(async () => {
    setLoading(true)
    const d = await apiGet(`/dashboard?centre_id=${centre?.id || 'ALL'}&date=${date}`)
    setData(d); setLoading(false)
  }, [centre?.id, date])
  useEffect(() => { load() }, [load, refreshTick])

  const a = data?.agg || {}
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Live Dashboard</h2>
          <p className="text-sm text-muted-foreground">Single source of truth — every number below is aggregated from the immutable event ledger.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-[160px]" />
          <Button variant="outline" size="icon" onClick={load}><RefreshCw className="h-4 w-4"/></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Today's Revenue" value={formatINR(a.total_revenue)} hint={`${a.bookings||0} bookings • ${a.redemptions||0} redemptions`} accent="text-emerald-500"/>
        <Stat label="Guests" value={a.guests||0} hint="Unique customers today"/>
        <Stat label="Expenses" value={formatINR(a.total_expenses)} hint={`${a.expenses_count||0} entries`} accent="text-rose-500"/>
        <Stat label="Cash in Drawer" value={formatINR(a.closing_cash_expected)} hint={`Opening ${formatINR(a.opening_cash)}`}/>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Sales Mix</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="Booking Sales" v={formatINR(a.booking_sales)} />
            <Row k="Membership Sales" v={formatINR(a.membership_sales)} />
            <Row k="Gift Card Sales" v={formatINR(a.gift_card_sales)} />
            <div className="border-t border-border/50 my-2"></div>
            <Row k="Total Revenue" v={formatINR(a.total_revenue)} bold />
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Payment Method</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="Cash Sales" v={formatINR(a.cash_sales)} />
            <Row k="UPI Sales" v={formatINR(a.upi_sales)} />
            <Row k="Card Sales" v={formatINR(a.card_sales)} />
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Cash Movement</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="Deposited to Bank" v={formatINR(a.cash_deposited)} />
            <Row k="Owner Withdrawal" v={formatINR(a.cash_withdrawn)} />
            <Row k="Transfer In" v={formatINR(a.cash_transfer_in)} />
            <Row k="Transfer Out" v={formatINR(a.cash_transfer_out)} />
            <Row k="Float Added" v={formatINR(a.float_added)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm text-muted-foreground">P&L Snapshot</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <Stat label="Revenue" value={formatINR(a.total_revenue)} accent="text-emerald-500"/>
          <Stat label="Expenses" value={formatINR(a.total_expenses)} accent="text-rose-500"/>
          <Stat label="Net Profit" value={formatINR(a.net_profit)} accent={(a.net_profit||0)>=0?'text-emerald-500':'text-rose-500'}/>
        </CardContent>
      </Card>
      {loading && <div className="text-xs text-muted-foreground">Loading...</div>}
    </div>
  )
}
function Row({ k, v, bold }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className={bold?'font-semibold':''}>{v}</span></div>
}

// ---------- BOOKING ----------
function BookingView({ centre, role, bump }) {
  const [services, setServices] = useState([])
  const [events, setEvents] = useState([])
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ customer:'', therapist:'', service_id:'', amount:'', payment_method:'CASH', mix_cash:'', mix_upi:'', mix_card:'', redemption_ref:'' })
  const load = async () => {
    const [s, e] = await Promise.all([apiGet('/services'), apiGet(`/events?centre_id=${centre.id}&date=${todayStr()}&type=BOOKING`)])
    setServices(s); setEvents(e)
  }
  useEffect(() => { if (centre?.id) load() }, [centre?.id])

  const submit = async () => {
    const svc = services.find(x => x.id === f.service_id)
    const amount = toPaise(f.amount || svc?.price_paise/100 || 0)
    const body = {
      centre_id: centre.id, created_by: role,
      customer: f.customer, therapist: f.therapist,
      service_id: f.service_id, service_name: svc?.name || '',
      amount, payment_method: f.payment_method,
      redemption_ref: f.redemption_ref || null,
    }
    if (f.payment_method === 'MIXED') body.payment_breakdown = { cash: toPaise(f.mix_cash), upi: toPaise(f.mix_upi), card: toPaise(f.mix_card) }
    const r = await apiPost('/events/booking', body)
    if (r.error) { toast.error(r.error); return }
    toast.success('Booking recorded')
    setOpen(false); setF({ customer:'', therapist:'', service_id:'', amount:'', payment_method:'CASH', mix_cash:'', mix_upi:'', mix_card:'', redemption_ref:'' })
    bump(); load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Bookings</h2>
          <p className="text-sm text-muted-foreground">Every booking creates one immutable event.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2"/>New Booking</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>New Booking — {centre.name}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <Field l="Customer"><Input value={f.customer} onChange={e=>setF({...f, customer:e.target.value})}/></Field>
              <Field l="Therapist"><Input value={f.therapist} onChange={e=>setF({...f, therapist:e.target.value})}/></Field>
              <Field l="Service">
                <Select value={f.service_id} onValueChange={v=>{ const s = services.find(x=>x.id===v); setF({...f, service_id:v, amount: s? (s.price_paise/100).toString() : f.amount})}}>
                  <SelectTrigger><SelectValue placeholder="Choose"/></SelectTrigger>
                  <SelectContent>{services.map(s=><SelectItem key={s.id} value={s.id}>{s.name} — {formatINR(s.price_paise)}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field l="Amount (₹)"><Input type="number" value={f.amount} onChange={e=>setF({...f, amount:e.target.value})}/></Field>
              <Field l="Payment">
                <Select value={f.payment_method} onValueChange={v=>setF({...f, payment_method:v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    {['CASH','UPI','CARD','MIXED','MEMBERSHIP','GIFT_CARD'].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              {(f.payment_method==='MEMBERSHIP'||f.payment_method==='GIFT_CARD') && (
                <Field l={f.payment_method==='MEMBERSHIP'?'Membership Code':'Gift Card Code'}>
                  <Input value={f.redemption_ref} onChange={e=>setF({...f, redemption_ref:e.target.value})}/>
                </Field>
              )}
            </div>
            {f.payment_method==='MIXED' && (
              <div className="grid grid-cols-3 gap-3 mt-2">
                <Field l="Cash (₹)"><Input type="number" value={f.mix_cash} onChange={e=>setF({...f, mix_cash:e.target.value})}/></Field>
                <Field l="UPI (₹)"><Input type="number" value={f.mix_upi} onChange={e=>setF({...f, mix_upi:e.target.value})}/></Field>
                <Field l="Card (₹)"><Input type="number" value={f.mix_card} onChange={e=>setF({...f, mix_card:e.target.value})}/></Field>
              </div>
            )}
            <DialogFooter><Button onClick={submit}>Record Booking</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Customer</TableHead><TableHead>Service</TableHead><TableHead>Therapist</TableHead><TableHead>Pay</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
          <TableBody>
            {events.length===0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No bookings today</TableCell></TableRow>}
            {events.map(e=>(
              <TableRow key={e.id}>
                <TableCell className="text-xs">{new Date(e.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</TableCell>
                <TableCell>{e.customer}</TableCell>
                <TableCell>{e.service_name}</TableCell>
                <TableCell>{e.therapist}</TableCell>
                <TableCell><Badge variant="secondary">{e.payment_method}</Badge></TableCell>
                <TableCell className="text-right font-medium">{(e.payment_method==='MEMBERSHIP'||e.payment_method==='GIFT_CARD')?<span className="text-muted-foreground">redeemed</span>:formatINR(e.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  )
}
function Field({ l, children }) {
  return <div className="space-y-1"><Label className="text-xs text-muted-foreground">{l}</Label>{children}</div>
}

// ---------- MEMBERSHIP ----------
function MembershipView({ centre, role, bump }) {
  const [list, setList] = useState([])
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ customer:'', phone:'', amount:'', payment_method:'CASH' })
  const load = async () => setList(await apiGet('/memberships'))
  useEffect(()=>{load()},[])
  const submit = async () => {
    const r = await apiPost('/events/membership', { ...f, centre_id: centre.id, created_by: role, amount: toPaise(f.amount) })
    if (r.error) return toast.error(r.error)
    toast.success(`Membership ${r.membership.code} sold`); setOpen(false); setF({ customer:'', phone:'', amount:'', payment_method:'CASH' }); bump(); load()
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold">Memberships</h2>
          <p className="text-sm text-muted-foreground">Sale creates revenue + liability. Redemption creates operational usage only.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2"/>Sell Membership</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>Sell Membership — {centre.name}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <Field l="Customer"><Input value={f.customer} onChange={e=>setF({...f, customer:e.target.value})}/></Field>
              <Field l="Phone"><Input value={f.phone} onChange={e=>setF({...f, phone:e.target.value})}/></Field>
              <Field l="Amount (₹)"><Input type="number" value={f.amount} onChange={e=>setF({...f, amount:e.target.value})}/></Field>
              <Field l="Payment"><Select value={f.payment_method} onValueChange={v=>setF({...f, payment_method:v})}><SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>{['CASH','UPI','CARD'].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></Field>
            </div>
            <DialogFooter><Button onClick={submit}>Sell</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Customer</TableHead><TableHead>Sold At</TableHead><TableHead className="text-right">Initial</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Redemptions</TableHead></TableRow></TableHeader>
          <TableBody>
            {list.length===0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No memberships</TableCell></TableRow>}
            {list.map(m=>(<TableRow key={m.code}>
              <TableCell className="font-mono text-xs">{m.code}</TableCell>
              <TableCell>{m.customer}</TableCell>
              <TableCell className="text-xs">{m.sold_business_date}</TableCell>
              <TableCell className="text-right">{formatINR(m.initial_paise)}</TableCell>
              <TableCell className="text-right font-medium">{formatINR(m.remaining_paise)}</TableCell>
              <TableCell>{m.redemption_count}</TableCell>
            </TableRow>))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  )
}

// ---------- GIFT CARDS ----------
function GiftCardView({ centre, role, bump }) {
  const [list, setList] = useState([])
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ customer:'', recipient:'', amount:'', payment_method:'CASH' })
  const load = async () => setList(await apiGet('/gift-cards'))
  useEffect(()=>{load()},[])
  const submit = async () => {
    const r = await apiPost('/events/gift-card', { ...f, centre_id: centre.id, created_by: role, amount: toPaise(f.amount) })
    if (r.error) return toast.error(r.error)
    toast.success(`Gift card ${r.gift_card.code} sold`); setOpen(false); setF({ customer:'', recipient:'', amount:'', payment_method:'CASH' }); bump(); load()
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold">Gift Cards</h2><p className="text-sm text-muted-foreground">Selling centre keeps revenue. Redemption is operational only.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2"/>Sell Gift Card</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>Sell Gift Card — {centre.name}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <Field l="Buyer"><Input value={f.customer} onChange={e=>setF({...f, customer:e.target.value})}/></Field>
              <Field l="Recipient"><Input value={f.recipient} onChange={e=>setF({...f, recipient:e.target.value})}/></Field>
              <Field l="Amount (₹)"><Input type="number" value={f.amount} onChange={e=>setF({...f, amount:e.target.value})}/></Field>
              <Field l="Payment"><Select value={f.payment_method} onValueChange={v=>setF({...f, payment_method:v})}><SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>{['CASH','UPI','CARD'].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></Field>
            </div>
            <DialogFooter><Button onClick={submit}>Sell</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Buyer</TableHead><TableHead>Recipient</TableHead><TableHead className="text-right">Initial</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
          <TableBody>
            {list.length===0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No gift cards</TableCell></TableRow>}
            {list.map(m=>(<TableRow key={m.code}>
              <TableCell className="font-mono text-xs">{m.code}</TableCell><TableCell>{m.buyer}</TableCell><TableCell>{m.recipient}</TableCell>
              <TableCell className="text-right">{formatINR(m.initial_paise)}</TableCell>
              <TableCell className="text-right font-medium">{formatINR(m.remaining_paise)}</TableCell>
            </TableRow>))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  )
}

// ---------- EXPENSE ----------
function ExpenseView({ centre, role, bump }) {
  const [events, setEvents] = useState([])
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ amount:'', payment_method:'CASH', category:'Utilities', vendor:'', notes:'' })
  const load = async () => setEvents(await apiGet(`/events?centre_id=${centre.id}&date=${todayStr()}&type=EXPENSE`))
  useEffect(()=>{ if(centre?.id) load()},[centre?.id])
  const submit = async () => {
    const r = await apiPost('/events/expense', { ...f, centre_id: centre.id, created_by: role, amount: toPaise(f.amount) })
    if (r.error) return toast.error(r.error)
    toast.success('Expense recorded'); setOpen(false); setF({ amount:'', payment_method:'CASH', category:'Utilities', vendor:'', notes:'' }); bump(); load()
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold">Expenses</h2><p className="text-sm text-muted-foreground">Reduces cash or bank depending on payment method.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2"/>Add Expense</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>New Expense — {centre.name}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <Field l="Amount (₹)"><Input type="number" value={f.amount} onChange={e=>setF({...f, amount:e.target.value})}/></Field>
              <Field l="Category"><Select value={f.category} onValueChange={v=>setF({...f, category:v})}><SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>{['Utilities','Supplies','Salaries','Rent','Marketing','Maintenance','Consumables','Other'].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></Field>
              <Field l="Payment"><Select value={f.payment_method} onValueChange={v=>setF({...f, payment_method:v})}><SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>{['CASH','UPI','CARD'].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></Field>
              <Field l="Vendor"><Input value={f.vendor} onChange={e=>setF({...f, vendor:e.target.value})}/></Field>
            </div>
            <Field l="Notes"><Textarea value={f.notes} onChange={e=>setF({...f, notes:e.target.value})}/></Field>
            <DialogFooter><Button onClick={submit}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="p-0">
        <Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Category</TableHead><TableHead>Vendor</TableHead><TableHead>Pay</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
          <TableBody>
            {events.length===0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No expenses today</TableCell></TableRow>}
            {events.map(e=>(<TableRow key={e.id}>
              <TableCell className="text-xs">{new Date(e.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</TableCell>
              <TableCell>{e.category}</TableCell><TableCell>{e.vendor}</TableCell>
              <TableCell><Badge variant="secondary">{e.payment_method}</Badge></TableCell>
              <TableCell className="text-right font-medium text-rose-500">{formatINR(e.amount)}</TableCell>
            </TableRow>))}
          </TableBody></Table>
      </CardContent></Card>
    </div>
  )
}

// ---------- CASH MOVEMENT ----------
function CashMovementView({ centre, centres, role, bump }) {
  const [events, setEvents] = useState([])
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ amount:'', movement_type:'BANK_DEPOSIT', counterparty_centre_id:'', notes:'' })
  const load = async () => setEvents(await apiGet(`/events?centre_id=${centre.id}&date=${todayStr()}&type=CASH_MOVEMENT`))
  useEffect(()=>{ if(centre?.id) load()},[centre?.id])
  const submit = async () => {
    const r = await apiPost('/events/cash-movement', { ...f, centre_id: centre.id, created_by: role, amount: toPaise(f.amount) })
    if (r.error) return toast.error(r.error)
    toast.success('Cash movement recorded'); setOpen(false); setF({ amount:'', movement_type:'BANK_DEPOSIT', counterparty_centre_id:'', notes:'' }); bump(); load()
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold">Cash Movement</h2><p className="text-sm text-muted-foreground">Never revenue. Never expense. Only cash position changes.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2"/>Record Movement</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>Cash Movement — {centre.name}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <Field l="Type"><Select value={f.movement_type} onValueChange={v=>setF({...f, movement_type:v})}><SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>{['BANK_DEPOSIT','OWNER_WITHDRAWAL','CASH_TRANSFER_OUT','CASH_TRANSFER_IN','FLOAT_ADDED','CASH_RECEIVED','CASH_HANDED_OVER'].map(x=><SelectItem key={x} value={x}>{x.replace(/_/g,' ')}</SelectItem>)}</SelectContent></Select></Field>
              <Field l="Amount (₹)"><Input type="number" value={f.amount} onChange={e=>setF({...f, amount:e.target.value})}/></Field>
              {(f.movement_type==='CASH_TRANSFER_IN'||f.movement_type==='CASH_TRANSFER_OUT') && (
                <Field l="Counterparty Centre"><Select value={f.counterparty_centre_id} onValueChange={v=>setF({...f, counterparty_centre_id:v})}><SelectTrigger><SelectValue placeholder="Choose"/></SelectTrigger>
                  <SelectContent>{centres.filter(c=>c.id!==centre.id).map(c=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></Field>
              )}
            </div>
            <Field l="Notes"><Textarea value={f.notes} onChange={e=>setF({...f, notes:e.target.value})}/></Field>
            <DialogFooter><Button onClick={submit}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="p-0">
        <Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Type</TableHead><TableHead>Notes</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
          <TableBody>
            {events.length===0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No cash movements today</TableCell></TableRow>}
            {events.map(e=>(<TableRow key={e.id}>
              <TableCell className="text-xs">{new Date(e.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</TableCell>
              <TableCell><Badge>{e.movement_type.replace(/_/g,' ')}</Badge></TableCell>
              <TableCell className="text-xs">{e.notes}</TableCell>
              <TableCell className="text-right font-medium">{formatINR(e.amount)}</TableCell>
            </TableRow>))}
          </TableBody></Table>
      </CardContent></Card>
    </div>
  )
}

// ---------- MASTER REGISTER ----------
function RegisterView({ centre }) {
  const [rows, setRows] = useState([])
  const [from, setFrom] = useState(() => { const d=new Date(); d.setDate(d.getDate()-13); return d.toISOString().slice(0,10) })
  const [to, setTo] = useState(todayStr())
  const load = useCallback(async () => {
    const r = await apiGet(`/master-register?centre_id=${centre?.id||'ALL'}&from=${from}&to=${to}`)
    setRows(r.rows || [])
  }, [centre?.id, from, to])
  useEffect(() => { load() }, [load])
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold">Master Register</h2><p className="text-sm text-muted-foreground">Excel-like daily aggregate. Every column is computed from the same event ledger.</p></div>
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="w-[150px]"/>
          <span>—</span>
          <Input type="date" value={to} onChange={e=>setTo(e.target.value)} className="w-[150px]"/>
          <Button variant="outline" size="icon" onClick={load}><RefreshCw className="h-4 w-4"/></Button>
        </div>
      </div>
      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead className="text-right">Opening</TableHead>
            <TableHead className="text-right">Booking</TableHead><TableHead className="text-right">Memb</TableHead><TableHead className="text-right">GC</TableHead>
            <TableHead className="text-right">Cash</TableHead><TableHead className="text-right">UPI</TableHead><TableHead className="text-right">Card</TableHead>
            <TableHead className="text-right">Expense</TableHead>
            <TableHead className="text-right">Deposit</TableHead><TableHead className="text-right">Withdraw</TableHead>
            <TableHead className="text-right">Closing Exp.</TableHead>
            <TableHead className="text-right">Guests</TableHead><TableHead>Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length===0 && <TableRow><TableCell colSpan={14} className="text-center text-muted-foreground py-6">No data in range</TableCell></TableRow>}
            {rows.map(r=>(<TableRow key={r.business_date}>
              <TableCell className="font-medium">{r.business_date}</TableCell>
              <TableCell className="text-right">{formatINR(r.opening_cash)}</TableCell>
              <TableCell className="text-right">{formatINR(r.booking_sales)}</TableCell>
              <TableCell className="text-right">{formatINR(r.membership_sales)}</TableCell>
              <TableCell className="text-right">{formatINR(r.gift_card_sales)}</TableCell>
              <TableCell className="text-right">{formatINR(r.cash_sales)}</TableCell>
              <TableCell className="text-right">{formatINR(r.upi_sales)}</TableCell>
              <TableCell className="text-right">{formatINR(r.card_sales)}</TableCell>
              <TableCell className="text-right text-rose-500">{formatINR(r.total_expenses)}</TableCell>
              <TableCell className="text-right">{formatINR(r.cash_deposited)}</TableCell>
              <TableCell className="text-right">{formatINR(r.cash_withdrawn)}</TableCell>
              <TableCell className="text-right font-semibold">{formatINR(r.closing_cash_expected)}</TableCell>
              <TableCell className="text-right">{r.guests}</TableCell>
              <TableCell><Badge variant={r.status==='CLOSED'?'default':'secondary'}>{r.status}</Badge></TableCell>
            </TableRow>))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  )
}

// ---------- CASH BOOK ----------
function CashBookView({ centre }) {
  const [data, setData] = useState(null)
  const [date, setDate] = useState(todayStr())
  const load = useCallback(async () => { setData(await apiGet(`/cash-book?centre_id=${centre.id}&date=${date}`)) }, [centre?.id, date])
  useEffect(()=>{ if(centre?.id) load()}, [load])
  const lines = data?.lines || []
  const agg = data?.agg || {}
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold">Cash Book</h2><p className="text-sm text-muted-foreground">Cash-only ledger with running balance.</p></div>
        <div className="flex items-center gap-2"><Input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-[160px]"/><Button variant="outline" size="icon" onClick={load}><RefreshCw className="h-4 w-4"/></Button></div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Opening Cash" value={formatINR(agg.opening_cash)}/>
        <Stat label="Cash In" value={formatINR((agg.cash_sales||0)+(agg.cash_transfer_in||0)+(agg.float_added||0)+(agg.other_cash_in||0))} accent="text-emerald-500"/>
        <Stat label="Expected Closing" value={formatINR(agg.closing_cash_expected)} accent="font-semibold"/>
      </div>
      <Card><CardContent className="p-0">
        <Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Ref</TableHead><TableHead>Description</TableHead><TableHead className="text-right">In</TableHead><TableHead className="text-right">Out</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
          <TableBody>
            {lines.map((l,i)=>(<TableRow key={i}>
              <TableCell className="text-xs">{l.time?new Date(l.time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'—'}</TableCell>
              <TableCell className="text-xs"><Badge variant="outline">{l.ref}</Badge></TableCell>
              <TableCell>{l.desc}</TableCell>
              <TableCell className="text-right text-emerald-500">{l.in?formatINR(l.in):''}</TableCell>
              <TableCell className="text-right text-rose-500">{l.out?formatINR(l.out):''}</TableCell>
              <TableCell className="text-right font-semibold">{formatINR(l.running)}</TableCell>
            </TableRow>))}
          </TableBody></Table>
      </CardContent></Card>
    </div>
  )
}

// ---------- BUSINESS DAY CLOSE ----------
function CloseView({ centre, role, bump }) {
  const [bd, setBd] = useState(null)
  const [dash, setDash] = useState(null)
  const [declared, setDeclared] = useState('')
  const [notes, setNotes] = useState('')
  const [openingInput, setOpeningInput] = useState('')
  const load = async () => {
    const b = await apiGet(`/business-day?centre_id=${centre.id}&date=${todayStr()}`)
    setBd(b); setOpeningInput(((b?.opening_cash||0)/100).toString())
    setDash(await apiGet(`/dashboard?centre_id=${centre.id}&date=${todayStr()}`))
  }
  useEffect(()=>{ if(centre?.id) load() }, [centre?.id])
  const setOpening = async () => {
    await apiPost('/business-day/set-opening', { centre_id: centre.id, opening_cash: toPaise(openingInput) })
    toast.success('Opening cash set'); load(); bump()
  }
  const close = async () => {
    const r = await apiPost('/business-day/close', { centre_id: centre.id, actor: role, role, closing_cash_declared: toPaise(declared), notes })
    if (r.error) return toast.error(r.error)
    toast.success(`Day closed. Variance: ${formatINR(r.variance)}`); load(); bump()
  }
  const reopen = async () => {
    const reason = prompt('Reason for reopening?')
    if (!reason) return
    const r = await apiPost('/business-day/reopen', { centre_id: centre.id, business_date: todayStr(), actor: role, role, reason })
    if (r.error) return toast.error(r.error)
    toast.success('Day reopened'); load(); bump()
  }
  const agg = dash?.agg || {}
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Business Day — {centre.name}</h2>
      <div className="grid md:grid-cols-3 gap-4">
        <Stat label="Status" value={<Badge variant={bd?.status==='CLOSED'?'default':'secondary'}>{bd?.status||'—'}</Badge>}/>
        <Stat label="Opening Cash" value={formatINR(bd?.opening_cash)}/>
        <Stat label="Expected Closing" value={formatINR(agg.closing_cash_expected)} accent="font-semibold"/>
      </div>

      {bd?.status==='OPEN' && (
        <Card><CardHeader><CardTitle>Opening Cash</CardTitle></CardHeader>
          <CardContent className="flex gap-3 items-end">
            <Field l="Opening Cash (₹)"><Input type="number" value={openingInput} onChange={e=>setOpeningInput(e.target.value)} className="w-[200px]"/></Field>
            <Button variant="outline" onClick={setOpening}>Set Opening</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Closing Verification</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Row k="Opening Cash" v={formatINR(agg.opening_cash)} />
            <Row k="+ Cash Sales" v={formatINR(agg.cash_sales)} />
            <Row k="+ Transfer In" v={formatINR(agg.cash_transfer_in)} />
            <Row k="+ Float Added" v={formatINR(agg.float_added)} />
            <Row k="− Cash Expenses" v={formatINR(agg.cash_expenses)} />
            <Row k="− Deposits" v={formatINR(agg.cash_deposited)} />
            <Row k="− Withdrawals" v={formatINR(agg.cash_withdrawn)} />
            <Row k="− Transfer Out" v={formatINR(agg.cash_transfer_out)} />
            <div className="border-t border-border/50 col-span-2"></div>
            <Row k="Expected Closing Cash" v={formatINR(agg.closing_cash_expected)} bold />
          </div>
          {bd?.status==='OPEN' ? (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Field l="Physical Cash Counted (₹)"><Input type="number" value={declared} onChange={e=>setDeclared(e.target.value)}/></Field>
              <Field l="Notes"><Input value={notes} onChange={e=>setNotes(e.target.value)}/></Field>
              <div className="col-span-2"><Button onClick={close} className="w-full"><Lock className="h-4 w-4 mr-2"/>Close Business Day</Button></div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Row k="Declared" v={formatINR(bd?.closing_cash_declared)}/>
                <Row k="Variance" v={formatINR(bd?.variance)}/>
              </div>
              {['MANAGER','OPS','SUPER'].includes(role) && <Button variant="outline" onClick={reopen}>Reopen Day</Button>}
              {!['MANAGER','OPS','SUPER'].includes(role) && <div className="text-xs text-muted-foreground">Only Manager+ can reopen.</div>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------- AUDIT ----------
function AuditView() {
  const [log, setLog] = useState([])
  useEffect(()=>{ apiGet('/audit-log').then(setLog) },[])
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Audit Log</h2>
      <p className="text-sm text-muted-foreground">Immutable history of sensitive actions.</p>
      <Card><CardContent className="p-0">
        <Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Action</TableHead><TableHead>Actor</TableHead><TableHead>Role</TableHead><TableHead>Centre</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
          <TableBody>
            {log.length===0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No audit entries yet</TableCell></TableRow>}
            {log.map(l=>(<TableRow key={l.id}>
              <TableCell className="text-xs">{new Date(l.created_at).toLocaleString('en-IN')}</TableCell>
              <TableCell><Badge>{l.action}</Badge></TableCell>
              <TableCell>{l.actor}</TableCell><TableCell>{l.role}</TableCell>
              <TableCell className="font-mono text-xs">{l.centre_id?.slice(0,8)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{JSON.stringify(l.new_value)} {l.reason?`— ${l.reason}`:''}</TableCell>
            </TableRow>))}
          </TableBody></Table>
      </CardContent></Card>
    </div>
  )
}

// ---------- SHELL ----------
function App() {
  const [centres, setCentres] = useState([])
  const [centre, setCentre] = useState(null)
  const [role, setRole] = useState('RECEPTION')
  const [view, setView] = useState('dashboard')
  const [bump, setBump] = useState(0)

  useEffect(() => { apiGet('/centres').then(list => { setCentres(list); setCentre(list[0]) }) }, [])

  if (!centre) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading centres…</div>

  const Icon = NAV.find(n=>n.id===view)?.icon || LayoutDashboard
  const props = { centre, centres, role, bump: () => setBump(b=>b+1), refreshTick: bump }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <Toaster theme="dark" position="top-right" richColors />
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 h-screen sticky top-0 border-r border-border/50 bg-card/40 backdrop-blur p-4 flex flex-col">
          <div className="flex items-center gap-2 px-2 py-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white"/>
            </div>
            <div>
              <div className="font-semibold tracking-tight">Auréa Spa</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Business OS</div>
            </div>
          </div>

          <div className="mt-4 space-y-1">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground px-2">Centre</Label>
            <Select value={centre.id} onValueChange={v=>setCentre(centres.find(c=>c.id===v))}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>{centres.map(c=><SelectItem key={c.id} value={c.id}><Building2 className="h-3 w-3 inline mr-1"/>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="mt-3 space-y-1">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground px-2">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>{ROLES.map(r=><SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <nav className="mt-6 flex-1 space-y-1">
            {NAV.map(n => {
              const active = view === n.id
              const N = n.icon
              return (
                <button key={n.id} onClick={()=>setView(n.id)}
                  className={`w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${active?'bg-primary text-primary-foreground':'hover:bg-muted text-foreground/80'}`}>
                  <N className="h-4 w-4"/>{n.label}
                  {active && <ChevronRight className="h-3 w-3 ml-auto"/>}
                </button>
              )
            })}
          </nav>

          <div className="text-[10px] text-muted-foreground px-2 py-3 border-t border-border/50">One transaction • One source • Infinite reports</div>
        </aside>

        {/* Main */}
        <main className="flex-1 p-8 max-w-[1600px]">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <Icon className="h-4 w-4"/> <span>{NAV.find(n=>n.id===view)?.label}</span>
            <span className="mx-1">/</span><span>{centre.name}</span>
            <span className="ml-auto text-xs">{new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</span>
          </div>

          {view==='dashboard'  && <DashboardView {...props} />}
          {view==='booking'    && <BookingView {...props} />}
          {view==='membership' && <MembershipView {...props} />}
          {view==='giftcard'   && <GiftCardView {...props} />}
          {view==='expense'    && <ExpenseView {...props} />}
          {view==='cash'       && <CashMovementView {...props} />}
          {view==='register'   && <RegisterView {...props} />}
          {view==='cashbook'   && <CashBookView {...props} />}
          {view==='close'      && <CloseView {...props} />}
          {view==='audit'      && <AuditView {...props} />}
        </main>
      </div>
    </div>
  )
}

export default App
