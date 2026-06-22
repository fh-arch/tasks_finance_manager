import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import type { Reconciliation, ReconciliationLog, ReconciliationStatus, Quote, QuoteItem } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import { ArrowLeft, Loader2, Clock, ChevronDown, ChevronRight, FileText, Paperclip, Download, Upload, Trash2 } from 'lucide-react'
import { DocAttachButton } from '@/components/shared/DocAttachButton'
import { exportReconciliationPdf } from '@/lib/pdfExport'
import * as XLSX from 'xlsx'

type RecWithContact = Reconciliation & { contact?: { name: string } | null }
type QuoteWithItems = Quote & { quote_items: QuoteItem[] }
type ImportRow = { id: string; row_date: string | null; description: string | null; amount: number; entry_type: 'debit' | 'credit'; source: string }
type ImportPreviewRow = { row_date: string; description: string; debit: number; credit: number }

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

const NOTIFICATION_LABELS: Record<string, string> = {
  pdf: 'PDF',
  excel: 'Excel',
  email: 'E-posta',
  phone: 'Telefon',
  manual: 'Manuel',
}

function formatTRY(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return '—'
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount)
}

export function ReconciliationDetail() {
  const profile = useAppStore((s) => s.profile)
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [rec, setRec] = useState<RecWithContact | null>(null)
  const [logs, setLogs] = useState<ReconciliationLog[]>([])
  const [quotes, setQuotes] = useState<QuoteWithItems[]>([])
  const [expandedQuotes, setExpandedQuotes] = useState<Set<string>>(new Set())
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Notes editing
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  // Status transition dialog
  const [showNoteDialog, setShowNoteDialog] = useState(false)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [actionNote, setActionNote] = useState('')

  const fetchAll = async () => {
    if (!id) return
    const [r, l, ir] = await Promise.all([
      supabase.from('reconciliations').select('*, contact:contacts(name)').eq('id', id).single(),
      supabase.from('reconciliation_logs').select('*').eq('reconciliation_id', id).order('created_at', { ascending: false }),
      supabase.from('reconciliation_import_rows').select('*').eq('reconciliation_id', id).order('row_date'),
    ])
    if (r.data) {
      const recData = r.data as RecWithContact
      setRec(recData)
      setNotes(recData.notes ?? '')

      const { data: qData } = await supabase
        .from('quotes')
        .select('*, quote_items(*)')
        .eq('contact_id', recData.contact_id)
        .gte('issue_date', recData.period_start)
        .lte('issue_date', recData.period_end)
        .order('issue_date')
      setQuotes((qData ?? []) as QuoteWithItems[])
    }
    setLogs((l.data ?? []) as ReconciliationLog[])
    setImportRows((ir.data ?? []) as ImportRow[])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [id])

  const doStatusTransition = async (newStatus: ReconciliationStatus, note?: string) => {
    if (!rec || !id) return
    setActionLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await supabase.from('reconciliation_logs').insert({
        reconciliation_id: id,
        user_id: user.id,
        old_status: rec.status,
        new_status: newStatus,
        note: note || null,
      })
      await supabase.from('reconciliations').update({ status: newStatus }).eq('id', id)
      await fetchAll()
    } finally {
      setActionLoading(false)
    }
  }

  const triggerAction = (action: string) => {
    setPendingAction(action)
    setActionNote('')
    setShowNoteDialog(true)
  }

  const executeAction = async () => {
    setShowNoteDialog(false)
    if (!rec || !id) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setActionLoading(true)
    try {
      const today = new Date().toISOString().slice(0, 10)

      if (pendingAction === 'markSent') {
        await doStatusTransition('sent', actionNote)

      } else if (pendingAction === 'markDisputed') {
        await doStatusTransition('disputed', actionNote)

      } else if (pendingAction === 'markAgreed') {
        await doStatusTransition('agreed', actionNote)

      } else if (pendingAction === 'convertReceivable') {
        const diff = Math.abs(rec.difference ?? 0)
        const { data: receivable } = await supabase.from('receivables').insert({
          user_id: user.id,
          contact_id: rec.contact_id,
          amount: diff,
          description: `Mutabakat farkı: ${rec.reconciliation_number}`,
          source_type: 'reconciliation',
          source_id: id,
          issue_date: today,
          status: 'pending',
          currency: 'TRY',
        }).select().single()

        await supabase.from('current_account_entries').insert({
          user_id: user.id,
          contact_id: rec.contact_id,
          entry_type: 'debit',
          amount: diff,
          description: `Mutabakat: ${rec.reconciliation_number}`,
          entry_date: today,
          related_type: 'reconciliation',
          related_id: id,
        })

        await supabase.from('reconciliations').update({
          status: 'converted',
          converted_to: 'receivable',
          converted_id: receivable?.id ?? null,
        }).eq('id', id)

        await supabase.from('reconciliation_logs').insert({
          reconciliation_id: id,
          user_id: user.id,
          old_status: 'agreed',
          new_status: 'converted',
          note: actionNote || 'Alacağa dönüştürüldü',
        })

        await fetchAll()

      } else if (pendingAction === 'convertPayable') {
        const diff = Math.abs(rec.difference ?? 0)
        const { data: payable } = await supabase.from('payables').insert({
          user_id: user.id,
          contact_id: rec.contact_id,
          amount: diff,
          description: `Mutabakat farkı: ${rec.reconciliation_number}`,
          source_type: 'reconciliation',
          source_id: id,
          issue_date: today,
          status: 'pending',
          currency: 'TRY',
        }).select().single()

        await supabase.from('current_account_entries').insert({
          user_id: user.id,
          contact_id: rec.contact_id,
          entry_type: 'credit',
          amount: diff,
          description: `Mutabakat: ${rec.reconciliation_number}`,
          entry_date: today,
          related_type: 'reconciliation',
          related_id: id,
        })

        await supabase.from('reconciliations').update({
          status: 'converted',
          converted_to: 'payable',
          converted_id: payable?.id ?? null,
        }).eq('id', id)

        await supabase.from('reconciliation_logs').insert({
          reconciliation_id: id,
          user_id: user.id,
          old_status: 'agreed',
          new_status: 'converted',
          note: actionNote || 'Borca dönüştürüldü',
        })

        await fetchAll()

      } else if (pendingAction === 'close') {
        await doStatusTransition('closed', actionNote)
      }
    } finally {
      setActionLoading(false)
      setPendingAction(null)
    }
  }

  const handleDelete = async () => {
    if (!rec || !id) return
    if (!window.confirm(`"${rec.reconciliation_number}" numaralı mutabakat silinecek. Emin misiniz?`)) return
    await supabase.from('reconciliations').delete().eq('id', id)
    navigate('/reconciliation')
  }

  const handleSaveNotes = async () => {
    if (!id) return
    setSavingNotes(true)
    await supabase.from('reconciliations').update({ notes: notes || null }).eq('id', id)
    setSavingNotes(false)
  }

  const handleExportPdf = () => {
    if (!rec) return
    setExporting(true)
    const contactName = (rec.contact as any)?.name ?? '—'
    exportReconciliationPdf(rec, quotes, contactName, importRows, profile?.company_name ?? '', profile?.logo_url ?? null)
    setExporting(false)
  }

  const handleExcelFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const data = evt.target?.result
      const wb = XLSX.read(data, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      const preview: ImportPreviewRow[] = []
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (!row || row.every((c: any) => c === '' || c == null)) continue

        let rawDate = row[0]
        let dateStr = ''
        if (rawDate instanceof Date) {
          dateStr = rawDate.toISOString().slice(0, 10)
        } else if (typeof rawDate === 'string' && rawDate.trim()) {
          const parts = rawDate.trim().split(/[./\-]/)
          if (parts.length === 3) {
            const [a, b, c] = parts
            if (a.length === 4) dateStr = `${a}-${b.padStart(2,'0')}-${c.padStart(2,'0')}`
            else dateStr = `${c}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`
          }
        } else if (typeof rawDate === 'number') {
          const d = XLSX.SSF.parse_date_code(rawDate)
          dateStr = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
        }

        const description = String(row[1] ?? '').trim()
        const debit = parseFloat(String(row[2]).replace(',', '.')) || 0
        const credit = parseFloat(String(row[3]).replace(',', '.')) || 0
        if (!debit && !credit) continue

        preview.push({ row_date: dateStr, description, debit, credit })
      }
      setImportPreview(preview)
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const handleConfirmImport = async () => {
    if (!importPreview || !id) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const toInsert = importPreview.map(r => ({
      reconciliation_id: id,
      user_id: user.id,
      row_date: r.row_date || null,
      description: r.description || null,
      amount: r.debit > 0 ? r.debit : r.credit,
      entry_type: r.debit > 0 ? 'debit' : 'credit',
      source: 'excel',
    }))
    await supabase.from('reconciliation_import_rows').insert(toInsert)
    setImportPreview(null)
    fetchAll()
  }

  const handleDeleteImportRow = async (rowId: string) => {
    await supabase.from('reconciliation_import_rows').delete().eq('id', rowId)
    setImportRows(prev => prev.filter(r => r.id !== rowId))
  }

  const handleClearImportRows = async () => {
    if (!id || !window.confirm('Tüm içe aktarılan satırlar silinecek. Emin misiniz?')) return
    await supabase.from('reconciliation_import_rows').delete().eq('reconciliation_id', id)
    setImportRows([])
  }

  const exportImportTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Tarih', 'Açıklama', 'Borç', 'Alacak'],
      ['2026-01-15', 'Örnek Fatura', 5000, ''],
      ['2026-01-20', 'Örnek Ödeme', '', 3000],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Liste')
    XLSX.writeFile(wb, 'mutabakat-sablonu.xlsx')
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Yükleniyor...</p>
      </div>
    </div>
  )

  if (!rec) return (
    <div className="text-center py-20">
      <p className="text-muted-foreground">Mutabakat bulunamadı.</p>
      <Link to="/reconciliation"><Button variant="outline" className="mt-4">Listeye Dön</Button></Link>
    </div>
  )

  const contactName = (rec.contact as any)?.name ?? rec.contact_id
  const effectiveOurBalance = rec.our_final_balance ?? rec.our_calculated_balance
  const diff = rec.difference

  const actionDialogTitles: Record<string, string> = {
    markSent: 'Gönderildi Olarak İşaretle',
    markDisputed: 'İtiraz Bildir',
    markAgreed: 'Anlaşma Onayla',
    convertReceivable: 'Alacağa Dönüştür',
    convertPayable: 'Borca Dönüştür',
    close: 'Mutabakatı Kapat',
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <Link to="/reconciliation">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Geri</Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">{rec.title || rec.reconciliation_number}</h1>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_CLASSES[rec.status]}`}>
              {STATUS_LABELS[rec.status]}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            <span className="font-mono">{rec.reconciliation_number}</span>
            {rec.title && <span> · {rec.title}</span>}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportPdf}
          disabled={exporting}
          className="gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
        >
          <Download className="h-4 w-4" />
          PDF İndir
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDelete}
          className="gap-1.5 text-red-500 border-red-200 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
          Sil
        </Button>
      </div>

      {/* Top Info Card */}
      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Cari</p>
              <p className="font-semibold text-gray-900">{contactName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Numara</p>
              <p className="font-mono text-sm font-semibold text-indigo-700">{rec.reconciliation_number}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Dönem Başı</p>
              <p className="font-medium">{formatDate(rec.period_start)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Dönem Sonu</p>
              <p className="font-medium">{formatDate(rec.period_end)}</p>
            </div>
          </div>

          {/* Balance comparison */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-center">
              <p className="text-xs text-muted-foreground mb-2">Bizim Bakiyemiz</p>
              <p className={`text-xl font-bold ${
                (effectiveOurBalance ?? 0) > 0 ? 'text-green-700' :
                (effectiveOurBalance ?? 0) < 0 ? 'text-red-700' : 'text-gray-700'
              }`}>{formatTRY(effectiveOurBalance)}</p>
              {rec.our_final_balance !== null && rec.our_final_balance !== undefined && (
                <p className="text-xs text-muted-foreground mt-1">Hesaplanan: {formatTRY(rec.our_calculated_balance)}</p>
              )}
            </div>

            <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-center">
              <p className="text-xs text-muted-foreground mb-2">Karşı Taraf</p>
              {rec.their_balance !== null && rec.their_balance !== undefined ? (
                <p className="text-xl font-bold text-gray-700">{formatTRY(rec.their_balance)}</p>
              ) : (
                <p className="text-xl font-bold text-gray-300">—</p>
              )}
              {rec.notification_method && (
                <p className="text-xs text-muted-foreground mt-1">
                  {NOTIFICATION_LABELS[rec.notification_method] ?? rec.notification_method}
                  {rec.notification_reference && ` · ${rec.notification_reference}`}
                </p>
              )}
            </div>

            <div className={`rounded-xl border p-4 text-center ${
              diff === null ? 'bg-gray-50 border-gray-100' :
              diff > 0 ? 'bg-red-50 border-red-100' :
              diff < 0 ? 'bg-blue-50 border-blue-100' :
              'bg-green-50 border-green-100'
            }`}>
              <p className="text-xs text-muted-foreground mb-2">Fark</p>
              {diff === null ? (
                <p className="text-xl font-bold text-gray-300">—</p>
              ) : diff === 0 ? (
                <p className="text-xl font-bold text-green-700">Fark Yok</p>
              ) : (
                <>
                  <p className={`text-xl font-bold ${diff > 0 ? 'text-red-700' : 'text-blue-700'}`}>{formatTRY(diff)}</p>
                  <p className={`text-xs font-medium mt-1 ${diff > 0 ? 'text-red-600' : 'text-blue-600'}`}>
                    {diff > 0 ? 'Alacak doğacak' : 'Borç doğacak'}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          {!actionLoading && (
            <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-border/50">
              {rec.status === 'draft' && (
                <Button onClick={() => triggerAction('markSent')}>
                  Gönderildi Olarak İşaretle
                </Button>
              )}
              {rec.status === 'sent' && (
                <>
                  <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => triggerAction('markDisputed')}>
                    İtiraz Var
                  </Button>
                  <Button onClick={() => triggerAction('markAgreed')}>
                    Anlaşıldı
                  </Button>
                </>
              )}
              {rec.status === 'disputed' && (
                <Button onClick={() => triggerAction('markAgreed')}>
                  Anlaşıldı
                </Button>
              )}
              {rec.status === 'agreed' && diff !== null && diff > 0 && (
                <Button onClick={() => triggerAction('convertReceivable')} className="bg-green-600 hover:bg-green-700">
                  Alacağa Dönüştür
                </Button>
              )}
              {rec.status === 'agreed' && diff !== null && diff < 0 && (
                <Button onClick={() => triggerAction('convertPayable')} className="bg-red-600 hover:bg-red-700">
                  Borca Dönüştür
                </Button>
              )}
              {rec.status === 'agreed' && diff === 0 && (
                <Button onClick={() => triggerAction('close')} variant="outline">
                  Kapat
                </Button>
              )}
            </div>
          )}

          {actionLoading && (
            <div className="flex items-center gap-2 mt-5 pt-4 border-t border-border/50 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> İşlem yapılıyor...
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Özet</TabsTrigger>
          <TabsTrigger value="invoices">
            Faturalar {quotes.length > 0 && <span className="ml-1.5 bg-indigo-100 text-indigo-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">{quotes.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="docs" className="gap-1.5">
            <Paperclip className="h-3.5 w-3.5" /> Belgeler
          </TabsTrigger>
          <TabsTrigger value="import" className="gap-1.5">
            <Upload className="h-3.5 w-3.5" />İçe Aktarma {importRows.length > 0 && `(${importRows.length})`}
          </TabsTrigger>
          <TabsTrigger value="history">Geçmiş ({logs.length})</TabsTrigger>
        </TabsList>

        {/* Summary Tab */}
        <TabsContent value="summary">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Detaylar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Bildirim Yöntemi</p>
                  <p className="font-medium">
                    {rec.notification_method ? NOTIFICATION_LABELS[rec.notification_method] ?? rec.notification_method : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Referans / Belge</p>
                  <p className="font-medium">{rec.notification_reference || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Oluşturulma</p>
                  <p className="font-medium">{formatDate(rec.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Son Güncelleme</p>
                  <p className="font-medium">{formatDate(rec.updated_at)}</p>
                </div>
                {rec.converted_to && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Dönüştürüldü</p>
                    <p className="font-medium capitalize">{rec.converted_to === 'receivable' ? 'Alacak' : 'Borç'}</p>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Notlar</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Notlar ekleyin..."
                />
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={handleSaveNotes} disabled={savingNotes}>
                    {savingNotes ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Kaydediliyor</> : 'Notları Kaydet'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Faturalar Tab */}
        <TabsContent value="invoices">
          <Card>
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-indigo-600" />
                Bu Döneme Ait Faturalar
              </CardTitle>
              <span className="text-xs text-muted-foreground">{formatDate(rec.period_start)} – {formatDate(rec.period_end)}</span>
            </CardHeader>
            <CardContent className="p-0">
              {quotes.length === 0 ? (
                <div className="py-12 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Bu dönemde bu cariye ait fatura bulunamadı.</p>
                  <p className="text-xs text-muted-foreground mt-1">Teklifler sayfasından fatura ekleyebilirsiniz.</p>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {quotes.map(q => {
                    const isExpanded = expandedQuotes.has(q.id)
                    return (
                      <div key={q.id}>
                        {/* Quote row */}
                        <div
                          className="flex items-center gap-3 px-5 py-3 hover:bg-primary/[0.02] cursor-pointer transition-colors"
                          onClick={() => setExpandedQuotes(prev => {
                            const next = new Set(prev)
                            isExpanded ? next.delete(q.id) : next.add(q.id)
                            return next
                          })}
                        >
                          <div className="text-muted-foreground">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-indigo-700 font-semibold">{q.quote_number}</span>
                              <span className="text-sm font-medium truncate">{q.title}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatDate(q.issue_date)}
                              {q.valid_until && ` · Geçerlilik: ${formatDate(q.valid_until)}`}
                              {` · ${q.quote_items.length} kalem`}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold text-gray-900">
                              {q.total ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(q.total) : '—'}
                            </p>
                            <Badge variant={
                              q.status === 'accepted' ? 'success' :
                              q.status === 'sent' ? 'info' :
                              q.status === 'rejected' ? 'destructive' :
                              q.status === 'expired' ? 'warning' : 'outline'
                            } className="text-xs mt-0.5">
                              {{ draft: 'Taslak', sent: 'Gönderildi', accepted: 'Onaylandı', rejected: 'Reddedildi', expired: 'Süresi Doldu' }[q.status]}
                            </Badge>
                          </div>
                        </div>

                        {/* Quote items */}
                        {isExpanded && q.quote_items.length > 0 && (
                          <div className="bg-gray-50/70 border-t border-border/30">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-border/30">
                                  <th className="px-8 py-2 text-left text-muted-foreground font-semibold">Ürün / Hizmet</th>
                                  <th className="px-4 py-2 text-right text-muted-foreground font-semibold">Miktar</th>
                                  <th className="px-4 py-2 text-right text-muted-foreground font-semibold">Birim Fiyat</th>
                                  <th className="px-4 py-2 text-right text-muted-foreground font-semibold">İndirim</th>
                                  <th className="px-4 py-2 text-right text-muted-foreground font-semibold">Toplam</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...q.quote_items].sort((a, b) => a.sort_order - b.sort_order).map(item => (
                                  <tr key={item.id} className="border-b border-border/20 last:border-0">
                                    <td className="px-8 py-2 font-medium">{item.description}</td>
                                    <td className="px-4 py-2 text-right text-muted-foreground">{item.quantity}</td>
                                    <td className="px-4 py-2 text-right text-muted-foreground">
                                      {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(item.unit_price)}
                                    </td>
                                    <td className="px-4 py-2 text-right text-muted-foreground">
                                      {item.discount_percent > 0 ? `%${item.discount_percent}` : '—'}
                                    </td>
                                    <td className="px-4 py-2 text-right font-semibold text-gray-800">
                                      {item.line_total != null
                                        ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(item.line_total)
                                        : '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              {q.tax_rate > 0 && (
                                <tfoot>
                                  <tr className="border-t border-border/40">
                                    <td colSpan={4} className="px-8 py-2 text-right text-muted-foreground">Ara Toplam</td>
                                    <td className="px-4 py-2 text-right font-medium">{q.subtotal != null ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(q.subtotal) : '—'}</td>
                                  </tr>
                                  <tr>
                                    <td colSpan={4} className="px-8 py-2 text-right text-muted-foreground">KDV (%{q.tax_rate})</td>
                                    <td className="px-4 py-2 text-right font-medium">{q.tax_amount != null ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(q.tax_amount) : '—'}</td>
                                  </tr>
                                  <tr className="border-t border-border/40 bg-white/60">
                                    <td colSpan={4} className="px-8 py-2 text-right font-semibold">Genel Toplam</td>
                                    <td className="px-4 py-2 text-right font-bold text-indigo-700">{q.total != null ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(q.total) : '—'}</td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                        )}
                        {isExpanded && q.quote_items.length === 0 && (
                          <div className="bg-gray-50/70 px-8 py-3 text-xs text-muted-foreground border-t border-border/30">
                            Bu teklifin kalemi bulunmuyor.
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Belgeler Tab */}
        <TabsContent value="docs">
          <Card>
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-indigo-600" />
                Mutabakat Belgeleri
              </CardTitle>
              <DocAttachButton relatedType="reconciliation" relatedId={id!} label="Belge Ekle" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Fatura, dekont, imzalı mutabakat formu veya ilgili belgeleri buraya yükleyin.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Import Tab */}
        <TabsContent value="import">
          <Card>
            <CardHeader className="py-4 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Karşı Taraf Ekstresi (İçe Aktarma)</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={exportImportTemplate} className="gap-1.5 text-xs">
                  <Download className="h-3.5 w-3.5" /> Şablon İndir
                </Button>
                <label>
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelFile} />
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
                    <span><Upload className="h-3.5 w-3.5" /> Excel Yükle</span>
                  </Button>
                </label>
                {importRows.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={handleClearImportRows} className="gap-1.5 text-xs text-red-500 hover:text-red-700">
                    <Trash2 className="h-3.5 w-3.5" /> Temizle
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-4">
                Karşı tarafın gönderdiği hesap özetini Excel olarak yükleyin. Beklenen sütunlar: <strong>Tarih | Açıklama | Borç | Alacak</strong>
              </p>
              {importRows.length === 0 ? (
                <div className="py-10 text-center border-2 border-dashed border-border rounded-xl">
                  <Upload className="h-10 w-10 text-muted-foreground/25 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Henüz içe aktarılan satır yok</p>
                  <p className="text-xs text-muted-foreground mt-1">Önce şablonu indirin, doldurup tekrar yükleyin</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>Toplam Borç: <strong className="text-red-600">{new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(importRows.filter(r=>r.entry_type==='debit').reduce((s,r)=>s+Number(r.amount),0))}</strong></span>
                      <span>Toplam Alacak: <strong className="text-emerald-600">{new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(importRows.filter(r=>r.entry_type==='credit').reduce((s,r)=>s+Number(r.amount),0))}</strong></span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          {['Tarih','Açıklama','Borç','Alacak',''].map(h=>(
                            <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.map(row=>(
                          <tr key={row.id} className="border-b border-border/40 hover:bg-gray-50/50">
                            <td className="px-3 py-2 text-muted-foreground text-xs whitespace-nowrap">{row.row_date ? formatDate(row.row_date) : '—'}</td>
                            <td className="px-3 py-2">{row.description ?? '—'}</td>
                            <td className="px-3 py-2 text-red-600 font-medium">
                              {row.entry_type==='debit' ? new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(row.amount) : '—'}
                            </td>
                            <td className="px-3 py-2 text-emerald-600 font-medium">
                              {row.entry_type==='credit' ? new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(row.amount) : '—'}
                            </td>
                            <td className="px-3 py-2">
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-600" onClick={()=>handleDeleteImportRow(row.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Import Preview Dialog */}
        {importPreview && (
          <Dialog open onOpenChange={()=>setImportPreview(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>İçe Aktarma Önizleme — {importPreview.length} satır</DialogTitle>
              </DialogHeader>
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {['Tarih','Açıklama','Borç','Alacak'].map(h=>(
                        <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.map((r,i)=>(
                      <tr key={i} className="border-b border-border/40">
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.row_date}</td>
                        <td className="px-3 py-1.5">{r.description}</td>
                        <td className="px-3 py-1.5 text-red-600">{r.debit > 0 ? new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(r.debit) : '—'}</td>
                        <td className="px-3 py-1.5 text-emerald-600">{r.credit > 0 ? new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(r.credit) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={()=>setImportPreview(null)}>İptal</Button>
                <Button onClick={handleConfirmImport} className="gap-1.5">
                  <Upload className="h-4 w-4" /> {importPreview.length} Satırı Aktar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Durum Geçmişi</CardTitle>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <div className="py-8 text-center">
                  <Clock className="h-8 w-8 text-muted-foreground/25 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Henüz geçmiş kaydı yok.</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-3.5 top-2 bottom-2 w-px bg-border" />
                  <div className="space-y-4">
                    {logs.map((log, idx) => (
                      <div key={log.id} className="flex gap-4 relative">
                        {/* Dot */}
                        <div className={`relative z-10 w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          idx === 0 ? 'bg-primary border-primary' : 'bg-white border-border'
                        }`}>
                          <div className={`w-2 h-2 rounded-full ${idx === 0 ? 'bg-white' : 'bg-gray-300'}`} />
                        </div>
                        <div className="pb-2 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {log.old_status && (
                              <>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASSES[log.old_status as ReconciliationStatus] ?? 'bg-gray-100 text-gray-700'}`}>
                                  {STATUS_LABELS[log.old_status as ReconciliationStatus] ?? log.old_status}
                                </span>
                                <span className="text-muted-foreground text-xs">→</span>
                              </>
                            )}
                            {log.new_status && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASSES[log.new_status as ReconciliationStatus] ?? 'bg-gray-100 text-gray-700'}`}>
                                {STATUS_LABELS[log.new_status as ReconciliationStatus] ?? log.new_status}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground ml-auto">
                              {formatDate(log.created_at)}
                            </span>
                          </div>
                          {log.note && (
                            <p className="text-sm text-gray-600 mt-1">{log.note}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Note dialog for status transitions */}
      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{pendingAction ? actionDialogTitles[pendingAction] : 'İşlem'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Not <span className="text-muted-foreground text-xs">(isteğe bağlı)</span></Label>
              <Textarea
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                rows={3}
                placeholder="Bu durum değişikliği için not ekleyin..."
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNoteDialog(false)}>İptal</Button>
            <Button onClick={executeAction}>Onayla</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
