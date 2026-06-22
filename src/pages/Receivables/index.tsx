import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Receivable, Contact } from '@/types'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { SourceBadge } from '@/components/shared/SourceBadge'
import { AmountDisplay } from '@/components/shared/AmountDisplay'
import { formatDate } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Plus, DollarSign, Inbox, Clock, AlertCircle, CheckCircle2, Pencil } from 'lucide-react'
import { DocAttachButton } from '@/components/shared/DocAttachButton'

type RecWithContact = Receivable & { contact_name?: string }

export function ReceivablesPage() {
  const [items, setItems] = useState<RecWithContact[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [cariAlacaklar, setCariAlacaklar] = useState<{ id: string; name: string; current_balance: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Receivable | null>(null)
  const [payTarget, setPayTarget] = useState<RecWithContact | null>(null)
  const [payAmount, setPayAmount] = useState('')

  const fetchAll = async () => {
    const today = new Date().toISOString().slice(0, 10)
    // Vadesi geçmiş pending/partial kayıtları otomatik overdue'ya çek
    await supabase.from('receivables')
      .update({ status: 'overdue' })
      .in('status', ['pending', 'partial'])
      .lt('due_date', today)
      .not('due_date', 'is', null)
    const [r, c, ca] = await Promise.all([
      supabase.from('receivables').select('*, contacts(name)').order('due_date'),
      supabase.from('contacts').select('id,name').order('name'),
      supabase.from('contacts').select('id,name,current_balance').eq('is_active', true).gt('current_balance', 0).order('current_balance', { ascending: false }),
    ])
    setItems((r.data ?? []).map((x: any) => ({ ...x, contact_name: x.contacts?.name })))
    setContacts((c.data ?? []) as Contact[])
    setCariAlacaklar(ca.data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const handlePartialPay = async () => {
    if (!payTarget) return
    const paid = parseFloat(payAmount)
    const newPaid = payTarget.paid_amount + paid
    const newStatus = newPaid >= payTarget.amount ? 'paid' : 'partial'
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const today = new Date().toISOString().slice(0, 10)
    await supabase.from('receivables').update({ paid_amount: newPaid, status: newStatus }).eq('id', payTarget.id)
    if (payTarget.contact_id) {
      await supabase.from('current_account_entries').insert({
        user_id: user.id, contact_id: payTarget.contact_id, entry_type: 'credit',
        amount: paid, description: `Alacak tahsilatı: ${payTarget.description ?? ''}`,
        entry_date: today, related_type: 'receivable', related_id: payTarget.id,
      })
    }
    // Gelir işlemine yansıt
    await supabase.from('transactions').insert({
      user_id: user.id, type: 'income', contact_id: payTarget.contact_id ?? null,
      amount: paid, description: `Alacak tahsilatı: ${payTarget.description ?? ''}`,
      transaction_date: today, status: 'completed', currency: 'TRY',
    })
    setPayTarget(null); setPayAmount(''); fetchAll()
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Yükleniyor...</p>
      </div>
    </div>
  )

  const totalPending = items.filter((r) => r.status === 'pending').reduce((s, r) => s + (r.amount - r.paid_amount), 0)
  const totalOverdue = items.filter((r) => r.status === 'overdue').reduce((s, r) => s + (r.amount - r.paid_amount), 0)
  const totalPaid = items.filter((r) => r.status === 'paid').reduce((s, r) => s + r.amount, 0)

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alacaklar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{items.length} kayıt</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true) }} className="gap-1.5">
          <Plus className="h-4 w-4" /> Yeni Alacak
        </Button>
      </div>

      {/* KPI Cards */}
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

      {/* Table */}
      <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-50/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cari / Kaynak</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Açıklama</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vade</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tutar</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ödenen</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kalan</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Durum</th>
              <th className="px-4 py-3 w-16"></th>
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
            {items.map((r) => (
              <tr key={r.id} className="border-b border-border/40 hover:bg-primary/[0.02] transition-colors">
                {/* Cari + Kaynak badge */}
                <td className="px-4 py-2.5">
                  <p className="font-medium text-sm truncate max-w-[180px]" title={r.contact_name ?? ''}>{r.contact_name ?? '—'}</p>
                  <span className="mt-0.5 inline-block"><SourceBadge source={r.source_type} /></span>
                </td>
                <td className="px-4 py-2.5 max-w-[160px]">
                  <p className="text-sm text-muted-foreground truncate" title={r.description ?? ''}>{r.description ?? '—'}</p>
                </td>
                <td className="px-4 py-2.5 text-sm text-muted-foreground whitespace-nowrap">
                  {r.due_date ? formatDate(r.due_date) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right"><AmountDisplay amount={r.amount} className="text-sm" /></td>
                <td className="px-4 py-2.5 text-right"><AmountDisplay amount={r.paid_amount} positive className="text-sm" /></td>
                <td className="px-4 py-2.5 text-right"><AmountDisplay amount={r.amount - r.paid_amount} negative={r.amount - r.paid_amount > 0} className="text-sm font-semibold" /></td>
                <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => { setEditing(r); setShowForm(true) }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <DocAttachButton relatedType="receivable" relatedId={r.id} />
                    {r.status !== 'paid' && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => { setPayTarget(r); setPayAmount('') }}>
                        <DollarSign className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cari Hesap Alacakları */}
      {cariAlacaklar.length > 0 && (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-blue-900">Cari Hesap Alacakları</h2>
              <p className="text-xs text-blue-600 mt-0.5">Cari hareketlerden kaynaklanan bakiyeler — resmi alacak kaydı olmayan tutarlar da dahildir</p>
            </div>
            <AmountDisplay
              amount={cariAlacaklar.reduce((s, c) => s + c.current_balance, 0)}
              positive
              className="text-base font-bold"
            />
          </div>
          <table className="w-full text-sm">
            <thead className="bg-blue-50/40">
              <tr>
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-blue-700 uppercase tracking-wide">Cari Adı</th>
                <th className="px-5 py-2.5 text-right text-xs font-semibold text-blue-700 uppercase tracking-wide">Net Alacak (Cari Bakiye)</th>
              </tr>
            </thead>
            <tbody>
              {cariAlacaklar.map(c => (
                <tr key={c.id} className="border-b border-blue-50 hover:bg-blue-50/30 transition-colors">
                  <td className="px-5 py-2.5 font-medium text-gray-900">{c.name}</td>
                  <td className="px-5 py-2.5 text-right">
                    <AmountDisplay amount={c.current_balance} positive className="font-semibold" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <ReceivableForm
          contacts={contacts} item={editing}
          onSave={() => { setShowForm(false); setEditing(null); fetchAll() }}
          onClose={() => { setShowForm(false); setEditing(null) }}
        />
      )}

      {payTarget && (
        <Dialog open onOpenChange={() => setPayTarget(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Ödeme Kaydet</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="bg-muted/50 rounded-xl px-4 py-3 space-y-1">
                <p className="text-xs text-muted-foreground">Cari: <span className="font-medium text-foreground">{payTarget.contact_name}</span></p>
                <p className="text-xs text-muted-foreground">Kalan: <AmountDisplay amount={payTarget.amount - payTarget.paid_amount} className="inline font-semibold" /></p>
              </div>
              <div className="space-y-1.5">
                <Label>Ödeme Tutarı (₺)</Label>
                <Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} max={payTarget.amount - payTarget.paid_amount} autoFocus />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPayTarget(null)}>İptal</Button>
              <Button onClick={handlePartialPay} disabled={!payAmount || parseFloat(payAmount) <= 0}>Kaydet</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function ReceivableForm({ contacts, item, onSave, onClose }: {
  contacts: Contact[]; item: Receivable | null; onSave: () => void; onClose: () => void
}) {
  const [form, setForm] = useState({
    contact_id: item?.contact_id ?? '',
    amount: item?.amount?.toString() ?? '',
    description: item?.description ?? '',
    due_date: item?.due_date ?? '',
    issue_date: item?.issue_date ?? new Date().toISOString().slice(0, 10),
    invoice_number: item?.invoice_number ?? '',
    notes: item?.notes ?? '',
    status: item?.status ?? 'pending',
  })
  const [loading, setLoading] = useState(false)
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = {
      user_id: user.id, contact_id: form.contact_id || null,
      amount: parseFloat(form.amount), description: form.description || null,
      due_date: form.due_date || null, issue_date: form.issue_date,
      invoice_number: form.invoice_number || null, notes: form.notes || null,
      status: form.status as Receivable['status'], source_type: 'manual', currency: 'TRY',
    }
    if (item) {
      await supabase.from('receivables').update(payload).eq('id', item.id)
    } else {
      const { data: inserted } = await supabase.from('receivables').insert(payload).select().single()
      if (inserted && form.contact_id) {
        await supabase.from('current_account_entries').insert({
          user_id: user.id, contact_id: form.contact_id, entry_type: 'debit',
          amount: parseFloat(form.amount),
          description: form.description || 'Alacak kaydı',
          entry_date: form.issue_date || new Date().toISOString().slice(0, 10),
          related_type: 'receivable', related_id: inserted.id,
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
            <Select value={form.contact_id} onValueChange={(v) => set('contact_id', v)}>
              <SelectTrigger><SelectValue placeholder="Seçin" /></SelectTrigger>
              <SelectContent>{contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Tutar (₺) *</Label><Input type="number" value={form.amount} onChange={(e) => set('amount', e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Durum</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Bekliyor</SelectItem>
                  <SelectItem value="partial">Kısmi</SelectItem>
                  <SelectItem value="paid">Ödendi</SelectItem>
                  <SelectItem value="overdue">Gecikmiş</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Açıklama</Label><Input value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Düzenleme Tarihi</Label><Input type="date" value={form.issue_date} onChange={(e) => set('issue_date', e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Vade Tarihi <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => set('due_date', e.target.value)}
                className={!form.due_date ? 'border-red-300 focus:border-red-400' : ''}
              />
              {!form.due_date && <p className="text-xs text-red-500">Nakit akışına yansıması için vade tarihi zorunludur.</p>}
            </div>
          </div>
          <div className="space-y-1.5"><Label>Fatura No</Label><Input value={form.invoice_number} onChange={(e) => set('invoice_number', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Notlar</Label><Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button onClick={handleSave} disabled={loading || !form.amount || !form.due_date}>Kaydet</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
