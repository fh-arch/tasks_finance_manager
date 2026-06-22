import { useAppStore } from '@/store/useAppStore'
import { Bell, Search, Menu } from 'lucide-react'

interface TopBarProps { title: string; onMenuClick?: () => void }

export function TopBar({ title, onMenuClick }: TopBarProps) {
  const profile = useAppStore((s) => s.profile)
  const initials = profile?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? 'U'

  return (
    <header className="h-16 bg-white border-b border-border/50 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        {/* Hamburger — only on mobile */}
        <button
          onClick={onMenuClick}
          className="lg:hidden h-9 w-9 rounded-xl bg-muted hover:bg-accent flex items-center justify-center text-muted-foreground transition-colors"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div>
          <h2 className="text-base sm:text-lg font-bold text-gray-900">{title}</h2>
          <p className="text-xs text-muted-foreground hidden sm:block">
            {new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button className="h-9 w-9 rounded-xl bg-muted hover:bg-accent hidden sm:flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <Search className="h-4 w-4" />
        </button>
        <button className="h-9 w-9 rounded-xl bg-muted hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <Bell className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 pl-2 border-l border-border/50">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
            {initials}
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-semibold text-gray-900 leading-tight">{profile?.full_name ?? 'Kullanıcı'}</p>
            <p className="text-xs text-muted-foreground">{profile?.company_name ?? ''}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
