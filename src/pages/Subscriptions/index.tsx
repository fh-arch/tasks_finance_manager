import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Subscription, CustomerSubscription, Contact } from '@/types'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { AmountDisplay } from '@/components/shared/AmountDisplay'
import { formatDate } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, RefreshCw, CreditCard, Users, Pencil, Trash2 } from 'lucide-react'

function cycleLabel(c: string) { return { monthly: 'Aylık', quarterly: 'Üç Aylık', yearly: 'Yıllık' }[c] ?? c }

function cycleBadgeColor(c: string) {
  return { monthly: 'bg-blue-50 text-blue-700', quarterly: 'bg-violet-50 text-violet-700', yearly: 'bg-amber-50 text-amber-700' }[c] ?? 'bg-gray-100 text-gray-700'
}

type CustSubWithContact = CustomerSubscription & { contact_name?: string }

export function SubscriptionsPage() {
  const [subs, setSubs] = useState<Subscription[]>([])
  const [custSubs, setCustSubs] = useState<CustSubWithContact[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [showExpForm, setShowExpForm] = useState(false)
  const [showCustForm, setShowCustForm] = useState(false)
  const [editingExp, setEditingExp] = useState<Subscription | null>(null)
  const [editingCust, setEditingCust] = useState<CustSubWithContact | null>(null)

  const fetchAll = async () => {
    const [s, cs, c] = await Promise.all([
      supabase.from('subscriptions').select('*').order('next_billing_date'),
      supabase.from('customer_subscriptions').select('*, contacts(name)').order('next_billing_date'),
      supabase.from('contacts').select('id,name').order('name'),
    ])
    setSubs(s.data ?? [])
    setCustSubs((cs.data ?? []).map((r: any) => ({ ...r, contact_name: r.contacts?.name })))
    setContacts((c.data ?? []) as Contact[])
    setLoading(false)
  }

  // Her ayın 1'i kontrolü: aktif müşteri aboneliklerinin bu aya ait alacağını otomatik oluştur
  const autoCreateMonthlyReceivables = async (custSubList: CustSubWithContact[]) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const today = new Date()
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10)

    for (const cs of custSubList) {
      if (cs.status !== 'active') continue
      const { data: existing } = await supabase
        .from('receivables')
        .select('id')
        .eq('source_id', cs.id)
        .eq('source_type', 'customer_subscription')
        .gte('issue_date', monthStart)
        .lte('issue_date', monthEnd)
        .limit(1)
      if (existing && existing.length > 0) continue
      const nextBilling = new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString().slice(0, 10)
      const { data: inserted } = await supabase.from('receivables').insert({
        user_id: user.id, contact_id: cs.contact_id, amount: cs.amount, currency: cs.currency ?? 'TRY',
        description: `${cs.plan_name} - ${today.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })} abonelik`,
        source_type: 'customer_subscription', source_id: cs.id,
        issue_date: monthStart, due_date: nextBilling, status: 'pending',
      }).select().single()
      if (inserted) {
        await supabase.from('current_account_entries').insert({
          user_id: user.id, contact_id: cs.contact_id, entry_type: 'debit', amount: cs.amount,
          description: `${cs.plan_name} aylık abonelik`, entry_date: monthStart,
          related_type: 'customer_subscription', related_id: cs.id,
        })
      }
    }
  }

  useEffect(() => {
    fetchAll().then(() => {
      // Sayfaya her girişte bu ayın alacaklarını otomatik oluştur
      supabase.from('customer_subscriptions').select('*, contacts(name)').then(({ data }) => {
        if (data) autoCreateMonthlyReceivables(data.map((r: any) => ({ ...r, contact_name: r.contacts?.name })))
      })
    })
  }, [])

  const handleDeleteExp = async (id: string) => {
    if (!confirm('Bu abonelik silinecek. Emin misiniz?')) return
    await supabase.from('subscriptions').delete().eq('id', id)
    fetchAll()
  }

  const handleDeleteCust = async (id: string) => {
    if (!confirm('Bu müşteri aboneliği silinecek. Emin misiniz?')) return
    await supabase.from('customer_subscriptions').delete().eq('id', id)
    fetchAll()
  }

  const handleRenewal = async (cs: CustSubWithContact) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const today = new Date().toISOString().slice(0, 10)
    const nextBilling = new Date(new Date(cs.next_billing_date).getTime() + 30 * 86400000).toISOString().slice(0, 10)
    const { data: inserted } = await supabase.from('receivables').insert({
      user_id: user.id, contact_id: cs.contact_id, amount: cs.amount, currency: cs.currency ?? 'TRY',
      description: `Abonelik yenileme: ${cs.plan_name}`, source_type: 'customer_subscription', source_id: cs.id,
      issue_date: today, due_date: nextBilling, status: 'pending',
    }).select().single()
    if (inserted) {
      await supabase.from('current_account_entries').insert({
        user_id: user.id, contact_id: cs.contact_id, entry_type: 'debit', amount: cs.amount,
        description: `Abonelik: ${cs.plan_name}`, entry_date: today,
        related_type: 'customer_subscription', related_id: cs.id,
      })
    }
    await supabase.from('customer_subscriptions').update({ next_billing_date: nextBilling }).eq('id', cs.id)
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

  const totalMonthly = subs.filter((s) => s.status === 'active').reduce((acc, s) => {
    if (s.billing_cycle === 'monthly') return acc + s.amount
    if (s.billing_cycle === 'quarterly') return acc + s.amount / 3
    if (s.billing_cycle === 'yearly') return acc + s.amount / 12
    return acc
  }, 0)

  const totalCustMonthly = custSubs.filter((s) => s.status === 'active').reduce((s, cs) => s + cs.amount, 0)

  return (
    <div className="space-y-6 animate-fade-in">
      <Tabs defaultValue="expense">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Abonelikler</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Gider ve müşteri aboneliklerini yönetin</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => { setEditingExp(null); setShowExpForm(true) }} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Gider Aboneliği
            </Button>
            <Button onClick={() => { setEditingCust(null); setShowCustForm(true) }} size="sm" variant="outline" className="gap-1.5">
              <Plus className="h-4 w-4" /> Müşteri Aboneliği
            </Button>
          </div>
        </div>

        {/* Summary banner */}
        <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-100 rounded-2xl p-4 flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-violet-100"><CreditCard className="h-4 w-4 text-violet-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Aylık Gider Aboneliği</p>
              <AmountDisplay amount={totalMonthly} negative className="text-sm font-bold" />
            </div>
          </div>
          <div className="h-8 w-px bg-violet-200 hidden sm:block" />
          <div className="flex items-center gap-3">
            <div className="kpi-icon bg-indigo-100"><Users className="h-4 w-4 text-indigo-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Aylık Müşteri Geliri</p>
              <AmountDisplay amount={totalCustMonthly} positive className="text-sm font-bold" />
            </div>
          </div>
          <div className="h-8 w-px bg-violet-200 hidden sm:block" />
          <div>
            <p className="text-xs text-muted-foreground">Net Aylık Abonelik</p>
            <AmountDisplay amount={totalCustMonthly - totalMonthly} positive={totalCustMonthly > totalMonthly} negative={totalCustMonthly < totalMonthly} className="text-sm font-bold" />
          </div>
        </div>

        <TabsList className="mt-2">
          <TabsTrigger value="expense">Gider Abonelikleri</TabsTrigger>
          <TabsTrigger value="customer">Müşteri Abonelikleri</TabsTrigger>
        </TabsList>

        <TabsContent value="expense" className="mt-4">
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-50/50">
                <tr>
                  {['Ad', 'Döngü', 'Sonraki Ödeme', 'Tutar', 'Durum', ''].map((h) => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <CreditCard className="h-12 w-12 text-muted-foreground/25 mx-auto mb-3" />
                      <h3 className="text-sm font-semibold text-gray-900 mb-1">Gider aboneliği yok</h3>
                      <p className="text-xs text-muted-foreground">Netflix, Spotify gibi aboneliklerinizi buraya ekleyin.</p>
                    </td>
                  </tr>
                )}
                {subs.map((s) => (
                  <tr key={s.id} className="border-b border-border/40 hover:bg-primary/[0.02] transition-colors">
                    <td className="px-5 py-3 font-medium">{s.name}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cycleBadgeColor(s.billing_cycle)}`}>
                        {cycleLabel(s.billing_cycle)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{formatDate(s.next_billing_date)}</td>
                    <td className="px-5 py-3"><AmountDisplay amount={s.amount} negative /></td>
                    <td className="px-5 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingExp(s); setShowExpForm(true) }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDeleteExp(s.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="customer" className="mt-4">
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-50/50">
                <tr>
                  {['Müşteri', 'Plan', 'Vade', 'Tutar', 'Durum', ''].map((h) => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {custSubs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <Users className="h-12 w-12 text-muted-foreground/25 mx-auto mb-3" />
                      <h3 className="text-sm font-semibold text-gray-900 mb-1">Müşteri aboneliği yok</h3>
                      <p className="text-xs text-muted-foreground">Müşterilerinize ait abonelikleri buradan yönetin.</p>
                    </td>
                  </tr>
                )}
                {custSubs.map((cs) => (
                  <tr key={cs.id} className="border-b border-border/40 hover:bg-primary/[0.02] transition-colors">
                    <td className="px-5 py-3 font-medium">{cs.contact_name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{cs.plan_name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{formatDate(cs.next_billing_date)}</td>
                    <td className="px-5 py-3"><AmountDisplay amount={cs.amount} positive /></td>
                    <td className="px-5 py-3"><StatusBadge status={cs.status} /></td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        {cs.status === 'active' && (
                          <Button variant="outline" size="sm" onClick={() => handleRenewal(cs)} className="gap-1 text-xs">
                            <RefreshCw className="h-3 w-3" /> Yenile
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingCust(cs); setShowCustForm(true) }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDeleteCust(cs.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {showExpForm && (
        <ExpenseSubForm
          item={editingExp}
          onSave={() => { setShowExpForm(false); setEditingExp(null); fetchAll() }}
          onClose={() => { setShowExpForm(false); setEditingExp(null) }}
        />
      )}
      {showCustForm && (
        <CustomerSubForm
          contacts={contacts}
          item={editingCust}
          onSave={() => { setShowCustForm(false); setEditingCust(null); fetchAll() }}
          onClose={() => { setShowCustForm(false); setEditingCust(null) }}
        />
      )}
    </div>
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
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = {
      user_id: user.id, name: form.name, amount: parseFloat(form.amount),
      billing_cycle: form.billing_cycle as any, next_billing_date: form.next_billing_date,
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
          <div className="space-y-1.5"><Label>Servis Adı *</Label><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Tutar (₺) *</Label><Input type="number" value={form.amount} onChange={(e) => set('amount', e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Döngü</Label>
              <Select value={form.billing_cycle} onValueChange={(v) => set('billing_cycle', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Aylık</SelectItem>
                  <SelectItem value="quarterly">Üç Aylık</SelectItem>
                  <SelectItem value="yearly">Yıllık</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Sonraki Ödeme Tarihi *</Label><Input type="date" value={form.next_billing_date} onChange={(e) => set('next_billing_date', e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Durum</Label>
            <Select value={form.status} onValueChange={(v) => set('status', v)}>
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
          <Button onClick={handleSave} disabled={loading || !form.name || !form.amount || !form.next_billing_date}>Kaydet</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CustomerSubForm({ contacts, item, onSave, onClose }: { contacts: Contact[]; item: (CustomerSubscription & { contact_name?: string }) | null; onSave: () => void; onClose: () => void }) {
  const today = new Date()
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString().slice(0, 10)
  const [form, setForm] = useState({
    contact_id: item?.contact_id ?? '',
    plan_name: item?.plan_name ?? '',
    amount: item?.amount?.toString() ?? '',
    start_date: item?.start_date ?? today.toISOString().slice(0, 10),
    next_billing_date: item?.next_billing_date ?? nextMonth,
    status: item?.status ?? 'active',
    notes: item?.notes ?? '',
  })
  const [loading, setLoading] = useState(false)
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = {
      user_id: user.id, contact_id: form.contact_id, plan_name: form.plan_name,
      amount: parseFloat(form.amount), billing_cycle: 'monthly' as const,
      start_date: form.start_date, next_billing_date: form.next_billing_date,
      status: form.status as any, notes: form.notes || null, currency: 'TRY',
    }
    if (item) {
      await supabase.from('customer_subscriptions').update(payload).eq('id', item.id)
    } else {
      const { data: inserted } = await supabase.from('customer_subscriptions').insert(payload).select().single()
      if (inserted && form.contact_id) {
        const monthLabel = today.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
        const { data: rec } = await supabase.from('receivables').insert({
          user_id: user.id, contact_id: form.contact_id, amount: parseFloat(form.amount), currency: 'TRY',
          description: `${form.plan_name} - ${monthLabel} abonelik`,
          source_type: 'customer_subscription', source_id: inserted.id,
          issue_date: today.toISOString().slice(0, 10), due_date: form.next_billing_date, status: 'pending',
        }).select().single()
        if (rec) {
          await supabase.from('current_account_entries').insert({
            user_id: user.id, contact_id: form.contact_id, entry_type: 'debit',
            amount: parseFloat(form.amount), description: `${form.plan_name} aylık abonelik`,
            entry_date: today.toISOString().slice(0, 10),
            related_type: 'customer_subscription', related_id: inserted.id,
          })
        }
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
            <Select value={form.contact_id} onValueChange={(v) => set('contact_id', v)}>
              <SelectTrigger><SelectValue placeholder="Seçin" /></SelectTrigger>
              <SelectContent>{contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Plan Adı *</Label><Input value={form.plan_name} onChange={(e) => set('plan_name', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Tutar (₺) *</Label><Input type="number" value={form.amount} onChange={(e) => set('amount', e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Döngü</Label>
              <div className="h-10 flex items-center px-3 rounded-xl border border-input bg-muted/30 text-sm text-muted-foreground">
                Aylık (sabit)
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Başlangıç</Label><Input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Sonraki Yenileme</Label><Input type="date" value={form.next_billing_date} onChange={(e) => set('next_billing_date', e.target.value)} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>Durum</Label>
            <Select value={form.status} onValueChange={(v) => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="inactive">Pasif</SelectItem>
                <SelectItem value="cancelled">İptal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {!item && (
            <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
              Bu abonelik kaydedilince bu aya ait alacak otomatik olarak oluşturulacak.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button onClick={handleSave} disabled={loading || !form.contact_id || !form.plan_name || !form.amount}>Kaydet</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
