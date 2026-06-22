import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoginPage } from '@/pages/Auth/LoginPage'
import { DashboardPage } from '@/pages/Dashboard'
import { ContactsPage } from '@/pages/Contacts'
import { ContactDetailPage } from '@/pages/Contacts/ContactDetail'
import { QuotesPage } from '@/pages/Quotes'
import { SubscriptionsPage } from '@/pages/Subscriptions'
import { ReceivablesPage } from '@/pages/Receivables'
import { PayablesPage } from '@/pages/Payables'
import { ReconciliationPage } from '@/pages/Reconciliation'
import { ReconciliationDetail } from '@/pages/Reconciliation/ReconciliationDetail'
import { TransactionsPage } from '@/pages/Transactions'
import { DocumentsPage } from '@/pages/Documents'
import { ReportsPage } from '@/pages/Reports'
import { SettingsPage } from '@/pages/Settings'
import { PartnersPage } from '@/pages/Partners'
import { PeriodClosingsPage } from '@/pages/PeriodClosings'
import { CashFlowPage } from '@/pages/CashFlow'
import { AIAssistantPage } from '@/pages/AIAssistant'
import { PersonnelPage } from '@/pages/Personnel'
import { LeadsPage } from '@/pages/Leads'
import { TasksPage } from '@/pages/Tasks'

const queryClient = new QueryClient()

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(false)
  const setProfile = useAppStore((s) => s.setProfile)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthed(!!session)
      setReady(true)
      if (session?.user) {
        supabase.from('profiles').select('*').eq('id', session.user.id).single().then(({ data }) => {
          if (data) setProfile(data)
        })
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session)
      if (session?.user) {
        supabase.from('profiles').select('*').eq('id', session.user.id).single().then(({ data }) => {
          if (data) setProfile(data)
        })
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [setProfile])

  if (!ready) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-muted-foreground">Yükleniyor...</div>
  if (!authed) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<AuthGuard><AppLayout /></AuthGuard>}>
            <Route index element={<DashboardPage />} />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="contacts/:id" element={<ContactDetailPage />} />
            <Route path="quotes" element={<QuotesPage />} />
            <Route path="subscriptions" element={<SubscriptionsPage />} />
            <Route path="receivables" element={<ReceivablesPage />} />
            <Route path="payables" element={<PayablesPage />} />
            <Route path="reconciliation" element={<ReconciliationPage />} />
            <Route path="reconciliation/:id" element={<ReconciliationDetail />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="partners" element={<PartnersPage />} />
            <Route path="period-closings" element={<PeriodClosingsPage />} />
            <Route path="cash-flow" element={<CashFlowPage />} />
            <Route path="ai-assistant" element={<AIAssistantPage />} />
            <Route path="personnel" element={<PersonnelPage />} />
            <Route path="leads" element={<LeadsPage />} />
            <Route path="tasks" element={<TasksPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
