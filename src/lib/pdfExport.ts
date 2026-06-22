function fmt(amount: number | null | undefined) {
  if (amount == null) return '—'
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount)
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('tr-TR')
}

// Quote PDF — print-window approach (handles Turkish characters natively)
export function exportQuotePdf(
  quote: any,
  items: any[],
  contactName: string,
  companyName = '',
  logoUrl: string | null = null,
  extraInfo?: { address?: string; phone?: string; email?: string; taxNo?: string }
) {
  const lineTotal = (it: any) =>
    it.line_total ?? (it.quantity * it.unit_price * (1 - (it.discount_percent ?? 0) / 100))

  const itemRows = items.map(it => `
    <tr>
      <td>${it.description ?? ''}</td>
      <td class="right">${it.quantity}</td>
      <td class="right">${fmt(it.unit_price)}</td>
      <td class="right">${(it.discount_percent ?? 0) > 0 ? `%${it.discount_percent}` : '—'}</td>
      <td class="right bold">${fmt(lineTotal(it))}</td>
    </tr>
  `).join('')

  const infoLines = [
    extraInfo?.address ? `<div>${extraInfo.address}</div>` : '',
    extraInfo?.phone ? `<div>Tel: ${extraInfo.phone}</div>` : '',
    extraInfo?.email ? `<div>${extraInfo.email}</div>` : '',
    extraInfo?.taxNo ? `<div>Vergi No: ${extraInfo.taxNo}</div>` : '',
  ].filter(Boolean).join('')

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Teklif ${quote.quote_number}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #333; }
    @page { size: A4 portrait; margin: 15mm 18mm; }

    .page { padding: 0; }

    /* Header */
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 3px solid #4F46E5; margin-bottom: 20px; }
    .logo-wrap img { max-height: 64px; max-width: 180px; object-fit: contain; }
    .logo-wrap .company-text { font-size: 20px; font-weight: 800; color: #4F46E5; }
    .doc-title-wrap { text-align: right; }
    .doc-title { font-size: 26px; font-weight: 800; color: #4F46E5; letter-spacing: 2px; }
    .doc-no { font-size: 11px; color: #888; margin-top: 3px; }

    /* Info row */
    .info-row { display: flex; justify-content: space-between; margin-bottom: 20px; gap: 20px; }
    .info-left { font-size: 11px; color: #555; line-height: 1.9; }
    .info-left .lbl { font-size: 9px; color: #aaa; text-transform: uppercase; letter-spacing: 0.6px; }
    .info-left .val { font-weight: 700; color: #111; font-size: 12px; }
    .contact-card { background: #f4f3ff; border-left: 4px solid #4F46E5; padding: 12px 16px; border-radius: 0 8px 8px 0; min-width: 200px; }
    .contact-card .lbl { font-size: 9px; color: #8877dd; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 4px; }
    .contact-card .name { font-size: 15px; font-weight: 800; color: #1a1a1a; }

    /* Title */
    .quote-title { font-size: 14px; font-weight: 700; color: #1a1a1a; margin-bottom: 12px; }

    /* Table */
    table.items { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    table.items thead tr { background: #4F46E5; color: #fff; }
    table.items thead th { padding: 9px 12px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; }
    table.items thead th.right { text-align: right; }
    table.items tbody tr { border-bottom: 1px solid #eee; }
    table.items tbody tr:nth-child(even) { background: #f9f8ff; }
    table.items tbody td { padding: 9px 12px; vertical-align: middle; font-size: 11px; }
    table.items tbody td.right { text-align: right; }
    table.items tbody td.bold { font-weight: 700; }

    /* Totals */
    .totals-wrap { display: flex; justify-content: flex-end; margin: 14px 0 20px; }
    table.totals { width: 270px; border-collapse: collapse; }
    table.totals td { padding: 6px 12px; font-size: 12px; }
    table.totals td.lbl { color: #666; }
    table.totals td.amt { text-align: right; font-weight: 600; }
    table.totals tr.grand td { background: #4F46E5; color: #fff; font-weight: 800; font-size: 13px; border-radius: 4px; padding: 9px 12px; }
    table.totals tr.grand td.amt { text-align: right; }
    table.totals tr.sub td { border-top: 1px solid #eee; }

    /* Notes */
    .notes { background: #f5f5f5; border-radius: 8px; padding: 12px 16px; font-size: 11px; color: #555; margin-bottom: 20px; line-height: 1.6; }
    .notes strong { color: #333; }

    /* Footer */
    .footer { border-top: 1px solid #e5e5e5; padding-top: 10px; text-align: center; font-size: 10px; color: #bbb; margin-top: 10px; }

    .company-info { font-size: 10px; color: #888; line-height: 1.7; }
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="logo-wrap">
      ${logoUrl
        ? `<img src="${logoUrl}" alt="Logo" />`
        : `<div class="company-text">${companyName || 'Şirket'}</div>`}
      ${infoLines ? `<div class="company-info" style="margin-top:6px">${infoLines}</div>` : ''}
    </div>
    <div class="doc-title-wrap">
      <div class="doc-title">TEKLİF</div>
      <div class="doc-no">${companyName}</div>
    </div>
  </div>

  <div class="info-row">
    <div class="info-left">
      <div class="lbl">Teklif No</div>
      <div class="val">${quote.quote_number}</div>
      <div style="margin-top:10px" class="lbl">Düzenleme Tarihi</div>
      <div class="val">${fmtDate(quote.issue_date)}</div>
      ${quote.valid_until ? `
      <div style="margin-top:10px" class="lbl">Geçerlilik Tarihi</div>
      <div class="val">${fmtDate(quote.valid_until)}</div>` : ''}
    </div>
    <div class="contact-card">
      <div class="lbl">Müşteri / Cari</div>
      <div class="name">${contactName}</div>
    </div>
  </div>

  <div class="quote-title">${quote.title}</div>

  <table class="items">
    <thead>
      <tr>
        <th>Açıklama</th>
        <th class="right">Miktar</th>
        <th class="right">Birim Fiyat</th>
        <th class="right">İndirim</th>
        <th class="right">Tutar</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="totals-wrap">
    <table class="totals">
      <tr class="sub">
        <td class="lbl">Ara Toplam</td>
        <td class="amt">${fmt(quote.subtotal)}</td>
      </tr>
      <tr>
        <td class="lbl">KDV (%${quote.tax_rate})</td>
        <td class="amt">${fmt(quote.tax_amount)}</td>
      </tr>
      <tr class="grand">
        <td>GENEL TOPLAM</td>
        <td class="amt">${fmt(quote.total)}</td>
      </tr>
    </table>
  </div>

  ${quote.notes ? `<div class="notes"><strong>Notlar:</strong> ${quote.notes}</div>` : ''}

  <div class="footer">Bu teklif ${companyName || 'Lattice Finance'} tarafından hazırlanmıştır.</div>
</div>
<script>
  window.onload = function() {
    setTimeout(function() { window.print(); }, 400);
  }
</script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=900,height=700')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}

// Reconciliation PDF — HTML print-window approach (Turkish character safe)
const STATUS_MAP: Record<string, string> = {
  draft: 'Taslak', sent: 'Gönderildi', disputed: 'İtiraz Var',
  agreed: 'Anlaşıldı', converted: 'Dönüştürüldü', closed: 'Kapandı',
}

export function exportReconciliationPdf(
  rec: any,
  quotes: any[],
  contactName: string,
  importRows?: any[],
  companyName = '',
  logoUrl: string | null = null
) {
  const diff = rec.difference ?? 0
  const diffColor = diff > 0 ? '#c82828' : diff < 0 ? '#1e7a3c' : '#555'

  const quotesHtml = quotes.length === 0 ? '' : `
    <h3 style="margin:18px 0 6px;font-size:12px;color:#333">Dönem Faturaları</h3>
    <table>
      <thead><tr>
        <th>Fatura No</th><th>Başlık</th><th>Tarih</th>
        <th class="r">Ara Toplam</th><th class="r">KDV</th><th class="r">Toplam</th>
      </tr></thead>
      <tbody>
        ${quotes.map(q => `<tr>
          <td>${q.quote_number ?? ''}</td>
          <td>${q.title ?? ''}</td>
          <td>${fmtDate(q.issue_date)}</td>
          <td class="r">${fmt(q.subtotal)}</td>
          <td class="r">%${q.tax_rate ?? 0}</td>
          <td class="r bold">${fmt(q.total)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`

  const importHtml = (!importRows || importRows.length === 0) ? '' : `
    <h3 style="margin:18px 0 6px;font-size:12px;color:#333">Karşı Taraf Ekstresi (İçe Aktarılan)</h3>
    <table>
      <thead><tr>
        <th>Tarih</th><th>Açıklama</th><th class="r">Borç</th><th class="r">Alacak</th>
      </tr></thead>
      <tbody>
        ${importRows.map(r => `<tr>
          <td>${fmtDate(r.row_date)}</td>
          <td>${r.description ?? '—'}</td>
          <td class="r">${r.entry_type === 'debit' ? fmt(r.amount) : '—'}</td>
          <td class="r">${r.entry_type === 'credit' ? fmt(r.amount) : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>Mutabakat ${rec.reconciliation_number ?? ''}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#333;}
@page{size:A4 portrait;margin:14mm 16mm;}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:3px solid #4F46E5;margin-bottom:16px;}
.logo-name{font-size:18px;font-weight:800;color:#4F46E5;}
.doc-title{font-size:22px;font-weight:800;color:#4F46E5;text-align:right;letter-spacing:1px;}
.doc-sub{font-size:10px;color:#888;text-align:right;margin-top:2px;}
.meta{display:flex;justify-content:space-between;margin-bottom:14px;gap:16px;}
.meta-left{font-size:10px;line-height:1.9;color:#555;}
.meta-lbl{font-size:8.5px;color:#aaa;text-transform:uppercase;letter-spacing:0.5px;}
.meta-val{font-weight:700;color:#111;font-size:11px;}
.contact-card{background:#f4f3ff;border-left:4px solid #4F46E5;padding:10px 14px;border-radius:0 6px 6px 0;min-width:180px;}
.contact-card .lbl{font-size:8px;color:#8877dd;text-transform:uppercase;margin-bottom:3px;}
.contact-card .name{font-size:14px;font-weight:800;color:#1a1a1a;}
table{width:100%;border-collapse:collapse;margin-bottom:4px;}
thead tr{background:#4F46E5;color:#fff;}
thead th{padding:7px 10px;font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;text-align:left;}
thead th.r{text-align:right;}
tbody tr{border-bottom:1px solid #eee;}
tbody tr:nth-child(even){background:#f9f8ff;}
tbody td{padding:7px 10px;font-size:10px;vertical-align:middle;}
td.r{text-align:right;}
td.bold{font-weight:700;}
.summary-table{width:260px;margin-left:auto;margin-bottom:14px;border-collapse:collapse;}
.summary-table td{padding:6px 10px;font-size:11px;}
.summary-table td.lbl{color:#666;}
.summary-table td.amt{text-align:right;font-weight:600;}
.summary-table tr.grand td{background:#4F46E5;color:#fff;font-weight:800;font-size:12px;padding:8px 10px;}
.summary-table tr.grand td.amt{text-align:right;}
.summary-table tr.diff td{font-weight:700;font-size:12px;color:${diffColor};}
.notes-box{background:#f5f5f5;border-radius:6px;padding:10px 14px;font-size:10px;color:#555;margin:10px 0;line-height:1.6;}
.footer{border-top:1px solid #e5e5e5;padding-top:8px;text-align:center;font-size:9px;color:#bbb;margin-top:8px;}
</style>
</head>
<body>
<div class="header">
  <div>
    ${logoUrl ? `<img src="${logoUrl}" alt="" style="max-height:52px;max-width:160px;">` : `<div class="logo-name">${companyName || 'Şirket'}</div>`}
  </div>
  <div>
    <div class="doc-title">CARİ MUTABAKAT</div>
    <div class="doc-sub">Mutabakat No: ${rec.reconciliation_number ?? '—'}</div>
  </div>
</div>

<div class="meta">
  <div class="meta-left">
    <div class="meta-lbl">Dönem</div>
    <div class="meta-val">${fmtDate(rec.period_start)} — ${fmtDate(rec.period_end)}</div>
    <div style="margin-top:8px" class="meta-lbl">Durum</div>
    <div class="meta-val">${STATUS_MAP[rec.status] ?? rec.status}</div>
    <div style="margin-top:8px" class="meta-lbl">Tarih</div>
    <div class="meta-val">${fmtDate(new Date().toISOString().slice(0, 10))}</div>
  </div>
  <div class="contact-card">
    <div class="lbl">Cari / Müşteri</div>
    <div class="name">${contactName}</div>
  </div>
</div>

<h3 style="margin-bottom:6px;font-size:12px;color:#333">Bakiye Özeti</h3>
<table class="summary-table">
  <tr><td class="lbl">Hesaplanan Bakiyemiz</td><td class="amt">${fmt(rec.our_calculated_balance)}</td></tr>
  <tr><td class="lbl">Nihai Bakiyemiz</td><td class="amt">${rec.our_final_balance != null ? fmt(rec.our_final_balance) : '—'}</td></tr>
  <tr><td class="lbl">Karşı Taraf Bakiyesi</td><td class="amt">${fmt(rec.their_balance)}</td></tr>
  <tr class="diff"><td>FARK</td><td class="amt" style="color:${diffColor}">${fmt(diff)}</td></tr>
</table>

${quotesHtml}
${importHtml}

${rec.notes ? `<div class="notes-box"><strong>Notlar:</strong> ${rec.notes}</div>` : ''}

<div class="footer">${companyName || 'Lattice Finance'} tarafından oluşturulmuştur.</div>
<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=900,height=700')
  if (win) { win.document.write(html); win.document.close() }
}
