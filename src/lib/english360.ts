// Nginx proxy üzerinden çağrılır — CORS sorunu olmaz, key server tarafında eklenir
// Gerçek base: https://api.english360.com.tr/api/finance
const BASE = '/e360-api'

const headers = () => ({} as Record<string, string>)

export interface E360Freelancer {
  freelancer_id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
}

export interface E360Balance {
  freelancer_id: string
  first_name: string
  last_name: string
  earned_total: number
  paid_total: number
  balance: number
  last_lesson_date: string | null
  last_payout_date: string | null
  currency: string
}

export interface E360Payout {
  payout_id: string
  freelancer_id: string
  amount: number
  currency: string
  payment_date: string
  method: string | null
  bank_account: string | null
  note: string | null
  created_at: string
}

export interface E360Earning {
  earning_id: string
  freelancer_id: string
  total_amount: number
  currency: string
  lesson_date: string
  student_count: number
  created_at: string
}

export async function fetchFreelancers(since?: string): Promise<E360Freelancer[]> {
  const url = since ? `${BASE}/freelancers?since=${since}` : `${BASE}/freelancers`
  const res = await fetch(url, { headers: headers() })
  if (!res.ok) throw new Error(`English360 /freelancers: ${res.status}`)
  return res.json()
}

export async function fetchBalances(): Promise<E360Balance[]> {
  const res = await fetch(`${BASE}/balances`, { headers: headers() })
  if (!res.ok) throw new Error(`English360 /balances: ${res.status}`)
  return res.json()
}

export async function fetchPayouts(since: string): Promise<E360Payout[]> {
  const res = await fetch(`${BASE}/payouts?since=${since}`, { headers: headers() })
  if (!res.ok) throw new Error(`English360 /payouts: ${res.status}`)
  return res.json()
}

export async function fetchEarnings(since: string): Promise<E360Earning[]> {
  const res = await fetch(`${BASE}/earnings?since=${since}`, { headers: headers() })
  if (!res.ok) throw new Error(`English360 /earnings: ${res.status}`)
  return res.json()
}

// Ödeme yöntemi English360 enum → Türkçe
export function mapPayoutMethod(method: string | null): string {
  const map: Record<string, string> = {
    BankTransfer: 'Havale / EFT',
    Wise: 'Wise (Yurt Dışı)',
    CryptoWallet: 'Kripto',
    Other: 'Diğer',
    None: 'Diğer',
  }
  return method ? (map[method] ?? 'Diğer') : 'Diğer'
}
