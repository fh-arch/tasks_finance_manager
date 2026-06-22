import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'TRY') {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(amount)
}

export function formatDate(date: string | Date) {
  return format(new Date(date), 'dd MMM yyyy', { locale: tr })
}

export function formatDateShort(date: string | Date) {
  return format(new Date(date), 'dd.MM.yyyy')
}
