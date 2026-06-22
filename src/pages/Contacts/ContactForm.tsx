import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Contact } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

interface Props {
  contact: Contact | null
  parentId?: string
  onSave: () => void
  onClose: () => void
}

export function ContactForm({ contact, parentId, onSave, onClose }: Props) {
  const [parents, setParents] = useState<{ id: string; name: string }[]>([])
  const [form, setForm] = useState({
    name: contact?.name ?? '',
    type: contact?.type ?? 'customer',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    tax_number: contact?.tax_number ?? '',
    tax_office: contact?.tax_office ?? '',
    address: contact?.address ?? '',
    city: contact?.city ?? '',
    credit_limit: contact?.credit_limit?.toString() ?? '',
    notes: contact?.notes ?? '',
    parent_id: contact?.parent_id ?? parentId ?? '',
    iban: contact?.iban ?? '',
    bank_name: contact?.bank_name ?? '',
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('contacts').select('id,name').is('parent_id', null).order('name').then(({ data }) => {
      const list = (data ?? []) as { id: string; name: string }[]
      if (contact) setParents(list.filter(p => p.id !== contact.id))
      else setParents(list)
    })
  }, [])

  const handleSave = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      user_id: user.id,
      name: form.name,
      type: form.type as Contact['type'],
      email: form.email || null,
      phone: form.phone || null,
      tax_number: form.tax_number || null,
      tax_office: form.tax_office || null,
      address: form.address || null,
      city: form.city || null,
      credit_limit: form.credit_limit ? parseFloat(form.credit_limit) : null,
      notes: form.notes || null,
      parent_id: form.parent_id || null,
      iban: form.iban || null,
      bank_name: form.bank_name || null,
    }

    if (contact) {
      await supabase.from('contacts').update(payload).eq('id', contact.id)
    } else {
      await supabase.from('contacts').insert(payload)
    }
    setLoading(false)
    onSave()
  }

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contact ? 'Cari Düzenle' : parentId ? 'Yeni Şube Ekle' : 'Yeni Cari Ekle'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Ad / Unvan *</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Tür</Label>
            <Select value={form.type} onValueChange={(v) => set('type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">Müşteri</SelectItem>
                <SelectItem value="supplier">Tedarikçi</SelectItem>
                <SelectItem value="both">İkisi</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ana Cari (Şube ise)</Label>
            <Select value={form.parent_id || 'none'} onValueChange={(v) => set('parent_id', v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Ana cari seçin (opsiyonel)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Bağımsız Cari —</SelectItem>
                {parents.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>E-posta</Label>
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Telefon</Label>
            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Şehir</Label>
            <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Vergi No</Label>
            <Input value={form.tax_number} onChange={(e) => set('tax_number', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Vergi Dairesi</Label>
            <Input value={form.tax_office} onChange={(e) => set('tax_office', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Kredi Limiti (₺)</Label>
            <Input type="number" value={form.credit_limit} onChange={(e) => set('credit_limit', e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Adres</Label>
            <Textarea value={form.address} onChange={(e) => set('address', e.target.value)} rows={2} />
          </div>
          {/* Banka Bilgileri */}
          <div className="col-span-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 mt-1">Banka Bilgileri</p>
          </div>
          <div className="space-y-1.5">
            <Label>Banka Adı</Label>
            <Input value={form.bank_name} onChange={(e) => set('bank_name', e.target.value)} placeholder="Ziraat, Garanti, vb." />
          </div>
          <div className="space-y-1.5">
            <Label>IBAN</Label>
            <Input value={form.iban} onChange={(e) => set('iban', e.target.value)} placeholder="TR00 0000 0000 0000 0000 0000 00" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Notlar</Label>
            <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button onClick={handleSave} disabled={loading || !form.name}>
            {loading ? 'Kaydediliyor...' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
