import { Badge } from '@/components/ui/badge'

const sourceMap: Record<string, string> = {
  manual: 'Manuel',
  reconciliation: 'Mutabakat',
  customer_subscription: 'Abonelik',
  quote: 'Teklif',
  subscription: 'Abonelik',
}

export function SourceBadge({ source }: { source: string | null }) {
  if (!source) return null
  return <Badge variant="outline">{sourceMap[source] ?? source}</Badge>
}
