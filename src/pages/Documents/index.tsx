import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Document } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import { Upload, File, Image, FileText, Download, FolderOpen } from 'lucide-react'

const typeLabels: Record<string, string> = {
  transaction: 'İşlem', receivable: 'Alacak', payable: 'Borç',
  subscription: 'Abonelik', quote: 'Teklif', contact: 'Cari',
}

export function DocumentsPage() {
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchDocs = async () => {
    const { data } = await supabase.from('documents').select('*').order('uploaded_at', { ascending: false })
    setDocs(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchDocs() }, [])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const path = `${user.id}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('finans-bucket').upload(path, file)
    if (!error) {
      await supabase.from('documents').insert({
        user_id: user.id, file_name: file.name, file_path: path,
        file_type: file.type, file_size: file.size,
      })
      fetchDocs()
    }
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleDownload = async (doc: Document) => {
    const { data } = await supabase.storage.from('finans-bucket').createSignedUrl(doc.file_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const getIcon = (type: string | null) => {
    if (type?.startsWith('image/')) return <Image className="h-5 w-5 text-blue-500" />
    if (type === 'application/pdf') return <FileText className="h-5 w-5 text-red-500" />
    return <File className="h-5 w-5 text-gray-400" />
  }

  const getIconBg = (type: string | null) => {
    if (type?.startsWith('image/')) return 'bg-blue-50'
    if (type === 'application/pdf') return 'bg-red-50'
    return 'bg-gray-50'
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Yükleniyor...</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Belgeler</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{docs.length} belge yüklü</p>
        </div>
        <input ref={inputRef} type="file" className="hidden" onChange={handleUpload} accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv,.doc,.docx" />
        <Button onClick={() => inputRef.current?.click()} disabled={uploading} className="gap-1.5">
          <Upload className="h-4 w-4" /> {uploading ? 'Yükleniyor...' : 'Belge Yükle'}
        </Button>
      </div>

      {/* Drop zone — shown when no docs */}
      {docs.length === 0 && (
        <div
          className={`border-2 border-dashed rounded-2xl p-16 text-center transition-colors cursor-pointer ${dragOver ? 'border-primary bg-primary/[0.03]' : 'border-border/60 hover:border-primary/40 hover:bg-gray-50/50'}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragOver(false)
            const file = e.dataTransfer.files[0]
            if (file && inputRef.current) {
              const dt = new DataTransfer(); dt.items.add(file)
              inputRef.current.files = dt.files
              inputRef.current.dispatchEvent(new Event('change', { bubbles: true }))
            }
          }}
        >
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Upload className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Belge yüklemek için tıklayın veya sürükleyin</h3>
          <p className="text-xs text-muted-foreground">PDF, PNG, JPG, XLSX, CSV, DOC desteklenir</p>
        </div>
      )}

      {/* Upload zone strip — shown when docs exist */}
      {docs.length > 0 && (
        <div
          className={`border-2 border-dashed rounded-xl p-4 text-center flex items-center justify-center gap-3 cursor-pointer transition-colors ${dragOver ? 'border-primary bg-primary/[0.03]' : 'border-border/50 hover:border-primary/40'}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragOver(false)
            const file = e.dataTransfer.files[0]
            if (file && inputRef.current) {
              const dt = new DataTransfer(); dt.items.add(file)
              inputRef.current.files = dt.files
              inputRef.current.dispatchEvent(new Event('change', { bubbles: true }))
            }
          }}
        >
          <Upload className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Belge yüklemek için tıklayın veya buraya sürükleyin</p>
        </div>
      )}

      {/* Table */}
      {docs.length > 0 && (
        <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-50/50">
              <tr>
                {['Dosya', 'İlgili', 'Boyut', 'Tarih', ''].map((h) => (
                  <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-b border-border/40 hover:bg-primary/[0.02] transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getIconBg(d.file_type)}`}>
                        {getIcon(d.file_type)}
                      </div>
                      <span className="font-medium text-gray-900 max-w-[240px] truncate">{d.file_name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {d.related_type
                      ? <Badge variant="outline" className="text-xs">{typeLabels[d.related_type] ?? d.related_type}</Badge>
                      : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {d.file_size ? `${(d.file_size / 1024).toFixed(1)} KB` : '—'}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{formatDate(d.uploaded_at)}</td>
                  <td className="px-5 py-3">
                    <Button variant="ghost" size="sm" onClick={() => handleDownload(d)} className="gap-1.5">
                      <Download className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
