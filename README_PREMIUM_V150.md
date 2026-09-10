# Tazzy Quiz 1.5.1 — Premium Etkinlik Paketi

## 1.5.1 yönetici paneli düzeni

- Ana Sayfa: kurum profili, lisans özeti ve Marka Stüdyosu.
- Hazırlık: quiz, takım ayarları, anlaşılır manuel soru oluşturucu, isteğe bağlı belge destekli AI asistanı ve soru havuzu.
- Sunucu / Reji: sahne önizlemesi, canlı kontroller ve bağlı/manüel yarışmacı yönetimi.
- Sonuçlar: üstte canlı veya açılan optik rapor, altta son 10 etkinlik arşivi.
- Kullanım Kılavuzu: üst çubuktaki düğmeyle açılan yardım penceresi.

## Bu sürümde neler var?

### Kurum Ana Sayfası

Yönetici ilk olarak kurum Ana Sayfası'na gelir. Kurum kodu, lisans durumu, quiz ve
havuz sayısı, yayın durumu, arşiv doluluğu ve Marka Stüdyosu aynı çalışma alanındadır.
Hazırlık, Sunucu/Reji ve Sonuçlar için üstteki dört sade gezinme düğmesi kullanılır.

### Sunucu / Reji Modu

Reji görünümü; ana ekran canlı önizlemesi, PIN, soru sırası, yanıtlayan kişi sayısı,
ana ekran bağlantısı ve yayın düğmelerini tek yerde toplar. Canlı yayında kullanılabilen
kısayollar: `C` cevap, `→` sonraki soru, `Boşluk` süre, `S` skor, `P` podyum,
`W` güvenli bekleme, `F` tam ekran.

### Marka Stüdyosu 2.0

Kurumun renkleri, etkinlik ve açılış metinleri, yazı tipi, arka plan stili, QR rengi,
sponsor logosu, ses paketi ve podyum stili özelleştirilebilir. MASTER panelindeki ana
kurum logosu korunur. Sponsor ve kurum logosu ayrı güvenli alanlarda gösterilir.

### Son 10 Etkinlik Arşivi ve Premium Rapor

- Prova hariç tamamlanan gerçek etkinlikler kuruma özel arşivlenir.
- Yalnızca en yeni 10 etkinlik tutulur; on birinci kayıtta en eski kayıt kalkar.
- Yarışmacı teknik kimlikleri arşivlenmez.
- Büyük kurum logosu her sonuç kaydına tekrar yazılmaz; rapor indirilirken kurumun
  güncel logosu kullanılır. Bu, depolama tüketimini ciddi biçimde azaltır.
- Yönetici arşiv kaydını açıp ayrıntılı CSV veya kurum logolu PDF görünümünü indirebilir.
- Rapor; final sırası, takım, puan, doğru/yanlış, eşitlik süresi, genel başarı,
  ortalama yanıt süresi, en zor/en kolay soru, soru analizi ve optik tabloyu içerir.

Tarayıcıda Yazdır / PDF düğmesine basıldıktan sonra `PDF olarak kaydet` seçilir.

### Takım Modu ve Eşitlik Kuralı

Bir quiz için 2–12 takım tanımlanabilir. Yarışmacı girişte takımını seçer. Bireysel
puanlar korunurken takım puanı ve takım podyumu da hesaplanır. Eşit puanlarda doğru
cevapların toplam süresi kısa olan yarışmacı/takım üst sıraya yerleşir; ardından tüm
cevapların toplam süresi ve ad sırası güvenli son bağlayıcı olarak kullanılır.

### Yeni soru ve etkileşim türleri

- Çoktan seçmeli (2–6 seçenek)
- Doğru / yanlış
- Birden fazla doğru
- Sıralama
- Anket
- 1–5 puanlama
- Açık uçlu kısa cevap
- Sayısal tahmin ve ± tolerans

Anket ve 1–5 puanlama sıralama puanını değiştirmez. Diğer türlerde cevap anahtarı,
cevap açıklaması, kaynak ve puan çarpanı veri modelinde korunur. Havuzdan quize eklenen
her soru yine bağımsız kopyadır.

### Belge destekli yapay zekâ

