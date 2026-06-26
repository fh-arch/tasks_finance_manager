import { useState, useRef, useEffect } from 'react'
import { supabase, SUPABASE_URL } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { requestDriveToken, uploadToDrive, getOrCreateSubfolder, getSubfolderName, buildFileName } from '@/lib/googleDrive'
import {
  FileText, Receipt, HandCoins, FileSignature, Scale, Users, FolderOpen,
  Upload, X, CheckCircle2, Loader2, ChevronRight, AlertCircle, Brain,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

type DocCat = { key: string; label: string; sublabel: string; icon: React.ElementType; color: string; bg: string; relatedType: string; entityType: 'contact' | 'personnel' | 'none' }

const CATS: DocCat[] = [
  { key: 'transaction', label: 'Fatura', sublabel: 'Alacak / Borç faturası', icon: Receipt, color: '#00cfc3', bg: 'rgba(0,207,195,0.08)', relatedType: 'transaction', entityType: 'contact' },
  { key: 'quote', label: 'Teklif', sublabel: 'Müşteri teklifi', icon: FileText, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', relatedType: 'quote', entityType: 'contact' },
  { key: 'personnel_payment', label: 'Dekont', sublabel: 'Personel ödemesi', icon: HandCoins, color: '#f05a28', bg: 'rgba(240,90,40,0.08)', relatedType: 'personnel_payment', entityType: 'personnel' },
  { key: 'personnel_hire', label: 'Sözleşme', sublabel: 'Personel sözleşmesi', icon: FileSignature, color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)', relatedType: 'personnel', entityType: 'personnel' },
  { key: 'reconciliation', label: 'Mutabakat', sublabel: 'Cari mutabakat', icon: Scale, color: '#6366f1', bg: 'rgba(99,102,241,0.08)', relatedType: 'reconciliation', entityType: 'contact' },
  { key: 'contact', label: 'Cari Belge', sublabel: 'Cari hesap belgesi', icon: Users, color: '#10b981', bg: 'rgba(16,185,129,0.08)', relatedType: 'contact', entityType: 'contact' },
]

type Contact = { id: string; name: string }
type Personnel = { id: string; name: string }

const emptyForm = () => ({
  entityId: '',
  // fatura
  txType: 'receivable',
  amount: '',
  kdvRate: '20',
  invoiceDate: new Date().toISOString().slice(0, 10),
  dueDate: '',
  invoiceNo: '',
  payStatus: 'open',
  payDate: '',
  payAmount: '',
  // teklif
  quoteDate: new Date().toISOString().slice(0, 10),
  validUntil: '',
  quoteAmount: '',
  // dekont
  paymentDate: new Date().toISOString().slice(0, 10),
  dekontAmount: '',
  // sözleşme
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  // mutabakat
  period: new Date().toISOString().slice(0, 7),
  openingBalance: '',
  closingBalance: '',
  isConfirmed: false,
  // genel
  description: '',
  docDate: new Date().toISOString().slice(0, 10),
})

export function DocumentHub() {
  const profile = useAppStore(s => s.profile)
  const [selected, setSelected] = useState<DocCat | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [personnel, setPersonnel] = useState<Personnel[]>([])
  const [form, setForm] = useState(emptyForm())
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const driveFolderId = (profile as any)?.drive_folder_id

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('contacts').select('id,name').eq('user_id', user.id).order('name').then(({ data }) => setContacts(data ?? []))
      supabase.from('personnel').select('id,name').eq('user_id', user.id).eq('is_active', true).order('name').then(({ data }) => setPersonnel(data ?? []))
    })
  }, [])

  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  const reset = () => {
    setFile(null); setDone(null); setError(null); setForm(emptyForm())
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleAiExtract = async () => {
    if (!file || !selected) return
    setExtracting(true); setError(null)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/extract-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ fileBase64: base64, mimeType: file.type, docType: selected.relatedType }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || 'Çözümleme başarısız')
      const d = json.data
      if (d.parse_error) throw new Error('Belge okunamadı')

      // Okunan verileri forma yansıt
      setForm(f => ({
        ...f,
        ...(d.invoice_number && { invoiceNo: d.invoice_number }),
        ...(d.invoice_date && { invoiceDate: d.invoice_date }),
        ...(d.due_date && { dueDate: d.due_date }),
        ...(d.subtotal != null && { amount: String(d.subtotal) }),
        ...(d.kdv_rate != null && { kdvRate: String(d.kdv_rate) }),
        ...(d.type && { txType: d.type }),
        ...(d.description && { description: d.description }),
        // teklif
        ...(d.quote_date && { quoteDate: d.quote_date }),
        ...(d.valid_until && { validUntil: d.valid_until }),
        ...(d.total != null && !d.invoice_date && { quoteAmount: String(d.total) }),
        // dekont
        ...(d.payment_date && { paymentDate: d.payment_date }),
        ...(d.amount != null && selected.key === 'personnel_payment' && { dekontAmount: String(d.amount) }),
        // mutabakat
        ...(d.period && { period: d.period }),
        ...(d.opening_balance != null && { openingBalance: String(d.opening_balance) }),
        ...(d.closing_balance != null && { closingBalance: String(d.closing_balance) }),
        ...(d.is_confirmed != null && { isConfirmed: Boolean(d.is_confirmed) }),
        // sözleşme
        ...(d.start_date && { startDate: d.start_date }),
        ...(d.end_date && { endDate: d.end_date }),
        // cari belge
        ...(d.doc_date && { docDate: d.doc_date }),
      }))
    } catch (err: any) {
      setError(`AI: ${err.message}`)
    }
    setExtracting(false)
  }

  const entityList = selected?.entityType === 'contact' ? contacts : personnel
  const entityLabel = selected?.entityType === 'contact' ? 'Cari Seç' : 'Personel Seç'

  // KDV hesap
  const net = parseFloat(form.amount) || 0
  const kdv = parseFloat(form.kdvRate) || 0
  const total = net + net * kdv / 100

  const handleSubmit = async () => {
    if (!file) { setError('Dosya seçilmedi'); return }
    if (!selected) return
    // Fatura için zorunlu alanlar
    if (selected.key === 'transaction') {
      if (!form.entityId) { setError('Fatura için cari seçilmesi zorunludur'); return }
      if (!form.amount) { setError('Fatura tutarı girilmesi zorunludur'); return }
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setUploading(true); setError(null); setDone(null)

    try {
      const { count } = await supabase.from('documents').select('*', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('related_type', selected.relatedType)
      const seqNum = (count ?? 0) + 1
      const entityName = entityList.find(e => e.id === form.entityId)?.name ?? form.description ?? 'BELGE'
      const autoName = buildFileName(selected.relatedType, entityName, seqNum, file.name)
      const renamedFile = new (window.File as any)([file], autoName, { type: file.type }) as File

      let filePath = ''; let driveFileId: string | null = null; let driveFileUrl: string | null = null

      if (driveFolderId) {
        const token = await requestDriveToken()
        const subFolderId = await getOrCreateSubfolder(driveFolderId, getSubfolderName(selected.relatedType), token)
        const result = await uploadToDrive(renamedFile, subFolderId, token)
        driveFileId = result.fileId; driveFileUrl = result.webViewLink; filePath = `drive:${result.fileId}`
      } else {
        filePath = `${user.id}/${selected.relatedType}/${Date.now()}_${autoName}`
        const { error: upErr } = await supabase.storage.from('finans-bucket').upload(filePath, renamedFile)
        if (upErr) throw new Error(upErr.message)
      }

      await supabase.from('documents').insert({
        user_id: user.id, related_type: selected.relatedType,
        related_id: form.entityId || user.id,
        file_name: autoName, file_path: filePath, file_type: file.type,
        file_size: file.size, drive_file_id: driveFileId, drive_file_url: driveFileUrl,
      })

      // Fatura → otomatik transaction
      if (selected.key === 'transaction' && form.entityId && form.amount) {
        const pd = new Date(form.invoiceDate)
        const txId = crypto.randomUUID()
        const { error: txErr } = await supabase.from('transactions').insert({
          id: txId,
          user_id: user.id,
          contact_id: form.entityId,
          type: form.txType,
          description: form.description || form.invoiceNo || autoName,
          amount: net,
          kdv_rate: kdv,
          due_date: form.dueDate || null,
          transaction_date: form.invoiceDate,
          invoice_number: form.invoiceNo || null,
          period_month: pd.getMonth() + 1,
          period_year: pd.getFullYear(),
          status: form.payStatus,
          fatura_kesildi: true,
          paid_amount: form.payStatus === 'paid' ? total : (form.payStatus === 'partial' ? parseFloat(form.payAmount) || 0 : 0),
        })
        if (txErr) throw new Error(`İşlem kaydı oluşturulamadı: ${txErr.message}`)

        // Ödeme kaydı
        if ((form.payStatus === 'paid' || form.payStatus === 'partial') && form.payDate) {
          const paidAmt = form.payStatus === 'paid' ? total : (parseFloat(form.payAmount) || 0)
          if (paidAmt > 0) {
            await supabase.from('payments').insert({
              user_id: user.id, transaction_id: txId,
              amount: paidAmt, paid_at: form.payDate, method: 'bank',
              description: 'Tahsilat',
            })
          }
        }
      }

      // Dekont → personel ödeme
      if (selected.key === 'personnel_payment' && form.entityId && form.dekontAmount) {
        await supabase.from('personnel_payments').insert({
          user_id: user.id, personnel_id: form.entityId,
          amount: parseFloat(form.dekontAmount),
          paid_at: form.paymentDate,
          description: form.description || autoName,
          method: 'bank',
        }).maybeSingle()
      }

      setDone(`"${autoName}" kaydedildi${driveFolderId ? ' → Drive' : ''}`)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (err: any) {
      setError(err.message)
    }
    setUploading(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-border/40 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border/40 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,207,195,0.1)' }}>
          <FolderOpen className="h-4 w-4" style={{ color: '#00cfc3' }} />
        </div>
        <div>
          <h2 className="text-sm font-bold" style={{ color: '#091832' }}>Belge Giriş Merkezi</h2>
          <p className="text-[11px] text-muted-foreground">Belge tipini seç → bilgileri gir → dosya yükle</p>
        </div>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-5">
          {CATS.map(cat => {
            const Icon = cat.icon
            const active = selected?.key === cat.key
            return (
              <button key={cat.key} onClick={() => { setSelected(cat); reset() }}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center"
                style={{ borderColor: active ? cat.color : 'transparent', background: active ? cat.bg : 'rgba(9,24,50,0.03)' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: active ? cat.bg : 'rgba(9,24,50,0.05)' }}>
                  <Icon className="h-4 w-4" style={{ color: active ? cat.color : '#6b8aad' }} />
                </div>
                <span className="text-[11px] font-semibold leading-tight" style={{ color: active ? cat.color : '#091832' }}>{cat.label}</span>
              </button>
            )
          })}
        </div>

        {selected && (
          <div className="rounded-xl border border-border/50 p-4 space-y-3" style={{ background: selected.bg }}>
            <div className="flex items-center gap-2">
              <ChevronRight className="h-3.5 w-3.5" style={{ color: selected.color }} />
              <span className="text-xs font-semibold" style={{ color: selected.color }}>{selected.label} — {selected.sublabel}</span>
            </div>

            {/* Cari / Personel seçimi */}
            {selected.entityType !== 'none' && (
              <div className="space-y-1">
                <select value={form.entityId} onChange={e => set('entityId', e.target.value)}
                  className="w-full text-sm border rounded-lg px-3 py-2 bg-white focus:outline-none"
                  style={{ borderColor: selected.key === 'transaction' && !form.entityId ? '#f05a28' : '#dde6f0' }}>
                  <option value="">{entityLabel}...</option>
                  {entityList.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                {selected.key === 'transaction' && !form.entityId && (
                  <p className="text-[11px] text-orange-500 font-medium">⚠ Cari seçilmeden alacak/borç oluşturulamaz</p>
                )}
              </div>
            )}

            {/* ── FATURA ── */}
            {selected.key === 'transaction' && (<>
              <div className="flex gap-2">
                {[{v:'receivable',l:'↓ Alacak'},{v:'payable',l:'↑ Borç'}].map(t => (
                  <button key={t.v} type="button" onClick={() => set('txType', t.v)}
                    className="flex-1 text-xs py-1.5 rounded-lg font-semibold border transition-all"
                    style={{ borderColor: form.txType===t.v ? selected.color:'#dde6f0', background: form.txType===t.v ? 'rgba(0,207,195,0.12)':'white', color: form.txType===t.v ? selected.color:'#6b8aad' }}>
                    {t.l}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Fatura Tarihi</label>
                  <input type="date" value={form.invoiceDate} onChange={e => set('invoiceDate', e.target.value)}
                    className="w-full text-sm border border-border/60 rounded-lg px-3 py-1.5 bg-white focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Vade Tarihi</label>
                  <input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)}
                    className="w-full text-sm border border-border/60 rounded-lg px-3 py-1.5 bg-white focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Matrah (KDV Hariç)</label>
                <input type="number" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)}
                  className="w-full text-sm border border-border/60 rounded-lg px-3 py-1.5 bg-white focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">KDV Oranı</label>
                <div className="flex gap-2 mt-1">
                  {['0','10','20'].map(r => (
                    <button key={r} type="button" onClick={() => set('kdvRate', r)}
                      className="flex-1 py-1 rounded-lg text-xs font-semibold border transition-all"
                      style={{ borderColor: form.kdvRate===r ? selected.color:'#dde6f0', background: form.kdvRate===r ? 'rgba(0,207,195,0.1)':'white', color: form.kdvRate===r ? selected.color:'#6b8aad' }}>
                      %{r}
                    </button>
                  ))}
                </div>
                {net > 0 && (
                  <div className="mt-1.5 rounded-lg bg-white/70 border border-border/40 px-3 py-1.5 text-[11px] flex justify-between font-semibold" style={{ color: selected.color }}>
                    <span>KDV: ₺{(net*kdv/100).toLocaleString('tr-TR',{minimumFractionDigits:2})}</span>
                    <span>Toplam: ₺{total.toLocaleString('tr-TR',{minimumFractionDigits:2})}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Fatura No (opsiyonel)</label>
                <input type="text" placeholder="FT-2024-001" value={form.invoiceNo} onChange={e => set('invoiceNo', e.target.value)}
                  className="w-full text-sm border border-border/60 rounded-lg px-3 py-1.5 bg-white focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Tahsilat Durumu</label>
                <div className="flex gap-2 mt-1">
                  {[{v:'open',l:'Açık'},{v:'partial',l:'Kısmi'},{v:'paid',l:'Ödendi'}].map(s => (
                    <button key={s.v} type="button" onClick={() => set('payStatus', s.v)}
                      className="flex-1 py-1 rounded-lg text-xs font-semibold border transition-all"
                      style={{
                        borderColor: form.payStatus===s.v ? (s.v==='paid'?'#10b981':s.v==='partial'?'#f59e0b':selected.color):'#dde6f0',
                        background: form.payStatus===s.v ? (s.v==='paid'?'rgba(16,185,129,0.1)':s.v==='partial'?'rgba(245,158,11,0.1)':selected.bg):'white',
                        color: form.payStatus===s.v ? (s.v==='paid'?'#10b981':s.v==='partial'?'#d97706':'#6b8aad'):'#6b8aad',
                      }}>
                      {s.l}
                    </button>
                  ))}
                </div>
              </div>
              {(form.payStatus === 'paid' || form.payStatus === 'partial') && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Tahsilat Tarihi</label>
                    <input type="date" value={form.payDate} onChange={e => set('payDate', e.target.value)}
                      className="w-full text-sm border border-border/60 rounded-lg px-3 py-1.5 bg-white focus:outline-none" />
                  </div>
                  {form.payStatus === 'partial' && (
                    <div>
                      <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Ödenen Tutar</label>
                      <input type="number" placeholder="0.00" value={form.payAmount} onChange={e => set('payAmount', e.target.value)}
                        className="w-full text-sm border border-border/60 rounded-lg px-3 py-1.5 bg-white focus:outline-none" />
                    </div>
                  )}
                </div>
              )}
            </>)}

            {/* ── TEKLİF ── */}
            {selected.key === 'quote' && (<>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Teklif Tarihi</label>
                  <input type="date" value={form.quoteDate} onChange={e => set('quoteDate', e.target.value)}
                    className="w-full text-sm border border-border/60 rounded-lg px-3 py-1.5 bg-white focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Geçerlilik Tarihi</label>
                  <input type="date" value={form.validUntil} onChange={e => set('validUntil', e.target.value)}
                    className="w-full text-sm border border-border/60 rounded-lg px-3 py-1.5 bg-white focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Tutar (₺)</label>
                <input type="number" placeholder="0.00" value={form.quoteAmount} onChange={e => set('quoteAmount', e.target.value)}
                  className="w-full text-sm border border-border/60 rounded-lg px-3 py-1.5 bg-white focus:outline-none" />
              </div>
            </>)}

            {/* ── DEKONT ── */}
            {selected.key === 'personnel_payment' && (<>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Ödeme Tarihi</label>
                  <input type="date" value={form.paymentDate} onChange={e => set('paymentDate', e.target.value)}
                    className="w-full text-sm border border-border/60 rounded-lg px-3 py-1.5 bg-white focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Tutar (₺)</label>
                  <input type="number" placeholder="0.00" value={form.dekontAmount} onChange={e => set('dekontAmount', e.target.value)}
                    className="w-full text-sm border border-border/60 rounded-lg px-3 py-1.5 bg-white focus:outline-none" />
                </div>
              </div>
            </>)}

            {/* ── SÖZLEŞME ── */}
            {selected.key === 'personnel_hire' && (<>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Başlangıç Tarihi</label>
                  <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)}
                    className="w-full text-sm border border-border/60 rounded-lg px-3 py-1.5 bg-white focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Bitiş Tarihi (opsiyonel)</label>
                  <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)}
                    className="w-full text-sm border border-border/60 rounded-lg px-3 py-1.5 bg-white focus:outline-none" />
                </div>
              </div>
            </>)}

            {/* ── MUTABAKAT ── */}
            {selected.key === 'reconciliation' && (<>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Dönem</label>
                <input type="month" value={form.period} onChange={e => set('period', e.target.value)}
                  className="w-full text-sm border border-border/60 rounded-lg px-3 py-1.5 bg-white focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Açılış Bakiyesi (₺)</label>
                  <input type="number" placeholder="0.00" value={form.openingBalance} onChange={e => set('openingBalance', e.target.value)}
                    className="w-full text-sm border border-border/60 rounded-lg px-3 py-1.5 bg-white focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Kapanış Bakiyesi (₺)</label>
                  <input type="number" placeholder="0.00" value={form.closingBalance} onChange={e => set('closingBalance', e.target.value)}
                    className="w-full text-sm border border-border/60 rounded-lg px-3 py-1.5 bg-white focus:outline-none" />
                </div>
              </div>
              <div className="flex gap-2">
                {[{v:true,l:'Mutabık'},{v:false,l:'Fark Var'}].map(s => (
                  <button key={String(s.v)} type="button" onClick={() => set('isConfirmed', s.v)}
                    className="flex-1 py-1 rounded-lg text-xs font-semibold border transition-all"
                    style={{
                      borderColor: form.isConfirmed===s.v ? (s.v ? '#10b981':'#f05a28'):'#dde6f0',
                      background: form.isConfirmed===s.v ? (s.v ? 'rgba(16,185,129,0.1)':'rgba(240,90,40,0.1)'):'white',
                      color: form.isConfirmed===s.v ? (s.v ? '#10b981':'#f05a28'):'#6b8aad',
                    }}>
                    {s.l}
                  </button>
                ))}
              </div>
            </>)}

            {/* ── CARİ BELGE ── */}
            {selected.key === 'contact' && (
              <div>
                <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Belge Tarihi</label>
                <input type="date" value={form.docDate} onChange={e => set('docDate', e.target.value)}
                  className="w-full text-sm border border-border/60 rounded-lg px-3 py-1.5 bg-white focus:outline-none" />
              </div>
            )}

            {/* Genel açıklama */}
            <input type="text" placeholder="Açıklama (opsiyonel)"
              value={form.description} onChange={e => set('description', e.target.value)}
              className="w-full text-sm border border-border/60 rounded-lg px-3 py-1.5 bg-white focus:outline-none" />

            {/* Dosya */}
            <div onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all"
              style={{ borderColor: file ? selected.color:'#dde6f0', background: file ? selected.bg:'white' }}>
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-4 w-4" style={{ color: selected.color }} />
                  <span className="text-sm font-medium truncate max-w-[200px]">{file.name}</span>
                  <button onClick={e => { e.stopPropagation(); setFile(null); if (fileRef.current) fileRef.current.value = '' }}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Dosya seçmek için tıklayın</span>
                  <span className="text-[11px] text-muted-foreground/70">PDF, JPG, PNG, XLSX...</span>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx"
              onChange={e => setFile(e.target.files?.[0] ?? null)} />

            {file && (file.type === 'application/pdf' || file.type.startsWith('image/')) && (
              <button type="button" onClick={handleAiExtract} disabled={extracting}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold border-2 border-dashed transition-all"
                style={{ borderColor: '#6366f1', background: 'rgba(99,102,241,0.06)', color: '#6366f1', opacity: extracting ? 0.7 : 1 }}>
                {extracting
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Claude okuyor, bekleyin...</>
                  : <><Brain className="h-3.5 w-3.5" />AI ile Otomatik Doldur (Claude Haiku)</>}
              </button>
            )}

            {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" />{error}</p>}
            {done && <p className="text-xs font-medium px-3 py-2 rounded-lg" style={{ color: selected.color, background: selected.bg }}>✓ {done}</p>}

            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleSubmit} disabled={uploading || !file}
                className="flex-1 text-white font-semibold"
                style={{ background: uploading ? '#94a3b8' : selected.color, border: 'none' }}>
                {uploading ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Kaydediliyor...</> : <><Upload className="h-3.5 w-3.5 mr-1.5" />Yükle & Kaydet</>}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setSelected(null); reset() }}
                className="text-muted-foreground">İptal</Button>
            </div>
          </div>
        )}

        {!selected && (
          <div className="text-center py-4 text-xs text-muted-foreground">Yukarıdan belge tipini seçin</div>
        )}
      </div>
    </div>
  )
}
