'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Area, AreaChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from 'recharts'
import {
  ArrowRight, Bell, BookOpen, CalendarDays, CalendarPlus, CreditCard, Expand,
  Gift, IndianRupee, LockKeyhole, LogOut, Receipt, Settings, ShieldCheck, Sparkles,
  TrendingDown, TrendingUp, UserRound, UsersRound, WalletCards,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { collectionPresentation } from '@/lib/dashboard-presenters'

const PAYMENT_COLOURS = ['#7c3aed', '#2563eb', '#10b981', '#f59e0b']

const isoShift = (date, days) => {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
const monthStart = date => `${date.slice(0, 7)}-01`
const monthEnd = date => {
  const value = new Date(`${monthStart(date)}T00:00:00Z`)
  value.setUTCMonth(value.getUTCMonth() + 1)
  value.setUTCDate(0)
  return value.toISOString().slice(0, 10)
}
const previousMonthDate = date => {
  const value = new Date(`${monthStart(date)}T00:00:00Z`)
  value.setUTCMonth(value.getUTCMonth() - 1)
  return value.toISOString().slice(0, 10)
}
const formatShortDate = date => new Intl.DateTimeFormat('en-IN', { day:'numeric', month:'short', timeZone:'UTC' }).format(new Date(`${date}T00:00:00Z`))
const formatLongDate = date => new Intl.DateTimeFormat('en-IN', { weekday:'short', day:'numeric', month:'long', year:'numeric', timeZone:'UTC' }).format(new Date(`${date}T00:00:00Z`))
const greeting = () => {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour:'2-digit', hour12:false, timeZone:'Asia/Kolkata' }).format(new Date()))
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
const safePercent = (current, previous) => {
  const now = Number(current || 0)
  const before = Number(previous || 0)
  if (before === 0) return now === 0 ? 0 : null
  return Math.round(((now - before) / Math.abs(before)) * 100)
}
const compactMoney = paise => {
  const rupees = Number(paise || 0) / 100
  if (Math.abs(rupees) >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`
  if (Math.abs(rupees) >= 1000) return `₹${(rupees / 1000).toFixed(0)}k`
  return `₹${Math.round(rupees)}`
}
const periodBounds = (date, period) => {
  if (period === 'today') return { currentStart:date, currentEnd:date, previousStart:isoShift(date,-1), previousEnd:isoShift(date,-1), group:'day' }
  if (period === 'week') return { currentStart:isoShift(date,-6), currentEnd:date, previousStart:isoShift(date,-13), previousEnd:isoShift(date,-7), group:'day' }
  if (period === 'month') {
    const previous = previousMonthDate(date)
    return { currentStart:monthStart(date), currentEnd:monthEnd(date), previousStart:monthStart(previous), previousEnd:monthEnd(previous), group:'day' }
  }
  const year = date.slice(0,4)
  const previousYear = String(Number(year)-1)
  return { currentStart:`${year}-01-01`, currentEnd:`${year}-12-31`, previousStart:`${previousYear}-01-01`, previousEnd:`${previousYear}-12-31`, group:'month' }
}
const enumeratePeriods = (start, end, group) => {
  if (group === 'month') return Array.from({length:12}, (_, index) => `${start.slice(0,4)}-${String(index+1).padStart(2,'0')}`)
  const result = []
  let cursor = start
  while (cursor <= end) { result.push(cursor); cursor = isoShift(cursor, 1) }
  return result
}
const aggregateFor = row => row?.consolidated || {}
const bookingStatus = event => {
  if (event.is_reversal) return 'Reversed'
  const raw = String(event.booking?.status || event.status || 'Confirmed').toLowerCase()
  if (raw === 'confirmed' && event.booking?.appointment_time) {
    const appointment = new Date(`${event.booking.appointment_date || event.business_date}T${String(event.booking.appointment_time).slice(0,8)}+05:30`)
    if (appointment < new Date()) return 'Completed'
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

function Delta({ current, previous, suffix='vs previous day' }) {
  const percent = safePercent(current, previous)
  if (percent == null) return <span className="text-emerald-600">New <span className="text-muted-foreground">{suffix}</span></span>
  const positive = percent >= 0
  const Icon = positive ? TrendingUp : TrendingDown
  return <span className={positive?'text-emerald-600':'text-rose-500'}><Icon className="mr-1 inline h-3.5 w-3.5"/>{Math.abs(percent)}% <span className="font-normal text-muted-foreground">{suffix}</span></span>
}

function MissionKpi({ label, value, icon:Icon, tone, current, previous, onClick }) {
  const tones = {
    violet:'bg-violet-100 text-violet-700', emerald:'bg-emerald-100 text-emerald-700',
    amber:'bg-amber-100 text-amber-700', blue:'bg-blue-100 text-blue-700',
    rose:'bg-rose-100 text-rose-700', indigo:'bg-indigo-100 text-indigo-700',
  }
  return (
    <Card role={onClick?'button':undefined} tabIndex={onClick?0:undefined} onClick={onClick} onKeyDown={event=>{ if (onClick && ['Enter',' '].includes(event.key)) { event.preventDefault(); onClick() } }} className={`mission-kpi min-w-0 overflow-hidden border-white/80 bg-white/90 shadow-[0_12px_35px_rgba(49,46,129,0.07)] transition duration-200 ${onClick?'cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_16px_42px_rgba(76,29,149,0.12)] focus-visible:ring-2 focus-visible:ring-violet-500':''}`}>
      <CardContent className="flex min-h-[132px] items-center gap-4 p-5 pt-5">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tones[tone] || tones.violet}`}><Icon className="h-6 w-6"/></div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</div>
          <div className="mt-1 truncate text-2xl font-bold tracking-tight text-slate-950">{value}</div>
          <div className="mt-2 text-[11px] font-medium"><Delta current={current} previous={previous}/></div>
        </div>
      </CardContent>
    </Card>
  )
}

