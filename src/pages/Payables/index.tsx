import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Payable, Contact } from '@/types'
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
import { Plus, DollarSign, Inbox, Clock, AlertCircle, CheckCircle2, Pencil, RefreshCw } from 'lucide-react'
import { DocAttachButton } from '@/components/shared/DocAttachButton'

type PayWithContact = Payable & { contact_name?: string }
type Subscription = { id: string; name: string; amount: number; billing_cycle: string; next_billing_date: string | null }

const CYCLE_TR: Record<string, string> = { monthly: 'Aylık', quarterly: '3 Aylık', yearly: 'Yıllık' }

export function PayablesPage() {
  const [items, setItems] = useState<PayWithContact[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Payable | null>(null)
  const [payTarget, setPayTarget] = useState<PayWithContact | null>(null)
  const [payAmount, setPayAmount] = useState('')

  const fetchAll = async () => {
    const today = new Date().toISOString().slice(0, 10)
    await supabase.from('payables')
      .update({ status: 'overdue' })
      .in('status', ['pending', 'partial'])
      .lt('due_date', today)
      .not('due_date', 'is', null)
    const [p, c, s] = await Promise.all([
      supabase.from('payables').select('*, contacts(name)').order('due_date'),
      supabase.from('contacts').select('id,name').order('name'),
      supabase.from('subscriptions').select('id,name,amount,billing_cycle,next_billing_date').eq('status', 'active').order('next_billing_date'),
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
    const newPaid = payTarget.paid_amount + paid
    const newStatus = newPaid >= payTarget.amount ? 'paid' : 'partial'
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const today = new Date().toISOString().slice(0, 10)
    await supabase.from('payables').update({ paid_amount: newPaid, status: newStatus }).eq('id', payTarget.id)
    if (payTarget.contact_id) {
      await supabase.from('current_account_entries').insert({
        user_id: user.id, contact_id: payTarget.contact_id, entry_type: 'debit',
        amount: paid, description: `Borç ödemesi: ${payTarget.description ?? ''}`,
        entry_date: today, related_type: 'payable', related_id: payTarget.id,
      })
    }
    // Gider işlemine yansıt
    await supabase.from('transactions').insert({
      user_id: user.id, type: 'expense', contact_id: payTarget.contact_id ?? null,
      amount: paid, description: `Borç ödemesi: ${payTarget.description ?? ''}`,
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

  const totalPending = items.filter((p) => p.status === 'pending').reduce((s, p) => s + (p.amount - p.paid_amount), 0)
  const totalOverdue = items.filter((p) => p.status === 'overdue').reduce((s, p) => s + (p.amount - p.paid_amount), 0)
  const totalPaid = items.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0)

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
                  <h3 className="text-sm font-semibold text-gray-900 mb-0.5">Borç bulunamadı</h3>
                  <p className="text-xs text-muted-foreground">Yeni borç eklemek için sağ üstteki butona tıklayın.</p>
                </td>
              </tr>
            )}
            {items.map((p) => (
              <tr key={p.id} className="border-b border-border/40 hover:bg-primary/[0.02] transition-colors">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-sm truncate max-w-[180px]" title={p.contact_name ?? ''}>{p.contact_name ?? '—'}</p>
                  <span className="mt-0.5 inline-block"><SourceBadge source={p.source_type} /></span>
                </td>
                <td className="px-4 py-2.5 max-w-[160px]">
                  <p className="text-sm text-muted-foreground truncate" title={p.description ?? ''}>{p.description ?? '—'}</p>
                </td>
                <td className="px-4 py-2.5 text-sm text-muted-foreground whitespace-nowrap">
                  {p.due_date ? formatDate(p.due_date) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right"><AmountDisplay amount={p.amount} negative className="text-sm" /></td>
                <td className="px-4 py-2.5 text-right"><AmountDisplay amount={p.paid_amount} positive className="text-sm" /></td>
                <td className="px-4 py-2.5 text-right"><AmountDisplay amount={p.amount - p.paid_amount} negative={p.amount - p.paid_amount > 0} className="text-sm font-semibold" /></td>
                <td className="px-4 py-2.5"><StatusBadge status={p.status} /></td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => { setEditing(p); setShowForm(true) }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <DocAttachButton relatedType="payable" relatedId={p.id} />
                    {p.status !== 'paid' && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => { setPayTarget(p); setPayAmount('') }}>
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

      {/* Abonelik Giderleri */}
      {subscriptions.length > 0 && (
        <div className="bg-white rounded-2xl border border-violet-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-violet-100 flex items-center gap-2 bg-violet-50/60">
            <RefreshCw className="h-4 w-4 text-violet-600" />
            <h3 className="text-sm font-semibold text-violet-800">Abonelik Giderleri</h3>
            <span className="ml-auto text-xs font-bold text-violet-700">
              Toplam: {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 }).format(subscriptions.reduce((s, x) => s + x.amount, 0))}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-violet-50/30">
              <tr>
                {['Abonelik Adı', 'Dönem', 'Sonraki Ödeme', 'Tutar'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subscriptions.map(s => {
                const today = new Date().toISOString().slice(0, 10)
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
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <PayableForm
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
                <Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} autoFocus />
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
  contacts: Contact[]; item: Payable | null; onSave: () => void; onClose: () => void
}) {
  const [form, setForm] = useState({
    contact_id: item?.contact_id ?? '',
    amount: item?.amount?.toString() ?? '',
    description: item?.description ?? '',
    due_date: item?.due_date ?? '',
    issue_date: item?.issue_date ?? new Date().toISOString().slice(0, 10),
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
      notes: form.notes || null, status: form.status as Payable['status'],
      source_type: 'manual', currency: 'TRY',
    }
    if (item) {
      await supabase.from('payables').update(payload).eq('id', item.id)
    } else {
      const { data: inserted } = await supabase.from('payables').insert(payload).select().single()
      if (inserted && form.contact_id) {
        await supabase.from('current_account_entries').insert({
          user_id: user.id, contact_id: form.contact_id, entry_type: 'credit',
          amount: parseFloat(form.amount),
          description: form.description || 'Borç kaydı',
          entry_date: form.issue_date || new Date().toISOString().slice(0, 10),
          related_type: 'payable', related_id: inserted.id,
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
            <Select value={form.contact_id} onValueChange={(v) => set('contact_id', v)}>
              <SelectTrigger><SelectValue placeholder="Seçin" /></SelectTrigger>
              <SelectContent>
                {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
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
            <div className="space-y-1.5"><Label>Düzenleme</Label><Input type="date" value={form.issue_date} onChange={(e) => set('issue_date', e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Vade <span className="text-red-500">*</span></Label>
              <Input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} className={!form.due_date ? 'border-red-300' : ''} />
              {!form.due_date && <p className="text-xs text-red-500">Nakit akışına yansıması için vade tarihi zorunludur.</p>}
            </div>
          </div>
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
