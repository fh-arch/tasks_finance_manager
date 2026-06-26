import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { Contact, Transaction, Quote, Document as DocFile } from '@/types'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AmountDisplay } from '@/components/shared/AmountDisplay'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatDate } from '@/lib/utils'
import {
  ArrowLeft, Plus, Upload, File, FileText, Image as ImageIcon, Download,
  GitBranch, TrendingUp, TrendingDown, ArrowUpDown, SlidersHorizontal,
} from 'lucide-react'
import { ContactForm } from './ContactForm'

const TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  receivable:  { label: 'Alacak',     color: 'text-blue-700',    bg: 'bg-blue-50'    },
  payable:     { label: 'Borç',       color: 'text-orange-700',  bg: 'bg-orange-50'  },
  income:      { label: 'Gelir',      color: 'text-emerald-700', bg: 'bg-emerald-50' },
  expense:     { label: 'Gider',      color: 'text-red-700',     bg: 'bg-red-50'     },
  adjustment:  { label: 'Düzeltme',   color: 'text-violet-700',  bg: 'bg-violet-50'  },
}

const typeLabels: Record<string, string> = { customer: 'Müşteri', supplier: 'Tedarikçi', both: 'İkisi', employee: 'Çalışan' }

export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [contact, setContact] = useState<Contact | null>(null)
  const [allTx, setAllTx] = useState<Transaction[]>([])   // tüm transactions bu contact için
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [docs, setDocs] = useState<DocFile[]>([])
  const [branches, setBranches] = useState<Contact[]>([])
  const [contactTasks, setContactTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdjDialog, setShowAdjDialog] = useState(false)
  const [showBranchForm, setShowBranchForm] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [editForm, setEditForm] = useState({
    name: '', type: 'customer', email: '', phone: '', tax_number: '',
    tax_office: '', address: '', city: '', credit_limit: '', notes: '', is_active: true,
    iban: '', bank_name: '',
  })

  const [adjForm, setAdjForm] = useState({
    amount: '', description: '', entry_date: new Date().toISOString().slice(0, 10), direction: 'positive',
  })

  const fetchAll = async () => {
    if (!id) return
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

    const [c, tx, q, d, b, tk] = await Promise.all([
      supabase.from('contacts').select('*').eq('id', id).single(),
      supabase.from('transactions')
        .select('*')
        .eq('contact_id', id)
        .order('transaction_date', { ascending: false }),
      supabase.from('quotes').select('*').eq('contact_id', id).order('issue_date', { ascending: false }),
      supabase.from('documents').select('*').eq('related_type', 'contact').eq('related_id', id).order('uploaded_at', { ascending: false }),
      supabase.from('contacts').select('*').eq('parent_id', id).order('name'),
      supabase.from('tasks').select('*, personnel:assigned_to_personnel_id(name)')
        .eq('assigned_to_contact_id', id)
        .or(`due_date.gte.${monthStart},due_date.lte.${monthEnd},due_date.is.null`)
        .order('due_date', { ascending: true, nullsFirst: false }),
    ])

    const contactData = c.data as Contact
    setContact(contactData)
    if (contactData) {
      setEditForm({
        name: contactData.name, type: contactData.type, email: contactData.email ?? '',
        phone: contactData.phone ?? '', tax_number: contactData.tax_number ?? '',
        tax_office: contactData.tax_office ?? '', address: contactData.address ?? '',
        city: contactData.city ?? '', credit_limit: contactData.credit_limit?.toString() ?? '',
        notes: contactData.notes ?? '', is_active: contactData.is_active,
        iban: (contactData as any).iban ?? '', bank_name: (contactData as any).bank_name ?? '',
      })
    }

    setAllTx((tx.data ?? []) as Transaction[])
    setQuotes((q.data ?? []) as Quote[])
    setDocs((d.data ?? []) as DocFile[])
    setBranches((b.data ?? []) as Contact[])
    setContactTasks((tk.data ?? []).map((t: any) => ({ ...t, personnel_name: t.personnel?.name ?? null })))
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [id])

  // Türlere göre filtreler
  const receivables = useMemo(() => allTx.filter(t => t.type === 'receivable'), [allTx])
  const payables    = useMemo(() => allTx.filter(t => t.type === 'payable'),    [allTx])
  const txLedger    = useMemo(() => allTx.filter(t => t.type === 'income' || t.type === 'expense'), [allTx])

  // Ekstre için tarih sıralı, running balance
  const ledger = useMemo(() => {
    const sorted = [...allTx].sort((a, b) => (a.transaction_date ?? '').localeCompare(b.transaction_date ?? ''))
    let running = 0
    return sorted.map(t => {
      const total = t.total_amount ?? t.amount
      const paid  = t.paid_amount ?? 0
      if (t.type === 'receivable' || t.type === 'income' || t.type === 'adjustment') {
        running += total
      } else {
        running -= total
      }
      return { ...t, runningBalance: running, remaining: total - paid }
    }).reverse()
  }, [allTx])

  // KPI
  const toplamAlacak  = receivables.reduce((s, t) => s + (t.total_amount ?? t.amount), 0)
  const toplamBorc    = payables.reduce((s, t) => s + (t.total_amount ?? t.amount), 0)
  const tahsilEdilen  = receivables.reduce((s, t) => s + (t.paid_amount ?? 0), 0)
  const odenen        = payables.reduce((s, t) => s + (t.paid_amount ?? 0), 0)
  const netBakiye     = (toplamAlacak - tahsilEdilen) - (toplamBorc - odenen)

  const handleSaveInfo = async () => {
    if (!contact) return
    await supabase.from('contacts').update({
      name: editForm.name, type: editForm.type as Contact['type'],
      email: editForm.email || null, phone: editForm.phone || null,
      tax_number: editForm.tax_number || null, tax_office: editForm.tax_office || null,
      address: editForm.address || null, city: editForm.city || null,
      credit_limit: editForm.credit_limit ? parseFloat(editForm.credit_limit) : null,
      notes: editForm.notes || null, is_active: editForm.is_active,
      iban: editForm.iban || null, bank_name: editForm.bank_name || null,
    }).eq('id', contact.id)
    setEditMode(false); fetchAll()
  }

  // Düzeltme kaydı — type='adjustment' transaction
  const handleAddAdjustment = async () => {
    if (!id || !adjForm.amount) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const amt = parseFloat(adjForm.amount)
    await supabase.from('transactions').insert({
      user_id: user.id, contact_id: id,
      type: 'adjustment',
      amount: adjForm.direction === 'positive' ? amt : -amt,
      description: adjForm.description || 'Cari düzeltme kaydı',
      transaction_date: adjForm.entry_date,
      status: 'paid', currency: 'TRY', paid_amount: amt,
    })
    // Cari hesap trigger için de kayıt
    await supabase.from('current_account_entries').insert({
      user_id: user.id, contact_id: id,
      entry_type: adjForm.direction === 'positive' ? 'debit' : 'credit',
      amount: amt,
      description: adjForm.description || 'Cari düzeltme kaydı',
      entry_date: adjForm.entry_date,
    })
    setShowAdjDialog(false)
    setAdjForm({ amount: '', description: '', entry_date: new Date().toISOString().slice(0, 10), direction: 'positive' })
    fetchAll()
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !id) return
    setUploading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }
    const path = `${user.id}/contacts/${id}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('finans-bucket').upload(path, file)
    if (!error) {
      await supabase.from('documents').insert({
        user_id: user.id, related_type: 'contact', related_id: id,
        file_name: file.name, file_path: path, file_type: file.type, file_size: file.size,
      })
      fetchAll()
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleDownload = async (doc: DocFile) => {
    const { data } = await supabase.storage.from('finans-bucket').createSignedUrl(doc.file_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const handleDeleteDoc = async (doc: DocFile) => {
    if (!window.confirm(`"${doc.file_name}" silinecek?`)) return
    await supabase.storage.from('finans-bucket').remove([doc.file_path])
    await supabase.from('documents').delete().eq('id', doc.id)
    fetchAll()
  }

  const getFileIcon = (type: string | null) => {
    if (type?.startsWith('image/')) return <ImageIcon className="h-4 w-4 text-blue-500" />
    if (type === 'application/pdf') return <FileText className="h-4 w-4 text-red-500" />
    return <File className="h-4 w-4 text-gray-500" />
  }

  const setE = (k: string, v: string) => setEditForm(f => ({ ...f, [k]: v }))

  if (loading) return <div className="text-center py-20 text-muted-foreground">Yükleniyor...</div>
  if (!contact) return <div className="text-center py-20">Cari bulunamadı</div>

  const fmtTRY = (n: number) => n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })

  return (
    <div className="space-y-4">
      {/* Başlık */}
      <div className="flex items-center gap-3">
        <Link to="/contacts">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Geri</Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{contact.name}</h1>
            <Badge variant={contact.is_active ? 'success' : 'outline'}>{contact.is_active ? 'Aktif' : 'Pasif'}</Badge>
            <Badge variant="outline">{typeLabels[contact.type] ?? contact.type}</Badge>
          </div>
          {(contact.email || contact.phone) && (
            <p className="text-sm text-muted-foreground">{[contact.email, contact.phone].filter(Boolean).join(' • ')}</p>
          )}
        </div>
      </div>

      {/* KPI — unified transactions'dan hesaplanıyor */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="kpi-card">
          <p className="text-xs text-muted-foreground mb-1">Toplam Alacak</p>
          <p className="text-base font-bold text-blue-700">{fmtTRY(toplamAlacak)}</p>
        </div>
        <div className="kpi-card">
          <p className="text-xs text-muted-foreground mb-1">Tahsil Edilen</p>
          <p className="text-base font-bold text-emerald-600">{fmtTRY(tahsilEdilen)}</p>
        </div>
        <div className="kpi-card">
          <p className="text-xs text-muted-foreground mb-1">Toplam Borç</p>
          <p className="text-base font-bold text-orange-600">{fmtTRY(toplamBorc)}</p>
        </div>
        <div className="kpi-card">
          <p className="text-xs text-muted-foreground mb-1">Ödenen</p>
          <p className="text-base font-bold text-emerald-600">{fmtTRY(odenen)}</p>
        </div>
        <div className={`kpi-card sm:col-span-1 col-span-2 border-2 ${netBakiye >= 0 ? 'border-emerald-200 bg-emerald-50/30' : 'border-red-200 bg-red-50/30'}`}>
          <p className="text-xs text-muted-foreground mb-1">Net Bakiye</p>
          <p className={`text-lg font-bold ${netBakiye >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmtTRY(netBakiye)}</p>
          <p className="text-xs text-muted-foreground">{netBakiye >= 0 ? 'Alacaklı' : 'Borçlu'}</p>
        </div>
      </div>

      <Tabs defaultValue="ledger">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="ledger">Cari Ekstre ({allTx.length})</TabsTrigger>
          <TabsTrigger value="receivables">Alacaklar ({receivables.length})</TabsTrigger>
          <TabsTrigger value="payables">Borçlar ({payables.length})</TabsTrigger>
          <TabsTrigger value="transactions">İşlemler ({txLedger.length})</TabsTrigger>
          <TabsTrigger value="quotes">Teklifler ({quotes.length})</TabsTrigger>
          <TabsTrigger value="docs">Belgeler ({docs.length})</TabsTrigger>
          <TabsTrigger value="branches">Şubeler ({branches.length})</TabsTrigger>
          <TabsTrigger value="tasks">Görevler ({contactTasks.length})</TabsTrigger>
          <TabsTrigger value="info">Bilgiler</TabsTrigger>
        </TabsList>

        {/* ── Cari Ekstre ── */}
        <TabsContent value="ledger">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="text-sm">Cari Hesap Ekstresi</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowAdjDialog(true)}>
                <SlidersHorizontal className="h-4 w-4 mr-1" />Düzeltme Ekle
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-4 py-2 text-left text-xs text-muted-foreground">Tarih</th>
                    <th className="px-4 py-2 text-left text-xs text-muted-foreground">Tür</th>
                    <th className="px-4 py-2 text-left text-xs text-muted-foreground">Açıklama</th>
                    <th className="px-4 py-2 text-right text-xs text-muted-foreground">Tutar</th>
                    <th className="px-4 py-2 text-right text-xs text-muted-foreground">Ödenen</th>
                    <th className="px-4 py-2 text-right text-xs text-muted-foreground">Bakiye</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.length === 0 && (
                    <tr><td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">Hareket yok</td></tr>
                  )}
                  {ledger.map(t => {
                    const meta = TYPE_LABELS[t.type] ?? { label: t.type, color: 'text-gray-600', bg: 'bg-gray-100' }
                    const total = t.total_amount ?? t.amount
                    return (
                      <tr key={t.id} className="border-b hover:bg-gray-50/60">
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{formatDate(t.transaction_date)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${meta.bg} ${meta.color}`}>{meta.label}</span>
                        </td>
                        <td className="px-4 py-2.5 max-w-[200px] truncate text-muted-foreground">{t.description ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right font-medium">
                          {t.type === 'receivable' || t.type === 'income' || t.type === 'adjustment'
                            ? <span className="text-blue-700">+{fmtTRY(total)}</span>
                            : <span className="text-red-600">-{fmtTRY(total)}</span>
                          }
                        </td>
                        <td className="px-4 py-2.5 text-right text-emerald-600">{fmtTRY(t.paid_amount ?? 0)}</td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${(t as any).runningBalance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                          {fmtTRY((t as any).runningBalance)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Alacaklar ── */}
        <TabsContent value="receivables">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="text-sm">Alacaklar</CardTitle>
              <Button size="sm" onClick={() => navigate('/receivables')}>
                <Plus className="h-4 w-4 mr-1" />Yeni Alacak
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-4 py-2 text-left text-xs text-muted-foreground">Açıklama</th>
                    <th className="px-4 py-2 text-left text-xs text-muted-foreground">Vade</th>
                    <th className="px-4 py-2 text-right text-xs text-muted-foreground">Tutar</th>
                    <th className="px-4 py-2 text-right text-xs text-muted-foreground">KDV Dahil</th>
                    <th className="px-4 py-2 text-right text-xs text-muted-foreground">Ödenen</th>
                    <th className="px-4 py-2 text-xs text-muted-foreground">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {receivables.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">Alacak yok</td></tr>}
                  {receivables.map(r => (
                    <tr key={r.id} className="border-b hover:bg-gray-50/60">
                      <td className="px-4 py-2.5 max-w-[180px] truncate">{r.description ?? '—'}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.due_date ? formatDate(r.due_date) : '—'}</td>
                      <td className="px-4 py-2.5 text-right"><AmountDisplay amount={r.amount} /></td>
                      <td className="px-4 py-2.5 text-right font-medium text-blue-700">{fmtTRY(r.total_amount ?? r.amount)}</td>
                      <td className="px-4 py-2.5 text-right"><AmountDisplay amount={r.paid_amount ?? 0} positive /></td>
                      <td className="px-4 py-2.5"><StatusBadge status={r.status === 'open' ? 'pending' : r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Borçlar ── */}
        <TabsContent value="payables">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="text-sm">Borçlar</CardTitle>
              <Button size="sm" onClick={() => navigate('/payables')}>
                <Plus className="h-4 w-4 mr-1" />Yeni Borç
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-4 py-2 text-left text-xs text-muted-foreground">Açıklama</th>
                    <th className="px-4 py-2 text-left text-xs text-muted-foreground">Vade</th>
                    <th className="px-4 py-2 text-right text-xs text-muted-foreground">Tutar</th>
                    <th className="px-4 py-2 text-right text-xs text-muted-foreground">KDV Dahil</th>
                    <th className="px-4 py-2 text-xs text-muted-foreground">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {payables.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">Borç yok</td></tr>}
                  {payables.map(p => (
                    <tr key={p.id} className="border-b hover:bg-gray-50/60">
                      <td className="px-4 py-2.5 max-w-[180px] truncate">{p.description ?? '—'}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{p.due_date ? formatDate(p.due_date) : '—'}</td>
                      <td className="px-4 py-2.5 text-right"><AmountDisplay amount={p.amount} negative /></td>
                      <td className="px-4 py-2.5 text-right font-medium text-orange-700">{fmtTRY(p.total_amount ?? p.amount)}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={p.status === 'open' ? 'pending' : p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── İşlemler (income/expense) ── */}
        <TabsContent value="transactions">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Gerçekleşen İşlemler (Gelir / Gider)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-4 py-2 text-left text-xs text-muted-foreground">Tarih</th>
                    <th className="px-4 py-2 text-left text-xs text-muted-foreground">Tür</th>
                    <th className="px-4 py-2 text-left text-xs text-muted-foreground">Açıklama</th>
                    <th className="px-4 py-2 text-right text-xs text-muted-foreground">Tutar</th>
                    <th className="px-4 py-2 text-xs text-muted-foreground">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {txLedger.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">İşlem yok</td></tr>}
                  {txLedger.map(t => (
                    <tr key={t.id} className="border-b hover:bg-gray-50/60">
                      <td className="px-4 py-2.5 text-muted-foreground">{formatDate(t.transaction_date)}</td>
                      <td className="px-4 py-2.5">
                        {t.type === 'income'
                          ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><TrendingUp className="h-3 w-3" />Gelir</span>
                          : <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full"><TrendingDown className="h-3 w-3" />Gider</span>
                        }
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground max-w-[180px] truncate">{t.description ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right">
                        <AmountDisplay amount={t.amount} positive={t.type === 'income'} negative={t.type === 'expense'} />
                      </td>
                      <td className="px-4 py-2.5"><StatusBadge status={t.status === 'open' ? 'pending' : t.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Teklifler ── */}
        <TabsContent value="quotes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="text-sm">Teklifler</CardTitle>
              <Button size="sm" onClick={() => navigate('/quotes')}>
                <Plus className="h-4 w-4 mr-1" />Yeni Teklif
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-4 py-2 text-xs text-muted-foreground">Teklif No</th>
                    <th className="px-4 py-2 text-xs text-muted-foreground">Başlık</th>
                    <th className="px-4 py-2 text-xs text-muted-foreground">Tarih</th>
                    <th className="px-4 py-2 text-right text-xs text-muted-foreground">Tutar</th>
                    <th className="px-4 py-2 text-xs text-muted-foreground">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">Teklif yok</td></tr>}
                  {quotes.map(q => (
                    <tr key={q.id} className="border-b hover:bg-gray-50/60">
                      <td className="px-4 py-2.5 font-mono text-xs">{q.quote_number}</td>
                      <td className="px-4 py-2.5">{q.title}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{formatDate(q.issue_date)}</td>
                      <td className="px-4 py-2.5 text-right">{q.total ? fmtTRY(q.total) : '—'}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={q.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Belgeler ── */}
        <TabsContent value="docs">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="text-sm">Belgeler</CardTitle>
              <div>
                <input ref={fileRef} type="file" className="hidden" onChange={handleUpload}
                  accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv,.doc,.docx" />
                <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  <Upload className="h-4 w-4 mr-1" />{uploading ? 'Yükleniyor...' : 'Belge Yükle'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-4 py-2 text-xs text-muted-foreground">Dosya</th>
                    <th className="px-4 py-2 text-xs text-muted-foreground">Boyut</th>
                    <th className="px-4 py-2 text-xs text-muted-foreground">Tarih</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {docs.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground text-sm">Belge yok</td></tr>}
                  {docs.map(d => (
                    <tr key={d.id} className="border-b hover:bg-gray-50/60">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">{getFileIcon(d.file_type)}<span className="font-medium">{d.file_name}</span></div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{d.file_size ? `${(d.file_size / 1024).toFixed(1)} KB` : '—'}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{formatDate(d.uploaded_at)}</td>
                      <td className="px-4 py-2.5 text-right flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => handleDownload(d)}><Download className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => handleDeleteDoc(d)}>×</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Şubeler ── */}
        <TabsContent value="branches">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="text-sm">Şubeler / Alt Cariler</CardTitle>
              <Button size="sm" onClick={() => setShowBranchForm(true)}>
                <Plus className="h-4 w-4 mr-1" />Şube Ekle
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-4 py-2 text-xs text-muted-foreground">Şube Adı</th>
                    <th className="px-4 py-2 text-xs text-muted-foreground">Telefon</th>
                    <th className="px-4 py-2 text-xs text-muted-foreground">Şehir</th>
                    <th className="px-4 py-2 text-right text-xs text-muted-foreground">Bakiye</th>
                    <th className="px-4 py-2 text-xs text-muted-foreground">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">Şube yok</td></tr>}
                  {branches.map(b => (
                    <tr key={b.id} className="border-b hover:bg-gray-50/60">
                      <td className="px-4 py-2.5">
                        <Link to={`/contacts/${b.id}`} className="flex items-center gap-2 font-medium text-blue-600 hover:underline">
                          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />{b.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{b.phone ?? '—'}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{b.city ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right">
                        <AmountDisplay amount={Math.abs(b.current_balance)} positive={b.current_balance > 0} negative={b.current_balance < 0} />
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={b.is_active ? 'success' : 'outline'}>{b.is_active ? 'Aktif' : 'Pasif'}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Görevler ── */}
        <TabsContent value="tasks">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">
                Bu Aya Ait Görevler
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({new Date().toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contactTasks.length === 0
                ? <p className="text-sm text-muted-foreground text-center py-8">Bu ay için görev atanmamış</p>
                : (
                  <div className="space-y-2">
                    {contactTasks.map((task: any) => {
                      const STATUS_LABEL: Record<string, string> = { todo: 'Yapılacak', in_progress: 'Devam Ediyor', done: 'Tamamlandı' }
                      const STATUS_COLOR: Record<string, string> = { todo: 'bg-gray-100 text-gray-600', in_progress: 'bg-blue-100 text-blue-700', done: 'bg-emerald-100 text-emerald-700' }
                      const td = new Date().toISOString().slice(0, 10)
                      const late = task.due_date && task.due_date < td && task.status !== 'done'
                      return (
                        <div key={task.id} className={`flex items-start gap-3 p-3 rounded-xl border ${task.status === 'done' ? 'bg-gray-50/50 opacity-70' : 'bg-white'}`}>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</p>
                            {task.description && <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>}
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[task.status]}`}>{STATUS_LABEL[task.status]}</span>
                              {task.personnel_name && <span className="text-xs text-blue-600">→ {task.personnel_name}</span>}
                              {task.due_date && (
                                <span className={`text-xs ${late ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
                                  {late ? '⚠ Gecikti · ' : ''}{formatDate(task.due_date)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              }
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Genel Bilgiler ── */}
        <TabsContent value="info">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="text-sm">Cari Bilgileri</CardTitle>
              {editMode
                ? <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>İptal</Button>
                    <Button size="sm" onClick={handleSaveInfo}>Kaydet</Button>
                  </div>
                : <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>Düzenle</Button>
              }
            </CardHeader>
            <CardContent>
              {editMode ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1.5"><Label>Ad / Unvan *</Label><Input value={editForm.name} onChange={e => setE('name', e.target.value)} /></div>
                  <div className="space-y-1.5">
                    <Label>Tür</Label>
                    <Select value={editForm.type} onValueChange={v => setE('type', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="customer">Müşteri</SelectItem>
                        <SelectItem value="supplier">Tedarikçi</SelectItem>
                        <SelectItem value="both">İkisi</SelectItem>
                        <SelectItem value="employee">Çalışan</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Durum</Label>
                    <Select value={editForm.is_active ? 'true' : 'false'} onValueChange={v => setEditForm(f => ({ ...f, is_active: v === 'true' }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Aktif</SelectItem>
                        <SelectItem value="false">Pasif</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>E-posta</Label><Input type="email" value={editForm.email} onChange={e => setE('email', e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Telefon</Label><Input value={editForm.phone} onChange={e => setE('phone', e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Şehir</Label><Input value={editForm.city} onChange={e => setE('city', e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Vergi No</Label><Input value={editForm.tax_number} onChange={e => setE('tax_number', e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Vergi Dairesi</Label><Input value={editForm.tax_office} onChange={e => setE('tax_office', e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Kredi Limiti (₺)</Label><Input type="number" value={editForm.credit_limit} onChange={e => setE('credit_limit', e.target.value)} /></div>
                  <div className="col-span-2 space-y-1.5"><Label>Adres</Label><Textarea value={editForm.address} onChange={e => setE('address', e.target.value)} rows={2} /></div>
                  <div className="space-y-1.5"><Label>Banka Adı</Label><Input value={editForm.bank_name} onChange={e => setE('bank_name', e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>IBAN</Label><Input value={editForm.iban} onChange={e => setE('iban', e.target.value)} /></div>
                  <div className="col-span-2 space-y-1.5"><Label>Notlar</Label><Textarea value={editForm.notes} onChange={e => setE('notes', e.target.value)} rows={2} /></div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-y-3 gap-x-8 text-sm">
                  {[
                    ['E-posta', contact.email], ['Telefon', contact.phone], ['Şehir', contact.city],
                    ['Vergi No', contact.tax_number], ['Vergi Dairesi', contact.tax_office],
                    ['Kredi Limiti', contact.credit_limit ? fmtTRY(contact.credit_limit) : null],
                    ['Adres', contact.address], ['Banka', (contact as any).bank_name],
                    ['IBAN', (contact as any).iban], ['Notlar', contact.notes],
                  ].map(([label, value]) => value ? (
                    <div key={label as string}>
                      <p className="text-muted-foreground text-xs">{label}</p>
                      <p className="font-medium mt-0.5">{value}</p>
                    </div>
                  ) : null)}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Düzeltme Kaydı Dialog */}
      <Dialog open={showAdjDialog} onOpenChange={setShowAdjDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cari Hesap Düzeltmesi</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
              Muhasebe prensibi: Geriye dönük düzeltme yapılmaz. Bu işlem yeni bir düzeltme satırı oluşturur.
            </p>
            <div className="space-y-1.5">
              <Label>Yön</Label>
              <Select value={adjForm.direction} onValueChange={v => setAdjForm(f => ({ ...f, direction: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="positive">Alacak artırma (+)</SelectItem>
                  <SelectItem value="negative">Borç artırma (−)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tutar (₺) *</Label>
              <Input type="number" value={adjForm.amount} onChange={e => setAdjForm(f => ({ ...f, amount: e.target.value }))} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Tarih</Label>
              <Input type="date" value={adjForm.entry_date} onChange={e => setAdjForm(f => ({ ...f, entry_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Açıklama</Label>
              <Input value={adjForm.description} onChange={e => setAdjForm(f => ({ ...f, description: e.target.value }))} placeholder="Neden düzeltme yapılıyor?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjDialog(false)}>İptal</Button>
            <Button onClick={handleAddAdjustment} disabled={!adjForm.amount}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showBranchForm && (
        <ContactForm
          contact={null} parentId={id}
          onSave={() => { setShowBranchForm(false); fetchAll() }}
          onClose={() => setShowBranchForm(false)}
        />
      )}
    </div>
  )
}
