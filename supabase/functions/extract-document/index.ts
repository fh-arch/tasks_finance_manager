const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PROMPTS: Record<string, string> = {
  transaction: `Bu bir fatura belgesi. Aşağıdaki bilgileri JSON olarak çıkar:
- invoice_number: fatura numarası (string veya null)
- invoice_date: fatura tarihi YYYY-MM-DD (string veya null)
- due_date: vade tarihi YYYY-MM-DD (string veya null)
- contact_name: alıcı/satıcı firma adı (string veya null)
- subtotal: KDV hariç tutar (number veya null)
- kdv_rate: KDV oranı, sadece 0/10/20 olabilir (number veya null)
- kdv_amount: KDV tutarı (number veya null)
- total: KDV dahil toplam (number veya null)
- type: "receivable" (bize ödenecek/alacak) veya "payable" (bizim ödeyeceğimiz/borç)
- description: fatura açıklaması (string veya null)`,

  quote: `Bu bir teklif belgesi. Şu bilgileri JSON olarak çıkar:
- quote_number: teklif numarası (string veya null)
- quote_date: teklif tarihi YYYY-MM-DD (string veya null)
- valid_until: geçerlilik tarihi YYYY-MM-DD (string veya null)
- contact_name: müşteri/firma adı (string veya null)
- total: toplam tutar (number veya null)
- description: teklif konusu (string veya null)`,

  personnel_payment: `Bu bir ödeme dekontu. Şu bilgileri JSON olarak çıkar:
- payment_date: ödeme tarihi YYYY-MM-DD (string veya null)
- amount: ödeme tutarı (number veya null)
- receiver_name: alıcı adı (string veya null)
- bank_name: banka adı (string veya null)
- reference_no: referans/işlem numarası (string veya null)
- description: açıklama (string veya null)`,

  reconciliation: `Bu bir mutabakat belgesi. Şu bilgileri JSON olarak çıkar:
- period: dönem YYYY-MM formatında (string veya null)
- contact_name: karşı firma adı (string veya null)
- opening_balance: dönem başı bakiye (number veya null)
- closing_balance: dönem sonu bakiye (number veya null)
- total_debit: toplam borç (number veya null)
- total_credit: toplam alacak (number veya null)
- is_confirmed: mutabık mı (boolean)`,

  personnel: `Bu bir iş sözleşmesi. Şu bilgileri JSON olarak çıkar:
- employee_name: çalışan adı soyadı (string veya null)
- start_date: işe başlama tarihi YYYY-MM-DD (string veya null)
- end_date: bitiş tarihi YYYY-MM-DD (string veya null, belirsizse null)
- position: görev/pozisyon (string veya null)
- monthly_salary: aylık ücret (number veya null)
- description: sözleşme tipi veya açıklama (string veya null)`,

  contact: `Bu bir cari hesap belgesi. Şu bilgileri JSON olarak çıkar:
- contact_name: firma/kişi adı (string veya null)
- tax_number: vergi numarası (string veya null)
- address: adres (string veya null)
- phone: telefon (string veya null)
- email: e-posta (string veya null)
- doc_date: belge tarihi YYYY-MM-DD (string veya null)`,
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { fileBase64, mimeType, docType } = await req.json()
    if (!fileBase64 || !mimeType || !docType) {
      return new Response(JSON.stringify({ error: 'fileBase64, mimeType ve docType gerekli' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY ayarlanmamış' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const prompt = PROMPTS[docType] ?? 'Bu belgeden tüm finansal bilgileri JSON olarak çıkar.'
    const fullPrompt = `${prompt}\n\nSadece geçerli JSON döndür. Başka açıklama ekleme. Bulamadığın alanlar için null kullan. Sayıları string değil number olarak ver.`

    const contentBlock = mimeType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: mimeType, data: fileBase64 } }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [contentBlock, { type: 'text', text: fullPrompt }],
        }],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Claude API hatası: ${err}`)
    }

    const claudeRes = await res.json()
    const rawText = claudeRes.content?.[0]?.text ?? ''

    let extracted: any
    try {
      const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      extracted = JSON.parse(cleaned)
    } catch {
      extracted = { raw: rawText, parse_error: true }
    }

    return new Response(JSON.stringify({ success: true, data: extracted, docType }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
