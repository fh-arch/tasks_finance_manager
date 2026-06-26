import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, FileText, ArrowDownCircle,
  ArrowUpCircle, RefreshCw, Receipt, FolderOpen, BarChart3, Settings, LogOut,
  Zap, X, UserCheck, CalendarCheck, Waves, Bot, UserCog, Users2, CheckSquare, TrendingDown, Landmark,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

const navGroups = [
  {
    label: 'Genel',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/cash-flow', icon: Waves, label: 'Nakit Akışı' },
      { to: '/contacts', icon: Users, label: 'Cari Hesaplar' },
      { to: '/transactions', icon: Receipt, label: 'İşlemler' },
    ],
  },
  {
    label: 'Finans',
    items: [
      { to: '/receivables', icon: ArrowDownCircle, label: 'Alacaklar' },
      { to: '/payables', icon: ArrowUpCircle, label: 'Borçlar' },
      { to: '/expenses', icon: TrendingDown, label: 'Giderler' },
      { to: '/quotes', icon: FileText, label: 'Teklifler' },
      { to: '/tahsilat', icon: Landmark, label: 'Tahsilat' },
      { to: '/reconciliation', icon: RefreshCw, label: 'Mutabakat' },
    ],
  },
  {
    label: 'Yönetim',
    items: [
      { to: '/period-closings', icon: CalendarCheck, label: 'Dönem Kapatma' },
      { to: '/partners', icon: UserCheck, label: 'Ortaklar' },
      { to: '/personnel', icon: UserCog, label: 'Personel Ödemeleri' },
      { to: '/leads', icon: Users2, label: 'Müşteri Adayları' },
      { to: '/tasks', icon: CheckSquare, label: 'Görevler' },
    ],
  },
  {
    label: 'Diğer',
    items: [
      { to: '/ai-assistant', icon: Bot, label: 'AI Asistan' },
      { to: '/documents', icon: FolderOpen, label: 'Belgeler' },
      { to: '/reports', icon: BarChart3, label: 'Raporlar' },
      { to: '/settings', icon: Settings, label: 'Ayarlar' },
    ],
  },
]

interface SidebarProps { onClose?: () => void }

export function Sidebar({ onClose }: SidebarProps) {
  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <aside className="w-60 flex flex-col h-screen" style={{ background: '#091832' }}>
      {/* Logo */}
      <div className="p-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center shadow-lg"
              style={{ background: 'linear-gradient(135deg, #00cfc3, #00a89d)' }}>
              <Zap className="h-4.5 w-4.5 text-white" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-tight" style={{ color: '#fff' }}>HAFA Finance</h1>
              <p className="text-[10px]" style={{ color: '#4a7096' }}>Finansal Yönetim</p>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="lg:hidden p-1 rounded-lg transition-colors" style={{ color: '#4a7096' }}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {navGroups.map(group => (
          <div key={group.label}>
            <p className="nav-group-label">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) => cn('sidebar-link', isActive && 'active')}
                  onClick={onClose}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Divider + logout */}
      <div className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <button
          onClick={handleLogout}
          className="sidebar-link w-full transition-colors"
          style={{ color: '#4a7096' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f05a28'; (e.currentTarget as HTMLElement).style.background = 'rgba(240,90,40,0.08)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#4a7096'; (e.currentTarget as HTMLElement).style.background = '' }}
        >
          <LogOut className="h-4 w-4" />
          Çıkış Yap
        </button>
      </div>
    </aside>
  )
}
