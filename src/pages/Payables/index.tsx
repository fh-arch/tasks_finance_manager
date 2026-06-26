import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Transaction, Contact } from '@/types'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { AmountDisplay } from '@/components/shared/AmountDisplay'
import { formatDate } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Plus, DollarSign, Inbox, Clock, AlertCircle, CheckCircle2, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { DocAttachButton } from '@/components/shared/DocAttachButton'

type TxWithContact = Transaction & { contact_name?: string }
type Subscription = { id: string; name: string; amount: number; billing_cycle: string; next_billing_date: string | null; status: string }

const CYCLE_TR: Record<string, string> = { monthly: 'Aylık', quarterly: '3 Aylık', yearly: 'Yıllık' }

export function PayablesPage() {
  const [items, setItems] = useState<TxWithContact[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<TxWithContact | null>(null)
  const [payTarget, setPayTarget] = useState<TxWithContact | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<string>('bank')
  const [showSubForm, setShowSubForm] = useState(false)
  const [editingSub, setEditingSub] = useState<Subscription | null>(null)

  const fetchAll = async () => {
    const [p, c, s] = await Promise.all([
      supabase.from('transactions')
        .select('*, contacts(name)')
        .eq('type', 'payable')
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('contacts').select('id,name').order('name'),
      supabase.from('subscriptions').select('id,name,amount,billing_cycle,next_billing_date,status').order('next_billing_date'),
    ])
    setItems((p.data ?? []).map((x: any) => ({ ...x, contact_name: x.contacts?.name })))
    setContacts((c.data ?? []) as Contact[])
    setSubscriptions((s.data ?? []) as Subscription[])
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
      supabase.from('payments').insert({
        user_id: user.id, transaction_id: payTarget.id,
        amount: paid, paid_at: today, method: payMethod || 'bank',
      }),
      supabase.from('transactions').update({ paid_amount: newPaid, status: newStatus }).eq('id', payTarget.id),
    ])

    if (payTarget.contact_id) {
      await supabase.from('current_account_entries').insert({
        user_id: user.id, contact_id: payTarget.contact_id, entry_type: 'debit',
        amount: paid, description: `Borç ödemesi: ${payTarget.description ?? ''}`,
        entry_date: today, related_type: 'transaction', related_id: payTarget.id,
      })
    }
    setPayTarget(null); setPayAmount(''); fetchAll()
  }

  const handleDeletePay = async (id: string) => {
    if (!confirm('Bu borç kaydı silinecek. Emin misiniz?')) return
    await supabase.from('transactions').delete().eq('id', id)
    fetchAll()
  }

  const handleDeleteSub = async (id: string) => {
    if (!confirm('Bu abonelik silinecek. Emin misiniz?')) return
    await supabase.from('subscriptions').delete().eq('id', id)
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

  const today = new Date().toISOString().slice(0, 10)
  const rem = (p: TxWithContact) => p.amount - (p.paid_amount ?? 0)
  const isOverdue = (p: TxWithContact) => p.status !== 'paid' && p.due_date != null && p.due_date < today

  const totalPending = items.filter(p => (p.status === 'open' || p.status === 'pending') && !isOverdue(p)).reduce((s, p) => s + rem(p), 0)
  const totalOverdue = items.filter(p => isOverdue(p)).reduce((s, p) => s + rem(p), 0)
  const totalPaid    = items.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0)

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Borçlar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{items.length} kayıt</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true) }} className="gap-1.5">
          <Plus className="h-4 w-4" /> Yeni Borç
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-3 stagger-children">
        <div className="kpi-card">
          <div className="flex items-center gap-3 mb-2">
            <div className="kpi-icon bg-amber-50"><Clock className="h-4 w-4 text-amber-600" /></div>
            <p className="text-xs font-medium text-muted-foreground">Bekleyen</p>
          </div>
          <AmountDisplay amount={totalPending} negative={totalPending > 0} className="text-xl font-bold" />
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
            <p className="text-xs font-medium text-muted-foreground">Ödendi</p>
          </div>
          <AmountDisplay amount={totalPaid} positive className="text-xl font-bold" />
        </div>
      </div>

      {/* Table */}
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
                  <h3 className="text-sm font-semibold text-gray-900 mb-0.5">Borç bulunamadı</h3>
                  <p className="text-xs text-muted-foreground">Yeni borç eklemek için sağ üstteki butona tıklayın.</p>
                </td>
              </tr>
            )}
            {items.map(p => {
              const r = rem(p)
              const overdue = isOverdue(p)
              return (
                <tr key={p.id} className="border-b border-border/40 hover:bg-primary/[0.02] transition-colors">
                  <td className="px-4 py-2.5 font-medium max-w-[180px] truncate">{p.contact_name ?? '—'}</td>
                  <td className="px-4 py-2.5 max-w-[160px]">
                    <p className="text-sm text-muted-foreground truncate">{p.description ?? '—'}</p>
                  </td>
                  <td className="px-4 py-2.5 text-sm whitespace-nowrap">
                    {p.due_date
                      ? <span className={overdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}>{formatDate(p.due_date)}</span>
                      : <span className="text-muted-foreground">—</span>
                    }
                  </td>
                  <td className="px-4 py-2.5 text-right"><AmountDisplay amount={p.amount} negative className="text-sm" /></td>
                  <td className="px-4 py-2.5 text-right"><AmountDisplay amount={p.paid_amount ?? 0} positive className="text-sm" /></td>
                  <td className="px-4 py-2.5 text-right"><AmountDisplay amount={r} negative={r > 0} className="text-sm font-semibold" /></td>
                  <td className="px-4 py-2.5">
                    {overdue
                      ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">Gecikmiş</span>
                      : <StatusBadge status={p.status === 'open' ? 'pending' : p.status} />
                    }
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => { setEditing(p); setShowForm(true) }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeletePay(p.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <DocAttachButton relatedType="payable" relatedId={p.id} />
                      {p.status !== 'paid' && r > 0 && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => { setPayTarget(p); setPayAmount('') }}>
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

      {/* Abonelik Giderleri */}
      <div className="bg-white rounded-2xl border border-violet-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-violet-100 flex items-center gap-2 bg-violet-50/60">
          <RefreshCw className="h-4 w-4 text-violet-600" />
          <h3 className="text-sm font-semibold text-violet-800">Abonelik Giderleri</h3>
          <span className="ml-4 text-xs font-bold text-violet-700">
            Aylık: {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 }).format(
              subscriptions.filter(s => s.status === 'active').reduce((acc, s) => {
                if (s.billing_cycle === 'monthly') return acc + s.amount
                if (s.billing_cycle === 'quarterly') return acc + s.amount / 3
                if (s.billing_cycle === 'yearly') return acc + s.amount / 12
                return acc
              }, 0)
            )}
          </span>
          <Button size="sm" variant="outline" className="ml-auto gap-1 text-violet-700 border-violet-200 hover:bg-violet-50" onClick={() => { setEditingSub(null); setShowSubForm(true) }}>
            <Plus className="h-3.5 w-3.5" /> Abonelik Ekle
          </Button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-violet-50/30">
            <tr>
              {['Abonelik Adı', 'Dönem', 'Sonraki Ödeme', 'Tutar', 'Durum', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subscriptions.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Henüz abonelik gideri yok</td></tr>
            )}
            {subscriptions.map(s => {
              const in30 = new Date(); in30.setDate(in30.getDate() + 30)
              const nextDate = s.next_billing_date && s.next_billing_date >= today ? s.next_billing_date : in30.toISOString().slice(0, 10)
              const isPast = !s.next_billing_date || s.next_billing_date < today
              return (
                <tr key={s.id} className="border-b border-border/30 hover:bg-violet-50/20 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{s.name}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700">
                      {CYCLE_TR[s.billing_cycle] ?? s.billing_cycle}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {formatDate(nextDate)}
                    {isPast && <span className="ml-1.5 text-[10px] text-amber-600 font-medium">(tahmini)</span>}
                  </td>
                  <td className="px-4 py-2.5"><AmountDisplay amount={s.amount} negative className="font-semibold" /></td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.status === 'active' ? 'bg-emerald-50 text-emerald-700' : s.status === 'cancelled' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                      {s.status === 'active' ? 'Aktif' : s.status === 'cancelled' ? 'İptal' : 'Pasif'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => { setEditingSub(s); setShowSubForm(true) }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeleteSub(s.id)}>
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

      {showForm && (
        <PayableForm
          contacts={contacts} item={editing}
          onSave={() => { setShowForm(false); setEditing(null); fetchAll() }}
          onClose={() => { setShowForm(false); setEditing(null) }}
        />
      )}

      {showSubForm && (
        <ExpenseSubForm
          item={editingSub}
          onSave={() => { setShowSubForm(false); setEditingSub(null); fetchAll() }}
          onClose={() => { setShowSubForm(false); setEditingSub(null) }}
        />
      )}

      {payTarget && (
        <Dialog open onOpenChange={() => setPayTarget(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Ödeme Kaydet</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="bg-muted/50 rounded-xl px-4 py-3 space-y-1">
                <p className="text-xs text-muted-foreground">Cari: <span className="font-medium text-foreground">{payTarget.contact_name}</span></p>
                <p className="text-xs text-muted-foreground">Kalan: <AmountDisplay amount={rem(payTarget)} className="inline font-semibold" /></p>
              </div>
              <div className="space-y-1.5">
                <Label>Ödeme Tutarı (₺)</Label>
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
    </div>
  )
}

function PayableForm({ contacts, item, onSave, onClose }: {
  contacts: Contact[]; item: TxWithContact | null; onSave: () => void; onClose: () => void
}) {
  const [form, setForm] = useState({
    contact_id: item?.contact_id ?? '',
    amount: item?.amount?.toString() ?? '',
    description: item?.description ?? '',
    due_date: item?.due_date ?? '',
    transaction_date: item?.transaction_date ?? new Date().toISOString().slice(0, 10),
    notes: item?.notes ?? '',
    status: item?.status ?? 'open',
  })
  const [loading, setLoading] = useState(false)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = {
      user_id: user.id, type: 'payable' as const,
      contact_id: form.contact_id || null,
      amount: parseFloat(form.amount), description: form.description || null,
      due_date: form.due_date || null, transaction_date: form.transaction_date,
      notes: form.notes || null, status: form.status,
      source_type: 'manual', currency: 'TRY',
      paid_amount: item?.paid_amount ?? 0,
    }
    if (item) {
      await supabase.from('transactions').update(payload).eq('id', item.id)
    } else {
      const { data: inserted } = await supabase.from('transactions').insert(payload).select().single()
      if (inserted && form.contact_id) {
        await supabase.from('current_account_entries').insert({
          user_id: user.id, contact_id: form.contact_id, entry_type: 'credit',
          amount: parseFloat(form.amount),
          description: form.description || 'Borç kaydı',
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
        <DialogHeader><DialogTitle>{item ? 'Borç Düzenle' : 'Yeni Borç'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Cari</Label>
            <Select value={form.contact_id} onValueChange={v => set('contact_id', v)}>
              <SelectTrigger><SelectValue placeholder="Seçin" /></SelectTrigger>
              <SelectContent>
                {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Tutar (₺) *</Label><Input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} /></div>
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
          <div className="space-y-1.5"><Label>Açıklama</Label><Input value={form.description} onChange={e => set('description', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Düzenleme</Label><Input type="date" value={form.transaction_date} onChange={e => set('transaction_date', e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Vade <span className="text-red-500">*</span></Label>
              <Input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} className={!form.due_date ? 'border-red-300' : ''} />
              {!form.due_date && <p className="text-xs text-red-500">Nakit akışına yansıması için zorunludur.</p>}
            </div>
          </div>
          <div className="space-y-1.5"><Label>Notlar</Label><Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button onClick={handleSave} disabled={loading || !form.amount || !form.due_date}>Kaydet</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ExpenseSubForm({ item, onSave, onClose }: { item: Subscription | null; onSave: () => void; onClose: () => void }) {
  const [form, setForm] = useState({
    name: item?.name ?? '',
    amount: item?.amount?.toString() ?? '',
    billing_cycle: item?.billing_cycle ?? 'monthly',
    next_billing_date: item?.next_billing_date ?? '',
    status: item?.status ?? 'active',
  })
  const [loading, setLoading] = useState(false)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = {
      user_id: user.id, name: form.name, amount: parseFloat(form.amount),
      billing_cycle: form.billing_cycle as any, next_billing_date: form.next_billing_date || null,
      status: form.status as any, currency: 'TRY',
    }
    if (item) { await supabase.from('subscriptions').update(payload).eq('id', item.id) }
    else { await supabase.from('subscriptions').insert(payload) }
    setLoading(false); onSave()
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{item ? 'Abonelik Düzenle' : 'Gider Aboneliği Ekle'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Servis Adı *</Label><Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Netflix, Hosting..." /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Tutar (₺) *</Label><Input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Döngü</Label>
              <Select value={form.billing_cycle} onValueChange={v => set('billing_cycle', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Aylık</SelectItem>
                  <SelectItem value="quarterly">Üç Aylık</SelectItem>
                  <SelectItem value="yearly">Yıllık</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Sonraki Ödeme Tarihi</Label><Input type="date" value={form.next_billing_date} onChange={e => set('next_billing_date', e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Durum</Label>
            <Select value={form.status} onValueChange={v => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="inactive">Pasif</SelectItem>
                <SelectItem value="cancelled">İptal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button onClick={handleSave} disabled={loading || !form.name || !form.amount}>Kaydet</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
