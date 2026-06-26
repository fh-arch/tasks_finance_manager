import { useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import type { Contact } from '@/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Upload, CheckCircle2, AlertCircle, Table2, ChevronRight } from 'lucide-react'

export interface ImportedRow {
  label: string
  sub_label?: string
  unit_price: number
  quantity: number
  kdv_rate: number
}

interface Props {
  contacts: Contact[]
  onSuccess: (txId: string) => void
  onClose: () => void
}

type Step = 'upload' | 'map' | 'preview' | 'done'

function fmtTRY(n: number) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n)
}

export function ImportWizard({ contacts, onSuccess, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('upload')
  const [rawHeaders, setRawHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<any[][]>([])
  const [colMap, setColMap] = useState({ label: '', sub_label: '', unit_price: '', quantity: '', kdv_rate: '' })
  const [txMeta, setTxMeta] = useState({
    contact_id: '', description: '', period_start: '', period_end: '',
    due_date: '', kdv_rate: '20', product: '',
  })
  const [parsedRows, setParsedRows] = useState<ImportedRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback((file: File) => {
    setError(null)
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const json: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        if (json.length < 2) { setError('Dosyada yeterli veri yok.'); return }
        const headers = json[0].map(String)
        const rows = json.slice(1).filter(r => r.some(cell => cell !== ''))
        setRawHeaders(headers)
        setRawRows(rows)
        // Otomatik kolon eşleştirme (anahtar kelime bazlı)
        const guess = (keywords: string[]) =>
          headers.find(h => keywords.some(k => h.toLowerCase().includes(k))) ?? ''
        setColMap({
          label:      guess(['isim','ad','label','şube','öğrenci','kalem','name']),
          sub_label:  guess(['şehir','city','sınıf','class','sub','açıklama']),
          unit_price: guess(['fiyat','price','tutar','amount','ücret']),
          quantity:   guess(['adet','qty','quantity','sayı','count']),
          kdv_rate:   guess(['kdv','vat','tax']),
        })
        setStep('map')
      } catch {
        setError('Dosya okunamadı. Excel veya CSV formatında olduğundan emin olun.')
      }
    }
    reader.readAsArrayBuffer(file)
  }, [])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const buildPreview = () => {
    const colIdx = (col: string) => rawHeaders.indexOf(col)
    const rows: ImportedRow[] = rawRows
      .map(row => ({
        label:      String(row[colIdx(colMap.label)]   ?? '').trim(),
        sub_label:  colMap.sub_label   ? String(row[colIdx(colMap.sub_label)]  ?? '').trim() : undefined,
        unit_price: parseFloat(String(row[colIdx(colMap.unit_price)] ?? '0').replace(/[^0-9.,]/g, '').replace(',', '.')) || 0,
        quantity:   colMap.quantity    ? parseFloat(String(row[colIdx(colMap.quantity)] ?? '1')) || 1 : 1,
        kdv_rate:   colMap.kdv_rate    ? parseFloat(String(row[colIdx(colMap.kdv_rate)] ?? '0')) || 0 : parseFloat(txMeta.kdv_rate) || 0,
      }))
      .filter(r => r.label && r.unit_price > 0)
    if (rows.length === 0) { setError('Eşleştirilen kolonlarda geçerli veri bulunamadı.'); return }
    setParsedRows(rows)
    setStep('preview')
  }

  const handleImport = async () => {
    if (parsedRows.length === 0) return
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const subtotal = parsedRows.reduce((s, r) => s + r.unit_price * r.quantity, 0)
    const kdvRate  = parseFloat(txMeta.kdv_rate) || 0
    const today    = new Date().toISOString().slice(0, 10)

    const { data: tx, error: txErr } = await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'receivable',
      contact_id: txMeta.contact_id || null,
      amount: subtotal,
      kdv_rate: kdvRate,
      description: txMeta.description || `İçe aktarma — ${parsedRows.length} kalem`,
      transaction_date: today,
      due_date: txMeta.due_date || null,
      period_start: txMeta.period_start || null,
      period_end: txMeta.period_end || null,
      product: txMeta.product || null,
      status: 'open',
      currency: 'TRY',
      paid_amount: 0,
    }).select().single()

    if (txErr || !tx) { setError('İşlem kaydedilemedi: ' + txErr?.message); setLoading(false); return }

    const itemsPayload = parsedRows.map((r, i) => ({
      user_id: user.id,
      transaction_id: tx.id,
      label: r.label,
      sub_label: r.sub_label || null,
      unit_price: r.unit_price,
      quantity: r.quantity,
      kdv_rate: r.kdv_rate,
      sort_order: i,
    }))

    const { error: itemErr } = await supabase.from('transaction_items').insert(itemsPayload)
    if (itemErr) { setError('Kalemler kaydedilemedi: ' + itemErr.message); setLoading(false); return }

    setLoading(false)
    setStep('done')
    onSuccess(tx.id)
  }

  const subtotal = parsedRows.reduce((s, r) => s + r.unit_price * r.quantity, 0)
  const kdvRate  = parseFloat(txMeta.kdv_rate) || 0
  const kdvTotal = subtotal * kdvRate / 100
  const grand    = subtotal + kdvTotal

  const setM = (k: string, v: string) => setTxMeta(f => ({ ...f, [k]: v }))

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>İçe Aktarma Sihirbazı</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs font-medium">
          {(['upload','map','preview'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              <span className={`px-2 py-0.5 rounded-full ${step === s ? 'bg-primary text-primary-foreground' : step === 'done' || (['upload','map','preview'] as Step[]).indexOf(step) > i ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                {['Dosya','Kolon Eşleştirme','Önizleme'][i]}
              </span>
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-3 py-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
          </div>
        )}

        {/* ── Step 1: Upload ── */}
        {step === 'upload' && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-gray-200 rounded-2xl p-10 text-center hover:border-primary/40 transition-colors cursor-pointer"
              onClick={() => fileRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
            >
              <Upload className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700">Excel veya CSV dosyasını sürükleyin</p>
              <p className="text-xs text-muted-foreground mt-1">.xlsx · .xls · .csv — Tıklayın veya sürükleyin</p>
              <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xls,.csv"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>
            <div className="bg-blue-50 rounded-xl px-4 py-3 text-xs text-blue-700 space-y-1">
              <p className="font-semibold">Beklenen kolon formatı:</p>
              <p>Zorunlu: <span className="font-mono">isim/şube/kalem</span> + <span className="font-mono">tutar</span></p>
              <p>Opsiyonel: <span className="font-mono">şehir / adet / açıklama / kdv</span></p>
            </div>
          </div>
        )}

        {/* ── Step 2: Column mapping ── */}
        {step === 'map' && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">{rawRows.length} satır okundu. Kolonları eşleştirin:</p>

            {/* İşlem meta */}
            <div className="border rounded-xl p-3 space-y-3">
              <p className="text-xs font-semibold text-gray-700">İşlem Bilgileri</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Cari</Label>
                  <Select value={txMeta.contact_id} onValueChange={v => setM('contact_id', v)}>
                    <SelectTrigger><SelectValue placeholder="Seçin" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">— Yok —</SelectItem>
                      {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>KDV % (genel)</Label>
                  <Select value={txMeta.kdv_rate} onValueChange={v => setM('kdv_rate', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">KDV Yok</SelectItem>
                      <SelectItem value="10">%10</SelectItem>
                      <SelectItem value="20">%20</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Açıklama</Label>
                <Input value={txMeta.description} onChange={e => setM('description', e.target.value)} placeholder="Fatura açıklaması" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Dönem Başı</Label><Input type="date" value={txMeta.period_start} onChange={e => setM('period_start', e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Dönem Sonu</Label><Input type="date" value={txMeta.period_end} onChange={e => setM('period_end', e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Vade Tarihi *</Label><Input type="date" value={txMeta.due_date} onChange={e => setM('due_date', e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Ürün</Label><Input value={txMeta.product} onChange={e => setM('product', e.target.value)} placeholder="FormLand, Eddy..." /></div>
              </div>
            </div>

            {/* Kolon mapping */}
            <div className="border rounded-xl p-3 space-y-3">
              <p className="text-xs font-semibold text-gray-700">Kolon Eşleştirme</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'label',      label: 'Kalem Adı *',    required: true  },
                  { key: 'unit_price', label: 'Birim Fiyat *',  required: true  },
                  { key: 'sub_label',  label: 'Alt Bilgi',      required: false },
                  { key: 'quantity',   label: 'Adet',           required: false },
                  { key: 'kdv_rate',   label: 'KDV % (kolon)',  required: false },
                ].map(({ key, label, required }) => (
                  <div key={key} className="space-y-1.5">
                    <Label>{label}</Label>
                    <Select value={colMap[key as keyof typeof colMap]} onValueChange={v => setColMap(f => ({ ...f, [key]: v }))}>
                      <SelectTrigger className={required && !colMap[key as keyof typeof colMap] ? 'border-red-300' : ''}>
                        <SelectValue placeholder={required ? 'Seçin *' : 'Opsiyonel'} />
                      </SelectTrigger>
                      <SelectContent>
                        {!required && <SelectItem value="">— Kullanma —</SelectItem>}
                        {rawHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {/* Önizleme satırları (ilk 3) */}
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5"><Table2 className="h-3.5 w-3.5" />İlk 3 satır önizlemesi</p>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead><tr>{rawHeaders.map(h => <th key={h} className="px-2 py-1 text-left text-muted-foreground font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {rawRows.slice(0, 3).map((row, i) => (
                      <tr key={i} className="border-t border-gray-200">
                        {rawHeaders.map((_, ci) => <td key={ci} className="px-2 py-1">{String(row[ci] ?? '')}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Preview ── */}
        {step === 'preview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-blue-50 rounded-xl px-4 py-3 text-center">
                <p className="text-xs text-blue-600">Satır Sayısı</p>
                <p className="text-xl font-bold text-blue-900">{parsedRows.length}</p>
              </div>
              <div className="bg-gray-50 rounded-xl px-4 py-3 text-center">
                <p className="text-xs text-muted-foreground">Ara Toplam</p>
                <p className="text-xl font-bold">{fmtTRY(subtotal)}</p>
              </div>
              <div className="bg-emerald-50 rounded-xl px-4 py-3 text-center">
                <p className="text-xs text-emerald-600">KDV Dahil Toplam</p>
                <p className="text-xl font-bold text-emerald-900">{fmtTRY(grand)}</p>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto border rounded-xl">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-muted-foreground">#</th>
                    <th className="px-3 py-2 text-left text-muted-foreground">Kalem</th>
                    <th className="px-3 py-2 text-left text-muted-foreground">Alt Bilgi</th>
                    <th className="px-3 py-2 text-right text-muted-foreground">Birim Fiyat</th>
                    <th className="px-3 py-2 text-right text-muted-foreground">Adet</th>
                    <th className="px-3 py-2 text-right text-muted-foreground">Toplam</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-1.5 font-medium">{r.label}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{r.sub_label ?? '—'}</td>
                      <td className="px-3 py-1.5 text-right">{fmtTRY(r.unit_price)}</td>
                      <td className="px-3 py-1.5 text-right">{r.quantity}</td>
                      <td className="px-3 py-1.5 text-right font-semibold">{fmtTRY(r.unit_price * r.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-gray-50">
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right text-xs font-medium">Ara Toplam</td>
                    <td></td>
                    <td className="px-3 py-2 text-right font-bold">{fmtTRY(subtotal)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-3 py-1.5 text-right text-xs text-muted-foreground">KDV (%{kdvRate})</td>
                    <td></td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground">{fmtTRY(kdvTotal)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right text-xs font-bold text-emerald-700">Genel Toplam</td>
                    <td></td>
                    <td className="px-3 py-2 text-right font-bold text-emerald-700">{fmtTRY(grand)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* ── Step done ── */}
        {step === 'done' && (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
            <p className="text-lg font-bold text-gray-900">Başarıyla İçe Aktarıldı</p>
            <p className="text-sm text-muted-foreground">{parsedRows.length} kalem, {fmtTRY(grand)} alacak kaydı oluşturuldu.</p>
          </div>
        )}

        <DialogFooter>
          {step === 'upload' && (
            <Button variant="outline" onClick={onClose}>İptal</Button>
          )}
          {step === 'map' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>Geri</Button>
              <Button onClick={buildPreview} disabled={!colMap.label || !colMap.unit_price}>
                Önizlemeye Geç
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('map')}>Geri</Button>
              <Button onClick={handleImport} disabled={loading}>
                {loading ? 'Kaydediliyor...' : `${parsedRows.length} Kalemi Aktar`}
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button onClick={onClose}>Kapat</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
