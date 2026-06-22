import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Partner } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AmountDisplay } from '@/components/shared/AmountDisplay'
import { formatDate } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Plus, Users, TrendingDown, TrendingUp, Pencil, Trash2, PieChart, ArrowUpDown } from 'lucide-react'

type Movement = {
  id: string
  partner_id: string
  partner_name?: string
  amount: number
  movement_type: 'income' | 'expense'
  withdrawal_date: string
  description: string | null
  payment_method: string | null
  notes: string | null
  created_at: string
}

type PartnerWithStats = Partner & {
  totalIn: number
  totalOut: number
  net: number
}

export function PartnersPage() {
  const [partners, setPartners] = useState<PartnerWithStats[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)

  const [showPartnerForm, setShowPartnerForm] = useState(false)
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null)
  const [showMovementForm, setShowMovementForm] = useState(false)

  const [partnerForm, setPartnerForm] = useState({ name: '', share_percent: '', notes: '' })
  const [movForm, setMovForm] = useState({
    partner_id: '',
    movement_type: 'expense' as 'income' | 'expense',
    amount: '',
    withdrawal_date: new Date().toISOString().slice(0, 10),
    description: '',
    payment_method: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  const fetchAll = async () => {
    const [p, m] = await Promise.all([
      supabase.from('partners').select('*').eq('is_active', true).order('name'),
      supabase.from('partner_withdrawals').select('*, partners(name)').order('withdrawal_date', { ascending: false }),
    ])
    const rawMovements: Movement[] = (m.data ?? []).map((x: any) => ({
      ...x,
      movement_type: x.movement_type ?? 'expense',
      partner_name: x.partners?.name,
    }))
    setMovements(rawMovements)

    const partnerList = (p.data ?? []) as Partner[]
    const withStats: PartnerWithStats[] = partnerList.map(pt => {
      const ptMovs = rawMovements.filter(mv => mv.partner_id === pt.id)
      const totalIn = ptMovs.filter(mv => mv.movement_type === 'income').reduce((s, mv) => s + Number(mv.amount), 0)
      const totalOut = ptMovs.filter(mv => mv.movement_type === 'expense').reduce((s, mv) => s + Number(mv.amount), 0)
      return { ...pt, totalIn, totalOut, net: totalIn - totalOut }
    })
    setPartners(withStats)
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const openPartnerForm = (p: Partner | null) => {
    setEditingPartner(p)
    setPartnerForm({ name: p?.name ?? '', share_percent: p?.share_percent?.toString() ?? '', notes: p?.notes ?? '' })
    setShowPartnerForm(true)
  }

  const handleSavePartner = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = {
      user_id: user.id,
      name: partnerForm.name,
      share_percent: parseFloat(partnerForm.share_percent) || 0,
      notes: partnerForm.notes || null,
    }
    if (editingPartner) {
      await supabase.from('partners').update(payload).eq('id', editingPartner.id)
    } else {
      await supabase.from('partners').insert(payload)
    }
    setSaving(false); setShowPartnerForm(false); fetchAll()
  }

  const handleDeletePartner = async (id: string) => {
    if (!window.confirm('Bu ortak silinecek. Emin misiniz?')) return
    await supabase.from('partners').update({ is_active: false }).eq('id', id)
    fetchAll()
  }

  const handleSaveMovement = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const partner = partners.find(p => p.id === movForm.partner_id)
    const amount = parseFloat(movForm.amount)
    const isIncome = movForm.movement_type === 'income'

    // 1. partner_withdrawals'a kaydet
    await supabase.from('partner_withdrawals').insert({
      user_id: user.id,
      partner_id: movForm.partner_id,
      movement_type: movForm.movement_type,
      amount,
      withdrawal_date: movForm.withdrawal_date,
      description: movForm.description || null,
      payment_method: movForm.payment_method || null,
      notes: movForm.notes || null,
    })

    // 2. transactions tablosuna gelir/gider olarak yaz
    await supabase.from('transactions').insert({
      user_id: user.id,
      type: isIncome ? 'income' : 'expense',
      amount,
      description: movForm.description || (isIncome
        ? `Ortak sermaye girişi: ${partner?.name ?? ''}`
        : `Ortak para çıkışı: ${partner?.name ?? ''}`),
      transaction_date: movForm.withdrawal_date,
      payment_method: movForm.payment_method || null,
      status: 'completed',
      notes: movForm.notes || null,
      currency: 'TRY',
    })

    setSaving(false)
    setShowMovementForm(false)
    setMovForm({ partner_id: '', movement_type: 'expense', amount: '', withdrawal_date: new Date().toISOString().slice(0, 10), description: '', payment_method: '', notes: '' })
    fetchAll()
  }

  const handleDeleteMovement = async (mv: Movement) => {
    if (!window.confirm('Bu hareket silinecek?')) return
    await supabase.from('partner_withdrawals').delete().eq('id', mv.id)
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

  const totalIn = movements.filter(m => m.movement_type === 'income').reduce((s, m) => s + Number(m.amount), 0)
  const totalOut = movements.filter(m => m.movement_type === 'expense').reduce((s, m) => s + Number(m.amount), 0)
  const totalShare = partners.reduce((s, p) => s + Number(p.share_percent), 0)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ortaklar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{partners.length} ortak · Sermaye ve kâr payı takibi</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => openPartnerForm(null)} className="gap-1.5">
            <Users className="h-4 w-4" /> Ortak Ekle
          </Button>
          <Button onClick={() => setShowMovementForm(true)} className="gap-1.5" disabled={partners.length === 0}>
            <Plus className="h-4 w-4" /> Hareket Ekle
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 stagger-children">
        <div className="kpi-card">
          <div className="kpi-icon bg-violet-50 mb-3"><Users className="h-5 w-5 text-violet-600" /></div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Aktif Ortaklar</p>
          <p className="text-xl font-bold text-gray-900">{partners.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Toplam pay: %{totalShare.toFixed(0)}</p>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-emerald-50 mb-3"><TrendingUp className="h-5 w-5 text-emerald-600" /></div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Toplam Giriş</p>
          <AmountDisplay amount={totalIn} positive className="text-xl font-bold" />
          <p className="text-xs text-muted-foreground mt-0.5">Gelir olarak yazıldı</p>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-red-50 mb-3"><TrendingDown className="h-5 w-5 text-red-500" /></div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Toplam Çıkış</p>
          <AmountDisplay amount={totalOut} negative={totalOut > 0} className="text-xl font-bold" />
          <p className="text-xs text-muted-foreground mt-0.5">Gider olarak yazıldı</p>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-indigo-50 mb-3"><PieChart className="h-5 w-5 text-indigo-600" /></div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Net</p>
          <AmountDisplay amount={Math.abs(totalIn - totalOut)} positive={totalIn >= totalOut} negative={totalIn < totalOut} className="text-xl font-bold" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Partner Cards */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 px-1">Ortaklar & Payları</h2>
          {partners.length === 0 ? (
            <div className="bg-white rounded-2xl border border-border/50 shadow-sm py-12 text-center">
              <Users className="h-10 w-10 text-muted-foreground/25 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Henüz ortak eklenmedi</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => openPartnerForm(null)}>Ortak Ekle</Button>
            </div>
          ) : (
            partners.map(p => (
              <div key={p.id} className="bg-white rounded-2xl border border-border/50 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{p.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="h-1.5 rounded-full bg-indigo-200 w-16 overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(p.share_percent, 100)}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground font-medium">%{p.share_percent}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => openPartnerForm(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeletePartner(p.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/40">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-0.5">Giriş</p>
                    <AmountDisplay amount={p.totalIn} positive className="text-xs font-semibold" />
                  </div>
                  <div className="text-center border-x border-border/40">
                    <p className="text-xs text-muted-foreground mb-0.5">Çıkış</p>
                    <AmountDisplay amount={p.totalOut} negative={p.totalOut > 0} className="text-xs font-semibold" />
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-0.5">Net</p>
                    <AmountDisplay amount={Math.abs(p.net)} positive={p.net >= 0} negative={p.net < 0} className="text-xs font-semibold" />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Movement History */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border/40 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Hareket Geçmişi</h2>
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-50/50">
                  <tr>
                    {['Tarih', 'Ortak', 'Tür', 'Açıklama', 'Ödeme', 'Tutar', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movements.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-14 text-center">
                        <ArrowUpDown className="h-10 w-10 text-muted-foreground/25 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Henüz hareket kaydı yok</p>
                      </td>
                    </tr>
                  )}
                  {movements.map(mv => (
                    <tr key={mv.id} className="border-b border-border/40 hover:bg-primary/[0.02] transition-colors">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(mv.withdrawal_date)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {(mv.partner_name ?? '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium">{mv.partner_name ?? '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {mv.movement_type === 'income' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                            <TrendingUp className="h-3 w-3" /> Giriş
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                            <TrendingDown className="h-3 w-3" /> Çıkış
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[160px] truncate">{mv.description ?? '—'}</td>
                      <td className="px-4 py-3">
                        {mv.payment_method
                          ? <Badge variant="outline" className="text-xs">{mv.payment_method}</Badge>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <AmountDisplay
                          amount={mv.amount}
                          positive={mv.movement_type === 'income'}
                          negative={mv.movement_type === 'expense'}
                          className="font-semibold"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeleteMovement(mv)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Partner Form */}
      {showPartnerForm && (
        <Dialog open onOpenChange={() => setShowPartnerForm(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{editingPartner ? 'Ortak Düzenle' : 'Yeni Ortak Ekle'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Ad Soyad / Unvan *</Label>
                <Input value={partnerForm.name} onChange={e => setPartnerForm(f => ({ ...f, name: e.target.value }))} placeholder="Ortak adı" />
              </div>
              <div className="space-y-1.5">
                <Label>Şirket Payı (%)</Label>
                <div className="relative">
                  <Input
                    type="number" min="0" max="100" step="0.01"
                    value={partnerForm.share_percent}
                    onChange={e => setPartnerForm(f => ({ ...f, share_percent: e.target.value }))}
                    placeholder="0"
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">%</span>
                </div>
                {totalShare > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Mevcut toplam: %{totalShare.toFixed(0)}
                    {partnerForm.share_percent && ` + %${partnerForm.share_percent} = %${(totalShare + parseFloat(partnerForm.share_percent || '0')).toFixed(0)}`}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Notlar</Label>
                <Textarea value={partnerForm.notes} onChange={e => setPartnerForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPartnerForm(false)}>İptal</Button>
              <Button onClick={handleSavePartner} disabled={saving || !partnerForm.name}>Kaydet</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Movement Form */}
      {showMovementForm && (
        <Dialog open onOpenChange={() => setShowMovementForm(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Ortak Hareketi</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {/* Tür seçici */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMovForm(f => ({ ...f, movement_type: 'income' }))}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                    movForm.movement_type === 'income'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-border text-muted-foreground hover:border-emerald-200'
                  }`}
                >
                  <TrendingUp className="h-4 w-4" /> Para Girişi
                </button>
                <button
                  type="button"
                  onClick={() => setMovForm(f => ({ ...f, movement_type: 'expense' }))}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                    movForm.movement_type === 'expense'
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-border text-muted-foreground hover:border-red-200'
                  }`}
                >
                  <TrendingDown className="h-4 w-4" /> Para Çıkışı
                </button>
              </div>

              {movForm.movement_type === 'income' ? (
                <p className="text-xs bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl px-3 py-2">
                  Ortak firmaya sermaye koyuyor — <strong>Gelirler</strong>e yazılacak.
                </p>
              ) : (
                <p className="text-xs bg-red-50 border border-red-100 text-red-700 rounded-xl px-3 py-2">
                  Ortak firmadan para çekiyor — <strong>Giderler</strong>e yazılacak.
                </p>
              )}

              <div className="space-y-1.5">
                <Label>Ortak *</Label>
                <Select value={movForm.partner_id} onValueChange={v => setMovForm(f => ({ ...f, partner_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Ortak seçin" /></SelectTrigger>
                  <SelectContent>
                    {partners.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} <span className="text-muted-foreground">(%{p.share_percent})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Tutar (₺) *</Label>
                  <Input type="number" value={movForm.amount} onChange={e => setMovForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tarih</Label>
                  <Input type="date" value={movForm.withdrawal_date} onChange={e => setMovForm(f => ({ ...f, withdrawal_date: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Açıklama</Label>
                <Input
                  value={movForm.description}
                  onChange={e => setMovForm(f => ({ ...f, description: e.target.value }))}
                  placeholder={movForm.movement_type === 'income' ? 'Sermaye artışı, kredi vb.' : 'Kâr payı, avans, çekim vb.'}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ödeme Yöntemi</Label>
                <Select value={movForm.payment_method} onValueChange={v => setMovForm(f => ({ ...f, payment_method: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seçin" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Nakit">Nakit</SelectItem>
                    <SelectItem value="Banka Transferi">Banka Transferi</SelectItem>
                    <SelectItem value="Çek">Çek</SelectItem>
                    <SelectItem value="Kredi Kartı">Kredi Kartı</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Notlar</Label>
                <Textarea value={movForm.notes} onChange={e => setMovForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowMovementForm(false)}>İptal</Button>
              <Button
                onClick={handleSaveMovement}
                disabled={saving || !movForm.partner_id || !movForm.amount}
                className={movForm.movement_type === 'income' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
              >
                {saving ? 'Kaydediliyor...' : movForm.movement_type === 'income' ? 'Giriş Kaydet' : 'Çıkış Kaydet'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
