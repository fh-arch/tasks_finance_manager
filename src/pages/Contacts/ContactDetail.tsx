import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { Contact, CurrentAccountEntry, Receivable, Payable, Quote, Document as DocFile, Transaction } from '@/types'
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
import { ArrowLeft, Plus, Upload, File, FileText, Image as ImageIcon, Download, GitBranch, TrendingUp, TrendingDown } from 'lucide-react'
import { ContactForm } from './ContactForm'

type LedgerEntry = CurrentAccountEntry & { runningBalance: number }

const typeLabels: Record<string, string> = { customer: 'Müşteri', supplier: 'Tedarikçi', both: 'İkisi' }

export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [contact, setContact] = useState<Contact | null>(null)
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [receivables, setReceivables] = useState<Receivable[]>([])
  const [payables, setPayables] = useState<Payable[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [docs, setDocs] = useState<DocFile[]>([])
  const [branches, setBranches] = useState<Contact[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [contactTasks, setContactTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showEntryDialog, setShowEntryDialog] = useState(false)
  const [showBranchForm, setShowBranchForm] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [editForm, setEditForm] = useState({
    name: '', type: 'customer', email: '', phone: '', tax_number: '',
    tax_office: '', address: '', city: '', credit_limit: '', notes: '', is_active: true,
  })

  const [entryForm, setEntryForm] = useState({
    entry_type: 'debit', amount: '', description: '', entry_date: new Date().toISOString().slice(0, 10),
  })

  const fetchAll = async () => {
    if (!id) return
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
    const [c, l, r, p, q, d, b, tx, tk] = await Promise.all([
      supabase.from('contacts').select('*').eq('id', id).single(),
      supabase.from('current_account_entries').select('*').eq('contact_id', id).order('entry_date', { ascending: true }),
      supabase.from('receivables').select('*').eq('contact_id', id).order('due_date'),
      supabase.from('payables').select('*').eq('contact_id', id).order('due_date'),
      supabase.from('quotes').select('*').eq('contact_id', id).order('issue_date', { ascending: false }),
      supabase.from('documents').select('*').eq('related_type', 'contact').eq('related_id', id).order('uploaded_at', { ascending: false }),
      supabase.from('contacts').select('*').eq('parent_id', id).order('name'),
      supabase.from('transactions').select('*').eq('contact_id', id).order('transaction_date', { ascending: false }),
      supabase.from('tasks').select('*, personnel:assigned_to_personnel_id(name)').eq('assigned_to_contact_id', id)
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
      })
    }

    const entries = (l.data ?? []) as CurrentAccountEntry[]
    let running = 0
    const withRunning: LedgerEntry[] = entries.map(e => {
      running += e.entry_type === 'debit' ? Number(e.amount) : -Number(e.amount)
      return { ...e, runningBalance: running }
    }).reverse()
    setLedger(withRunning)

    setReceivables((r.data ?? []) as Receivable[])
    setPayables((p.data ?? []) as Payable[])
    setQuotes((q.data ?? []) as Quote[])
    setDocs((d.data ?? []) as DocFile[])
    setBranches((b.data ?? []) as Contact[])
    setTransactions((tx.data ?? []) as Transaction[])
    setContactTasks((tk.data ?? []).map((t: any) => ({ ...t, personnel_name: t.personnel?.name ?? null })))
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [id])

  const handleSaveInfo = async () => {
    if (!contact) return
    await supabase.from('contacts').update({
      name: editForm.name, type: editForm.type as Contact['type'],
      email: editForm.email || null, phone: editForm.phone || null,
      tax_number: editForm.tax_number || null, tax_office: editForm.tax_office || null,
      address: editForm.address || null, city: editForm.city || null,
      credit_limit: editForm.credit_limit ? parseFloat(editForm.credit_limit) : null,
      notes: editForm.notes || null, is_active: editForm.is_active,
    }).eq('id', contact.id)
    setEditMode(false)
    fetchAll()
  }

  const handleAddEntry = async () => {
    if (!id || !entryForm.amount) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('current_account_entries').insert({
      user_id: user.id, contact_id: id,
      entry_type: entryForm.entry_type,
      amount: parseFloat(entryForm.amount),
      description: entryForm.description || null,
      entry_date: entryForm.entry_date,
    })
    setShowEntryDialog(false)
    setEntryForm({ entry_type: 'debit', amount: '', description: '', entry_date: new Date().toISOString().slice(0, 10) })
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

  if (loading) return <div className="text-center py-20 text-muted-foreground">Yükleniyor...</div>
  if (!contact) return <div className="text-center py-20">Cari bulunamadı</div>

  const totalDebit = [...ledger].reduce((s, e) => e.entry_type === 'debit' ? s + Number(e.amount) : s, 0)
  const totalCredit = [...ledger].reduce((s, e) => e.entry_type === 'credit' ? s + Number(e.amount) : s, 0)
  const openCount = receivables.filter(r => r.status !== 'paid').length + payables.filter(p => p.status !== 'paid').length

  const setE = (k: string, v: string) => setEditForm(f => ({ ...f, [k]: v }))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/contacts">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Geri</Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{contact.name}</h1>
            <Badge variant={contact.is_active ? 'success' : 'outline'}>{contact.is_active ? 'Aktif' : 'Pasif'}</Badge>
            <Badge variant="outline">{typeLabels[contact.type]}</Badge>
          </div>
          {(contact.email || contact.phone) && (
            <p className="text-sm text-muted-foreground">{[contact.email, contact.phone].filter(Boolean).join(' • ')}</p>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Toplam Alacak</p>
            <p className="text-lg font-semibold text-green-600">
              {totalDebit.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Toplam Borç</p>
            <p className="text-lg font-semibold text-red-600">
              {totalCredit.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Net Bakiye</p>
            <p className={`text-lg font-semibold ${contact.current_balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {contact.current_balance.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
            </p>
            <p className="text-xs text-muted-foreground">{contact.current_balance >= 0 ? 'Alacaklı' : 'Borçlu'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Açık Kayıt</p>
            <p className="text-lg font-semibold">{openCount}</p>
            <p className="text-xs text-muted-foreground">alacak + borç</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="ledger">
        <TabsList>
          <TabsTrigger value="info">Genel Bilgiler</TabsTrigger>
          <TabsTrigger value="ledger">Cari Ekstre</TabsTrigger>
          <TabsTrigger value="receivables">Alacaklar ({receivables.length})</TabsTrigger>
          <TabsTrigger value="payables">Borçlar ({payables.length})</TabsTrigger>
          <TabsTrigger value="transactions">İşlemler ({transactions.length})</TabsTrigger>
          <TabsTrigger value="quotes">Teklifler ({quotes.length})</TabsTrigger>
          <TabsTrigger value="docs">Belgeler ({docs.length})</TabsTrigger>
          <TabsTrigger value="branches">Şubeler ({branches.length})</TabsTrigger>
          <TabsTrigger value="tasks">Görevler ({contactTasks.length})</TabsTrigger>
        </TabsList>

        {/* Genel Bilgiler */}
        <TabsContent value="info">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="text-sm">Cari Bilgileri</CardTitle>
              {editMode ? (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>İptal</Button>
                  <Button size="sm" onClick={handleSaveInfo}>Kaydet</Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>Düzenle</Button>
              )}
            </CardHeader>
            <CardContent>
              {editMode ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1.5">
                    <Label>Ad / Unvan *</Label>
                    <Input value={editForm.name} onChange={e => setE('name', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tür</Label>
                    <Select value={editForm.type} onValueChange={v => setE('type', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="customer">Müşteri</SelectItem>
                        <SelectItem value="supplier">Tedarikçi</SelectItem>
                        <SelectItem value="both">İkisi</SelectItem>
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
                  <div className="col-span-2 space-y-1.5"><Label>Notlar</Label><Textarea value={editForm.notes} onChange={e => setE('notes', e.target.value)} rows={2} /></div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-y-3 gap-x-8 text-sm">
                  {[
                    ['E-posta', contact.email],
                    ['Telefon', contact.phone],
                    ['Şehir', contact.city],
                    ['Vergi No', contact.tax_number],
                    ['Vergi Dairesi', contact.tax_office],
                    ['Kredi Limiti', contact.credit_limit ? contact.credit_limit.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' }) : null],
                    ['Adres', contact.address],
                    ['Notlar', contact.notes],
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

        {/* Cari Ekstre */}
        <TabsContent value="ledger">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="text-sm">Cari Hareketler</CardTitle>
              <Button size="sm" onClick={() => setShowEntryDialog(true)}>
                <Plus className="h-4 w-4 mr-1" />Hareket Ekle
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left">
                    <th className="px-4 py-2 text-muted-foreground">Tarih</th>
                    <th className="px-4 py-2 text-muted-foreground">Açıklama</th>
                    <th className="px-4 py-2 text-muted-foreground">Tür</th>
                    <th className="px-4 py-2 text-right text-muted-foreground">Borç</th>
                    <th className="px-4 py-2 text-right text-muted-foreground">Alacak</th>
                    <th className="px-4 py-2 text-right text-muted-foreground">Bakiye</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Hareket yok</td></tr>}
                  {ledger.map((e) => (
                    <tr key={e.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2.5">{formatDate(e.entry_date)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{e.description ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant={e.entry_type === 'debit' ? 'info' : 'warning'}>
                          {e.entry_type === 'debit' ? 'Borçlandırma' : 'Alacaklandırma'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right text-green-600 font-medium">
                        {e.entry_type === 'debit' ? e.amount.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' }) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-red-600 font-medium">
                        {e.entry_type === 'credit' ? e.amount.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' }) : '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${e.runningBalance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {e.runningBalance.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alacaklar */}
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
                  <tr className="border-b bg-gray-50 text-left">
                    <th className="px-4 py-2 text-muted-foreground">Açıklama</th>
                    <th className="px-4 py-2 text-muted-foreground">Vade</th>
                    <th className="px-4 py-2 text-right text-muted-foreground">Tutar</th>
                    <th className="px-4 py-2 text-right text-muted-foreground">Ödenen</th>
                    <th className="px-4 py-2 text-muted-foreground">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {receivables.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Alacak yok</td></tr>}
                  {receivables.map(r => (
                    <tr key={r.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2.5">{r.description ?? '—'}</td>
                      <td className="px-4 py-2.5">{r.due_date ? formatDate(r.due_date) : '—'}</td>
                      <td className="px-4 py-2.5 text-right"><AmountDisplay amount={r.amount} /></td>
                      <td className="px-4 py-2.5 text-right"><AmountDisplay amount={r.paid_amount} positive /></td>
                      <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Borçlar */}
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
                  <tr className="border-b bg-gray-50 text-left">
                    <th className="px-4 py-2 text-muted-foreground">Açıklama</th>
                    <th className="px-4 py-2 text-muted-foreground">Vade</th>
                    <th className="px-4 py-2 text-right text-muted-foreground">Tutar</th>
                    <th className="px-4 py-2 text-muted-foreground">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {payables.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Borç yok</td></tr>}
                  {payables.map(p => (
                    <tr key={p.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2.5">{p.description ?? '—'}</td>
                      <td className="px-4 py-2.5">{p.due_date ? formatDate(p.due_date) : '—'}</td>
                      <td className="px-4 py-2.5 text-right"><AmountDisplay amount={p.amount} negative /></td>
                      <td className="px-4 py-2.5"><StatusBadge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* İşlemler */}
        <TabsContent value="transactions">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="text-sm">Bu Cariye Bağlı İşlemler</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left">
                    <th className="px-4 py-2 text-muted-foreground">Tarih</th>
                    <th className="px-4 py-2 text-muted-foreground">Tür</th>
                    <th className="px-4 py-2 text-muted-foreground">Açıklama</th>
                    <th className="px-4 py-2 text-right text-muted-foreground">Tutar</th>
                    <th className="px-4 py-2 text-muted-foreground">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Bu cariye bağlı işlem yok</td></tr>
                  )}
                  {transactions.map(t => (
                    <tr key={t.id} className="border-b hover:bg-gray-50">
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
                      <td className="px-4 py-2.5"><StatusBadge status={t.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Teklifler */}
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
                  <tr className="border-b bg-gray-50 text-left">
                    <th className="px-4 py-2 text-muted-foreground">Teklif No</th>
                    <th className="px-4 py-2 text-muted-foreground">Başlık</th>
                    <th className="px-4 py-2 text-muted-foreground">Tarih</th>
                    <th className="px-4 py-2 text-right text-muted-foreground">Tutar</th>
                    <th className="px-4 py-2 text-muted-foreground">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Teklif yok</td></tr>}
                  {quotes.map(q => (
                    <tr key={q.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono text-xs">{q.quote_number}</td>
                      <td className="px-4 py-2.5">{q.title}</td>
                      <td className="px-4 py-2.5">{formatDate(q.issue_date)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {q.total ? q.total.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' }) : '—'}
                      </td>
                      <td className="px-4 py-2.5"><StatusBadge status={q.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Belgeler */}
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
                  <tr className="border-b bg-gray-50 text-left">
                    <th className="px-4 py-2 text-muted-foreground">Dosya</th>
                    <th className="px-4 py-2 text-muted-foreground">Boyut</th>
                    <th className="px-4 py-2 text-muted-foreground">Tarih</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {docs.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Belge yok</td></tr>}
                  {docs.map(d => (
                    <tr key={d.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {getFileIcon(d.file_type)}
                          <span className="font-medium">{d.file_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {d.file_size ? `${(d.file_size / 1024).toFixed(1)} KB` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{formatDate(d.uploaded_at)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleDownload(d)}>
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => handleDeleteDoc(d)}>×</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Şubeler */}
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
                  <tr className="border-b bg-gray-50 text-left">
                    <th className="px-4 py-2 text-muted-foreground">Şube Adı</th>
                    <th className="px-4 py-2 text-muted-foreground">Telefon</th>
                    <th className="px-4 py-2 text-muted-foreground">Şehir</th>
                    <th className="px-4 py-2 text-right text-muted-foreground">Bakiye</th>
                    <th className="px-4 py-2 text-muted-foreground">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Şube yok</td></tr>
                  )}
                  {branches.map(b => (
                    <tr key={b.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <Link to={`/contacts/${b.id}`} className="flex items-center gap-2 font-medium text-blue-600 hover:underline">
                          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                          {b.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{b.phone ?? '—'}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{b.city ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right">
                        <AmountDisplay
                          amount={Math.abs(b.current_balance)}
                          positive={b.current_balance > 0}
                          negative={b.current_balance < 0}
                        />
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

        {/* Görevler (bu aya ait) */}
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
              {contactTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Bu ay için görev atanmamış</p>
              ) : (
                <div className="space-y-2">
                  {contactTasks.map((task: any) => {
                    const STATUS_LABEL: Record<string, string> = { todo: 'Yapılacak', in_progress: 'Devam Ediyor', done: 'Tamamlandı' }
                    const STATUS_COLOR: Record<string, string> = { todo: 'bg-gray-100 text-gray-600', in_progress: 'bg-blue-100 text-blue-700', done: 'bg-emerald-100 text-emerald-700' }
                    const today = new Date().toISOString().slice(0, 10)
                    const isOverdue = task.due_date && task.due_date < today && task.status !== 'done'
                    return (
                      <div key={task.id} className={`flex items-start gap-3 p-3 rounded-xl border ${task.status === 'done' ? 'bg-gray-50/50 opacity-70' : 'bg-white'}`}>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</p>
                          {task.description && <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>}
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[task.status]}`}>{STATUS_LABEL[task.status]}</span>
                            {task.personnel_name && <span className="text-xs text-blue-600">→ {task.personnel_name}</span>}
                            {task.due_date && (
                              <span className={`text-xs ${isOverdue ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
                                {isOverdue ? '⚠ Gecikti · ' : ''}{formatDate(task.due_date)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Manual Entry Dialog */}
      <Dialog open={showEntryDialog} onOpenChange={setShowEntryDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cari Hareket Ekle</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Tür</Label>
              <Select value={entryForm.entry_type} onValueChange={v => setEntryForm(f => ({ ...f, entry_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="debit">Borçlandırma (Müşteri borçlandı)</SelectItem>
                  <SelectItem value="credit">Alacaklandırma (Müşteri ödedi)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tutar (₺) *</Label>
              <Input type="number" value={entryForm.amount} onChange={e => setEntryForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tarih</Label>
              <Input type="date" value={entryForm.entry_date} onChange={e => setEntryForm(f => ({ ...f, entry_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Açıklama</Label>
              <Input value={entryForm.description} onChange={e => setEntryForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEntryDialog(false)}>İptal</Button>
            <Button onClick={handleAddEntry} disabled={!entryForm.amount}>Ekle</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showBranchForm && (
        <ContactForm
          contact={null}
          parentId={id}
          onSave={() => { setShowBranchForm(false); fetchAll() }}
          onClose={() => setShowBranchForm(false)}
        />
      )}
    </div>
  )
}
