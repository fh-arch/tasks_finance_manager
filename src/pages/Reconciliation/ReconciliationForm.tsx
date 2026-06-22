import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Contact, CurrentAccountEntry } from '@/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatDate } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

function formatTRY(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return '—'
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount)
}

function getMonthRange() {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    start: first.toISOString().slice(0, 10),
    end: last.toISOString().slice(0, 10),
  }
}

interface Props {
  contacts: Contact[]
  onSave: () => void
  onClose: () => void
}

type NotificationMethod = 'pdf' | 'excel' | 'email' | 'phone' | 'manual'

const NOTIFICATION_LABELS: Record<NotificationMethod, string> = {
  pdf: 'PDF',
  excel: 'Excel',
  email: 'E-posta',
  phone: 'Telefon',
  manual: 'Manuel',
}

export function ReconciliationForm({ contacts, onSave, onClose }: Props) {
  const monthRange = getMonthRange()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingEntries, setLoadingEntries] = useState(false)

  // Step 1
  const [contactId, setContactId] = useState('')
  const [title, setTitle] = useState('')
  const [periodStart, setPeriodStart] = useState(monthRange.start)
  const [periodEnd, setPeriodEnd] = useState(monthRange.end)

  // Step 2
  const [entries, setEntries] = useState<CurrentAccountEntry[]>([])
  const [calculatedBalance, setCalculatedBalance] = useState<number | null>(null)
  const [useCustomBalance, setUseCustomBalance] = useState(false)
  const [ourFinalBalance, setOurFinalBalance] = useState('')

  // Step 3
  const [theyReported, setTheyReported] = useState(false)
  const [notificationMethod, setNotificationMethod] = useState<NotificationMethod>('manual')
  const [notificationReference, setNotificationReference] = useState('')
  const [theirBalance, setTheirBalance] = useState('')
  const [notes, setNotes] = useState('')

  const selectedContact = contacts.find(c => c.id === contactId)

  const fetchEntries = async () => {
    if (!contactId || !periodStart || !periodEnd) return
    setLoadingEntries(true)
    const { data } = await supabase
      .from('current_account_entries')
      .select('*')
      .eq('contact_id', contactId)
      .gte('entry_date', periodStart)
      .lte('entry_date', periodEnd)
      .order('entry_date', { ascending: true })

    const list = (data ?? []) as CurrentAccountEntry[]
    setEntries(list)

    const debitSum = list.reduce((s, e) => e.entry_type === 'debit' ? s + Number(e.amount) : s, 0)
    const creditSum = list.reduce((s, e) => e.entry_type === 'credit' ? s + Number(e.amount) : s, 0)
    setCalculatedBalance(debitSum - creditSum)
    setLoadingEntries(false)
  }

  useEffect(() => {
    if (step === 2) fetchEntries()
  }, [step])

  const effectiveOurBalance = useCustomBalance
    ? (parseFloat(ourFinalBalance) || 0)
    : (calculatedBalance ?? 0)

  const theirBalanceNum = theyReported ? (parseFloat(theirBalance) || 0) : null
  const diff = theyReported ? effectiveOurBalance - (theirBalanceNum ?? 0) : null

  const canGoNext1 = !!contactId && !!periodStart && !!periodEnd
  const canSave = canGoNext1

  const handleSave = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get reconciliation number via RPC
      const { data: recNumber } = await supabase.rpc('generate_reconciliation_number', { p_user_id: user.id })

      await supabase.from('reconciliations').insert({
        user_id: user.id,
        contact_id: contactId,
        reconciliation_number: recNumber ?? `MUT-${Date.now()}`,
        title: title || null,
        period_start: periodStart,
        period_end: periodEnd,
        our_calculated_balance: calculatedBalance,
        our_final_balance: useCustomBalance ? (parseFloat(ourFinalBalance) || null) : null,
        their_balance: theyReported ? (parseFloat(theirBalance) || null) : null,
        notification_method: theyReported ? notificationMethod : null,
        notification_reference: (theyReported && notificationReference) ? notificationReference : null,
        notes: notes || null,
        status: 'draft',
      })

      onSave()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Yeni Mutabakat</DialogTitle>
          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-3">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  s === step ? 'bg-primary text-white' : s < step ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                }`}>{s < step ? '✓' : s}</div>
                <span className={`text-xs ${s === step ? 'text-gray-900 font-medium' : 'text-muted-foreground'}`}>
                  {s === 1 ? 'Temel Bilgiler' : s === 2 ? 'Bizim Bakiyemiz' : 'Karşı Taraf'}
                </span>
                {s < 3 && <div className="w-8 h-px bg-gray-200" />}
              </div>
            ))}
          </div>
        </DialogHeader>

        {/* STEP 1 */}
        {step === 1 && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Cari <span className="text-red-500">*</span></Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger>
                  <SelectValue placeholder="Cari seçin..." />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Başlık <span className="text-muted-foreground text-xs">(isteğe bağlı)</span></Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Örn: Ocak 2026 Mutabakatı"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Dönem Başlangıcı <span className="text-red-500">*</span></Label>
                <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Dönem Bitişi <span className="text-red-500">*</span></Label>
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="space-y-4 py-2">
            <div className="bg-indigo-50 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Cari: <span className="font-semibold text-gray-900">{selectedContact?.name}</span></p>
              <p className="text-xs text-muted-foreground">Dönem: {formatDate(periodStart)} – {formatDate(periodEnd)}</p>
            </div>

            {loadingEntries ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Hareketler hesaplanıyor...</span>
              </div>
            ) : (
              <>
                <div className={`rounded-xl p-4 border ${
                  (calculatedBalance ?? 0) > 0 ? 'bg-green-50 border-green-100' :
                  (calculatedBalance ?? 0) < 0 ? 'bg-red-50 border-red-100' :
                  'bg-gray-50 border-gray-100'
                }`}>
                  <p className="text-xs text-muted-foreground mb-1">Hesaplanan Bakiye</p>
                  <p className={`text-2xl font-bold ${
                    (calculatedBalance ?? 0) > 0 ? 'text-green-700' :
                    (calculatedBalance ?? 0) < 0 ? 'text-red-700' : 'text-gray-700'
                  }`}>{formatTRY(calculatedBalance)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{entries.length} hareket ({entries.filter(e => e.entry_type === 'debit').length} borç, {entries.filter(e => e.entry_type === 'credit').length} alacak)</p>
                </div>

                {/* Mini entries table */}
                {entries.length > 0 && (
                  <div className="rounded-xl border overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-muted-foreground font-semibold">Tarih</th>
                          <th className="px-3 py-2 text-left text-muted-foreground font-semibold">Açıklama</th>
                          <th className="px-3 py-2 text-right text-muted-foreground font-semibold">Borç</th>
                          <th className="px-3 py-2 text-right text-muted-foreground font-semibold">Alacak</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((e) => (
                          <tr key={e.id} className="border-t hover:bg-gray-50/50">
                            <td className="px-3 py-1.5">{formatDate(e.entry_date)}</td>
                            <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[160px]">{e.description ?? '—'}</td>
                            <td className="px-3 py-1.5 text-right text-green-600">
                              {e.entry_type === 'debit' ? formatTRY(Number(e.amount)) : '—'}
                            </td>
                            <td className="px-3 py-1.5 text-right text-red-600">
                              {e.entry_type === 'credit' ? formatTRY(Number(e.amount)) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {entries.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">Bu dönem için cari hareket bulunamadı.</p>
                )}

                {/* Toggle custom balance */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="use-custom-balance"
                    checked={useCustomBalance}
                    onChange={(e) => setUseCustomBalance(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary"
                  />
                  <label htmlFor="use-custom-balance" className="text-sm text-gray-700 cursor-pointer">
                    Farklı bakiye kullanmak istiyorum
                  </label>
                </div>

                {useCustomBalance && (
                  <div className="space-y-1.5">
                    <Label>Bizim Nihai Bakiyemiz (₺)</Label>
                    <Input
                      type="number"
                      value={ourFinalBalance}
                      onChange={(e) => setOurFinalBalance(e.target.value)}
                      placeholder={String(calculatedBalance ?? 0)}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div className="space-y-4 py-2">
            <div className="bg-indigo-50 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Bizim Bakiyemiz:</p>
              <p className="font-bold text-gray-900">{formatTRY(effectiveOurBalance)}</p>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="they-reported"
                checked={theyReported}
                onChange={(e) => setTheyReported(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary"
              />
              <label htmlFor="they-reported" className="text-sm text-gray-700 cursor-pointer font-medium">
                Karşı taraf bakiyesini bildirdi mi?
              </label>
            </div>

            {theyReported && (
              <div className="space-y-4 pl-6 border-l-2 border-indigo-100">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Bildirim Yöntemi</Label>
                  <div className="flex flex-wrap gap-2">
                    {(Object.entries(NOTIFICATION_LABELS) as [NotificationMethod, string][]).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setNotificationMethod(val)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          notificationMethod === val
                            ? 'bg-primary text-white border-primary'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-primary/50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Referans / Belge No <span className="text-muted-foreground text-xs">(isteğe bağlı)</span></Label>
                  <Input
                    value={notificationReference}
                    onChange={(e) => setNotificationReference(e.target.value)}
                    placeholder="Faks no, e-posta tarihi, vb."
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Karşı Taraf Bakiyesi (₺) <span className="text-red-500">*</span></Label>
                  <Input
                    type="number"
                    value={theirBalance}
                    onChange={(e) => setTheirBalance(e.target.value)}
                    placeholder="0.00"
                  />
                </div>

                {diff !== null && (
                  <div className={`rounded-xl p-3 border ${
                    diff > 0 ? 'bg-red-50 border-red-100' :
                    diff < 0 ? 'bg-blue-50 border-blue-100' :
                    'bg-green-50 border-green-100'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Fark:</span>
                      <span className={`text-lg font-bold ${
                        diff > 0 ? 'text-red-700' : diff < 0 ? 'text-blue-700' : 'text-green-700'
                      }`}>{formatTRY(diff)}</span>
                    </div>
                    <p className={`text-xs font-medium mt-1 ${
                      diff > 0 ? 'text-red-600' : diff < 0 ? 'text-blue-600' : 'text-green-600'
                    }`}>
                      {diff > 0 ? 'Alacak doğacak (karşı taraf az gösteriyor)' :
                       diff < 0 ? 'Borç doğacak (karşı taraf fazla gösteriyor)' :
                       'Bakiyeler eşit, fark yok'}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Notlar <span className="text-muted-foreground text-xs">(isteğe bağlı)</span></Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Ek notlar..."
              />
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between gap-3">
          <div>
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={loading}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Geri
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>İptal</Button>
            {step < 3 ? (
              <Button onClick={() => setStep(s => s + 1)} disabled={step === 1 && !canGoNext1}>
                İleri <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSave} disabled={loading || !canSave}>
                {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Kaydediliyor...</> : 'Taslak Olarak Kaydet'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
