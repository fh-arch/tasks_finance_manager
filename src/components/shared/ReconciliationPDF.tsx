import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'
import type { Transaction, TransactionItem, Contact } from '@/types'

Font.register({
  family: 'Roboto',
  fonts: [
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf', fontWeight: 400 },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf', fontWeight: 700 },
  ],
})

const S = StyleSheet.create({
  page:         { fontFamily: 'Roboto', fontSize: 9, padding: 36, color: '#111' },
  header:       { borderBottom: '2pt solid #1e3a5f', paddingBottom: 8, marginBottom: 12 },
  headerTitle:  { fontSize: 14, fontWeight: 700, color: '#1e3a5f' },
  headerSub:    { fontSize: 8, color: '#555', marginTop: 2 },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: '#1e3a5f', marginBottom: 6, marginTop: 12 },
  row:          { flexDirection: 'row' },
  col:          { flex: 1 },
  label:        { fontSize: 7, color: '#888', marginBottom: 1 },
  value:        { fontSize: 9, fontWeight: 700 },
  divider:      { borderBottom: '0.5pt solid #e0e0e0', marginVertical: 6 },
  amountBox:    { border: '1.5pt solid #1e3a5f', borderRadius: 4, padding: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8 },
  amountBig:    { fontSize: 16, fontWeight: 700, color: '#1e3a5f' },
  amountWords:  { fontSize: 8, color: '#555', maxWidth: 200 },
  table:        { marginTop: 8 },
  th:           { backgroundColor: '#1e3a5f', color: '#fff', fontWeight: 700, padding: '4 6', fontSize: 8 },
  td:           { padding: '3 6', fontSize: 8 },
  trEven:       { backgroundColor: '#f5f7fa' },
  totalRow:     { backgroundColor: '#e8eef5', fontWeight: 700 },
  footer:       { fontSize: 7, color: '#999', textAlign: 'center', marginTop: 20, borderTop: '0.5pt solid #ddd', paddingTop: 6 },
  signBox:      { flexDirection: 'row', marginTop: 20, gap: 20 },
  sign:         { flex: 1, borderTop: '1pt solid #aaa', paddingTop: 6 },
  signLabel:    { fontSize: 8, fontWeight: 700, color: '#444' },
  mutCheckRow:  { flexDirection: 'row', gap: 20, marginTop: 12 },
  mutCheck:     { border: '1pt solid #aaa', borderRadius: 4, padding: '6 12', flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkBox:     { width: 12, height: 12, border: '1pt solid #555', borderRadius: 2 },
})

interface Props {
  tx: Transaction
  items: TransactionItem[]
  contact: Contact | null
  referenceNo: string
  senderInfo?: {
    company: string
    product: string
    address: string
    web: string
    email: string
    signatory: string
  }
  responseDays?: number
}

function toTurkishWords(n: number): string {
  const ones = ['','Bir','İki','Üç','Dört','Beş','Altı','Yedi','Sekiz','Dokuz']
  const tens = ['','On','Yirmi','Otuz','Kırk','Elli','Altmış','Yetmiş','Seksen','Doksan']
  const scales = ['','Bin','Milyon','Milyar']
  if (n === 0) return 'Sıfır'
  const intPart = Math.floor(n)
  const chunks: number[] = []
  let tmp = intPart
  while (tmp > 0) { chunks.unshift(tmp % 1000); tmp = Math.floor(tmp / 1000) }
  const parts: string[] = []
  chunks.forEach((chunk, i) => {
    const scale = scales[chunks.length - 1 - i]
    const h = Math.floor(chunk / 100)
    const t = Math.floor((chunk % 100) / 10)
    const o = chunk % 10
    let s = ''
    if (h > 0) s += (h === 1 ? 'Yüz' : ones[h] + 'Yüz')
    if (t > 0) s += tens[t]
    if (o > 0) s += ones[o]
    if (s && scale) parts.push(s + (scale === 'Bin' && s === 'Bir' ? '' : '') + scale)
    else if (s) parts.push(s)
  })
  return parts.join('') + 'TürkLirası'
}

function fmtTRY(n: number) {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(n) + ' ₺'
}

const today = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')} / ${String(d.getMonth()+1).padStart(2,'0')} / ${d.getFullYear()}`
}

