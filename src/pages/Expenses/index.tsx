import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import type { Transaction, Contact, ExpenseCategory } from '@/types'
import { Button } from '@/components/ui/button'
import { AmountDisplay } from '@/components/shared/AmountDisplay'
import { formatDate } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Plus, DollarSign, Inbox, Pencil, Trash2, Users, ShoppingCart, Home, Monitor, MoreHorizontal, TrendingDown, Clock, CheckCircle2 } from 'lucide-react'
import { DocAttachButton } from '@/components/shared/DocAttachButton'

type ExpWithContact = Transaction & { contact_name?: string }

const CATEGORIES: { value: ExpenseCategory; label: string; icon: any; color: string; bg: string }[] = [
  { value: 'personel', label: 'Personel',  icon: Users,           color: 'text-violet-700', bg: 'bg-violet-50' },
  { value: 'sarf',     label: 'Sarf/Mal',  icon: ShoppingCart,    color: 'text-orange-700', bg: 'bg-orange-50' },
  { value: 'kira',     label: 'Kira',       icon: Home,            color: 'text-blue-700',   bg: 'bg-blue-50'   },
  { value: 'yazilim',  label: 'Yazılım',    icon: Monitor,         color: 'text-teal-700',   bg: 'bg-teal-50'   },
  { value: 'diger',    label: 'Diğer',      icon: MoreHorizontal,  color: 'text-gray-700',   bg: 'bg-gray-100'  },
]

const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.value, c]))

