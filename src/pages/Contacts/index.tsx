import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { Contact } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AmountDisplay } from '@/components/shared/AmountDisplay'
import { ContactForm } from './ContactForm'
import { Plus, Search, Building2, Trash2, GitBranch, ChevronDown, ChevronRight } from 'lucide-react'

const typeLabels = { customer: 'Müşteri', supplier: 'Tedarikçi', both: 'İkisi' }
const typeVariants = { customer: 'info', supplier: 'warning', both: 'default' } as const

export function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [filtered, setFiltered] = useState<Contact[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [activeFilter, setActiveFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Contact | null>(null)

  const fetchContacts = async () => {
    const { data } = await supabase.from('contacts').select('*').order('name')
    setContacts(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchContacts() }, [])

  useEffect(() => {
    let result = contacts
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(c => c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.phone?.includes(q))
    }
    if (typeFilter !== 'all') result = result.filter(c => c.type === typeFilter)
    if (activeFilter !== 'all') result = result.filter(c => activeFilter === 'active' ? c.is_active : !c.is_active)
    setFiltered(result)
  }, [search, typeFilter, activeFilter, contacts])

  const toggleExpand = (id: string) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const parents = filtered.filter(c => !c.parent_id)
  const childrenOf = (parentId: string) => filtered.filter(c => c.parent_id === parentId)

  const handleSave = () => { setShowForm(false); setEditing(null); fetchContacts() }

  const handleDelete = async (c: Contact) => {
    if (!window.confirm(`"${c.name}" silinecek. Emin misiniz?`)) return
    await supabase.from('contacts').delete().eq('id', c.id)
    fetchContacts()
  }

  if (loading) return <div className="text-muted-foreground py-20 text-center">Yükleniyor...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Ara..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Tür" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm Türler</SelectItem>
            <SelectItem value="customer">Müşteri</SelectItem>
            <SelectItem value="supplier">Tedarikçi</SelectItem>
            <SelectItem value="both">İkisi</SelectItem>
          </SelectContent>
        </Select>
        <Select value={activeFilter} onValueChange={setActiveFilter}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Durum" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tümü</SelectItem>
            <SelectItem value="active">Aktif</SelectItem>
            <SelectItem value="passive">Pasif</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Button onClick={() => { setEditing(null); setShowForm(true) }}>
            <Plus className="h-4 w-4" /> Yeni Cari
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="px-4 py-3 font-medium text-muted-foreground">Ad</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Tür</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Telefon</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Şehir</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Durum</th>
              <th className="px-4 py-3 font-medium text-muted-foreground text-right">Bakiye</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {parents.length === 0 && (
              <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">Kayıt bulunamadı</td></tr>
            )}
            {parents.map((c) => {
              const kids = childrenOf(c.id)
              const isOpen = expanded.has(c.id)
              return (
              <React.Fragment key={c.id}>
              <tr className="border-b hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {kids.length > 0 && (
                      <button onClick={() => toggleExpand(c.id)} className="text-muted-foreground hover:text-foreground">
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    )}
                    <Link to={`/contacts/${c.id}`} className="flex items-center gap-2 font-medium text-blue-600 hover:underline">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      {c.name}
                    </Link>
                    {kids.length > 0 && <span className="text-xs text-muted-foreground ml-1">({kids.length} şube)</span>}
                  </div>
                  {c.email && <p className="text-xs text-muted-foreground ml-5">{c.email}</p>}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={typeVariants[c.type]}>{typeLabels[c.type]}</Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{c.phone ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.city ?? '—'}</td>
                <td className="px-4 py-3">
                  <Badge variant={c.is_active ? 'success' : 'outline'}>{c.is_active ? 'Aktif' : 'Pasif'}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <AmountDisplay
                    amount={Math.abs(c.current_balance)}
                    positive={c.current_balance > 0}
                    negative={c.current_balance < 0}
                  />
                  {c.current_balance !== 0 && (
                    <p className="text-xs text-muted-foreground">{c.current_balance > 0 ? 'Alacaklı' : 'Borçlu'}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(c); setShowForm(true) }}>Düzenle</Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(c)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
              {isOpen && kids.map(kid => (
                <tr key={kid.id} className="border-b bg-blue-50/30 hover:bg-blue-50/60 transition-colors">
                  <td className="px-4 py-2.5 pl-10">
                    <Link to={`/contacts/${kid.id}`} className="flex items-center gap-2 text-blue-600 hover:underline">
                      <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                      {kid.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5"><Badge variant={typeVariants[kid.type]}>{typeLabels[kid.type]}</Badge></td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{kid.phone ?? '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{kid.city ?? '—'}</td>
                  <td className="px-4 py-2.5"><Badge variant={kid.is_active ? 'success' : 'outline'}>{kid.is_active ? 'Aktif' : 'Pasif'}</Badge></td>
                  <td className="px-4 py-2.5 text-right">
                    <AmountDisplay amount={Math.abs(kid.current_balance)} positive={kid.current_balance > 0} negative={kid.current_balance < 0} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { setEditing(kid); setShowForm(true) }}>Düzenle</Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(kid)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              </React.Fragment>
            )})}
          </tbody>
        </table>
      </div>

      {showForm && (
        <ContactForm contact={editing} onSave={handleSave} onClose={() => { setShowForm(false); setEditing(null) }} />
      )}
    </div>
  )
}
