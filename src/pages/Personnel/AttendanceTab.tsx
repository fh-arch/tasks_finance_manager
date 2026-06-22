import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DocAttachButton } from '@/components/shared/DocAttachButton'
import { ChevronLeft, ChevronRight, Download, Save, CheckCircle2, FileText } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'

type Personnel = {
  id: string; name: string; type: string; position: string | null; hire_date: string | null
}
type AttendanceRecord = {
  id?: string
  personnel_id: string
  record_date: string
  status: 'present' | 'sick' | 'absent' | 'leave' | 'weekend'
  entry_time: string
  break_start: string
  break_end: string
  exit_time: string
  hours: number
  notes: string | null
}

const DAYS_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

const STATUS_CFG = {
  present:  { label: 'Çalıştı',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
  sick:     { label: 'Rapor',    cls: 'bg-red-50 text-red-700 border-red-300' },
  leave:    { label: 'İzin',     cls: 'bg-amber-50 text-amber-700 border-amber-300' },
  absent:   { label: 'Devamsız', cls: 'bg-gray-100 text-gray-500 border-gray-300' },
  weekend:  { label: 'Tatil',    cls: 'bg-gray-50 text-gray-300 border-gray-200' },
}

function exportPuantajPdf(
  person: Personnel,
  year: number,
  month: number,
  days: Array<{ dateStr: string; dayNum: number; dayName: string; isWeekend: boolean }>,
  records: Map<string, AttendanceRecord>,
  companyName?: string | null
) {
  const monthName = MONTHS_TR[month - 1]
  const totalHours = days.reduce((s, d) => {
    const r = records.get(d.dateStr)
    if (!r && !d.isWeekend) return s + 8
    if (r?.status === 'present') return s + Number(r.hours ?? 8)
    return s
  }, 0)
  const workDays = days.filter(d => {
    const r = records.get(d.dateStr)
    if (d.isWeekend) return false
    return !r || r.status === 'present'
  }).length
  const sickDays = days.filter(d => records.get(d.dateStr)?.status === 'sick').length
  const leaveDays = days.filter(d => records.get(d.dateStr)?.status === 'leave').length

  const rows = days.map(({ dateStr, dayNum, dayName, isWeekend }) => {
    const rec = records.get(dateStr)
    const status = rec?.status ?? (isWeekend ? 'weekend' : 'present')
    const dateFmt = `${String(dayNum).padStart(2,'0')}.${String(month).padStart(2,'0')}.${year}`
    let cells = ''
    if (isWeekend) {
      cells = `<td></td><td></td><td></td><td></td><td></td><td></td>`
    } else if (status === 'sick') {
      cells = `<td colspan="4" style="text-align:center;color:#c00;font-weight:bold;font-size:8pt">RAPOR</td><td></td><td></td>`
    } else if (status === 'leave') {
      cells = `<td colspan="4" style="text-align:center;color:#b8860b;font-weight:bold;font-size:8pt">İZİN</td><td></td><td></td>`
    } else if (status === 'absent') {
      cells = `<td colspan="4" style="text-align:center;color:#aaa;font-size:8pt">DEVAMSIZ</td><td></td><td></td>`
    } else {
      const e  = (rec?.entry_time  ?? '09:00').replace(':', '.')
      const bs = (rec?.break_start ?? '12:00').replace(':', '.')
      const be = (rec?.break_end   ?? '13:00').replace(':', '.')
      const x  = (rec?.exit_time   ?? '18:00').replace(':', '.')
      const h  = rec?.hours ?? 8
      cells = `<td>${e}-${bs}</td><td>${bs}-${be}</td><td>${x}</td><td></td><td></td><td style="font-weight:bold">${h}</td>`
    }
    const rowStyle = isWeekend ? 'background:#f8f8f8;color:#aaa' : (status === 'sick' ? 'background:#fff5f5' : status === 'leave' ? 'background:#fffde6' : '')
    return `<tr style="${rowStyle}"><td>${dateFmt}</td><td>${dayName}</td>${cells}</tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>Puantaj - ${person.name} - ${monthName} ${year}</title>
<style>
@page { margin: 8mm; size: A4 portrait; }
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,sans-serif;font-size:9pt;color:#000;}
.top{width:100%;border-collapse:collapse;margin-bottom:2px;}
.top td{border:1px solid #000;padding:3px 6px;vertical-align:middle;}
.title{text-align:center;font-weight:bold;font-size:11pt;letter-spacing:0.5px;}
.main{width:100%;border-collapse:collapse;margin-top:4px;}
.main th,.main td{border:1px solid #444;padding:2px 3px;text-align:center;font-size:8pt;}
.main th{background:#eee;font-weight:bold;}
.footer{margin-top:8px;display:flex;justify-content:space-between;gap:12px;}
.sig{flex:1;border:1px solid #000;padding:6px 8px;min-height:50px;font-size:8pt;text-align:center;}
.summary{margin-top:6px;font-size:8pt;display:flex;gap:16px;}
.summary span{padding:2px 8px;background:#f0f0f0;border:1px solid #ddd;}
</style>
</head>
<body>
<table class="top">
<tr>
  <td style="width:60%"><strong>İŞYERİ ÜNVANI:</strong> ${(companyName ?? 'EDUNOVATECH YAZILIM A.Ş.').toUpperCase()}</td>
  <td style="width:40%;text-align:center" class="title">PERSONEL AYLIK PUANTAJ CETVELİ</td>
</tr>
<tr>
  <td><strong>SİCİL NO:</strong></td>
  <td></td>
</tr>
<tr>
  <td><strong>DÖNEMİ:</strong> ${monthName.toUpperCase()} ${year}</td>
  <td></td>
</tr>
<tr>
  <td><strong>PERSONEL ADI SOYADI:</strong> ${person.name.toUpperCase()}</td>
  <td><strong>UNVAN:</strong> ${(person.position ?? (person.type === 'freelance' ? 'SERBEST ÖĞRETMEN' : 'PERSONEL')).toUpperCase()}</td>
</tr>
</table>

<table class="main">
<thead>
<tr>
  <th rowspan="2" style="width:90px">TARİH</th>
  <th rowspan="2" style="width:80px">GÜN</th>
  <th rowspan="2">GİRİŞ SAATİ</th>
  <th rowspan="2">MOLA</th>
  <th rowspan="2">ÇIKIŞ SAATİ</th>
  <th colspan="2">İMZA</th>
  <th rowspan="2" style="width:40px">SAAT<br>TOPLAM</th>
</tr>
<tr>
  <th>PERSONEL</th>
  <th>İŞVEREN</th>
</tr>
</thead>
<tbody>
${rows}
</tbody>
<tfoot>
<tr>
  <td colspan="7" style="text-align:right;font-weight:bold;padding:3px 8px">TOPLAM ÇALIŞMA SAATİ</td>
  <td style="font-weight:bold">${totalHours}</td>
</tr>
</tfoot>
</table>

<div class="summary">
  <span>Çalışılan Gün: <strong>${workDays}</strong></span>
  <span>Rapor: <strong>${sickDays}</strong></span>
  <span>İzin: <strong>${leaveDays}</strong></span>
  <span>Toplam Saat: <strong>${totalHours}</strong></span>
</div>

<div class="footer">
  <div class="sig">
    <div style="font-weight:bold;margin-bottom:4px">PERSONEL İMZASI</div>
    <div style="margin-top:30px;font-size:7pt">${person.name.toUpperCase()}</div>
  </div>
  <div class="sig">
    <div style="font-weight:bold;margin-bottom:4px">YETKİLİ / İŞVEREN İMZASI</div>
    <div style="margin-top:30px;font-size:7pt">${(companyName ?? '').toUpperCase()}</div>
  </div>
</div>
</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) { alert('Pop-up engellendi. Tarayıcı ayarlarından pop-up\'a izin verin.'); return }
  win.document.write(html)
  win.document.close()
  setTimeout(() => win.print(), 500)
}

export function AttendanceTab({ personnel }: { personnel: Personnel[] }) {
  const now = new Date()
  const profile = useAppStore(s => s.profile)
  const [selectedPersonId, setSelectedPersonId] = useState(personnel[0]?.id ?? '')
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [records, setRecords] = useState<Map<string, AttendanceRecord>>(new Map())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const daysInMonth = new Date(year, month, 0).getDate()

  const allDays = Array.from({ length: daysInMonth }, (_, i) => {
    const dayNum = i + 1
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
    const d = new Date(dateStr + 'T00:00:00')
    const dow = d.getDay()
    return { dateStr, dayNum, dayName: DAYS_TR[dow], isWeekend: dow === 0 || dow === 6 }
  })

  const fetchRecords = async () => {
    if (!selectedPersonId) return
    setLoading(true)
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
    const { data } = await supabase.from('attendance_records')
      .select('*').eq('personnel_id', selectedPersonId)
      .gte('record_date', startDate).lte('record_date', endDate)
    const map = new Map<string, AttendanceRecord>()
    ;(data ?? []).forEach((r: any) => map.set(r.record_date, r as AttendanceRecord))
    setRecords(map)
    setLoading(false)
    setDirty(false)
  }

  useEffect(() => { if (selectedPersonId) fetchRecords() }, [selectedPersonId, month, year])
  useEffect(() => { if (!selectedPersonId && personnel.length > 0) setSelectedPersonId(personnel[0].id) }, [personnel])

  const getRecord = (dateStr: string, isWeekend: boolean): AttendanceRecord =>
    records.get(dateStr) ?? {
      personnel_id: selectedPersonId, record_date: dateStr,
      status: isWeekend ? 'weekend' : 'present',
      entry_time: '09:00', break_start: '12:00', break_end: '13:00', exit_time: '18:00', hours: 8, notes: null,
    }

  const updateRecord = (dateStr: string, updates: Partial<AttendanceRecord>) => {
    setRecords(prev => {
      const map = new Map(prev)
      const isWE = allDays.find(d => d.dateStr === dateStr)?.isWeekend ?? false
      map.set(dateStr, { ...getRecord(dateStr, isWE), ...updates })
      return map
    })
    setDirty(true)
  }

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1) } else setMonth(m => m + 1) }

  const handleBulkFill = () => {
    allDays.forEach(({ dateStr, isWeekend }) => {
      if (!isWeekend) updateRecord(dateStr, { status: 'present', entry_time: '09:00', break_start: '12:00', break_end: '13:00', exit_time: '18:00', hours: 8 })
    })
  }

  const handleSave = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const toUpsert = allDays
      .filter(({ dateStr, isWeekend }) => records.has(dateStr) || !isWeekend)
      .map(({ dateStr, isWeekend }) => {
        const r = getRecord(dateStr, isWeekend)
        return { user_id: user.id, personnel_id: selectedPersonId, record_date: dateStr, status: r.status, entry_time: r.entry_time, break_start: r.break_start, break_end: r.break_end, exit_time: r.exit_time, hours: Number(r.hours), notes: r.notes }
      })
    await supabase.from('attendance_records').upsert(toUpsert, { onConflict: 'personnel_id,record_date' })
    setSaving(false); setDirty(false); fetchRecords()
  }

  const handleExportPdf = () => {
    const person = personnel.find(p => p.id === selectedPersonId)
    if (!person) return
    exportPuantajPdf(person, year, month, allDays, records, profile?.company_name)
  }

  const presentCount = allDays.filter(d => { const r = records.get(d.dateStr); return !d.isWeekend && (!r || r.status === 'present') }).length
  const sickCount = allDays.filter(d => records.get(d.dateStr)?.status === 'sick').length
  const leaveCount = allDays.filter(d => records.get(d.dateStr)?.status === 'leave').length
  const absentCount = allDays.filter(d => records.get(d.dateStr)?.status === 'absent').length
  const totalHours = allDays.reduce((s, d) => { const r = records.get(d.dateStr); if (!r && !d.isWeekend) return s + 8; if (r?.status === 'present') return s + Number(r.hours ?? 8); return s }, 0)

  const selectedPerson = personnel.find(p => p.id === selectedPersonId)

  if (personnel.length === 0) return (
    <div className="text-center py-14 bg-white rounded-2xl border border-border/50">
      <p className="text-sm text-muted-foreground">Önce personel ekleyin.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <div className="bg-white rounded-2xl border border-border/50 shadow-sm px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-56">
            <Select value={selectedPersonId} onValueChange={setSelectedPersonId}>
              <SelectTrigger><SelectValue placeholder="Personel seçin" /></SelectTrigger>
              <SelectContent>
                {personnel.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronLeft className="h-4 w-4" /></button>
            <span className="font-bold text-sm w-32 text-center">{MONTHS_TR[month - 1]} {year}</span>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={handleBulkFill} className="gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Tüm İş Günlerini Doldur
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPdf} className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> PDF Puantaj
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !dirty} className="gap-1.5">
              <Save className="h-3.5 w-3.5" /> {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </div>
        </div>

        {/* Person info + hire docs */}
        {selectedPerson && (
          <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="font-semibold text-gray-900">{selectedPerson.name}</span>
              {selectedPerson.position && <span>· {selectedPerson.position}</span>}
              {selectedPerson.hire_date && <span>· İşe Giriş: <span className="font-medium text-gray-700">{new Date(selectedPerson.hire_date + 'T00:00:00').toLocaleDateString('tr-TR')}</span></span>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">İşe Giriş Belgesi:</span>
              <DocAttachButton relatedType="personnel_hire" relatedId={selectedPerson.id} />
            </div>
          </div>
        )}
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: `${presentCount} gün çalışıldı`, cls: 'bg-emerald-50 text-emerald-700' },
          { label: `${sickCount} gün rapor`, cls: 'bg-red-50 text-red-700' },
          { label: `${leaveCount} gün izin`, cls: 'bg-amber-50 text-amber-700' },
          { label: `${absentCount} gün devamsız`, cls: 'bg-gray-100 text-gray-600' },
          { label: `${totalHours} saat toplam`, cls: 'bg-blue-50 text-blue-700' },
        ].map(s => <span key={s.label} className={`text-xs font-semibold px-3 py-1.5 rounded-full ${s.cls}`}>{s.label}</span>)}
        {dirty && <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-orange-50 text-orange-600">Kaydedilmemiş değişiklik var</span>}
      </div>

      {/* Attendance grid */}
      {loading ? (
        <div className="flex justify-center py-10"><div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
      ) : (
        <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-border/40">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide w-24">Tarih</th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide w-24">Gün</th>
                <th className="px-4 py-2.5 text-center font-semibold text-muted-foreground uppercase tracking-wide">Durum</th>
                <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground uppercase tracking-wide w-24">Giriş</th>
                <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground uppercase tracking-wide w-40">Mola</th>
                <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground uppercase tracking-wide w-24">Çıkış</th>
                <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground uppercase tracking-wide w-14">Saat</th>
              </tr>
            </thead>
            <tbody>
              {allDays.map(({ dateStr, dayNum, dayName, isWeekend }) => {
                const rec = getRecord(dateStr, isWeekend)
                const isPresent = rec.status === 'present'
                return (
                  <tr key={dateStr} className={`border-b border-border/30 transition-colors ${isWeekend ? 'bg-gray-50/60' : 'hover:bg-blue-50/20'}`}>
                    <td className={`px-3 py-2 font-mono ${isWeekend ? 'text-gray-400' : 'text-gray-700'}`}>
                      {String(dayNum).padStart(2,'0')}.{String(month).padStart(2,'0')}.{year}
                    </td>
                    <td className={`px-3 py-2 ${isWeekend ? 'text-gray-400' : 'text-gray-600'}`}>{dayName}</td>
                    <td className="px-3 py-2">
                      {isWeekend ? (
                        <div className="flex justify-center">
                          <span className="text-[10px] text-gray-300">Hafta Sonu</span>
                        </div>
                      ) : (
                        <div className="flex justify-center gap-1">
                          {(['present', 'sick', 'leave', 'absent'] as const).map(s => (
                            <button
                              key={s}
                              onClick={() => updateRecord(dateStr, { status: s, hours: s === 'present' ? 8 : 0 })}
                              className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold transition-all ${
                                rec.status === s
                                  ? STATUS_CFG[s].cls + ' shadow-sm'
                                  : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500'
                              }`}
                            >
                              {STATUS_CFG[s].label}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {isPresent && !isWeekend && (
                        <input type="time" value={rec.entry_time}
                          onChange={e => updateRecord(dateStr, { entry_time: e.target.value })}
                          className="w-full text-center text-xs border border-border/50 rounded-lg px-1 py-0.5 focus:outline-none focus:border-primary" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isPresent && !isWeekend && (
                        <div className="flex items-center gap-1">
                          <input type="time" value={rec.break_start}
                            onChange={e => updateRecord(dateStr, { break_start: e.target.value })}
                            className="w-full text-center text-xs border border-border/50 rounded-lg px-1 py-0.5 focus:outline-none focus:border-primary" />
                          <span className="text-gray-300 flex-shrink-0">—</span>
                          <input type="time" value={rec.break_end}
                            onChange={e => updateRecord(dateStr, { break_end: e.target.value })}
                            className="w-full text-center text-xs border border-border/50 rounded-lg px-1 py-0.5 focus:outline-none focus:border-primary" />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {isPresent && !isWeekend && (
                        <input type="time" value={rec.exit_time}
                          onChange={e => updateRecord(dateStr, { exit_time: e.target.value })}
                          className="w-full text-center text-xs border border-border/50 rounded-lg px-1 py-0.5 focus:outline-none focus:border-primary" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {isPresent && !isWeekend && (
                        <input type="number" value={rec.hours} min="0" max="24" step="0.5"
                          onChange={e => updateRecord(dateStr, { hours: Number(e.target.value) })}
                          className="w-full text-center text-xs border border-border/50 rounded-lg px-1 py-0.5 focus:outline-none focus:border-primary font-bold" />
                      )}
                      {rec.status === 'sick'   && <span className="text-[10px] font-bold text-red-500">R</span>}
                      {rec.status === 'leave'  && <span className="text-[10px] font-bold text-amber-500">İ</span>}
                      {rec.status === 'absent' && <span className="text-[10px] font-bold text-gray-400">D</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-border/40">
              <tr>
                <td colSpan={6} className="px-3 py-2 text-right font-bold text-xs text-gray-700">Toplam Çalışma Saati:</td>
                <td className="px-3 py-2 text-center font-bold text-sm text-blue-700">{totalHours}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
