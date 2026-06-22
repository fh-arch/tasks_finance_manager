import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Transaction, Contact, Category } from '@/types'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { AmountDisplay } from '@/components/shared/AmountDisplay'
import { formatDate } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Plus, TrendingUp, TrendingDown, ArrowUpDown } from 'lucide-react'

type TxWithRel = Transaction & { contact_name?: string; category_name?: string }

export function TransactionsPage() {
  const [items, setItems] = useState<TxWithRel[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)

  const fetchAll = async () => {
    const [t, c, cat] = await Promise.all([
      supabase.from('transactions').select('*, contacts(name), categories(name)').order('transaction_date', { ascending: false }),
      supabase.from('contacts').select('id,name').order('name'),
      supabase.from('categories').select('*').order('name'),
    ])
    setItems((t.data ?? []).map((x: any) => ({ ...x, contact_name: x.contacts?.name, category_name: x.categories?.name })))
    setContacts((c.data ?? []) as Contact[])
    setCategories(cat.data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Yükleniyor...</p>
      </div>
    </div>
  )

  // KPI summary
  const totalIncome = items.filter((t) => t.type === 'income' && t.status === 'completed').reduce((s, t) => s + t.amount, 0)
  const totalExpense = items.filter((t) => t.type === 'expense' && t.status === 'completed').reduce((s, t) => s + t.amount, 0)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">İşlemler</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{items.length} işlem listeleniyor</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true) }} className="gap-1.5">
          <Plus className="h-4 w-4" /> Yeni İşlem
        </Button>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger-children">
        <div className="kpi-card">
          <div className="flex items-start justify-between mb-3">
            <div className="kpi-icon bg-emerald-50"><TrendingUp className="h-5 w-5 text-emerald-600" /></div>
          </div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Toplam Gelir</p>
          <AmountDisplay amount={totalIncome} positive className="text-xl font-bold" />
        </div>
        <div className="kpi-card">
          <div className="flex items-start justify-between mb-3">
            <div className="kpi-icon bg-red-50"><TrendingDown className="h-5 w-5 text-red-500" /></div>
          </div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Toplam Gider</p>
          <AmountDisplay amount={totalExpense} negative className="text-xl font-bold" />
        </div>
        <div className="kpi-card">
          <div className="flex items-start justify-between mb-3">
            <div className="kpi-icon bg-indigo-50"><ArrowUpDown className="h-5 w-5 text-indigo-600" /></div>
          </div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Net</p>
          <AmountDisplay
            amount={Math.abs(totalIncome - totalExpense)}
            positive={totalIncome >= totalExpense}
            negative={totalIncome < totalExpense}
            className="text-xl font-bold"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-50/50">
            <tr>
              {['Tarih', 'Tür', 'Cari', 'Kategori', 'Açıklama', 'Tutar', 'Durum'].map((h) => (
                <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="py-16 text-center">
                  <ArrowUpDown className="h-12 w-12 text-muted-foreground/25 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">İşlem bulunamadı</h3>
                  <p className="text-xs text-muted-foreground">Yeni işlem eklemek için yukarıdaki butona tıklayın.</p>
                </td>
              </tr>
            )}
            {items.map((t) => (
              <tr key={t.id} className="border-b border-border/40 hover:bg-primary/[0.02] transition-colors cursor-pointer" onClick={() => { setEditing(t); setShowForm(true) }}>
                <td className="px-5 py-3 text-muted-foreground">{formatDate(t.transaction_date)}</td>
                <td className="px-5 py-3">
                  {t.type === 'income'
                    ? <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full"><TrendingUp className="h-3 w-3" /> Gelir</span>
                    : <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 px-2.5 py-1 rounded-full"><TrendingDown className="h-3 w-3" /> Gider</span>
                  }
                </td>
                <td className="px-5 py-3 text-muted-foreground">{t.contact_name ?? '—'}</td>
                <td className="px-5 py-3 text-muted-foreground">{t.category_name ?? '—'}</td>
                <td className="px-5 py-3 max-w-[200px] truncate font-medium">{t.description ?? '—'}</td>
                <td className="px-5 py-3 text-right">
                  <AmountDisplay amount={t.amount} positive={t.type === 'income'} negative={t.type === 'expense'} />
                </td>
                <td className="px-5 py-3"><StatusBadge status={t.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <TransactionForm
          contacts={contacts} categories={categories} item={editing}
          onSave={() => { setShowForm(false); setEditing(null); fetchAll() }}
          onClose={() => { setShowForm(false); setEditing(null) }}
        />
      )}
    </div>
  )
}

function TransactionForm({ contacts, categories, item, onSave, onClose }: {
  contacts: Contact[]; categories: Category[]; item: Transaction | null; onSave: () => void; onClose: () => void
}) {
  const [form, setForm] = useState({
    type: item?.type ?? 'income',
    contact_id: item?.contact_id ?? '',
    category_id: item?.category_id ?? '',
    amount: item?.amount?.toString() ?? '',
    description: item?.description ?? '',
    transaction_date: item?.transaction_date ?? new Date().toISOString().slice(0, 10),
    payment_method: item?.payment_method ?? '',
    status: item?.status ?? 'completed',
    notes: item?.notes ?? '',
  })
  const [loading, setLoading] = useState(false)
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = {
      user_id: user.id, type: form.type as Transaction['type'],
      contact_id: form.contact_id || null, category_id: form.category_id || null,
      amount: parseFloat(form.amount), description: form.description || null,
      transaction_date: form.transaction_date, payment_method: form.payment_method || null,
      status: form.status as Transaction['status'], notes: form.notes || null, currency: 'TRY',
    }
    if (item) {
      await supabase.from('transactions').update(payload).eq('id', item.id)
    } else {
      const { data: inserted } = await supabase.from('transactions').insert(payload).select().single()
      // Cari hareketi: tamamlandıysa ve cari seçildiyse current_account_entries'e yaz
      if (inserted && form.contact_id && form.status === 'completed') {
        await supabase.from('current_account_entries').insert({
          user_id: user.id,
          contact_id: form.contact_id,
          // income = onlar bize ödedi (alacak azaldı = credit) / expense = biz onlara ödedik (borç azaldı = debit)
          entry_type: form.type === 'income' ? 'credit' : 'debit',
          amount: parseFloat(form.amount),
          description: form.description || (form.type === 'income' ? 'Gelir işlemi' : 'Gider işlemi'),
          entry_date: form.transaction_date,
          related_type: 'transaction',
          related_id: inserted.id,
        })
      }
    }
    setLoading(false); onSave()
  }

  const filteredCats = categories.filter((c) => c.type === form.type)

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{item ? 'İşlem Düzenle' : 'Yeni İşlem'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tür</Label>
              <Select value={form.type} onValueChange={(v) => set('type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Gelir</SelectItem>
                  <SelectItem value="expense">Gider</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Durum</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">Tamamlandı</SelectItem>
                  <SelectItem value="pending">Bekliyor</SelectItem>
                  <SelectItem value="cancelled">İptal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Tutar (₺) *</Label><Input type="number" value={form.amount} onChange={(e) => set('amount', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Tarih</Label><Input type="date" value={form.transaction_date} onChange={(e) => set('transaction_date', e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Cari (Opsiyonel)</Label>
            <Select value={form.contact_id} onValueChange={(v) => set('contact_id', v)}>
              <SelectTrigger><SelectValue placeholder="Seçin" /></SelectTrigger>
              <SelectContent><SelectItem value="">— Yok —</SelectItem>{contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Kategori</Label>
            <Select value={form.category_id} onValueChange={(v) => set('category_id', v)}>
              <SelectTrigger><SelectValue placeholder="Seçin" /></SelectTrigger>
              <SelectContent><SelectItem value="">— Yok —</SelectItem>{filteredCats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Açıklama</Label><Input value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Ödeme Yöntemi</Label><Input value={form.payment_method} onChange={(e) => set('payment_method', e.target.value)} placeholder="Nakit, Banka, Kart..." /></div>
          {form.contact_id && form.status === 'completed' && (
            <p className="text-xs bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-xl px-3 py-2">
              Bu işlem carinin bakiyesine ve alacak/borç ekranına otomatik yansıyacak.
            </p>
          )}
          <div className="space-y-1.5"><Label>Notlar</Label><Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button onClick={handleSave} disabled={loading || !form.amount}>Kaydet</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
