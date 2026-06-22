import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  callClaude, buildFinancialContext, getStoredApiKey, setStoredApiKey,
  type ChatMessage,
} from '@/lib/aiClient'
import {
  Bot, Send, Sparkles, Key, RefreshCw, Trash2,
  TrendingUp, TrendingDown, AlertCircle, Zap, ChevronRight,
} from 'lucide-react'

const QUICK_ACTIONS = [
  { label: 'Günlük Özet', prompt: 'Bugünkü finansal durumumu analiz et ve kısa bir günlük özet yap. Dikkat etmem gereken önemli noktaları vurgula.', icon: Sparkles },
  { label: 'Gecikmeler', prompt: 'Gecikmiş alacak ve borçlarımı değerlendir. Hangi tahsilatları önceliklendirmeliyim?', icon: AlertCircle },
  { label: 'Nakit Tahmini', prompt: 'Bekleyen alacak ve borçlara göre önümüzdeki 30 günlük nakit akışımı tahmin et.', icon: TrendingUp },
  { label: 'Tasarruf Önerileri', prompt: 'Gider kategorilerimi inceleyerek tasarruf yapabileceğim alanları öner.', icon: TrendingDown },
]

type ContextData = Parameters<typeof buildFinancialContext>[0]

export function AIAssistantPage() {
  const profile = useAppStore(s => s.profile)
  const [apiKey, setApiKey] = useState(getStoredApiKey())
  const [keyInput, setKeyInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState('')
  const [contextData, setContextData] = useState<ContextData | null>(null)
  const [contextLoading, setContextLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  useEffect(() => { scrollToBottom() }, [messages, streaming])

  // Load context on mount
  useEffect(() => {
    if (apiKey) loadContext()
  }, [apiKey])

  const loadContext = async () => {
    setContextLoading(true)
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const today = now.toISOString().slice(0, 10)

    const [txRes, recRes, payRes, catRes] = await Promise.all([
      supabase.from('transactions').select('*').eq('status', 'completed').gte('transaction_date', monthStart),
      supabase.from('receivables').select('*, contacts(name)'),
      supabase.from('payables').select('*, contacts(name)'),
      supabase.from('categories').select('*'),
    ])

    const tx = txRes.data ?? []
    const recs = recRes.data ?? []
    const pays = payRes.data ?? []
    const cats = catRes.data ?? []

    const monthIncome = tx.filter(t => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0)
    const monthExpense = tx.filter(t => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0)

    const pendingRec = recs.filter((r: any) => r.status === 'pending')
    const overdueRec = recs.filter((r: any) => r.status === 'overdue')
    const pendingPay = pays.filter((p: any) => p.status === 'pending')
    const overduePay = pays.filter((p: any) => p.status === 'overdue')

    const catMap = new Map(cats.map((c: any) => [c.id, c.name]))

    const catAmounts = new Map<string, { name: string; amount: number; type: string }>()
    tx.forEach((t: any) => {
      const catName = catMap.get(t.category_id) ?? 'Kategorisiz'
      const key = `${t.type}__${catName}`
      const prev = catAmounts.get(key) ?? { name: catName, amount: 0, type: t.type }
      catAmounts.set(key, { ...prev, amount: prev.amount + t.amount })
    })

    const ctx: ContextData = {
      today,
      companyName: profile?.company_name ?? '',
      monthIncome,
      monthExpense,
      monthNet: monthIncome - monthExpense,
      pendingReceivables: pendingRec.reduce((s: number, r: any) => s + (r.amount - r.paid_amount), 0),
      overdueReceivables: overdueRec.reduce((s: number, r: any) => s + (r.amount - r.paid_amount), 0),
      pendingReceivablesCount: pendingRec.length,
      overdueReceivablesCount: overdueRec.length,
      pendingPayables: pendingPay.reduce((s: number, p: any) => s + (p.amount - p.paid_amount), 0),
      overduePayables: overduePay.reduce((s: number, p: any) => s + (p.amount - p.paid_amount), 0),
      pendingPayablesCount: pendingPay.length,
      overduePayablesCount: overduePay.length,
      recentTx: tx.slice(-5).map((t: any) => ({
        date: t.transaction_date,
        type: t.type,
        amount: t.amount,
        description: t.description ?? '—',
      })),
      topCategories: Array.from(catAmounts.values())
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 6),
    }
    setContextData(ctx)
    setContextLoading(false)
  }

  const sendMessage = async (userText: string) => {
    if (!userText.trim() || loading || !apiKey) return
    const userMsg: ChatMessage = { role: 'user', content: userText }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setStreaming('')

    try {
      const systemPrompt = contextData
        ? buildFinancialContext(contextData)
        : 'Sen Lattice Finance için bir finansal asistansın. Türkçe yanıt ver.'

      let fullText = ''
      await callClaude(apiKey, newMessages, systemPrompt, chunk => {
        fullText += chunk
        setStreaming(fullText)
      })
      setMessages(prev => [...prev, { role: 'assistant', content: fullText }])
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Hata: ${err.message ?? 'Bilinmeyen hata'}. API anahtarınızı kontrol edin.`,
      }])
    } finally {
      setLoading(false)
      setStreaming('')
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  const handleSaveKey = () => {
    const trimmed = keyInput.trim()
    if (!trimmed.startsWith('sk-ant-')) {
      alert('Geçersiz anahtar. "sk-ant-" ile başlamalı.')
      return
    }
    setStoredApiKey(trimmed)
    setApiKey(trimmed)
    setKeyInput('')
  }

  const handleClear = () => {
    setMessages([])
    setStreaming('')
  }

  // No API key setup screen
  if (!apiKey) {
    return (
      <div className="max-w-lg mx-auto mt-16 animate-fade-in">
        <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-5 shadow-lg">
            <Bot className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">AI Finansal Asistan</h2>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            Günlük özet, nakit akışı tahmini ve finansal sorularınız için Anthropic API anahtarınızı girin.
            Anahtar yalnızca tarayıcınızda saklanır, sunucuya gönderilmez.
          </p>
          <div className="space-y-3">
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder="sk-ant-api03-..."
                className="pl-9 font-mono text-sm"
                type="password"
                onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
              />
            </div>
            <Button onClick={handleSaveKey} className="w-full gap-2" disabled={!keyInput.trim()}>
              <Zap className="h-4 w-4" /> Başlat
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            API anahtarı almak için: <span className="text-indigo-600 font-medium">console.anthropic.com</span>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">AI Finansal Asistan</h1>
            <p className="text-xs text-muted-foreground">
              {contextLoading ? 'Veriler yükleniyor...' : 'Finansal verileriniz yüklendi · claude-haiku'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={loadContext} disabled={contextLoading} className="gap-1.5 text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${contextLoading ? 'animate-spin' : ''}`} /> Güncelle
          </Button>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClear} className="gap-1.5 text-xs text-muted-foreground">
              <Trash2 className="h-3.5 w-3.5" /> Temizle
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => { setStoredApiKey(''); setApiKey('') }} className="gap-1.5 text-xs text-red-400 hover:text-red-600">
            <Key className="h-3.5 w-3.5" /> Anahtarı Sıfırla
          </Button>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Quick actions sidebar */}
        <div className="w-48 flex-shrink-0 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Hızlı Sorular</p>
          {QUICK_ACTIONS.map(a => (
            <button
              key={a.label}
              onClick={() => sendMessage(a.prompt)}
              disabled={loading}
              className="w-full text-left bg-white rounded-xl border border-border/50 shadow-sm px-3 py-2.5 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group disabled:opacity-50"
            >
              <div className="flex items-center gap-2 mb-1">
                <a.icon className="h-3.5 w-3.5 text-indigo-500" />
                <span className="text-xs font-semibold text-gray-700">{a.label}</span>
              </div>
              <ChevronRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-indigo-400 transition-colors" />
            </button>
          ))}

          {/* Context snapshot */}
          {contextData && !contextLoading && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Anlık Durum</p>
              <div className="bg-white rounded-xl border border-border/50 shadow-sm p-3 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Net Akış</span>
                  <span className={`font-bold ${contextData.monthNet >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 }).format(Math.abs(contextData.monthNet))}
                  </span>
                </div>
                {contextData.overdueReceivablesCount > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>Gecikmiş alacak</span>
                    <span className="font-bold">{contextData.overdueReceivablesCount}</span>
                  </div>
                )}
                {contextData.overduePayablesCount > 0 && (
                  <div className="flex justify-between text-red-500">
                    <span>Gecikmiş borç</span>
                    <span className="font-bold">{contextData.overduePayablesCount}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.length === 0 && !streaming && (
              <div className="flex flex-col items-center justify-center h-full text-center py-10">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center mb-4">
                  <Sparkles className="h-8 w-8 text-indigo-500" />
                </div>
                <h3 className="text-base font-semibold text-gray-700 mb-2">Merhaba! Nasıl yardımcı olabilirim?</h3>
                <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
                  Finansal durumunuz, alacak/borçlarınız veya nakit akışınız hakkında soru sorabilirsiniz. Sol taraftaki hızlı sorularla başlayabilirsiniz.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                    <Bot className="h-3.5 w-3.5 text-white" />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-gray-50 text-gray-800 rounded-bl-sm border border-border/40'
                }`}>
                  <MessageContent content={msg.content} />
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-gray-600">S</span>
                  </div>
                )}
              </div>
            ))}

            {/* Streaming response */}
            {streaming && (
              <div className="flex gap-3 justify-start">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="max-w-[80%] bg-gray-50 rounded-2xl rounded-bl-sm border border-border/40 px-4 py-3 text-sm leading-relaxed text-gray-800">
                  <MessageContent content={streaming} />
                  <span className="inline-block w-1.5 h-4 bg-indigo-500 animate-pulse ml-0.5 rounded-sm align-middle" />
                </div>
              </div>
            )}

            {/* Loading indicator (before streaming starts) */}
            {loading && !streaming && (
              <div className="flex gap-3 justify-start">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="bg-gray-50 rounded-2xl rounded-bl-sm border border-border/40 px-4 py-3">
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border/40 p-4">
            <form
              onSubmit={e => { e.preventDefault(); sendMessage(input) }}
              className="flex gap-2"
            >
              <Input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Bir soru sorun veya analiz isteyin..."
                disabled={loading}
                className="flex-1"
                autoFocus
              />
              <Button type="submit" disabled={loading || !input.trim()} className="gap-2 px-4">
                <Send className="h-4 w-4" />
              </Button>
            </form>
            <p className="text-[10px] text-muted-foreground mt-2 text-center">
              Claude Haiku · Veriler her "Güncelle" butonuna basıldığında yenilenir
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Renders markdown-lite: bold **text**, bullet lists, line breaks
function MessageContent({ content }: { content: string }) {
  const lines = content.split('\n')
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />
        // Bullet
        if (line.match(/^[-•*]\s/)) {
          return (
            <div key={i} className="flex gap-2">
              <span className="flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-current opacity-50" />
              <span>{renderInline(line.replace(/^[-•*]\s/, ''))}</span>
            </div>
          )
        }
        // Numbered list
        if (line.match(/^\d+\.\s/)) {
          const num = line.match(/^(\d+)\.\s/)?.[1]
          return (
            <div key={i} className="flex gap-2">
              <span className="flex-shrink-0 font-semibold text-xs opacity-60 min-w-[16px]">{num}.</span>
              <span>{renderInline(line.replace(/^\d+\.\s/, ''))}</span>
            </div>
          )
        }
        // Heading (## or #)
        if (line.startsWith('## ')) return <p key={i} className="font-bold text-sm mt-2">{line.slice(3)}</p>
        if (line.startsWith('# ')) return <p key={i} className="font-bold mt-2">{line.slice(2)}</p>
        return <p key={i}>{renderInline(line)}</p>
      })}
    </div>
  )
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*.*?\*\*)/g)
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  )
}