function SectionHeading({ title, subtitle, control }) {
  return <CardHeader className="min-w-0 flex-row items-start justify-between gap-4 p-5 pb-2"><div className="min-w-0"><CardTitle className="text-base font-bold text-slate-950">{title}</CardTitle>{subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}</div>{control && <div className="shrink-0">{control}</div>}</CardHeader>
}

function RevenueTooltip({ active, payload, label, formatMoney }) {
  if (!active || !payload?.length) return null
  return <div className="rounded-xl border border-violet-100 bg-white/95 p-3 text-xs shadow-xl backdrop-blur"><div className="mb-2 font-semibold text-slate-800">{label}</div>{payload.map(item=><div key={item.dataKey} className="flex min-w-40 items-center justify-between gap-5 py-0.5"><span style={{color:item.color}}>{item.name}</span><strong>{formatMoney(item.value)}</strong></div>)}</div>
}

function EmptyCard({ icon:Icon=Sparkles, title, text }) {
  return <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center"><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-500"><Icon className="h-5 w-5"/></div><div className="font-semibold text-slate-800">{title}</div><p className="mt-1 max-w-xs text-sm text-slate-500">{text}</p></div>
}

function StatusBadge({ status }) {
  const key = status.toLowerCase()
  const className = key.includes('complete') ? 'bg-emerald-50 text-emerald-700' : key.includes('cancel') || key.includes('reverse') ? 'bg-rose-50 text-rose-700' : key.includes('upcoming') ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'
  return <Badge className={`${className} border-0 px-2 py-0.5 text-[10px] shadow-none`}>{status}</Badge>
}

function QuickAction({ icon:Icon, label, tone, onClick }) {
  const tones = { violet:'bg-violet-100 text-violet-700', emerald:'bg-emerald-100 text-emerald-700', amber:'bg-amber-100 text-amber-700', rose:'bg-rose-100 text-rose-700', blue:'bg-blue-100 text-blue-700', indigo:'bg-indigo-100 text-indigo-700' }
  return <button type="button" onClick={onClick} className="group flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-slate-50/70 p-3 text-center text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"><span className={`flex h-10 w-10 items-center justify-center rounded-2xl transition group-hover:scale-105 ${tones[tone]}`}><Icon className="h-5 w-5"/></span>{label}</button>
}

