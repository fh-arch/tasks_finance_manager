-- quotes tablosuna source_type/source_id ekle (lead → quote otomasyonu için)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS source_id  uuid;

-- profiles tablosuna Google Drive klasör ID'si
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS google_drive_folder_id text;

-- documents tablosuna Drive dosya bilgileri
ALTER TABLE documents ADD COLUMN IF NOT EXISTS drive_file_id  text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS drive_file_url text;