export function ExpensesPage() {
  const [items, setItems] = useState<ExpWithContact[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ExpWithContact | null>(null)
  const [payTarget, setPayTarget] = useState<ExpWithContact | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('bank')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const fetchAll = async () => {
    const [e, c] = await Promise.all([
      supabase.from('transactions')
        .select('*, contacts(name)')
        .eq('type', 'expense')
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('contacts').select('id,name').order('name'),
    ])
    setItems((e.data ?? []).map((x: any) => ({ ...x, contact_name: x.contacts?.name })))
    setContacts((c.data ?? []) as Contact[])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const handlePay = async () => {
    if (!payTarget) return
    const paid = parseFloat(payAmount)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const today = new Date().toISOString().slice(0, 10)

    await supabase.from('payments').insert({
      user_id: user.id, transaction_id: payTarget.id,
      amount: paid, paid_at: today, method: payMethod || 'bank',
    })
    // trigger otomatik paid_amount + status günceller
    if (payTarget.contact_id) {
      await supabase.from('current_account_entries').insert({
        user_id: user.id, contact_id: payTarget.contact_id, entry_type: 'debit',
        amount: paid, description: payTarget.description ?? 'Gider ödemesi',
        entry_date: today, related_type: 'transaction', related_id: payTarget.id,
      })
    }
    setPayTarget(null); setPayAmount(''); fetchAll()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bu gider kaydı silinecek. Emin misiniz?')) return
    await supabase.from('transactions').delete().eq('id', id)
    fetchAll()
  }

  const today = new Date().toISOString().slice(0, 10)
  const isOverdue = (e: ExpWithContact) => e.status !== 'paid' && !!e.due_date && e.due_date < today

  const filtered = useMemo(() => items.filter(e => {
    if (catFilter !== 'all' && e.category !== catFilter) return false
    if (statusFilter === 'open') return e.status !== 'paid' && !isOverdue(e)
    if (statusFilter === 'overdue') return isOverdue(e)
    if (statusFilter === 'paid') return e.status === 'paid'
    return true
  }), [items, catFilter, statusFilter])

  const rem = (e: ExpWithContact) => (e.total_amount ?? e.amount) - (e.paid_amount ?? 0)

  // KPI
  const totalOpen    = items.filter(e => e.status !== 'paid' && !isOverdue(e)).reduce((s, e) => s + rem(e), 0)
  const totalOverdue = items.filter(e => isOverdue(e)).reduce((s, e) => s + rem(e), 0)
  const totalPaid    = items.filter(e => e.status === 'paid').reduce((s, e) => s + (e.total_amount ?? e.amount), 0)

  // Kategori toplamları
  const byCategory = useMemo(() => CATEGORIES.map(cat => ({
    ...cat,
    total: items.filter(e => e.category === cat.value).reduce((s, e) => s + rem(e), 0),
    count: items.filter(e => e.category === cat.value && e.status !== 'paid').length,
  })), [items])

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Yükleniyor...</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Giderler</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{items.length} kayıt</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true) }} className="gap-1.5">
          <Plus className="h-4 w-4" /> Yeni Gider
        </Button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        <div className="kpi-card">
          <div className="flex items-center gap-3 mb-2">
            <div className="kpi-icon bg-amber-50"><Clock className="h-4 w-4 text-amber-600" /></div>
            <p className="text-xs font-medium text-muted-foreground">Bekleyen</p>
          </div>
          <AmountDisplay amount={totalOpen} negative={totalOpen > 0} className="text-xl font-bold" />
        </div>
        <div className="kpi-card">
          <div className="flex items-center gap-3 mb-2">
            <div className="kpi-icon bg-red-50"><TrendingDown className="h-4 w-4 text-red-500" /></div>
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

      {/* Kategori kartları */}
      <div className="grid grid-cols-5 gap-2">
        {byCategory.map(cat => {
          const Icon = cat.icon
          const active = catFilter === cat.value
          return (
            <button
              key={cat.value}
              onClick={() => setCatFilter(active ? 'all' : cat.value)}
              className={`rounded-xl border px-3 py-3 text-left transition-all ${active ? `${cat.bg} border-current ${cat.color} shadow-sm` : 'bg-white border-border/50 hover:border-gray-300'}`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Icon className={`h-4 w-4 ${active ? cat.color : 'text-muted-foreground'}`} />
                <span className={`text-xs font-semibold ${active ? cat.color : 'text-gray-700'}`}>{cat.label}</span>
                {cat.count > 0 && <span className="ml-auto text-[10px] font-bold text-red-500">{cat.count}</span>}
              </div>
              <AmountDisplay amount={cat.total} negative={cat.total > 0} className="text-sm font-bold" />
            </button>
          )
        })}
      </div>

      {/* Filtreler */}
      <div className="flex items-center gap-2">
        {['all', 'open', 'overdue', 'paid'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'bg-white border border-border/50 text-muted-foreground hover:border-gray-300'}`}
          >
            {{ all: 'Tümü', open: 'Bekleyen', overdue: 'Gecikmiş', paid: 'Ödendi' }[s]}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} kayıt</span>
      </div>

      {/* Tablo */}
      <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-50/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kategori</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Açıklama</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cari / Tarih</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vade</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">KDV'siz</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">KDV%</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Toplam</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kalan</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Durum</th>
              <th className="px-4 py-3 w-28"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="py-14 text-center">
                  <Inbox className="h-10 w-10 text-muted-foreground/25 mx-auto mb-2" />
                  <h3 className="text-sm font-semibold text-gray-900 mb-0.5">Gider bulunamadı</h3>
                  <p className="text-xs text-muted-foreground">Filtre değiştirin veya yeni gider ekleyin.</p>
                </td>
              </tr>
            )}
            {filtered.map(e => {
              const r = rem(e)
              const overdue = isOverdue(e)
              const cat = e.category ? CAT_MAP[e.category] : null
              const Icon = cat?.icon ?? MoreHorizontal
              return (
                <tr key={e.id} className="border-b border-border/40 hover:bg-primary/[0.02] transition-colors">
                  <td className="px-4 py-2.5">
                    {cat
                      ? <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium ${cat.bg} ${cat.color}`}>
                          <Icon className="h-3 w-3" />{cat.label}
                        </span>
                      : <span className="text-xs text-muted-foreground">—</span>
                    }
                  </td>
                  <td className="px-4 py-2.5 max-w-[180px]">
                    <p className="text-sm font-medium truncate">{e.description ?? '—'}</p>
                    {e.reference_no && <p className="text-[10px] text-muted-foreground">{e.reference_no}</p>}
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-sm truncate max-w-[140px]">{e.contact_name ?? '—'}</p>
                    <p className="text-[10px] text-muted-foreground">{formatDate(e.transaction_date)}</p>
                  </td>
                  <td className="px-4 py-2.5 text-sm whitespace-nowrap">
                    {e.due_date
                      ? <span className={overdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}>{formatDate(e.due_date)}</span>
                      : <span className="text-muted-foreground">—</span>
                    }
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm text-muted-foreground">
                    {new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(e.amount)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm text-muted-foreground">
                    {e.kdv_rate > 0 ? `%${e.kdv_rate}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <AmountDisplay amount={e.total_amount ?? e.amount} negative className="text-sm font-semibold" />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <AmountDisplay amount={r} negative={r > 0} className="text-sm" />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col gap-1">
                      {e.status === 'paid'
                        ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">Ödendi</span>
                        : overdue
                          ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">Gecikmiş</span>
                          : e.status === 'partial'
                            ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">Kısmi</span>
                            : <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Bekliyor</span>
                      }
                      {(e as any).fatura_kesildi
                        ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">Fatura ✓</span>
                        : <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-600">Fatura yok</span>
                      }
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => { setEditing(e); setShowForm(true) }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(e.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <DocAttachButton
                        relatedType="transaction"
                        relatedId={e.id}
                        entityName={(e as any).description ?? ''}
                        onUpload={async () => {
                          await supabase.from('transactions').update({ fatura_kesildi: true }).eq('id', e.id)
                          fetchAll()
                        }}
                      />
                      {e.status !== 'paid' && r > 0 && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => { setPayTarget(e); setPayAmount(String(r)) }}>
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

      {/* Form */}
      {showForm && (
        <ExpenseForm
          contacts={contacts} item={editing}
          onSave={() => { setShowForm(false); setEditing(null); fetchAll() }}
          onClose={() => { setShowForm(false); setEditing(null) }}
        />
      )}

      {/* Ödeme dialog */}
      {payTarget && (
        <Dialog open onOpenChange={() => setPayTarget(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Gider Ödemesi Kaydet</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="bg-muted/50 rounded-xl px-4 py-3 space-y-1">
                <p className="text-xs text-muted-foreground">Gider: <span className="font-medium text-foreground">{payTarget.description}</span></p>
                <p className="text-xs text-muted-foreground">Kalan: <AmountDisplay amount={rem(payTarget)} negative className="inline font-semibold" /></p>
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
                    <SelectItem value="bank">Banka / Havale</SelectItem>
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

function ExpenseForm({ contacts, item, onSave, onClose }: {
  contacts: Contact[]; item: ExpWithContact | null; onSave: () => void; onClose: () => void
}) {
  const [form, setForm] = useState({
    category:         (item?.category ?? 'diger') as string,
    description:      item?.description ?? '',
    amount:           item?.amount?.toString() ?? '',
    kdv_rate:         (item?.kdv_rate ?? 0).toString(),
    contact_id:       item?.contact_id ?? '',
    transaction_date: item?.transaction_date ?? new Date().toISOString().slice(0, 10),
    due_date:         item?.due_date ?? '',
    reference_no:     item?.reference_no ?? '',
    product:          item?.product ?? '',
    period_start:     item?.period_start ?? '',
    period_end:       item?.period_end ?? '',
    notes:            item?.notes ?? '',
    status:           item?.status ?? 'open',
    fatura_kesildi:   (item as any)?.fatura_kesildi ?? false,
  })
  const [loading, setLoading] = useState(false)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const setB = (k: string, v: boolean) => setForm(f => ({ ...f, [k]: v }))

  const kdv = parseFloat(form.kdv_rate) || 0
  const net = parseFloat(form.amount) || 0
  const total = net + (net * kdv / 100)

  const handleSave = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = {
      user_id: user.id, type: 'expense' as const,
      category: form.category || null,
      description: form.description || null,
      amount: net, kdv_rate: kdv,
      contact_id: form.contact_id || null,
      transaction_date: form.transaction_date,
      due_date: form.due_date || null,
      reference_no: form.reference_no || null,
      product: form.product || null,
      period_start: form.period_start || null,
      period_end: form.period_end || null,
      notes: form.notes || null,
      status: form.status, currency: 'TRY',
      paid_amount: item?.paid_amount ?? 0,
      fatura_kesildi: form.fatura_kesildi,
    }
    if (item) {
      await supabase.from('transactions').update(payload).eq('id', item.id)
    } else {
      await supabase.from('transactions').insert(payload)
    }
    setLoading(false); onSave()
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{item ? 'Gider Düzenle' : 'Yeni Gider'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {/* Kategori seç */}
          <div className="space-y-1.5">
            <Label>Kategori *</Label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => {
                const Icon = cat.icon
                const active = form.category === cat.value
                return (
                  <button key={cat.value} type="button"
                    onClick={() => set('category', cat.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${active ? `${cat.bg} ${cat.color} border-current` : 'bg-white border-border/50 text-muted-foreground hover:border-gray-300'}`}
                  >
                    <Icon className="h-3.5 w-3.5" />{cat.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Açıklama *</Label>
            <Input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Gider açıklaması" />
          </div>

          <div className="space-y-2">
            <div className="space-y-1.5">
              <Label>Matrah (KDV Hariç) *</Label>
              <Input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>KDV Oranı</Label>
              <div className="flex gap-2">
                {[{v:'0',l:'%0 — KDV Yok'},{v:'10',l:'%10'},{v:'20',l:'%20'}].map(r => (
                  <button key={r.v} type="button"
                    onClick={() => set('kdv_rate', r.v)}
                    className="flex-1 py-1.5 rounded-lg text-sm font-semibold border transition-all"
                    style={{
                      borderColor: form.kdv_rate === r.v ? '#f05a28' : '#dde6f0',
                      background: form.kdv_rate === r.v ? 'rgba(240,90,40,0.08)' : 'white',
                      color: form.kdv_rate === r.v ? '#c44b1f' : '#6b8aad',
                    }}>
                    {r.l}
                  </button>
                ))}
              </div>
              {net > 0 && (
                <div className="rounded-lg bg-gray-50 border border-border/40 px-3 py-2 text-xs space-y-1">
                  <div className="flex justify-between text-muted-foreground"><span>Matrah</span><span>₺{net.toLocaleString('tr-TR',{minimumFractionDigits:2})}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>KDV %{kdv}</span><span>₺{(net*kdv/100).toLocaleString('tr-TR',{minimumFractionDigits:2})}</span></div>
                  <div className="flex justify-between font-semibold text-red-600 border-t border-border/40 pt-1"><span>Toplam</span><span>₺{total.toLocaleString('tr-TR',{minimumFractionDigits:2})}</span></div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cari (Opsiyonel)</Label>
              <Select value={form.contact_id} onValueChange={v => set('contact_id', v)}>
                <SelectTrigger><SelectValue placeholder="Seçin" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Yok —</SelectItem>
                  {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Durum</Label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Bekliyor</SelectItem>
                  <SelectItem value="partial">Kısmi</SelectItem>
                  <SelectItem value="paid">Ödendi</SelectItem>
                  <SelectItem value="cancelled">İptal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Tarih</Label><Input type="date" value={form.transaction_date} onChange={e => set('transaction_date', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Vade</Label><Input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Referans / Fatura No</Label><Input value={form.reference_no} onChange={e => set('reference_no', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Ürün / Proje</Label><Input value={form.product} onChange={e => set('product', e.target.value)} placeholder="FormLand, Eddy..." /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Dönem Başı</Label><Input type="date" value={form.period_start} onChange={e => set('period_start', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Dönem Sonu</Label><Input type="date" value={form.period_end} onChange={e => set('period_end', e.target.value)} /></div>
          </div>

          <div className="space-y-1.5"><Label>Notlar</Label><Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} /></div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={form.fatura_kesildi} onChange={e => setB('fatura_kesildi', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
            <span className="text-sm font-medium text-gray-700">Fatura kesildi</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button onClick={handleSave} disabled={loading || !form.amount || !form.description}>
            {loading ? 'Kaydediliyor...' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
