# FinansApp — Proje Planlama Dokümanı v2

> React + Supabase + Contabo VPS  
> Hazırlayan: Claude (planlama), geliştirme: VS Code + Claude Code

---

## 1. Proje Özeti

Küçük işletme / girişimci odaklı finansal yönetim web uygulaması. Gelir-gider takibi, iki yönlü abonelik yönetimi (gider abonelikleri + müşteriye satılan abonelikler), alacak/borç mutabakatı, cari hesap sistemi, teklif yönetimi ve belge yükleme içerir.

---

## 2. Teknoloji Stack

| Katman | Seçim | Notlar |
|---|---|---|
| Frontend | React 18 + Vite | TypeScript |
| UI | Tailwind CSS + shadcn/ui | |
| Backend / DB | Supabase | Auth + Postgres + Storage |
| Dosya depolama | Supabase Storage | PDF, PNG, JPG — max 10MB |
| Deploy | Contabo VPS | Nginx + static serving |
| State | React Query + Zustand | Sunucu/UI state ayrımı |
| Form | React Hook Form + Zod | |
| Grafik | Recharts | |
| Tarih | date-fns | Türkçe locale |
| PDF üretimi | @react-pdf/renderer | Teklif PDF export |

---

## 3. Temel Kavramlar & İlişkiler

```
contacts (Cari Hesaplar)
    |
    |-- receivables (Alacaklar)         <- mutabakattan veya doğrudan veya tekliften
    |-- payables (Ödenecekler)          <- mutabakattan veya doğrudan
    |-- customer_subscriptions          <- bize ödeme yapan abonelikler
    |-- quotes (Teklifler)              <- onaylanınca receivable'a dönüşür
    `-- current_account_entries         <- cari hesap hareketleri

subscriptions (Gider Aboneliklerimiz)  <- bizim ödediğimiz (AWS, Figma vb.)
    `-- transaction olarak kayıt

reconciliations (Mutabakatlar)
    `-> receivable veya payable'a dönüştür (aksiyon butonu)
```

---

## 4. Veritabanı Şeması

### 4.1 profiles
```sql
id uuid references auth.users primary key
full_name text
company_name text
currency text default 'TRY'
created_at timestamptz default now()
```

### 4.2 categories
```sql
id uuid primary key default gen_random_uuid()
user_id uuid references profiles(id)
name text not null
type text check (type in ('income','expense'))
color text
```

### 4.3 contacts — YENİ (Cari Hesaplar)
```sql
id uuid primary key default gen_random_uuid()
user_id uuid references profiles(id)
type text check (type in ('customer','supplier','both')) default 'customer'
name text not null
tax_number text
tax_office text
email text
phone text
address text
city text
notes text
credit_limit numeric(12,2)
current_balance numeric(12,2) default 0   -- trigger ile güncellenir
is_active boolean default true
created_at timestamptz default now()
```

### 4.4 current_account_entries — YENİ (Cari Hareketler)
```sql
id uuid primary key default gen_random_uuid()
user_id uuid references profiles(id)
contact_id uuid references contacts(id)
entry_type text check (entry_type in ('debit','credit'))
  -- debit  = müşteri borçlandı (alacak doğdu)
  -- credit = müşteri ödedi (alacak kapandı)
