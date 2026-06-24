export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> }
      categories: { Row: Category; Insert: Partial<Category>; Update: Partial<Category> }
      contacts: { Row: Contact; Insert: Partial<Contact>; Update: Partial<Contact> }
      current_account_entries: { Row: CurrentAccountEntry; Insert: Partial<CurrentAccountEntry>; Update: Partial<CurrentAccountEntry> }
      transactions: { Row: Transaction; Insert: Partial<Transaction>; Update: Partial<Transaction> }
      subscriptions: { Row: Subscription; Insert: Partial<Subscription>; Update: Partial<Subscription> }
      customer_subscriptions: { Row: CustomerSubscription; Insert: Partial<CustomerSubscription>; Update: Partial<CustomerSubscription> }
      receivables: { Row: Receivable; Insert: Partial<Receivable>; Update: Partial<Receivable> }
      payables: { Row: Payable; Insert: Partial<Payable>; Update: Partial<Payable> }
      reconciliations: { Row: Reconciliation; Insert: Partial<Reconciliation>; Update: Partial<Reconciliation> }
      quotes: { Row: Quote; Insert: Partial<Quote>; Update: Partial<Quote> }
      quote_items: { Row: QuoteItem; Insert: Partial<QuoteItem>; Update: Partial<QuoteItem> }
      documents: { Row: Document; Insert: Partial<Document>; Update: Partial<Document> }
    }
  }
}

export interface Profile {
  id: string
  full_name: string | null
  company_name: string | null
  currency: string
  logo_url: string | null
  created_at: string
}

export interface Category {
  id: string
  user_id: string
  name: string
  type: 'income' | 'expense'
  color: string | null
}

export interface Contact {
  id: string
  user_id: string
  type: 'customer' | 'supplier' | 'both'
  name: string
  tax_number: string | null
  tax_office: string | null
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  notes: string | null
  credit_limit: number | null
  current_balance: number
  is_active: boolean
  parent_id: string | null
  iban: string | null
  bank_name: string | null
  created_at: string
}

export interface CurrentAccountEntry {
  id: string
  user_id: string
  contact_id: string
  entry_type: 'debit' | 'credit'
  amount: number
  description: string | null
  entry_date: string
  related_type: string | null
  related_id: string | null
  created_at: string
}

export type TransactionType = 'income' | 'expense' | 'receivable' | 'payable' | 'adjustment'
export type TransactionStatus = 'completed' | 'pending' | 'cancelled' | 'open' | 'partial' | 'paid'

export interface Transaction {
  id: string
  user_id: string
  contact_id: string | null
  category_id: string | null
  type: TransactionType
  amount: number
  currency: string
  description: string | null
  transaction_date: string
  payment_method: string | null
  status: TransactionStatus
  notes: string | null
  created_at: string
  // Phase 1 yeni alanlar
  due_date: string | null
  paid_amount: number
  tx_category: string | null
  legacy_ref: string | null
  source_type: string | null
  source_id: string | null
  invoice_number: string | null
}

export interface Payment {
  id: string
  user_id: string
  transaction_id: string
  amount: number
  paid_at: string
  method: 'cash' | 'bank' | 'card' | 'check' | 'other' | null
  note: string | null
  created_at: string
}

export interface CashFlowEntry {
  flow_date: string
  user_id: string
  contact_id: string | null
  type: TransactionType
  description: string | null
  flow_amount: number
  method: string | null
  flow_type: 'realized' | 'planned'
  payment_id: string | null
  transaction_id: string
  category: string | null
  legacy_ref: string | null
}

export interface Subscription {
  id: string
  user_id: string
  category_id: string | null
  name: string
  amount: number
  currency: string
  billing_cycle: 'monthly' | 'quarterly' | 'yearly'
  next_billing_date: string
  start_date: string | null
  end_date: string | null
  status: 'active' | 'paused' | 'cancelled'
  auto_renew: boolean
  notes: string | null
  created_at: string
}

export interface CustomerSubscription {
  id: string
  user_id: string
  contact_id: string
  plan_name: string
  amount: number
  currency: string
  billing_cycle: 'monthly' | 'quarterly' | 'yearly'
  start_date: string
  end_date: string | null
  next_billing_date: string
  status: 'active' | 'paused' | 'cancelled' | 'trial'
  auto_create_receivable: boolean
  notes: string | null
  created_at: string
}

// Legacy interfaces — Phase 2'de yavaş yavaş Transaction'a taşınacak
export interface Receivable {
  id: string
  user_id: string
  contact_id: string | null
  category_id: string | null
  amount: number
  currency: string
  due_date: string | null
  issue_date: string
  description: string | null
  status: 'pending' | 'partial' | 'paid' | 'overdue' | 'disputed'
  paid_amount: number
  invoice_number: string | null
  source_type: string | null
  source_id: string | null
  notes: string | null
  created_at: string
}

export interface Payable {
  id: string
  user_id: string
  contact_id: string | null
  category_id: string | null
  amount: number
  currency: string
  due_date: string | null
  issue_date: string
  description: string | null
  status: 'pending' | 'partial' | 'paid' | 'overdue'
  paid_amount: number
  source_type: string | null
  source_id: string | null
  notes: string | null
  created_at: string
}

export type ReconciliationStatus = 'draft' | 'sent' | 'disputed' | 'agreed' | 'converted' | 'closed'

export interface Reconciliation {
  id: string
  user_id: string
  contact_id: string
  reconciliation_number: string
  title?: string | null
  period_start: string
  period_end: string
  our_calculated_balance: number | null
  our_final_balance: number | null
  their_balance: number | null
  notification_method?: string | null
  notification_reference?: string | null
  difference: number | null
  status: ReconciliationStatus
  converted_to?: string | null
  converted_id?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
  contact?: Contact
}

export interface ReconciliationLog {
  id: string
  reconciliation_id: string
  user_id?: string
  old_status?: string | null
  new_status?: string | null
  note?: string | null
  created_at: string
}

export interface Quote {
  id: string
  user_id: string
  contact_id: string | null
  quote_number: string
  title: string
  issue_date: string
  valid_until: string | null
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'
  subtotal: number | null
  tax_rate: number
  tax_amount: number | null
  total: number | null
  currency: string
  notes: string | null
  converted_to_receivable: boolean
  receivable_id: string | null
  created_at: string
}

export interface QuoteItem {
  id: string
  quote_id: string
  description: string
  quantity: number
  unit_price: number
  discount_percent: number
  line_total: number | null
  sort_order: number
}

export interface Partner {
  id: string
  user_id: string
  name: string
  share_percent: number
  notes: string | null
  is_active: boolean
  created_at: string
}

export interface PartnerWithdrawal {
  id: string
  user_id: string
  partner_id: string
  amount: number
  withdrawal_date: string
  description: string | null
  payment_method: string | null
  notes: string | null
  created_at: string
  partner?: Partner
}

export interface PeriodClosing {
  id: string
  user_id: string
  period_year: number
  period_month: number
  opening_balance: number
  total_income: number
  total_expense: number
  total_withdrawals: number
  closing_balance: number
  status: 'closed' | 'reopened'
  notes: string | null
  closed_at: string
  created_at: string
}

export interface Document {
  id: string
  user_id: string
  related_type: string | null
  related_id: string | null
  file_name: string
  file_path: string
  file_type: string | null
  file_size: number | null
  uploaded_at: string
}
