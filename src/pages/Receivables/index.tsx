import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Transaction, Contact, CustomerSubscription } from '@/types'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { AmountDisplay } from '@/components/shared/AmountDisplay'
import { formatDate } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Plus, DollarSign, Inbox, Clock, AlertCircle, CheckCircle2, Pencil, Trash2, Users, Upload, FileText } from 'lucide-react'
import { DocAttachButton } from '@/components/shared/DocAttachButton'
import { ImportWizard } from '@/components/shared/ImportWizard'
import { pdf } from '@react-pdf/renderer'
import { ReconciliationPDF } from '@/components/shared/ReconciliationPDF'

type TxWithContact = Transaction & { contact_name?: string }
type CustSubWithContact = CustomerSubscription & { contact_name?: string }

export function ReceivablesPage() {
  const [items, setItems] = useState<TxWithContact[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [cariAlacaklar, setCariAlacaklar] = useState<{ id: string; name: string; current_balance: number }[]>([])
  const [custSubs, setCustSubs] = useState<CustSubWithContact[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<TxWithContact | null>(null)
  const [payTarget, setPayTarget] = useState<TxWithContact | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<string>('bank')
  const [showCustForm, setShowCustForm] = useState(false)
  const [editingCust, setEditingCust] = useState<CustSubWithContact | null>(null)
  const [subPayTarget, setSubPayTarget] = useState<{ cs: CustSubWithContact; rec: TxWithContact } | null>(null)
  const [subPayAmount, setSubPayAmount] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [reconTxIds, setReconTxIds] = useState<Set<string>>(new Set())

  const fetchAll = async () => {
    const today = new Date().toISOString().slice(0, 10)
    // Vadesi geçmiş open kayıtları — transactions tablosunda artık 'open' status kullanıyoruz
    // (legacy 'pending' de overdue'ya alınır)
    await supabase.from('transactions')
      .update({ status: 'open' })
      .eq('type', 'receivable')
      .in('status', ['open'])
      .lt('due_date', today)
      .not('due_date', 'is', null)

    const [r, c, ca, cs, recon] = await Promise.all([
      supabase.from('transactions')
        .select('*, contacts(name)')
        .eq('type', 'receivable')
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('contacts').select('id,name').order('name'),
      supabase.from('contacts').select('id,name,current_balance').eq('is_active', true).gt('current_balance', 0).order('current_balance', { ascending: false }),
      supabase.from('customer_subscriptions').select('*, contacts(name)').order('created_at', { ascending: false }),
      supabase.from('reconciliations').select('transaction_id').not('transaction_id', 'is', null),
    ])
    setItems((r.data ?? []).map((x: any) => ({ ...x, contact_name: x.contacts?.name })))
    setContacts((c.data ?? []) as Contact[])
    setCariAlacaklar(ca.data ?? [])
    setCustSubs((cs.data ?? []).map((x: any) => ({ ...x, contact_name: x.contacts?.name })))
    setReconTxIds(new Set((recon.data ?? []).map((x: any) => x.transaction_id).filter(Boolean)))
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const handlePay = async () => {
    if (!payTarget) return
    const paid = parseFloat(payAmount)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const today = new Date().toISOString().slice(0, 10)
    const newPaid = (payTarget.paid_amount ?? 0) + paid
    const newStatus = newPaid >= payTarget.amount ? 'paid' : 'partial'

    await Promise.all([
      // 1. Payments tablosu — yeni unified kayıt
      supabase.from('payments').insert({
        user_id: user.id, transaction_id: payTarget.id,
        amount: paid, paid_at: today, method: payMethod || 'bank',
      }),
      // 2. Transaction güncelle
      supabase.from('transactions').update({ paid_amount: newPaid, status: newStatus }).eq('id', payTarget.id),
    ])

    // 3. Cari hesap hareketi (trigger → contacts.current_balance günceller)
    if (payTarget.contact_id) {
      await supabase.from('current_account_entries').insert({
        user_id: user.id, contact_id: payTarget.contact_id, entry_type: 'credit',
        amount: paid, description: `Alacak tahsilatı: ${payTarget.description ?? ''}`,
        entry_date: today, related_type: 'transaction', related_id: payTarget.id,
      })
    }
    setPayTarget(null); setPayAmount(''); fetchAll()
  }

  const handleDeleteRec = async (id: string) => {
    if (!confirm('Bu alacak kaydı silinecek. Emin misiniz?')) return
    await supabase.from('transactions').delete().eq('id', id)
    fetchAll()
  }

  const handleSubPay = async () => {
    if (!subPayTarget) return
    const { cs, rec } = subPayTarget
    const paid = parseFloat(subPayAmount)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const today = new Date().toISOString().slice(0, 10)
    const newPaid = (rec.paid_amount ?? 0) + paid
    const newStatus = newPaid >= rec.amount ? 'paid' : 'partial'

    await Promise.all([
      supabase.from('payments').insert({
        user_id: user.id, transaction_id: rec.id,
        amount: paid, paid_at: today, method: 'bank',
      }),
      supabase.from('transactions').update({ paid_amount: newPaid, status: newStatus }).eq('id', rec.id),
    ])
    if (cs.contact_id) {
      await supabase.from('current_account_entries').insert({
        user_id: user.id, contact_id: cs.contact_id, entry_type: 'credit',
        amount: paid, description: `Abonelik tahsilatı: ${cs.plan_name}`,
        entry_date: today, related_type: 'transaction', related_id: rec.id,
      })
    }
    setSubPayTarget(null); setSubPayAmount(''); fetchAll()
  }

  const handleDeleteCust = async (id: string) => {
    if (!confirm('Bu abonelik ve tüm planlanan alacakları silinecek. Emin misiniz?')) return
    // Transactions'taki abonelik kayıtlarını sil
    await supabase.from('transactions').delete().eq('source_id', id).eq('source_type', 'customer_subscription')
    // Legacy receivables tablosundaki kayıtları da temizle
    await supabase.from('receivables').delete().eq('source_id', id).eq('source_type', 'customer_subscription')
    await supabase.from('customer_subscriptions').delete().eq('id', id)
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

  const remaining = (r: TxWithContact) => r.amount - (r.paid_amount ?? 0)
  const totalPending = items.filter(r => r.status === 'open' || r.status === 'pending').reduce((s, r) => s + remaining(r), 0)
  const totalOverdue = items.filter(r => r.status === 'open' && r.due_date && r.due_date < new Date().toISOString().slice(0, 10)).reduce((s, r) => s + remaining(r), 0)
  const totalPaid   = items.filter(r => r.status === 'paid').reduce((s, r) => s + r.amount, 0)

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alacaklar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{items.length} kayıt</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)} className="gap-1.5">
            <Upload className="h-4 w-4" /> Excel Aktar
          </Button>
          <Button onClick={() => { setEditing(null); setShowForm(true) }} className="gap-1.5">
            <Plus className="h-4 w-4" /> Yeni Alacak
          </Button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3 stagger-children">
        <div className="kpi-card">
          <div className="flex items-center gap-3 mb-2">
            <div className="kpi-icon bg-blue-50"><Clock className="h-4 w-4 text-blue-600" /></div>
            <p className="text-xs font-medium text-muted-foreground">Bekleyen</p>
          </div>
          <AmountDisplay amount={totalPending} positive className="text-xl font-bold" />
        </div>
        <div className="kpi-card">
          <div className="flex items-center gap-3 mb-2">
            <div className="kpi-icon bg-red-50"><AlertCircle className="h-4 w-4 text-red-500" /></div>
            <p className="text-xs font-medium text-muted-foreground">Gecikmiş</p>
          </div>
          <AmountDisplay amount={totalOverdue} negative={totalOverdue > 0} className="text-xl font-bold" />
        </div>
        <div className="kpi-card">
          <div className="flex items-center gap-3 mb-2">
            <div className="kpi-icon bg-emerald-50"><CheckCircle2 className="h-4 w-4 text-emerald-600" /></div>
            <p className="text-xs font-medium text-muted-foreground">Tahsil Edildi</p>
          </div>
          <AmountDisplay amount={totalPaid} positive className="text-xl font-bold" />
        </div>
      </div>

      {/* Alacaklar Tablosu */}
      <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-50/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cari</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Açıklama</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vade</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tutar</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ödenen</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kalan</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Durum</th>
              <th className="px-4 py-3 w-28"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="py-14 text-center">
                  <Inbox className="h-10 w-10 text-muted-foreground/25 mx-auto mb-2" />
                  <h3 className="text-sm font-semibold text-gray-900 mb-0.5">Alacak bulunamadı</h3>
                  <p className="text-xs text-muted-foreground">Yeni alacak eklemek için sağ üstteki butona tıklayın.</p>
                </td>
              </tr>
            )}
            {items.map(r => {
              const rem = remaining(r)
              const isOverdue = r.status === 'open' && r.due_date && r.due_date < new Date().toISOString().slice(0, 10)
              return (
                <tr key={r.id} className="border-b border-border/40 hover:bg-primary/[0.02] transition-colors">
                  <td className="px-4 py-2.5 font-medium max-w-[140px] truncate">{r.contact_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground max-w-[160px] truncate">{r.description ?? '—'}</td>
                  <td className="px-4 py-2.5 text-sm whitespace-nowrap">
                    {r.due_date
                      ? <span className={isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}>{formatDate(r.due_date)}</span>
                      : <span className="text-muted-foreground">—</span>
                    }
                  </td>
                  <td className="px-4 py-2.5 text-right"><AmountDisplay amount={r.amount} className="text-sm" /></td>
                  <td className="px-4 py-2.5 text-right"><AmountDisplay amount={r.paid_amount ?? 0} positive className="text-sm" /></td>
                  <td className="px-4 py-2.5 text-right"><AmountDisplay amount={rem} negative={rem > 0} className="text-sm font-semibold" /></td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {/* Ana ödeme durumu */}
                      {r.status === 'paid'
                        ? <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">Ödendi</span>
                        : r.status === 'partial'
                        ? <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-700">Kısmi Ödeme</span>
                        : isOverdue
                        ? <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700">Gecikme</span>
                        : <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">Bekliyor</span>
                      }
                      {/* Fatura kesildi */}
                      {(r as any).fatura_kesildi
                        ? <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-700">Fatura ✓</span>
                        : <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-orange-100 text-orange-600">Fatura yok</span>
                      }
                      {/* Mutabakat etiketi */}
                      {reconTxIds.has(r.id) && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-100 text-indigo-700">Mutabakat</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => { setEditing(r); setShowForm(true) }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeleteRec(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <DocAttachButton
                        relatedType="transaction"
                        relatedId={r.id}
                        entityName={(contacts.find(c => c.id === r.contact_id)?.name) ?? r.description ?? ''}
                        onUpload={async () => {
                          await supabase.from('transactions').update({ fatura_kesildi: true }).eq('id', r.id)
                          fetchAll()
                        }}
                      />
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50" title="Mutabakat PDF"
                        onClick={async () => {
                          const { data: items } = await supabase.from('transaction_items').select('*').eq('transaction_id', r.id).order('sort_order')
                          const contact = contacts.find(c => c.id === r.contact_id) ?? null
                          const refNo = `MUT-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`
                          const blob = await pdf(<ReconciliationPDF tx={r} items={items ?? []} contact={contact} referenceNo={refNo} />).toBlob()
                          const url = URL.createObjectURL(blob)
                          window.open(url, '_blank')
                        }}>
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                      {r.status !== 'paid' && rem > 0 && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => { setPayTarget(r); setPayAmount(String(rem)) }}>
                          <DollarSign className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Cari Hesap Alacakları */}
      {cariAlacaklar.length > 0 && (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-blue-900">Cari Hesap Alacakları</h2>
              <p className="text-xs text-blue-600 mt-0.5">Net cari bakiye</p>
            </div>
            <AmountDisplay amount={cariAlacaklar.reduce((s, c) => s + c.current_balance, 0)} positive className="text-base font-bold" />
          </div>
          <table className="w-full text-sm">
            <thead className="bg-blue-50/40">
              <tr>
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-blue-700 uppercase tracking-wide">Cari Adı</th>
                <th className="px-5 py-2.5 text-right text-xs font-semibold text-blue-700 uppercase tracking-wide">Net Alacak</th>
              </tr>
            </thead>
            <tbody>
              {cariAlacaklar.map(c => (
                <tr key={c.id} className="border-b border-blue-50 hover:bg-blue-50/30 transition-colors">
                  <td className="px-5 py-2.5 font-medium text-gray-900">{c.name}</td>
                  <td className="px-5 py-2.5 text-right"><AmountDisplay amount={c.current_balance} positive className="font-semibold" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Müşteri Abonelikleri */}
      <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="kpi-icon bg-emerald-100"><Users className="h-4 w-4 text-emerald-600" /></div>
            <div>
              <h2 className="text-sm font-bold text-emerald-900">Abonelik Geliri</h2>
              <p className="text-xs text-emerald-600 mt-0.5">Müşteri abonelikleri — 12 aylık planlama</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Aylık Toplam</p>
              <AmountDisplay amount={custSubs.filter(s => s.status === 'active').reduce((a, s) => a + s.amount, 0)} positive className="text-sm font-bold" />
            </div>
            <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditingCust(null); setShowCustForm(true) }}>
              <Plus className="h-4 w-4" /> Abonelik Ekle
            </Button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-emerald-50/30">
            <tr>
              {['Müşteri', 'Plan', 'Ödeme Günü', 'Tutar', 'Sonraki Vade', 'Durum', ''].map(h => (
                <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold text-emerald-700 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {custSubs.length === 0 && (
              <tr><td colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/25" />
                Henüz müşteri aboneliği yok
              </td></tr>
            )}
            {custSubs.map(cs => {
              const nextRec = items
                .filter(r => r.source_id === cs.id && r.source_type === 'customer_subscription' && r.status !== 'paid')
                .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))[0]
              return (
                <tr key={cs.id} className="border-b border-emerald-50 hover:bg-emerald-50/20 transition-colors">
                  <td className="px-5 py-2.5 font-medium">{cs.contact_name ?? '—'}</td>
                  <td className="px-5 py-2.5 text-muted-foreground">{cs.plan_name}</td>
                  <td className="px-5 py-2.5 text-muted-foreground">Her ayın {(cs as any).billing_day ?? 1}'i</td>
                  <td className="px-5 py-2.5"><AmountDisplay amount={cs.amount} positive className="font-semibold" /></td>
                  <td className="px-5 py-2.5 text-muted-foreground">
                    {nextRec
                      ? <span className={`text-xs font-medium ${nextRec.due_date && nextRec.due_date < new Date().toISOString().slice(0,10) ? 'text-red-600' : 'text-amber-600'}`}>
                          {nextRec.due_date ? formatDate(nextRec.due_date) : '—'}
                        </span>
                      : <span className="text-xs text-emerald-600 font-medium">✓ Güncel</span>
                    }
                  </td>
                  <td className="px-5 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cs.status === 'active' ? 'bg-emerald-50 text-emerald-700' : cs.status === 'cancelled' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                      {cs.status === 'active' ? 'Aktif' : cs.status === 'cancelled' ? 'İptal' : 'Durduruldu'}
                    </span>
                  </td>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-0.5">
                      {nextRec && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" title="Tahsil Et"
                          onClick={() => { setSubPayTarget({ cs, rec: nextRec }); setSubPayAmount(String(nextRec.amount - (nextRec.paid_amount ?? 0))) }}>
                          <DollarSign className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => { setEditingCust(cs); setShowCustForm(true) }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeleteCust(cs.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Form — Yeni / Düzenle */}
      {showForm && (
        <ReceivableForm
          contacts={contacts} item={editing}
          onSave={() => { setShowForm(false); setEditing(null); fetchAll() }}
          onClose={() => { setShowForm(false); setEditing(null) }}
        />
      )}

      {showCustForm && (
        <CustomerSubForm
          contacts={contacts} item={editingCust}
          onSave={() => { setShowCustForm(false); setEditingCust(null); fetchAll() }}
          onClose={() => { setShowCustForm(false); setEditingCust(null) }}
        />
      )}

      {/* Tahsilat Dialog */}
      {payTarget && (
        <Dialog open onOpenChange={() => setPayTarget(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Tahsilat Kaydet</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="bg-muted/50 rounded-xl px-4 py-3 space-y-1">
                <p className="text-xs text-muted-foreground">Cari: <span className="font-medium text-foreground">{payTarget.contact_name}</span></p>
                <p className="text-xs text-muted-foreground">Kalan: <AmountDisplay amount={remaining(payTarget)} positive className="inline font-semibold" /></p>
              </div>
              <div className="space-y-1.5">
                <Label>Tahsilat Tutarı (₺)</Label>
                <Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label>Yöntem</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">Banka Transferi</SelectItem>
                    <SelectItem value="cash">Nakit</SelectItem>
                    <SelectItem value="card">Kart</SelectItem>
                    <SelectItem value="check">Çek</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPayTarget(null)}>İptal</Button>
              <Button onClick={handlePay} disabled={!payAmount || parseFloat(payAmount) <= 0}>Kaydet</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {showImport && (
        <ImportWizard
          contacts={contacts}
          onSuccess={() => { setShowImport(false); fetchAll() }}
          onClose={() => setShowImport(false)}
        />
      )}

      {/* Abonelik Tahsilat Dialog */}
      {subPayTarget && (
        <Dialog open onOpenChange={() => setSubPayTarget(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Abonelik Tahsilatı</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="bg-emerald-50 rounded-xl px-4 py-3 space-y-1">
                <p className="text-xs text-muted-foreground">Müşteri: <span className="font-medium text-foreground">{subPayTarget.cs.contact_name}</span></p>
                <p className="text-xs text-muted-foreground">Plan: <span className="font-medium">{subPayTarget.cs.plan_name}</span></p>
                <p className="text-xs text-muted-foreground">Dönem: <span className="font-medium">{subPayTarget.rec.description}</span></p>
                <p className="text-xs text-muted-foreground">Kalan: <AmountDisplay amount={subPayTarget.rec.amount - (subPayTarget.rec.paid_amount ?? 0)} positive className="inline font-semibold" /></p>
              </div>
              <div className="space-y-1.5">
                <Label>Tahsilat Tutarı (₺)</Label>
                <Input type="number" value={subPayAmount} onChange={e => setSubPayAmount(e.target.value)} autoFocus />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSubPayTarget(null)}>İptal</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSubPay} disabled={!subPayAmount || parseFloat(subPayAmount) <= 0}>Kaydet</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function ReceivableForm({ contacts, item, onSave, onClose }: {
  contacts: Contact[]; item: TxWithContact | null; onSave: () => void; onClose: () => void
}) {
  const [form, setForm] = useState({
    contact_id: item?.contact_id ?? '',
    amount: item?.amount?.toString() ?? '',
    kdv_rate: String((item as any)?.kdv_rate ?? 20),
    description: item?.description ?? '',
    due_date: item?.due_date ?? '',
    collection_date: (item as any)?.collection_date ?? '',
    transaction_date: item?.transaction_date ?? new Date().toISOString().slice(0, 10),
    invoice_number: item?.invoice_number ?? '',
    notes: item?.notes ?? '',
    status: item?.status ?? 'open',
    fatura_kesildi: (item as any)?.fatura_kesildi ?? false,
  })
  const [loading, setLoading] = useState(false)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const netAmount = parseFloat(form.amount) || 0
  const kdvRate   = parseFloat(form.kdv_rate) || 0
  const kdvAmount = Math.round(netAmount * kdvRate) / 100
  const total     = netAmount + kdvAmount

  const handleSave = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = {
      user_id: user.id,
      type: 'receivable' as const,
      contact_id: form.contact_id || null,
      amount: parseFloat(form.amount),
      kdv_rate: parseFloat(form.kdv_rate) || 0,
      description: form.description || null,
      due_date: form.due_date || null,
      collection_date: form.collection_date || null,
      fatura_kesildi: form.fatura_kesildi,
      transaction_date: form.transaction_date,
      invoice_number: form.invoice_number || null,
      notes: form.notes || null,
      status: form.status,
      currency: 'TRY',
      paid_amount: item?.paid_amount ?? 0,
    }
    if (item) {
      await supabase.from('transactions').update(payload).eq('id', item.id)
    } else {
      const { data: inserted } = await supabase.from('transactions').insert(payload).select().single()
      if (inserted && form.contact_id) {
        await supabase.from('current_account_entries').insert({
          user_id: user.id, contact_id: form.contact_id, entry_type: 'debit',
          amount: parseFloat(form.amount),
          description: form.description || 'Alacak kaydı',
          entry_date: form.transaction_date,
          related_type: 'transaction', related_id: inserted.id,
        })
      }
    }
    setLoading(false); onSave()
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{item ? 'Alacak Düzenle' : 'Yeni Alacak'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Cari</Label>
            <Select value={form.contact_id} onValueChange={v => set('contact_id', v)}>
              <SelectTrigger><SelectValue placeholder="Seçin" /></SelectTrigger>
              <SelectContent>{contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Matrah (KDV Hariç) *</Label><Input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Durum</Label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Bekliyor</SelectItem>
                  <SelectItem value="partial">Kısmi</SelectItem>
                  <SelectItem value="paid">Ödendi</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* KDV */}
          <div className="space-y-2">
            <Label>KDV Oranı</Label>
            <div className="flex gap-2">
              {['0','10','20'].map(r => (
                <button key={r} type="button"
                  onClick={() => set('kdv_rate', r)}
                  className="flex-1 py-1.5 rounded-lg text-sm font-semibold border transition-all"
                  style={{
                    borderColor: form.kdv_rate === r ? '#00cfc3' : '#dde6f0',
                    background: form.kdv_rate === r ? 'rgba(0,207,195,0.08)' : 'white',
                    color: form.kdv_rate === r ? '#00a89d' : '#6b8aad',
                  }}>
                  %{r}
                </button>
              ))}
            </div>
            {netAmount > 0 && (
              <div className="rounded-lg bg-gray-50 border border-border/40 px-3 py-2 text-xs space-y-1">
                <div className="flex justify-between text-muted-foreground"><span>Matrah</span><span>₺{netAmount.toLocaleString('tr-TR', {minimumFractionDigits:2})}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>KDV %{kdvRate}</span><span>₺{kdvAmount.toLocaleString('tr-TR', {minimumFractionDigits:2})}</span></div>
                <div className="flex justify-between font-semibold text-gray-900 border-t border-border/40 pt-1"><span>Toplam</span><span>₺{total.toLocaleString('tr-TR', {minimumFractionDigits:2})}</span></div>
              </div>
            )}
          </div>
          <div className="space-y-1.5"><Label>Açıklama</Label><Input value={form.description} onChange={e => set('description', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Düzenleme Tarihi</Label><Input type="date" value={form.transaction_date} onChange={e => set('transaction_date', e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Vade Tarihi *</Label>
              <Input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)}
                className={!form.due_date ? 'border-red-300' : ''} />
              {!form.due_date && <p className="text-xs text-red-500">Nakit akışı için zorunludur.</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Tahsilat Tarihi</Label>
            <Input type="date" value={form.collection_date} onChange={e => set('collection_date', e.target.value)} />
            <p className="text-xs text-muted-foreground">Tahsilat yapıldığında veya planlandığında girilir.</p>
          </div>
          <div className="space-y-1.5"><Label>Fatura No</Label><Input value={form.invoice_number} onChange={e => set('invoice_number', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Notlar</Label><Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} /></div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={form.fatura_kesildi} onChange={e => setForm(f => ({ ...f, fatura_kesildi: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
            <span className="text-sm font-medium text-gray-700">Fatura kesildi</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button onClick={handleSave} disabled={loading || !form.amount || !form.due_date}>
            {loading ? 'Kaydediliyor...' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CustomerSubForm({ contacts, item, onSave, onClose }: {
  contacts: Contact[]; item: CustSubWithContact | null; onSave: () => void; onClose: () => void
}) {
  const today = new Date()
  const [form, setForm] = useState({
    contact_id: item?.contact_id ?? '',
    plan_name: item?.plan_name ?? '',
    amount: item?.amount?.toString() ?? '',
    billing_day: String((item as any)?.billing_day ?? '1'),
    start_date: item?.start_date ?? today.toISOString().slice(0, 10),
    status: item?.status ?? 'active',
    notes: item?.notes ?? '',
  })
  const [loading, setLoading] = useState(false)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const amount = parseFloat(form.amount)
    const billingDay = Math.min(28, Math.max(1, parseInt(form.billing_day) || 1))
    const startDate = new Date(form.start_date)
    const payload = {
      user_id: user.id, contact_id: form.contact_id, plan_name: form.plan_name,
      amount, billing_cycle: 'monthly' as const, billing_day: billingDay,
      start_date: form.start_date, next_billing_date: form.start_date,
      status: form.status as any, notes: form.notes || null, currency: 'TRY',
    }
    if (item) {
      await supabase.from('customer_subscriptions').update(payload).eq('id', item.id)
    } else {
      const { data: inserted } = await supabase.from('customer_subscriptions').insert(payload).select().single()
      if (inserted) {
        const MONTHS_TR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
        const recs = []
        for (let i = 0; i < 12; i++) {
          const dueYear = ((startDate.getMonth() + i) >= 12)
            ? startDate.getFullYear() + Math.floor((startDate.getMonth() + i) / 12)
            : startDate.getFullYear()
          const dueMonth = ((startDate.getMonth() + i) % 12) + 1
          const maxDay = new Date(dueYear, dueMonth, 0).getDate()
          const dueDay = Math.min(billingDay, maxDay)
          const dueDateStr = `${dueYear}-${String(dueMonth).padStart(2,'0')}-${String(dueDay).padStart(2,'0')}`
          recs.push({
            user_id: user.id, contact_id: form.contact_id,
            type: 'receivable', amount, currency: 'TRY',
            description: `${form.plan_name} — ${MONTHS_TR[dueMonth-1]} ${dueYear}`,
            source_type: 'customer_subscription', source_id: inserted.id,
            transaction_date: form.start_date, due_date: dueDateStr, paid_amount: 0,
            status: dueDateStr < today.toISOString().slice(0, 10) ? 'open' : 'open',
          })
        }
        await supabase.from('transactions').insert(recs)
      }
    }
    setLoading(false); onSave()
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{item ? 'Abonelik Düzenle' : 'Müşteri Aboneliği Ekle'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Müşteri *</Label>
            <Select value={form.contact_id} onValueChange={v => set('contact_id', v)}>
              <SelectTrigger><SelectValue placeholder="Seçin" /></SelectTrigger>
              <SelectContent>{contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Plan Adı *</Label><Input value={form.plan_name} onChange={e => set('plan_name', e.target.value)} placeholder="Aylık Eğitim Paketi" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Aylık Tutar (₺) *</Label><Input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Her Ayın Kaçı? *</Label>
              <Input type="number" min="1" max="28" value={form.billing_day} onChange={e => set('billing_day', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Başlangıç</Label><Input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Durum</Label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="paused">Durduruldu</SelectItem>
                  <SelectItem value="cancelled">İptal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Notlar</Label><Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} /></div>
          {!item && (
            <p className="text-xs bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl px-3 py-2">
              12 aylık alacak planı otomatik oluşturulacak.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button onClick={handleSave} disabled={loading || !form.contact_id || !form.plan_name || !form.amount}>
            {loading ? 'Kaydediliyor...' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
