# Tazzy Quiz - Supabase Node 18 Fix

Bu paket Supabase verisini @supabase/supabase-js paketi olmadan, Supabase REST API ile saklar.
Bu sayede Render Node 18 ortamındaki native WebSocket hatası çözülür.

Render Environment zorunlu değişkenler:

- STORAGE_PROVIDER=supabase
- SUPABASE_URL=https://xxxxx.supabase.co
- SUPABASE_SERVICE_ROLE_KEY=eyJ...
- API_KEY=Google Gemini API key
- MASTER_SIFRE=master panel sifresi
- NODE_VERSION=18 veya 22
- GEMINI_MODEL=gemini-1.5-flash

DATA_DIR=/var/data değişkenini kaldırın.

Supabase SQL Editor'da supabase_kurulum.sql içindeki SQL'i çalıştırın.
Render'da Manual Deploy > Clear build cache & deploy kullanın.
