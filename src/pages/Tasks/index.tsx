import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  Plus, CheckSquare, Pencil, Trash2, Circle, CheckCircle2, Clock3,
  AlertCircle, User2, Building2, Calendar, Timer, TrendingUp, TrendingDown, BarChart3, ChevronLeft, ChevronRight, Download,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

function exportReportPdf(
  tab: 'personnel' | 'contact',
  monthLabel: string,
  groups: { name: string; tasks: Task[] }[]
) {
  const colName = tab === 'personnel' ? 'Personel' : 'Cari'
  const accentColor = tab === 'personnel' ? '#3b82f6' : '#7c3aed'

  const groupRows = groups.map(group => {
    const taskRows = group.tasks.map(t => {
      const est = t.estimated_hours != null ? `${t.estimated_hours}s` : '—'
      const act = t.actual_hours != null
        ? `${t.actual_hours}s`
        : (t.estimated_hours != null ? '✓ zamanında' : '—')
      const diff = t.estimated_hours != null && t.actual_hours != null
        ? `(${t.actual_hours > t.estimated_hours ? '+' : ''}${(t.actual_hours - t.estimated_hours).toFixed(1)}s)`
        : ''
      const overRun = t.estimated_hours != null && t.actual_hours != null && t.actual_hours > t.estimated_hours
      const secondCol = tab === 'personnel' ? (t.contact_name ?? '—') : (t.personnel_name ?? '—')
      const secondLabel = tab === 'personnel' ? 'Cari' : 'Personel'
      return `<tr>
        <td style="padding:5px 8px">${t.title}</td>
        <td style="padding:5px 8px;color:#6b7280">${secondCol}</td>
        <td style="padding:5px 8px;text-align:center;color:#6b7280">${est}</td>
        <td style="padding:5px 8px;text-align:center;font-weight:600;color:${overRun ? '#ef4444' : '#10b981'}">${act} <span style="font-weight:400;font-size:9pt;color:#9ca3af">${diff}</span></td>
      </tr>`
    }).join('')

    const totalEst = group.tasks.reduce((s, t) => s + (t.estimated_hours ?? 0), 0)
    const totalAct = group.tasks.reduce((s, t) => s + (t.actual_hours ?? t.estimated_hours ?? 0), 0)
    const overTotal = totalEst > 0 && totalAct > totalEst

    return `
    <div style="margin-bottom:20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <div style="background:${accentColor}15;border-bottom:2px solid ${accentColor}30;padding:8px 12px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:700;font-size:11pt;color:${accentColor}">${group.name}</span>
        <span style="font-size:9pt;color:#374151">${group.tasks.length} görev${totalEst > 0 ? ` &nbsp;·&nbsp; Tahmini: ${totalEst}s` : ''}${totalAct > 0 ? ` &nbsp;·&nbsp; <span style="font-weight:700;color:${overTotal ? '#ef4444' : '#10b981'}">Gerçek: ${totalAct.toFixed(1)}s</span>` : ''}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:9pt">
        <thead>
          <tr style="background:#f9fafb;border-bottom:1px solid #e5e7eb">
            <th style="padding:5px 8px;text-align:left;font-weight:600;color:#374151">Görev</th>
            <th style="padding:5px 8px;text-align:left;font-weight:600;color:#374151">${tab === 'personnel' ? 'Cari' : 'Personel'}</th>
            <th style="padding:5px 8px;text-align:center;font-weight:600;color:#374151">Tahmini</th>
            <th style="padding:5px 8px;text-align:center;font-weight:600;color:#374151">Gerçek</th>
          </tr>
        </thead>
        <tbody>${taskRows}</tbody>
      </table>
    </div>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>Görev Raporu - ${monthLabel}</title>
<style>
  * { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 0; box-sizing: border-box; }
  body { padding: 28px; color: #111; font-size: 10pt; }
  h1 { font-size: 16pt; font-weight: 700; color: #1e1b4b; margin-bottom: 4px; }
  .subtitle { font-size: 10pt; color: #6b7280; margin-bottom: 20px; }
  .section-title { font-size: 12pt; font-weight: 700; color: #374151; margin: 18px 0 10px; padding-bottom: 4px; border-bottom: 2px solid ${accentColor}; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
  <h1>Görev Raporu</h1>
  <div class="subtitle">${monthLabel} · ${colName} Bazlı · ${groups.reduce((s, g) => s + g.tasks.length, 0)} tamamlanan görev</div>
  ${groupRows || '<p style="color:#9ca3af;text-align:center;padding:30px">Bu dönemde tamamlanan görev yok</p>'}
</body>
</html>`

  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) { alert('Pop-up engellendi. Tarayıcı ayarlarından pop-up\'a izin verin.'); return }
  win.document.write(html)
  win.document.close()
  setTimeout(() => win.print(), 500)
}

type Task = {
  id: string
  title: string
  description: string | null
  status: 'todo' | 'in_progress' | 'done'
  priority: 'low' | 'normal' | 'high'
  due_date: string | null
  estimated_hours: number | null
  actual_hours: number | null
  completed_at: string | null
  assigned_to_personnel_id: string | null
  assigned_to_contact_id: string | null
  created_at: string
  personnel_name?: string | null
  contact_name?: string | null
}

type Personnel = { id: string; name: string; type: string; termination_date: string | null }
type Contact = { id: string; name: string }

const STATUS_CONFIG = {
  todo:        { label: 'Yapılacak',    icon: Circle,       color: 'text-gray-300 hover:text-emerald-400',  bg: 'bg-gray-50 text-gray-700 border-gray-200' },
  in_progress: { label: 'Devam Ediyor', icon: Clock3,       color: 'text-blue-400 hover:text-emerald-500',  bg: 'bg-blue-50 text-blue-700 border-blue-200' },
  done:        { label: 'Tamamlandı',   icon: CheckCircle2, color: 'text-emerald-500 hover:text-gray-400',  bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

const PRIORITY_CONFIG = {
  low:    { label: 'Düşük',  color: 'text-gray-400' },
  normal: { label: 'Normal', color: 'text-blue-500' },
  high:   { label: 'Yüksek', color: 'text-red-500' },
}

const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']

const emptyForm = {
  title: '', description: '', status: 'todo' as const, priority: 'normal' as const,
  due_date: '', estimated_hours: '', assigned_to_personnel_id: '', assigned_to_contact_id: '',
}

type FilterType = 'all' | 'todo' | 'in_progress' | 'done'
type AssigneeFilter = 'all' | 'personnel' | 'contact'
type ReportTab = 'personnel' | 'contact'

function trFmt(n: number) {
  return `${n % 1 === 0 ? n : n.toFixed(1)} saat`
}

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [personnel, setPersonnel] = useState<Personnel[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<FilterType>('all')
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>('all')

  // task form
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  // completion dialog
  const [completingTask, setCompletingTask] = useState<Task | null>(null)
  const [onTime, setOnTime] = useState<boolean | null>(null)
  const [actualHoursInput, setActualHoursInput] = useState('')
  const [completingSaving, setCompletingSaving] = useState(false)

  // monthly report
  const [showReport, setShowReport] = useState(false)
  const [reportTab, setReportTab] = useState<ReportTab>('personnel')
  const now = new Date()
  const [reportYear, setReportYear] = useState(now.getFullYear())
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1)
  const [reportTasks, setReportTasks] = useState<Task[]>([])
  const [reportLoading, setReportLoading] = useState(false)

  const fetchAll = async () => {
    const [t, p, c] = await Promise.all([
      supabase.from('tasks')
        .select('*, personnel:assigned_to_personnel_id(name), contacts:assigned_to_contact_id(name)')
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('personnel').select('id,name,type,termination_date').order('name'),
      supabase.from('contacts').select('id,name').eq('is_active', true).order('name'),
    ])
    setTasks((t.data ?? []).map((x: any) => ({
      ...x, personnel_name: x.personnel?.name ?? null, contact_name: x.contacts?.name ?? null,
    })))
    const today = new Date().toISOString().slice(0, 10)
    setPersonnel(((p.data ?? []) as Personnel[]).filter(p => !p.termination_date || p.termination_date >= today))
    setContacts((c.data ?? []) as Contact[])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  // ── Report fetch ──────────────────────────────────────────────────────────
  const fetchReport = async () => {
    setReportLoading(true)
    const start = `${reportYear}-${String(reportMonth).padStart(2, '0')}-01`
    const lastDay = new Date(reportYear, reportMonth, 0).getDate()
    const end = `${reportYear}-${String(reportMonth).padStart(2, '0')}-${lastDay}`
    const { data } = await supabase
      .from('tasks')
      .select('*, personnel:assigned_to_personnel_id(name), contacts:assigned_to_contact_id(name)')
      .eq('status', 'done')
      .gte('completed_at', `${start}T00:00:00`)
      .lte('completed_at', `${end}T23:59:59`)
      .order('completed_at')
    setReportTasks((data ?? []).map((x: any) => ({
      ...x, personnel_name: x.personnel?.name ?? null, contact_name: x.contacts?.name ?? null,
    })))
    setReportLoading(false)
  }

  useEffect(() => { if (showReport) fetchReport() }, [showReport, reportYear, reportMonth])

  // ── Form helpers ──────────────────────────────────────────────────────────
  const openForm = (task?: Task) => {
    if (task) {
      setEditing(task)
      setForm({
        title: task.title,
        description: task.description ?? '',
        status: task.status as typeof emptyForm.status,
        priority: task.priority as typeof emptyForm.priority,
        due_date: task.due_date ?? '',
        estimated_hours: task.estimated_hours != null ? String(task.estimated_hours) : '',
        assigned_to_personnel_id: task.assigned_to_personnel_id ?? '',
        assigned_to_contact_id: task.assigned_to_contact_id ?? '',
      })
    } else {
      setEditing(null)
      setForm(emptyForm)
    }
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const payload: Record<string, unknown> = {
      user_id: user.id,
      title: form.title.trim(),
      description: form.description || null,
      status: form.status,
      priority: form.priority,
      due_date: form.due_date || null,
      estimated_hours: form.estimated_hours ? parseFloat(form.estimated_hours.replace(',', '.')) : null,
      assigned_to_personnel_id: form.assigned_to_personnel_id || null,
      assigned_to_contact_id: form.assigned_to_contact_id || null,
      updated_at: new Date().toISOString(),
    }
    let err: any = null
    if (editing) {
      const { error } = await supabase.from('tasks').update(payload).eq('id', editing.id)
      err = error
    } else {
      const { error } = await supabase.from('tasks').insert(payload)
      err = error
    }
    setSaving(false)
    if (err) { alert(`Kayıt hatası: ${err.message}`); return }
    setShowForm(false)
    fetchAll()
  }

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`"${title}" silinecek. Emin misiniz?`)) return
    await supabase.from('tasks').delete().eq('id', id)
    fetchAll()
  }

  // Sol ikona tıklama: done ise todo'ya döner, değilse tamamlama diyaloğu
  const handleStatusClick = (task: Task) => {
    if (task.status === 'done') {
      supabase.from('tasks').update({
        status: 'todo', actual_hours: null, completed_at: null, updated_at: new Date().toISOString(),
      }).eq('id', task.id).then(() => {
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'todo', actual_hours: null, completed_at: null } : t))
      })
    } else {
      setCompletingTask(task)
      setOnTime(null)
      setActualHoursInput('')
    }
  }

  const handleCompleteConfirm = async () => {
    if (!completingTask || onTime === null) return
    setCompletingSaving(true)
    const actualH = onTime
      ? (completingTask.estimated_hours ?? null)
      : (actualHoursInput ? parseFloat(actualHoursInput.replace(',', '.')) : null)
    const { error } = await supabase.from('tasks').update({
      status: 'done',
      actual_hours: actualH,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', completingTask.id)
    setCompletingSaving(false)
    if (error) { alert(`Hata: ${error.message}`); return }
    setCompletingTask(null)
    fetchAll()
  }

  // ── Report helpers ────────────────────────────────────────────────────────
  const navMonth = (dir: -1 | 1) => {
    let m = reportMonth + dir
    let y = reportYear
    if (m > 12) { m = 1; y++ }
    if (m < 1)  { m = 12; y-- }
    setReportMonth(m)
    setReportYear(y)
  }

  // Group by personnel
  const byPersonnel = (() => {
    const map = new Map<string, { name: string; tasks: Task[] }>()
    reportTasks.filter(t => t.assigned_to_personnel_id).forEach(t => {
      const key = t.assigned_to_personnel_id!
      if (!map.has(key)) map.set(key, { name: t.personnel_name ?? key, tasks: [] })
      map.get(key)!.tasks.push(t)
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  })()

  // Group by contact
  const byContact = (() => {
    const map = new Map<string, { name: string; tasks: Task[] }>()
    reportTasks.filter(t => t.assigned_to_contact_id).forEach(t => {
      const key = t.assigned_to_contact_id!
      if (!map.has(key)) map.set(key, { name: t.contact_name ?? key, tasks: [] })
      map.get(key)!.tasks.push(t)
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  })()

  // ── Render ────────────────────────────────────────────────────────────────
  const filtered = tasks.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    if (assigneeFilter === 'personnel' && !t.assigned_to_personnel_id) return false
    if (assigneeFilter === 'contact' && !t.assigned_to_contact_id) return false
    return true
  })

  const today = new Date().toISOString().slice(0, 10)
  const counts = { todo: 0, in_progress: 0, done: 0 }
  tasks.forEach(t => { counts[t.status]++ })

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
          <h1 className="text-2xl font-bold text-gray-900">Görev Listesi</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{tasks.length} görev listeleniyor</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowReport(true)} className="gap-1.5">
            <BarChart3 className="h-4 w-4" /> Aylık Rapor
          </Button>
          <Button onClick={() => openForm()} className="gap-1.5">
            <Plus className="h-4 w-4" /> Yeni Görev
          </Button>
        </div>
      </div>

      {/* Status KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {(Object.keys(STATUS_CONFIG) as Array<keyof typeof STATUS_CONFIG>).map(s => {
          const cfg = STATUS_CONFIG[s]
          const Icon = cfg.icon
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
              className={`bg-white rounded-2xl border p-4 text-left shadow-sm hover:shadow-md transition-all ${statusFilter === s ? 'ring-2 ring-indigo-400 border-indigo-200' : 'border-border/50'}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`h-4 w-4 ${cfg.color.split(' ')[0]}`} />
                <span className="text-xs font-medium text-muted-foreground">{cfg.label}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{counts[s]}</p>
            </button>
          )
        })}
      </div>

      {/* Assignee filter */}
      <div className="flex gap-2">
        {(['all', 'personnel', 'contact'] as AssigneeFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setAssigneeFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              assigneeFilter === f ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {f === 'all' ? 'Tümü' : f === 'personnel' ? 'Personel Görevleri' : 'Cari Görevleri'}
          </button>
        ))}
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <CheckSquare className="h-12 w-12 text-muted-foreground/25 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Görev bulunamadı</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => {
            const statusCfg = STATUS_CONFIG[task.status]
            const StatusIcon = statusCfg.icon
            const isOverdue = task.due_date && task.due_date < today && task.status !== 'done'
            const overRun = task.actual_hours != null && task.estimated_hours != null && task.actual_hours > task.estimated_hours

            return (
              <div
                key={task.id}
                className={`bg-white rounded-xl border shadow-sm p-4 flex items-start gap-3 hover:shadow-md transition-shadow ${task.status === 'done' ? 'opacity-70' : ''}`}
              >
                {/* Complete button */}
                <button
                  onClick={() => handleStatusClick(task)}
                  className="mt-0.5 flex-shrink-0 transition-colors"
                  title={task.status === 'done' ? 'Geri al' : 'Tamamlandı olarak işaretle'}
                >
                  <StatusIcon className={`h-5 w-5 ${statusCfg.color}`} />
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <p className={`text-sm font-semibold text-gray-900 ${task.status === 'done' ? 'line-through text-gray-400' : ''}`}>
                      {task.title}
                    </p>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${statusCfg.bg}`}>
                      {statusCfg.label}
                    </span>
                    {task.priority === 'high' && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-500">
                        <AlertCircle className="h-3 w-3" /> Yüksek
                      </span>
                    )}
                  </div>
                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    {task.personnel_name && (
                      <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                        <User2 className="h-3 w-3" /> {task.personnel_name}
                      </span>
                    )}
                    {task.contact_name && (
                      <span className="inline-flex items-center gap-1 text-xs text-violet-600">
                        <Building2 className="h-3 w-3" /> {task.contact_name}
                      </span>
                    )}
                    {task.due_date && (
                      <span className={`inline-flex items-center gap-1 text-xs ${isOverdue ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
                        <Calendar className="h-3 w-3" />
                        {isOverdue ? 'Gecikti · ' : ''}{formatDate(task.due_date)}
                      </span>
                    )}
                    {task.estimated_hours != null && (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                        <Timer className="h-3 w-3" /> {trFmt(task.estimated_hours)} tahmini
                      </span>
                    )}
                    {task.status === 'done' && task.actual_hours != null && (
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${overRun ? 'text-red-500' : 'text-emerald-600'}`}>
                        {overRun ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {trFmt(task.actual_hours)} gerçek
                        {task.estimated_hours != null && (
                          <span className="text-[10px] opacity-70">
                            ({overRun ? '+' : '-'}{Math.abs(task.actual_hours - task.estimated_hours).toFixed(1)}s)
                          </span>
                        )}
                      </span>
                    )}
                    {task.status === 'done' && task.actual_hours == null && task.estimated_hours != null && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                        <CheckCircle2 className="h-3 w-3" /> Zamanında
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => openForm(task)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => handleDelete(task.id, task.title)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Task Form Dialog ─────────────────────────────────────────────── */}
      {showForm && (
        <Dialog open onOpenChange={() => setShowForm(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editing ? 'Görevi Düzenle' : 'Yeni Görev'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Görev Başlığı <span className="text-red-500">*</span></Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Görev açıklaması..." />
              </div>
              <div className="space-y-1.5">
                <Label>Detay</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Detaylı açıklama..." />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Durum</Label>
                  <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as any }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Öncelik</Label>
                  <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as any }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1"><Timer className="h-3 w-3" /> Tahmini (s)</Label>
                  <div className="relative">
                    <Input type="number" min="0" step="0.5" value={form.estimated_hours} onChange={e => setForm(f => ({ ...f, estimated_hours: e.target.value }))} placeholder="0" className="pr-5" />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">s</span>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Son Tarih</Label>
                <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Personele Ata</Label>
                <Select value={form.assigned_to_personnel_id || 'none'} onValueChange={v => setForm(f => ({ ...f, assigned_to_personnel_id: v === 'none' ? '' : v, assigned_to_contact_id: v !== 'none' ? '' : f.assigned_to_contact_id }))}>
                  <SelectTrigger><SelectValue placeholder="Personel seç..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Atanmadı —</SelectItem>
                    {personnel.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cari Hesaba Ata</Label>
                <Select value={form.assigned_to_contact_id || 'none'} onValueChange={v => setForm(f => ({ ...f, assigned_to_contact_id: v === 'none' ? '' : v, assigned_to_personnel_id: v !== 'none' ? '' : f.assigned_to_personnel_id }))}>
                  <SelectTrigger><SelectValue placeholder="Cari seç..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Atanmadı —</SelectItem>
                    {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[10px] text-muted-foreground">Personel ve cari aynı anda seçilemez — birini seçince diğeri temizlenir.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowForm(false)}>İptal</Button>
              <Button onClick={handleSave} disabled={saving || !form.title.trim()}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Completion Dialog ────────────────────────────────────────────── */}
      {completingTask && (
        <Dialog open onOpenChange={() => setCompletingTask(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" /> İş Bitirme Süresi
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-1">
              <p className="text-sm font-medium text-gray-800">"{completingTask.title}"</p>
              {completingTask.estimated_hours != null && (
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                  <Timer className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-600">Tahmini süre: <strong>{completingTask.estimated_hours} saat</strong></span>
                </div>
              )}
              <div className="space-y-2">
                <Label>Belirlenen sürede tamamlandı mı?</Label>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setOnTime(true); setActualHoursInput('') }}
                    className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                      onTime === true ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    ✓ Evet
                  </button>
                  <button
                    onClick={() => setOnTime(false)}
                    className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                      onTime === false ? 'bg-red-50 border-red-400 text-red-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    ✗ Hayır
                  </button>
                </div>
              </div>
              {onTime === false && (
                <div className="space-y-1.5">
                  <Label>Kaç saatte tamamlandı?</Label>
                  <div className="relative">
                    <Input
                      type="number" min="0" step="0.5"
                      value={actualHoursInput}
                      onChange={e => setActualHoursInput(e.target.value)}
                      placeholder="Gerçek süreyi girin..."
                      className="pr-10"
                      autoFocus
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">saat</span>
                  </div>
                  {completingTask.estimated_hours != null && actualHoursInput && (
                    <p className={`text-xs font-semibold ${parseFloat(actualHoursInput) > completingTask.estimated_hours ? 'text-red-500' : 'text-emerald-600'}`}>
                      {parseFloat(actualHoursInput) > completingTask.estimated_hours
                        ? `⚠ Tahminden ${(parseFloat(actualHoursInput) - completingTask.estimated_hours).toFixed(1)} saat fazla sürdü`
                        : `✓ Tahminden ${(completingTask.estimated_hours - parseFloat(actualHoursInput)).toFixed(1)} saat önce bitti`}
                    </p>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCompletingTask(null)}>İptal</Button>
              <Button
                onClick={handleCompleteConfirm}
                disabled={completingSaving || onTime === null || (onTime === false && !actualHoursInput)}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {completingSaving ? 'Kaydediliyor...' : 'Tamamlandı Kaydet'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Monthly Report Dialog ─────────────────────────────────────────── */}
      {showReport && (
        <Dialog open onOpenChange={() => setShowReport(false)}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <div className="flex items-center justify-between w-full pr-6">
                <DialogTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-indigo-500" /> Aylık Görev Raporu
                </DialogTitle>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 h-8 text-xs"
                  onClick={() => exportReportPdf(
                    reportTab,
                    `${MONTHS[reportMonth - 1]} ${reportYear}`,
                    reportTab === 'personnel' ? byPersonnel : byContact
                  )}
                  disabled={reportLoading}
                >
                  <Download className="h-3.5 w-3.5" /> PDF İndir
                </Button>
              </div>
            </DialogHeader>

            {/* Month nav */}
            <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2">
              <button onClick={() => navMonth(-1)} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-gray-800">{MONTHS[reportMonth - 1]} {reportYear}</span>
              <button onClick={() => navMonth(1)} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Tab switcher */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              <button
                onClick={() => setReportTab('personnel')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium transition-all ${reportTab === 'personnel' ? 'bg-white text-gray-900 shadow-sm' : 'text-muted-foreground'}`}
              >
                <User2 className="h-3.5 w-3.5" /> Personel Bazlı
              </button>
              <button
                onClick={() => setReportTab('contact')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium transition-all ${reportTab === 'contact' ? 'bg-white text-gray-900 shadow-sm' : 'text-muted-foreground'}`}
              >
                <Building2 className="h-3.5 w-3.5" /> Cari Bazlı
              </button>
            </div>

            {/* Report content */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {reportLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-6 w-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                </div>
              ) : (
                <>
                  {reportTab === 'personnel' && (
                    <>
                      {byPersonnel.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-10">Bu ay tamamlanan personel görevi yok</p>
                      ) : byPersonnel.map(group => {
                        const totalEst = group.tasks.reduce((s, t) => s + (t.estimated_hours ?? 0), 0)
                        const totalAct = group.tasks.reduce((s, t) => s + (t.actual_hours ?? t.estimated_hours ?? 0), 0)
                        return (
                          <div key={group.name} className="bg-white rounded-xl border border-border/50 overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50/60 border-b border-blue-100">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                                  {group.name.charAt(0)}
                                </div>
                                <span className="text-sm font-semibold text-blue-800">{group.name}</span>
                              </div>
                              <div className="flex items-center gap-3 text-xs">
                                <span className="text-blue-600">{group.tasks.length} görev</span>
                                {totalEst > 0 && <span className="text-gray-500">Tahmini: {trFmt(totalEst)}</span>}
                                {totalAct > 0 && (
                                  <span className={`font-semibold ${totalAct > totalEst && totalEst > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                    Gerçek: {trFmt(totalAct)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="divide-y divide-border/30">
                              {group.tasks.map(t => (
                                <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                                  <span className="flex-1 text-gray-800">{t.title}</span>
                                  {t.contact_name && (
                                    <span className="text-xs text-violet-500 truncate max-w-[120px]">{t.contact_name}</span>
                                  )}
                                  <div className="flex items-center gap-2 text-xs flex-shrink-0">
                                    {t.estimated_hours != null && <span className="text-gray-400">{trFmt(t.estimated_hours)}</span>}
                                    {t.actual_hours != null && (
                                      <span className={`font-medium ${t.actual_hours > (t.estimated_hours ?? 0) ? 'text-red-500' : 'text-emerald-600'}`}>
                                        → {trFmt(t.actual_hours)}
                                      </span>
                                    )}
                                    {t.actual_hours == null && t.estimated_hours != null && (
                                      <span className="text-emerald-500 font-medium">✓ zamanında</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </>
                  )}

                  {reportTab === 'contact' && (
                    <>
                      {byContact.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-10">Bu ay cariye atanmış tamamlanan görev yok</p>
                      ) : byContact.map(group => {
                        const totalEst = group.tasks.reduce((s, t) => s + (t.estimated_hours ?? 0), 0)
                        const totalAct = group.tasks.reduce((s, t) => s + (t.actual_hours ?? t.estimated_hours ?? 0), 0)
                        return (
                          <div key={group.name} className="bg-white rounded-xl border border-border/50 overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2.5 bg-violet-50/60 border-b border-violet-100">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-violet-500 flex items-center justify-center text-white text-xs font-bold">
                                  {group.name.charAt(0)}
                                </div>
                                <span className="text-sm font-semibold text-violet-800 truncate max-w-[220px]">{group.name}</span>
                              </div>
                              <div className="flex items-center gap-3 text-xs">
                                <span className="text-violet-600">{group.tasks.length} görev</span>
                                {totalEst > 0 && <span className="text-gray-500">Tahmini: {trFmt(totalEst)}</span>}
                                {totalAct > 0 && (
                                  <span className={`font-semibold ${totalAct > totalEst && totalEst > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                    Gerçek: {trFmt(totalAct)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="divide-y divide-border/30">
                              {group.tasks.map(t => (
                                <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                                  <span className="flex-1 text-gray-800">{t.title}</span>
                                  {t.personnel_name && (
                                    <span className="text-xs text-blue-500 truncate max-w-[100px]">{t.personnel_name}</span>
                                  )}
                                  <div className="flex items-center gap-2 text-xs flex-shrink-0">
                                    {t.estimated_hours != null && <span className="text-gray-400">{trFmt(t.estimated_hours)}</span>}
                                    {t.actual_hours != null && (
                                      <span className={`font-medium ${t.actual_hours > (t.estimated_hours ?? 0) ? 'text-red-500' : 'text-emerald-600'}`}>
                                        → {trFmt(t.actual_hours)}
                                      </span>
                                    )}
                                    {t.actual_hours == null && t.estimated_hours != null && (
                                      <span className="text-emerald-500 font-medium">✓ zamanında</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </>
                  )}
                </>
              )}
            </div>

            <div className="pt-2 border-t border-border/40 text-xs text-muted-foreground text-center">
              {reportTasks.length} tamamlanan görev · {MONTHS[reportMonth - 1]} {reportYear}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
