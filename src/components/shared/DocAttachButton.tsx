import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Document as DocFile } from '@/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Paperclip, Upload, Download, X, File, FileText, Image as ImageIcon, Loader2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface Props {
  relatedType: string
  relatedId: string
  label?: string
}

export function DocAttachButton({ relatedType, relatedId, label }: Props) {
  const [open, setOpen] = useState(false)
  const [docs, setDocs] = useState<DocFile[]>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchDocs = async () => {
    const { data } = await supabase.from('documents')
      .select('*')
      .eq('related_type', relatedType)
      .eq('related_id', relatedId)
      .order('uploaded_at', { ascending: false })
    setDocs((data ?? []) as DocFile[])
  }

  useEffect(() => { fetchDocs() }, [relatedId])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }
    const path = `${user.id}/${relatedType}/${relatedId}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('finans-bucket').upload(path, file)
    if (!error) {
      await supabase.from('documents').insert({
        user_id: user.id, related_type: relatedType, related_id: relatedId,
        file_name: file.name, file_path: path, file_type: file.type, file_size: file.size,
      })
      fetchDocs()
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleDownload = async (doc: DocFile) => {
    const { data } = await supabase.storage.from('finans-bucket').createSignedUrl(doc.file_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const handleDelete = async (doc: DocFile) => {
    if (!window.confirm(`"${doc.file_name}" silinecek?`)) return
    await supabase.storage.from('finans-bucket').remove([doc.file_path])
    await supabase.from('documents').delete().eq('id', doc.id)
    fetchDocs()
  }

  const getIcon = (type: string | null) => {
    if (type?.startsWith('image/')) return <ImageIcon className="h-4 w-4 text-blue-500" />
    if (type === 'application/pdf') return <FileText className="h-4 w-4 text-red-500" />
    return <File className="h-4 w-4 text-gray-500" />
  }

  if (label) {
    return (
      <>
        <Button variant="outline" size="sm" className="gap-1.5 relative" onClick={() => setOpen(true)}>
          <Paperclip className="h-3.5 w-3.5" />
          {label}
          {docs.length > 0 && (
            <span className="ml-1 bg-indigo-500 text-white text-[9px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
              {docs.length}
            </span>
          )}
        </Button>
        {renderDialog()}
      </>
    )
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-foreground relative"
        onClick={() => setOpen(true)}
        title="Belge ekle / görüntüle"
      >
        <Paperclip className="h-3.5 w-3.5" />
        {docs.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 bg-indigo-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {docs.length}
          </span>
        )}
      </Button>
      {renderDialog()}
    </>
  )

  function renderDialog() {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-indigo-600" /> Belgeler
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <input ref={fileRef} type="file" className="hidden" onChange={handleUpload}
              accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv,.doc,.docx" />
            <Button size="sm" variant="outline" className="w-full gap-2" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? 'Yükleniyor...' : 'Belge Yükle  (PDF, Görsel, Excel, Word...)'}
            </Button>

            {docs.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Paperclip className="h-9 w-9 mx-auto mb-2 opacity-20" />
                <p className="text-sm">Henüz belge eklenmemiş</p>
                <p className="text-xs mt-0.5">Fatura, dekont, makbuz vb. yükleyebilirsiniz</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {docs.map(d => (
                  <div key={d.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border/50 hover:bg-gray-50 transition-colors">
                    {getIcon(d.file_type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{d.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.file_size ? `${(d.file_size / 1024).toFixed(1)} KB · ` : ''}{formatDate(d.uploaded_at)}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => handleDownload(d)} title="İndir">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(d)} title="Sil">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    )
  }
}
