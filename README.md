# Tazzy Quiz 1.4.1

## 1.4.1 düzeltmeleri

- Yönetici paneline Kullanım Kılavuzu sekmesi eklendi. Genel kullanım açıklamaları
  bu sekmede toplandı; işlem sırasında gerekli hata ve onay mesajları korundu.
- Havuzdaki kutuları işaretleyip Seçilenleri Havuzdan Sil ile toplu silin.
  Görünenleri Seç filtreye uyanları seçer; Seçimi Kaldır tüm seçimleri temizler.
  Filtre arkasındaki seçimler onayda belirtilir. Silme kalıcıdır; quizlerdeki
  bağımsız kopyaları ve canlı oturumu değiştirmez. İşlem başına sınır 10000 sorudur.
- Oyuna Gir düğmesinin tema rengiyle arka plana karışması düzeltildi.
  Beyaz zemin, koyu yazı ve belirgin odak çerçevesi kullanılır. Giriş alanı küçük
  ekranlarda kaydırılır; daralan yükseklikte butona erişilebilir.
- PWA önbellek sürümü yenilendi. Yönetici ve telefon sayfalarını yenileyin;
  ana ekrana eklenmiş uygulamayı gerekirse kapatıp yeniden açın.
- Yeni tablo, ortam değişkeni veya migration yok. Mevcut Node 24 ayarı korunur.


Bu sürüm mevcut Render + Supabase + Socket.IO mimarisini ve kurum ayrımını korur.
Soru havuzu, bağımsız quiz kopyaları, sürükle-bırak sıralama, AI soru hazırlama,
manuel cevap, kişisel sonuç, optik tablo, PWA ve logo alanları korunmuştur.

**Bu sürümde sonuç arşivi, ödeme, abonelik veya paket limiti yoktur.**
Ticari hazırlık kapsamı yalnızca etkinlik şablonları ve kurum temalarıdır.

## Yeni özelliklerin kullanımı

### 1. Canlı oturum kurtarma

Gerçek oturumun PIN'i, quizin bağımsız anlık kopyası, soru sırası, puanlar, verilen
cevaplar, kalan süre ve yayın aşaması geçici olarak Supabase'e yazılır.
Sunucu yeniden açıldığında süre **duraklatılmış** olarak geri gelir.
Admin → Canlı Yayın → **Kurtarılan Oturumu Devam Ettir** ile devam edilir.
Lobi, soru, süre sonu, cevap yansıtma, ara skor, kapanış ve podyum görünümleri korunur.

- Yarışmacı aynı cihaz/tarayıcıda kaldığında bağlantısı otomatik yenilenir.
  Sayfayı tamamen yenilerse **Son Oyuna Tek Dokunuşla Dön** düğmesini kullanabilir.
- Aynı cevap yeniden gönderilse bile ikinci kez puan verilmez.
- “Cevabın sunucuya kaydedildi” onayı, kalıcı yazma tamamlandıktan sonra gönderilir.
- Süre için yaklaşık 5 saniyelik kontrol noktaları kullanılır. Ani kapanmada kalan
  süre son kayda dönebilir; bu nedenle kurtarma otomatik olarak soru başlatmaz.
- Normal Render kapatmasında son durum kaydedilmeye çalışılır.
- Yedekleme sorunu Yayın Sağlığı bölümünde gösterilir; internet/veritabanı kesintisi
  sırasında henüz onaylanmamış işlemlerin kurtarılması garanti edilemez.
- **Quizi Bitir** geçici kurtarma kaydını siler. Kullanılmayan kayıtlar son kayıttan
  12 saat sonra, çalışan sunucuda dakika bazlı temizlikte veya sonraki açılışta silinir.
  Sunucu uyuyorsa fiziksel temizlik yeniden açılınca yapılır.
- Sonuçlar yalnızca oturum açıkken kurtarma kopyasında bulunabilir. Bitirme sonrası
  sunucuda sonuç arşivi tutulmaz; açık admin sayfasındaki son tablo o anda indirilebilir.

**Tek Render instance / tek Node süreci kullanılmalıdır.** Çoklu instance için
paylaşımlı Socket.IO adaptörü, dağıtık kilit ve oturum sahipliği ayrıca gerekir.
Bu sürüm mevcut tek-instance yapısı içindir.

### 2. Yayın Öncesi Kontrol Merkezi

Admin → Hazırlık → quiz seç → **Yayın Kontrolünü Çalıştır**:

