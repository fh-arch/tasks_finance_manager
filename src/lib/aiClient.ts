const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5-20251001'

export const AI_KEY_STORAGE = 'lattice_ai_key'

export function getStoredApiKey(): string {
  return localStorage.getItem(AI_KEY_STORAGE) ?? ''
}
export function setStoredApiKey(key: string) {
  localStorage.setItem(AI_KEY_STORAGE, key)
}

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

export async function callClaude(
  apiKey: string,
  messages: ChatMessage[],
  systemPrompt: string,
  onChunk?: (text: string) => void
): Promise<string> {
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      messages,
      stream: !!onChunk,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `API hatası: ${res.status}`)
  }

  // Streaming
  if (onChunk && res.body) {
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let full = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const lines = decoder.decode(value).split('\n')
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        if (raw === '[DONE]' || !raw) continue
        try {
          const ev = JSON.parse(raw)
          const text = ev?.delta?.text ?? ''
          if (text) { full += text; onChunk(text) }
        } catch {}
      }
    }
    return full
  }

  // Non-streaming fallback
  const data = await res.json()
  return data?.content?.[0]?.text ?? ''
}

export function buildFinancialContext(data: {
  today: string
  companyName: string
  monthIncome: number
  monthExpense: number
  monthNet: number
  pendingReceivables: number
  overdueReceivables: number
  pendingReceivablesCount: number
  overdueReceivablesCount: number
  pendingPayables: number
  overduePayables: number
  pendingPayablesCount: number
  overduePayablesCount: number
  recentTx: Array<{ date: string; type: string; amount: number; description: string }>
  topCategories: Array<{ name: string; amount: number; type: string }>
}): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 }).format(n)

  return `Sen Lattice Finance uygulaması için kişisel bir finansal asistansın. Türkçe yanıt veriyorsun. Kısa, net ve pratik yorumlar yapıyorsun. Rakamları Türk lirası formatında göster.

== GÜNCEL FİNANSAL VERİLER (${data.today}) ==

Şirket: ${data.companyName || 'Belirtilmemiş'}

Bu Ay (Gerçekleşen):
- Gelir: ${fmt(data.monthIncome)}
- Gider: ${fmt(data.monthExpense)}
- Net: ${fmt(data.monthNet)} (${data.monthNet >= 0 ? 'KAR' : 'ZARAR'})

Alacaklar:
- Bekleyen: ${data.pendingReceivablesCount} kayıt, toplam ${fmt(data.pendingReceivables)}
- Gecikmiş: ${data.overdueReceivablesCount} kayıt, toplam ${fmt(data.overdueReceivables)}

Borçlar:
- Bekleyen: ${data.pendingPayablesCount} kayıt, toplam ${fmt(data.pendingPayables)}
- Gecikmiş: ${data.overduePayablesCount} kayıt, toplam ${fmt(data.overduePayables)}

Son İşlemler:
${data.recentTx.map(t => `- ${t.date} | ${t.type === 'income' ? 'GELİR' : 'GİDER'} | ${fmt(t.amount)} | ${t.description}`).join('\n') || '(yok)'}

Kategori Dağılımı:
${data.topCategories.map(c => `- ${c.type === 'income' ? 'Gelir' : 'Gider'} / ${c.name}: ${fmt(c.amount)}`).join('\n') || '(yok)'}
`
}
