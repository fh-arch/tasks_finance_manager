import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Category } from '@/types'
import { useAppStore } from '@/store/useAppStore'
import { requestDriveToken, getOrCreateFolder } from '@/lib/googleDrive'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, User, Tag, TrendingUp, TrendingDown, Image, Upload, X, HardDrive, FolderOpen, CheckCircle2 } from 'lucide-react'

export function SettingsPage() {
  const profile = useAppStore((s) => s.profile)
  const setProfile = useAppStore((s) => s.setProfile)
  const [form, setForm] = useState({
    full_name: '',
    company_name: '',
    currency: 'TRY',
    company_address: '',
    company_phone: '',
    company_email: '',
    company_tax_no: '',
  })
  const [categories, setCategories] = useState<Category[]>([])
  const [newCat, setNewCat] = useState({ name: '', type: 'income', color: '#3b82f6' })
  const [saving, setSaving] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [driveFolderId, setDriveFolderId] = useState('')
  const [driveConnecting, setDriveConnecting] = useState(false)
  const [driveSuccess, setDriveSuccess] = useState(false)
  const googleClientId = (import.meta as any).env.VITE_GOOGLE_CLIENT_ID ?? ''

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name ?? '',
        company_name: profile.company_name ?? '',
        currency: profile.currency,
        company_address: (profile as any).company_address ?? '',
        company_phone: (profile as any).company_phone ?? '',
        company_email: (profile as any).company_email ?? '',
        company_tax_no: (profile as any).company_tax_no ?? '',
      })
      setLogoUrl(profile.logo_url ?? null)
      setDriveFolderId((profile as any).google_drive_folder_id ?? '')
    }
    supabase.from('categories').select('*').order('type').then(({ data }) => setCategories(data ?? []))
  }, [profile])

  const saveProfile = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('profiles').upsert({
      id: user.id,
      full_name: form.full_name || null,
      company_name: form.company_name || null,
      currency: form.currency,
      logo_url: logoUrl,
      company_address: form.company_address || null,
      company_phone: form.company_phone || null,
      company_email: form.company_email || null,
      company_tax_no: form.company_tax_no || null,
    }).select().single()
    if (data) setProfile(data)
    setSaving(false)
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoUploading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLogoUploading(false); return }

    const ext = file.name.split('.').pop()
    const path = `${user.id}/logo.${ext}`

    // Remove old if exists
    await supabase.storage.from('company-logos').remove([path])

    const { error } = await supabase.storage.from('company-logos').upload(path, file, { upsert: true })
    if (!error) {
      const { data: urlData } = supabase.storage.from('company-logos').getPublicUrl(path)
      const url = urlData.publicUrl + `?t=${Date.now()}`
      setLogoUrl(url)
      await supabase.from('profiles').update({ logo_url: url }).eq('id', user.id)
      const updated = { ...profile, logo_url: url } as any
      setProfile(updated)
    }
    setLogoUploading(false)
    e.target.value = ''
  }

  const handleRemoveLogo = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').update({ logo_url: null }).eq('id', user.id)
    setLogoUrl(null)
    setProfile({ ...profile!, logo_url: null })
  }

  const addCategory = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !newCat.name) return
    const { data } = await supabase.from('categories').insert({ user_id: user.id, ...newCat }).select().single()
    if (data) { setCategories((p) => [...p, data]); setNewCat({ name: '', type: 'income', color: '#3b82f6' }) }
  }

  const deleteCategory = async (id: string) => {
    await supabase.from('categories').delete().eq('id', id)
    setCategories((p) => p.filter((c) => c.id !== id))
  }

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleDriveConnect = async () => {
    setDriveConnecting(true)
    setDriveSuccess(false)
    try {
      const token = await requestDriveToken()
      const folderName = (import.meta as any).env.VITE_DRIVE_FOLDER_NAME ?? 'edunovatech_lattice finance'
      const folderId = await getOrCreateFolder(folderName, token)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('profiles').update({ google_drive_folder_id: folderId }).eq('id', user.id)
      // Profili Supabase'den yeniden çek, state tutarlı kalsın
      const { data: freshProfile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (freshProfile) setProfile(freshProfile)
      setDriveFolderId(folderId)
      setDriveSuccess(true)
    } catch (err: any) {
      alert(`Drive bağlantı hatası: ${err.message}`)
    }
    setDriveConnecting(false)
  }

  const handleDriveSaveManual = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').update({ google_drive_folder_id: driveFolderId || null }).eq('id', user.id)
    setProfile({ ...profile!, google_drive_folder_id: driveFolderId || null } as any)
  }

  const handleDriveDisconnect = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').update({ google_drive_folder_id: null }).eq('id', user.id)
    setDriveFolderId('')
    setProfile({ ...profile!, google_drive_folder_id: null } as any)
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ayarlar</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Profil ve uygulama tercihlerini düzenleyin</p>
      </div>

      {/* Logo Card */}
      <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border/40 bg-gradient-to-r from-gray-50 to-white">
          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
            <Image className="h-4 w-4 text-violet-600" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Şirket Logosu</h2>
          <p className="text-xs text-muted-foreground ml-1">— Teklif ve mutabakat PDF'lerinde görünür</p>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-6">
            {/* Preview */}
            <div className="flex-shrink-0 w-40 h-24 rounded-xl border-2 border-dashed border-border bg-gray-50 flex items-center justify-center overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain p-2" />
              ) : (
                <div className="text-center">
                  <Image className="h-8 w-8 text-muted-foreground/30 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">Logo yok</p>
                </div>
              )}
            </div>
            {/* Actions */}
            <div className="space-y-3">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                className="hidden"
                onChange={handleLogoUpload}
              />
              <Button
                variant="outline"
                onClick={() => logoInputRef.current?.click()}
                disabled={logoUploading}
                className="gap-2 w-full"
              >
                <Upload className="h-4 w-4" />
                {logoUploading ? 'Yükleniyor...' : logoUrl ? 'Logoyu Değiştir' : 'Logo Yükle'}
              </Button>
              {logoUrl && (
                <Button variant="ghost" size="sm" onClick={handleRemoveLogo} className="gap-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 w-full">
                  <X className="h-3.5 w-3.5" /> Logoyu Kaldır
                </Button>
              )}
              <p className="text-xs text-muted-foreground">PNG, JPG, WebP veya SVG · Maks 2 MB</p>
            </div>
          </div>
        </div>
      </div>

      {/* Profile card */}
      <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border/40 bg-gradient-to-r from-gray-50 to-white">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <User className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Profil & Şirket Bilgileri</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Ad Soyad</Label>
              <Input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Şirket / Firma Adı</Label>
              <Input value={form.company_name} onChange={(e) => set('company_name', e.target.value)} placeholder="Şirket adı" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Adres</Label>
            <Input value={form.company_address} onChange={(e) => set('company_address', e.target.value)} placeholder="Şirket adresi" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Telefon</Label>
              <Input value={form.company_phone} onChange={(e) => set('company_phone', e.target.value)} placeholder="+90 xxx xxx xx xx" />
            </div>
            <div className="space-y-1.5">
              <Label>E-posta</Label>
              <Input value={form.company_email} onChange={(e) => set('company_email', e.target.value)} placeholder="info@sirket.com" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Vergi No / TC No</Label>
              <Input value={form.company_tax_no} onChange={(e) => set('company_tax_no', e.target.value)} placeholder="1234567890" />
            </div>
            <div className="space-y-1.5">
              <Label>Para Birimi</Label>
              <Select value={form.currency} onValueChange={(v) => set('currency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRY">₺ TRY</SelectItem>
                  <SelectItem value="USD">$ USD</SelectItem>
                  <SelectItem value="EUR">€ EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={saveProfile} disabled={saving} className="mt-2">
            {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
          </Button>
        </div>
      </div>

      {/* Google Drive card */}
      <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border/40 bg-gradient-to-r from-gray-50 to-white">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
            <HardDrive className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Google Drive Entegrasyonu</h2>
            <p className="text-xs text-muted-foreground">Belge yüklemelerini doğrudan Drive klasörüne gönder</p>
          </div>
          {driveFolderId && (
            <span className="ml-auto flex items-center gap-1 text-xs text-emerald-600 font-medium bg-emerald-50 px-2.5 py-1 rounded-full">
              <CheckCircle2 className="h-3 w-3" /> Bağlı
            </span>
          )}
        </div>
        <div className="p-6 space-y-4">
          {!googleClientId && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800 space-y-1">
              <p className="font-semibold">Kurulum gerekiyor</p>
              <p className="text-xs">Google Drive entegrasyonu için <code className="bg-amber-100 px-1 rounded">VITE_GOOGLE_CLIENT_ID</code> değerini <code className="bg-amber-100 px-1 rounded">.env</code> dosyasına ekleyin.</p>
              <p className="text-xs mt-2">Adımlar: Google Cloud Console → API &amp; Services → Credentials → OAuth 2.0 Client ID (Web application) → Authorized JS Origins: <code className="bg-amber-100 px-1 rounded">https://tasks.hafadanismanlik.com</code></p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Hedef Klasör ID</Label>
            <div className="flex gap-2">
              <Input
                value={driveFolderId}
                onChange={(e) => setDriveFolderId(e.target.value)}
                placeholder="Drive klasör ID'sini buraya yapıştırın"
                className="font-mono text-xs"
              />
              <Button variant="outline" onClick={handleDriveSaveManual} disabled={!driveFolderId} className="flex-shrink-0">
                Kaydet
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Drive'da klasörü açın → URL'den klasör ID'sini kopyalayın (drive.google.com/drive/folders/<strong>ID_BURASI</strong>)
            </p>
          </div>

          {driveSuccess && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-2 text-sm text-emerald-700 font-medium">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              Google Drive bağlandı — dosyalar "edunovatech_lattice finance" klasörüne kaydedilecek
            </div>
          )}

          {googleClientId && (
            <div className="flex gap-2">
              <Button
                onClick={handleDriveConnect}
                disabled={driveConnecting}
                className={`gap-2 flex-1 ${driveFolderId ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
              >
                <HardDrive className="h-4 w-4" />
                {driveConnecting ? 'Bağlanıyor...' : driveFolderId ? 'Drive Bağlı — Yeniden Bağla' : 'Google Drive Bağla'}
              </Button>
              {driveFolderId && (
                <Button variant="ghost" onClick={handleDriveDisconnect} className="gap-1.5 text-red-500 hover:text-red-700 hover:bg-red-50">
                  <X className="h-3.5 w-3.5" /> Bağlantıyı Kes
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Categories card */}
      <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border/40 bg-gradient-to-r from-gray-50 to-white">
          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
            <Tag className="h-4 w-4 text-violet-600" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Kategoriler</h2>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex gap-2">
            <Input
              placeholder="Kategori adı"
              value={newCat.name}
              onChange={(e) => setNewCat((p) => ({ ...p, name: e.target.value }))}
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && addCategory()}
            />
            <Select value={newCat.type} onValueChange={(v) => setNewCat((p) => ({ ...p, type: v }))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="income">Gelir</SelectItem>
                <SelectItem value="expense">Gider</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <input
                type="color"
                value={newCat.color}
                onChange={(e) => setNewCat((p) => ({ ...p, color: e.target.value }))}
                className="h-10 w-10 rounded-lg border border-border cursor-pointer p-1"
                title="Renk seç"
              />
            </div>
            <Button onClick={addCategory} disabled={!newCat.name} className="gap-1">
              <Plus className="h-4 w-4" /> Ekle
            </Button>
          </div>
          <div className="space-y-5">
            {(['income', 'expense'] as const).map((type) => {
              const filtered = categories.filter((c) => c.type === type)
              return (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center ${type === 'income' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                      {type === 'income'
                        ? <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                        : <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
                    </div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {type === 'income' ? 'Gelir Kategorileri' : 'Gider Kategorileri'}
                    </p>
                    <span className="ml-auto text-xs text-muted-foreground">{filtered.length} kategori</span>
                  </div>
                  {filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground pl-8">Henüz kategori eklenmedi</p>
                  ) : (
                    <div className="flex flex-wrap gap-2 pl-2">
                      {filtered.map((c) => (
                        <div key={c.id} className="group flex items-center gap-1.5 bg-gray-50 border border-border/50 rounded-full px-3 py-1.5 transition-colors hover:border-red-200 hover:bg-red-50/30">
                          <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.color ?? '#888' }} />
                          <span className="text-sm font-medium text-gray-700">{c.name}</span>
                          <button onClick={() => deleteCategory(c.id)} className="text-muted-foreground/40 hover:text-red-500 transition-colors ml-1 opacity-0 group-hover:opacity-100">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
