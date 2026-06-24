import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, FileText, CreditCard, ArrowDownCircle,
  ArrowUpCircle, RefreshCw, Receipt, FolderOpen, BarChart3, Settings, LogOut,
  Zap, X, UserCheck, CalendarCheck, Waves, Bot, UserCog, Users2, CheckSquare,
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
      { to: '/quotes', icon: FileText, label: 'Teklifler' },
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
    <aside className="w-60 bg-white border-r border-border/60 flex flex-col h-screen shadow-sm">
      {/* Logo */}
      <div className="p-5 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 leading-tight">Lattice Finance</h1>
              <p className="text-[10px] text-muted-foreground">Finansal Yönetim</p>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="lg:hidden p-1 rounded-lg hover:bg-muted text-muted-foreground">
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

      {/* Logout */}
      <div className="p-3 border-t border-border/40">
        <button
          onClick={handleLogout}
          className="sidebar-link w-full text-red-400 hover:text-red-500 hover:bg-red-50"
        >
          <LogOut className="h-4 w-4" />
          Çıkış Yap
        </button>
      </div>
    </aside>
  )
}