amount numeric(12,2) not null
description text
entry_date date default current_date
related_type text   -- 'receivable' | 'payable' | 'transaction' | 'quote'
related_id uuid
created_at timestamptz default now()
```

### 4.5 transactions
```sql
id uuid primary key default gen_random_uuid()
user_id uuid references profiles(id)
contact_id uuid references contacts(id)   -- cari bağlantısı (opsiyonel)
category_id uuid references categories(id)
type text check (type in ('income','expense'))
amount numeric(12,2) not null
currency text default 'TRY'
description text
transaction_date date not null
payment_method text
status text check (status in ('completed','pending','cancelled')) default 'completed'
notes text
created_at timestamptz default now()
```

### 4.6 subscriptions — Gider Abonelikleri (Bizim Ödediklerimiz)
```sql
id uuid primary key default gen_random_uuid()
user_id uuid references profiles(id)
category_id uuid references categories(id)
name text not null                  -- "AWS", "Figma", "Office 365"
amount numeric(12,2) not null
currency text default 'TRY'
billing_cycle text check (billing_cycle in ('monthly','quarterly','yearly'))
next_billing_date date not null
start_date date
end_date date
status text check (status in ('active','paused','cancelled')) default 'active'
auto_renew boolean default true
notes text
created_at timestamptz default now()
```

### 4.7 customer_subscriptions — YENİ (Müşteriye Sattığımız Abonelikler)
```sql
id uuid primary key default gen_random_uuid()
user_id uuid references profiles(id)
contact_id uuid references contacts(id) not null
plan_name text not null             -- "İngilizce Kursu Aylık", "Eddy Paketi"
amount numeric(12,2) not null
currency text default 'TRY'
billing_cycle text check (billing_cycle in ('monthly','quarterly','yearly'))
start_date date not null
end_date date
next_billing_date date not null
status text check (status in ('active','paused','cancelled','trial')) default 'active'
auto_create_receivable boolean default true
notes text
created_at timestamptz default now()
```

### 4.8 receivables (Alacaklar)
```sql
id uuid primary key default gen_random_uuid()
user_id uuid references profiles(id)
contact_id uuid references contacts(id)
category_id uuid references categories(id)
amount numeric(12,2) not null
currency text default 'TRY'
due_date date
issue_date date default current_date
description text
status text check (status in ('pending','partial','paid','overdue','disputed')) default 'pending'
paid_amount numeric(12,2) default 0
invoice_number text
source_type text   -- 'manual' | 'reconciliation' | 'customer_subscription' | 'quote'
source_id uuid
notes text
created_at timestamptz default now()
```

### 4.9 payables (Borçlar / Ödenecekler)
```sql
id uuid primary key default gen_random_uuid()
user_id uuid references profiles(id)
contact_id uuid references contacts(id)
category_id uuid references categories(id)
amount numeric(12,2) not null
currency text default 'TRY'
due_date date
issue_date date default current_date
description text
status text check (status in ('pending','partial','paid','overdue')) default 'pending'
paid_amount numeric(12,2) default 0
source_type text   -- 'manual' | 'reconciliation' | 'subscription'
source_id uuid
notes text
created_at timestamptz default now()
```

### 4.10 reconciliations (Mutabakatlar)
```sql
id uuid primary key default gen_random_uuid()
user_id uuid references profiles(id)
contact_id uuid references contacts(id)    -- hangi cari ile mutabakat
title text not null
period_start date
period_end date
our_balance numeric(12,2)                  -- bizim defterimizdeki bakiye
their_balance numeric(12,2)                -- karşı tarafın bildirdiği bakiye
difference numeric(12,2) generated always as (our_balance - their_balance) stored
status text check (status in ('open','converted','reconciled')) default 'open'
converted_to text                          -- 'receivable' | 'payable'
converted_id uuid
notes text
created_at timestamptz default now()
```

### 4.11 quotes — YENİ (Teklifler)
```sql
id uuid primary key default gen_random_uuid()
user_id uuid references profiles(id)
contact_id uuid references contacts(id)
quote_number text not null              -- "TKF-2026-001" (otomatik)
title text not null
issue_date date default current_date
valid_until date
status text check (status in ('draft','sent','accepted','rejected','expired')) default 'draft'
subtotal numeric(12,2)
tax_rate numeric(5,2) default 20
tax_amount numeric(12,2)
total numeric(12,2)
currency text default 'TRY'
notes text
converted_to_receivable boolean default false
receivable_id uuid references receivables(id)
created_at timestamptz default now()
```

### 4.12 quote_items — YENİ (Teklif Kalemleri)
```sql
id uuid primary key default gen_random_uuid()
quote_id uuid references quotes(id) on delete cascade
description text not null
quantity numeric(10,2) default 1
unit_price numeric(12,2) not null
discount_percent numeric(5,2) default 0
line_total numeric(12,2)   -- quantity * unit_price * (1 - discount/100)
sort_order integer default 0
```

### 4.13 documents
```sql
id uuid primary key default gen_random_uuid()
user_id uuid references profiles(id)
related_type text   -- 'transaction'|'receivable'|'payable'|'subscription'|'quote'|'contact'
related_id uuid
file_name text not null
file_path text not null
file_type text
file_size integer
uploaded_at timestamptz default now()
```

### 4.14 RLS — Tüm tablolara uygulanacak
```sql
-- Her tablo için aynı pattern:
alter table contacts enable row level security;
create policy "users see own data" on contacts
  for all using (auth.uid() = user_id);
