import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Quote, QuoteItem, Contact } from '@/types'
import { generateQuoteNumber } from '@/lib/quoteNumber'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Plus, Trash2 } from 'lucide-react'

interface Props { quote: Quote | null; onSave: () => void; onClose: () => void }

interface ItemRow { description: string; quantity: string; unit_price: string; discount_percent: string }

export function QuoteForm({ quote, onSave, onClose }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [form, setForm] = useState({
    contact_id: quote?.contact_id ?? '',
    title: quote?.title ?? '',
    issue_date: quote?.issue_date ?? new Date().toISOString().slice(0, 10),
    valid_until: quote?.valid_until ?? '',
    tax_rate: quote?.tax_rate?.toString() ?? '20',
    notes: quote?.notes ?? '',
    status: quote?.status ?? 'draft',
  })
  const [items, setItems] = useState<ItemRow[]>([{ description: '', quantity: '1', unit_price: '', discount_percent: '0' }])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('contacts').select('id,name').order('name').then(({ data }) => setContacts((data ?? []) as Contact[]))
    if (quote) {
      supabase.from('quote_items').select('*').eq('quote_id', quote.id).order('sort_order').then(({ data }) => {
        if (data?.length) setItems(data.map((i) => ({
          description: i.description, quantity: i.quantity.toString(),
          unit_price: i.unit_price.toString(), discount_percent: i.discount_percent.toString(),
        })))
      })
    }
  }, [quote])

  const lineTotal = (item: ItemRow) => {
    const q = parseFloat(item.quantity) || 0
    const p = parseFloat(item.unit_price) || 0
    const d = parseFloat(item.discount_percent) || 0
    return q * p * (1 - d / 100)
  }
  const subtotal = items.reduce((s, i) => s + lineTotal(i), 0)
  const taxRate = parseFloat(form.tax_rate) || 0
  const taxAmount = subtotal * taxRate / 100
  const total = subtotal + taxAmount

  const setItem = (idx: number, k: keyof ItemRow, v: string) =>
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, [k]: v } : item))

  const handleSave = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const quoteNumber = quote?.quote_number ?? await generateQuoteNumber()
    const payload = {
      user_id: user.id,
      contact_id: form.contact_id || null,
      quote_number: quoteNumber,
      title: form.title,
      issue_date: form.issue_date,
      valid_until: form.valid_until || null,
      tax_rate: taxRate,
      subtotal, tax_amount: taxAmount, total,
      currency: 'TRY',
      notes: form.notes || null,
      status: form.status as Quote['status'],
    }

    let quoteId = quote?.id
    if (quote) {
      await supabase.from('quotes').update(payload).eq('id', quote.id)
      await supabase.from('quote_items').delete().eq('quote_id', quote.id)
    } else {
      const { data } = await supabase.from('quotes').insert(payload).select().single()
      quoteId = data?.id
    }

    if (quoteId) {
      await supabase.from('quote_items').insert(items.map((item, i) => ({
        quote_id: quoteId!,
        description: item.description,
        quantity: parseFloat(item.quantity) || 1,
        unit_price: parseFloat(item.unit_price) || 0,
        discount_percent: parseFloat(item.discount_percent) || 0,
        line_total: lineTotal(item),
        sort_order: i,
      })))
    }

    setLoading(false)
    onSave()
  }

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{quote ? 'Teklif Düzenle' : 'Yeni Teklif'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Cari</Label>
              <Select value={form.contact_id} onValueChange={(v) => set('contact_id', v)}>
                <SelectTrigger><SelectValue placeholder="Cari seçin" /></SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Durum</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Taslak</SelectItem>
                  <SelectItem value="sent">Gönderildi</SelectItem>
                  <SelectItem value="accepted">Kabul Edildi</SelectItem>
                  <SelectItem value="rejected">Reddedildi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Başlık *</Label>
              <Input value={form.title} onChange={(e) => set('title', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Tarih</Label>
              <Input type="date" value={form.issue_date} onChange={(e) => set('issue_date', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Geçerlilik Tarihi</Label>
              <Input type="date" value={form.valid_until} onChange={(e) => set('valid_until', e.target.value)} />
            </div>
          </div>

          {/* Items */}
          <div>
            <Label className="mb-2 block">Kalemler</Label>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-muted-foreground">Açıklama</th>
                    <th className="px-3 py-2 text-center text-muted-foreground w-20">Adet</th>
                    <th className="px-3 py-2 text-center text-muted-foreground w-28">Birim Fiyat</th>
                    <th className="px-3 py-2 text-center text-muted-foreground w-20">İskonto %</th>
                    <th className="px-3 py-2 text-right text-muted-foreground w-28">Toplam</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-2 py-1">
                        <Input value={item.description} onChange={(e) => setItem(idx, 'description', e.target.value)} className="h-8" placeholder="Ürün/hizmet" />
                      </td>
                      <td className="px-2 py-1">
                        <Input type="number" value={item.quantity} onChange={(e) => setItem(idx, 'quantity', e.target.value)} className="h-8 text-center" />
                      </td>
                      <td className="px-2 py-1">
                        <Input type="number" value={item.unit_price} onChange={(e) => setItem(idx, 'unit_price', e.target.value)} className="h-8" />
                      </td>
                      <td className="px-2 py-1">
                        <Input type="number" value={item.discount_percent} onChange={(e) => setItem(idx, 'discount_percent', e.target.value)} className="h-8 text-center" />
                      </td>
                      <td className="px-2 py-1 text-right font-medium">
                        ₺{lineTotal(item).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setItems((p) => [...p, { description: '', quantity: '1', unit_price: '', discount_percent: '0' }])}>
              <Plus className="h-3 w-3" /> Kalem Ekle
            </Button>
          </div>

          <div className="flex justify-end gap-8 text-sm">
            <div className="text-right space-y-1">
              <div className="flex gap-8 justify-between"><span className="text-muted-foreground">Ara Toplam</span><span>₺{subtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span></div>
              <div className="flex gap-8 justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">KDV</span>
                  <Input type="number" value={form.tax_rate} onChange={(e) => set('tax_rate', e.target.value)} className="h-7 w-16 text-center text-xs" />
                  <span className="text-muted-foreground">%</span>
                </div>
                <span>₺{taxAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex gap-8 justify-between font-semibold text-base border-t pt-1">
                <span>Toplam</span><span>₺{total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notlar</Label>
            <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button onClick={handleSave} disabled={loading || !form.title}>
            {loading ? 'Kaydediliyor...' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
