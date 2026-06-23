import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AmountDisplay } from '@/components/shared/AmountDisplay'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import { TrendingUp, TrendingDown, Clock, AlertCircle, CalendarClock, AlertTriangle } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { tr } from 'date-fns/locale'

interface Stats {
  monthlyIncome: number
  monthlyExpense: number
  pendingReceivables: number
  pendingPayables: number
  upcomingSubscriptions: { name: string; amount: number; next_billing_date: string }[]
  overdueReceivables: { description: string; amount: number; due_date: string }[]
  chartData: { month: string; gelir: number; gider: number }[]
}

interface DetailItem {
  id?: string
  label: string
  sub?: string
  amount: number
  date?: string
  status?: string
  positive?: boolean
  negative?: boolean
}

type PanelType = 'income' | 'expense' | 'receivables' | 'payables' | null

const panelTitles: Record<string, string> = {
  income: 'Bu Ay Gelir İşlemleri',
  expense: 'Bu Ay Gider İşlemleri',
  receivables: 'Bekleyen Alacaklar (Tüm Kaynaklar)',
  payables: 'Bekleyen Borçlar (Tüm Kaynaklar)',
}

export function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    monthlyIncome: 0, monthlyExpense: 0, pendingReceivables: 0, pendingPayables: 0,
    upcomingSubscriptions: [], overdueReceivables: [], chartData: [],
  })
  const [loading, setLoading] = useState(true)
  const [activePanel, setActivePanel] = useState<PanelType>(null)
  const [detailItems, setDetailItems] = useState<DetailItem[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    const fetchStats = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const now = new Date()
      const start = startOfMonth(now).toISOString()
      const end = endOfMonth(now).toISOString()

      const [incomeRes, expenseRes, recNoContact, payNoContact, subsRes, allSubsRes, overdueRes, contactsRes, personnelRes, personnelPayRes] = await Promise.all([
        supabase.from('transactions').select('amount').eq('user_id', user.id).eq('type', 'income').eq('status', 'completed').gte('transaction_date', start).lte('transaction_date', end),
        supabase.from('transactions').select('amount').eq('user_id', user.id).eq('type', 'expense').eq('status', 'completed').gte('transaction_date', start).lte('transaction_date', end),
        supabase.from('receivables').select('amount,paid_amount').eq('user_id', user.id).in('status', ['pending', 'partial', 'overdue']).is('contact_id', null),
        supabase.from('payables').select('amount,paid_amount').eq('user_id', user.id).in('status', ['pending', 'partial', 'overdue']).is('contact_id', null),
        supabase.from('subscriptions').select('name,amount,next_billing_date').eq('user_id', user.id).eq('status', 'active').lte('next_billing_date', format(new Date(now.getTime() + 7 * 86400000), 'yyyy-MM-dd')),
        supabase.from('subscriptions').select('name,amount,billing_cycle,next_billing_date').eq('user_id', user.id).eq('status', 'active'),
        supabase.from('receivables').select('description,amount,due_date').eq('user_id', user.id).eq('status', 'overdue').order('due_date').limit(5),
        supabase.from('contacts').select('current_balance').eq('user_id', user.id).eq('is_active', true).neq('current_balance', 0),
        supabase.from('personnel').select('id,name,type,base_salary,base_bonus,ara_odeme,hire_date,termination_date,son_odeme_gunu').eq('user_id', user.id).eq('is_active', true),
        supabase.from('personnel_payments').select('personnel_id,payment_type,period_month,period_year').eq('user_id', user.id),
      ])

      const monthlyIncome = (incomeRes.data ?? []).reduce((s, r) => s + r.amount, 0)
      const monthlyExpense = (expenseRes.data ?? []).reduce((s, r) => s + r.amount, 0)
      const cariAlacak = (contactsRes.data ?? []).filter((c: any) => c.current_balance > 0).reduce((s: number, c: any) => s + c.current_balance, 0)
      const cariBorc = (contactsRes.data ?? []).filter((c: any) => c.current_balance < 0).reduce((s: number, c: any) => s + Math.abs(c.current_balance), 0)
      const noContactRec = (recNoContact.data ?? []).reduce((s, r) => s + (r.amount - (r.paid_amount ?? 0)), 0)
      const noContactPay = (payNoContact.data ?? []).reduce((s, r) => s + (r.amount - (r.paid_amount ?? 0)), 0)
      const subscriptionTotal = (allSubsRes.data ?? []).reduce((s: number, sub: any) => s + sub.amount, 0)

      // Ödenmemiş personel ödemeleri — son 3 ay
      const allPersonnel = (personnelRes.data ?? []) as any[]
      const allPersonnelPays = (personnelPayRes.data ?? []) as any[]
      let personnelUnpaid = 0
      const todayDay = now.getDate()
      for (let i = 0; i <= 2; i++) {
        const d = subMonths(now, i)
        const m = d.getMonth() + 1
        const y = d.getFullYear()
        const mStart = `${y}-${String(m).padStart(2,'0')}-01`
        const mEnd = new Date(y, m, 0).toISOString().slice(0, 10)
        const isPastMonth = i > 0
        for (const p of allPersonnel) {
          if (p.termination_date && p.termination_date < mStart) continue
          if (p.hire_date && p.hire_date > mEnd) continue
          // Son ödeme günü kontrolü: geçmiş aylar her zaman borç,
          // bu ay için yalnızca son_odeme_gunu geçmişse borç sayılır
          const dueDay = p.son_odeme_gunu
          if (!isPastMonth && dueDay && todayDay < dueDay) continue
          const paid = (type: string) => allPersonnelPays.some((pay: any) =>
            pay.personnel_id === p.id && pay.payment_type === type && pay.period_month === m && pay.period_year === y)
          if (p.type === 'employee') {
            if (Number(p.base_salary) > 0 && !paid('salary'))  personnelUnpaid += Number(p.base_salary)
            if (Number(p.base_bonus)  > 0 && !paid('bonus'))   personnelUnpaid += Number(p.base_bonus)
          } else {
            const expected = Number(p.ara_odeme) || Number(p.base_salary) || 0
            if (expected > 0 && !paid('freelance')) personnelUnpaid += expected
          }
        }
      }

      const pendingReceivables = cariAlacak + noContactRec
      const pendingPayables = cariBorc + noContactPay + subscriptionTotal + personnelUnpaid

      const chartData = await Promise.all(
        Array.from({ length: 6 }).map(async (_, i) => {
          const d = subMonths(now, 5 - i)
          const s = startOfMonth(d).toISOString()
          const e = endOfMonth(d).toISOString()
          const [inc, exp] = await Promise.all([
            supabase.from('transactions').select('amount').eq('user_id', user.id).eq('type', 'income').eq('status', 'completed').gte('transaction_date', s).lte('transaction_date', e),
            supabase.from('transactions').select('amount').eq('user_id', user.id).eq('type', 'expense').eq('status', 'completed').gte('transaction_date', s).lte('transaction_date', e),
          ])
          return {
            month: format(d, 'MMM', { locale: tr }),
            gelir: (inc.data ?? []).reduce((a, r) => a + r.amount, 0),
            gider: (exp.data ?? []).reduce((a, r) => a + r.amount, 0),
          }
        })
      )

      setStats({
        monthlyIncome, monthlyExpense, pendingReceivables, pendingPayables,
        upcomingSubscriptions: subsRes.data ?? [],
        overdueReceivables: overdueRes.data ?? [],
        chartData,
      })
      setLoading(false)
    }
    fetchStats()
  }, [])

  const openPanel = async (type: PanelType) => {
    if (!type) return
    setActivePanel(type)
    setDetailLoading(true)
    setDetailItems([])

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setDetailLoading(false); return }

    const now = new Date()
    const start = startOfMonth(now).toISOString()
    const end = endOfMonth(now).toISOString()

    if (type === 'income') {
      const { data } = await supabase
        .from('transactions')
        .select('id,description,amount,transaction_date,payment_method,contacts(name)')
        .eq('user_id', user.id).eq('type', 'income').eq('status', 'completed')
        .gte('transaction_date', start).lte('transaction_date', end)
        .order('transaction_date', { ascending: false })
      setDetailItems((data ?? []).map((r: any) => ({
        id: r.id,
        label: r.description ?? 'Gelir',
        sub: r.contacts?.name ?? r.payment_method ?? '',
        amount: r.amount,
        date: r.transaction_date,
        positive: true,
      })))
    } else if (type === 'expense') {
      const { data } = await supabase
        .from('transactions')
        .select('id,description,amount,transaction_date,payment_method,contacts(name)')
        .eq('user_id', user.id).eq('type', 'expense').eq('status', 'completed')
        .gte('transaction_date', start).lte('transaction_date', end)
        .order('transaction_date', { ascending: false })
      setDetailItems((data ?? []).map((r: any) => ({
        id: r.id,
        label: r.description ?? 'Gider',
        sub: r.contacts?.name ?? r.payment_method ?? '',
        amount: r.amount,
        date: r.transaction_date,
        negative: true,
      })))
    } else if (type === 'receivables') {
      // Cari bakiyesi pozitif olan tüm cariler
      const [contactsData, recData] = await Promise.all([
        supabase.from('contacts').select('id,name,current_balance').eq('user_id', user.id).eq('is_active', true).gt('current_balance', 0).order('current_balance', { ascending: false }),
        supabase.from('receivables').select('id,description,amount,paid_amount,due_date,status').eq('user_id', user.id).in('status', ['pending', 'partial', 'overdue']).is('contact_id', null).order('due_date'),
      ])
      const contactItems: DetailItem[] = (contactsData.data ?? []).map((c: any) => ({
        id: c.id, label: c.name, sub: 'Cari Hesap Bakiyesi', amount: c.current_balance, positive: true,
      }))
      const recItems: DetailItem[] = (recData.data ?? []).map((r: any) => ({
        id: r.id, label: r.description ?? 'Alacak', sub: 'Carisi Yok', amount: r.amount - (r.paid_amount ?? 0), date: r.due_date, status: r.status, positive: true,
      }))
      setDetailItems([...contactItems, ...recItems])
    } else if (type === 'payables') {
      const today = new Date().toISOString().slice(0, 10)
      const in30 = new Date(); in30.setDate(in30.getDate() + 30)
      const in30str = in30.toISOString().slice(0, 10)
      const nowD = new Date()
      const [contactsData, payData, subsData, personnelData, personnelPayData] = await Promise.all([
        supabase.from('contacts').select('id,name,current_balance').eq('user_id', user.id).eq('is_active', true).lt('current_balance', 0).order('current_balance'),
        supabase.from('payables').select('id,description,amount,paid_amount,due_date,status').eq('user_id', user.id).in('status', ['pending', 'partial', 'overdue']).is('contact_id', null).order('due_date'),
        supabase.from('subscriptions').select('id,name,amount,billing_cycle,next_billing_date').eq('user_id', user.id).eq('status', 'active').order('next_billing_date'),
        supabase.from('personnel').select('id,name,type,base_salary,base_bonus,ara_odeme,hire_date,termination_date,son_odeme_gunu').eq('user_id', user.id).eq('is_active', true),
        supabase.from('personnel_payments').select('personnel_id,payment_type,period_month,period_year').eq('user_id', user.id),
      ])
      const contactItems: DetailItem[] = (contactsData.data ?? []).map((c: any) => ({
        id: c.id, label: c.name, sub: 'Cari Hesap Bakiyesi', amount: Math.abs(c.current_balance), negative: true,
      }))
      const payItems: DetailItem[] = (payData.data ?? []).map((r: any) => ({
        id: r.id, label: r.description ?? 'Borç', sub: 'Carisi Yok', amount: r.amount - (r.paid_amount ?? 0), date: r.due_date, status: r.status, negative: true,
      }))
      const CYCLE_TR: Record<string, string> = { monthly: 'Aylık', quarterly: '3 Aylık', yearly: 'Yıllık' }
      const subItems: DetailItem[] = (subsData.data ?? []).map((s: any) => ({
        id: s.id, label: s.name, sub: `Abonelik · ${CYCLE_TR[s.billing_cycle] ?? s.billing_cycle}`,
        amount: s.amount, date: s.next_billing_date && s.next_billing_date >= today ? s.next_billing_date : in30str, negative: true,
      }))
      // Ödenmemiş personel ödemeleri — son 3 ay
      const personnelItems: DetailItem[] = []
      const pList = (personnelData.data ?? []) as any[]
      const pPays = (personnelPayData.data ?? []) as any[]
      const MONTHS_TR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
      const todayDayD = nowD.getDate()
      for (let i = 0; i <= 2; i++) {
        const d = subMonths(nowD, i)
        const m = d.getMonth() + 1
        const y = d.getFullYear()
        const mLabel = `${MONTHS_TR[m-1]} ${y}`
        const mStart = `${y}-${String(m).padStart(2,'0')}-01`
        const mEnd = new Date(y, m, 0).toISOString().slice(0, 10)
        const isPastMonth = i > 0
        for (const p of pList) {
          if (p.termination_date && p.termination_date < mStart) continue
          if (p.hire_date && p.hire_date > mEnd) continue
          const dueDay = p.son_odeme_gunu
          if (!isPastMonth && dueDay && todayDayD < dueDay) continue
          const paid = (ptype: string) => pPays.some((pay: any) =>
            pay.personnel_id === p.id && pay.payment_type === ptype && pay.period_month === m && pay.period_year === y)
          const dueDateStr = dueDay ? `${y}-${String(m).padStart(2,'0')}-${String(dueDay).padStart(2,'0')}` : undefined
          const subLabel = dueDay ? `Personel · ${mLabel} · Son gün: ${dueDay}` : `Personel · ${mLabel}`
          const subLabelFr = dueDay ? `Serbest Öğretmen · ${mLabel} · Son gün: ${dueDay}` : `Serbest Öğretmen · ${mLabel}`
          if (p.type === 'employee') {
            if (Number(p.base_salary) > 0 && !paid('salary'))
              personnelItems.push({ id: `${p.id}-sal-${m}-${y}`, label: `${p.name} — Maaş`, sub: subLabel, amount: Number(p.base_salary), date: dueDateStr, negative: true })
            if (Number(p.base_bonus) > 0 && !paid('bonus'))
              personnelItems.push({ id: `${p.id}-bon-${m}-${y}`, label: `${p.name} — Prim`, sub: subLabel, amount: Number(p.base_bonus), date: dueDateStr, negative: true })
          } else {
            const expected = Number(p.ara_odeme) || Number(p.base_salary) || 0
            if (expected > 0 && !paid('freelance'))
              personnelItems.push({ id: `${p.id}-fr-${m}-${y}`, label: `${p.name} — Serbest Ödeme`, sub: subLabelFr, amount: expected, date: dueDateStr, negative: true })
          }
        }
      }
      setDetailItems([...contactItems, ...payItems, ...subItems, ...personnelItems])
    }
    setDetailLoading(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Yükleniyor...</p>
      </div>
    </div>
  )

  const netBalance = stats.monthlyIncome - stats.monthlyExpense

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero — Net Balance */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-600 p-6 text-white shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative z-10 flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm font-medium text-indigo-100">Bu Ay Net Bakiye</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight">
                {netBalance >= 0 ? '+' : ''}₺{Math.abs(netBalance).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <p className="text-xs text-indigo-200 mt-1">Gelir - Gider = Net</p>
          </div>
          <div className="flex gap-4 text-sm">
            <div className="text-right">
              <p className="text-indigo-200 text-xs">Gelir</p>
              <p className="font-semibold text-emerald-300">+₺{stats.monthlyIncome.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="text-right">
              <p className="text-indigo-200 text-xs">Gider</p>
              <p className="font-semibold text-red-300">-₺{stats.monthlyExpense.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        {[
          { label: 'Bu Ay Gelir', amount: stats.monthlyIncome, positive: true, icon: TrendingUp, bg: 'bg-emerald-50', text: 'text-emerald-600', panel: 'income' as PanelType },
          { label: 'Bu Ay Gider', amount: stats.monthlyExpense, negative: true, icon: TrendingDown, bg: 'bg-red-50', text: 'text-red-600', panel: 'expense' as PanelType },
          { label: 'Bekleyen Alacaklar', amount: stats.pendingReceivables, positive: true, icon: Clock, bg: 'bg-blue-50', text: 'text-blue-600', panel: 'receivables' as PanelType },
          { label: 'Bekleyen Borçlar', amount: stats.pendingPayables, negative: true, icon: AlertCircle, bg: 'bg-amber-50', text: 'text-amber-600', panel: 'payables' as PanelType },
        ].map(({ label, amount, positive, negative, icon: Icon, bg, text, panel }) => (
          <div
            key={panel}
            onClick={() => openPanel(panel)}
            className="kpi-card cursor-pointer group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`kpi-icon ${bg}`}>
                <Icon className={`h-5 w-5 ${text}`} />
              </div>
              <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors">Detay →</span>
            </div>
            <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
            <AmountDisplay amount={amount} positive={positive} negative={negative} className="text-2xl font-bold" />
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-5">Son 6 Ay — Gelir / Gider</h2>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={stats.chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
            <YAxis tickFormatter={(v) => `₺${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
            <Tooltip
              formatter={(v) => typeof v === 'number' ? `₺${v.toLocaleString('tr-TR')}` : ''}
              contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Bar dataKey="gelir" fill="#22c55e" radius={[6, 6, 0, 0]} name="Gelir" />
            <Bar dataKey="gider" fill="#ef4444" radius={[6, 6, 0, 0]} name="Gider" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-modern p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="kpi-icon bg-violet-50">
              <CalendarClock className="h-4 w-4 text-violet-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">Yaklaşan Abonelik Ödemeleri</h3>
            <span className="ml-auto text-xs text-muted-foreground">7 gün</span>
          </div>
          {stats.upcomingSubscriptions.length === 0 ? (
            <div className="py-6 text-center">
              <CalendarClock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Yaklaşan ödeme yok</p>
            </div>
          ) : (
            <div className="space-y-1">
              {stats.upcomingSubscriptions.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(s.next_billing_date)}</p>
                  </div>
                  <AmountDisplay amount={s.amount} negative />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card-modern p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="kpi-icon bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">Gecikmiş Alacaklar</h3>
          </div>
          {stats.overdueReceivables.length === 0 ? (
            <div className="py-6 text-center">
              <AlertTriangle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Gecikmiş alacak yok</p>
            </div>
          ) : (
            <div className="space-y-1">
              {stats.overdueReceivables.map((r, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{r.description ?? '—'}</p>
                    <p className="text-xs text-red-500 font-medium">Vade: {r.due_date ? formatDate(r.due_date) : '—'}</p>
                  </div>
                  <AmountDisplay amount={r.amount} positive />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!activePanel} onOpenChange={(open) => !open && setActivePanel(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{activePanel ? panelTitles[activePanel] : ''}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {detailLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Yükleniyor...</p>
                </div>
              </div>
            ) : detailItems.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">Kayıt bulunamadı</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b bg-gradient-to-r from-gray-50 to-gray-50/50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Açıklama</th>
                    {(activePanel === 'receivables' || activePanel === 'payables') && (
                      <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cari</th>
                    )}
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {activePanel === 'receivables' || activePanel === 'payables' ? 'Vade' : 'Tarih'}
                    </th>
                    {(activePanel === 'receivables' || activePanel === 'payables') && (
                      <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Durum</th>
                    )}
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {detailItems.map((item, i) => (
                    <tr key={item.id ?? i} className="border-b border-border/40 hover:bg-primary/[0.02] transition-colors">
                      <td className="px-4 py-2.5 font-medium">{item.label}</td>
                      {(activePanel === 'receivables' || activePanel === 'payables') && (
                        <td className="px-4 py-2.5 text-muted-foreground">{item.sub || '—'}</td>
                      )}
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {item.date ? formatDate(item.date) : '—'}
                        {activePanel === 'payables' && item.status === 'overdue' && (
                          <span className="ml-1 text-xs text-red-500">Gecikmiş</span>
                        )}
                      </td>
                      {(activePanel === 'receivables' || activePanel === 'payables') && (
                        <td className="px-4 py-2.5">
                          {item.status && <StatusBadge status={item.status} />}
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-right">
                        <AmountDisplay amount={item.amount} positive={item.positive} negative={item.negative} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-gray-50 font-semibold">
                    <td className="px-4 py-2.5" colSpan={(activePanel === 'receivables' || activePanel === 'payables') ? 3 : 1}>Toplam</td>
                    {(activePanel === 'receivables' || activePanel === 'payables') && <td />}
                    <td className="px-4 py-2.5 text-right">
                      <AmountDisplay
                        amount={detailItems.reduce((s, i) => s + i.amount, 0)}
                        positive={activePanel === 'income' || activePanel === 'receivables'}
                        negative={activePanel === 'expense' || activePanel === 'payables'}
                      />
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
