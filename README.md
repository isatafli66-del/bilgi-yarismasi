# Tazzy Quiz 1.2.0

Sürüm 1.2.0, önceki canlı yayın özelliklerini koruyarak kuruma özel merkezi soru
havuzu, havuzdan quize bağımsız kopyalama, sürükle-bırak sıralama, filtreleme,
toplu işlemler ve yapay zekâ önizleme düzenlemesi ekler. Ayrıntılı kurulum,
veri yapısı, geçiş ve test bilgileri için
[`README_SORU_HAVUZU_V120.md`](README_SORU_HAVUZU_V120.md) dosyasına bakın.

Bu paket, çalışan Tazzy Quiz sisteminin mevcut görünümünü, Socket.IO oyun akışını,
Supabase JSON kayıt yapısını ve kurum bazlı multi-tenant mantığını koruyarak dört yeni
özellik ekler.

## Eklenen özellikler

### 1. Quiz sorularını düzenleme

Admin panelindeki **Quiz İçeriği** bölümünde her sorunun yanında artık
**Düzenle** butonu bulunur. Buton aşağıdaki alanların tamamını forma yükler:

- Soru metni
- A, B, C ve D seçenekleri
- Doğru cevap
- Görsel bağlantısı

**Değişiklikleri Kaydet** seçildiğinde mevcut soru kimliği korunur ve soru yeni bir
kayıt oluşturulmadan güncellenir. Özellik hem manuel eklenen hem de yapay zekâdan
eklenmiş sorularda aynı şekilde çalışır.

Sunucu boş soru, eksik seçenek veya A/B/C/D dışında doğru cevap kaydetmez.

### 2. Mevcut cevabı ana ve yarışmacı ekranlarına yansıtma

Admin canlı yayın kontrollerinde **Sonraki Soruya Geç** butonundan önce
**Mevcut Sorunun Cevabını Yansıt** butonu bulunur.

Butona basıldığında:

- Aktif sorunun zamanlayıcısı durur.
- O soru için yeni cevap kabulü kapanır; mevcut puanlar değişmez.
- Doğru seçenek ana ekranda ve yarışmacı ekranında yeşil gösterilir.
- Üç yanlış seçenek iki ekranda da kırmızı gösterilir.
- Yarışmacı daha önce cevap verdiyse gizlenen seçenekler sonuç görünümü için yeniden açılır.
- **Sonraki Soruya Geç** ile yeni soru normal süre ve puan akışıyla başlar.

Doğru cevap artık normal `yeni_soru` paketinde istemcilere gönderilmez. Yalnızca
admin cevap yansıtma işlemini yaptığında ayrı `cevap_yansit` olayıyla paylaşılır.

### 3. Soru numarası ve kalan soru bilgisi

Ana ekranda ve yarışmacı ekranında:

```text
5/10 • 5 soru kaldı
```

biçiminde soru sırası gösterilir. Son soruda kalan soru değeri `0` olur.

### 4. Ekran boyutuna göre otomatik sığdırma

Ana ekran ve yarışmacı ekranı; uzun soru metni, uzun cevaplar ve büyük görseller
birlikte kullanıldığında açıldıkları pencerenin kullanılabilir yüksekliğine göre
otomatik olarak yeniden ölçeklenir.

- Görseller en-boy oranı bozulmadan küçültülür.
- Soru ve cevap yazıları yalnızca gerektiğinde kademeli olarak küçültülür.
- Yarışmacı cevapları artık üç satırdan sonra kesilmez.
- Telefon yönü değiştirildiğinde yerleşim yeniden hesaplanır.
- Kısa içeriklerde mevcut büyük ve rahat görünüm korunur.
- Yatay telefon ekranında soru ve görsel solda, cevaplar sağda gösterilir.
- Ana ekrandaki zamanlayıcı soru kutusuyla çakışmaz.

## Değiştirilen dosyalar

```text
server.js
public/admin.html
public/ekran.html
public/index.html
package.json
package-lock.json
README.md
test/contract.test.js
```

Diğer mevcut dosyalar ve logolar pakette korunmuştur.

## Supabase durumu

Bu güncelleme için yeni tablo, kolon, migration veya SQL çalıştırmak gerekmez.
Mevcut tablo aynen kullanılır:

