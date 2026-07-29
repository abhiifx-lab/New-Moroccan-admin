'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { toast, Toaster } from 'sonner'
import { exportRegisterExcel, exportRegisterPDF } from '@/lib/export-register'
import {
  LayoutDashboard, CalendarCheck2, CreditCard, Gift, Receipt, ArrowLeftRight,
  BookOpen, Wallet, Lock, ShieldCheck, Building2, Sparkles, RefreshCw, Plus, ChevronRight,
  Search, ArrowLeft, Undo2, AlertTriangle, Clock, User2, MapPin, FileText, Users, LogOut, Key,
  Download, FileSpreadsheet, Menu, Trash2, Settings
} from 'lucide-react'

const DashboardMissionControl = dynamic(
  () => import('@/components/dashboard/mission-control').then(module => module.DashboardMissionControl),
  { ssr:false, loading:() => <div className="space-y-4" aria-label="Loading dashboard"><Skeleton className="h-20 rounded-2xl"/><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><Skeleton className="h-32 rounded-2xl"/><Skeleton className="h-32 rounded-2xl"/><Skeleton className="h-32 rounded-2xl"/></div><Skeleton className="h-80 rounded-2xl"/></div> }
)

// ---------- utils ----------
const toPaise = (r) => Math.round((Number(r) || 0) * 100)
const formatINR = (paise) => {
  const n = Number(paise || 0) / 100
  const sign = n < 0 ? '-' : ''
  return sign + '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const liabilityInitialPaise = (record) => {
  const canonical = Number(record?.original_paise || 0)
  if (canonical > 0) return canonical
  return Number(record?.initial_paise || record?.remaining_paise || 0)
}
const todayStr = () => {
  const d = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  return `${parts.find(p=>p.type==='year').value}-${parts.find(p=>p.type==='month').value}-${parts.find(p=>p.type==='day').value}`
}
const nearestAppointmentTime = () => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date())
  const hour = Number(parts.find(p=>p.type==='hour')?.value || 0)
  const minute = Number(parts.find(p=>p.type==='minute')?.value || 0)
  const rounded = Math.ceil((hour * 60 + minute + 1) / 15) * 15
  return `${String(Math.floor((rounded % 1440) / 60)).padStart(2,'0')}:${String(rounded % 60).padStart(2,'0')}`
}

let authToken = typeof window !== 'undefined' ? localStorage.getItem('sb_auth_token') || '' : ''
function setAuthToken(t) {
  authToken = t
  if (typeof window !== 'undefined') {
    if (t) localStorage.setItem('sb_auth_token', t)
    else localStorage.removeItem('sb_auth_token')
  }
}

