import { supabase } from './supabase'

export async function generateQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const { count } = await supabase
    .from('quotes')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', `${year}-01-01`)
  const seq = ((count ?? 0) + 1).toString().padStart(3, '0')
  return `TKF-${year}-${seq}`
}
