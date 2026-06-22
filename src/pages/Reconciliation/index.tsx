import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { Reconciliation, Contact, ReconciliationStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import { Plus, ArrowRightLeft, CheckCircle2, RefreshCw, Scale, Trash2 } from 'lucide-react'
import { ReconciliationForm } from './ReconciliationForm'

type RecWithContact = Reconciliation & { contact_name?: string }

const STATUS_LABELS: Record<ReconciliationStatus, string> = {
  draft: 'Taslak',
  sent: 'Gönderildi',
  disputed: 'İtiraz Var',
  agreed: 'Anlaşıldı',
  converted: 'Dönüştürüldü',
  closed: 'Kapandı',
}

const STATUS_CLASSES: Record<ReconciliationStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  disputed: 'bg-red-100 text-red-700',
  agreed: 'bg-amber-100 text-amber-700',
  converted: 'bg-purple-100 text-purple-700',
  closed: 'bg-green-100 text-green-700',
}

function formatTRY(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return '—'
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount)
}

export function ReconciliationPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<RecWithContact[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const fetchAll = async () => {
    const [r, c] = await Promise.all([
      supabase.from('reconciliations').select('*, contacts(name)').order('created_at', { ascending: false }),
      supabase.from('contacts').select('id,name').eq('is_active', true).order('name'),
    ])
    setItems((r.data ?? []).map((x: any) => ({ ...x, contact_name: x.contacts?.name })))
    setContacts((c.data ?? []) as Contact[])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const handleDelete = async (e: React.MouseEvent, id: string, num: string) => {
    e.stopPropagation()
    if (!window.confirm(`"${num}" numaralı mutabakat silinecek. Emin misiniz?`)) return
    await supabase.from('reconciliations').delete().eq('id', id)
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

  const totalCount = items.length
  const agreedCount = items.filter((r) => r.status === 'agreed').length
  const convertedCount = items.filter((r) => r.status === 'converted').length

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mutabakatlar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{totalCount} mutabakat listeleniyor</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Yeni Mutabakat
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger-children">
        <div className="kpi-card">
          <div className="flex items-start justify-between mb-3">
            <div className="kpi-icon bg-indigo-50"><Scale className="h-5 w-5 text-indigo-600" /></div>
          </div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Toplam</p>
          <p className="text-2xl font-bold text-gray-900">{totalCount} <span className="text-sm font-normal text-muted-foreground">adet</span></p>
        </div>
        <div className="kpi-card">
          <div className="flex items-start justify-between mb-3">
            <div className="kpi-icon bg-amber-50"><CheckCircle2 className="h-5 w-5 text-amber-600" /></div>
          </div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Anlaşıldı</p>
          <p className="text-2xl font-bold text-gray-900">{agreedCount} <span className="text-sm font-normal text-muted-foreground">adet</span></p>
        </div>
        <div className="kpi-card">
          <div className="flex items-start justify-between mb-3">
            <div className="kpi-icon bg-purple-50"><RefreshCw className="h-5 w-5 text-purple-600" /></div>
          </div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Dönüştürüldü</p>
          <p className="text-2xl font-bold text-gray-900">{convertedCount} <span className="text-sm font-normal text-muted-foreground">adet</span></p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-50/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Numara</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cari</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dönem</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bizim Bakiye</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Karşı Taraf</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fark</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Durum</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="py-16 text-center">
                  <ArrowRightLeft className="h-12 w-12 text-muted-foreground/25 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">Mutabakat bulunamadı</h3>
                  <p className="text-xs text-muted-foreground">Cari hesap mutabakatlarını buradan oluşturun ve yönetin.</p>
                </td>
              </tr>
            )}
            {items.map((r) => {
              const diff = r.difference
              const effectiveBalance = r.our_final_balance ?? r.our_calculated_balance
              return (
                <tr
                  key={r.id}
                  className="border-b border-border/40 hover:bg-primary/[0.02] transition-colors cursor-pointer"
                  onClick={() => navigate(`/reconciliation/${r.id}`)}
                >
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-indigo-700">{r.reconciliation_number}</td>
                  <td className="px-4 py-3 font-medium">{r.contact_name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                    {formatDate(r.period_start)}
                    <span className="mx-1">–</span>
                    {formatDate(r.period_end)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatTRY(effectiveBalance)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.their_balance !== null ? formatTRY(r.their_balance) : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3 text-right">
                    {diff === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : diff > 0 ? (
                      <span className="text-red-600 font-semibold tabular-nums">{formatTRY(diff)}</span>
                    ) : diff < 0 ? (
                      <span className="text-blue-600 font-semibold tabular-nums">{formatTRY(diff)}</span>
                    ) : (
                      <span className="text-green-600 font-semibold">Fark yok</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASSES[r.status]}`}>
                      {STATUS_LABELS[r.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => handleDelete(e, r.id, r.reconciliation_number ?? r.id.slice(0,8))}
                      className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showForm && (
        <ReconciliationForm
          contacts={contacts}
          onSave={() => { setShowForm(false); fetchAll() }}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}
