// Google Drive API yardımcıları — GSI token-based OAuth (frontend-only)

const SCOPES = 'https://www.googleapis.com/auth/drive.file'

let _tokenClient: any = null
let _accessToken: string | null = null
let _tokenExpiry: number = 0

function getClientId(): string {
  return (import.meta as any).env.VITE_GOOGLE_CLIENT_ID ?? ''
}

function loadGSI(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).google?.accounts) { resolve(); return }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('GSI yüklenemedi'))
    document.head.appendChild(script)
  })
}

export async function requestDriveToken(): Promise<string> {
  // Token hâlâ geçerliyse döndür
  if (_accessToken && Date.now() < _tokenExpiry - 30_000) return _accessToken

  const clientId = getClientId()
  if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID ayarlanmamış')

  await loadGSI()
  const google = (window as any).google

  return new Promise((resolve, reject) => {
    if (!_tokenClient) {
      _tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (resp: any) => {
          if (resp.error) { reject(new Error(resp.error)); return }
          _accessToken = resp.access_token
          _tokenExpiry = Date.now() + resp.expires_in * 1000
          resolve(resp.access_token)
        },
      })
    }
    _tokenClient.requestAccessToken({ prompt: _accessToken ? '' : 'consent' })
  })
}

export function isDriveConnected(): boolean {
  return !!_accessToken && Date.now() < _tokenExpiry - 30_000
}

export function revokeDriveToken() {
  if (_accessToken) {
    (window as any).google?.accounts.oauth2.revoke(_accessToken, () => {})
  }
  _accessToken = null
  _tokenExpiry = 0
}

/** Dosyayı Google Drive'a yükle, Drive file ID döner */
export async function uploadToDrive(
  file: File,
  folderId: string,
  token: string,
): Promise<{ fileId: string; webViewLink: string }> {
  const metadata = {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    parents: [folderId],
  }

  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  form.append('file', file)

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    },
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Drive yükleme hatası: ${err}`)
  }
  const data = await res.json()
  return { fileId: data.id, webViewLink: data.webViewLink }
}

/** Verilen isimde klasör bul veya oluştur, folder ID döner */
export async function getOrCreateFolder(name: string, token: string, parentId?: string): Promise<string> {
  const parentQ = parentId ? ` and '${parentId}' in parents` : ''
  const q = encodeURIComponent(`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentQ}`)
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const { files } = await searchRes.json()
  if (files?.length > 0) return files[0].id

  const body: any = { name, mimeType: 'application/vnd.google-apps.folder' }
  if (parentId) body.parents = [parentId]

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const folder = await createRes.json()
  return folder.id
}

// relatedType → Drive alt klasör adı
export const DRIVE_SUBFOLDER: Record<string, string> = {
  transaction:        'Faturalar',
  lead:               'Teklifler',
  quote:              'Teklifler',
  personnel_payment:  'Dekontlar',
  personnel_hire:     'Sözleşmeler',
  personnel:          'Sözleşmeler',
  contact:            'Cari Belgeler',
  subscription:       'Abonelikler',
  reconciliation:     'Mutabakatlar',
}

// relatedType → dosya adı prefix
const FILE_PREFIX: Record<string, string> = {
  transaction:        'fatura',
  lead:               'teklif',
  quote:              'teklif',
  personnel_payment:  'dekont',
  personnel_hire:     'sozlesme',
  personnel:          'sozlesme',
  contact:            'cari',
  subscription:       'abonelik',
  reconciliation:     'mutabakat',
}

export function getSubfolderName(relatedType: string): string {
  return DRIVE_SUBFOLDER[relatedType] ?? 'Diger'
}

/** Dosya adı üret: fatura-00001-ACMECORP_25-06-2026.pdf */
export function buildFileName(
  relatedType: string,
  entityName: string,
  seqNum: number,
  originalName: string,
): string {
  const prefix = FILE_PREFIX[relatedType] ?? 'belge'
  const seq = String(seqNum).padStart(5, '0')

  // Entity adı: TR karakterleri dönüştür, özel karakterleri at, ilk 10 harf
  const safeName = entityName
    .toUpperCase()
    .replace(/Ğ/g, 'G').replace(/Ü/g, 'U').replace(/Ş/g, 'S')
    .replace(/İ/g, 'I').replace(/Ö/g, 'O').replace(/Ç/g, 'C')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10)

  const now = new Date()
  const d = String(now.getDate()).padStart(2, '0')
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const y = now.getFullYear()
  const date = `${d}-${m}-${y}`

  const ext = originalName.includes('.') ? '.' + originalName.split('.').pop() : ''
  return `${prefix}-${seq}-${safeName}_${date}${ext}`
}

// Alt klasör ID önbelleği (token başına değil uygulama süresince)
const _subfolderCache: Record<string, string> = {}

/** Ana klasör altında alt klasör bul/oluştur, önbellekle */
export async function getOrCreateSubfolder(
  mainFolderId: string,
  subfolderName: string,
  token: string,
): Promise<string> {
  const cacheKey = `${mainFolderId}/${subfolderName}`
  if (_subfolderCache[cacheKey]) return _subfolderCache[cacheKey]
  const id = await getOrCreateFolder(subfolderName, token, mainFolderId)
  _subfolderCache[cacheKey] = id
  return id
}

/** Drive Picker ile klasör seçtir, folder ID döner */
export async function pickDriveFolder(token: string): Promise<string | null> {
  await new Promise<void>((resolve, reject) => {
    if ((window as any).google?.picker) { resolve(); return }
    const s = document.createElement('script')
    s.src = 'https://apis.google.com/js/api.js'
    s.onload = () => {
      (window as any).gapi.load('picker', () => resolve())
    }
    s.onerror = reject
    document.head.appendChild(s)
  })

  return new Promise(resolve => {
    const picker = new (window as any).google.picker.PickerBuilder()
      .addView(new (window as any).google.picker.DocsView((window as any).google.picker.ViewId.FOLDERS)
        .setSelectFolderEnabled(true))
      .setOAuthToken(token)
      .setDeveloperKey('')
      .setCallback((data: any) => {
        if (data.action === 'picked') {
          resolve(data.docs[0].id)
        } else if (data.action === 'cancel') {
          resolve(null)
        }
      })
      .build()
    picker.setVisible(true)
  })
}
