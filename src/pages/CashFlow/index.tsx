import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Transaction, Receivable, Payable, Category } from '@/types'
import { AmountDisplay } from '@/components/shared/AmountDisplay'
import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, Cell, PieChart, Pie,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Wallet, Clock, Search,
  ArrowDownCircle, ArrowUpCircle, CalendarDays, Inbox,
} from 'lucide-react'

type Period = '1m' | '3m' | '6m' | '1y'

const PERIOD_LABELS: Record<Period, string> = {
  '1m': 'Bu Ay',
  '3m': 'Son 3 Ay',
  '6m': 'Son 6 Ay',
  '1y': 'Bu Yıl',
}

const INCOME_COLOR = '#10b981'
const EXPENSE_COLOR = '#f43f5e'
const NET_COLOR = '#6366f1'

function trFmt(n: number) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  return `${months[parseInt(m) - 1]} ${y.slice(2)}`
}

function getPeriodRange(period: Period): [string, string] {
  const now = new Date()
  const end = now.toISOString().slice(0, 10)
  if (period === '1m') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    return [start, end]
  }
  if (period === '3m') {
    const d = new Date(now); d.setMonth(d.getMonth() - 2); d.setDate(1)
    return [d.toISOString().slice(0, 10), end]
  }
  if (period === '6m') {
    const d = new Date(now); d.setMonth(d.getMonth() - 5); d.setDate(1)
    return [d.toISOString().slice(0, 10), end]
  }
  return [`${now.getFullYear()}-01-01`, end]
}

function getMonthsInRange(start: string, end: string): string[] {
  const months: string[] = []
  const s = new Date(start)
  const e = new Date(end)
  s.setDate(1)
  while (s <= e) {
    months.push(s.toISOString().slice(0, 7))
    s.setMonth(s.getMonth() + 1)
  }
  return months
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-border rounded-xl shadow-lg px-4 py-3 text-sm min-w-[180px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span style={{ color: p.color }} className="flex items-center gap-1.5 text-xs">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-semibold text-xs">{trFmt(p.value ?? 0)}</span>
        </div>
      ))}
    </div>
  )
}

