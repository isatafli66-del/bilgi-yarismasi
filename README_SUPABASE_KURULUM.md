# Tazzy Quiz - Supabase Kalıcı Kayıt Kurulumu

Bu sürüm Render Free üzerinde çalışacak şekilde düzenlendi. Kurumlar, quizler, logolar ve ayarlar artık yerel dosyaya değil Supabase `app_data` tablosuna kaydedilir.

## Supabase SQL

Supabase Dashboard > SQL Editor > New query bölümünde `supabase_kurulum.sql` dosyasındaki SQL'i çalıştır.

## Render Environment

Render > Service > Environment bölümünde şu değişkenleri ekle:

```text
STORAGE_PROVIDER=supabase
SUPABASE_URL=Supabase Project URL
SUPABASE_SERVICE_ROLE_KEY=Supabase service_role secret key
API_KEY=Google Gemini API key
MASTER_SIFRE=Master panel şifren
NODE_VERSION=18
GEMINI_MODEL=gemini-1.5-flash
```

Render Free kullanırken `DATA_DIR=/var/data` ekleme. Bu değişkeni varsa sil.

## Render Build/Start

```text
Build Command: npm install
Start Command: npm start
```

## Test

1. Deploy başarılı olsun.
2. `/tazzy-master` adresine gir.
3. Kullanıcı adı: `tazzy`
4. Şifre: Render'da yazdığın `MASTER_SIFRE`
5. Yeni kurum oluştur.
6. Render'da Manual Deploy > Deploy latest commit yap.
7. Kurum hâlâ duruyorsa Supabase kaydı çalışıyor demektir.
