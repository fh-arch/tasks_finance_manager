import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Eye, EyeOff, Zap, TrendingUp, Shield, BarChart3 } from 'lucide-react'

const FEATURES = [
  { icon: TrendingUp, text: 'Nakit akışı ve finansal raporlar' },
  { icon: BarChart3,  text: 'Cari hesap ve alacak/borç yönetimi' },
  { icon: Shield,     text: 'Personel, görev ve müşteri yönetimi' },
]

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const parseError = (err: unknown): string => {
    if (!err) return 'Bilinmeyen hata oluştu'
    if (typeof err === 'string' && err && err !== '{}') return err
    if (typeof err === 'object') {
      const e = err as Record<string, unknown>
      if (e.message && typeof e.message === 'string' && e.message !== '{}') return e.message
      if (e.error_description) return String(e.error_description)
    }
    return 'Sunucuya bağlanılamadı.'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(parseError(error)); setLoading(false); return }
    navigate('/')
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel ─────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-12"
        style={{ background: '#091832' }}>
        {/* Animated blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="blob blob-3" />
        </div>

        {/* Decorative cyan shapes */}
        <div className="absolute right-0 top-1/4 opacity-15 pointer-events-none">
          <div className="w-48 h-16 rounded-xl" style={{ background: '#00cfc3', transform: 'rotate(-8deg) translateX(30px)' }} />
          <div className="w-48 h-16 rounded-xl mt-4" style={{ background: '#00cfc3', transform: 'rotate(-8deg) translateX(50px)' }} />
          <div className="w-32 h-14 rounded-xl mt-4" style={{ background: '#00cfc3', transform: 'rotate(-8deg) translateX(20px)' }} />
        </div>

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl flex items-center justify-center shadow-lg"
            style={{ background: 'linear-gradient(135deg, #00cfc3, #00a89d)' }}>
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight text-white">HAFA Finance</h1>
            <p className="text-xs" style={{ color: '#4a7096' }}>Finansal Yönetim Platformu</p>
          </div>
        </div>

        {/* Center content */}
        <div className="relative z-10 space-y-8">
          <div className="space-y-3">
            <h2 className="text-white text-4xl font-bold leading-tight">
              İşletmenizi<br />tam kontrol<br />altında tutun.
            </h2>
            <p className="text-base leading-relaxed max-w-xs" style={{ color: '#4a7096' }}>
              Tüm finansal verilerinizi tek bir platformda yönetin.
            </p>
          </div>

          <div className="space-y-3">
            {FEATURES.map(({ icon: Icon, text }, i) => (
              <div
                key={i}
                className="flex items-center gap-3 login-feature-item"
                style={{ animationDelay: `${0.2 + i * 0.1}s` }}
              >
                <div className="h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(0,207,195,0.15)' }}>
                  <Icon className="h-4 w-4" style={{ color: '#00cfc3' }} />
                </div>
                <span className="text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div className="relative z-10">
          <p className="text-xs" style={{ color: '#3d5a7a' }}>© 2026 Hafa Danışmanlık · Tüm hakları saklıdır</p>
        </div>
      </div>

      {/* ── Right panel ────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8" style={{ background: '#eef2f7' }}>
        <div className="w-full max-w-sm login-form-enter">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8 justify-center">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #00cfc3, #091832)' }}>
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold" style={{ color: '#091832' }}>HAFA Finance</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold" style={{ color: '#091832' }}>Hoş geldiniz</h2>
            <p className="text-muted-foreground mt-1 text-sm">Hesabınıza giriş yapın</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">E-posta</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="ornek@sirket.com"
                className="login-input"
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Şifre</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="login-input pr-11"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 rounded-xl px-3.5 py-3 text-sm animate-shake">
                <span className="mt-0.5 flex-shrink-0">⚠</span>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="login-btn"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Giriş yapılıyor...
                </span>
              ) : 'Giriş Yap'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