```text
public.app_data
  key         text primary key
  value       jsonb
  updated_at  timestamptz
```

Kurum ayrımı değişmemiştir:

```text
kurumlar
quizler_KURUMKODU
ayarlar_KURUMKODU
```

`public.app_data` üzerinde RLS etkindir. Tarayıcılar Supabase'e doğrudan bağlanmaz;
yalnızca Render üzerindeki sunucu, gizli `SUPABASE_SERVICE_ROLE_KEY` ile REST API'yi
kullanır. Bu nedenle service role anahtarı hiçbir HTML dosyasına yazılmamalı ve
GitHub'a yüklenmemelidir.

## Render ayarları

Mevcut Render servisiyle doğrulanan komutlar:

```text
Build Command: npm install
Start Command: node server.js
Branch: main
Root Directory: boş
```

Gerekli environment değişkenlerinin isimleri:

```text
API_KEY
GEMINI_MODEL
MASTER_SIFRE
NODE_VERSION
STORAGE_PROVIDER
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Mevcut değerleri değiştirmeyin ve ZIP'in içine `.env` eklemeyin. Bu sürüm için
Supabase veya Render tarafında yeni environment değişkeni yoktur.

## GitHub ve Render'a yükleme

1. ZIP'i bilgisayarınızda açın.
2. ZIP içindeki `bilgi-yarismasi-main` klasörünün **içeriğini** GitHub deposunun
   köküne yükleyin; klasörü ikinci bir alt klasör olarak yüklemeyin.
3. Değişiklikleri `main` dalına commit edin.
4. Render otomatik deploy açıksa commit sonrasında deploy başlayacaktır.
5. Otomatik başlamazsa Render'da **Manual Deploy → Deploy latest commit** seçin.
6. Yalnızca eski paket önbellekten gelirse **Clear build cache & deploy** kullanın.

Deploy logunda aşağıdakilere benzer satırlar görülmelidir:

```text
[BILGI] Supabase REST bağlantısı hazır.
Sunucu çalışıyor. Port: ...
Veri saklama modu: supabase
```

## Yerel doğrulama

Bağımlılıkları kurduktan sonra sözleşme ve JavaScript sözdizimi testini çalıştırın:

```text
npm install
npm test
```

Test şunları doğrular:

- `server.js`, `admin.html`, `ekran.html` ve `index.html` JavaScript sözdizimi
- Admin soru düzenleme alanları
- Cevap yansıtma olayının sunucu ve iki istemciye bağlanması
- Doğru/yanlış renk sınıfları
- `soruNo`, `toplamSoru` ve `kalanSoru` sözleşmesi
- Doğru cevabın normal soru paketinden çıkarılması
- Ana ekran ve yarışmacı ekranının dinamik pencere yüksekliğine sığdırılması
- Telefon yön değişiminin ve uzun cevap metinlerinin kesilmeden gösterilmesinin korunması

## Deploy sonrası kabul testi

1. Test kurumuyla admin paneline girin.
2. Bir quiz seçin; manuel ve AI kökenli birer soruyu düzenleyip sayfayı yenileyin.
3. Metin, dört şık, doğru cevap ve görsel bağlantısının Supabase'den yeniden
   yüklendiğini doğrulayın.
4. Quizi canlıya alın ve ana ekranı açın.
5. Bir yarışmacıyı PIN ile bağlayın.
6. İlk soruyu gönderin; iki ekranda `1/toplam` sayacını kontrol edin.
7. Bir cevap verin ve puanın mevcut kurala göre işlendiğini kontrol edin.
8. **Mevcut Sorunun Cevabını Yansıt** butonuna basın.
9. Doğru şıkkın yeşil, diğer şıkların kırmızı ve yarışmacı butonlarının kapalı
   olduğunu kontrol edin.
10. **Sonraki Soruya Geç** ile sayacın arttığını ve sürenin yeniden başladığını
    kontrol edin.
11. Ara skor ve podyum kontrollerini çalıştırarak mevcut akışın korunduğunu doğrulayın.

## Geri dönüş

Beklenmeyen bir durum olursa GitHub'da bu güncellemeden önceki commit'i yeniden
deploy etmek yeterlidir. Veritabanı şeması değişmediği için ayrıca Supabase geri
dönüş işlemi gerekmez.