const addDays = (days: number) => {
  const d = new Date(); d.setDate(d.getDate() + days)
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`
}

export function ReconciliationPDF({ tx, items, contact, referenceNo, senderInfo, responseDays = 5 }: Props) {
  const sender = senderInfo ?? {
    company: 'EDUNOVATECH YAZILIM A.Ş.',
    product: tx.product ?? 'Yazılım Hizmetleri',
    address: 'İzmir, Türkiye',
    web: 'www.edunovatech.com',
    email: 'finance@edunovatech.com',
    signatory: 'Fatma HACIOĞLU',
  }

  const kdvRate   = tx.kdv_rate ?? 0
  const subtotal  = items.length > 0
    ? items.reduce((s, it) => s + (it.total ?? it.unit_price * it.quantity), 0)
    : tx.amount
  const kdvTotal  = subtotal * kdvRate / 100
  const grand     = subtotal + kdvTotal
  const itemCount = items.length || 1
  const itemLabel = 'şube/öğrenci'

  const periodStr = tx.period_start && tx.period_end
    ? `${tx.period_start} – ${tx.period_end}`
    : tx.period_start ?? '—'

  return (
    <Document>
      <Page size="A4" style={S.page}>
        {/* Header */}
        <View style={S.header}>
          <Text style={S.headerTitle}>{sender.company}</Text>
          <Text style={S.headerSub}>{sender.product}  |  {sender.address}  |  {sender.web}  |  {sender.email}</Text>
        </View>

        {/* Başlık */}
        <Text style={{ fontSize: 13, fontWeight: 700, textAlign: 'center', color: '#1e3a5f', marginBottom: 2 }}>
          CARİ HESAP MUTABAKAT MEKTUBU
        </Text>
        <Text style={{ fontSize: 8, textAlign: 'center', color: '#888', marginBottom: 10 }}>
          Referans: {referenceNo}  |  Tarih: {today()}
        </Text>

        <View style={S.divider} />

        {/* Muhatap & Dönem */}
        <View style={S.row}>
          <View style={S.col}>
            <Text style={S.label}>SAYYIN</Text>
            <Text style={S.value}>{contact?.name ?? '—'}</Text>
            {contact?.tax_number && <Text style={{ fontSize: 8, color: '#666' }}>VKN: {contact.tax_number}</Text>}
          </View>
          <View style={S.col}>
            <Text style={S.label}>DÖNEM</Text>
            <Text style={S.value}>{periodStr}</Text>
          </View>
        </View>

        {/* Giriş */}
        <View style={{ marginTop: 10, backgroundColor: '#f8f9fb', borderRadius: 4, padding: 8 }}>
          <Text style={{ fontSize: 8.5, lineHeight: 1.5 }}>
            Şirketimiz {sender.company} tarafından sunulan <Text style={{ fontWeight: 700 }}>{sender.product}</Text> kapsamında,{' '}
            <Text style={{ fontWeight: 700 }}>{periodStr}</Text> dönemi için toplam{' '}
            <Text style={{ fontWeight: 700 }}>{itemCount} {itemLabel}</Text> üzerinden birim fiyat{' '}
            <Text style={{ fontWeight: 700 }}>{fmtTRY(subtotal / (itemCount || 1))}</Text> olmak üzere{' '}
            aşağıda detaylı olarak sunulan cari hesap bakiyemize ilişkin mutabakat talebimizi içermektedir.
          </Text>
        </View>

        {/* Tutar Kutusu */}
        <View style={S.amountBox}>
          <View>
            <Text style={S.label}>TOPLAM BORÇ (KDV DAHİL)</Text>
            <Text style={S.amountBig}>{fmtTRY(grand)}</Text>
            <Text style={S.amountWords}>({toTurkishWords(Math.floor(grand))})</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 8, color: '#888' }}>Ara Toplam: {fmtTRY(subtotal)}</Text>
            <Text style={{ fontSize: 8, color: '#888' }}>KDV (%{kdvRate}): {fmtTRY(kdvTotal)}</Text>
            <Text style={{ fontSize: 9, fontWeight: 700, color: '#c0392b', marginTop: 4 }}>BORÇ</Text>
          </View>
        </View>

        {/* Süre Açıklaması */}
        <Text style={{ fontSize: 8, color: '#555', lineHeight: 1.6 }}>
          İşbu mutabakat mektubu tarafınıza teslim edildiği tarihten itibaren{' '}
          <Text style={{ fontWeight: 700 }}>{responseDays} iş günü</Text> içerisinde yukarıda belirtilen bakiyeyi teyit etmenizi,{' '}
          farklı bir bakiye söz konusu ise tarafımıza bildirmenizi saygılarımızla rica ederiz.{' '}
          Belirtilen süre içinde bildirim yapılmadığı takdirde mutabık kalınmış sayılacaktır.
          Son yanıt tarihi: <Text style={{ fontWeight: 700 }}>{addDays(responseDays)}</Text>
        </Text>

        <Text style={{ fontSize: 8, marginTop: 6, color: '#666' }}>
          Saygılarımızla,{'\n'}{sender.company}{'\n'}{sender.signatory}
        </Text>

        {/* Tablo (eğer items varsa) */}
        {items.length > 0 && (
          <View style={S.table}>
            <Text style={S.sectionTitle}>Kalem Detayı</Text>
            {/* Başlık satırı */}
            <View style={[S.row, { backgroundColor: '#1e3a5f' }]}>
              {['#', 'Kalem', 'Açıklama', 'Birim Fiyat', 'Adet', 'KDV%', 'Toplam'].map((h, i) => (
                <Text key={i} style={[S.th, i === 1 || i === 2 ? { flex: 2 } : { flex: 1 }]}>{h}</Text>
              ))}
            </View>
            {items.map((it, i) => (
              <View key={it.id} style={[S.row, i % 2 === 1 ? S.trEven : {}]}>
                <Text style={[S.td, { flex: 1 }]}>{i + 1}</Text>
                <Text style={[S.td, { flex: 2 }]}>{it.label}</Text>
                <Text style={[S.td, { flex: 2, color: '#666' }]}>{it.sub_label ?? ''}</Text>
                <Text style={[S.td, { flex: 1, textAlign: 'right' }]}>{fmtTRY(it.unit_price)}</Text>
                <Text style={[S.td, { flex: 1, textAlign: 'right' }]}>{it.quantity}</Text>
                <Text style={[S.td, { flex: 1, textAlign: 'right' }]}>%{it.kdv_rate}</Text>
                <Text style={[S.td, { flex: 1, textAlign: 'right', fontWeight: 700 }]}>{fmtTRY(it.total ?? it.unit_price * it.quantity)}</Text>
              </View>
            ))}
            {/* Özet */}
            <View style={[S.row, { marginTop: 2, backgroundColor: '#eef1f5' }]}>
              <Text style={[S.td, { flex: 6, textAlign: 'right', fontWeight: 700 }]}>Ara Toplam</Text>
              <Text style={[S.td, { flex: 1, textAlign: 'right', fontWeight: 700 }]}>{fmtTRY(subtotal)}</Text>
            </View>
            <View style={[S.row, { backgroundColor: '#eef1f5' }]}>
              <Text style={[S.td, { flex: 6, textAlign: 'right', color: '#666' }]}>KDV (%{kdvRate})</Text>
              <Text style={[S.td, { flex: 1, textAlign: 'right', color: '#666' }]}>{fmtTRY(kdvTotal)}</Text>
            </View>
            <View style={[S.row, { backgroundColor: '#1e3a5f' }]}>
              <Text style={[S.td, { flex: 6, textAlign: 'right', color: '#fff', fontWeight: 700 }]}>GENEL TOPLAM</Text>
              <Text style={[S.td, { flex: 1, textAlign: 'right', color: '#fff', fontWeight: 700 }]}>{fmtTRY(grand)}</Text>
            </View>
          </View>
        )}

        {/* Mutabakat Onay Kutuları */}
        <Text style={[S.sectionTitle, { marginTop: 14 }]}>Mutabakat Durumu</Text>
        <View style={S.mutCheckRow}>
          <View style={S.mutCheck}>
            <View style={S.checkBox} />
            <Text style={{ fontSize: 8 }}>✓ Mutabıkım — Yukarıdaki bakiyeyi onaylıyorum.</Text>
          </View>
          <View style={S.mutCheck}>
            <View style={S.checkBox} />
            <Text style={{ fontSize: 8 }}>✗ Mutabık Değilim — Fark bildirimim aşağıdadır.</Text>
          </View>
        </View>
        <View style={{ marginTop: 8, border: '0.5pt solid #ccc', borderRadius: 3, padding: 6, minHeight: 30 }}>
          <Text style={{ fontSize: 7, color: '#aaa' }}>Fark bildirim alanı (opsiyonel):</Text>
        </View>

        {/* İmza Alanları */}
        <View style={S.signBox}>
          <View style={S.sign}>
            <Text style={S.signLabel}>{sender.company}</Text>
            <Text style={{ fontSize: 7, color: '#888', marginTop: 2 }}>{sender.signatory}</Text>
          </View>
          <View style={S.sign}>
            <Text style={S.signLabel}>{contact?.name ?? 'MUHATAP FİRMA'}</Text>
            <Text style={{ fontSize: 7, color: '#888', marginTop: 2 }}>Ad Soyad / Unvan / Tarih / İmza</Text>
          </View>
        </View>

        {/* Footer */}
        <Text style={S.footer}>
          Bu belge elektronik ortamda hazırlanmıştır. • {sender.company} • {referenceNo}
        </Text>
      </Page>
    </Document>
  )
}