```

---

## 5. Uygulama Modülleri & Sayfalar

### 5.1 Dashboard (/)
- Aylık gelir/gider özeti + grafik
- Bu ay tahsil edilecek alacaklar
- Yaklaşan gider abonelik ödemeleri (7 gün)
- Yaklaşan müşteri abonelik yenilemeleri (7 gün)
- Bekleyen teklifler (onay bekliyor)
- Nakit akış tahmini (30 gün)

### 5.2 Cari Hesaplar (/contacts) — YENİ
- Müşteri / tedarikçi / ikisi listesi
- "Yeni Cari Aç" butonu (form modal)
- Kart veya tablo görünümü
- Her carinin anlık bakiyesi
- Cari Detay (/contacts/:id):
  - Genel bilgiler sekmesi
  - Cari ekstre (tüm hareketler)
  - Alacaklar sekmesi
  - Borçlar sekmesi
  - Aktif müşteri abonelikleri
  - Teklifler
  - Mutabakatlar
  - Yüklü belgeler

### 5.3 Teklifler (/quotes) — YENİ
- Teklif listesi (durum filtreleri)
- Yeni teklif formu:
  - Cari seç veya yeni oluştur
  - Kalem ekle (açıklama, adet, birim fiyat, iskonto)
  - KDV otomatik hesapla (%20 varsayılan)
  - Notlar / şartlar
  - Numara otomatik: TKF-2026-001
- PDF indir / gönder
- "Teklifi Onayla → Alacağa Dönüştür" (tek tıkla)
- Süresi dolmuş teklifler otomatik "expired" durumuna geçer

### 5.4 Abonelikler (/subscriptions)

**Sekme 1 — Gider Abonelikleri (Bizim Ödediklerimiz)**
- AWS, Figma, Office 365 vb.
- Aylık/yıllık toplam maliyet
- Yaklaşan ödeme uyarıları

**Sekme 2 — Müşteri Abonelikleri (Bize Ödeyenler)**
- Müşteri, plan, tutar, sonraki yenileme tarihi
- "Yenileme Geldi → Alacak Oluştur" butonu (manuel)
- Otomatik alacak oluşturma toggle (Edge Function ile)
- Aktif / duraklatıldı / iptal filtreleri

### 5.5 Alacaklar (/receivables)
- Tablo: cari, tutar, vade, ödenen, kalan, durum, kaynak
- Kaynak badge: manuel / mutabakattan / abonelikten / tekliften
- Kısmi ödeme → cari hesaba otomatik hareket
- Fatura/dekont PDF bağlama
- Toplu durum güncelleme

### 5.6 Borçlar (/payables)
- Alacaklar ile aynı yapı, tedarikçi odaklı
- Ödeme yapıldı → cari hesaba hareket ekle

### 5.7 Mutabakatlar (/reconciliation)
- Dönem ve cari seç
- Bakiyeleri gir (bizim / onların)
- Fark görseli
- "Alacağa Dönüştür" / "Borca Dönüştür" aksiyon butonu
- Kapalı / dönüştürüldü / açık filtreleri

### 5.8 İşlemler (/transactions)
- Gelir-gider hareketleri
- Cari bağlama opsiyonel
- Belge ekleme

### 5.9 Belgeler (/documents)
- Tüm yüklü dosyalar (ilgili kayıt linki)
- PDF önizleme (iframe)
- Görsel lightbox

### 5.10 Raporlar (/reports)
- Aylık/yıllık gelir-gider tablosu
- Kategori bazlı pasta grafik
- Alacak yaşlandırma raporu (0-30, 31-60, 61-90, 90+ gün)
- Cari ekstre PDF (seçili cari için)
- Nakit akış tahmini

### 5.11 Ayarlar (/settings)
- Profil / şirket bilgileri
- Kategori yönetimi CRUD
- Teklif şablonu (logo, standart notlar)
- Para birimi tercihi

---

## 6. Önemli İş Mantıkları

### Mutabakat → Alacak/Borç Dönüşümü
```
Kullanıcı "Dönüştür" butonuna basar:
  difference > 0 (onlar bize borçlu):
    → INSERT INTO receivables (source_type='reconciliation', source_id=reconciliation.id, contact_id=...)
    → INSERT INTO current_account_entries (entry_type='debit', ...)
    → UPDATE reconciliations SET status='converted', converted_to='receivable', converted_id=...

  difference < 0 (biz onlara borçluyuz):
    → INSERT INTO payables (source_type='reconciliation', source_id=reconciliation.id, contact_id=...)
    → INSERT INTO current_account_entries (entry_type='credit', ...)
    → UPDATE reconciliations SET status='converted', converted_to='payable', converted_id=...
