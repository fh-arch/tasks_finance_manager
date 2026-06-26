import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Plus, Users2, Pencil, Trash2, Search, Building2, Mail, Phone, MapPin, Banknote } from 'lucide-react'
import { DocAttachButton } from '@/components/shared/DocAttachButton'

type Lead = {
  id: string
  full_name: string
  company: string | null
  email: string | null
  phone: string | null
  city: string | null
  status: string
  notes: string | null
  quote_amount: number | null
  quote_date: string | null
  created_at: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  gorusuldu:     { label: 'Görüşüldü',      color: 'bg-blue-100 text-blue-700' },
  teklif_verildi: { label: 'Teklif Verildi', color: 'bg-amber-100 text-amber-700' },
  kazanildi:     { label: 'Kazanıldı',      color: 'bg-emerald-100 text-emerald-700' },
  kaybedildi:    { label: 'Kaybedildi',     color: 'bg-red-100 text-red-700' },
}

const STATUSES = Object.keys(STATUS_CONFIG)

const emptyForm = { full_name: '', company: '', email: '', phone: '', city: '', status: 'gorusuldu', notes: '', quote_amount: '', quote_date: '' }

export function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Lead | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const fetchAll = async () => {
    const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
    setLeads((data ?? []) as Lead[])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const openForm = (lead?: Lead) => {
    if (lead) {
      setEditing(lead)
      setForm({ full_name: lead.full_name, company: lead.company ?? '', email: lead.email ?? '', phone: lead.phone ?? '', city: lead.city ?? '', status: lead.status, notes: lead.notes ?? '', quote_amount: lead.quote_amount != null ? String(lead.quote_amount) : '', quote_date: lead.quote_date ?? '' })
    } else {
      setEditing(null)
      setForm(emptyForm)
    }
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.full_name.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const payload = {
      user_id: user.id,
      full_name: form.full_name.trim(),
      company: form.company || null,
      email: form.email || null,
      phone: form.phone || null,
      city: form.city || null,
      status: form.status,
      notes: form.notes || null,
      quote_amount: form.quote_amount ? Number(form.quote_amount) : null,
      quote_date: form.quote_date || null,
      updated_at: new Date().toISOString(),
    }
    let err: any = null
    let savedLeadId: string | null = editing?.id ?? null

    if (editing) {
      const { error } = await supabase.from('leads').update(payload).eq('id', editing.id)
      err = error
    } else {
      const { data: inserted, error } = await supabase.from('leads').insert(payload).select('id').single()
      err = error
      savedLeadId = inserted?.id ?? null
    }

    // Teklif tutarı varsa otomatik olarak Teklifler'de kayıt oluştur
    if (!err && payload.quote_amount && savedLeadId) {
      const prevAmount = editing?.quote_amount ?? null
      const amountChanged = !editing || prevAmount !== payload.quote_amount
      if (amountChanged) {
        // Bu lead için mevcut teklif var mı kontrol et
        const { data: existing } = await supabase.from('quotes')
          .select('id').eq('source_type', 'lead').eq('source_id', savedLeadId).maybeSingle()
        if (!existing) {
          // quote_number üret: Q-YYYY-xxxx
          const qNum = `Q-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`
          const subtotal = payload.quote_amount
          await supabase.from('quotes').insert({
            user_id: user.id,
            quote_number: qNum,
            title: `${payload.full_name}${payload.company ? ' – ' + payload.company : ''} Teklifi`,
            issue_date: payload.quote_date ?? new Date().toISOString().slice(0, 10),
            status: 'sent',
            subtotal,
            tax_rate: 0,
            tax_amount: 0,
            total: subtotal,
            currency: 'TRY',
            notes: `Müşteri adayından otomatik oluşturuldu.`,
            source_type: 'lead',
            source_id: savedLeadId,
          })
        } else {
          // Tutar değiştiyse güncelle
          await supabase.from('quotes').update({
            subtotal: payload.quote_amount, total: payload.quote_amount,
            issue_date: payload.quote_date ?? new Date().toISOString().slice(0, 10),
          }).eq('id', existing.id)
        }
      }
    }

    setSaving(false)
    if (err) { alert(`Kayıt hatası: ${err.message}`); return }
    setShowForm(false)
    fetchAll()
  }

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`"${name}" silinecek. Emin misiniz?`)) return
    await supabase.from('leads').delete().eq('id', id)
    fetchAll()
  }

  const handleStatusChange = async (id: string, status: string) => {
    await supabase.from('leads').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l))
  }

  const filtered = leads.filter(l => {
    const matchStatus = statusFilter === 'all' || l.status === statusFilter
    const matchSearch = !search || l.full_name.toLowerCase().includes(search.toLowerCase()) || (l.company ?? '').toLowerCase().includes(search.toLowerCase()) || (l.city ?? '').toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  const counts = STATUSES.reduce((acc, s) => ({ ...acc, [s]: leads.filter(l => l.status === s).length }), {} as Record<string, number>)

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
    </div>
  )

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Müşteri Adayları</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{leads.length} aday listeleniyor</p>
        </div>
        <Button onClick={() => openForm()} className="gap-1.5">
          <Plus className="h-4 w-4" /> Yeni Aday
        </Button>
      </div>

      {/* Status KPI Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {STATUSES.map(s => {
          const cfg = STATUS_CONFIG[s]
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
              className={`rounded-2xl border p-4 text-left transition-all shadow-sm hover:shadow-md ${statusFilter === s ? 'ring-2 ring-indigo-400 border-indigo-200' : 'border-border/50 bg-white'}`}
            >
              <p className="text-2xl font-bold text-gray-900">{counts[s] ?? 0}</p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${cfg.color}`}>{cfg.label}</span>
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="relative w-full max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ad, şirket veya şehir ara..." className="pl-8 h-9 text-sm" />
      </div>

      {/* Cards Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Users2 className="h-12 w-12 text-muted-foreground/25 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Aday bulunamadı</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(lead => {
            const cfg = STATUS_CONFIG[lead.status] ?? STATUS_CONFIG.gorusuldu
            return (
              <div key={lead.id} className="bg-white rounded-2xl border border-border/50 shadow-sm p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {lead.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm leading-tight">{lead.full_name}</p>
                      {lead.company && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Building2 className="h-3 w-3" /> {lead.company}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <DocAttachButton relatedType="lead" relatedId={lead.id} />
                    <button onClick={() => openForm(lead)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={() => handleDelete(lead.id, lead.full_name)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1 mb-3">
                  {lead.email && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Mail className="h-3 w-3 flex-shrink-0" /> {lead.email}
                    </p>
                  )}
                  {lead.phone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Phone className="h-3 w-3 flex-shrink-0" /> {lead.phone}
                    </p>
                  )}
                  {lead.city && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 flex-shrink-0" /> {lead.city}
                    </p>
                  )}
                </div>

                {lead.quote_amount != null && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <Banknote className="h-3 w-3 text-amber-500 flex-shrink-0" />
                    <span className="text-xs font-semibold text-amber-700">
                      Teklif: ₺{lead.quote_amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </span>
                    {lead.quote_date && (
                      <span className="text-[10px] text-muted-foreground ml-auto">{lead.quote_date}</span>
                    )}
                  </div>
                )}
                {lead.notes && (
                  <p className="text-xs text-muted-foreground bg-gray-50 rounded-lg px-2.5 py-2 mb-3 line-clamp-2">{lead.notes}</p>
                )}

                {/* Inline status changer */}
                <div className="flex flex-wrap gap-1">
                  {STATUSES.map(s => {
                    const c = STATUS_CONFIG[s]
                    return (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(lead.id, s)}
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full border transition-all ${
                          lead.status === s
                            ? `${c.color} border-transparent font-bold`
                            : 'border-gray-200 text-gray-400 hover:border-gray-300'
                        }`}
                      >
                        {c.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Form Dialog */}
      {showForm && (
        <Dialog open onOpenChange={() => setShowForm(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? 'Adayı Düzenle' : 'Yeni Müşteri Adayı'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Ad Soyad <span className="text-red-500">*</span></Label>
                <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Ad Soyad" />
              </div>
              <div className="space-y-1.5">
                <Label>Şirket</Label>
                <Input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Şirket adı" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>E-posta</Label>
                  <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="mail@örnek.com" />
                </div>
                <div className="space-y-1.5">
                  <Label>Telefon</Label>
                  <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="0555 000 00 00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Şehir</Label>
                  <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="İstanbul" />
                </div>
                <div className="space-y-1.5">
                  <Label>Durum</Label>
                  <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Teklif Tutarı (₺)</Label>
                  <Input type="number" min="0" step="0.01" value={form.quote_amount} onChange={e => setForm(f => ({ ...f, quote_amount: e.target.value }))} placeholder="0,00" />
                </div>
                <div className="space-y-1.5">
                  <Label>Teklif Tarihi</Label>
                  <Input type="date" value={form.quote_date} onChange={e => setForm(f => ({ ...f, quote_date: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notlar</Label>
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Görüşme notları, özel istekler..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowForm(false)}>İptal</Button>
              <Button onClick={handleSave} disabled={saving || !form.full_name.trim()}>
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
