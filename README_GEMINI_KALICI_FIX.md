# Tazzy Quiz - Gemini Kalıcı Model Fix

Bu sürümde yapay zeka asistanı tek bir Gemini modeline bağlı değildir.

Öncelik sırası:

1. Render Environment içindeki GEMINI_MODEL değeri
2. gemini-flash-latest
3. gemini-3.5-flash
4. gemini-3.1-flash-lite
5. gemini-2.5-flash-lite
6. gemini-2.5-flash
7. API anahtarının erişebildiği modeller listelenip otomatik denenir

Render Environment önerisi:

GEMINI_MODEL=gemini-flash-latest

Alternatif olarak virgülle birden fazla model de yazabilirsiniz:

GEMINI_MODEL=gemini-flash-latest,gemini-3.5-flash,gemini-3.1-flash-lite

Supabase ayarları aynı kalır. DATA_DIR kullanmayın.

Zorunlu Environment değişkenleri:

STORAGE_PROVIDER=supabase
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
API_KEY=...
MASTER_SIFRE=...
NODE_VERSION=18
GEMINI_MODEL=gemini-flash-latest