const apiGet = async (path) => {
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {}
  const r = await fetch('/api'+path, { headers })
  return r.json()
}
const apiPost = async (path, body) => {
  const headers = { 'Content-Type':'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }
  const r = await fetch('/api'+path, { method:'POST', headers, body: JSON.stringify(body) })
  return r.json()
}
const apiPatch = async (path, body) => {
  const headers = { 'Content-Type':'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }
  const r = await fetch('/api'+path, { method:'PATCH', headers, body: JSON.stringify(body) })
  return r.json()
}
const apiDelete = async (path) => {
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {}
  const r = await fetch('/api'+path, { method:'DELETE', headers })
  return r.json()
}

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
  { id: 'reports',     label: 'Reports',         icon: FileText },
  { id: 'therapists',  label: 'Therapists',      icon: User2 },
  { id: 'audit',       label: 'Audit Log',       icon: ShieldCheck },
]

const SALE_PAY_METHODS = ['CASH','UPI_1','UPI_2','CARD']
const EXPENSE_CATEGORIES = ['Utilities','Supplies','Salaries','Wages','Rent','Marketing','Maintenance','Consumables','Other']
const ALL_CENTRES = { id: 'ALL', name: 'All Centres' }

// ============================================================================
// DRILL-DOWN CONTEXT
// A single global drill-down dialog. Any component can call openDrill(...) to
// investigate a metric or open an individual event. It handles Metric → Events
// → Event Detail → Reverse. On reversal it invokes bump() so every view refreshes.
// ============================================================================
const DrillContext = {
  open: () => {},
  close: () => {},
}

function DrillDownDialog({ ctx, role, bump }) {
  // stage: 'metric' | 'event'
  const [stage, setStage] = useState('metric')
  const [loading, setLoading] = useState(false)
  const [metricData, setMetricData] = useState(null)
  const [eventDetail, setEventDetail] = useState(null)
  const [historyStack, setHistoryStack] = useState([])
  const [reverseOpen, setReverseOpen] = useState(false)
  const [reverseReason, setReverseReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isOpen = !!ctx
  const close = () => { DrillContext.close() }

  useEffect(() => {
    if (!ctx) { setStage('metric'); setMetricData(null); setEventDetail(null); setHistoryStack([]); return }
    if (ctx.type === 'metric') openMetric(ctx)
    else if (ctx.type === 'event') openEvent(ctx.eventId)
  }, [ctx])

  const openMetric = async (c) => {
    setStage('metric'); setLoading(true); setEventDetail(null)
    const params = new URLSearchParams({ metric: c.metric })
    if (c.centre_id) params.set('centre_id', c.centre_id)
    if (c.date) params.set('date', c.date)
    if (c.from) params.set('from', c.from)
    if (c.to) params.set('to', c.to)
    const d = await apiGet('/drill-down?' + params.toString())
    setMetricData({ ...d, ctx: c })
    setLoading(false)
  }
  const openEvent = async (id) => {
    setLoading(true); setStage('event')
    const d = await apiGet('/events/' + id)
    setEventDetail(d)
    setLoading(false)
  }
  const goEvent = (id) => {
    if (metricData) setHistoryStack(s => [...s, { stage: 'metric', metricData }])
    openEvent(id)
  }
  const goBack = () => {
    if (historyStack.length === 0) return close()
    const prev = historyStack[historyStack.length - 1]
    setHistoryStack(s => s.slice(0, -1))
    if (prev.stage === 'metric') { setMetricData(prev.metricData); setStage('metric'); setEventDetail(null) }
  }

  const submitReverse = async () => {
    if (!reverseReason.trim()) { toast.error('Reason is mandatory'); return }
    setSubmitting(true)
    const r = await apiPost(`/events/${eventDetail.id}/reverse`, { reason: reverseReason, actor: 'ui-user', role })
    setSubmitting(false)
    if (r.error) { toast.error(r.error); return }
    toast.success('Event reversed. All reports refreshed.')
    setReverseOpen(false); setReverseReason('')
    bump()
    openEvent(eventDetail.id) // refresh detail
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={o => { if (!o) close() }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              {historyStack.length > 0 && (
                <Button variant="ghost" size="icon" aria-label="Go back" onClick={goBack} className="h-9 w-9"><ArrowLeft className="h-4 w-4"/></Button>
              )}
              <DialogTitle className="flex-1">
                {stage === 'metric' && metricData ? `Investigate: ${metricData.label}` : 'Event Detail'}
              </DialogTitle>
            </div>
            <DialogDescription>
              {stage === 'metric' && metricData && (
                <span className="text-xs">
                  {ctx?.date ? `Date: ${ctx.date}` : ctx?.from ? `Range: ${ctx.from} → ${ctx.to}` : ''}
                  {ctx?.centre_id && ctx.centre_id !== 'ALL' ? ` • Centre filtered` : ' • All centres'}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {loading && <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>}

          {!loading && stage === 'metric' && metricData && (
            <MetricStage data={metricData} onEvent={goEvent} />
          )}

          {!loading && stage === 'event' && eventDetail && (
            <EventStage ev={eventDetail} onReverse={() => setReverseOpen(true)} role={role} onOpenRelated={goEvent}/>
          )}
        </DialogContent>
      </Dialog>

      {/* Reverse confirmation */}
      <Dialog open={reverseOpen} onOpenChange={setReverseOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Undo2 className="h-4 w-4"/>Reverse Event</DialogTitle>
            <DialogDescription>This will create an immutable opposite event. The original will remain in the ledger for audit. All reports refresh automatically.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-3 rounded border border-amber-500/30 bg-amber-500/5 text-xs flex gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5"/>
              <div>
                Reversing role: <b>{role}</b>. If the business day is closed, only Manager+ can reverse.
                Liability balances (memberships / gift cards) will be restored automatically when applicable.
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reason (required)</Label>
              <Textarea value={reverseReason} onChange={e=>setReverseReason(e.target.value)} placeholder="e.g., customer no-show, entered wrong amount, duplicate booking..." rows={3}/>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setReverseOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={submitReverse} disabled={submitting || !reverseReason.trim()}>
              <Undo2 className="h-4 w-4 mr-1"/>{submitting ? 'Reversing…' : 'Confirm Reversal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function MetricStage({ data, onEvent }) {
  const [q, setQ] = useState('')
  const events = data.events || []
  const reversedIds = useMemo(() => new Set(events.map(x=>x.event).filter(x=>x.is_reversal && x.reverses).map(x=>x.reverses)), [events])
  const filtered = q
    ? events.filter(x => JSON.stringify(x.event).toLowerCase().includes(q.toLowerCase()))
    : events

  return (
    <div className="space-y-4">
      <div data-kpi-grid="true" className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Metric Total" value={data.isCount ? data.total : formatINR(data.total)} accent="text-emerald-500"/>
        <MiniStat label="Events" value={events.length}/>
        <MiniStat label="Event Types" value={Object.keys(data.breakdown||{}).length}/>
        <MiniStat label="Includes Reversals" value={events.some(e=>e.event.is_reversal)?'Yes':'No'}/>
      </div>

      {/* Type breakdown */}
      <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">Breakdown by Event Type</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader><TableRow><TableHead>Type</TableHead><TableHead className="text-right">Count</TableHead><TableHead className="text-right">Contribution</TableHead></TableRow></TableHeader>
            <TableBody>
              {Object.entries(data.breakdown || {}).map(([t, v]) => (
                <TableRow key={t}>
                  <TableCell><Badge variant="secondary">{t}</Badge></TableCell>
                  <TableCell className="text-right">{v.count}</TableCell>
                  <TableCell className="text-right font-medium">{data.isCount ? v.total : formatINR(v.total)}</TableCell>
                </TableRow>
              ))}
              {Object.keys(data.breakdown || {}).length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No contributing events</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Individual events */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1"><Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground"/><Input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search events…" className="pl-8"/></div>
        <div className="text-xs text-muted-foreground">{filtered.length} events</div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Time</TableHead><TableHead>Type</TableHead><TableHead>Customer / Ref</TableHead>
              <TableHead>Pay</TableHead><TableHead className="text-right">Contribution</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map(({ event: e, contribution }) => (
                <TableRow key={e.id} className={e.is_reversal ? 'opacity-80' : ''}>
                  <TableCell className="text-xs">{new Date(e.created_at).toLocaleString('en-IN', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'short' })}</TableCell>
                  <TableCell>
                    <Badge variant={e.is_reversal ? 'destructive' : 'secondary'} className="mr-1">{e.type}</Badge>
                    {e.is_reversal && <Badge variant="outline" className="text-[10px]">REV</Badge>}
                    {reversedIds.has(e.id) && <Badge variant="outline" className="text-[10px] ml-1">REVERSED</Badge>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {e.customer || e.category || e.movement_type?.replace(/_/g,' ') || '—'}
                    {e.membership_code && <span className="ml-1 font-mono text-[10px] text-muted-foreground">{e.membership_code}</span>}
                    {e.gift_card_code && <span className="ml-1 font-mono text-[10px] text-muted-foreground">{e.gift_card_code}</span>}
                  </TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{e.payment_method || '—'}</Badge></TableCell>
                  <TableCell className={`text-right font-medium ${contribution<0?'text-rose-500':''}`}>
                    {data.isCount ? contribution : formatINR(contribution)}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={()=>onEvent(e.id)}>Detail<ChevronRight className="h-3 w-3 ml-1"/></Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No events</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
function MiniStat({ label, value, accent }) {
  return (
    <div className="rounded-md border border-border/50 p-3 bg-card/40">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold mt-0.5 ${accent||''}`}>{value}</div>
    </div>
  )
}

function EventStage({ ev, onReverse, role, onOpenRelated }) {
  const li = ev.ledger_impact || {}
  const canReverse = !ev.is_reversal && !ev.reversed
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [receiptNo, setReceiptNo] = useState(ev.booking?.physical_receipt_no || '')
  const [savingReceipt, setSavingReceipt] = useState(false)
  useEffect(() => { setReceiptNo(ev.booking?.physical_receipt_no || '') }, [ev.id, ev.booking?.physical_receipt_no])
  const saveReceipt = async () => {
    setSavingReceipt(true)
    const result = await apiPatch(`/bookings/${ev.id}/receipt`, { physical_receipt_no: receiptNo })
    setSavingReceipt(false)
    if (result.error) return toast.error(result.error)
    setReceiptNo(result.booking?.physical_receipt_no || '')
    setReceiptOpen(false)
    toast.success('Physical receipt number updated and audited')
  }
  return (
    <div className="space-y-4">
      {/* Header banner */}
      <div className="flex items-start justify-between gap-3 rounded-lg border border-border/50 p-4 bg-gradient-to-br from-card to-muted/20">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={ev.is_reversal ? 'destructive' : 'default'} className="text-xs">{ev.type}</Badge>
            {ev.is_reversal && <Badge variant="outline">REVERSAL EVENT</Badge>}
            {ev.reversed && <Badge variant="outline" className="text-rose-500">REVERSED</Badge>}
            <Badge variant="outline">{ev.payment_method || ev.movement_type || '—'}</Badge>
          </div>
          <div className="mt-2 text-2xl font-semibold">{formatINR(ev.amount)}</div>
          <div className="text-xs text-muted-foreground font-mono">{ev.id}</div>
        </div>
        {canReverse && (
          <Button variant="destructive" onClick={onReverse}><Undo2 className="h-4 w-4 mr-1"/>Reverse Event</Button>
        )}
      </div>

      {/* Info grid */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card><CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4"/>Event Info</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1.5 pt-0">
            <KV k="Type" v={ev.type}/>
            <KV k="Business Date" v={ev.business_date}/>
            <KV k="Created At" v={new Date(ev.created_at).toLocaleString('en-IN')}/>
            <KV k="Created By" v={ev.created_by}/>
            {ev.customer && <KV k="Customer" v={ev.customer}/>}
            {ev.therapist && <KV k="Therapist" v={ev.therapist}/>}
            {ev.service_name && <KV k="Service" v={ev.service_name}/>}
            {ev.booking?.appointment_date && <KV k="Appointment" v={`${ev.booking.appointment_date} • ${String(ev.booking.appointment_time || '').slice(0,5)}`}/>}
            {ev.booking?.duration_minutes && <KV k="Duration" v={`${ev.booking.duration_minutes} minutes`}/>}
            {ev.type === 'BOOKING' && <KV k="Physical Receipt" v={
              <span className="inline-flex items-center gap-2">
                <span>{receiptNo || '—'}</span>
                {['MANAGER','OPS','SUPER'].includes(role) && <Button variant="ghost" size="sm" className="h-6 px-2" onClick={()=>setReceiptOpen(true)}>Edit</Button>}
              </span>
            }/>}
            {ev.category && <KV k="Category" v={ev.category}/>}
            {ev.vendor && <KV k="Vendor" v={ev.vendor}/>}
            {ev.movement_type && <KV k="Movement" v={ev.movement_type.replace(/_/g,' ')}/>}
            {ev.membership_code && <KV k="Membership Code" v={<span className="font-mono">{ev.membership_code}</span>}/>}
            {ev.gift_card_code && <KV k="Gift Card Code" v={<span className="font-mono">{ev.gift_card_code}</span>}/>}
            {ev.redemption_ref && <KV k="Redeemed" v={<span className="font-mono">{ev.redemption_ref}</span>}/>}
            {ev.notes && <KV k="Notes" v={ev.notes}/>}
          </CardContent>
        </Card>

        <Card><CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4"/>Financial Impact</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1.5 pt-0">
            <KV k="Revenue" v={<span className={li.revenue>=0?'text-emerald-500':'text-rose-500'}>{formatINR(li.revenue)}</span>}/>
            <KV k="Expense" v={<span className={li.expense<=0?'text-muted-foreground':'text-rose-500'}>{formatINR(li.expense)}</span>}/>
            <KV k="Cash Impact" v={<span className={li.cash>=0?'text-emerald-500':'text-rose-500'}>{formatINR(li.cash)}</span>}/>
            <KV k="UPI Impact" v={formatINR(li.upi)}/>
            <KV k="Card Impact" v={formatINR(li.card)}/>
            <KV k="Liability Delta" v={<span className={li.liability_delta>0?'text-amber-500':'text-emerald-500'}>{formatINR(li.liability_delta)}</span>}/>
            {ev.payment_breakdown && (
              <div className="mt-2 pt-2 border-t border-border/50 text-xs">
                <div className="text-muted-foreground mb-1">Mixed Payment Split</div>
                <div className="grid grid-cols-3 gap-2">
                  <div>Cash: {formatINR(ev.payment_breakdown.cash)}</div>
                  <div>UPI: {formatINR(ev.payment_breakdown.upi)}</div>
                  <div>Card: {formatINR(ev.payment_breakdown.card)}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {ev.centre && (
          <Card><CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4"/>Centre</CardTitle></CardHeader>
            <CardContent className="text-sm pt-0 space-y-1.5">
              <KV k="Name" v={ev.centre.name}/>
              <KV k="Code" v={ev.centre.code}/>
              <KV k="City" v={ev.centre.city}/>
            </CardContent>
          </Card>
        )}

        {(ev.membership || ev.gift_card) && (
          <Card><CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><CreditCard className="h-4 w-4"/>Linked {ev.membership?'Membership':'Gift Card'}</CardTitle></CardHeader>
            <CardContent className="text-sm pt-0 space-y-1.5">
              {(ev.membership || ev.gift_card) && (
                <>
                  <KV k="Code" v={<span className="font-mono">{(ev.membership||ev.gift_card).code}</span>}/>
                  <KV k="Customer" v={(ev.membership||ev.gift_card).customer || (ev.gift_card?.buyer)}/>
                  <KV k="Initial" v={formatINR(liabilityInitialPaise(ev.membership||ev.gift_card))}/>
                  <KV k="Remaining" v={<b>{formatINR((ev.membership||ev.gift_card).remaining_paise)}</b>}/>
                  <KV k="Redemptions" v={(ev.membership||ev.gift_card).redemption_count || 0}/>
                  {(ev.membership||ev.gift_card).reversed && <Badge variant="destructive">REVERSED</Badge>}
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {ev.type === 'BOOKING' && ev.booking && (
        <Card><CardHeader className="py-3"><CardTitle className="text-sm">Appointment &amp; Sale Summary</CardTitle></CardHeader>
          <CardContent className="pt-0 text-sm grid md:grid-cols-2 gap-x-6 gap-y-1.5">
            <KV k="Base Price" v={formatINR(ev.booking.base_price_paise)}/>
            <KV k="Offer" v={ev.booking.offer_code || '—'}/>
            <KV k="Offer Discount" v={formatINR(ev.booking.discount_paise)}/>
            <KV k="Membership Redemption" v={formatINR(ev.booking.membership_redemption_paise)}/>
            <KV k="Gift Card Redemption" v={formatINR(ev.booking.gift_card_redemption_paise)}/>
            <KV k="Final Receivable" v={<b>{formatINR(ev.booking.final_receivable_paise)}</b>}/>
          </CardContent>
        </Card>
      )}

      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Physical Receipt Number</DialogTitle><DialogDescription>This operational reference is unique within the centre. Every change is audited.</DialogDescription></DialogHeader>
          <Field l="Physical Receipt No."><Input value={receiptNo} onChange={e=>setReceiptNo(e.target.value)} /></Field>
          <DialogFooter><Button variant="outline" onClick={()=>setReceiptOpen(false)}>Cancel</Button><Button onClick={saveReceipt} disabled={savingReceipt}>{savingReceipt?'Saving…':'Save Receipt'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reversal linkage */}
      {(ev.reversal_event || ev.original_event) && (
        <Card><CardHeader className="py-3"><CardTitle className="text-sm">Reversal Linkage</CardTitle></CardHeader>
          <CardContent className="pt-0 text-sm space-y-2">
            {ev.reversal_event && (
              <div className="flex items-center justify-between">
                <div>Reversed by event <span className="font-mono text-xs">{ev.reversal_event.id.slice(0,8)}</span> on {new Date(ev.reversal_event.created_at).toLocaleString('en-IN')}</div>
                <Button variant="outline" size="sm" onClick={()=>onOpenRelated(ev.reversal_event.id)}>Open Reversal<ChevronRight className="h-3 w-3 ml-1"/></Button>
              </div>
            )}
            {ev.original_event && (
              <div className="flex items-center justify-between">
                <div>Reverses original event <span className="font-mono text-xs">{ev.original_event.id.slice(0,8)}</span></div>
                <Button variant="outline" size="sm" onClick={()=>onOpenRelated(ev.original_event.id)}>Open Original<ChevronRight className="h-3 w-3 ml-1"/></Button>
              </div>
            )}
            {ev.reversal_reason && <div className="text-xs bg-muted p-2 rounded"><b>Reason:</b> {ev.reversal_reason}</div>}
          </CardContent>
        </Card>
      )}

      {/* Audit trail */}
      <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4"/>Audit History</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Action</TableHead><TableHead>Actor</TableHead><TableHead>Role</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
            <TableBody>
              {(ev.audit_history || []).map(a => (
                <TableRow key={a.id}>
                  <TableCell className="text-xs">{new Date(a.created_at).toLocaleString('en-IN')}</TableCell>
                  <TableCell><Badge>{a.action}</Badge></TableCell>
                  <TableCell>{a.actor}</TableCell>
                  <TableCell>{a.role}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{a.reason || JSON.stringify(a.new_value || {})}</TableCell>
                </TableRow>
              ))}
              {(ev.audit_history || []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No audit entries</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
function KV({ k, v }) {
  return <div className="flex justify-between gap-2"><span className="text-muted-foreground">{k}</span><span className="text-right">{v}</span></div>
}

// ============================================================================
// UI PRIMITIVES
// ============================================================================
function Stat({ label, value, hint, accent, onClick }) {
  const clickable = !!onClick
  const activate = (event) => {
    if (!clickable || !['Enter', ' '].includes(event.key)) return
    event.preventDefault(); onClick()
  }
  return (
    <Card role={clickable?'button':undefined} tabIndex={clickable?0:undefined} aria-label={clickable?`${label}: ${value}. Open details`:undefined} className={`border-border/50 bg-card/60 backdrop-blur ${clickable?'cursor-pointer hover:border-primary/50 transition-colors focus-visible:ring-2 focus-visible:ring-ring':''}`} onClick={onClick} onKeyDown={activate}>
      <CardContent className="flex min-h-[116px] flex-col justify-center p-5 pt-5 sm:p-6 sm:pt-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center justify-between">{label}{clickable && <Search className="h-3 w-3 opacity-40"/>}</div>
        <div className={`mt-1 text-2xl font-semibold ${accent||''}`}>{value}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  )
}
function Row({ k, v, bold, onClick }) {
  const activate = (event) => {
    if (!onClick || !['Enter', ' '].includes(event.key)) return
    event.preventDefault(); onClick()
  }
  return (
    <div role={onClick?'button':undefined} tabIndex={onClick?0:undefined} aria-label={onClick?`${k}: ${v}. Open details`:undefined} className={`flex justify-between gap-3 rounded-sm ${onClick?'cursor-pointer hover:text-primary transition-colors focus-visible:ring-2 focus-visible:ring-ring':''}`} onClick={onClick} onKeyDown={activate}>
      <span className="text-muted-foreground">{k}</span><span className={bold?'font-semibold':''}>{v}</span>
    </div>
  )
}
function Field({ l, children }) { return <div role="group" aria-label={l} className="space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground">{l}</Label>{children}</div> }
function CollectiveScopeNotice({ feature }) {
  return (
    <Card>
      <CardContent className="py-10 text-center space-y-2">
        <Building2 className="h-8 w-8 mx-auto text-amber-400"/>
        <div className="font-semibold">{feature} is managed centre by centre</div>
        <p className="text-sm text-muted-foreground">Choose a specific centre from Centre Scope to view or change this operational register.</p>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// DASHBOARD
// ============================================================================
function LegacyDashboardView({ centre, refreshTick, onDrill }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(todayStr())
  const load = useCallback(async () => {
    setLoading(true)
    const d = await apiGet(`/dashboard?centre_id=${centre?.id || 'ALL'}&date=${date}`)
    setData(d); setLoading(false)
  }, [centre?.id, date])
  useEffect(() => { load() }, [load, refreshTick])
  const a = data?.agg || data?.single_centre?.agg || data?.consolidated || {}
  const drill = (metric) => onDrill({ type:'metric', metric, centre_id: centre?.id || 'ALL', date })

  if (loading && !data) return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="space-y-2"><Skeleton className="h-8 w-48"/><Skeleton className="h-4 w-full max-w-md"/></div>
      <div data-kpi-grid="true" className="grid grid-cols-2 gap-4 md:grid-cols-4">{[0,1,2,3].map(i=><Skeleton key={i} className="h-28 rounded-2xl"/>)}</div>
      <div className="grid gap-4 md:grid-cols-3">{[0,1,2].map(i=><Skeleton key={i} className="h-52 rounded-2xl"/>)}</div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Live Dashboard</h2>
          <p className="text-sm text-muted-foreground">Every number is clickable — drill down to source events.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input aria-label="Dashboard date" type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-[160px]" />
          <Button variant="outline" size="icon" aria-label="Refresh dashboard" onClick={load}><RefreshCw className="h-4 w-4"/></Button>
        </div>
      </div>

      <div data-kpi-grid="true" className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Today's Revenue" value={formatINR(a.total_revenue)} hint={`${a.bookings||0} bookings • ${a.redemptions||0} redemptions`} accent="text-emerald-500" onClick={()=>drill('total_revenue')}/>
        <Stat label="Guests" value={a.guests||0} hint="Unique customers today" onClick={()=>drill('guests')}/>
        <Stat label="Expenses" value={formatINR(a.total_expenses)} hint={`${a.expenses_count||0} entries`} accent="text-rose-500" onClick={()=>drill('total_expenses')}/>
        <Stat label="Cash in Drawer" value={formatINR(a.closing_cash_expected)} hint={`Opening ${formatINR(a.opening_cash)}`} onClick={()=>drill('closing_cash_expected')}/>
      </div>

      {centre?.id === 'ALL' && (
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Centre Breakdown</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Centre</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Expenses</TableHead><TableHead className="text-right">Cash in Drawer</TableHead><TableHead className="text-right">Guests</TableHead></TableRow></TableHeader>
              <TableBody>
                {(data?.centres || []).map(item => <TableRow key={item.centre.id}>
                  <TableCell className="font-medium">{item.centre.name}</TableCell>
                  <TableCell className="text-right">{formatINR(item.agg?.total_revenue)}</TableCell>
                  <TableCell className="text-right text-rose-500">{formatINR(item.agg?.total_expenses)}</TableCell>
                  <TableCell className="text-right">{formatINR(item.agg?.closing_cash_expected)}</TableCell>
                  <TableCell className="text-right">{item.agg?.guests || 0}</TableCell>
                </TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Sales Mix</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="Booking Sales" v={formatINR(a.booking_sales)} onClick={()=>drill('booking_sales')}/>
            <Row k="Membership Sales" v={formatINR(a.membership_sales)} onClick={()=>drill('membership_sales')}/>
            <Row k="Gift Card Sales" v={formatINR(a.gift_card_sales)} onClick={()=>drill('gift_card_sales')}/>
            <div className="border-t border-border/50 my-2"></div>
            <Row k="Total Revenue" v={formatINR(a.total_revenue)} bold onClick={()=>drill('total_revenue')}/>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Payment Method</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="Cash Sales" v={formatINR(a.cash_sales)} onClick={()=>drill('cash_sales')}/>
            <Row k="UPI 1 Sales" v={formatINR(a.upi_1_sales)} onClick={()=>drill('upi_1_sales')}/>
            <Row k="UPI 2 Sales" v={formatINR(a.upi_2_sales)} onClick={()=>drill('upi_2_sales')}/>
            <Row k="Card Sales" v={formatINR(a.card_sales)} onClick={()=>drill('card_sales')}/>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Cash Movement</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="Deposited to Bank" v={formatINR(a.cash_deposited)} onClick={()=>drill('cash_deposited')}/>
            <Row k="Owner Withdrawal" v={formatINR(a.cash_withdrawn)} onClick={()=>drill('cash_withdrawn')}/>
            <Row k="Transfer In" v={formatINR(a.cash_transfer_in)} onClick={()=>drill('cash_transfer_in')}/>
            <Row k="Transfer Out" v={formatINR(a.cash_transfer_out)} onClick={()=>drill('cash_transfer_out')}/>
            <Row k="Float Added" v={formatINR(a.float_added)} onClick={()=>drill('float_added')}/>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm text-muted-foreground">P&amp;L Snapshot</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <Stat label="Revenue" value={formatINR(a.total_revenue)} accent="text-emerald-500" onClick={()=>drill('total_revenue')}/>
          <Stat label="Expenses" value={formatINR(a.total_expenses)} accent="text-rose-500" onClick={()=>drill('total_expenses')}/>
          <Stat label="Net Profit" value={formatINR(a.net_profit)} accent={(a.net_profit||0)>=0?'text-emerald-500':'text-rose-500'} onClick={()=>drill('net_profit')}/>
        </CardContent>
      </Card>
      {loading && <div className="text-xs text-muted-foreground">Loading...</div>}
    </div>
  )
}

function DashboardView({ centre, profile, refreshTick, onDrill, onNavigateAction, onProfileAction }) {
  if (process.env.NEXT_PUBLIC_LEGACY_DASHBOARD === '1') {
    return <LegacyDashboardView centre={centre} refreshTick={refreshTick} onDrill={onDrill}/>
  }
  return <DashboardMissionControl {...{ centre, profile, refreshTick, onDrill, onNavigateAction, onProfileAction, apiGet, formatMoney:formatINR }} today={todayStr()}/>
}

// ============================================================================
// BOOKING
// ============================================================================
function BookingView({ centre, centres, role, bump, onDrill, refreshTick, pendingAction, onActionConsumed }) {
  const blankForm = () => ({
    customer_phone:'', customer_name:'', customer_email:'', treatment_name:'', service_id:'', therapist_id:'',
    appointment_date:todayStr(), appointment_time:nearestAppointmentTime(), offer_code:'', payment_method:'CASH',
    physical_receipt_no:'', use_membership:false, membership_code:'', use_gift_card:false, gift_card_code:''
  })
  const [variants, setVariants] = useState([])
  const [therapists, setTherapists] = useState([])
  const [events, setEvents] = useState([])
  const [open, setOpen] = useState(false)
  const [f, setF] = useState(blankForm)
  const [customerData, setCustomerData] = useState(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [treatmentSearch, setTreatmentSearch] = useState('')
  const [appliedOffer, setAppliedOffer] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [tableSearch, setTableSearch] = useState('')
  const isAllCentres = centre?.id === 'ALL'
  const centreName = (id) => centres.find(c => c.id === id)?.name || id
  const load = async () => {
    const eventRequest = apiGet(`/events?centre_id=${centre.id}&date=${todayStr()}&type=BOOKING`)
    if (isAllCentres) {
      const e = await eventRequest
      setEvents(Array.isArray(e) ? e : [])
      return
    }
    const [options, e] = await Promise.all([apiGet(`/appointment/options?centre_id=${centre.id}`), eventRequest])
    if (options.error) toast.error(options.error)
    setVariants(Array.isArray(options.variants) ? options.variants : [])
    setTherapists(Array.isArray(options.therapists) ? options.therapists : [])
    setEvents(Array.isArray(e) ? e : [])
  }
  useEffect(() => { if (centre?.id) load() }, [centre?.id, refreshTick])
  useEffect(() => {
    if (!isAllCentres && ['new-booking','walk-in'].includes(pendingAction)) {
      setOpen(true)
      onActionConsumed?.()
    }
  }, [pendingAction, isAllCentres, onActionConsumed])
  useEffect(() => {
    const phone = f.customer_phone.replace(/\D/g, '')
    if (phone.length < 10) { setCustomerData(null); return }
    const timer = setTimeout(async () => {
      setLookupLoading(true)
      const result = await apiGet(`/customers/lookup?phone=${encodeURIComponent(phone)}`)
      setLookupLoading(false)
      if (result.error) return toast.error(result.error)
      setCustomerData(result)
      if (result.found) {
        setF(current => ({ ...current, customer_name: result.customer.name || '', customer_email: result.customer.email || '',
          membership_code: result.memberships?.[0]?.code || '', gift_card_code: result.gift_cards?.[0]?.code || '' }))
      }
    }, 450)
    return () => clearTimeout(timer)
  }, [f.customer_phone])
  const reversedIds = useMemo(() => new Set(events.filter(x=>x.is_reversal && x.reverses).map(x=>x.reverses)), [events])
  const treatments = useMemo(() => [...new Set(variants.map(v => v.treatment_name || v.name))].filter(name => name.toLowerCase().includes(treatmentSearch.toLowerCase())), [variants, treatmentSearch])
  const treatmentVariants = variants.filter(v => (v.treatment_name || v.name) === f.treatment_name)
  const selectedVariant = variants.find(v => v.id === f.service_id)
  const selectedTherapist = therapists.find(t => t.id === f.therapist_id)
  const basePrice = Number(selectedVariant?.price_paise || 0)
  const offerDiscount = Number(appliedOffer?.discount_paise || 0)
  const afterDiscount = Math.max(0, basePrice - offerDiscount)
  const selectedMembership = (customerData?.memberships || []).find(m => m.code === f.membership_code)
  const membershipRedemption = f.use_membership ? Math.min(Number(selectedMembership?.remaining_paise || 0), afterDiscount) : 0
  const selectedGiftCard = (customerData?.gift_cards || []).find(g => g.code === f.gift_card_code)
  const giftCardRedemption = f.use_gift_card ? Math.min(Number(selectedGiftCard?.remaining_paise || 0), Math.max(0, afterDiscount - membershipRedemption)) : 0
  const finalReceivable = Math.max(0, afterDiscount - membershipRedemption - giftCardRedemption)
  const visibleEvents = events.filter(e => {
    const term = tableSearch.trim().toLowerCase()
    if (!term) return true
    return [e.customer, e.customer_phone, e.service_name, e.therapist, e.booking?.physical_receipt_no].some(value => String(value || '').toLowerCase().includes(term))
  })

  const applyOffer = async () => {
    if (!f.offer_code.trim()) { setAppliedOffer(null); return toast.error('Enter a coupon or offer code') }
    if (!f.service_id) return toast.error('Select a duration and price first')
    const result = await apiPost('/offers/validate', { centre_id: centre.id, code: f.offer_code, service_id: f.service_id })
    if (result.error) { setAppliedOffer(null); return toast.error(result.error) }
    setAppliedOffer(result)
    toast.success(`${result.offer.name} applied`)
  }

  const submit = async () => {
    if (f.customer_phone.replace(/\D/g, '').length < 10) return toast.error('Enter a valid mobile number')
    if (!f.customer_name.trim()) return toast.error('Customer name is required')
    if (!selectedVariant) return toast.error('Select a treatment variant')
    if (!selectedTherapist) return toast.error('Select a therapist')
    if (!f.appointment_date || !f.appointment_time) return toast.error('Select appointment date and time')
    setSubmitting(true)
    const r = await apiPost('/appointments', {
      centre_id: centre.id, customer_phone:f.customer_phone, customer_name:f.customer_name, customer_email:f.customer_email,
      service_id:f.service_id, therapist_id:f.therapist_id, appointment_date:f.appointment_date, appointment_time:f.appointment_time,
      offer_code:appliedOffer ? f.offer_code : '', membership_code:f.use_membership?f.membership_code:'', membership_redemption_paise:membershipRedemption,
      gift_card_code:f.use_gift_card?f.gift_card_code:'', gift_card_redemption_paise:giftCardRedemption,
      payment_method:f.payment_method, physical_receipt_no:f.physical_receipt_no
    })
    setSubmitting(false)
    if (r.error) return toast.error(r.error)
    toast.success('Appointment confirmed and sale recorded')
    setOpen(false); setF(blankForm()); setCustomerData(null); setAppliedOffer(null); setTreatmentSearch('')
    bump(); load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold">Appointments &amp; Sales</h2><p className="text-sm text-muted-foreground">Customer-led appointment entry with one immutable financial event.</p></div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={()=>window.open(`/api/bookings/export?centre_id=${centre.id}&date=${todayStr()}`,'_blank')}><Download className="h-4 w-4 mr-2"/>Export</Button>
        {!isAllCentres && <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2"/>New Appointment</Button></DialogTrigger>
          <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New Appointment &amp; Sale Entry — {centre.name}</DialogTitle><DialogDescription>Mobile number finds the customer. Treatment pricing and financial entries are calculated automatically.</DialogDescription></DialogHeader>
            <div className="grid lg:grid-cols-[2fr_1fr] gap-5">
              <div className="space-y-4">
                <Card className="border-amber-500/40 bg-amber-500/5"><CardHeader className="py-3"><CardTitle className="text-sm">1. Customer</CardTitle></CardHeader><CardContent className="grid md:grid-cols-3 gap-3 pt-0">
                  <Field l="Mobile Number"><Input autoFocus inputMode="tel" value={f.customer_phone} onChange={e=>setF({...f,customer_phone:e.target.value})} placeholder="10-digit mobile"/></Field>
                  <Field l="Customer Name"><Input value={f.customer_name} onChange={e=>setF({...f,customer_name:e.target.value})}/></Field>
                  <Field l="Email (Optional)"><Input type="email" value={f.customer_email} onChange={e=>setF({...f,customer_email:e.target.value})}/></Field>
                  <div className="md:col-span-3 text-xs text-muted-foreground">{lookupLoading?'Looking up customer…':customerData?.found?'Existing customer loaded':'Enter a mobile number to find or create a customer'}</div>
                </CardContent></Card>

                {customerData?.found && <Card><CardHeader className="py-3"><CardTitle className="text-sm">Customer Intelligence</CardTitle></CardHeader><CardContent data-kpi-grid="true" className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-0">
                  <MiniStat label="Previous Visits" value={customerData.intelligence?.previous_visits || 0}/><MiniStat label="Last Visit" value={customerData.intelligence?.last_visit?new Date(customerData.intelligence.last_visit).toLocaleDateString('en-IN'):'—'}/>
                  <MiniStat label="Preferred Therapist" value={customerData.intelligence?.preferred_therapist || '—'}/><MiniStat label="Lifetime Spend" value={formatINR(customerData.intelligence?.lifetime_spend_paise)}/>
                  <MiniStat label="Membership Balance" value={formatINR(customerData.intelligence?.membership_balance_paise)}/><MiniStat label="Gift Card Balance" value={formatINR(customerData.intelligence?.gift_card_balance_paise)}/>
                </CardContent></Card>}

                <Card><CardHeader className="py-3"><CardTitle className="text-sm">2. Treatment &amp; Therapist</CardTitle></CardHeader><CardContent className="grid md:grid-cols-2 gap-3 pt-0">
                  <Field l="Search Treatment"><Input value={treatmentSearch} onChange={e=>setTreatmentSearch(e.target.value)} placeholder="Type treatment name"/></Field>
                  <Field l="Treatment"><Select value={f.treatment_name} onValueChange={v=>{setF({...f,treatment_name:v,service_id:''});setAppliedOffer(null)}}><SelectTrigger><SelectValue placeholder="Choose treatment"/></SelectTrigger><SelectContent>{treatments.map(name=><SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select></Field>
                  <Field l="Duration & Price"><Select value={f.service_id} onValueChange={v=>{setF({...f,service_id:v});setAppliedOffer(null)}}><SelectTrigger><SelectValue placeholder="Choose variant"/></SelectTrigger><SelectContent>{treatmentVariants.map(v=><SelectItem key={v.id} value={v.id}>{v.variant_name || `${v.duration} Minutes`} • {formatINR(v.price_paise)}</SelectItem>)}</SelectContent></Select></Field>
                  <Field l="Therapist"><Select value={f.therapist_id} onValueChange={v=>setF({...f,therapist_id:v})}><SelectTrigger><SelectValue placeholder="Choose therapist"/></SelectTrigger><SelectContent>{therapists.map(t=><SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></Field>
                </CardContent></Card>

                <Card><CardHeader className="py-3"><CardTitle className="text-sm">3. Appointment &amp; Offer</CardTitle></CardHeader><CardContent className="grid md:grid-cols-2 gap-3 pt-0">
                  <Field l="Appointment Date"><Input type="date" min={todayStr()} value={f.appointment_date} onChange={e=>setF({...f,appointment_date:e.target.value})}/></Field>
                  <Field l="Appointment Time"><Input type="time" step="900" value={f.appointment_time} onChange={e=>setF({...f,appointment_time:e.target.value})}/></Field>
                  <Field l="Coupon / Offer Code"><div className="flex gap-2"><Input value={f.offer_code} onChange={e=>{setF({...f,offer_code:e.target.value.toUpperCase()});setAppliedOffer(null)}}/><Button type="button" variant="outline" onClick={applyOffer}>Apply</Button></div></Field>
                  <Field l="Physical Receipt No. (Optional)"><Input value={f.physical_receipt_no} onChange={e=>setF({...f,physical_receipt_no:e.target.value})}/></Field>
                </CardContent></Card>

                {(customerData?.memberships?.length>0 || customerData?.gift_cards?.length>0) && <Card><CardHeader className="py-3"><CardTitle className="text-sm">4. Stored Value Redemption</CardTitle></CardHeader><CardContent className="grid md:grid-cols-2 gap-4 pt-0">
                  {customerData?.memberships?.length>0 && <div className="space-y-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.use_membership} onChange={e=>setF({...f,use_membership:e.target.checked})}/>Redeem Membership</label><Select value={f.membership_code} onValueChange={v=>setF({...f,membership_code:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{customerData.memberships.map(m=><SelectItem key={m.code} value={m.code}>{m.code} • {formatINR(m.remaining_paise)}</SelectItem>)}</SelectContent></Select></div>}
                  {customerData?.gift_cards?.length>0 && <div className="space-y-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.use_gift_card} onChange={e=>setF({...f,use_gift_card:e.target.checked})}/>Redeem Gift Card</label><Select value={f.gift_card_code} onValueChange={v=>setF({...f,gift_card_code:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{customerData.gift_cards.map(g=><SelectItem key={g.code} value={g.code}>{g.code} • {formatINR(g.remaining_paise)}</SelectItem>)}</SelectContent></Select></div>}
                </CardContent></Card>}

                {finalReceivable>0 && <Card><CardHeader className="py-3"><CardTitle className="text-sm">5. Payment</CardTitle></CardHeader><CardContent className="pt-0"><Field l="Payment Method"><Select value={f.payment_method} onValueChange={v=>setF({...f,payment_method:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{SALE_PAY_METHODS.map(x=><SelectItem key={x} value={x}>{x.replace('_',' ')}</SelectItem>)}</SelectContent></Select></Field></CardContent></Card>}
              </div>

              <Card className="h-fit border-amber-500/30 lg:sticky lg:top-0"><CardHeader><CardTitle>Booking Summary</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
                <Row k="Treatment" v={f.treatment_name || '—'}/><Row k="Variant" v={selectedVariant?.variant_name || (selectedVariant?`${selectedVariant.duration} Minutes`:'—')}/><Row k="Therapist" v={selectedTherapist?.name || '—'}/>
                <div className="border-t border-border/50 my-2"/><Row k="Base Price" v={formatINR(basePrice)}/><Row k="Offer Discount" v={`− ${formatINR(offerDiscount)}`}/><Row k="Membership Redemption" v={`− ${formatINR(membershipRedemption)}`}/><Row k="Gift Card Redemption" v={`− ${formatINR(giftCardRedemption)}`}/><div className="border-t border-border/50 my-2"/><Row k="Final Receivable" v={formatINR(finalReceivable)} bold/>
                {finalReceivable===0 && basePrice>0 && <Badge variant="secondary" className="w-full justify-center py-1">Fully covered by stored value</Badge>}
                <Button className="w-full mt-4" size="lg" onClick={submit} disabled={submitting}>{submitting?'Confirming…':'Confirm Appointment'}</Button>
              </CardContent></Card>
            </div>
          </DialogContent>
        </Dialog>}
        </div>
      </div>

      <Input value={tableSearch} onChange={e=>setTableSearch(e.target.value)} placeholder="Search customer, mobile, treatment, therapist, or receipt number…" className="max-w-xl"/>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Appointment</TableHead>{isAllCentres && <TableHead>Centre</TableHead>}<TableHead>Receipt</TableHead><TableHead>Customer</TableHead><TableHead>Treatment</TableHead><TableHead>Therapist</TableHead><TableHead>Pay</TableHead><TableHead className="text-right">Receivable</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {visibleEvents.length===0 && <TableRow><TableCell colSpan={isAllCentres?9:8} className="text-center text-muted-foreground py-6">No appointments today</TableCell></TableRow>}
            {visibleEvents.map(e=>(
              <TableRow key={e.id} className={`cursor-pointer hover:bg-muted/50 ${e.is_reversal||reversedIds.has(e.id)?'opacity-70':''}`} onClick={()=>onDrill({ type:'event', eventId:e.id })}>
                <TableCell className="text-xs">{e.booking?.appointment_date || e.business_date}<br/>{String(e.booking?.appointment_time || '').slice(0,5)}</TableCell>
                {isAllCentres && <TableCell className="text-xs">{centreName(e.centre_id)}</TableCell>}
                <TableCell className="font-mono text-xs">{e.booking?.physical_receipt_no || '—'}</TableCell>
                <TableCell>{e.customer}</TableCell><TableCell>{e.service_name}</TableCell><TableCell>{e.therapist}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{e.payment_method}</Badge>
                  {e.is_reversal && <Badge variant="destructive" className="ml-1 text-[10px]">REV</Badge>}
                  {reversedIds.has(e.id) && <Badge variant="outline" className="ml-1 text-[10px]">REVERSED</Badge>}
                </TableCell>
                <TableCell className="text-right font-medium">{formatINR(e.booking?.final_receivable_paise ?? e.amount)}</TableCell>
                <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground"/></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  )
}

// ============================================================================
// MEMBERSHIP / GIFT CARD / EXPENSE / CASH MOVEMENT (same as before, with drill)
// ============================================================================
function MembershipView({ centre, centres, role, bump, refreshTick, pendingAction, onActionConsumed }) {
  const [list, setList] = useState([])
  const [open, setOpen] = useState(false)
  const isAllCentres = centre?.id === 'ALL'
  const centreName = (id) => centres.find(c => c.id === id)?.name || id
  const [f, setF] = useState({ customer:'', phone:'', amount:'', payment_method:'CASH' })
  const load = async () => {
    const data = await apiGet(`/memberships?centre_id=${centre.id}`)
    setList(Array.isArray(data) ? data : [])
    if (!Array.isArray(data)) toast.error(data?.error || 'Unable to load memberships')
  }
  useEffect(()=>{load()},[centre?.id, refreshTick])
  useEffect(()=>{ if (!isAllCentres && pendingAction === 'membership') { setOpen(true); onActionConsumed?.() } },[pendingAction,isAllCentres,onActionConsumed])
  const submit = async () => {
    const value = toPaise(f.amount)
    const r = await apiPost('/events/membership', {
      centre_id: centre.id,
      buyer: f.customer.trim(),
      recipient: f.customer.trim(),
      customer_phone: f.phone.trim(),
      price_paise: value,
      value_paise: value,
      payment_method: f.payment_method,
      notes: f.phone ? `Phone: ${f.phone.trim()}` : '',
    })
    if (r.error) return toast.error(r.error)
    toast.success(`Membership ${r.membership.code} sold`); setOpen(false); setF({ customer:'', phone:'', amount:'', payment_method:'CASH' }); bump(); load()
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold">Memberships</h2><p className="text-sm text-muted-foreground">Sale = revenue + liability. Redemption = operational usage only.</p></div>
        {!isAllCentres && <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2"/>Sell Membership</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>Sell Membership — {centre.name}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <Field l="Customer"><Input value={f.customer} onChange={e=>setF({...f, customer:e.target.value})}/></Field>
              <Field l="Phone"><Input value={f.phone} onChange={e=>setF({...f, phone:e.target.value})}/></Field>
              <Field l="Amount (₹)"><Input type="number" value={f.amount} onChange={e=>setF({...f, amount:e.target.value})}/></Field>
              <Field l="Payment"><Select value={f.payment_method} onValueChange={v=>setF({...f, payment_method:v})}><SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>{SALE_PAY_METHODS.map(x=><SelectItem key={x} value={x}>{x.replace('_',' ')}</SelectItem>)}</SelectContent></Select></Field>
            </div>
            <DialogFooter><Button onClick={submit}>Sell</Button></DialogFooter>
          </DialogContent>
        </Dialog>}
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Code</TableHead>{isAllCentres && <TableHead>Centre</TableHead>}<TableHead>Customer</TableHead><TableHead>Sold At</TableHead><TableHead className="text-right">Initial</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Redemptions</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {list.length===0 && <TableRow><TableCell colSpan={isAllCentres?8:7} className="text-center text-muted-foreground py-6">No memberships</TableCell></TableRow>}
            {list.map(m=>(<TableRow key={m.code} className={m.reversed?'opacity-60':''}>
              <TableCell className="font-mono text-xs">{m.code}</TableCell>
              {isAllCentres && <TableCell className="text-xs">{centreName(m.sold_at_centre_id)}</TableCell>}
              <TableCell>{m.buyer || m.customer}</TableCell>
              <TableCell className="text-xs">{m.sold_at_date || m.sold_business_date}</TableCell>
              <TableCell className="text-right">{formatINR(liabilityInitialPaise(m))}</TableCell>
              <TableCell className="text-right font-medium">{formatINR(m.remaining_paise)}</TableCell>
              <TableCell>{m.redemption_count}</TableCell>
              <TableCell>{m.reversed ? <Badge variant="destructive">REVERSED</Badge> : <Badge variant="secondary">ACTIVE</Badge>}</TableCell>
            </TableRow>))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  )
}

function GiftCardView({ centre, centres, role, bump, refreshTick, pendingAction, onActionConsumed }) {
  const [list, setList] = useState([])
  const [open, setOpen] = useState(false)
  const isAllCentres = centre?.id === 'ALL'
  const centreName = (id) => centres.find(c => c.id === id)?.name || id
  const [f, setF] = useState({ customer:'', recipient:'', phone:'', amount:'', payment_method:'CASH' })
  const load = async () => {
    const data = await apiGet(`/gift-cards?centre_id=${centre.id}`)
    setList(Array.isArray(data) ? data : [])
    if (!Array.isArray(data)) toast.error(data?.error || 'Unable to load gift cards')
  }
  useEffect(()=>{load()},[centre?.id, refreshTick])
  useEffect(()=>{ if (!isAllCentres && pendingAction === 'gift-card') { setOpen(true); onActionConsumed?.() } },[pendingAction,isAllCentres,onActionConsumed])
  const submit = async () => {
    const value = toPaise(f.amount)
    const r = await apiPost('/events/gift-card', {
      centre_id: centre.id,
      buyer: f.customer.trim(),
      recipient: f.recipient.trim() || f.customer.trim(),
      customer_phone: f.phone.trim(),
      price_paise: value,
      value_paise: value,
      payment_method: f.payment_method,
    })
    if (r.error) return toast.error(r.error)
    toast.success(`Gift card ${r.gift_card.code} sold`); setOpen(false); setF({ customer:'', recipient:'', phone:'', amount:'', payment_method:'CASH' }); bump(); load()
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold">Gift Cards</h2><p className="text-sm text-muted-foreground">Selling centre keeps revenue. Redemption is operational only.</p></div>
        {!isAllCentres && <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2"/>Sell Gift Card</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>Sell Gift Card — {centre.name}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <Field l="Buyer"><Input value={f.customer} onChange={e=>setF({...f, customer:e.target.value})}/></Field>
              <Field l="Recipient"><Input value={f.recipient} onChange={e=>setF({...f, recipient:e.target.value})}/></Field>
              <Field l="Recipient Mobile"><Input inputMode="tel" value={f.phone} onChange={e=>setF({...f, phone:e.target.value})}/></Field>
              <Field l="Amount (₹)"><Input type="number" value={f.amount} onChange={e=>setF({...f, amount:e.target.value})}/></Field>
              <Field l="Payment"><Select value={f.payment_method} onValueChange={v=>setF({...f, payment_method:v})}><SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>{SALE_PAY_METHODS.map(x=><SelectItem key={x} value={x}>{x.replace('_',' ')}</SelectItem>)}</SelectContent></Select></Field>
            </div>
            <DialogFooter><Button onClick={submit}>Sell</Button></DialogFooter>
          </DialogContent>
        </Dialog>}
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Code</TableHead>{isAllCentres && <TableHead>Centre</TableHead>}<TableHead>Buyer</TableHead><TableHead>Recipient</TableHead><TableHead className="text-right">Initial</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {list.length===0 && <TableRow><TableCell colSpan={isAllCentres?7:6} className="text-center text-muted-foreground py-6">No gift cards</TableCell></TableRow>}
            {list.map(m=>(<TableRow key={m.code} className={m.reversed?'opacity-60':''}>
              <TableCell className="font-mono text-xs">{m.code}</TableCell>{isAllCentres && <TableCell className="text-xs">{centreName(m.sold_at_centre_id)}</TableCell>}<TableCell>{m.buyer}</TableCell><TableCell>{m.recipient}</TableCell>
              <TableCell className="text-right">{formatINR(liabilityInitialPaise(m))}</TableCell>
              <TableCell className="text-right font-medium">{formatINR(m.remaining_paise)}</TableCell>
              <TableCell>{m.reversed ? <Badge variant="destructive">REVERSED</Badge> : <Badge variant="secondary">ACTIVE</Badge>}</TableCell>
            </TableRow>))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  )
}

function ExpenseView({ centre, centres, role, bump, onDrill, refreshTick, pendingAction, onActionConsumed }) {
  const [events, setEvents] = useState([])
  const [open, setOpen] = useState(false)
  const isAllCentres = centre?.id === 'ALL'
  const centreName = (id) => centres.find(c => c.id === id)?.name || id
  const [f, setF] = useState({ amount:'', payment_method:'CASH', category:'Utilities', vendor:'', notes:'' })
  const load = async () => setEvents(await apiGet(`/events?centre_id=${centre.id}&date=${todayStr()}&type=EXPENSE`))
  useEffect(()=>{ if(centre?.id) load()},[centre?.id, refreshTick])
  useEffect(()=>{ if (!isAllCentres && pendingAction === 'expense') { setOpen(true); onActionConsumed?.() } },[pendingAction,isAllCentres,onActionConsumed])
  const reversedIds = useMemo(() => new Set(events.filter(x=>x.is_reversal && x.reverses).map(x=>x.reverses)), [events])
  const submit = async () => {
    const r = await apiPost('/events/expense', { ...f, centre_id: centre.id, created_by: role, role, amount: toPaise(f.amount) })
    if (r.error) return toast.error(r.error)
    toast.success('Expense recorded'); setOpen(false); setF({ amount:'', payment_method:'CASH', category:'Utilities', vendor:'', notes:'' }); bump(); load()
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold">Expenses</h2><p className="text-sm text-muted-foreground">Reduces cash or bank depending on payment method.</p></div>
        {!isAllCentres && <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2"/>Add Expense</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>New Expense — {centre.name}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <Field l="Amount (₹)"><Input type="number" value={f.amount} onChange={e=>setF({...f, amount:e.target.value})}/></Field>
              <Field l="Category"><Select value={f.category} onValueChange={v=>setF({...f, category:v})}><SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>{EXPENSE_CATEGORIES.map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></Field>
              <Field l="Payment"><Select value={f.payment_method} onValueChange={v=>setF({...f, payment_method:v})}><SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>{SALE_PAY_METHODS.map(x=><SelectItem key={x} value={x}>{x.replace('_',' ')}</SelectItem>)}</SelectContent></Select></Field>
              <Field l="Vendor"><Input value={f.vendor} onChange={e=>setF({...f, vendor:e.target.value})}/></Field>
            </div>
            <Field l="Notes"><Textarea value={f.notes} onChange={e=>setF({...f, notes:e.target.value})}/></Field>
            <DialogFooter><Button onClick={submit}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>}
      </div>
      <Card><CardContent className="p-0">
        <Table><TableHeader><TableRow><TableHead>Time</TableHead>{isAllCentres && <TableHead>Centre</TableHead>}<TableHead>Category</TableHead><TableHead>Vendor</TableHead><TableHead>Pay</TableHead><TableHead className="text-right">Amount</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {events.length===0 && <TableRow><TableCell colSpan={isAllCentres?7:6} className="text-center text-muted-foreground py-6">No expenses today</TableCell></TableRow>}
            {events.map(e=>(<TableRow key={e.id} className={`cursor-pointer hover:bg-muted/50 ${e.is_reversal||reversedIds.has(e.id)?'opacity-70':''}`} onClick={()=>onDrill({type:'event', eventId:e.id})}>
              <TableCell className="text-xs">{new Date(e.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</TableCell>
              {isAllCentres && <TableCell className="text-xs">{centreName(e.centre_id)}</TableCell>}
              <TableCell>{e.category}</TableCell><TableCell>{e.vendor}</TableCell>
              <TableCell><Badge variant="secondary">{e.payment_method}</Badge>{e.is_reversal && <Badge variant="destructive" className="ml-1 text-[10px]">REV</Badge>}{reversedIds.has(e.id) && <Badge variant="outline" className="ml-1 text-[10px]">REVERSED</Badge>}</TableCell>
              <TableCell className="text-right font-medium text-rose-500">{formatINR(e.amount)}</TableCell>
              <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground"/></TableCell>
            </TableRow>))}
          </TableBody></Table>
      </CardContent></Card>
    </div>
  )
}

function CashMovementView({ centre, centres, role, bump, onDrill, refreshTick }) {
  const [events, setEvents] = useState([])
  const [open, setOpen] = useState(false)
  const isAllCentres = centre?.id === 'ALL'
  const centreName = (id) => centres.find(c => c.id === id)?.name || id
  const [f, setF] = useState({ amount:'', movement_type:'BANK_DEPOSIT', counterparty_centre_id:'', notes:'' })
  const load = async () => setEvents(await apiGet(`/events?centre_id=${centre.id}&date=${todayStr()}&type=CASH_MOVEMENT`))
  useEffect(()=>{ if(centre?.id) load()},[centre?.id, refreshTick])
  const reversedIds = useMemo(() => new Set(events.filter(x=>x.is_reversal && x.reverses).map(x=>x.reverses)), [events])
  const submit = async () => {
    const r = await apiPost('/events/cash-movement', { ...f, centre_id: centre.id, created_by: role, role, amount: toPaise(f.amount) })
    if (r.error) return toast.error(r.error)
    toast.success('Cash movement recorded'); setOpen(false); setF({ amount:'', movement_type:'BANK_DEPOSIT', counterparty_centre_id:'', notes:'' }); bump(); load()
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold">Cash Movement</h2><p className="text-sm text-muted-foreground">Never revenue. Never expense. Only cash position.</p></div>
        {!isAllCentres && <Dialog open={open} onOpenChange={setOpen}>
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
        </Dialog>}
      </div>
      <Card><CardContent className="p-0">
        <Table><TableHeader><TableRow><TableHead>Time</TableHead>{isAllCentres && <TableHead>Centre</TableHead>}<TableHead>Type</TableHead><TableHead>Notes</TableHead><TableHead className="text-right">Amount</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {events.length===0 && <TableRow><TableCell colSpan={isAllCentres?6:5} className="text-center text-muted-foreground py-6">No cash movements today</TableCell></TableRow>}
            {events.map(e=>(<TableRow key={e.id} className={`cursor-pointer hover:bg-muted/50 ${e.is_reversal||reversedIds.has(e.id)?'opacity-70':''}`} onClick={()=>onDrill({type:'event', eventId:e.id})}>
              <TableCell className="text-xs">{new Date(e.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</TableCell>
              {isAllCentres && <TableCell className="text-xs">{centreName(e.centre_id)}</TableCell>}
              <TableCell><Badge>{e.movement_type.replace(/_/g,' ')}</Badge>{e.is_reversal && <Badge variant="destructive" className="ml-1 text-[10px]">REV</Badge>}{reversedIds.has(e.id) && <Badge variant="outline" className="ml-1 text-[10px]">REVERSED</Badge>}</TableCell>
              <TableCell className="text-xs">{e.notes}</TableCell>
              <TableCell className="text-right font-medium">{formatINR(e.amount)}</TableCell>
              <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground"/></TableCell>
            </TableRow>))}
          </TableBody></Table>
      </CardContent></Card>
    </div>
  )
}

// ============================================================================
// MASTER REGISTER (drill on every cell)
// ============================================================================
function RegisterView({ centre, onDrill, refreshTick }) {
  const [rows, setRows] = useState([])
  const [from, setFrom] = useState(() => { const d=new Date(Date.now() - 13*86400000); const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d); return `${parts.find(p=>p.type==='year').value}-${parts.find(p=>p.type==='month').value}-${parts.find(p=>p.type==='day').value}` })
  const [to, setTo] = useState(todayStr())
  const load = useCallback(async () => {
    const r = await apiGet(`/master-register?centre_id=${centre?.id||'ALL'}&from=${from}&to=${to}`)
    setRows(r.rows || [])
  }, [centre?.id, from, to])
  useEffect(() => { load() }, [load, refreshTick])
  const drill = (metric, date) => onDrill({ type:'metric', metric, centre_id: centre.id, date })

  const totals = useMemo(() => {
    let booking_sales = 0, membership_sales = 0, gift_card_sales = 0, cash_sales = 0, upi_sales = 0, card_sales = 0, total_expenses = 0, cash_deposited = 0, cash_withdrawn = 0, guests = 0
    rows.forEach(r => {
      booking_sales += (r.booking_sales || 0)
      membership_sales += (r.membership_sales || 0)
      gift_card_sales += (r.gift_card_sales || 0)
      cash_sales += (r.cash_sales || 0)
      upi_sales += ((r.upi_1_sales || 0) + (r.upi_2_sales || 0))
      card_sales += (r.card_sales || 0)
      total_expenses += (r.total_expenses || 0)
      cash_deposited += (r.cash_deposited || 0)
      cash_withdrawn += (r.cash_withdrawn || 0)
      guests += (r.guests || 0)
    })
    return { booking_sales, membership_sales, gift_card_sales, cash_sales, upi_sales, card_sales, total_expenses, cash_deposited, cash_withdrawn, guests }
  }, [rows])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold">Master Register</h2><p className="text-sm text-muted-foreground">Excel-like daily aggregate. Every cell is clickable — drills to source events.</p></div>
        <div className="flex items-center gap-2">
          <Input aria-label="Register start date" type="date" value={from} onChange={e=>setFrom(e.target.value)} className="w-[150px]"/>
          <span aria-hidden="true">—</span><Input aria-label="Register end date" type="date" value={to} onChange={e=>setTo(e.target.value)} className="w-[150px]"/>
          <Button variant="outline" size="icon" aria-label="Refresh register" onClick={load} title="Refresh"><RefreshCw className="h-4 w-4"/></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="default" className="gap-2 font-medium">
                <Download className="h-4 w-4" />
                <span>Export</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              <DropdownMenuItem onClick={() => exportRegisterExcel({ centre, from, to, rows })} className="cursor-pointer gap-2 py-2">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                <div className="flex flex-col">
                  <span className="font-medium">Excel Sheet</span>
                  <span className="text-[11px] text-muted-foreground">Download as .xlsx</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportRegisterPDF({ centre, from, to, rows })} className="cursor-pointer gap-2 py-2">
                <FileText className="h-4 w-4 text-rose-600" />
                <div className="flex flex-col">
                  <span className="font-medium">PDF Document</span>
                  <span className="text-[11px] text-muted-foreground">Download as .pdf</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
            <TableHead className="text-right">Closing Balance</TableHead>
            <TableHead className="text-right">Guests</TableHead><TableHead>Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length===0 && <TableRow><TableCell colSpan={14} className="text-center text-muted-foreground py-6">No data in range</TableCell></TableRow>}
            {rows.map(r=>{
              const Cell = (metric, value, cls='') => <TableCell className={`text-right cursor-pointer hover:bg-muted ${cls}`} onClick={()=>drill(metric, r.business_date)}>{value}</TableCell>
              return (<TableRow key={r.business_date}>
                <TableCell className="font-medium">{r.business_date}</TableCell>
                <TableCell className="text-right">{formatINR(r.opening_cash)}</TableCell>
                {Cell('booking_sales', formatINR(r.booking_sales))}
                {Cell('membership_sales', formatINR(r.membership_sales))}
                {Cell('gift_card_sales', formatINR(r.gift_card_sales))}
                {Cell('cash_sales', formatINR(r.cash_sales))}
                {Cell('upi_1_sales', formatINR((r.upi_1_sales||0)+(r.upi_2_sales||0)))}
                {Cell('card_sales', formatINR(r.card_sales))}
                {Cell('total_expenses', formatINR(r.total_expenses), 'text-rose-500')}
                {Cell('cash_deposited', formatINR(r.cash_deposited))}
                {Cell('cash_withdrawn', formatINR(r.cash_withdrawn))}
                <TableCell className="text-right font-semibold" title={r.status === 'CLOSED' ? `Expected: ${formatINR(r.closing_cash_expected)} · Variance: ${formatINR(r.cash_variance)}` : 'Live expected balance until the day is closed'}>
                  {formatINR(r.closing_cash_balance)}
                </TableCell>
                {Cell('guests', r.guests)}
                <TableCell><Badge variant={r.status==='CLOSED'?'default':'secondary'}>{r.status}</Badge></TableCell>
              </TableRow>)
            })}
            {rows.length > 0 && (
              <TableRow className="bg-muted/50 font-bold border-t-2">
                <TableCell className="font-bold">TOTAL</TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="text-right">{formatINR(totals.booking_sales)}</TableCell>
                <TableCell className="text-right">{formatINR(totals.membership_sales)}</TableCell>
                <TableCell className="text-right">{formatINR(totals.gift_card_sales)}</TableCell>
                <TableCell className="text-right">{formatINR(totals.cash_sales)}</TableCell>
                <TableCell className="text-right">{formatINR(totals.upi_sales)}</TableCell>
                <TableCell className="text-right">{formatINR(totals.card_sales)}</TableCell>
                <TableCell className="text-right text-rose-500">{formatINR(totals.total_expenses)}</TableCell>
                <TableCell className="text-right">{formatINR(totals.cash_deposited)}</TableCell>
                <TableCell className="text-right">{formatINR(totals.cash_withdrawn)}</TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="text-right">{totals.guests}</TableCell>
                <TableCell></TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  )
}

// ============================================================================
// CASH BOOK (each line drillable to event)
// ============================================================================
function CashBookView({ centre, onDrill, refreshTick }) {
  const [data, setData] = useState(null)
  const [date, setDate] = useState(todayStr())
  const load = useCallback(async () => {
    if (centre?.id === 'ALL') { setData(null); return }
    setData(await apiGet(`/cash-book?centre_id=${centre.id}&date=${date}`))
  }, [centre?.id, date])
  useEffect(()=>{ if(centre?.id) load()}, [load, refreshTick])
  const lines = data?.lines || []
  const agg = data?.agg || {}
  if (centre?.id === 'ALL') return <CollectiveScopeNotice feature="Cash Book" />
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold">Cash Book</h2><p className="text-sm text-muted-foreground">Cash-only ledger with running balance. Click any line to inspect the source event.</p></div>
        <div className="flex items-center gap-2"><Input aria-label="Cash book date" type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-[160px]"/><Button variant="outline" size="icon" aria-label="Refresh cash book" onClick={load}><RefreshCw className="h-4 w-4"/></Button></div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Opening Cash" value={formatINR(agg.opening_cash)}/>
        <Stat label="Cash In" value={formatINR((agg.cash_sales||0)+(agg.cash_transfer_in||0)+(agg.float_added||0)+(agg.other_cash_in||0))} accent="text-emerald-500"/>
        <Stat label="Expected Closing" value={formatINR(agg.closing_cash_expected)} accent="font-semibold"/>
      </div>
      <Card><CardContent className="p-0">
        <Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Ref</TableHead><TableHead>Description</TableHead><TableHead className="text-right">In</TableHead><TableHead className="text-right">Out</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
          <TableBody>
            {lines.map((l,i)=>(<TableRow key={i} className={`${l.event_id?'cursor-pointer hover:bg-muted/50':''} ${l.is_reversal?'opacity-70':''}`} onClick={()=>l.event_id && onDrill({type:'event', eventId:l.event_id})}>
              <TableCell className="text-xs">{l.time?new Date(l.time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'—'}</TableCell>
              <TableCell className="text-xs"><Badge variant="outline">{l.ref}</Badge>{l.is_reversal && <Badge variant="destructive" className="ml-1 text-[10px]">REV</Badge>}</TableCell>
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

// ============================================================================
// BUSINESS DAY CLOSE (with drill on every metric)
// ============================================================================
function CloseView({ centre, role, bump, onDrill, refreshTick }) {
  const [bd, setBd] = useState(null)
  const [dash, setDash] = useState(null)
  const [declared, setDeclared] = useState('')
  const [notes, setNotes] = useState('')
  const [openingInput, setOpeningInput] = useState('')
  const [date, setDate] = useState(todayStr())
  const load = useCallback(async () => {
    if (centre?.id === 'ALL') { setBd(null); setDash(null); return }
    const b = await apiGet(`/business-day?centre_id=${centre.id}&date=${date}`)
    setBd(b); setOpeningInput(((b?.opening_cash||0)/100).toString())
    setDash(await apiGet(`/dashboard?centre_id=${centre.id}&date=${date}`))
  }, [centre?.id, date])
  useEffect(()=>{ if(centre?.id) load() }, [load, refreshTick])
  const setOpening = async () => {
    await apiPost('/business-day/set-opening', { centre_id: centre.id, business_date: date, opening_cash: toPaise(openingInput) })
    toast.success('Opening cash set'); load(); bump()
  }
  const close = async () => {
    const r = await apiPost('/business-day/close', { centre_id: centre.id, business_date: date, actor: role, role, closing_cash_declared: toPaise(declared), notes })
    if (r.error) return toast.error(r.error)
    toast.success(`Day closed. Variance: ${formatINR(r.variance)}`); load(); bump()
  }
  const reopen = async () => {
    const reason = prompt('Reason for reopening?')
    if (!reason) return
    const r = await apiPost('/business-day/reopen', { centre_id: centre.id, business_date: date, actor: role, role, reason })
    if (r.error) return toast.error(r.error)
    toast.success('Day reopened'); load(); bump()
  }
  const agg = dash?.agg || dash?.single_centre?.agg || dash?.consolidated || {}
  const drill = (metric) => onDrill({ type:'metric', metric, centre_id: centre.id, date })
  if (centre?.id === 'ALL') return <CollectiveScopeNotice feature="Business Day closing" />
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Business Day — {centre.name}</h2>
        <div className="flex items-center gap-2">
          <Input aria-label="Business date" type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-[160px]" />
          <Button variant="outline" size="icon" aria-label="Refresh business day" onClick={load}><RefreshCw className="h-4 w-4"/></Button>
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Stat label="Status" value={<Badge variant={bd?.status==='CLOSED'?'default':'secondary'}>{bd?.status||'—'}</Badge>}/>
        <Stat label="Opening Cash" value={formatINR(bd?.opening_cash)}/>
        <Stat label="Expected Closing" value={formatINR(agg.closing_cash_expected)} accent="font-semibold" onClick={()=>drill('closing_cash_expected')}/>
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
            <Row k="+ Cash Sales" v={formatINR(agg.cash_sales)} onClick={()=>drill('cash_sales')}/>
            <Row k="+ Transfer In" v={formatINR(agg.cash_transfer_in)} onClick={()=>drill('cash_transfer_in')}/>
            <Row k="+ Float Added" v={formatINR(agg.float_added)} onClick={()=>drill('float_added')}/>
            <Row k="+ Cash Received" v={formatINR(agg.other_cash_in)} onClick={()=>drill('other_cash_in')}/>
            <Row k="− Cash Expenses" v={formatINR(agg.cash_expenses)} onClick={()=>drill('cash_expenses')}/>
            <Row k="− Deposits" v={formatINR(agg.cash_deposited)} onClick={()=>drill('cash_deposited')}/>
            <Row k="− Withdrawals" v={formatINR(agg.cash_withdrawn)} onClick={()=>drill('cash_withdrawn')}/>
            <Row k="− Transfer Out" v={formatINR(agg.cash_transfer_out)} onClick={()=>drill('cash_transfer_out')}/>
            <Row k="− Cash Handed Over" v={formatINR(agg.other_cash_out)} onClick={()=>drill('other_cash_out')}/>
            <div className="border-t border-border/50 col-span-2"></div>
            <Row k="Expected Closing Cash" v={formatINR(agg.closing_cash_expected)} bold onClick={()=>drill('closing_cash_expected')}/>
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

// ============================================================================
// AUDIT LOG (with links to events)
// ============================================================================
function AuditView({ centre, centres, onDrill, refreshTick }) {
  const [log, setLog] = useState([])
  const isAllCentres = centre?.id === 'ALL'
  const centreName = (id) => centres.find(c => c.id === id)?.name || id || 'System'
  useEffect(()=>{ apiGet(`/audit-log?centre_id=${centre.id}`).then(data => setLog(Array.isArray(data) ? data : [])) },[centre?.id, refreshTick])
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Audit Log</h2>
      <p className="text-sm text-muted-foreground">Immutable history. Click any row with an event to open its detail.</p>
      <Card><CardContent className="p-0">
        <Table><TableHeader><TableRow><TableHead>Time</TableHead>{isAllCentres && <TableHead>Centre</TableHead>}<TableHead>Action</TableHead><TableHead>Actor</TableHead><TableHead>Role</TableHead><TableHead>Details</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {log.length===0 && <TableRow><TableCell colSpan={isAllCentres?7:6} className="text-center text-muted-foreground py-6">No audit entries yet</TableCell></TableRow>}
            {log.map(l=>(<TableRow key={l.id} className={l.target_event_id?'cursor-pointer hover:bg-muted/50':''} onClick={()=>l.target_event_id && onDrill({type:'event', eventId:l.target_event_id})}>
              <TableCell className="text-xs">{new Date(l.created_at).toLocaleString('en-IN')}</TableCell>
              {isAllCentres && <TableCell className="text-xs">{centreName(l.centre_id)}</TableCell>}
              <TableCell><Badge variant={l.action==='REVERSE_EVENT'?'destructive':'default'}>{l.action}</Badge></TableCell>
              <TableCell>{l.actor}</TableCell><TableCell>{l.role}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{l.reason || JSON.stringify(l.new_value||{})}</TableCell>
              <TableCell>{l.target_event_id && <ChevronRight className="h-4 w-4 text-muted-foreground"/>}</TableCell>
            </TableRow>))}
          </TableBody></Table>
      </CardContent></Card>
    </div>
  )
}

// ============================================================================
// REPORTS (P&L + Cash Report + CSV export)
// ============================================================================
function ReportsView({ centre, centres, onDrill, refreshTick, role }) {
  const [group, setGroup] = useState('month')
  const [from, setFrom] = useState(() => { const d=new Date(); d.setMonth(d.getMonth()-2); d.setDate(1); const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d); return `${parts.find(p=>p.type==='year').value}-${parts.find(p=>p.type==='month').value}-${parts.find(p=>p.type==='day').value}` })
  const [to, setTo] = useState(todayStr())
  const [centreFilter, setCentreFilter] = useState('CURRENT') // CURRENT|ALL
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { setCentreFilter(centre?.id === 'ALL' ? 'ALL' : 'CURRENT') }, [centre?.id])
  const centreId = centre?.id === 'ALL' || centreFilter === 'ALL' ? 'ALL' : centre.id
  const allSelected = centreId === 'ALL'
  const load = useCallback(async () => {
    setLoading(true)
    const r = await apiGet(`/reports/pl?centre_id=${centreId}&from=${from}&to=${to}&group=${group}`)
    setData(r); setLoading(false)
  }, [centreId, from, to, group])
  useEffect(() => { load() }, [load, refreshTick])

  const downloadCsv = () => {
    const url = `/api/reports/csv?centre_id=${centreId}&from=${from}&to=${to}&group=${group}`
    window.open(url, '_blank')
  }
  const drill = (metric, period) => {
    // Compute date range from period label
    let dFrom = from, dTo = to
    if (group === 'day') { dFrom = period; dTo = period }
    else if (group === 'month') { dFrom = period + '-01'; const [y,m] = period.split('-'); const last = new Date(Number(y), Number(m), 0); dTo = `${y}-${m}-${String(last.getDate()).padStart(2,'0')}` }
    else if (group === 'year') { dFrom = `${period}-01-01`; dTo = `${period}-12-31` }
    else if (group === 'week') { dFrom = from; dTo = to } // approximate
    onDrill({ type:'metric', metric, centre_id: centreId, from: dFrom, to: dTo })
  }

  const totals = data?.totals?.consolidated || {}
  const perCentre = data?.totals?.per_centre || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-semibold">Reports</h2>
          <p className="text-sm text-muted-foreground">P&amp;L and Cash Reports computed by the same event engine as Dashboard / Master Register / Cash Book. Every ₹ drills down to source events.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={group} onValueChange={setGroup}>
            <SelectTrigger className="w-[130px]"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Daily</SelectItem>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
              <SelectItem value="year">Yearly</SelectItem>
            </SelectContent>
          </Select>
          <Select value={allSelected?'ALL':centreFilter} onValueChange={setCentreFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue/></SelectTrigger>
            <SelectContent>
              {centre?.id !== 'ALL' && <SelectItem value="CURRENT">{centre.name} only</SelectItem>}
              {role === 'SUPER' && <SelectItem value="ALL">All Centres (consolidated)</SelectItem>}
            </SelectContent>
          </Select>
          <Input aria-label="Report start date" type="date" value={from} onChange={e=>setFrom(e.target.value)} className="w-[150px]"/>
          <span>—</span>
          <Input aria-label="Report end date" type="date" value={to} onChange={e=>setTo(e.target.value)} className="w-[150px]"/>
          <Button variant="outline" size="icon" aria-label="Refresh reports" onClick={load}><RefreshCw className="h-4 w-4"/></Button>
          <Button onClick={downloadCsv}><FileText className="h-4 w-4 mr-2"/>Export CSV</Button>
        </div>
      </div>

      {/* Grand totals — P&L card */}
      <Card>
        <CardHeader><CardTitle className="text-sm text-muted-foreground">Profit &amp; Loss ({from} → {to})</CardTitle></CardHeader>
        <CardContent>
          <div data-kpi-grid="true" className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStat label="Gross Revenue" value={formatINR(totals.gross_revenue)} accent="text-emerald-500"/>
            <MiniStat label="Revenue Reversals" value={formatINR(totals.revenue_reversals)} accent="text-rose-500"/>
            <MiniStat label="Net Revenue" value={formatINR(totals.net_revenue)} accent="font-semibold"/>
            <MiniStat label="Net Profit" value={formatINR(totals.net_profit)} accent={(totals.net_profit||0)>=0?'text-emerald-500 font-semibold':'text-rose-500 font-semibold'}/>
            <MiniStat label="Gross Expenses" value={formatINR(totals.gross_expenses)} accent="text-rose-500"/>
            <MiniStat label="Expense Reversals" value={formatINR(totals.expense_reversals)} accent="text-emerald-500"/>
            <MiniStat label="Net Expenses" value={formatINR(totals.net_expenses)} accent="font-semibold"/>
            <MiniStat label="Wages" value={formatINR(totals.wages_expenses)}/>
          </div>
        </CardContent>
      </Card>

      {/* Payment breakdown */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Revenue by Payment Method</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <Row k="Cash Sales" v={formatINR(totals.cash_sales)} onClick={()=>drill('cash_sales', null)}/>
            <Row k="UPI 1 Sales" v={formatINR(totals.upi_1_sales)} onClick={()=>drill('upi_1_sales', null)}/>
            <Row k="UPI 2 Sales" v={formatINR(totals.upi_2_sales)} onClick={()=>drill('upi_2_sales', null)}/>
            <Row k="Card Sales" v={formatINR(totals.card_sales)} onClick={()=>drill('card_sales', null)}/>
            <div className="border-t border-border/50 my-1"/>
            <Row k="Membership Redemption (op)" v={formatINR(totals.membership_redemption_value)} onClick={()=>drill('membership_redemption_value', null)}/>
            <Row k="Gift Card Redemption (op)" v={formatINR(totals.gift_card_redemption_value)} onClick={()=>drill('gift_card_redemption_value', null)}/>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Expenses by Method + Category</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <Row k="Cash Expenses" v={formatINR(totals.cash_expenses)} onClick={()=>drill('cash_expenses', null)}/>
            <Row k="UPI 1 Expenses" v={formatINR(totals.upi_1_expenses)} onClick={()=>drill('upi_1_expenses', null)}/>
            <Row k="UPI 2 Expenses" v={formatINR(totals.upi_2_expenses)} onClick={()=>drill('upi_2_expenses', null)}/>
            <Row k="Card Expenses" v={formatINR(totals.card_expenses)} onClick={()=>drill('card_expenses', null)}/>
            <div className="border-t border-border/50 my-1"/>
            <Row k="Wages" v={formatINR(totals.wages_expenses)} onClick={()=>drill('wages_expenses', null)}/>
          </CardContent>
        </Card>
      </div>

      {/* Cash Report */}
      <Card>
        <CardHeader><CardTitle className="text-sm text-muted-foreground">Cash Report (period totals)</CardTitle></CardHeader>
        <CardContent>
          <div data-kpi-grid="true" className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <MiniStat label="Opening Cash" value={formatINR(totals.opening_cash)}/>
            <MiniStat label="Cash Sales" value={formatINR(totals.cash_sales)} accent="text-emerald-500"/>
            <MiniStat label="Float Added" value={formatINR(totals.float_added)}/>
            <MiniStat label="Transfer In" value={formatINR(totals.cash_transfer_in)}/>
            <MiniStat label="Cash Expenses" value={formatINR(totals.cash_expenses)} accent="text-rose-500"/>
            <MiniStat label="Bank Deposits" value={formatINR(totals.cash_deposited)} accent="text-rose-500"/>
            <MiniStat label="Owner Withdrawals" value={formatINR(totals.cash_withdrawn)} accent="text-rose-500"/>
            <MiniStat label="Transfer Out" value={formatINR(totals.cash_transfer_out)} accent="text-rose-500"/>
            <MiniStat label="Expected Closing Cash" value={formatINR(totals.closing_cash_expected)} accent="font-semibold col-span-2"/>
          </div>
        </CardContent>
      </Card>

      {/* Per-centre breakdown (only when ALL selected) */}
      {allSelected && perCentre.length > 0 && (
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Per-Centre Totals</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Centre</TableHead>
                <TableHead className="text-right">Gross Rev</TableHead>
                <TableHead className="text-right">Net Rev</TableHead>
                <TableHead className="text-right">Cash</TableHead>
                <TableHead className="text-right">UPI 1</TableHead>
                <TableHead className="text-right">UPI 2</TableHead>
                <TableHead className="text-right">Card</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Net Profit</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {perCentre.map(c => (
                  <TableRow key={c.centre_id}>
                    <TableCell className="font-medium">{c.centre_name}</TableCell>
                    <TableCell className="text-right">{formatINR(c.gross_revenue)}</TableCell>
                    <TableCell className="text-right">{formatINR(c.net_revenue)}</TableCell>
                    <TableCell className="text-right">{formatINR(c.cash_sales)}</TableCell>
                    <TableCell className="text-right">{formatINR(c.upi_1_sales)}</TableCell>
                    <TableCell className="text-right">{formatINR(c.upi_2_sales)}</TableCell>
                    <TableCell className="text-right">{formatINR(c.card_sales)}</TableCell>
                    <TableCell className="text-right text-rose-500">{formatINR(c.net_expenses)}</TableCell>
                    <TableCell className={`text-right font-semibold ${(c.net_profit||0)>=0?'text-emerald-500':'text-rose-500'}`}>{formatINR(c.net_profit)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell>Consolidated</TableCell>
                  <TableCell className="text-right">{formatINR(totals.gross_revenue)}</TableCell>
                  <TableCell className="text-right">{formatINR(totals.net_revenue)}</TableCell>
                  <TableCell className="text-right">{formatINR(totals.cash_sales)}</TableCell>
                  <TableCell className="text-right">{formatINR(totals.upi_1_sales)}</TableCell>
                  <TableCell className="text-right">{formatINR(totals.upi_2_sales)}</TableCell>
                  <TableCell className="text-right">{formatINR(totals.card_sales)}</TableCell>
                  <TableCell className="text-right text-rose-500">{formatINR(totals.net_expenses)}</TableCell>
                  <TableCell className={`text-right ${(totals.net_profit||0)>=0?'text-emerald-500':'text-rose-500'}`}>{formatINR(totals.net_profit)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Period rows */}
      <Card>
        <CardHeader><CardTitle className="text-sm text-muted-foreground">Period Breakdown ({group})</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Period</TableHead>
              {allSelected && <TableHead>Centre</TableHead>}
              <TableHead className="text-right">Gross Rev</TableHead>
              <TableHead className="text-right">Reversals</TableHead>
              <TableHead className="text-right">Net Rev</TableHead>
              <TableHead className="text-right">Cash</TableHead>
              <TableHead className="text-right">UPI 1</TableHead>
              <TableHead className="text-right">UPI 2</TableHead>
              <TableHead className="text-right">Card</TableHead>
              <TableHead className="text-right">Expenses</TableHead>
              <TableHead className="text-right">Net Profit</TableHead>
              <TableHead className="text-right">Guests</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(data?.rows || []).flatMap(row => {
                if (allSelected) {
                  const lines = row.per_centre.map(c => (
                    <TableRow key={row.period + '-' + c.centre_id}>
                      <TableCell className="text-xs">{row.period}</TableCell>
                      <TableCell className="text-sm">{c.centre_name}</TableCell>
                      <TableCell className="text-right">{formatINR(c.gross_revenue)}</TableCell>
                      <TableCell className="text-right text-rose-500">{formatINR(c.revenue_reversals)}</TableCell>
                      <TableCell className="text-right cursor-pointer hover:bg-muted" onClick={()=>drill('total_revenue', row.period)}>{formatINR(c.net_revenue)}</TableCell>
                      <TableCell className="text-right cursor-pointer hover:bg-muted" onClick={()=>drill('cash_sales', row.period)}>{formatINR(c.cash_sales)}</TableCell>
                      <TableCell className="text-right cursor-pointer hover:bg-muted" onClick={()=>drill('upi_1_sales', row.period)}>{formatINR(c.upi_1_sales)}</TableCell>
                      <TableCell className="text-right cursor-pointer hover:bg-muted" onClick={()=>drill('upi_2_sales', row.period)}>{formatINR(c.upi_2_sales)}</TableCell>
                      <TableCell className="text-right cursor-pointer hover:bg-muted" onClick={()=>drill('card_sales', row.period)}>{formatINR(c.card_sales)}</TableCell>
                      <TableCell className="text-right text-rose-500 cursor-pointer hover:bg-muted" onClick={()=>drill('total_expenses', row.period)}>{formatINR(c.net_expenses)}</TableCell>
                      <TableCell className={`text-right ${(c.net_profit||0)>=0?'text-emerald-500':'text-rose-500'}`}>{formatINR(c.net_profit)}</TableCell>
                      <TableCell className="text-right">{c.guests}</TableCell>
                    </TableRow>
                  ))
                  const cons = row.consolidated
                  lines.push(
                    <TableRow key={row.period + '-consolidated'} className="bg-muted/40 font-semibold">
                      <TableCell className="text-xs">{row.period}</TableCell>
                      <TableCell className="text-sm">Consolidated</TableCell>
                      <TableCell className="text-right">{formatINR(cons.gross_revenue)}</TableCell>
                      <TableCell className="text-right">{formatINR(cons.revenue_reversals)}</TableCell>
                      <TableCell className="text-right">{formatINR(cons.net_revenue)}</TableCell>
                      <TableCell className="text-right">{formatINR(cons.cash_sales)}</TableCell>
                      <TableCell className="text-right">{formatINR(cons.upi_1_sales)}</TableCell>
                      <TableCell className="text-right">{formatINR(cons.upi_2_sales)}</TableCell>
                      <TableCell className="text-right">{formatINR(cons.card_sales)}</TableCell>
                      <TableCell className="text-right text-rose-500">{formatINR(cons.net_expenses)}</TableCell>
                      <TableCell className={`text-right ${(cons.net_profit||0)>=0?'text-emerald-500':'text-rose-500'}`}>{formatINR(cons.net_profit)}</TableCell>
                      <TableCell className="text-right">{cons.guests}</TableCell>
                    </TableRow>
                  )
                  return lines
                } else {
                  const c = row.consolidated
                  return [(
                    <TableRow key={row.period}>
                      <TableCell className="text-xs">{row.period}</TableCell>
                      <TableCell className="text-right">{formatINR(c.gross_revenue)}</TableCell>
                      <TableCell className="text-right text-rose-500">{formatINR(c.revenue_reversals)}</TableCell>
                      <TableCell className="text-right cursor-pointer hover:bg-muted" onClick={()=>drill('total_revenue', row.period)}>{formatINR(c.net_revenue)}</TableCell>
                      <TableCell className="text-right cursor-pointer hover:bg-muted" onClick={()=>drill('cash_sales', row.period)}>{formatINR(c.cash_sales)}</TableCell>
                      <TableCell className="text-right cursor-pointer hover:bg-muted" onClick={()=>drill('upi_1_sales', row.period)}>{formatINR(c.upi_1_sales)}</TableCell>
                      <TableCell className="text-right cursor-pointer hover:bg-muted" onClick={()=>drill('upi_2_sales', row.period)}>{formatINR(c.upi_2_sales)}</TableCell>
                      <TableCell className="text-right cursor-pointer hover:bg-muted" onClick={()=>drill('card_sales', row.period)}>{formatINR(c.card_sales)}</TableCell>
                      <TableCell className="text-right text-rose-500 cursor-pointer hover:bg-muted" onClick={()=>drill('total_expenses', row.period)}>{formatINR(c.net_expenses)}</TableCell>
                      <TableCell className={`text-right ${(c.net_profit||0)>=0?'text-emerald-500':'text-rose-500'}`}>{formatINR(c.net_profit)}</TableCell>
                      <TableCell className="text-right">{c.guests}</TableCell>
                    </TableRow>
                  )]
                }
              })}
              {(!data?.rows || data.rows.length === 0) && (
                <TableRow><TableCell colSpan={allSelected?12:11} className="text-center text-muted-foreground py-6">No data in range</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {loading && <div className="text-xs text-muted-foreground">Loading...</div>}
    </div>
  )
}

// ============================================================================
// LOGIN SCREEN & USER MANAGEMENT VIEW
// ============================================================================
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError(null)
    const res = await apiPost('/auth/login', { email, password })
    setLoading(false)
    if (res.error) {
      setError(res.error)
      toast.error('Login failed: ' + res.error)
    } else {
      toast.success('Welcome back, ' + (res.profile?.full_name || email))
      onLogin(res)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-card to-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-border/60 shadow-2xl bg-card/80 backdrop-blur-md">
        <CardHeader className="space-y-3 text-center pb-6 border-b border-border/40">
          <div className="mx-auto h-14 w-14 rounded-2xl overflow-hidden shadow-lg shadow-amber-500/20">
            <img src="/logo.png" alt="Moroccan Spa" className="h-full w-full object-cover" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold tracking-tight bg-gradient-to-r from-amber-200 via-amber-400 to-rose-400 bg-clip-text text-transparent">
              Moroccan Spa
            </CardTitle>
            <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
              Multi-Centre Single Source of Truth
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@moroccanspa.in or phoenix@moroccanspa.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-background/60 border-border/60 focus:border-amber-500 h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-background/60 border-border/60 focus:border-amber-500 h-11"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full h-11 font-semibold bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 text-white shadow-lg shadow-amber-500/20 mt-2">
              {loading ? 'Authenticating...' : 'Sign In to Business OS'}
            </Button>
          </form>
          <div className="mt-6 text-center text-[11px] text-muted-foreground border-t border-border/40 pt-4">
            Database-level RLS &amp; strict centre isolation enforced
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function UsersView({ centres, currentUserId, bump, refreshTick }) {
  const [users, setUsers] = useState([])
  const [f, setF] = useState({ email: '', password: '', full_name: '', role: 'CENTRE_USER', centre_id: '' })
  const [open, setOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    apiGet('/users').then(data => { if (Array.isArray(data)) setUsers(data) })
  }, [refreshTick])

  const create = async () => {
    if (!f.email || !f.full_name) { toast.error('Email and Full Name required'); return }
    if (!f.password || f.password.length < 8) { toast.error('Secure temporary password (min 8 chars) required'); return }
    if (f.role === 'CENTRE_USER' && !f.centre_id) { toast.error('Centre selection required for Centre Users'); return }
    const r = await apiPost('/users', f)
    if (r.error) { toast.error(r.error); return }
    toast.success('User created successfully')
    setOpen(false)
    setF({ email: '', password: '', full_name: '', role: 'CENTRE_USER', centre_id: '' })
    bump()
  }

  const remove = async () => {
    if (!deleteTarget || deleteTarget.id === currentUserId) return
    setDeleting(true)
    const r = await apiDelete(`/users/${deleteTarget.id}`)
    setDeleting(false)
    if (r.error) return toast.error(r.error)
    toast.success(`${deleteTarget.full_name || deleteTarget.email} removed completely`)
    setDeleteTarget(null)
    bump()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">User &amp; RBAC Management</h2>
          <p className="text-sm text-muted-foreground">Manage Supabase Auth profiles, Super Admin assignments, and Centre User isolation.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground"><Plus className="h-4 w-4 mr-2" />Add New User</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Create Auth User &amp; Profile</DialogTitle><DialogDescription>Provision credentials and set access scope.</DialogDescription></DialogHeader>
            <div className="space-y-4 py-2">
              <div><Label>Email</Label><Input type="email" value={f.email} onChange={e=>setF({...f, email:e.target.value})} placeholder="user@moroccanspa.in"/></div>
              <div><Label>Full Name</Label><Input value={f.full_name} onChange={e=>setF({...f, full_name:e.target.value})} placeholder="Manager Name"/></div>
              <div><Label>Password</Label><Input type="password" value={f.password} onChange={e=>setF({...f, password:e.target.value})} placeholder="Min 8 chars (temporary credential)"/></div>
              <div>
                <Label>Role Assignment</Label>
                <Select value={f.role} onValueChange={v => setF({...f, role:v, centre_id: v === 'SUPER_ADMIN' ? '' : f.centre_id})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="CENTRE_USER">Centre User (Scoped)</SelectItem><SelectItem value="SUPER_ADMIN">Super Admin (All Access)</SelectItem></SelectContent>
                </Select>
              </div>
              {f.role === 'CENTRE_USER' && (
                <div>
                  <Label>Assigned Centre</Label>
                  <Select value={f.centre_id} onValueChange={v => setF({...f, centre_id:v})}>
                    <SelectTrigger><SelectValue placeholder="Select Centre..."/></SelectTrigger>
                    <SelectContent>{centres.map(c=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={create}>Provision User</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader><CardTitle className="text-base font-medium">Active Profiles &amp; Access Controls</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>User / Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Assigned Scope</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Action</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {users.map(u => {
                const cName = u.centre_id ? centres.find(x=>x.id===u.centre_id)?.name || u.centre_id : 'All Centres (Global)'
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name || 'Unnamed'}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell><Badge variant={u.role==='SUPER_ADMIN'?'default':'secondary'}>{u.role}</Badge></TableCell>
                    <TableCell className="text-sm">{cName}</TableCell>
                    <TableCell><Badge className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20">Active</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(u.created_at || Date.now()).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" disabled={u.id === currentUserId} aria-label={`Delete ${u.full_name || u.email}`} title={u.id === currentUserId ? 'You cannot delete your own account' : 'Delete user'} onClick={()=>setDeleteTarget(u)} className="text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 disabled:text-muted-foreground">
                        <Trash2 className="h-4 w-4 sm:mr-2"/><span className="hidden sm:inline">Delete</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={open=>{ if (!open && !deleting) setDeleteTarget(null) }}>
        <AlertDialogContent className="max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this user completely?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes {deleteTarget?.full_name || deleteTarget?.email} from login access and User Management. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep User</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={remove} className="bg-rose-600 text-white hover:bg-rose-700">{deleting?'Deleting...':'Delete User'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function TherapistsView({ centre, centres, bump, refreshTick }) {
  const [therapists, setTherapists] = useState([])
  const [name, setName] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    const data = await apiGet(`/therapists?centre_id=${centre.id}`)
    if (Array.isArray(data)) setTherapists(data)
    else if (data?.error) toast.error(data.error)
  }, [centre.id])

  useEffect(() => { load() }, [load, refreshTick])

  const create = async () => {
    const cleanName = name.trim()
    if (centre.id === 'ALL') return toast.error('Select a specific centre first')
    if (cleanName.length < 2) return toast.error('Enter the therapist name')
    setLoading(true)
    const result = await apiPost('/therapists', { name: cleanName, centre_id: centre.id })
    setLoading(false)
    if (result.error) return toast.error(result.error)
    toast.success(`${cleanName} added to ${centre.name}`)
    setName(''); setOpen(false); bump(); await load()
  }

  const toggle = async (therapist) => {
    const result = await apiPatch(`/therapists/${therapist.id}`, { active: !therapist.active })
    if (result.error) return toast.error(result.error)
    toast.success(`${therapist.name} is now ${therapist.active ? 'inactive' : 'active'}`)
    bump(); await load()
  }

  const remove = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const result = await apiDelete(`/therapists/${deleteTarget.id}`)
    setDeleting(false)
    if (result.error) return toast.error(result.error)
    toast.success(`${deleteTarget.name} removed`)
    setDeleteTarget(null); bump(); await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Therapists</h2>
          <p className="text-sm text-muted-foreground">Manage the therapists available for appointment assignment.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button disabled={centre.id === 'ALL'}><Plus className="h-4 w-4 mr-2"/>Add Therapist</Button></DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Add Therapist</DialogTitle><DialogDescription>The therapist will be available only at {centre.name}.</DialogDescription></DialogHeader>
            <div className="py-2"><Label>Therapist Name</Label><Input autoFocus value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') create() }} placeholder="Enter full name"/></div>
            <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={create} disabled={loading}>{loading?'Adding...':'Add Therapist'}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {centre.id === 'ALL' && <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">Select a specific centre to add a therapist. The collective view is for reviewing all therapists.</div>}

      <Card className="border-border/50 shadow-sm">
        <CardContent className="pt-6">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead>{centre.id === 'ALL' && <TableHead>Centre</TableHead>}<TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>
              {therapists.length === 0 && <TableRow><TableCell colSpan={centre.id === 'ALL' ? 5 : 4} className="text-center text-muted-foreground py-10">No therapists found.</TableCell></TableRow>}
              {therapists.map(therapist => (
                <TableRow key={therapist.id}>
                  <TableCell className="font-medium">{therapist.name}</TableCell>
                  {centre.id === 'ALL' && <TableCell>{centres.find(c=>c.id===therapist.centre_id)?.name || 'Unknown centre'}</TableCell>}
                  <TableCell><Badge className={therapist.active?'bg-emerald-500/20 text-emerald-400':'bg-muted text-muted-foreground'}>{therapist.active?'Active':'Inactive'}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(therapist.created_at).toLocaleDateString('en-IN')}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={()=>toggle(therapist)}>{therapist.active?'Deactivate':'Activate'}</Button>
                      <Button size="sm" variant="ghost" aria-label={`Remove ${therapist.name}`} title="Remove therapist" onClick={()=>setDeleteTarget(therapist)} className="text-rose-600 hover:bg-rose-500/10 hover:text-rose-700"><Trash2 className="h-4 w-4"/></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={open=>{ if (!open && !deleting) setDeleteTarget(null) }}>
        <AlertDialogContent className="max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this therapist?</AlertDialogTitle>
            <AlertDialogDescription>{deleteTarget?.name} will be permanently removed if they have no booking history. Therapists linked to historical bookings must be deactivated instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={remove} className="bg-rose-600 text-white hover:bg-rose-700">{deleting?'Removing...':'Remove Therapist'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function AppProfileMenu({ profile, centre, onAction, className='' }) {
  const isSuperAdmin = profile.role === 'SUPER_ADMIN'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="Profile menu" className={`shrink-0 rounded-xl border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 ${className}`}><User2 className="h-4 w-4"/></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-xl p-2">
        <DropdownMenuLabel><div className="truncate">{profile.full_name || profile.email}</div><div className="mt-1 truncate text-xs font-normal text-muted-foreground">{isSuperAdmin?'Super Admin':'Centre User'} · {centre.name}</div></DropdownMenuLabel>
        <DropdownMenuSeparator/>
        <DropdownMenuItem onClick={()=>onAction('settings')}><Settings className="mr-2 h-4 w-4"/>Settings</DropdownMenuItem>
        {isSuperAdmin && <DropdownMenuItem onClick={()=>onAction('users')}><Users className="mr-2 h-4 w-4"/>User Management</DropdownMenuItem>}
        <DropdownMenuItem onClick={()=>onAction('audit')}><ShieldCheck className="mr-2 h-4 w-4"/>Audit Log</DropdownMenuItem>
        <DropdownMenuSeparator/>
        <DropdownMenuItem onClick={()=>onAction('logout')} className="text-rose-600 focus:bg-rose-50 focus:text-rose-700"><LogOut className="mr-2 h-4 w-4"/>Log Out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SettingsView({ profile, centre, onNavigate }) {
  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-semibold">Settings</h2><p className="text-sm text-muted-foreground">Your account, access level, and centre context.</p></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-base">Account</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
          <Row k="Name" v={profile.full_name || '—'}/><Row k="Email" v={profile.email}/><Row k="Role" v={profile.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Centre User'}/><Row k="Current Centre" v={centre.name}/>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Access &amp; Security</CardTitle></CardHeader><CardContent className="space-y-3">
          <Button variant="outline" className="w-full justify-start" onClick={()=>onNavigate('audit')}><ShieldCheck className="mr-2 h-4 w-4"/>Open Audit Log</Button>
          {profile.role === 'SUPER_ADMIN' && <Button variant="outline" className="w-full justify-start" onClick={()=>onNavigate('users')}><Users className="mr-2 h-4 w-4"/>Manage Users</Button>}
          <p className="text-xs leading-relaxed text-muted-foreground">Passwords and authentication remain protected by Supabase Auth. Use the profile menu to sign out securely.</p>
        </CardContent></Card>
      </div>
    </div>
  )
}

function NavigationPanel({ profile, centre, centres, navItems, view, setView, setCentre, onNavigate }) {
  const navigate = (nextView) => {
    setView(nextView)
    onNavigate?.()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 px-2 py-2">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl shadow-md shadow-amber-500/15">
          <img src="/logo.png" alt="Moroccan Spa" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0">
          <div className="truncate font-semibold tracking-tight">Moroccan Spa</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Business OS</div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-border/60 bg-muted/35 p-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-foreground">{profile.full_name || profile.email}</div>
          <Badge className="mt-1 border border-amber-500/30 bg-amber-500/15 px-1.5 py-0 font-mono text-[10px] text-amber-700 hover:bg-amber-500/15 dark:text-amber-300">
            {profile.role === 'SUPER_ADMIN' ? 'SUPER ADMIN' : 'CENTRE USER'}
          </Badge>
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        <Label className="px-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Centre Scope</Label>
        {profile.role === 'SUPER_ADMIN' ? (
          <Select value={centre.id} onValueChange={value=>{ setCentre(value === 'ALL' ? ALL_CENTRES : centres.find(c=>c.id===value)); onNavigate?.() }}>
            <SelectTrigger className="bg-background/70"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL"><Building2 className="mr-1 inline h-3 w-3 text-amber-500"/>All Centres (Collective)</SelectItem>
              {centres.map(c=><SelectItem key={c.id} value={c.id}><Building2 className="mr-1 inline h-3 w-3 text-amber-500"/>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex min-h-10 items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-800 dark:text-amber-200">
            <Building2 className="h-4 w-4 shrink-0 text-amber-500"/><span className="truncate">{centre.name}</span>
          </div>
        )}
      </div>

      <nav aria-label="Primary navigation" className="app-nav-scroll mt-5 flex-1 space-y-1 overflow-y-auto pr-1">
        {navItems.map(item => {
          const active = view === item.id
          const NavIcon = item.icon
          return (
            <button key={item.id} type="button" aria-current={active?'page':undefined} onClick={()=>navigate(item.id)}
              className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all ${active?'bg-primary text-primary-foreground shadow-sm':'text-foreground/75 hover:bg-muted hover:text-foreground'}`}>
              <NavIcon className="h-4 w-4 shrink-0"/><span className="truncate">{item.label}</span>
              {active && <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 opacity-70"/>}
            </button>
          )
        })}
      </nav>
      <div className="mt-3 border-t border-border/50 px-2 py-3 text-[10px] text-muted-foreground">One transaction • One source • Infinite reports</div>
    </div>
  )
}

// ============================================================================
// SHELL
// ============================================================================
function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [centres, setCentres] = useState([])
  const [centre, setCentre] = useState(null)
  const [view, setView] = useState('dashboard')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState(null)
  const [bump, setBump] = useState(0)
  const [drillCtx, setDrillCtx] = useState(null)

  const loadAuth = useCallback(async () => {
    setAuthLoading(true)
    const res = await apiGet('/auth/me')
    if (res.ok && res.user && res.profile) {
      setUser(res.user)
      setProfile(res.profile)
      const list = await apiGet('/centres')
      if (Array.isArray(list)) {
        if (res.profile.role === 'CENTRE_USER' && res.profile.centre_id) {
          const scoped = list.filter(c => c.id === res.profile.centre_id)
          setCentres(scoped.length > 0 ? scoped : list)
          setCentre(scoped[0] || list[0] || null)
        } else {
          setCentres(list)
          setCentre(ALL_CENTRES)
        }
      }
    } else {
      setUser(null)
      setProfile(null)
      setAuthToken('')
    }
    setAuthLoading(false)
  }, [])

  useEffect(() => { loadAuth() }, [loadAuth])

  DrillContext.open = (ctx) => setDrillCtx(ctx)
  DrillContext.close = () => setDrillCtx(null)
  const onDrill = (ctx) => setDrillCtx(ctx)
  const consumeDashboardAction = useCallback(() => setPendingAction(null), [])

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-card to-muted/20 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <div className="h-12 w-12 rounded-xl overflow-hidden animate-pulse">
          <img src="/logo.png" alt="Loading" className="h-full w-full object-cover animate-spin" style={{ animationDuration: '3s' }} />
        </div>
        <div className="text-sm font-medium tracking-wide">Securing connection to Supabase engine...</div>
      </div>
    )
  }

  if (!user || !profile) {
    return <LoginScreen onLogin={(res) => { setAuthToken(res.token); setUser(res.user); setProfile(res.profile); loadAuth() }} />
  }

  if (!centre) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading approved centres…</div>

  const role = profile.role === 'SUPER_ADMIN' ? 'SUPER' : 'MANAGER'
  const navItems = [
    ...NAV,
    ...(profile.role === 'SUPER_ADMIN' ? [{ id: 'users', label: 'User Management', icon: Users }] : [])
  ]

  const handleLogout = async () => {
    await apiPost('/auth/logout', {})
    setAuthToken('')
    setUser(null)
    setProfile(null)
    toast.info('Logged out from Moroccan Spa Business OS')
  }
  const currentView = navItems.find(n=>n.id===view) || (view === 'settings' ? { id:'settings', label:'Settings', icon:Settings } : { id:view, label:'Dashboard', icon:LayoutDashboard })
  const Icon = currentView.icon
  const handleDashboardAction = (action) => {
    const target = {
      'view-bookings':'booking', 'new-booking':'booking', 'walk-in':'booking', expense:'expense',
      membership:'membership', 'gift-card':'giftcard', close:'close', register:'register', cashbook:'cashbook', reports:'reports'
    }[action]
    if (!target) return
    if (['new-booking','walk-in','expense','membership','gift-card'].includes(action)) setPendingAction(action)
    else setPendingAction(null)
    setView(target)
  }
  const handleProfileAction = (action) => {
    if (action === 'logout') return handleLogout()
    const target = { settings:'settings', users:'users', audit:'audit' }[action]
    if (target === 'users' && profile.role !== 'SUPER_ADMIN') return
    if (target) setView(target)
  }
  const props = {
    centre, centres, role, profile, bump: () => setBump(b=>b+1), refreshTick:bump, onDrill,
    onNavigateAction:handleDashboardAction, onProfileAction:handleProfileAction, pendingAction, onActionConsumed:consumeDashboardAction
  }

  return (
    <div className="app-shell bg-gradient-to-br from-background via-background to-muted/35">
      <Toaster theme="system" position="top-right" richColors closeButton />
      <div className="flex min-h-[100dvh] lg:h-[100dvh]">
        <aside className="hidden h-[100dvh] w-64 shrink-0 border-r border-border/60 bg-card/70 p-4 backdrop-blur-xl lg:sticky lg:top-0 lg:flex lg:flex-col">
          <NavigationPanel {...{ profile, centre, centres, navItems, view, setView, setCentre }}/>
        </aside>

        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="left" className="safe-top safe-bottom w-[88vw] max-w-[340px] overflow-hidden p-4">
            <SheetHeader className="sr-only"><SheetTitle>Application navigation</SheetTitle><SheetDescription>Choose a centre or section.</SheetDescription></SheetHeader>
            <NavigationPanel {...{ profile, centre, centres, navItems, view, setView, setCentre }} onNavigate={()=>setMobileNavOpen(false)}/>
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col lg:h-[100dvh]">
          <header className="safe-top sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur-xl lg:hidden">
            <div className="flex h-16 items-center gap-3 px-4">
              <Button variant="ghost" size="icon" aria-label="Open navigation" onClick={()=>setMobileNavOpen(true)} className="shrink-0"><Menu className="h-5 w-5"/></Button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{currentView.label}</div>
                <div className="flex items-center gap-1 truncate text-xs text-muted-foreground"><Building2 className="h-3 w-3 shrink-0"/><span className="truncate">{centre.name}</span></div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {profile.role === 'SUPER_ADMIN' && <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" aria-label={`Change centre. Current centre: ${centre.name}`} title="Change centre" className="shrink-0 border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"><Building2 className="h-4 w-4"/></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <DropdownMenuItem onClick={()=>setCentre(ALL_CENTRES)} className={centre.id === 'ALL' ? 'bg-muted font-semibold' : ''}><Building2 className="mr-2 h-4 w-4 text-amber-500"/>All Centres (Collective)</DropdownMenuItem>
                      {centres.map(c=><DropdownMenuItem key={c.id} onClick={()=>setCentre(c)} className={centre.id === c.id ? 'bg-muted font-semibold' : ''}><MapPin className="mr-2 h-4 w-4 text-amber-500"/>{c.name}</DropdownMenuItem>)}
                    </DropdownMenuContent>
                  </DropdownMenu>}
                <AppProfileMenu {...{profile,centre}} onAction={handleProfileAction}/>
              </div>
            </div>
          </header>

          <main id="main-content" className="app-content min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7" tabIndex={-1}>
            <div className="mx-auto w-full max-w-[1600px]">
              <div className="mb-6 hidden items-center gap-2 border-b border-border/40 pb-3 text-sm text-muted-foreground lg:flex">
                <Icon className="h-4 w-4 text-amber-500"/>
                <span className="font-semibold text-foreground">{currentView.label}</span>
                <span className="mx-1.5 text-border">/</span>
                <span className="flex min-w-0 items-center gap-1"><Building2 className="h-3.5 w-3.5 shrink-0"/><span className="truncate">{centre.name}</span></span>
                <span className="ml-auto rounded-lg border border-border/40 bg-muted/40 px-2 py-1 font-mono text-xs text-muted-foreground">
                  {new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}
                </span>
                {view !== 'dashboard' && <AppProfileMenu {...{profile,centre}} onAction={handleProfileAction} className="ml-2"/>}
              </div>

              <div key={`${view}-${centre.id}`} className="view-surface">
                {view==='dashboard'  && <DashboardView {...props} />}
                {view==='booking'    && <BookingView {...props} />}
                {view==='membership' && <MembershipView {...props} />}
                {view==='giftcard'   && <GiftCardView {...props} />}
                {view==='expense'    && <ExpenseView {...props} />}
                {view==='cash'       && <CashMovementView {...props} />}
                {view==='register'   && <RegisterView {...props} />}
                {view==='cashbook'   && <CashBookView {...props} />}
                {view==='close'      && <CloseView {...props} />}
                {view==='reports'    && <ReportsView {...props} />}
                {view==='therapists' && <TherapistsView {...props} />}
                {view==='audit'      && <AuditView {...props} />}
                {view==='users'      && profile.role === 'SUPER_ADMIN' && <UsersView centres={centres} currentUserId={user.id} bump={() => setBump(b=>b+1)} refreshTick={bump} />}
                {view==='settings'   && <SettingsView {...{profile,centre}} onNavigate={setView}/>}
              </div>
            </div>
          </main>
        </div>
      </div>

      <DrillDownDialog ctx={drillCtx} role={role} bump={() => setBump(b=>b+1)} />
    </div>
  )
}

export default App