Yönetici PDF, Word, PowerPoint, metin veya CSV dosyasından ya da yapıştırdığı kaynak
metninden soru üretebilir. Dosya en fazla 4,5 MB, yapıştırılan metin en fazla 40.000
karakterdir. Belge Tazzy sonuç arşivine veya soru havuzuna dosya olarak kaydedilmez;
yalnızca üretim isteğinde AI sağlayıcısına gönderilir. Üretilen soru, açıklama ve kaynak
bilgisi canlıya alınmadan önce mutlaka insan tarafından doğrulanmalıdır.

### Otelcilik ve kurumsal eğitim paketleri

Misafir deneyimi, gelir yönetimi, hizmet kurtarma, kurumsal satış, iş güvenliği,
oryantasyon, takım iletişimi ve genel kültür şablonları bağımsız quiz taslakları üretir.
Taslak içerik kurumun gerçek prosedürlerine göre düzenlenmeden canlıya alınmamalıdır.

### Yarışmacı ve kapanış deneyimi

Takım ve avatar seçimi, ses/titreşim/hareket tercihleri, büyük metin ve yüksek kontrast,
telefon ana ekranına kurulum, bağlantı durumu, kişisel cevap özeti ve soru türüne özel
kontroller bulunur. Podyum üçüncüden birinciye doğru sahne geçişiyle açılır; eşitlik
süresi gösterilir. Quiz bitirme her aşamada ana ekranı kurum logolu beklemeye,
yarışmacıları güvenli giriş ekranına döndürür.

## Veri yapısı ve Supabase

Yeni tablo veya kolon gerekmez. Mevcut `public.app_data(key text, value jsonb,
updated_at timestamptz)` yapısı ve kurum anahtar ayrımı korunur. Yeni arşiv anahtarı:

```text
etkinlik_arsivi_KURUMKODU
```

RLS açık kalmalı; `anon` veya `authenticated` rollerine açık politika verilmemelidir.
Supabase erişim anahtarı yalnızca Render sunucusunda bulunur. Bu sürüm önce
`SUPABASE_SECRET_KEY`, yoksa geriye dönük uyumluluk için
`SUPABASE_SERVICE_ROLE_KEY` değişkenini kullanır.

## Kurulum ve dağıtım

```text
npm ci
npm test
npm audit --omit=dev
npm start
```

Render ayarları:

```text
STORAGE_PROVIDER=supabase
SUPABASE_URL=...
SUPABASE_SECRET_KEY=...
MASTER_SIFRE=...
SESSION_SECRET=...          # önerilir
API_KEY=...                 # Gemini kullanılacaksa
GEMINI_MODEL=...
NODE_VERSION=24
```

Sırları GitHub'a, ZIP'e veya tarayıcı koduna koymayın. Render'da tek instance / tek
Node süreci kullanın. Güncellemeyi aktif etkinlik yokken yapın. Dağıtım sonrası admin,
ana ekran ve telefon sayfasını yenileyin; kurulu telefon uygulamasını kapatıp yeniden
açın.

## Yayın öncesi kontrol

1. Quiz sorularını, türlerini ve cevap anahtarlarını kontrol edin.
2. Kurum logosu, sponsor ve renkleri ana ekran önizlemesinde doğrulayın.
3. Yayın Öncesi Kontrolü çalıştırın.
4. Prova moduyla soru, cevap, süre, skor ve podyumu deneyin.
5. Reji ekranında ana ekran bağlantısını doğrulayın.
6. Gerçek quizi başlatıp takım kullanılıyorsa telefonda takım seçimini kontrol edin.
7. İlk gerçek etkinlik sonunda arşiv, CSV ve PDF görünümünü kontrol edin.

## Test kapsamı

`npm test`; mevcut havuz, bağımsız kopya, sıralama, çoklu kurum, yetki, kurtarma,
prova, PWA ve canlı yayın sözleşmelerine ek olarak sekiz soru türünü, takım girişini,
yanıt değerlendirmesini, süre eşitliğini, son 10 arşiv sınırını ve kurum izolasyonlu
uçtan uca arşiv akışını doğrular.

Fiziksel telefon titreşimi, gerçek projektör, Gemini ücretli çağrısı ve yüksek eşzamanlı
katılımcı yük testi ayrı saha testleridir.
