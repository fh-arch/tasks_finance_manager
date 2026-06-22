import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { PeriodClosing } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AmountDisplay } from '@/components/shared/AmountDisplay'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { CalendarCheck, TrendingUp, TrendingDown, ArrowRight, Lock, RotateCcw, AlertCircle } from 'lucide-react'

const MONTH_NAMES = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']

function monthLabel(year: number, month: number) {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

// Generate last 13 months (current + 12 previous)
function generateMonths() {
  const now = new Date()
  const months: { year: number; month: number }[] = []
  for (let i = 0; i < 13; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  return months
}

export function PeriodClosingsPage() {
  const [closings, setClosings] = useState<PeriodClosing[]>([])
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState<{ year: number; month: number } | null>(null)
  const [preview, setPreview] = useState<{
    income: number; expense: number; withdrawals: number; openingBalance: number
  } | null>(null)
  const [closeForm, setCloseForm] = useState({ opening_balance: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)

  const months = generateMonths()

  const fetchAll = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('period_closings').select('*').eq('user_id', user.id).order('period_year', { ascending: false }).order('period_month', { ascending: false })
    setClosings((data ?? []) as PeriodClosing[])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const getClosing = (year: number, month: number) =>
    closings.find(c => c.period_year === year && c.period_month === month)

  const openCloseDialog = async (year: number, month: number) => {
    setClosing({ year, month })
    setLoadingPreview(true)

    // Find previous month's closing balance for opening balance suggestion
    const prev = new Date(year, month - 2, 1)
    const prevClosing = getClosing(prev.getFullYear(), prev.getMonth() + 1)
    const suggestedOpening = prevClosing ? prevClosing.closing_balance : 0

    // Calculate month's transactions
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).toISOString().slice(0, 10)

    const [txRes, wdRes] = await Promise.all([
      supabase.from('transactions').select('type,amount').eq('status', 'completed')
        .gte('transaction_date', startDate).lte('transaction_date', endDate),
      supabase.from('partner_withdrawals').select('amount')
        .gte('withdrawal_date', startDate).lte('withdrawal_date', endDate),
    ])

    const txData = txRes.data ?? []
    const income = txData.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount), 0)
    const expense = txData.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0)
    const withdrawals = (wdRes.data ?? []).reduce((s: number, w: any) => s + Number(w.amount), 0)

    setPreview({ income, expense, withdrawals, openingBalance: suggestedOpening })
    setCloseForm({ opening_balance: suggestedOpening.toString(), notes: '' })
    setLoadingPreview(false)
  }

  const handleClose = async () => {
    if (!closing || !preview) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const openingBalance = parseFloat(closeForm.opening_balance) || 0
    const closingBalance = openingBalance + preview.income - preview.expense - preview.withdrawals

    await supabase.from('period_closings').upsert({
      user_id: user.id,
      period_year: closing.year,
      period_month: closing.month,
      opening_balance: openingBalance,
      total_income: preview.income,
      total_expense: preview.expense,
      total_withdrawals: preview.withdrawals,
      closing_balance: closingBalance,
      status: 'closed',
      notes: closeForm.notes || null,
      closed_at: new Date().toISOString(),
    }, { onConflict: 'user_id,period_year,period_month' })

    setSaving(false); setClosing(null); setPreview(null); fetchAll()
  }

  const handleReopen = async (c: PeriodClosing) => {
    if (!window.confirm('Bu dönemi yeniden açmak istiyor musunuz?')) return
    await supabase.from('period_closings').update({ status: 'reopened' }).eq('id', c.id)
    fetchAll()
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Yükleniyor...</p>
      </div>
    </div>
  )

  const totalClosed = closings.filter(c => c.status === 'closed').length
  const latestClosing = closings.find(c => c.status === 'closed')
  const currentMonthClosed = !!getClosing(new Date().getFullYear(), new Date().getMonth() + 1)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dönem Kapatma</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Aylık kapanış ve bakiye devri</p>
        </div>
        {!currentMonthClosed && (
          <Button onClick={() => openCloseDialog(new Date().getFullYear(), new Date().getMonth() + 1)} className="gap-1.5">
            <CalendarCheck className="h-4 w-4" /> Bu Ayı Kapat
          </Button>
        )}
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger-children">
        <div className="kpi-card">
          <div className="kpi-icon bg-indigo-50 mb-3"><CalendarCheck className="h-5 w-5 text-indigo-600" /></div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Kapalı Dönem</p>
          <p className="text-xl font-bold text-gray-900">{totalClosed}</p>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-emerald-50 mb-3"><TrendingUp className="h-5 w-5 text-emerald-600" /></div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Son Kapanış Bakiyesi</p>
          {latestClosing
            ? <AmountDisplay amount={latestClosing.closing_balance} positive={latestClosing.closing_balance >= 0} negative={latestClosing.closing_balance < 0} className="text-xl font-bold" />
            : <p className="text-xl font-bold text-gray-400">—</p>}
          {latestClosing && <p className="text-xs text-muted-foreground mt-0.5">{monthLabel(latestClosing.period_year, latestClosing.period_month)}</p>}
        </div>
        <div className="kpi-card">
          <div className={`kpi-icon mb-3 ${currentMonthClosed ? 'bg-emerald-50' : 'bg-amber-50'}`}>
            {currentMonthClosed
              ? <Lock className="h-5 w-5 text-emerald-600" />
              : <AlertCircle className="h-5 w-5 text-amber-600" />}
          </div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Bu Ay</p>
          <p className={`text-sm font-semibold ${currentMonthClosed ? 'text-emerald-600' : 'text-amber-600'}`}>
            {currentMonthClosed ? 'Kapatıldı' : 'Henüz Açık'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{monthLabel(new Date().getFullYear(), new Date().getMonth() + 1)}</p>
        </div>
      </div>

      {/* Month List */}
      <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border/40">
          <h2 className="text-sm font-semibold">Aylık Dönemler</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-50/50">
              <tr>
                {['Dönem', 'Açılış Bakiyesi', 'Gelir', 'Gider', 'Ortak Çıkışı', 'Net', 'Kapanış Bakiyesi', 'Durum', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map(({ year, month }) => {
                const c = getClosing(year, month)
                const isCurrent = year === new Date().getFullYear() && month === new Date().getMonth() + 1
                return (
                  <tr key={`${year}-${month}`} className={`border-b border-border/40 hover:bg-primary/[0.02] transition-colors ${isCurrent ? 'bg-indigo-50/30' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{monthLabel(year, month)}</span>
                        {isCurrent && <Badge variant="info" className="text-xs">Güncel</Badge>}
                      </div>
                    </td>
                    {c ? (
                      <>
                        <td className="px-4 py-3"><AmountDisplay amount={c.opening_balance} positive={c.opening_balance >= 0} negative={c.opening_balance < 0} className="text-sm" /></td>
                        <td className="px-4 py-3"><AmountDisplay amount={c.total_income} positive className="text-sm" /></td>
                        <td className="px-4 py-3"><AmountDisplay amount={c.total_expense} negative className="text-sm" /></td>
                        <td className="px-4 py-3"><AmountDisplay amount={c.total_withdrawals} negative={c.total_withdrawals > 0} className="text-sm" /></td>
                        <td className="px-4 py-3">
                          <AmountDisplay
                            amount={Math.abs(c.total_income - c.total_expense - c.total_withdrawals)}
                            positive={c.total_income - c.total_expense - c.total_withdrawals >= 0}
                            negative={c.total_income - c.total_expense - c.total_withdrawals < 0}
                            className="text-sm font-semibold"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <AmountDisplay amount={c.closing_balance} positive={c.closing_balance >= 0} negative={c.closing_balance < 0} className="text-sm font-bold" />
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={c.status === 'closed' ? 'success' : 'warning'} className="gap-1">
                            {c.status === 'closed' ? <><Lock className="h-3 w-3" />Kapalı</> : <><RotateCcw className="h-3 w-3" />Açık</>}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {c.status === 'closed' ? (
                            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7" onClick={() => handleReopen(c)}>
                              <RotateCcw className="h-3 w-3 mr-1" />Yeniden Aç
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => openCloseDialog(year, month)}>
                              <Lock className="h-3 w-3 mr-1" />Kapat
                            </Button>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-muted-foreground">—</td>
                        <td className="px-4 py-3 text-muted-foreground">—</td>
                        <td className="px-4 py-3 text-muted-foreground">—</td>
                        <td className="px-4 py-3 text-muted-foreground">—</td>
                        <td className="px-4 py-3 text-muted-foreground">—</td>
                        <td className="px-4 py-3 text-muted-foreground">—</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-xs">Açık</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => openCloseDialog(year, month)}>
                            <Lock className="h-3 w-3 mr-1" />Kapat
                          </Button>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Close Dialog */}
      {closing && (
        <Dialog open onOpenChange={() => { setClosing(null); setPreview(null) }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-indigo-600" />
                {monthLabel(closing.year, closing.month)} Dönemini Kapat
              </DialogTitle>
            </DialogHeader>

            {loadingPreview ? (
              <div className="py-8 text-center">
                <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Veriler hesaplanıyor...</p>
              </div>
            ) : preview && (
              <div className="space-y-4">
                {/* Preview */}
                <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Açılış Bakiyesi</span>
                    <AmountDisplay amount={parseFloat(closeForm.opening_balance) || 0} positive={(parseFloat(closeForm.opening_balance) || 0) >= 0} negative={(parseFloat(closeForm.opening_balance) || 0) < 0} />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-emerald-600 flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" />Toplam Gelir</span>
                    <AmountDisplay amount={preview.income} positive />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-red-500 flex items-center gap-1"><TrendingDown className="h-3.5 w-3.5" />Toplam Gider</span>
                    <AmountDisplay amount={preview.expense} negative />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-amber-600">Ortak Para Çıkışı</span>
                    <AmountDisplay amount={preview.withdrawals} negative={preview.withdrawals > 0} />
                  </div>
                  <div className="border-t border-border/60 pt-2 flex justify-between items-center font-semibold">
                    <span>Kapanış Bakiyesi</span>
                    <AmountDisplay
                      amount={Math.abs((parseFloat(closeForm.opening_balance) || 0) + preview.income - preview.expense - preview.withdrawals)}
                      positive={(parseFloat(closeForm.opening_balance) || 0) + preview.income - preview.expense - preview.withdrawals >= 0}
                      negative={(parseFloat(closeForm.opening_balance) || 0) + preview.income - preview.expense - preview.withdrawals < 0}
                      className="text-base"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Açılış Bakiyesi (₺)</Label>
                  <Input
                    type="number"
                    value={closeForm.opening_balance}
                    onChange={e => setCloseForm(f => ({ ...f, opening_balance: e.target.value }))}
                    placeholder="Önceki aydan devreden bakiye"
                  />
                  <p className="text-xs text-muted-foreground">Önceki ayın kapanış bakiyesi otomatik getirildi. Değiştirebilirsiniz.</p>
                </div>

                <div className="space-y-1.5">
                  <Label>Dönem Notu</Label>
                  <Textarea value={closeForm.notes} onChange={e => setCloseForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Önemli notlar..." />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => { setClosing(null); setPreview(null) }}>İptal</Button>
              <Button onClick={handleClose} disabled={saving || loadingPreview || !preview}>
                <Lock className="h-4 w-4 mr-1.5" />{saving ? 'Kaydediliyor...' : 'Dönemi Kapat'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