- Soru, dört seçenek ve doğru cevap kontrolü
- Yinelenen soru/seçenek ve uzun metin uyarıları
- Aynı doğru şıkkın uzun seri halinde tekrarlanması
- Kurum logosu, ana ekran bağlantısı, bağlı yarışmacı sayısı
- Yaklaşık etkinlik süresi
- HTTPS / güvenli gömülü görsel kontrolü ve tarayıcıda gerçek yükleme testi

Eksik veya güvensiz içerikle yayın başlatılamaz. Uzun metin ve bağlantı uyarıları
yöneticiye gösterilir. Harici görseller sonradan bozulabilir; mümkünse optimize
edilmiş dosya yükleyin. Ön kontrolün başarılı olması internet servislerinin sonraki
anlarda çalışacağının garantisi değildir.

### 3. Prova modu

**Prova Başlat** üç demo yarışmacısıyla (Doğru / Karma / Boş) yayın akışını dener.
Gerçek yarışmacı kabul etmez, kalıcı oturum kaydı üretmez, soruları değiştirmez.
Aktif gerçek yarışma varken prova engellenir; önce gerçek oturumu bitirmek gerekir.
Prova ayrıca ücretli AI çağrısı yapmaz.

### 4. Bağlantı sağlığı ve bekleme ekranı

- Admin: ana ekran bağlantısı, çevrimiçi/kopuk yarışmacılar, son güvenli yedek
- Ana ekran ve telefon: bağlantı/gecikme göstergesi ve yeniden bağlanma bildirimi
- Lobi: kurum kimliği, etkinlik başlığı, karşılama, QR, PIN, katılımcı sayıları
- Admin: isteğe bağlı başlangıç geri sayımı (en fazla 60 dakika)

Geri sayım bittiğinde “Birazdan başlıyor…” görünür; sorular **kendiliğinden başlamaz**.

### 5. Telefon tercihleri ve görsel düzen

Yarışmacı menüsünden ses, titreşim ve yumuşak geçiş tercihleri değiştirilebilir.
Tercihler cihazda tutulur; işletim sisteminin hareket azaltma ayarı dikkate alınır.
Ses tarayıcı etkileşimi gerektirebilir. Titreşim desteklenmeyen cihazlarda, özellikle
iPhone/iOS'ta çalışmayabilir; bu durumda oyun normal devam eder.
PWA kurulumu Android'de kurulum istemi, iOS'ta Paylaş → Ana Ekrana Ekle ile yapılır.

Kurum logosu soru bilgi çubuğunda ayrı alan kullanır. QR ve PIN ortak kartta,
katılım bilgileri ve sayaç kartın altında gösterilir. Uzun soru/şıklar küçültülür;
yatay telefonda soru-görsel ve şıklar yan yana yerleşir. Aşırı uzun içerik küçük
ekranda okunabilirliği düşürür: kontrol merkezindeki uyarıları dikkate alın.

### 6. Görsel optimizasyonu

Soru düzenleme alanlarında JPEG/PNG/WebP dosyası seçilebilir. En fazla 15 MB giriş,
en fazla 1200×900 piksel çıkış ve yaklaşık 600.000 karakterlik gömülü görsel sınırı
uygulanır. Görsel tarayıcıda yeniden kodlanır; boyutu düşer, metadata taşınmaz.
SVG / çalıştırılabilir içerik kabul edilmez. Sunucu harici görsellere proxy yapmaz.
MASTER kurum logo yüklemesi mevcut bağımsız alanından devam eder.

### 7. Etkinlik şablonları ve temalar

Dört şablon, beşer örnek soruyla bağımsız quiz taslağı oluşturur:

- Otel ve misafir hizmetleri
- Ekip çalışması ve iletişim
- Genel kültür
- Kurumsal oryantasyon

Taslakları kurumunuza göre düzenleyip kontrol edin. Şablondan üretilen quizlerin
birbirleriyle bağı yoktur.

Admin → Hazırlık → Kurum Teması bölümünde başlık, karşılama/kapanış, ana/vurgu/arka
plan renkleri ve hareket/ses varsayılanları değiştirilebilir. MASTER ekranında da
kurum bazlı aynı alanlar vardır. Logo ve kurum erişimi yalnızca MASTER'da yönetilir.

## Güvenlik ve veri yapısı

Mevcut `public.app_data(key text, value jsonb, updated_at timestamptz)` kullanılır.
**Yeni tablo, kolon veya migration gerekmez.**

