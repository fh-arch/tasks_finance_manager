import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AmountDisplay } from '@/components/shared/AmountDisplay'
import { DocAttachButton } from '@/components/shared/DocAttachButton'
import { formatDate } from '@/lib/utils'
import {
  Plus, Users, Pencil, Trash2, UserCheck, GraduationCap,
  Wallet, Award, Inbox, CheckCircle2, Circle, ChevronLeft, ChevronRight, ListChecks, CalendarDays, FolderOpen, ChevronDown,
} from 'lucide-react'
import { AttendanceTab } from './AttendanceTab'

type Personnel = {
  id: string; user_id: string; name: string; type: 'employee' | 'freelance'
  position: string | null; notes: string | null; is_active: boolean
  base_salary: number; base_bonus: number; hire_date: string | null
  termination_date: string | null; created_at: string
}
type Payment = {
  id: string; personnel_id: string; payment_type: 'salary' | 'bonus' | 'freelance'
  amount: number; payment_date: string; period_month: number | null; period_year: number | null
  description: string | null; notes: string | null
}

const PAYMENT_TYPE_LABELS = { salary: 'Maaş', bonus: 'Prim', freelance: 'Serbest' }
const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
const TAB_PAYROLL = 'payroll'
const TAB_HISTORY = 'history'
const TAB_STAFF = 'staff'
const TAB_PUANTAJ = 'puantaj'
const TAB_FREELANCE = 'freelance_tab'

function trFmt(n: number) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2 }).format(n)
}

