import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface AmountDisplayProps {
  amount: number
  currency?: string
  positive?: boolean
  negative?: boolean
  className?: string
}

export function AmountDisplay({ amount, currency = 'TRY', positive, negative, className }: AmountDisplayProps) {
  return (
    <span
      className={cn(
        'font-medium tabular-nums',
        positive && 'text-green-600',
        negative && 'text-red-600',
        className
      )}
    >
      {formatCurrency(amount, currency)}
    </span>
  )
}
