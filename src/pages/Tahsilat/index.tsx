import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AmountDisplay } from '@/components/shared/AmountDisplay'
import { formatDate } from '@/lib/utils'
import { AlertCircle, Phone, Mail, TrendingDown, Users, Clock } from 'lucide-react'

type OverdueContact = {
  id: string
  name: string
  email: string | null
  phone: string | null
  balance: number
  last_payment_date: string | null
  collection_date: string | null
  overdue_days: number
}

type OverdueReceivable = {
  id: string
  contact_name: string | null
  description: string
  amount: number
  due_date: string
  collection_date: string | null
  overdue_days: number
}

export default function TahsilatPage() {
  const [overdueContacts, setOverdueContacts] = useState<OverdueContact[]>([])
  const [overdueReceivables, setOverdueReceivables] = useState<OverdueReceivable[]>([])
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [contactsRes, receivablesRes] = await Promise.all([
      supabase.from('contacts')
        .select('id,name,email,phone,balance,last_payment_date,collection_date')
        .eq('user_id', user.id)
        .gt('balance', 0)
        .order('balance', { ascending: false }),
      supabase.from('transactions')
        .select('id,description,amount,due_date,collection_date,contacts(name)')
        .eq('user_id', user.id)
        .eq('type', 'receivable')
        .in('status', ['open', 'partial'])
        .lt('due_date', today)
        .order('due_date', { ascending: true }),
    ])

    const contacts = (contactsRes.data ?? []).map((c: any) => ({
      ...c,
      collection_date: c.collection_date ?? null,
      overdue_days: c.last_payment_date
        ? Math.floor((Date.now() - new Date(c.last_payment_date).getTime()) / 86400000)
        : 999,
    }))

    const receivables = (receivablesRes.data ?? []).map((r: any) => ({
      ...r,
      contact_name: r.contacts?.name ?? null,
      collection_date: r.collection_date ?? null,
      overdue_days: Math.floor((Date.now() - new Date(r.due_date).getTime()) / 86400000),
    }))

    setOverdueContacts(contacts)
    setOverdueReceivables(receivables)
    setLoading(false)
  }

  async function updateContactCollectionDate(id: string, date: string) {
    await supabase.from('contacts').update({ collection_date: date || null }).eq('id', id)
    setOverdueContacts(prev => prev.map(c => c.id === id ? { ...c, collection_date: date || null } : c))
  }

  const totalCariBorc = overdueContacts.reduce((s, c) => s + c.balance, 0)
  const totalReceivables = overdueReceivables.reduce((s, r) => s + r.amount, 0)
  const totalOverdue = totalCariBorc + totalReceivables

  function overdueColor(days: number) {
    if (days > 90) return 'text-red-600 bg-red-50'
    if (days > 30) return 'text-orange-600 bg-orange-50'
    return 'text-amber-600 bg-amber-50'
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tahsilat</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gecikmeli alacaklar ve cari bakiyeler</p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="kpi-card border-red-100 bg-red-50/20">
          <div className="kpi-icon bg-red-50 mb-3"><AlertCircle className="h-5 w-5 text-red-500" /></div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Toplam Gecikmiş</p>
          <AmountDisplay amount={totalOverdue} negative className="text-xl font-bold" />
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-orange-50 mb-3"><Users className="h-5 w-5 text-orange-500" /></div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Cari Bakiyeler</p>
          <AmountDisplay amount={totalCariBorc} negative className="text-xl font-bold text-orange-600" />
          <p className="text-xs text-muted-foreground mt-1">{overdueContacts.length} cari</p>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-amber-50 mb-3"><Clock className="h-5 w-5 text-amber-500" /></div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Vadesi Geçmiş Alacaklar</p>
          <AmountDisplay amount={totalReceivables} negative className="text-xl font-bold text-amber-600" />
          <p className="text-xs text-muted-foreground mt-1">{overdueReceivables.length} alacak</p>
        </div>
      </div>

      {/* Gecikmiş Cari Bakiyeler */}
      <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border/40 bg-gray-50/60 flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-orange-500" />
          <h2 className="text-sm font-semibold text-gray-900">Cari Bakiyeler</h2>
          <span className="ml-auto text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">{overdueContacts.length}</span>
        </div>
        {overdueContacts.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">Gecikmiş cari yok</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-border/40">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cari</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bakiye</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tahsilat Tarihi</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gecikme</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">İletişim</th>
              </tr>
            </thead>
            <tbody>
              {overdueContacts.map(c => (
                <tr key={c.id} className="border-b border-border/40 hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-gray-900">{c.name}</p>
                    {c.last_payment_date && <p className="text-[11px] text-muted-foreground">Son ödeme: {formatDate(c.last_payment_date)}</p>}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <AmountDisplay amount={c.balance} negative className="text-sm font-bold text-orange-600" />
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <input
                      type="date"
                      value={c.collection_date ?? ''}
                      onChange={e => updateContactCollectionDate(c.id, e.target.value)}
                      className="text-xs border border-border/60 rounded-lg px-2 py-1 text-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    />
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${overdueColor(c.overdue_days)}`}>
                      {c.overdue_days === 999 ? 'Hiç ödeme yok' : `${c.overdue_days} gün`}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-xs text-blue-600 hover:underline"><Phone className="h-3 w-3" />{c.phone}</a>}
                      {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-xs text-blue-600 hover:underline"><Mail className="h-3 w-3" />{c.email}</a>}
                      {!c.phone && !c.email && <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-border/40 bg-gray-50">
              <tr>
                <td className="px-5 py-3 font-bold text-sm text-gray-700">Toplam</td>
                <td className="px-5 py-3 text-right">
                  <AmountDisplay amount={totalCariBorc} negative className="text-sm font-bold text-orange-600" />
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Vadesi Geçmiş Alacaklar */}
      <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border/40 bg-gray-50/60 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-gray-900">Vadesi Geçmiş Alacaklar</h2>
          <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">{overdueReceivables.length}</span>
        </div>
        {overdueReceivables.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">Vadesi geçmiş alacak yok</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-border/40">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Açıklama</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cari</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tutar</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vade</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tahsilat Tarihi</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gecikme</th>
              </tr>
            </thead>
            <tbody>
              {overdueReceivables.map(r => (
                <tr key={r.id} className="border-b border-border/40 hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-gray-900">{r.description}</p>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground text-sm">{r.contact_name ?? '—'}</td>
                  <td className="px-5 py-3.5 text-right">
                    <AmountDisplay amount={r.amount} negative className="text-sm font-bold text-amber-600" />
                  </td>
                  <td className="px-5 py-3.5 text-center text-sm text-muted-foreground">{formatDate(r.due_date)}</td>
                  <td className="px-5 py-3.5 text-center">
                    {r.collection_date
                      ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-emerald-700 bg-emerald-50">{formatDate(r.collection_date)}</span>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${overdueColor(r.overdue_days)}`}>
                      {r.overdue_days} gün
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-border/40 bg-gray-50">
              <tr>
                <td className="px-5 py-3 font-bold text-sm text-gray-700" colSpan={2}>Toplam</td>
                <td className="px-5 py-3 text-right">
                  <AmountDisplay amount={totalReceivables} negative className="text-sm font-bold text-amber-600" />
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