export function CashFlowPage() {
  const [period, setPeriod] = useState<Period>('6m')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [receivables, setReceivables] = useState<(Receivable & { contact_name?: string })[]>([])
  const [payables, setPayables] = useState<(Payable & { contact_name?: string })[]>([])
  const [subscriptions, setSubscriptions] = useState<{ id: string; name: string; amount: number; next_billing_date: string | null }[]>([])
  const [custSubs, setCustSubs] = useState<{ id: string; amount: number; billing_day: number | null; status: string }[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all')

  const [start, end] = useMemo(() => getPeriodRange(period), [period])
  const catName = (id: string | null) => categories.find(c => c.id === id)?.name ?? 'Kategorisiz'

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true)
      const [t, r, p, c, s, cs] = await Promise.all([
        supabase.from('transactions').select('*').eq('status', 'completed').order('transaction_date', { ascending: false }),
        supabase.from('receivables').select('*, contacts(name)').order('due_date'),
        supabase.from('payables').select('*, contacts(name)').order('due_date'),
        supabase.from('categories').select('*'),
        supabase.from('subscriptions').select('id,name,amount,next_billing_date').eq('status', 'active'),
        supabase.from('customer_subscriptions').select('id,amount,billing_day,status').eq('status', 'active'),
      ])
      setTransactions((t.data ?? []) as Transaction[])
      setReceivables((r.data ?? []).map((x: any) => ({ ...x, contact_name: x.contacts?.name })))
      setPayables((p.data ?? []).map((x: any) => ({ ...x, contact_name: x.contacts?.name })))
      setCategories((c.data ?? []) as Category[])
      setSubscriptions((s.data ?? []) as { id: string; name: string; amount: number; next_billing_date: string | null }[])
      setCustSubs((cs.data ?? []) as { id: string; amount: number; billing_day: number | null; status: string }[])
      setLoading(false)
    }
    fetchAll()
  }, [])

  // Period-filtered transactions
  const periodTx = useMemo(() =>
    transactions.filter(t => t.transaction_date >= start && t.transaction_date <= end),
    [transactions, start, end]
  )

  const totalIn = useMemo(() => periodTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0), [periodTx])
  const totalOut = useMemo(() => periodTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0), [periodTx])
  const net = totalIn - totalOut

  // Monthly chart data
  const chartData = useMemo(() => {
    const months = getMonthsInRange(start, end)
    let cumulative = 0
    return months.map(ym => {
      const monthTx = transactions.filter(t => t.transaction_date.startsWith(ym))
      const income = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
      const expense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
      cumulative += income - expense
      return { month: monthLabel(ym), income, expense, net: income - expense, cumulative }
    })
  }, [transactions, start, end])

  // Category breakdown (income)
  const categoryData = useMemo(() => {
    const map = new Map<string, number>()
    periodTx.filter(t => t.type === 'income').forEach(t => {
      const key = catName(t.category_id)
      map.set(key, (map.get(key) ?? 0) + t.amount)
    })
    const COLORS = ['#6366f1','#10b981','#f59e0b','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316']
    return Array.from(map.entries())
      .map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [periodTx])

  const expCategoryData = useMemo(() => {
    const map = new Map<string, number>()
    periodTx.filter(t => t.type === 'expense').forEach(t => {
      const key = catName(t.category_id)
      map.set(key, (map.get(key) ?? 0) + t.amount)
    })
    const COLORS = ['#f43f5e','#fb923c','#fbbf24','#a78bfa','#60a5fa','#34d399','#f472b6','#94a3b8']
    return Array.from(map.entries())
      .map(([name, value], i) => ({ name, value, fill: COLORS[i % COLORS.length] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [periodTx])

  // Upcoming (next 60 days)
  const today = new Date().toISOString().slice(0, 10)
  const in30 = new Date(); in30.setDate(in30.getDate() + 30)
  const in30str = in30.toISOString().slice(0, 10)
  const in60 = new Date(); in60.setDate(in60.getDate() + 60)
  const in60str = in60.toISOString().slice(0, 10)

  const upcomingRec = receivables.filter(r =>
    r.status !== 'paid' && r.due_date && r.due_date >= today && r.due_date <= in60str
  ).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))

  const upcomingPay = payables.filter(p =>
    p.status !== 'paid' && p.due_date && p.due_date >= today && p.due_date <= in60str
  ).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))

  // Abonelikler: next_billing_date geçmişse veya yoksa bugün+30 olarak göster
  const upcomingSubPay = subscriptions.map(s => ({
    id: s.id,
    label: s.name,
    amount: s.amount,
    date: s.next_billing_date && s.next_billing_date >= today ? s.next_billing_date : in30str,
    estimated: !s.next_billing_date || s.next_billing_date < today,
  })).sort((a, b) => a.date.localeCompare(b.date))

  const projectedIn = upcomingRec.reduce((s, r) => s + (r.amount - r.paid_amount), 0)
  const projectedOut = upcomingPay.reduce((s, p) => s + (p.amount - p.paid_amount), 0) + upcomingSubPay.reduce((s, x) => s + x.amount, 0)

  // Filtered tx list
  const filteredTx = useMemo(() => periodTx
    .filter(t => typeFilter === 'all' || t.type === typeFilter)
    .filter(t => !search || t.description?.toLowerCase().includes(search.toLowerCase())),
    [periodTx, typeFilter, search]
  )

  // 6 aylık tahmin grafiği
  const forecastData = useMemo(() => {
    const now = new Date()
    const months: string[] = []
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      months.push(d.toISOString().slice(0, 7))
    }

    return months.map(ym => {
      const mStart = `${ym}-01`
      const mEnd = new Date(parseInt(ym.slice(0,4)), parseInt(ym.slice(5,7)), 0).toISOString().slice(0, 10)

      // Normal alacaklar (customer_subscription kaynaklılar hariç — aşağıda ayrıca eklenir)
      const projInc = receivables
        .filter(r => r.status !== 'paid' && r.due_date && r.due_date >= mStart && r.due_date <= mEnd
          && (r as any).source_type !== 'customer_subscription')
        .reduce((s, r) => s + (r.amount - r.paid_amount), 0)

      // Müşteri abonelik geliri:
      // DB'de o aya ait alacak kaydı varsa onu kullan; yoksa abonelik tutarını doğrudan ekle
      const custSubInc = custSubs.reduce((acc, cs) => {
        const hasRec = receivables.some(r =>
          (r as any).source_id === cs.id &&
          (r as any).source_type === 'customer_subscription' &&
          r.due_date && r.due_date >= mStart && r.due_date <= mEnd
        )
        if (hasRec) {
          // Zaten projInc'te sayılmıyor (source_type filtresi), o alacağı buraya ekle
          const rec = receivables.find(r =>
            (r as any).source_id === cs.id &&
            (r as any).source_type === 'customer_subscription' &&
            r.due_date && r.due_date >= mStart && r.due_date <= mEnd &&
            r.status !== 'paid'
          )
          return acc + (rec ? rec.amount - rec.paid_amount : 0)
        }
        // Alacak kaydı yoksa abonelik tutarını planla
        return acc + cs.amount
      }, 0)

      const projPayRec = payables
        .filter(p => p.status !== 'paid' && p.due_date && p.due_date >= mStart && p.due_date <= mEnd)
        .reduce((s, p) => s + (p.amount - p.paid_amount), 0)

      const subCost = subscriptions.reduce((acc, s) => {
        const nextDate = s.next_billing_date
        if (!nextDate) return acc + s.amount
        if (nextDate >= mStart && nextDate <= mEnd) return acc + s.amount
        return acc
      }, 0)

      const totalInc = projInc + custSubInc
      const projExp = projPayRec + subCost
      return {
        month: monthLabel(ym),
        projectedIncome: totalInc,
        projectedExpense: projExp,
        projectedNet: totalInc - projExp,
        isFuture: ym > now.toISOString().slice(0, 7),
      }
    })
  }, [receivables, payables, subscriptions, custSubs])

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Yükleniyor...</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nakit Akışı</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gerçekleşen ve beklenen nakit hareketleri</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                period === p
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-muted-foreground hover:text-gray-700'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger-children">
        <div className="kpi-card">
          <div className={`kpi-icon mb-3 ${net >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
            <Wallet className={`h-5 w-5 ${net >= 0 ? 'text-emerald-600' : 'text-red-500'}`} />
          </div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Net Nakit Akışı</p>
          <AmountDisplay amount={Math.abs(net)} positive={net >= 0} negative={net < 0} className="text-xl font-bold" />
          <p className="text-xs text-muted-foreground mt-1">{PERIOD_LABELS[period]}</p>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-emerald-50 mb-3"><TrendingUp className="h-5 w-5 text-emerald-600" /></div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Toplam Giriş</p>
          <AmountDisplay amount={totalIn} positive className="text-xl font-bold" />
          <p className="text-xs text-muted-foreground mt-1">{periodTx.filter(t => t.type === 'income').length} işlem</p>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-red-50 mb-3"><TrendingDown className="h-5 w-5 text-red-500" /></div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Toplam Çıkış</p>
          <AmountDisplay amount={totalOut} negative={totalOut > 0} className="text-xl font-bold" />
          <p className="text-xs text-muted-foreground mt-1">{periodTx.filter(t => t.type === 'expense').length} işlem</p>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-amber-50 mb-3"><Clock className="h-5 w-5 text-amber-600" /></div>
          <p className="text-xs font-medium text-muted-foreground mb-1">60 Gün Projeksiyon</p>
          <AmountDisplay amount={projectedIn - projectedOut} positive={projectedIn >= projectedOut} negative={projectedIn < projectedOut} className="text-xl font-bold" />
          <p className="text-xs text-muted-foreground mt-1">
            +{trFmt(projectedIn)} / -{trFmt(projectedOut)}
          </p>
        </div>
      </div>

      {/* Main Chart */}
      <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Aylık Nakit Akışı</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Gelir, gider ve kümülatif net pozisyon</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />Giriş</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-rose-500 inline-block" />Çıkış</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-indigo-500 inline-block rounded" />Kümülatif</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
              tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="income" name="Giriş" fill={INCOME_COLOR} radius={[4, 4, 0, 0]} maxBarSize={32} />
            <Bar dataKey="expense" name="Çıkış" fill={EXPENSE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={32} />
            <Line
              dataKey="cumulative" name="Kümülatif Net"
              stroke={NET_COLOR} strokeWidth={2.5} dot={{ fill: NET_COLOR, r: 3 }}
              type="monotone" strokeDasharray="0"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 6 Aylık Tahmin Grafiği */}
      <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Gelecek 6 Ay — Olası Gelir / Gider</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Planlanan alacaklar, borçlar ve abonelik giderleri dahil projeksiyon</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-teal-500 inline-block" />Olası Gelir</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-orange-400 inline-block" />Olası Gider</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-indigo-500 inline-block rounded" />Net</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={forecastData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
              tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="projectedIncome" name="Olası Gelir" fill="#14b8a6" radius={[4, 4, 0, 0]} maxBarSize={32} fillOpacity={0.8} />
            <Bar dataKey="projectedExpense" name="Olası Gider" fill="#fb923c" radius={[4, 4, 0, 0]} maxBarSize={32} fillOpacity={0.8} />
            <Line
              dataKey="projectedNet" name="Net Projeksiyon"
              stroke="#6366f1" strokeWidth={2.5} dot={{ fill: '#6366f1', r: 3 }}
              type="monotone" strokeDasharray="4 3"
            />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="mt-3 grid grid-cols-3 gap-3 border-t border-gray-50 pt-3">
          {forecastData.slice(0, 6).map(d => (
            <div key={d.month} className={`text-center rounded-xl py-2 px-1 ${d.projectedNet >= 0 ? 'bg-teal-50/60' : 'bg-orange-50/60'}`}>
              <p className="text-[10px] text-muted-foreground font-medium">{d.month}</p>
              <p className={`text-xs font-bold mt-0.5 ${d.projectedNet >= 0 ? 'text-teal-700' : 'text-orange-700'}`}>
                {d.projectedNet >= 0 ? '+' : ''}{trFmt(d.projectedNet)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Category Breakdown + Upcoming */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Income categories */}
        <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Gelir Dağılımı
          </h3>
          {categoryData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Veri yok</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={categoryData} dataKey="value" cx="50%" cy="50%" outerRadius={60} innerRadius={35} paddingAngle={2}>
                    {categoryData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => trFmt(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {categoryData.map(c => (
                  <div key={c.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.fill }} />
                      <span className="text-muted-foreground truncate max-w-[100px]">{c.name}</span>
                    </div>
                    <span className="font-semibold text-emerald-700">{trFmt(c.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Expense categories */}
        <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />Gider Dağılımı
          </h3>
          {expCategoryData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Veri yok</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={expCategoryData} dataKey="value" cx="50%" cy="50%" outerRadius={60} innerRadius={35} paddingAngle={2}>
                    {expCategoryData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => trFmt(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {expCategoryData.map(c => (
                  <div key={c.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.fill }} />
                      <span className="text-muted-foreground truncate max-w-[100px]">{c.name}</span>
                    </div>
                    <span className="font-semibold text-rose-600">{trFmt(c.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Upcoming 60 days */}
        <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-amber-500" /> Yaklaşan (60 gün)
          </h3>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-emerald-50 rounded-xl p-2.5 text-center">
              <p className="text-xs text-emerald-700 font-medium">Tahsilat</p>
              <p className="text-sm font-bold text-emerald-700 mt-0.5">{trFmt(projectedIn)}</p>
              <p className="text-[10px] text-emerald-600">{upcomingRec.length} alacak</p>
            </div>
            <div className="bg-red-50 rounded-xl p-2.5 text-center">
              <p className="text-xs text-red-600 font-medium">Ödeme</p>
              <p className="text-sm font-bold text-red-600 mt-0.5">{trFmt(projectedOut)}</p>
              <p className="text-[10px] text-red-500">{upcomingPay.length} borç + {upcomingSubPay.length} abonelik</p>
            </div>
          </div>
          <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
            {upcomingRec.slice(0, 4).map(r => (
              <div key={`r-${r.id}`} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-emerald-50/50 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <ArrowDownCircle className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                  <span className="truncate text-gray-700">{r.contact_name ?? r.description ?? '—'}</span>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <div className="font-semibold text-emerald-700">{trFmt(r.amount - r.paid_amount)}</div>
                  <div className="text-muted-foreground text-[10px]">{formatDate(r.due_date!)}</div>
                </div>
              </div>
            ))}
            {upcomingPay.slice(0, 4).map(p => (
              <div key={`p-${p.id}`} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-red-50/50 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <ArrowUpCircle className="h-3 w-3 text-red-400 flex-shrink-0" />
                  <span className="truncate text-gray-700">{p.contact_name ?? p.description ?? '—'}</span>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <div className="font-semibold text-red-600">{trFmt(p.amount - p.paid_amount)}</div>
                  <div className="text-muted-foreground text-[10px]">{formatDate(p.due_date!)}</div>
                </div>
              </div>
            ))}
            {upcomingSubPay.map(s => (
              <div key={`s-${s.id}`} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-violet-50/60 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <ArrowUpCircle className="h-3 w-3 text-violet-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <span className="truncate text-gray-700">{s.label}</span>
                    {s.estimated && <span className="ml-1 text-[9px] text-amber-500">tahmini</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <div className="font-semibold text-violet-700">{trFmt(s.amount)}</div>
                  <div className="text-muted-foreground text-[10px]">{formatDate(s.date)}</div>
                </div>
              </div>
            ))}
            {upcomingRec.length === 0 && upcomingPay.length === 0 && upcomingSubPay.length === 0 && (
              <div className="py-6 text-center">
                <p className="text-xs text-muted-foreground">60 gün içinde yaklaşan hareket yok</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transaction List */}
      <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border/40 flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-900 flex-shrink-0">{PERIOD_LABELS[period]} İşlemleri</h2>
          <div className="flex gap-1 ml-auto">
            {(['all', 'income', 'expense'] as const).map(f => (
              <button
                key={f}
                onClick={() => setTypeFilter(f)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  typeFilter === f
                    ? f === 'income' ? 'bg-emerald-100 text-emerald-700'
                      : f === 'expense' ? 'bg-red-100 text-red-700'
                      : 'bg-gray-200 text-gray-700'
                    : 'text-muted-foreground hover:bg-gray-100'
                }`}
              >
                {f === 'all' ? 'Tümü' : f === 'income' ? 'Gelir' : 'Gider'}
              </button>
            ))}
          </div>
          <div className="relative w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Açıklama ara..."
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-50/50">
              <tr>
                {['Tarih', 'Tür', 'Açıklama', 'Kategori', 'Ödeme', 'Tutar'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredTx.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-14 text-center">
                    <Inbox className="h-10 w-10 text-muted-foreground/25 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Bu dönemde işlem bulunamadı</p>
                  </td>
                </tr>
              )}
              {filteredTx.map(t => (
                <tr key={t.id} className="border-b border-border/40 hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">{formatDate(t.transaction_date)}</td>
                  <td className="px-4 py-2.5">
                    {t.type === 'income' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                        <TrendingUp className="h-3 w-3" /> Gelir
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                        <TrendingDown className="h-3 w-3" /> Gider
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 max-w-[200px]">
                    <p className="truncate text-sm font-medium">{t.description ?? '—'}</p>
                    {t.notes && <p className="text-xs text-muted-foreground truncate">{t.notes}</p>}
                  </td>
                  <td className="px-4 py-2.5">
                    {t.category_id ? (
                      <Badge variant="outline" className="text-xs">{catName(t.category_id)}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {t.payment_method ? (
                      <Badge variant="outline" className="text-xs">{t.payment_method}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <AmountDisplay
                      amount={t.amount}
                      positive={t.type === 'income'}
                      negative={t.type === 'expense'}
                      className="font-semibold"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredTx.length > 0 && (
          <div className="px-5 py-3 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground bg-gray-50/50">
            <span>{filteredTx.length} işlem gösteriliyor</span>
            <div className="flex gap-6">
              <span>Toplam Giriş: <AmountDisplay amount={filteredTx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0)} positive className="inline font-semibold" /></span>
              <span>Toplam Çıkış: <AmountDisplay amount={filteredTx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0)} negative className="inline font-semibold" /></span>
              <span>Net: <AmountDisplay amount={filteredTx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0) - filteredTx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0)} positive={net>=0} negative={net<0} className="inline font-bold" /></span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
