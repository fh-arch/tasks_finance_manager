import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { requestDriveToken, uploadToDrive, isDriveConnected, getOrCreateSubfolder, getSubfolderName, buildFileName } from '@/lib/googleDrive'
import { useAppStore } from '@/store/useAppStore'
import type { Document as DocFile } from '@/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Paperclip, Upload, X, File, FileText, Image as ImageIcon, Loader2, HardDrive, Eye, Download } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface Props {
  relatedType: string
  relatedId: string
  label?: string
  entityName?: string
  onUpload?: () => void
}

export function DocAttachButton({ relatedType, relatedId, label, entityName = '', onUpload }: Props) {
  const profile = useAppStore((s) => s.profile)
  const [open, setOpen] = useState(false)
  const [docs, setDocs] = useState<DocFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<{ url: string; name: string; type: string | null } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const driveFolderId: string | null = (profile as any)?.google_drive_folder_id ?? null
  const driveEnabled = !!(driveFolderId && (import.meta as any).env.VITE_GOOGLE_CLIENT_ID)

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

    let filePath = ''
    let driveFileId: string | null = null
    let driveFileUrl: string | null = null

    const autoName = buildFileName(relatedType, entityName || 'BELGE', docs.length + 1, file.name)
    const renamedFile = new (window.File as any)([file], autoName, { type: file.type }) as File

    if (driveEnabled) {
      try {
        const token = await requestDriveToken()
        const subFolderId = await getOrCreateSubfolder(driveFolderId!, getSubfolderName(relatedType), token)
        const result = await uploadToDrive(renamedFile, subFolderId, token)
        driveFileId = result.fileId
        driveFileUrl = result.webViewLink
        filePath = `drive:${result.fileId}`
      } catch (err: any) {
        alert(`Google Drive yükleme hatası: ${err.message}`)
        setUploading(false)
        if (fileRef.current) fileRef.current.value = ''
        return
      }
    } else {
      filePath = `${user.id}/${relatedType}/${relatedId}/${Date.now()}_${autoName}`
      const { error } = await supabase.storage.from('finans-bucket').upload(filePath, renamedFile)
      if (error) {
        alert(`Yükleme hatası: ${error.message}`)
        setUploading(false)
        if (fileRef.current) fileRef.current.value = ''
        return
      }
    }

    await supabase.from('documents').insert({
      user_id: user.id, related_type: relatedType, related_id: relatedId,
      file_name: autoName, file_path: filePath, file_type: file.type, file_size: file.size,
      drive_file_id: driveFileId, drive_file_url: driveFileUrl,
    })
    fetchDocs()
    onUpload?.()
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const getPreviewUrl = async (doc: DocFile): Promise<string | null> => {
    if ((doc as any).drive_file_url) return (doc as any).drive_file_url
    const { data } = await supabase.storage.from('finans-bucket').createSignedUrl(doc.file_path, 300)
    return data?.signedUrl ?? null
  }

  const handlePreview = async (doc: DocFile) => {
    const url = await getPreviewUrl(doc)
    if (!url) return
    setPreview({ url, name: doc.file_name, type: doc.file_type })
  }

  const handleDownload = async (doc: DocFile) => {
    const url = await getPreviewUrl(doc)
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = doc.file_name
    a.target = '_blank'
    a.click()
  }

  const handleDelete = async (doc: DocFile) => {
    if (!window.confirm(`"${doc.file_name}" silinecek?`)) return
    if (!(doc as any).drive_file_id) {
      await supabase.storage.from('finans-bucket').remove([doc.file_path])
    }
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
      <>
      {preview && (
        <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
          <DialogContent className="max-w-4xl w-full p-0 overflow-hidden">
            <DialogHeader className="px-4 py-3 border-b flex flex-row items-center gap-2">
              <DialogTitle className="text-sm font-semibold truncate flex-1">{preview.name}</DialogTitle>
              <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => setPreview(null)}><X className="h-4 w-4" /></Button>
            </DialogHeader>
            <div className="w-full" style={{ height: '80vh' }}>
              {preview.type?.startsWith('image/') ? (
                <img src={preview.url} alt={preview.name} className="w-full h-full object-contain bg-gray-50" />
              ) : preview.type === 'application/pdf' || preview.url.includes('.pdf') ? (
                <iframe src={preview.url} title={preview.name} className="w-full h-full border-0" />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
                  <FileText className="h-16 w-16 opacity-20" />
                  <p className="text-sm">Bu dosya türü önizlenemiyor.</p>
                  <Button size="sm" onClick={() => handleDownload({ file_name: preview.name, file_type: preview.type, file_path: '', file_size: 0 } as any)}>
                    <Download className="h-4 w-4 mr-2" /> İndir
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-indigo-600" /> Belgeler
              {driveEnabled && (
                <span className="ml-auto flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                  <HardDrive className="h-3 w-3" /> Google Drive
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <input ref={fileRef} type="file" className="hidden" onChange={handleUpload}
              accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv,.doc,.docx" />
            <Button size="sm" variant="outline" className="w-full gap-2" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : driveEnabled
                  ? <HardDrive className="h-4 w-4 text-emerald-600" />
                  : <Upload className="h-4 w-4" />}
              {uploading ? 'Yükleniyor...' : driveEnabled ? "Drive'a Yükle (PDF, Görsel, Excel...)" : 'Belge Yükle  (PDF, Görsel, Excel, Word...)'}
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
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        {d.file_size ? `${(d.file_size / 1024).toFixed(1)} KB · ` : ''}{formatDate(d.uploaded_at)}
                        {(d as any).drive_file_id && (
                          <span className="text-emerald-600 flex items-center gap-0.5 ml-1">
                            <HardDrive className="h-2.5 w-2.5" /> Drive
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500 hover:text-blue-700" onClick={() => handlePreview(d)} title="Önizle">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
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
      </>
    )
  }
}
