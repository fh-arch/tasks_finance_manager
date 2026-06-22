import { Badge } from '@/components/ui/badge'

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' }> = {
  pending: { label: 'Bekliyor', variant: 'warning' },
  partial: { label: 'Kısmi', variant: 'info' },
  paid: { label: 'Ödendi', variant: 'success' },
  overdue: { label: 'Gecikmiş', variant: 'destructive' },
  disputed: { label: 'İtirazlı', variant: 'secondary' },
  completed: { label: 'Tamamlandı', variant: 'success' },
  cancelled: { label: 'İptal', variant: 'secondary' },
  active: { label: 'Aktif', variant: 'success' },
  paused: { label: 'Durduruldu', variant: 'warning' },
  trial: { label: 'Deneme', variant: 'info' },
  draft: { label: 'Taslak', variant: 'secondary' },
  sent: { label: 'Gönderildi', variant: 'info' },
  accepted: { label: 'Kabul Edildi', variant: 'success' },
  rejected: { label: 'Reddedildi', variant: 'destructive' },
  expired: { label: 'Süresi Doldu', variant: 'secondary' },
  open: { label: 'Açık', variant: 'info' },
  converted: { label: 'Dönüştürüldü', variant: 'success' },
  reconciled: { label: 'Mutabık', variant: 'success' },
  income: { label: 'Gelir', variant: 'success' },
  expense: { label: 'Gider', variant: 'destructive' },
}

export function StatusBadge({ status }: { status: string }) {
  const s = statusMap[status] ?? { label: status, variant: 'outline' as const }
  return <Badge variant={s.variant}>{s.label}</Badge>
}