Mevcut anahtarlar korunur: `kurumlar`, `quizler_KURUM`, `ayarlar_KURUM`,
`soru_havuzu_KURUM`, `soru_havuzu_meta_KURUM`.
Geçici kurtarma: `aktif_oyun_KURUM` ve `aktif_oyun_indeksi`.

- RLS açık kalmalıdır. Tabloya public/anon okuma-yazma politikası eklemeyin.
- Service-role anahtarı yalnızca Render ortamındadır; tarayıcıya/ZIP'e/GitHub'a konmaz.
- Admin ve MASTER Socket.IO işlemleri imzalı, HttpOnly oturumla doğrulanır.
- Kurum kimliği istemcinin beyanına göre yetki vermez. Kurumlar arası işlem reddedilir.
- Kurum pasifleştirme, bitiş tarihi veya şifre değişimi mevcut socket yetkisini iptal eder.
- Giriş/mesaj deneme limitleri ve aynı-origin bağlantı kontrolü uygulanır.
- HTML doğrudan admin/master dosya yollarından sunulmaz; korumalı yollar kullanılır.
- PWA yalnızca izinli herkese açık dosyaları önbellekler; admin, sonuç ve canlı trafik
  önbelleğe alınmaz.
- Bu önlemler bağımsız sızma testi veya DDoS korumasının yerini tutmaz.

İlk v1.3 → v1.4 geçişini aktif yarışma yokken yapın: v1.3 canlı bellek için kalıcı
kurtarma kopyası üretmez. Güncelleme sonrası admin sayfasını yenileyip gerekirse
yeniden giriş yapın; tüm ekranların aynı sürümü yüklediğinden emin olun.

## Kurulum / dağıtım

Mevcut Render: main dalı, proje kökü boş, `npm install`, `node server.js`.
Tekrarlanabilir yerel kurulum için:

```text
npm ci
npm test
npm audit --omit=dev
```

Mevcut ortam değişkenleri:
`STORAGE_PROVIDER=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`MASTER_SIFRE`, `NODE_VERSION`, `API_KEY`, `GEMINI_MODEL`.
Yeni zorunlu değişken yoktur. İstenirse güçlü bağımsız `SESSION_SECRET` kullanılabilir;
yoksa mevcut MASTER_SIFRE imza anahtarıdır. Boş anahtarla sunucu başlamaz.
Üretim NODE_VERSION değeri bu sürümün güvenlik kontrolünde 18'den 24 LTS'ye yükseltilmiştir.
Yerel testler Node 24 ile yapılır; destek dışı Node 18/20 kullanmayın.

Yerelde `STORAGE_PROVIDER=file`, `MASTER_SIFRE` ve ayrı `DATA_DIR` belirleyin.
Dosya modu yalnızca yerel test içindir; Render geçici dosya sisteminde kullanmayın.
ZIP'i açıp klasör **içeriğini** repo köküne yükleyin. Ortam sırlarını yüklemeyin.

## Test kapsamı

`npm test`: sözdizimi/sözleşme kontrolleri ve 13 otomatik test.
Bağımsız havuz kopyası, sıralama, eski veri geçişi, normal ve manuel cevap, çift cevap
engeli, kişisel/optik sonuç, quiz bitirme, gerçek HTTP yetki, tenant izolasyonu,
şifre değişimi sonrası yetki iptali, eski soru cevabı reddi, tema izolasyonu,
sunucu yeniden başlatma, yedi yayın aşamasında kurtarma, prova ayrımı ve geçici
kurtarma kaydının bitirme sonrasında silinmesi doğrulanır.

Telefon/projektör tarayıcı kontrolleri ve üretim doğrulaması için sürümle teslim
edilen test raporuna bakın. Gerçek Gemini üretimi, fiziksel telefon titreşimi ve
büyük katılımcı yükü bu otomatik paketin parçası değildir.

## Geri dönüş

Önceki çalışan commit:
`fbfcb999d2edd966bff97a2ef1805c108913b75f` (v1.3).
Şema değişmediğinden eski sürüm dağıtılabilir; ancak v1.3 v1.4 kurtarma kopyalarını
okumaz. Geri dönüşü aktif yarışma dışında yapın. Var olan kurum/soru kayıtlarını
silmeyin. Daha eski özellikler için README_SORU_HAVUZU_V120.md ve ilgili README'ler
pakette korunmuştur.
