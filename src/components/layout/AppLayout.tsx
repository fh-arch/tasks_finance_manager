import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/contacts': 'Cari Hesaplar',
  '/quotes': 'Teklifler',
  '/subscriptions': 'Abonelikler',
  '/receivables': 'Alacaklar',
  '/payables': 'Borçlar',
  '/reconciliation': 'Mutabakat',
  '/transactions': 'İşlemler',
  '/documents': 'Belgeler',
  '/reports': 'Raporlar',
  '/settings': 'Ayarlar',
}

export function AppLayout() {
  const location = useLocation()
  const title = pageTitles[location.pathname] ?? 'Lattice Finance'
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen" style={{ background: 'hsl(240 20% 98%)' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — hidden off-screen on mobile, visible on lg+ */}
      <div className={`
        fixed lg:static inset-y-0 left-0 z-30 lg:z-auto
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar title={title} onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