export function DashboardMissionControl({ centre, profile, refreshTick, onDrill, onNavigateAction, onProfileAction, apiGet, formatMoney, today }) {
  const [date, setDate] = useState(today)
  const [daily, setDaily] = useState(null)
  const [previousDaily, setPreviousDaily] = useState(null)
  const [bookings, setBookings] = useState([])
  const [monthly, setMonthly] = useState(null)
  const [chartPeriod, setChartPeriod] = useState('week')
  const [chartReport, setChartReport] = useState(null)
  const [topPeriod, setTopPeriod] = useState('month')
  const [serviceEvents, setServiceEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [chartLoading, setChartLoading] = useState(true)
  const [serviceLoading, setServiceLoading] = useState(true)
  const [errors, setErrors] = useState({})

  const centreId = centre?.id || 'ALL'
  const loadCore = useCallback(async () => {
    setLoading(true)
    const previousDate = isoShift(date,-1)
    const previousMonth = previousMonthDate(date)
    const requests = await Promise.allSettled([
      apiGet(`/dashboard?centre_id=${centreId}&date=${date}`),
      apiGet(`/dashboard?centre_id=${centreId}&date=${previousDate}`),
      apiGet(`/events?centre_id=${centreId}&date=${date}&type=BOOKING`),
      apiGet(`/reports/pl?centre_id=${centreId}&from=${monthStart(previousMonth)}&to=${monthEnd(date)}&group=month`),
    ])
    const [currentResult, previousResult, bookingResult, monthlyResult] = requests
    const nextErrors = {}
    const current = currentResult.status === 'fulfilled' && !currentResult.value?.error ? currentResult.value : null
    const previous = previousResult.status === 'fulfilled' && !previousResult.value?.error ? previousResult.value : null
    const bookingList = bookingResult.status === 'fulfilled' && Array.isArray(bookingResult.value) ? bookingResult.value : []
    const monthData = monthlyResult.status === 'fulfilled' && !monthlyResult.value?.error ? monthlyResult.value : null
    if (!current) nextErrors.daily = 'Daily summary is temporarily unavailable.'
    if (!previous) nextErrors.previous = 'Previous-day comparison is unavailable.'
    if (bookingResult.status === 'rejected' || bookingResult.value?.error) nextErrors.bookings = 'Appointments could not be loaded.'
    if (!monthData) nextErrors.monthly = 'Monthly summary is temporarily unavailable.'
    setDaily(current); setPreviousDaily(previous); setBookings(bookingList); setMonthly(monthData); setErrors(currentErrors=>({...currentErrors,...nextErrors})); setLoading(false)
  }, [apiGet, centreId, date])

  const loadChart = useCallback(async () => {
    setChartLoading(true)
    const bounds = periodBounds(date, chartPeriod)
    const result = await apiGet(`/reports/pl?centre_id=${centreId}&from=${bounds.previousStart}&to=${bounds.currentEnd}&group=${bounds.group}`)
    if (result?.error) { setErrors(current=>({...current,chart:'Revenue history could not be loaded.'})); setChartReport(null) }
    else { setChartReport(result); setErrors(current=>({...current,chart:null})) }
    setChartLoading(false)
  }, [apiGet, centreId, date, chartPeriod])

  const loadServices = useCallback(async () => {
    setServiceLoading(true)
    const start = topPeriod === 'today' ? date : topPeriod === 'week' ? isoShift(date,-6) : monthStart(date)
    const result = await apiGet(`/events?centre_id=${centreId}&from=${start}&to=${date}&type=BOOKING`)
    if (Array.isArray(result)) { setServiceEvents(result); setErrors(current=>({...current,services:null})) }
    else { setServiceEvents([]); setErrors(current=>({...current,services:'Service performance could not be loaded.'})) }
    setServiceLoading(false)
  }, [apiGet, centreId, date, topPeriod])

  useEffect(()=>{ loadCore() },[loadCore, refreshTick])
  useEffect(()=>{ loadChart() },[loadChart, refreshTick])
  useEffect(()=>{ loadServices() },[loadServices, refreshTick])

  const agg = daily?.agg || daily?.single_centre?.agg || daily?.consolidated || {}
  const previousAgg = previousDaily?.agg || previousDaily?.single_centre?.agg || previousDaily?.consolidated || {}
  const collections = collectionPresentation(agg)
  const previousCollections = collectionPresentation(previousAgg)
  const online = collections.online
  const previousOnline = previousCollections.online
  const paymentTotal = collections.total
  const paymentData = collections.methods
  const reversedEventIds = useMemo(()=>new Set([...bookings,...serviceEvents].filter(event=>event.is_reversal&&event.reverses).map(event=>event.reverses)),[bookings,serviceEvents])
  const timeline = useMemo(()=>bookings.filter(event=>!event.is_reversal&&!reversedEventIds.has(event.id)).sort((a,b)=>String(a.booking?.appointment_time||a.created_at).localeCompare(String(b.booking?.appointment_time||b.created_at))).slice(0,5),[bookings,reversedEventIds])
  const topServices = useMemo(()=>{
    const totals = new Map()
    for (const event of serviceEvents) {
      const status = String(event.booking?.status || event.status || '').toUpperCase()
      if (event.is_reversal || reversedEventIds.has(event.id) || ['CANCELLED','REVERSED'].includes(status)) continue
      const name = event.service_name || 'Unspecified service'
      const current = totals.get(name) || { name, bookings:0, revenue:0 }
      current.bookings += 1
      current.revenue += Number(event.amount||0)
      totals.set(name,current)
    }
    return [...totals.values()].sort((a,b)=>b.bookings-a.bookings || b.revenue-a.revenue).slice(0,5)
  },[serviceEvents,reversedEventIds])
  const maxServiceBookings = Math.max(1,...topServices.map(item=>item.bookings))

  const chartData = useMemo(()=>{
    if (!chartReport) return []
    const bounds = periodBounds(date, chartPeriod)
    const rows = chartReport.rows || []
    const currentPeriods = enumeratePeriods(bounds.currentStart,bounds.currentEnd,bounds.group)
    const previousPeriods = enumeratePeriods(bounds.previousStart,bounds.previousEnd,bounds.group)
    const byPeriod = new Map(rows.map(row=>[row.period,row]))
    return currentPeriods.map((period,index)=>({
      label:bounds.group==='month'?new Intl.DateTimeFormat('en-IN',{month:'short',timeZone:'UTC'}).format(new Date(`${period}-01T00:00:00Z`)):formatShortDate(period),
      current:Number(aggregateFor(byPeriod.get(period)).total_revenue||0),
      previous:Number(aggregateFor(byPeriod.get(previousPeriods[index])).total_revenue||0),
    }))
  },[chartReport,chartPeriod,date])

  const currentMonthKey = date.slice(0,7)
  const previousMonthKey = previousMonthDate(date).slice(0,7)
  const currentMonth = aggregateFor(monthly?.rows?.find(row=>row.period===currentMonthKey))
  const previousMonth = aggregateFor(monthly?.rows?.find(row=>row.period===previousMonthKey))
  const monthMetrics = [
    ['Total Revenue',currentMonth.total_revenue,previousMonth.total_revenue,true], ['Total Bookings',currentMonth.bookings,previousMonth.bookings,false],
    ['Guests',currentMonth.guests,previousMonth.guests,false], ['Membership Sales',currentMonth.memberships_sold,previousMonth.memberships_sold,false],
    ['Gift Card Sales',currentMonth.gift_cards_sold,previousMonth.gift_cards_sold,false], ['Expenses',currentMonth.total_expenses,previousMonth.total_expenses,true],
  ]

  const drill = metric => onDrill?.({type:'metric',metric,centre_id:centreId,date})
  const isSuperAdmin = profile?.role === 'SUPER_ADMIN'
  const toggleFullscreen = async () => {
    if (typeof document === 'undefined') return
    if (document.fullscreenElement) await document.exitFullscreen?.()
    else await document.documentElement.requestFullscreen?.()
  }

  return (
    <div className="mission-dashboard space-y-5 text-slate-800">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{greeting()}, {profile?.full_name?.split(' ')[0] || 'there'}!</h1><span className="text-2xl" aria-hidden="true">👋</span></div>
          <p className="mt-1 text-sm text-slate-500">Here’s what’s happening at <span className="font-semibold text-slate-700">{centre.name}</span> today.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:flex-none"><CalendarDays className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-violet-500"/><Input aria-label="Dashboard business date" type="date" value={date} onChange={event=>setDate(event.target.value)} className="h-11 w-full rounded-2xl border-white bg-white/90 pl-10 pr-3 shadow-sm sm:w-[170px]"/></div>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="Notifications" className="h-11 w-11 rounded-2xl border-white bg-white/90 shadow-sm"><Bell className="h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-72"><DropdownMenuLabel>Notifications</DropdownMenuLabel><DropdownMenuSeparator/><div className="px-3 py-5 text-center text-sm text-muted-foreground">No new notifications</div></DropdownMenuContent></DropdownMenu>
          <Button variant="outline" size="icon" aria-label="Toggle full screen" onClick={toggleFullscreen} className="hidden h-11 w-11 rounded-2xl border-white bg-white/90 shadow-sm sm:inline-flex"><Expand className="h-4 w-4"/></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="Profile menu" className="hidden h-11 w-11 rounded-2xl border-white bg-gradient-to-br from-violet-100 to-indigo-100 text-violet-700 shadow-sm lg:inline-flex"><UserRound className="h-4 w-4"/></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-xl p-2">
              <DropdownMenuLabel><div className="truncate">{profile?.full_name || profile?.email}</div><div className="mt-1 truncate text-xs font-normal text-muted-foreground">{isSuperAdmin?'Super Admin':'Centre User'} · {centre.name}</div></DropdownMenuLabel>
              <DropdownMenuSeparator/>
              <DropdownMenuItem onClick={()=>onProfileAction?.('settings')}><Settings className="mr-2 h-4 w-4"/>Settings</DropdownMenuItem>
              {isSuperAdmin && <DropdownMenuItem onClick={()=>onProfileAction?.('users')}><UsersRound className="mr-2 h-4 w-4"/>User Management</DropdownMenuItem>}
              <DropdownMenuItem onClick={()=>onProfileAction?.('audit')}><ShieldCheck className="mr-2 h-4 w-4"/>Audit Log</DropdownMenuItem>
              <DropdownMenuSeparator/>
              <DropdownMenuItem onClick={()=>onProfileAction?.('logout')} className="text-rose-600 focus:bg-rose-50 focus:text-rose-700"><LogOut className="mr-2 h-4 w-4"/>Log Out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {loading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">{Array.from({length:6},(_,index)=><Skeleton key={index} className="h-[132px] rounded-2xl"/>)}</div> : errors.daily ? <Card className="border-rose-100 bg-rose-50/60"><CardContent className="p-5 pt-5 text-sm text-rose-700">{errors.daily} Choose another date or refresh the page.</CardContent></Card> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MissionKpi label="Today's Bookings" value={agg.bookings||0} icon={CalendarDays} tone="violet" current={agg.bookings} previous={previousAgg.bookings} onClick={()=>drill('bookings')}/>
        <MissionKpi label="Today's Revenue" value={formatMoney(agg.total_revenue)} icon={IndianRupee} tone="emerald" current={agg.total_revenue} previous={previousAgg.total_revenue} onClick={()=>drill('total_revenue')}/>
        <MissionKpi label="Cash in Hand" value={formatMoney(agg.closing_cash_expected)} icon={WalletCards} tone="amber" current={agg.closing_cash_expected} previous={previousAgg.closing_cash_expected} onClick={()=>drill('closing_cash_expected')}/>
        <MissionKpi label="Online Payments" value={formatMoney(online)} icon={CreditCard} tone="blue" current={online} previous={previousOnline}/>
        <MissionKpi label="Guests Today" value={agg.guests||0} icon={UsersRound} tone="indigo" current={agg.guests} previous={previousAgg.guests} onClick={()=>drill('guests')}/>
        <MissionKpi label="Membership Sales" value={formatMoney(agg.membership_sales)} icon={Sparkles} tone="rose" current={agg.membership_sales} previous={previousAgg.membership_sales} onClick={()=>drill('membership_sales')}/>
      </div>}

      <div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        <Card className="min-w-0 border-white/80 bg-white/90 shadow-[0_12px_35px_rgba(49,46,129,0.06)]">
          <SectionHeading title="Revenue Overview" subtitle={`${formatLongDate(periodBounds(date,chartPeriod).currentStart)} – ${formatLongDate(periodBounds(date,chartPeriod).currentEnd)}`} control={<Select value={chartPeriod} onValueChange={setChartPeriod}><SelectTrigger className="h-9 w-[125px] rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="today">Today</SelectItem><SelectItem value="week">This Week</SelectItem><SelectItem value="month">This Month</SelectItem><SelectItem value="year">This Year</SelectItem></SelectContent></Select>}/>
          <CardContent className="p-3 pt-2 sm:p-5 sm:pt-2">
            {chartLoading ? <Skeleton className="h-[290px] rounded-xl"/> : errors.chart ? <EmptyCard title="Revenue chart unavailable" text={errors.chart}/> : chartData.every(row=>row.current===0&&row.previous===0) ? <EmptyCard title="No revenue in this period" text="Revenue will appear here as financial events are recorded."/> : <div className="h-[290px] w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{top:12,right:10,left:-15,bottom:4}}><CartesianGrid stroke="#ede9fe" strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label" tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false} minTickGap={24}/><YAxis tickFormatter={compactMoney} tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/><ChartTooltip content={<RevenueTooltip formatMoney={formatMoney}/>}/><Line name="Current period" type="monotone" dataKey="current" stroke="#7c3aed" strokeWidth={3} dot={{r:3,fill:'#7c3aed',strokeWidth:0}} activeDot={{r:6,fill:'#fff',stroke:'#7c3aed',strokeWidth:3}}/><Line name="Previous period" type="monotone" dataKey="previous" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="6 6" dot={false}/></LineChart></ResponsiveContainer></div>}
          </CardContent>
        </Card>

        <Card className="min-w-0 border-white/80 bg-white/90 shadow-[0_12px_35px_rgba(49,46,129,0.06)]">
          <SectionHeading title="Payment Breakdown" subtitle="Fresh collections for the selected business date" control={<Badge variant="secondary" className="rounded-lg bg-violet-50 text-violet-700">Today</Badge>}/>
          <CardContent className="grid min-h-[310px] items-center gap-3 p-4 pt-1 sm:grid-cols-[1fr_1.05fr] sm:p-5 sm:pt-1">
            {paymentTotal===0 ? <div className="sm:col-span-2"><EmptyCard icon={CreditCard} title="No payment collections" text="Cash, card and UPI collections will appear here."/></div> : <><div className="relative h-[190px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={paymentData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={1.5} stroke="none">{paymentData.map((item,index)=><Cell key={item.name} fill={PAYMENT_COLOURS[index]}/>)}</Pie><ChartTooltip formatter={value=>formatMoney(value)}/></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><strong className="text-lg text-slate-950">{formatMoney(paymentTotal)}</strong><span className="text-[10px] uppercase tracking-wider text-slate-500">Collected</span></div></div><div className="space-y-3">{paymentData.map((item,index)=>{const percent=paymentTotal?Math.round(item.value/paymentTotal*100):0;return <div key={item.name} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-xs"><span className="h-2.5 w-2.5 rounded-full" style={{backgroundColor:PAYMENT_COLOURS[index]}}/><span className="text-slate-600">{item.name}</span><span className="text-right"><strong className="text-slate-900">{formatMoney(item.value)}</strong><span className="ml-2 text-slate-400">{percent}%</span></span></div>})}</div></>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.9fr_0.9fr]">
        <Card className="min-w-0 border-white/80 bg-white/90 shadow-[0_12px_35px_rgba(49,46,129,0.06)]">
          <SectionHeading title="Today's Appointments" subtitle={`${bookings.length} scheduled for ${formatShortDate(date)}`} control={<Button variant="ghost" size="sm" onClick={()=>onNavigateAction('view-bookings')} className="text-violet-700">View all<ArrowRight className="ml-1 h-3.5 w-3.5"/></Button>}/>
          <CardContent className="p-4 pt-2 sm:p-5 sm:pt-2">
            {errors.bookings ? <EmptyCard icon={CalendarDays} title="Appointments unavailable" text={errors.bookings}/> : timeline.length===0 ? <EmptyCard icon={CalendarDays} title="No appointments today" text="New appointments will appear here in time order."/> : <div className="space-y-1">{timeline.map(event=>{const status=bookingStatus(event);return <button key={event.id} type="button" onClick={()=>onDrill?.({type:'event',eventId:event.id})} className="grid w-full grid-cols-[58px_1fr_auto] items-center gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-violet-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"><div className="rounded-xl bg-amber-50 px-2 py-2 text-center text-[11px] font-bold text-amber-700">{String(event.booking?.appointment_time||'--:--').slice(0,5)}</div><div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-900">{event.customer||'Guest'}</div><div className="truncate text-xs text-slate-500">{event.service_name||'Service'}{event.booking?.duration_minutes?` · ${event.booking.duration_minutes} min`:''}</div><div className="mt-0.5 truncate text-[11px] text-slate-400">{event.therapist||'Therapist unassigned'}</div></div><StatusBadge status={status}/></button>})}</div>}
          </CardContent>
        </Card>

        <Card className="min-w-0 border-white/80 bg-white/90 shadow-[0_12px_35px_rgba(49,46,129,0.06)]">
          <SectionHeading title="Top Services" subtitle="Ranked by valid bookings" control={<Select value={topPeriod} onValueChange={setTopPeriod}><SelectTrigger className="h-8 w-[112px] rounded-xl text-xs"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="today">Today</SelectItem><SelectItem value="week">This Week</SelectItem><SelectItem value="month">This Month</SelectItem></SelectContent></Select>}/>
          <CardContent className="p-5 pt-2">
            {serviceLoading ? <div className="space-y-4">{Array.from({length:4},(_,i)=><Skeleton key={i} className="h-11 rounded-xl"/>)}</div> : errors.services ? <EmptyCard title="Services unavailable" text={errors.services}/> : topServices.length===0 ? <EmptyCard icon={Sparkles} title="No services yet" text="Completed service activity will appear here."/> : <div className="space-y-4">{topServices.map((item,index)=><div key={item.name}><div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate font-medium text-slate-700"><span className="mr-1.5 text-slate-400">{index+1}.</span>{item.name}</span><strong className="shrink-0 text-slate-900">{item.bookings} {item.bookings===1?'booking':'bookings'}</strong></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500" style={{width:`${Math.max(8,item.bookings/maxServiceBookings*100)}%`}}/></div></div>)}</div>}
          </CardContent>
        </Card>

        <Card className="min-w-0 border-white/80 bg-white/90 shadow-[0_12px_35px_rgba(49,46,129,0.06)]">
          <SectionHeading title="Quick Actions" subtitle={isSuperAdmin?'Review centre operations':'Open an existing workflow'}/>
          <CardContent className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3 p-4 pt-2 sm:p-5 sm:pt-2">
            {isSuperAdmin ? <><QuickAction icon={CalendarDays} label="View Bookings" tone="violet" onClick={()=>onNavigateAction('view-bookings')}/><QuickAction icon={BookOpen} label="Master Register" tone="indigo" onClick={()=>onNavigateAction('register')}/><QuickAction icon={WalletCards} label="Cash Book" tone="amber" onClick={()=>onNavigateAction('cashbook')}/><QuickAction icon={Receipt} label="Reports" tone="emerald" onClick={()=>onNavigateAction('reports')}/></> : <><QuickAction icon={CalendarPlus} label="New Booking" tone="violet" onClick={()=>onNavigateAction('new-booking')}/><QuickAction icon={UserRound} label="Walk-in" tone="emerald" onClick={()=>onNavigateAction('walk-in')}/><QuickAction icon={Receipt} label="Add Expense" tone="rose" onClick={()=>onNavigateAction('expense')}/><QuickAction icon={Sparkles} label="Membership" tone="blue" onClick={()=>onNavigateAction('membership')}/><QuickAction icon={Gift} label="Gift Card" tone="indigo" onClick={()=>onNavigateAction('gift-card')}/><QuickAction icon={LockKeyhole} label="Daily Closing" tone="amber" onClick={()=>onNavigateAction('close')}/></>}
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0 overflow-hidden border-white/80 bg-white/90 shadow-[0_12px_35px_rgba(49,46,129,0.06)]">
        <SectionHeading title={`Monthly Snapshot · ${new Intl.DateTimeFormat('en-IN',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${date.slice(0,7)}-01T00:00:00Z`))}`} subtitle="Verified totals from the existing reporting engine"/>
        <CardContent className="grid gap-px bg-slate-100 p-0 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {errors.monthly ? <div className="col-span-full bg-white p-8 text-center text-sm text-slate-500">{errors.monthly}</div> : monthMetrics.map(([label,current,previous,isMoney],index)=><div key={label} className="bg-white p-5"><div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-500">{label}</div><div className="mt-2 text-xl font-bold text-slate-950">{isMoney?formatMoney(current):Number(current||0).toLocaleString('en-IN')}</div><div className="mt-2 text-[11px] font-medium"><Delta current={current} previous={previous} suffix="vs last month"/></div><div className="mt-4 h-7"><ResponsiveContainer width="100%" height="100%"><AreaChart data={[{period:'Previous',value:Number(previous||0)},{period:'Current',value:Number(current||0)}]}><defs><linearGradient id={`snapshot-${index}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={index===5?'#f43f5e':'#8b5cf6'} stopOpacity={0.25}/><stop offset="95%" stopColor={index===5?'#f43f5e':'#8b5cf6'} stopOpacity={0}/></linearGradient></defs><Area type="monotone" dataKey="value" stroke={index===5?'#f43f5e':'#8b5cf6'} fill={`url(#snapshot-${index})`} strokeWidth={2} dot={false}/></AreaChart></ResponsiveContainer></div></div>)}
        </CardContent>
      </Card>
    </div>
  )
}
