# Tazzy Quiz - Supabase Kalıcı Kayıt Kurulumu

Bu sürüm Render Free üzerinde çalışacak şekilde düzenlendi. Kurumlar, quizler, logolar ve ayarlar artık yerel dosyaya değil Supabase `app_data` tablosuna kaydedilir.

## Supabase SQL

Supabase Dashboard > SQL Editor > New query bölümünde `supabase_kurulum.sql` dosyasındaki SQL'i çalıştır.

## Render Environment

Render > Service > Environment bölümünde şu değişkenleri ekle:

```text
STORAGE_PROVIDER=supabase
SUPABASE_URL=Supabase Project URL
SUPABASE_SECRET_KEY=Supabase secret key (önerilen)
# Mevcut kurulumlarda SUPABASE_SERVICE_ROLE_KEY de desteklenir.
API_KEY=Google Gemini API key
MASTER_SIFRE=Master panel şifren
NODE_VERSION=24
GEMINI_MODEL=Render'da kullandığın güncel Gemini modeli
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
8. Gerçek bir deneme etkinliğini tamamla; `Son 10 Etkinlik` ekranında raporu aç.

Bu sürüm yeni tablo gerektirmez. Sonuçlar mevcut `app_data` tablosunda kurum bazlı
`etkinlik_arsivi_KURUMKODU` anahtarında, yalnızca en son 10 etkinlik olacak şekilde
saklanır. `anon` veya `authenticated` rollerine açık RLS politikası ekleme.


## NPM Build Hatası Notu
Bu pakette `package-lock.json` içindeki paket kaynakları public `https://registry.npmjs.org/` adresine göre düzeltilmiştir. Render build sırasında `packages.applied-caas-gateway...` veya `ETIMEDOUT` hatası alırsanız GitHub'daki eski `package-lock.json` dosyasının tamamen değiştiğinden emin olun.