export function PersonnelPage() {
  const now = new Date()
  const [personnel, setPersonnel] = useState<Personnel[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'payroll' | 'history' | 'staff' | 'puantaj' | 'freelance_tab'>(TAB_PAYROLL)

  const [payrollMonth, setPayrollMonth] = useState(now.getMonth() + 1)
  const [payrollYear, setPayrollYear] = useState(now.getFullYear())

  const [showPersonForm, setShowPersonForm] = useState(false)
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null)
  const [editingPerson, setEditingPerson] = useState<Personnel | null>(null)
  const [showPayForm, setShowPayForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [markingId, setMarkingId] = useState<string | null>(null)

  const [personForm, setPersonForm] = useState({
    name: '', type: 'employee' as 'employee' | 'freelance',
    position: '', base_salary: '', base_bonus: '', hire_date: '', termination_date: '', notes: '',
  })
  const [payForm, setPayForm] = useState({
    personnel_id: '',
    payment_type: 'freelance' as 'salary' | 'bonus' | 'freelance',
    amount: '',
    payment_date: now.toISOString().slice(0, 10),
    period_month: String(now.getMonth() + 1),
    period_year: String(now.getFullYear()),
    description: '',
    notes: '',
  })

  const fetchAll = async () => {
    const [p, py] = await Promise.all([
      supabase.from('personnel').select('*').eq('is_active', true).order('name'),
      supabase.from('personnel_payments').select('*').order('payment_date', { ascending: false }),
    ])
    setPersonnel((p.data ?? []) as Personnel[])
    setPayments((py.data ?? []) as Payment[])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  // ─── Payroll helpers ───────────────────────────────────────────
  const monthPayments = payments.filter(
    p => p.period_month === payrollMonth && p.period_year === payrollYear
  )
  const isPaid = (personnelId: string, type: 'salary' | 'bonus') =>
    monthPayments.some(p => p.personnel_id === personnelId && p.payment_type === type)

  // Seçili ay için aktif olan personeller (işe giriş yapılmış, işten çıkış yoksa veya çıkış tarihi o aydan sonra)
  const activeInMonth = (person: Personnel) => {
    const monthEnd = new Date(payrollYear, payrollMonth, 0) // last day of month
    if (person.hire_date) {
      const hd = new Date(person.hire_date + 'T00:00:00')
      if (hd > monthEnd) return false // henüz işe girmemiş
    }
    if (person.termination_date) {
      const td = new Date(person.termination_date + 'T00:00:00')
      const monthStart = new Date(payrollYear, payrollMonth - 1, 1)
      if (td < monthStart) return false // o ay başlamadan önce ayrılmış
    }
    return true
  }

  const prevMonth = () => {
    if (payrollMonth === 1) { setPayrollMonth(12); setPayrollYear(y => y - 1) }
    else setPayrollMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (payrollMonth === 12) { setPayrollMonth(1); setPayrollYear(y => y + 1) }
    else setPayrollMonth(m => m + 1)
  }

  const handleMarkPaid = async (person: Personnel, type: 'salary' | 'bonus') => {
    if (isPaid(person.id, type)) return
    setMarkingId(person.id + type)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setMarkingId(null); return }

    const amount = type === 'salary' ? person.base_salary : person.base_bonus
    if (!amount || amount === 0) { setMarkingId(null); return }

    const today = now.toISOString().slice(0, 10)
    const label = `${PAYMENT_TYPE_LABELS[type]}: ${person.name} (${MONTHS[payrollMonth - 1]} ${payrollYear})`

    await Promise.all([
      supabase.from('personnel_payments').insert({
        user_id: user.id, personnel_id: person.id, payment_type: type,
        amount, payment_date: today,
        period_month: payrollMonth, period_year: payrollYear,
        description: label,
      }),
      supabase.from('transactions').insert({
        user_id: user.id, type: 'expense', amount,
        description: label,
        transaction_date: today, status: 'completed', currency: 'TRY',
      }),
    ])
    setMarkingId(null)
    fetchAll()
  }

  // ─── Person form ───────────────────────────────────────────────
  const openPersonForm = (p: Personnel | null) => {
    setEditingPerson(p)
    setPersonForm({
      name: p?.name ?? '', type: p?.type ?? 'employee',
      position: p?.position ?? '',
      base_salary: p?.base_salary ? String(p.base_salary) : '',
      base_bonus: p?.base_bonus ? String(p.base_bonus) : '',
      hire_date: p?.hire_date ?? '',
      termination_date: p?.termination_date ?? '',
      notes: p?.notes ?? '',
    })
    setShowPersonForm(true)
  }

  const handleSavePerson = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const payload: Record<string, unknown> = {
      user_id: user.id,
      name: personForm.name,
      type: personForm.type,
      position: personForm.position || null,
      notes: personForm.notes || null,
      base_salary: parseFloat(personForm.base_salary.replace(',', '.')) || 0,
      base_bonus: parseFloat(personForm.base_bonus.replace(',', '.')) || 0,
    }
    if (personForm.hire_date) payload.hire_date = personForm.hire_date
    if (personForm.termination_date) payload.termination_date = personForm.termination_date

    let err: any = null
    if (editingPerson) {
      const { error } = await supabase.from('personnel').update(payload).eq('id', editingPerson.id)
      err = error
    } else {
      const { error } = await supabase.from('personnel').insert(payload)
      err = error
    }
    setSaving(false)
    if (err) {
      alert(`Kayıt hatası: ${err.message}`)
      return
    }
    setShowPersonForm(false)
    fetchAll()
  }

  const handleDeletePerson = async (id: string) => {
    if (!window.confirm('Bu personel silinecek. Emin misiniz?')) return
    await supabase.from('personnel').update({ is_active: false }).eq('id', id)
    fetchAll()
  }

  // ─── Manual pay form ───────────────────────────────────────────
  const handleSavePayment = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const amount = parseFloat(payForm.amount)
    const person = personnel.find(p => p.id === payForm.personnel_id)
    const label = `${PAYMENT_TYPE_LABELS[payForm.payment_type]}: ${person?.name ?? ''}${payForm.description ? ' — ' + payForm.description : ''}`

    await Promise.all([
      supabase.from('personnel_payments').insert({
        user_id: user.id, personnel_id: payForm.personnel_id, payment_type: payForm.payment_type,
        amount, payment_date: payForm.payment_date,
        period_month: parseInt(payForm.period_month) || null,
        period_year: parseInt(payForm.period_year) || null,
        description: payForm.description || null, notes: payForm.notes || null,
      }),
      supabase.from('transactions').insert({
        user_id: user.id, type: 'expense', amount, description: label,
        transaction_date: payForm.payment_date, status: 'completed', currency: 'TRY',
      }),
    ])
    setSaving(false); setShowPayForm(false)
    setPayForm(f => ({ ...f, amount: '', description: '', notes: '', personnel_id: '' }))
    fetchAll()
  }

  const handleDeletePayment = async (id: string) => {
    if (!window.confirm('Bu ödeme silinecek?')) return
    await supabase.from('personnel_payments').delete().eq('id', id)
    fetchAll()
  }

  // ─── KPI ──────────────────────────────────────────────────────
  const activePersonnel = personnel.filter(activeInMonth)
  const totalSalaryBudget = activePersonnel.reduce((s, p) => s + Number(p.base_salary), 0)
  const totalBonusBudget = activePersonnel.reduce((s, p) => s + Number(p.base_bonus), 0)
  const totalPaidThisMonth = monthPayments.reduce((s, p) => s + Number(p.amount), 0)

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
          <h1 className="text-2xl font-bold text-gray-900">Personel Ödemeleri</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{personnel.length} aktif personel</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => openPersonForm(null)} className="gap-1.5">
            <Users className="h-4 w-4" /> Personel Ekle
          </Button>
          {tab === TAB_HISTORY && (
            <Button onClick={() => setShowPayForm(true)} disabled={personnel.length === 0} className="gap-1.5">
              <Plus className="h-4 w-4" /> Manuel Ödeme
            </Button>
          )}
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="kpi-card">
          <div className="kpi-icon bg-blue-50 mb-3"><Users className="h-5 w-5 text-blue-600" /></div>
          <p className="text-xs text-muted-foreground mb-1">Personel</p>
          <p className="text-xl font-bold">{activePersonnel.filter(p => p.type === 'employee').length} + {activePersonnel.filter(p => p.type === 'freelance').length}</p>
          <p className="text-[10px] text-muted-foreground">{MONTHS[payrollMonth - 1]} — çalışan + serbest</p>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-blue-50 mb-3"><Wallet className="h-5 w-5 text-blue-600" /></div>
          <p className="text-xs text-muted-foreground mb-1">Aylık Maaş Bütçesi</p>
          <AmountDisplay amount={totalSalaryBudget} negative={totalSalaryBudget > 0} className="text-xl font-bold" />
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-amber-50 mb-3"><Award className="h-5 w-5 text-amber-600" /></div>
          <p className="text-xs text-muted-foreground mb-1">Aylık Prim Bütçesi</p>
          <AmountDisplay amount={totalBonusBudget} negative={totalBonusBudget > 0} className="text-xl font-bold" />
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-emerald-50 mb-3"><CheckCircle2 className="h-5 w-5 text-emerald-600" /></div>
          <p className="text-xs text-muted-foreground mb-1">{MONTHS[payrollMonth - 1]} Ödenen</p>
          <AmountDisplay amount={totalPaidThisMonth} negative={totalPaidThisMonth > 0} className="text-xl font-bold" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/50 gap-1">
        {([
          { key: TAB_PAYROLL, label: 'Aylık Bordro', icon: ListChecks },
          { key: TAB_FREELANCE, label: 'Serbest Çalışanlar', icon: GraduationCap },
          { key: TAB_HISTORY, label: 'Ödeme Geçmişi', icon: Wallet },
          { key: TAB_STAFF, label: 'Personel Listesi', icon: Users },
          { key: TAB_PUANTAJ, label: 'Puantaj', icon: CalendarDays },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* ── TAB: PAYROLL ── */}
      {tab === TAB_PAYROLL && (
        <div className="space-y-4">
          {/* Month nav */}
          <div className="flex items-center justify-between bg-white rounded-2xl border border-border/50 shadow-sm px-5 py-3">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <ChevronLeft className="h-5 w-5 text-muted-foreground" />
            </button>
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">{MONTHS[payrollMonth - 1]} {payrollYear}</p>
              <p className="text-xs text-muted-foreground">
                {monthPayments.length} ödeme · {trFmt(totalPaidThisMonth)} ödendi
              </p>
            </div>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          {personnel.length === 0 ? (
            <div className="text-center py-14 bg-white rounded-2xl border border-border/50">
              <Users className="h-10 w-10 text-muted-foreground/25 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Henüz personel eklenmedi.</p>
              <Button variant="outline" className="mt-3 gap-1.5" onClick={() => openPersonForm(null)}>
                <Plus className="h-4 w-4" /> Personel Ekle
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-border/40">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Personel</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Standart Maaş</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Maaş Ödendi</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Standart Prim</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Prim Ödendi</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Toplam</th>
                  </tr>
                </thead>
                <tbody>
                  {personnel.filter(activeInMonth).map(person => {
                    const salaryPaid = isPaid(person.id, 'salary')
                    const bonusPaid = isPaid(person.id, 'bonus')
                    const markingSalary = markingId === person.id + 'salary'
                    const markingBonus = markingId === person.id + 'bonus'
                    const paidTotal = monthPayments
                      .filter(p => p.personnel_id === person.id)
                      .reduce((s, p) => s + Number(p.amount), 0)

                    return (
                      <tr key={person.id} className="border-b border-border/40 hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 ${person.type === 'freelance' ? 'bg-violet-500' : 'bg-blue-500'}`}>
                              {person.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">{person.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {person.type === 'freelance' ? 'Serbest Öğretmen' : (person.position || 'Çalışan')}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Salary */}
                        <td className="px-5 py-3.5 text-right">
                          {Number(person.base_salary) > 0
                            ? <span className="font-medium">{trFmt(Number(person.base_salary))}</span>
                            : <span className="text-muted-foreground text-xs">—</span>
                          }
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex justify-center">
                            {Number(person.base_salary) > 0 ? (
                              <button
                                onClick={() => handleMarkPaid(person, 'salary')}
                                disabled={salaryPaid || markingSalary}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                                  salaryPaid
                                    ? 'bg-emerald-50 text-emerald-700 cursor-default'
                                    : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-700 cursor-pointer'
                                }`}
                              >
                                {salaryPaid
                                  ? <><CheckCircle2 className="h-3.5 w-3.5" /> Ödendi</>
                                  : markingSalary
                                    ? <span className="h-3.5 w-3.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                                    : <><Circle className="h-3.5 w-3.5" /> Öde</>
                                }
                              </button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>

                        {/* Bonus */}
                        <td className="px-5 py-3.5 text-right">
                          {Number(person.base_bonus) > 0
                            ? <span className="font-medium">{trFmt(Number(person.base_bonus))}</span>
                            : <span className="text-muted-foreground text-xs">—</span>
                          }
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex justify-center">
                            {Number(person.base_bonus) > 0 ? (
                              <button
                                onClick={() => handleMarkPaid(person, 'bonus')}
                                disabled={bonusPaid || markingBonus}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                                  bonusPaid
                                    ? 'bg-amber-50 text-amber-700 cursor-default'
                                    : 'bg-gray-100 text-gray-600 hover:bg-amber-50 hover:text-amber-700 cursor-pointer'
                                }`}
                              >
                                {bonusPaid
                                  ? <><CheckCircle2 className="h-3.5 w-3.5" /> Ödendi</>
                                  : markingBonus
                                    ? <span className="h-3.5 w-3.5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                                    : <><Circle className="h-3.5 w-3.5" /> Öde</>
                                }
                              </button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>

                        <td className="px-5 py-3.5 text-right">
                          {paidTotal > 0
                            ? <AmountDisplay amount={paidTotal} negative className="font-bold" />
                            : <span className="text-xs text-muted-foreground">Ödenmedi</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-border/40">
                  <tr>
                    <td className="px-5 py-3 font-semibold text-sm text-gray-700" colSpan={2}>Toplam Bütçe</td>
                    <td className="px-5 py-3 text-right font-bold">
                      <AmountDisplay amount={totalSalaryBudget} negative={totalSalaryBudget > 0} />
                    </td>
                    <td />
                    <td className="px-5 py-3 text-right font-bold">
                      <AmountDisplay amount={totalBonusBudget} negative={totalBonusBudget > 0} />
                    </td>
                    <td className="px-5 py-3 text-right font-bold">
                      <AmountDisplay amount={totalPaidThisMonth} negative={totalPaidThisMonth > 0} />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: HISTORY ── */}
      {tab === TAB_HISTORY && (
        <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-border/40">
              <tr>
                {['Tarih', 'Personel', 'Tür', 'Dönem', 'Açıklama', 'Tutar', 'Dekont', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-14 text-center">
                    <Inbox className="h-10 w-10 text-muted-foreground/25 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Ödeme kaydı yok</p>
                  </td>
                </tr>
              )}
              {payments.map(pay => {
                const person = personnel.find(p => p.id === pay.personnel_id)
                return (
                  <tr key={pay.id} className="border-b border-border/40 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{formatDate(pay.payment_date)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${person?.type === 'freelance' ? 'bg-violet-500' : 'bg-blue-500'}`}>
                          {(person?.name ?? '?').charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium">{person?.name ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full ${
                        pay.payment_type === 'salary' ? 'bg-blue-50 text-blue-700'
                        : pay.payment_type === 'bonus' ? 'bg-amber-50 text-amber-700'
                        : 'bg-violet-50 text-violet-700'
                      }`}>
                        {PAYMENT_TYPE_LABELS[pay.payment_type]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {pay.period_month && pay.period_year ? `${MONTHS[pay.period_month - 1]} ${pay.period_year}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 max-w-[160px]">
                      <p className="text-sm truncate text-muted-foreground">{pay.description ?? '—'}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <AmountDisplay amount={pay.amount} negative className="font-semibold" />
                    </td>
                    <td className="px-4 py-2.5">
                      <DocAttachButton relatedType="personnel_payment" relatedId={pay.id} />
                    </td>
                    <td className="px-4 py-2.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeletePayment(pay.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TAB: STAFF ── */}
      {tab === TAB_STAFF && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {personnel.length === 0 && (
            <div className="col-span-3 text-center py-14">
              <Users className="h-10 w-10 text-muted-foreground/25 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Personel eklenmedi</p>
            </div>
          )}
          {personnel.map(p => (
            <div key={p.id} className="bg-white rounded-2xl border border-border/50 shadow-sm p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold text-white ${p.type === 'freelance' ? 'bg-violet-500' : 'bg-blue-500'}`}>
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.type === 'freelance' ? 'Serbest Öğretmen' : (p.position || 'Çalışan')}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openPersonForm(p)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => handleDeletePerson(p.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="bg-blue-50/60 rounded-xl px-3 py-2">
                  <p className="text-[10px] text-blue-600 font-medium mb-0.5">Sabit Maaş</p>
                  <p className="text-sm font-bold text-blue-700">{Number(p.base_salary) > 0 ? trFmt(Number(p.base_salary)) : '—'}</p>
                </div>
                <div className="bg-amber-50/60 rounded-xl px-3 py-2">
                  <p className="text-[10px] text-amber-600 font-medium mb-0.5">Standart Prim</p>
                  <p className="text-sm font-bold text-amber-700">{Number(p.base_bonus) > 0 ? trFmt(Number(p.base_bonus)) : '—'}</p>
                </div>
              </div>
              {(p.hire_date || p.termination_date) && (
                <div className="mt-2 space-y-0.5">
                  {p.hire_date && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      Giriş: {new Date(p.hire_date + 'T00:00:00').toLocaleDateString('tr-TR')}
                    </p>
                  )}
                  {p.termination_date && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      Çıkış: {new Date(p.termination_date + 'T00:00:00').toLocaleDateString('tr-TR')}
                    </p>
                  )}
                </div>
              )}
              {p.notes && <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{p.notes}</p>}

              {/* İşe Giriş Belgeleri */}
              <div className="mt-3 border-t border-border/30 pt-2.5">
                <button
                  onClick={() => setExpandedDocId(expandedDocId === p.id ? null : p.id)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors w-full"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  İşe Giriş Belgeleri
                  <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${expandedDocId === p.id ? 'rotate-180' : ''}`} />
                </button>
                {expandedDocId === p.id && (
                  <div className="mt-2 space-y-1.5">
                    {[
                      { key: 'kimlik_on', label: 'Nüfus Cüzdanı Ön Yüz' },
                      { key: 'kimlik_arka', label: 'Nüfus Cüzdanı Arka Yüz' },
                      { key: 'sozlesme', label: 'İşe Alım Sözleşmesi' },
                      { key: 'sgk', label: 'SGK İşe Giriş Bildirimi' },
                      { key: 'saglik', label: 'Sağlık Belgesi' },
                      { key: 'ikametgah', label: 'İkametgah Belgesi' },
                      { key: 'sabika', label: 'Sabıka Kaydı' },
                    ].map(doc => (
                      <div key={doc.key} className="flex items-center justify-between bg-gray-50 rounded-lg px-2.5 py-1.5">
                        <span className="text-xs text-gray-600">{doc.label}</span>
                        <DocAttachButton
                          relatedType="personnel_hire"
                          relatedId={`${p.id}_${doc.key}`}
                          label="Yükle"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── TAB: PUANTAJ ── */}
      {tab === TAB_PUANTAJ && <AttendanceTab personnel={personnel} />}

      {/* ── TAB: FREELANCE ── */}
      {tab === TAB_FREELANCE && (() => {
        const freelancers = personnel.filter(p => p.type === 'freelance')
        const monthStart = new Date(payrollYear, payrollMonth - 1, 1)
        const monthEnd = new Date(payrollYear, payrollMonth, 0)
        const monthStr = `${payrollYear}-${String(payrollMonth).padStart(2,'0')}`

        const freelancePayments = payments.filter(p => {
          const person = personnel.find(pe => pe.id === p.personnel_id)
          if (!person || person.type !== 'freelance') return false
          return p.period_year === payrollYear && p.period_month === payrollMonth
        })

        const totalFreelance = freelancePayments.reduce((s, p) => s + Number(p.amount), 0)

        return (
          <div className="space-y-4">
            {/* Month nav */}
            <div className="flex items-center justify-between bg-white rounded-2xl border border-border/50 shadow-sm px-5 py-3">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <ChevronLeft className="h-5 w-5 text-muted-foreground" />
              </button>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{MONTHS[payrollMonth - 1]} {payrollYear}</p>
                <p className="text-xs text-muted-foreground">
                  {freelancers.length} serbest çalışan · {trFmt(totalFreelance)} ödendi
                </p>
              </div>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            {freelancers.length === 0 ? (
              <div className="text-center py-14 bg-white rounded-2xl border border-border/50">
                <GraduationCap className="h-10 w-10 text-muted-foreground/25 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Serbest çalışan eklenmedi.</p>
                <Button variant="outline" className="mt-3 gap-1.5" onClick={() => {
                  setPersonForm(f => ({ ...f, type: 'freelance' }))
                  openPersonForm(null)
                }}>
                  <Plus className="h-4 w-4" /> Serbest Çalışan Ekle
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {freelancers.map(person => {
                  const personPayments = freelancePayments.filter(p => p.personnel_id === person.id)
                  const personTotal = personPayments.reduce((s, p) => s + Number(p.amount), 0)
                  return (
                    <div key={person.id} className="bg-white rounded-2xl border border-violet-100 shadow-sm overflow-hidden">
                      {/* Person header */}
                      <div className="flex items-center justify-between px-5 py-3.5 bg-violet-50/50 border-b border-violet-100">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-violet-500 flex items-center justify-center text-white font-bold text-sm">
                            {person.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">{person.name}</p>
                            <p className="text-xs text-muted-foreground">{person.position || 'Serbest Çalışan'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {personTotal > 0 && (
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Bu Ay Ödenen</p>
                              <AmountDisplay amount={personTotal} negative className="text-sm font-bold" />
                            </div>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 h-8 text-xs border-violet-200 text-violet-700 hover:bg-violet-50"
                            onClick={() => {
                              setPayForm(f => ({
                                ...f,
                                personnel_id: person.id,
                                payment_type: 'freelance',
                                period_month: String(payrollMonth),
                                period_year: String(payrollYear),
                                amount: '',
                                description: '',
                              }))
                              setShowPayForm(true)
                            }}
                          >
                            <Plus className="h-3.5 w-3.5" /> Ödeme Ekle
                          </Button>
                        </div>
                      </div>

                      {/* Payments for this month */}
                      {personPayments.length === 0 ? (
                        <div className="px-5 py-4 text-xs text-muted-foreground italic">
                          {MONTHS[payrollMonth - 1]} ayında henüz ödeme kaydedilmedi
                        </div>
                      ) : (
                        <table className="w-full text-sm">
                          <tbody>
                            {personPayments.map(pay => (
                              <tr key={pay.id} className="border-b border-border/30 last:border-0 hover:bg-violet-50/20 transition-colors">
                                <td className="px-5 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                                  {pay.payment_date ? pay.payment_date.slice(0, 10) : '—'}
                                </td>
                                <td className="px-5 py-2.5 text-xs font-medium text-gray-700">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-700 mr-2">
                                    {PAYMENT_TYPE_LABELS[pay.payment_type]}
                                  </span>
                                  {pay.description || '—'}
                                </td>
                                <td className="px-5 py-2.5 text-right">
                                  <AmountDisplay amount={pay.amount} negative className="font-semibold text-sm" />
                                </td>
                                <td className="px-5 py-2.5 w-16">
                                  <div className="flex items-center gap-0.5 justify-end">
                                    <DocAttachButton relatedType="personnel_payment" relatedId={pay.id} />
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeletePayment(pay.id)}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Person Form Dialog ── */}
      {showPersonForm && (
        <Dialog open onOpenChange={() => setShowPersonForm(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{editingPerson ? 'Personel Düzenle' : 'Yeni Personel'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Ad Soyad *</Label>
                <Input value={personForm.name} onChange={e => setPersonForm(f => ({ ...f, name: e.target.value }))} placeholder="Ad Soyad" />
              </div>
              <div className="space-y-1.5">
                <Label>Tür</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(['employee', 'freelance'] as const).map(t => (
                    <button
                      key={t} type="button"
                      onClick={() => setPersonForm(f => ({ ...f, type: t }))}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                        personForm.type === t
                          ? t === 'freelance' ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-border text-muted-foreground hover:border-gray-300'
                      }`}
                    >
                      {t === 'employee' ? <><UserCheck className="h-4 w-4" /> Çalışan</> : <><GraduationCap className="h-4 w-4" /> Serbest Öğretmen</>}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Pozisyon / Ders</Label>
                <Input value={personForm.position} onChange={e => setPersonForm(f => ({ ...f, position: e.target.value }))} placeholder={personForm.type === 'freelance' ? 'İngilizce, Matematik...' : 'Muhasebe, Sekreter...'} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Sabit Maaş (₺)</Label>
                  <Input type="number" value={personForm.base_salary} onChange={e => setPersonForm(f => ({ ...f, base_salary: e.target.value }))} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label>Standart Prim (₺)</Label>
                  <Input type="number" value={personForm.base_bonus} onChange={e => setPersonForm(f => ({ ...f, base_bonus: e.target.value }))} placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>İşe Giriş Tarihi</Label>
                  <Input type="date" value={personForm.hire_date} onChange={e => setPersonForm(f => ({ ...f, hire_date: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>İşten Çıkış Tarihi</Label>
                  <Input type="date" value={personForm.termination_date} onChange={e => setPersonForm(f => ({ ...f, termination_date: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notlar</Label>
                <Textarea value={personForm.notes} onChange={e => setPersonForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPersonForm(false)}>İptal</Button>
              <Button onClick={handleSavePerson} disabled={saving || !personForm.name}>Kaydet</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Manual Pay Form ── */}
      {showPayForm && (
        <Dialog open onOpenChange={() => setShowPayForm(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Manuel Ödeme Ekle</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Personel *</Label>
                <Select value={payForm.personnel_id} onValueChange={v => {
                  const p = personnel.find(x => x.id === v)
                  setPayForm(f => ({ ...f, personnel_id: v, payment_type: p?.type === 'freelance' ? 'freelance' : 'salary' }))
                }}>
                  <SelectTrigger><SelectValue placeholder="Personel seçin" /></SelectTrigger>
                  <SelectContent>
                    {personnel.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.type === 'freelance' ? '🎓' : '👤'} {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tür</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['salary', 'bonus', 'freelance'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setPayForm(f => ({ ...f, payment_type: t }))}
                      className={`py-2 rounded-xl border-2 text-xs font-semibold transition-all ${
                        payForm.payment_type === t
                          ? t === 'salary' ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : t === 'bonus' ? 'border-amber-500 bg-amber-50 text-amber-700'
                            : 'border-violet-500 bg-violet-50 text-violet-700'
                          : 'border-border text-muted-foreground'
                      }`}
                    >{PAYMENT_TYPE_LABELS[t]}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Tutar (₺) *</Label><Input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Tarih</Label><Input type="date" value={payForm.payment_date} onChange={e => setPayForm(f => ({ ...f, payment_date: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Dönem Ay</Label>
                  <Select value={payForm.period_month} onValueChange={v => setPayForm(f => ({ ...f, period_month: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Dönem Yıl</Label>
                  <Select value={payForm.period_year} onValueChange={v => setPayForm(f => ({ ...f, period_year: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{[2024,2025,2026,2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5"><Label>Açıklama</Label><Input value={payForm.description} onChange={e => setPayForm(f => ({ ...f, description: e.target.value }))} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPayForm(false)}>İptal</Button>
              <Button onClick={handleSavePayment} disabled={saving || !payForm.personnel_id || !payForm.amount}>
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
