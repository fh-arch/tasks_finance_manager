import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Quote } from '@/types'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { AmountDisplay } from '@/components/shared/AmountDisplay'
import { formatDate } from '@/lib/utils'
import { QuoteForm } from './QuoteForm'
import { Plus, FileText, CheckCircle2, Clock, XCircle, Download } from 'lucide-react'
import { exportQuotePdf } from '@/lib/pdfExport'
import { useAppStore } from '@/store/useAppStore'

type QuoteWithContact = Quote & { contact_name?: string }

export function QuotesPage() {
  const profile = useAppStore((s) => s.profile)
  const [quotes, setQuotes] = useState<QuoteWithContact[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Quote | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)

  const fetchQuotes = async () => {
    const { data } = await supabase.from('quotes').select('*, contacts(name)').order('created_at', { ascending: false })
    setQuotes((data ?? []).map((q: any) => ({ ...q, contact_name: q.contacts?.name })))
    setLoading(false)
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger-children">
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