```

### Müşteri Aboneliği → Alacak
```
Manuel: "Yenileme Geldi" butonu
  → INSERT INTO receivables (amount, contact_id, source_type='customer_subscription', source_id=...)
  → UPDATE customer_subscriptions SET next_billing_date += interval '1 month' (veya quarter/year)
  → INSERT INTO current_account_entries (entry_type='debit', ...)

Otomatik (Sprint 4+ opsiyonel):
  → Supabase Edge Function + pg_cron
  → Her gün: next_billing_date = today olan aktif abonelikler için receivable oluştur
```

### Teklif → Alacak
```
Kullanıcı "Onayla" butonuna basar:
  → UPDATE quotes SET status='accepted', converted_to_receivable=true
  → INSERT INTO receivables (amount=quote.total, contact_id=quote.contact_id,
      source_type='quote', source_id=quote.id)
  → INSERT INTO current_account_entries (entry_type='debit', ...)
  → receivable_id geri yaz: UPDATE quotes SET receivable_id=...
```

### Cari Bakiye
```
Postgres trigger ile current_balance anlık güncellenir:
  her current_account_entries INSERT/UPDATE/DELETE'te:
    UPDATE contacts SET current_balance = (
      SELECT COALESCE(SUM(CASE WHEN entry_type='debit' THEN amount ELSE -amount END), 0)
      FROM current_account_entries
      WHERE contact_id = contacts.id
    )
  
  pozitif = müşteri bize borçlu
  negatif = biz müşteriye borçluyuz
```

---

## 7. Supabase Storage Yapısı

```
finans-bucket/ (private)
  {user_id}/
    contacts/{contact_id}/
    transactions/{transaction_id}/
    receivables/{receivable_id}/
    payables/{payable_id}/
    quotes/{quote_id}/
    subscriptions/{subscription_id}/
```

Storage RLS politikası:
```sql
create policy "user owns folder"
on storage.objects for all
using (auth.uid()::text = (storage.foldername(name))[1]);
```

---

## 8. Frontend Klasör Yapısı

```
src/
  components/
    ui/                          -- shadcn/ui
    layout/
      Sidebar.tsx
      TopBar.tsx
    shared/
      DataTable.tsx
      DocumentUploader.tsx
      StatusBadge.tsx
      AmountDisplay.tsx
      ContactSelector.tsx        -- searchable dropdown, tüm formlarda kullanılır
      SourceBadge.tsx            -- kaynak göstergesi (manuel/abonelik/teklif/mutabakat)
      ConvertModal.tsx           -- mutabakat dönüşüm modalı
  pages/
    Dashboard/
    Contacts/
      index.tsx
      ContactForm.tsx
      ContactDetail.tsx
      CurrentAccountLedger.tsx
    Quotes/
      index.tsx
      QuoteForm.tsx
      QuoteItems.tsx
      QuotePDF.tsx
    Subscriptions/
      index.tsx
      ExpenseSubscriptions.tsx
      CustomerSubscriptions.tsx
    Receivables/
      index.tsx
      ReceivableForm.tsx
      PartialPaymentModal.tsx
    Payables/
      index.tsx
    Reconciliation/
      index.tsx
      ReconciliationForm.tsx
    Transactions/
    Documents/
    Reports/
    Settings/
  hooks/
    useContacts.ts
    useCurrentAccount.ts
    useQuotes.ts
    useSubscriptions.ts
    useCustomerSubscriptions.ts
    useReceivables.ts
    usePayables.ts
    useReconciliations.ts
    useTransactions.ts
    useDashboardStats.ts
  lib/
    supabase.ts
    utils.ts
    quoteNumber.ts               -- TKF-YYYY-NNN otomatik numara üretimi
  types/
    index.ts
  store/
    useAppStore.ts
