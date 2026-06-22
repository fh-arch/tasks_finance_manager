import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AmountDisplay } from '@/components/shared/AmountDisplay'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TrendingUp, TrendingDown, BarChart2, PieChart as PieChartIcon } from 'lucide-react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns'
import { tr } from 'date-fns/locale'

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

export function ReportsPage() {
  const [period, setPeriod] = useState('0')
  const [incomeByCategory, setIncomeByCategory] = useState<{ name: string; value: number }[]>([])
  const [expenseByCategory, setExpenseByCategory] = useState<{ name: string; value: number }[]>([])
  const [agingData, setAgingData] = useState({ '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 })
  const [totals, setTotals] = useState({ income: 0, expense: 0 })

  useEffect(() => {
    const fetchReports = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const now = new Date()
      const d = subMonths(now, parseInt(period))
      const start = startOfMonth(d).toISOString()
      const end = endOfMonth(d).toISOString()

      const [txRes, recRes] = await Promise.all([
        supabase.from('transactions').select('type,amount,categories(name)').eq('user_id', user.id).eq('status', 'completed').gte('transaction_date', start).lte('transaction_date', end),
        supabase.from('receivables').select('amount,due_date').eq('user_id', user.id).in('status', ['pending', 'partial', 'overdue']),
      ])

      const txs: any[] = txRes.data ?? []
      const income = txs.filter((t) => t.type === 'income')
      const expense = txs.filter((t) => t.type === 'expense')

      const groupBy = (arr: any[]) => {
        const map: Record<string, number> = {}
        arr.forEach((t) => { const k = t.categories?.name ?? 'Diğer'; map[k] = (map[k] ?? 0) + t.amount })
        return Object.entries(map).map(([name, value]) => ({ name, value }))
      }

      setIncomeByCategory(groupBy(income))
      setExpenseByCategory(groupBy(expense))
      setTotals({ income: income.reduce((s, t) => s + t.amount, 0), expense: expense.reduce((s, t) => s + t.amount, 0) })

      const today = new Date()
      const aging = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
      ;(recRes.data ?? []).forEach((r: any) => {
        if (!r.due_date) return
        const days = Math.floor((today.getTime() - new Date(r.due_date).getTime()) / 86400000)
        if (days <= 30) aging['0-30'] += r.amount
        else if (days <= 60) aging['31-60'] += r.amount
        else if (days <= 90) aging['61-90'] += r.amount
        else aging['90+'] += r.amount
      })
      setAgingData(aging)
    }
    fetchReports()
  }, [period])

  const months = Array.from({ length: 12 }, (_, i) => ({ value: i.toString(), label: format(subMonths(new Date(), i), 'MMMM yyyy', { locale: tr }) }))
  const net = totals.income - totals.expense

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Raporlar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Finansal analizler ve dönem raporları</p>
        </div>
        <div className="flex items-center gap-3 bg-white rounded-2xl border border-border/50 px-4 py-3 shadow-sm">
          <span className="text-sm text-muted-foreground font-medium">Dönem:</span>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-48 border-0 shadow-none p-0 h-auto focus:ring-0"><SelectValue /></SelectTrigger>
            <SelectContent>{months.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger-children">
        <div className="kpi-card">
          <div className="flex items-start justify-between mb-3">
            <div className="kpi-icon bg-emerald-50"><TrendingUp className="h-5 w-5 text-emerald-600" /></div>
          </div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Toplam Gelir</p>
          <AmountDisplay amount={totals.income} positive className="text-2xl font-bold" />
        </div>
        <div className="kpi-card">
          <div className="flex items-start justify-between mb-3">
            <div className="kpi-icon bg-red-50"><TrendingDown className="h-5 w-5 text-red-500" /></div>
          </div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Toplam Gider</p>
          <AmountDisplay amount={totals.expense} negative className="text-2xl font-bold" />
        </div>
        <div className={`kpi-card ${net >= 0 ? 'bg-gradient-to-br from-emerald-50 to-white' : 'bg-gradient-to-br from-red-50 to-white'}`}>
          <div className="flex items-start justify-between mb-3">
            <div className={`kpi-icon ${net >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
              {net >= 0
                ? <TrendingUp className="h-5 w-5 text-emerald-600" />
                : <TrendingDown className="h-5 w-5 text-red-500" />
              }
            </div>
          </div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Net Kâr / Zarar</p>
          <AmountDisplay amount={Math.abs(net)} positive={net >= 0} negative={net < 0} className="text-2xl font-bold" />
        </div>
      </div>

      {/* Pie charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="kpi-icon bg-emerald-50"><PieChartIcon className="h-4 w-4 text-emerald-600" /></div>
            <h3 className="text-sm font-semibold text-gray-900">Gelir — Kategori Dağılımı</h3>
          </div>
          {incomeByCategory.length === 0 ? (
            <div className="py-10 text-center">
              <PieChartIcon className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Bu dönem için veri yok</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={incomeByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                  {incomeByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => typeof v === 'number' ? `₺${v.toLocaleString('tr-TR')}` : ''} contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb' }} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="kpi-icon bg-red-50"><PieChartIcon className="h-4 w-4 text-red-500" /></div>
            <h3 className="text-sm font-semibold text-gray-900">Gider — Kategori Dağılımı</h3>
          </div>
          {expenseByCategory.length === 0 ? (
            <div className="py-10 text-center">
              <PieChartIcon className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Bu dönem için veri yok</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={expenseByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                  {expenseByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => typeof v === 'number' ? `₺${v.toLocaleString('tr-TR')}` : ''} contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb' }} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Aging chart */}
      <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="kpi-icon bg-amber-50"><BarChart2 className="h-4 w-4 text-amber-600" /></div>
          <h3 className="text-sm font-semibold text-gray-900">Alacak Yaşlandırma Raporu</h3>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={Object.entries(agingData).map(([name, value]) => ({ name, value }))} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} tickFormatter={(v) => `${v} gün`} />
            <YAxis tickFormatter={(v) => `₺${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
            <Tooltip formatter={(v) => typeof v === 'number' ? `₺${v.toLocaleString('tr-TR')}` : ''} contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb' }} />
            <Bar dataKey="value" fill="#f59e0b" radius={[6, 6, 0, 0]} name="Alacak" />
          </BarChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-4 gap-3 mt-4">
          {Object.entries(agingData).map(([k, v]) => (
            <div key={k} className="text-center p-3 rounded-xl bg-amber-50/50 border border-amber-100">
              <p className="text-xs text-muted-foreground font-medium mb-1">{k} gün</p>
              <AmountDisplay amount={v} negative={v > 0} className="text-sm font-semibold" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
