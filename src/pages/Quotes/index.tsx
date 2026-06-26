import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Quote } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { AmountDisplay } from '@/components/shared/AmountDisplay'
import { formatDate } from '@/lib/utils'
import { QuoteForm } from './QuoteForm'
import { Plus, FileText, CheckCircle2, Clock, XCircle, Download, Banknote, Target, Pencil, X } from 'lucide-react'
import { exportQuotePdf } from '@/lib/pdfExport'
import { useAppStore } from '@/store/useAppStore'

type QuoteWithContact = Quote & { contact_name?: string }
type PeriodType = 'monthly' | 'quarterly' | 'yearly'
type QuoteTarget = { id?: string; period_type: PeriodType; period_year: number; period_num: number; amount_target: number; count_target: number }

function getPeriodLabel(type: PeriodType, year: number, num: number) {
  if (type === 'monthly') return `${['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'][num-1]} ${year}`
  if (type === 'quarterly') return `${year} Q${num}`
  return `${year} Yıllık`
}

export function QuotesPage() {
  const profile = useAppStore((s) => s.profile)
  const [quotes, setQuotes] = useState<QuoteWithContact[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Quote | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [monthlyLeadQuotes, setMonthlyLeadQuotes] = useState<{ full_name: string; company: string | null; quote_amount: number; quote_date: string | null }[]>([])

  const now = new Date()
  const [activePeriod, setActivePeriod] = useState<PeriodType>('monthly')
  const [targets, setTargets] = useState<QuoteTarget[]>([])
  const [editingTarget, setEditingTarget] = useState(false)
  const [targetForm, setTargetForm] = useState({ amount_target: '', count_target: '' })

  const currentPeriodNum = activePeriod === 'monthly' ? now.getMonth() + 1 : activePeriod === 'quarterly' ? Math.ceil((now.getMonth() + 1) / 3) : 1
  const currentTarget = targets.find(t => t.period_type === activePeriod && t.period_year === now.getFullYear() && t.period_num === currentPeriodNum)

  const fetchQuotes = async () => {
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
    const { data: { user } } = await supabase.auth.getUser()

    // Lead'lerden eksik teklifleri otomatik oluştur
    if (user) {
      const { data: leadsWithAmount } = await supabase.from('leads')
        .select('id,full_name,company,quote_amount,quote_date')
        .not('quote_amount', 'is', null)
        .eq('user_id', user.id)
      if (leadsWithAmount) {
        for (const lead of leadsWithAmount) {
          const { data: existing } = await supabase.from('quotes')
            .select('id').eq('source_type', 'lead').eq('source_id', lead.id).maybeSingle()
          if (!existing) {
            const qNum = `Q-${new Date().getFullYear()}-${lead.id.slice(-4)}`
            await supabase.from('quotes').insert({
              user_id: user.id,
              quote_number: qNum,
              title: `${lead.full_name}${lead.company ? ' – ' + lead.company : ''} Teklifi`,
              issue_date: lead.quote_date ?? new Date().toISOString().slice(0, 10),
              status: 'sent',
              subtotal: lead.quote_amount,
              tax_rate: 0, tax_amount: 0,
              total: lead.quote_amount,
              currency: 'TRY',
              notes: 'Müşteri adayından otomatik oluşturuldu.',
              source_type: 'lead',
              source_id: lead.id,
            })
          }
        }
      }
    }

    const [qRes, lRes, tRes] = await Promise.all([
      supabase.from('quotes').select('*, contacts(name)').order('created_at', { ascending: false }),
      supabase.from('leads').select('full_name,company,quote_amount,quote_date')
        .not('quote_amount', 'is', null)
        .gte('quote_date', monthStart)
        .lte('quote_date', monthEnd)
        .order('quote_date', { ascending: false }),
      supabase.from('quote_targets').select('*').eq('period_year', now.getFullYear()),
    ])
    setQuotes((qRes.data ?? []).map((q: any) => ({ ...q, contact_name: q.contacts?.name })))
    setMonthlyLeadQuotes((lRes.data ?? []) as any)
    setTargets((tRes.data ?? []) as QuoteTarget[])
    setLoading(false)
  }

  const saveTarget = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = {
      user_id: user.id,
      period_type: activePeriod,
      period_year: now.getFullYear(),
      period_num: currentPeriodNum,
      amount_target: Number(targetForm.amount_target) || 0,
      count_target: Number(targetForm.count_target) || 0,
    }
    await supabase.from('quote_targets').upsert(payload, { onConflict: 'user_id,period_type,period_year,period_num' })
    setEditingTarget(false)
    fetchQuotes()
  }

  const handleExportPdf = async (q: QuoteWithContact) => {
    setExportingId(q.id)
    const { data: items } = await supabase.from('quote_items').select('*').eq('quote_id', q.id).order('sort_order')
    exportQuotePdf(
      q,
      items ?? [],
      q.contact_name ?? '—',
      profile?.company_name ?? '',
      profile?.logo_url ?? null,
      {
        address: (profile as any)?.company_address,
        phone: (profile as any)?.company_phone,
        email: (profile as any)?.company_email,
        taxNo: (profile as any)?.company_tax_no,
      }
    )
    setExportingId(null)
  }

  useEffect(() => { fetchQuotes() }, [])

  const handleConvert = async (quote: Quote) => {
    if (!confirm('Bu teklifi alacağa dönüştürmek istediğinizden emin misiniz?')) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: rec } = await supabase.from('receivables').insert({
      user_id: user.id, contact_id: quote.contact_id,
      amount: quote.total ?? 0, currency: quote.currency,
      description: quote.title, source_type: 'quote', source_id: quote.id,
      issue_date: new Date().toISOString().slice(0, 10),
    }).select().single()

    if (rec) {
      await supabase.from('quotes').update({ status: 'accepted', converted_to_receivable: true, receivable_id: rec.id }).eq('id', quote.id)
      if (quote.contact_id) {
        await supabase.from('current_account_entries').insert({
          user_id: user.id, contact_id: quote.contact_id,
          entry_type: 'debit', amount: quote.total ?? 0,
          description: `Teklif: ${quote.quote_number}`,
          entry_date: new Date().toISOString().slice(0, 10),
          related_type: 'quote', related_id: quote.id,
        })
      }
    }
    fetchQuotes()
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Yükleniyor...</p>
      </div>
    </div>
  )

  // KPI summary
  const totalDraft = quotes.filter((q) => q.status === 'draft' || q.status === 'sent').reduce((s, q) => s + (q.total ?? 0), 0)
  const totalAccepted = quotes.filter((q) => q.status === 'accepted').reduce((s, q) => s + (q.total ?? 0), 0)
  const totalRejected = quotes.filter((q) => q.status === 'rejected' || q.status === 'expired').reduce((s, q) => s + (q.total ?? 0), 0)

  // Dönem bazlı gerçekleşme (aktif periyot için quotes filtrele)
  const periodQuotes = (() => {
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    const q = Math.ceil(m / 3)
    return quotes.filter(qt => {
      const d = qt.issue_date ?? qt.created_at?.slice(0, 10) ?? ''
      if (!d) return false
      const [dy, dm] = d.split('-').map(Number)
      if (dy !== y) return false
      if (activePeriod === 'monthly') return dm === m
      if (activePeriod === 'quarterly') return Math.ceil(dm / 3) === q
      return true
    })
  })()
  const periodTotal = periodQuotes.reduce((s, q) => s + (q.total ?? 0), 0)
  const periodCount = periodQuotes.length
  const amountPct = currentTarget?.amount_target ? Math.min(100, Math.round((periodTotal / currentTarget.amount_target) * 100)) : null
  const countPct  = currentTarget?.count_target  ? Math.min(100, Math.round((periodCount  / currentTarget.count_target)  * 100)) : null

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teklifler</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{quotes.length} teklif listeleniyor</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true) }} className="gap-1.5">
          <Plus className="h-4 w-4" /> Yeni Teklif
        </Button>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        <div className="kpi-card">
          <div className="flex items-start justify-between mb-3">
            <div className="kpi-icon bg-blue-50"><Clock className="h-5 w-5 text-blue-600" /></div>
          </div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Bekleyen Teklifler</p>
          <AmountDisplay amount={totalDraft} className="text-xl font-bold" />
        </div>
        <div className="kpi-card">
          <div className="flex items-start justify-between mb-3">
            <div className="kpi-icon bg-emerald-50"><CheckCircle2 className="h-5 w-5 text-emerald-600" /></div>
          </div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Kabul Edilen</p>
          <AmountDisplay amount={totalAccepted} positive className="text-xl font-bold" />
        </div>
        <div className="kpi-card">
          <div className="flex items-start justify-between mb-3">
            <div className="kpi-icon bg-red-50"><XCircle className="h-5 w-5 text-red-500" /></div>
          </div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Reddedilen / Süresi Geçen</p>
          <AmountDisplay amount={totalRejected} negative={totalRejected > 0} className="text-xl font-bold" />
        </div>
        <div className="kpi-card border-amber-100 bg-amber-50/20">
          <div className="flex items-start justify-between mb-3">
            <div className="kpi-icon bg-amber-50"><Banknote className="h-5 w-5 text-amber-600" /></div>
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">{monthlyLeadQuotes.length} aday</span>
          </div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Bu Ay Aday Teklifleri</p>
          <p className="text-xl font-bold text-amber-700">
            ₺{monthlyLeadQuotes.reduce((s, l) => s + l.quote_amount, 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </p>
          {monthlyLeadQuotes.length > 0 && (
            <div className="mt-2 space-y-0.5 max-h-20 overflow-y-auto">
              {monthlyLeadQuotes.map((l, i) => (
                <div key={i} className="flex justify-between text-[10px] text-muted-foreground">
                  <span className="truncate max-w-[100px]">{l.full_name}{l.company ? ` · ${l.company}` : ''}</span>
                  <span className="font-medium text-amber-700 flex-shrink-0 ml-1">₺{l.quote_amount.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Hedef Takip Paneli */}
      <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-violet-600" />
            <span className="text-sm font-semibold text-gray-900">Hedef Takibi</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Dönem seçici */}
            <div className="flex rounded-lg border border-border/60 overflow-hidden text-xs">
              {(['monthly','quarterly','yearly'] as PeriodType[]).map(p => (
                <button key={p} onClick={() => setActivePeriod(p)}
                  className={`px-3 py-1.5 font-medium transition-colors ${activePeriod === p ? 'bg-violet-600 text-white' : 'text-muted-foreground hover:bg-gray-50'}`}>
                  {p === 'monthly' ? 'Aylık' : p === 'quarterly' ? 'Çeyreklik' : 'Yıllık'}
                </button>
              ))}
            </div>
            {!editingTarget ? (
              <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs"
                onClick={() => { setTargetForm({ amount_target: String(currentTarget?.amount_target ?? ''), count_target: String(currentTarget?.count_target ?? '') }); setEditingTarget(true) }}>
                <Pencil className="h-3 w-3" /> Hedef Gir
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs text-red-500" onClick={() => setEditingTarget(false)}>
                <X className="h-3 w-3" /> İptal
              </Button>
            )}
          </div>
        </div>
        <div className="p-5">
          <p className="text-xs text-muted-foreground mb-4">{getPeriodLabel(activePeriod, now.getFullYear(), currentPeriodNum)}</p>

          {editingTarget ? (
            <div className="flex gap-3 items-end">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Tutar Hedefi (₺)</p>
                <Input type="number" value={targetForm.amount_target} onChange={e => setTargetForm(f => ({ ...f, amount_target: e.target.value }))} placeholder="0" className="w-40 h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Adet Hedefi</p>
                <Input type="number" value={targetForm.count_target} onChange={e => setTargetForm(f => ({ ...f, count_target: e.target.value }))} placeholder="0" className="w-28 h-8 text-sm" />
              </div>
              <Button size="sm" onClick={saveTarget} className="h-8">Kaydet</Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6">
              {/* Tutar KPI */}
              <div>
                <div className="flex justify-between items-baseline mb-1.5">
                  <p className="text-xs font-medium text-gray-700">Teklif Tutarı</p>
                  {amountPct !== null && (
                    <span className={`text-xs font-bold ${amountPct >= 100 ? 'text-emerald-600' : amountPct >= 60 ? 'text-amber-600' : 'text-red-500'}`}>{amountPct}%</span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-lg font-bold text-gray-900">₺{periodTotal.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}</span>
                  {currentTarget?.amount_target ? (
                    <span className="text-xs text-muted-foreground">/ ₺{currentTarget.amount_target.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}</span>
                  ) : <span className="text-xs text-muted-foreground italic">Hedef girilmemiş</span>}
                </div>
                {currentTarget?.amount_target ? (
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${amountPct! >= 100 ? 'bg-emerald-500' : amountPct! >= 60 ? 'bg-amber-500' : 'bg-red-400'}`}
                      style={{ width: `${amountPct}%` }} />
                  </div>
                ) : (
                  <div className="h-2 rounded-full bg-gray-100" />
                )}
              </div>

              {/* Adet KPI */}
              <div>
                <div className="flex justify-between items-baseline mb-1.5">
                  <p className="text-xs font-medium text-gray-700">Teklif Adedi</p>
                  {countPct !== null && (
                    <span className={`text-xs font-bold ${countPct >= 100 ? 'text-emerald-600' : countPct >= 60 ? 'text-amber-600' : 'text-red-500'}`}>{countPct}%</span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-lg font-bold text-gray-900">{periodCount}</span>
                  {currentTarget?.count_target ? (
                    <span className="text-xs text-muted-foreground">/ {currentTarget.count_target} teklif</span>
                  ) : <span className="text-xs text-muted-foreground italic">Hedef girilmemiş</span>}
                </div>
                {currentTarget?.count_target ? (
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${countPct! >= 100 ? 'bg-emerald-500' : countPct! >= 60 ? 'bg-amber-500' : 'bg-red-400'}`}
                      style={{ width: `${countPct}%` }} />
                  </div>
                ) : (
                  <div className="h-2 rounded-full bg-gray-100" />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-50/50">
            <tr>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">No</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Başlık</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tarih</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Geçerlilik</th>
              <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Toplam</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Durum</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {quotes.length === 0 && (
              <tr>
                <td colSpan={7} className="py-16 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground/25 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">Teklif bulunamadı</h3>
                  <p className="text-xs text-muted-foreground">Yeni teklif oluşturmak için yukarıdaki butona tıklayın.</p>
                </td>
              </tr>
            )}
            {quotes.map((q) => (
              <tr key={q.id} className="border-b border-border/40 hover:bg-primary/[0.02] transition-colors">
                <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{q.quote_number}</td>
                <td className="px-5 py-3 font-medium">{q.title}</td>
                <td className="px-5 py-3 text-muted-foreground">{formatDate(q.issue_date)}</td>
                <td className="px-5 py-3 text-muted-foreground">{q.valid_until ? formatDate(q.valid_until) : '—'}</td>
                <td className="px-5 py-3 text-right font-medium"><AmountDisplay amount={q.total ?? 0} /></td>
                <td className="px-5 py-3"><StatusBadge status={q.status} /></td>
                <td className="px-5 py-3">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(q); setShowForm(true) }}>Düzenle</Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => handleExportPdf(q)}
                      disabled={exportingId === q.id}
                      className="gap-1 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                    >
                      <Download className="h-3 w-3" /> PDF
                    </Button>
                    {!q.converted_to_receivable && q.status !== 'rejected' && q.status !== 'expired' && (
                      <Button variant="outline" size="sm" onClick={() => handleConvert(q)} className="gap-1">
                        <FileText className="h-3 w-3" /> Dönüştür
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && <QuoteForm quote={editing} onSave={() => { setShowForm(false); setEditing(null); fetchQuotes() }} onClose={() => { setShowForm(false); setEditing(null) }} />}
    </div>
  )
}