```

---

## 9. Sprint Planı

### Sprint 1 — Altyapı & Auth (2-3 gün)
- [ ] Vite + React + TS + Tailwind + shadcn/ui
- [ ] Supabase proje oluştur, tüm migration'ları çalıştır
- [ ] RLS tüm tablolara
- [ ] Auth sayfası (email/password)
- [ ] Layout: Sidebar + TopBar
- [ ] Storage bucket + politika

### Sprint 2 — Cari Hesaplar (2 gün)
- [ ] Contacts listesi (tablo + kart toggle)
- [ ] Yeni Cari Aç formu
- [ ] ContactDetail sayfası (tab yapısı)
- [ ] CurrentAccountLedger (ekstre)
- [ ] Bakiye trigger (Postgres)
- [ ] ContactSelector shared komponenti

### Sprint 3 — Teklifler (2-3 gün)
- [ ] Teklif listesi
- [ ] QuoteForm (kalem ekle/çıkar, KDV hesabı)
- [ ] Otomatik teklif numarası
- [ ] PDF export (@react-pdf/renderer)
- [ ] "Onayla → Alacağa Dönüştür" aksiyonu

### Sprint 4 — Abonelikler (2 gün)
- [ ] Gider abonelikleri (Sekme 1)
- [ ] Müşteri abonelikleri (Sekme 2)
- [ ] "Yenileme Geldi → Alacak Oluştur" butonu
- [ ] Yaklaşan yenileme uyarıları

### Sprint 5 — Alacaklar & Borçlar (2-3 gün)
- [ ] Alacak listesi (kaynak badge dahil)
- [ ] Alacak ekle / düzenle
- [ ] Kısmi ödeme + cari hareket entegrasyonu
- [ ] Borçlar aynı yapı
- [ ] Gecikme otomasyonu

### Sprint 6 — Mutabakat (1-2 gün)
- [ ] Mutabakat formu (cari + dönem + bakiyeler)
- [ ] Fark hesaplama görseli
- [ ] "Alacağa / Borca Dönüştür" aksiyonu

### Sprint 7 — İşlemler & Belgeler (1-2 gün)
- [ ] İşlem listesi + form
- [ ] DocumentUploader
- [ ] Belgeler sayfası

### Sprint 8 — Dashboard & Raporlar (2 gün)
- [ ] Dashboard kartları + Recharts grafikleri
- [ ] Alacak yaşlandırma raporu
- [ ] Cari ekstre PDF
- [ ] Nakit akış tahmini

### Sprint 9 — Deploy (1 gün)
- [ ] npm run build
- [ ] Contabo VPS Nginx config
- [ ] SSL (Certbot)
- [ ] .env production
- [ ] Domain yönlendirme

---

## 10. Contabo Deploy

```nginx
server {
    listen 80;
    server_name finans.edunovatech.com;
    root /var/www/finans-app/dist;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
}
```

```bash
npm run build
rsync -avz dist/ user@contabo:/var/www/finans-app/dist/
```

---

## 11. Ortam Değişkenleri

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

---

## 12. Notlar & Kararlar

- Cari bakiye Postgres trigger ile anlık güncellenir.
- Teklif numarası formatı: TKF-YYYY-NNN, yıl başında sıfırlanır.
- Müşteri aboneliği otomatik alacak: başlangıçta manuel butonla; ileride pg_cron ile otomatikleştirilebilir.
- KDV: Teklif modülünde varsayılan %20, değiştirilebilir. Diğer modüllerde şimdilik scope dışı.
- Multi-user: Tek kullanıcı. İleride team_id katmanı eklenebilir.

---

## 13. VS Code + Claude Code Kullanım Rehberi

1. Bu dosyayı projenin root'una koy: PLAN.md
2. Sprint başında: "PLAN.md Sprint X'i uygula. tree: [...]"
3. Migration: "Bölüm 4'teki tabloları supabase/migrations/001_init.sql olarak yaz"
4. İş mantığı: "Bölüm 6 Mutabakat→Alacak dönüşümünü useReconciliations.ts olarak yaz"
5. Teklif PDF: "QuotePDF.tsx'i @react-pdf/renderer ile oluştur, şirket logosu ve kalem tablosu olsun"

---

*Son güncelleme: Haziran 2026 — v2*
*Eklenenler: cari hesap, müşteri aboneliği, teklifler, mutabakat dönüşümü, kaynak takibi*
