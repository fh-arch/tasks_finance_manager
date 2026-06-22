import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Contact } from '@/types'
import { cn } from '@/lib/utils'
import { ChevronDown, Search, X } from 'lucide-react'

interface Props {
  value: string
  onChange: (id: string, contact?: Contact) => void
  placeholder?: string
  className?: string
}

export function ContactSelector({ value, onChange, placeholder = 'Cari seçin...', className }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Contact | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.from('contacts').select('id,name,current_balance,type').eq('is_active', true).order('name').then(({ data }) => {
      const list = (data ?? []) as Contact[]
      setContacts(list)
      if (value) setSelected(list.find(c => c.id === value) ?? null)
    })
  }, [])

  useEffect(() => {
    if (!value) { setSelected(null); return }
    setSelected(contacts.find(c => c.id === value) ?? null)
  }, [value, contacts])

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const filtered = contacts.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setSearch('') }}
        className="flex items-center justify-between w-full h-10 px-3 border border-input bg-background rounded-md text-sm text-left hover:bg-accent/40 transition-colors"
      >
        {selected ? (
          <span className="flex items-center gap-2 min-w-0">
            <span className="truncate">{selected.name}</span>
            <span className={cn('text-xs shrink-0', selected.current_balance >= 0 ? 'text-green-600' : 'text-red-600')}>
              {selected.current_balance.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {selected && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
              className="p-0.5 rounded hover:bg-muted"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                className="w-full pl-7 pr-3 py-1.5 text-sm border rounded-md bg-background outline-none focus:ring-1 focus:ring-ring"
                placeholder="Ada göre ara..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground text-center">Sonuç bulunamadı</li>
            )}
            {filtered.map(c => (
              <li
                key={c.id}
                className={cn('flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-accent', c.id === value && 'bg-accent font-medium')}
                onClick={() => { onChange(c.id, c); setOpen(false); setSearch('') }}
              >
                <span>{c.name}</span>
                <span className={cn('text-xs ml-2', c.current_balance >= 0 ? 'text-green-600' : 'text-red-600')}>
                  {c.current_balance.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
