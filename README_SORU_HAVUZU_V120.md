# Tazzy Quiz 1.2.0 — Merkezi Soru Havuzu

Bu sürüm, çalışan Tazzy Quiz 1.1.2 yapısının canlı yayın, skor, süre, PIN,
cevap yansıtma, kurum logosu, ekran sığdırma, Supabase ve multi-tenant akışlarını
koruyarak merkezi soru havuzu ve sürükle-bırak quiz oluşturucu ekler.

## Temel çalışma kuralı: bağlantı değil, bağımsız kopya

Havuzdan bir quize soru eklendiğinde soru **taşınmaz** ve canlı bir bağlantı
kurulmaz. Sunucu yeni bir soru kimliği üretir; soru metnini, görsel bağlantısını,
A/B/C/D seçeneklerini ve doğru cevabı derin kopya olarak quiz içine yazar.

Bu nedenle:

- Havuzdaki soru düzenlenirse daha önce quizlere kopyalanan sorular değişmez.
- Havuzdaki soru silinirse quiz kopyaları silinmez.
- Quiz kopyası düzenlenirse havuzdaki kaynak değişmez.
- Quiz kopyası quizden çıkarılırsa havuzdaki soru kalır.
- Aynı havuz sorusu birden fazla quize veya onay verilerek aynı quize birden fazla
  kez bağımsız kopyalanabilir.

Quiz kopyasında yalnızca kullanım bilgisini gösterebilmek için `kaynakSoruId`
alanı tutulur. Uygulama bu alanı içerik senkronizasyonu için kullanmaz.

## Admin panelindeki yenilikler

### Kuruma özel soru havuzu

- Manuel soru ekleme ve tüm alanları düzenleme
- Gemini ile soru hazırlama, kaydetmeden önce her taslağı düzenleme
- Tek bir AI taslağını veya tüm taslakları topluca havuza kaydetme
- Soru metni ve cevaplarda arama
- Konu, zorluk, kaynak ve kullanım durumuna göre filtreleme
- En yeni, en eski ve alfabetik sıralama
- Birden fazla soruyu seçip quize topluca kopyalama
- Havuz sorusunun bağımsız bir kopyasını havuzda oluşturma
- Sorunun hangi quizlerde kullanıldığını gösterme
- Aynı içerikte ikinci havuz kaydını engelleme

### Quiz oluşturucu

- Havuz kartını quiz içeriğine sürükleyerek bağımsız kopyalama
- Soru kartını quiz içinde sürükleyerek yeniden sıralama
- Dokunmatik ekranlar için yukarı/aşağı düğmeleri
- Son sıralama işlemini geri alma
- Quiz kopyasında soru, A/B/C/D, doğru cevap ve görsel bağlantısını düzenleme
- Quizden çıkarma işleminin havuz kaydına dokunmaması
- Aynı kaynak zaten quizdeyse ikinci kopyadan önce açık kullanıcı onayı

### Korunan canlı yayın özellikleri

- Quiz başlatma ve yeni PIN oluşturma
- Sonraki soruya geçme, süreyi durdurma, ara puan ve podyum
- Mevcut cevabı yansıtma; doğru seçeneği yeşil, yanlışları kırmızı gösterme
- Ana ekran ve yarışmacı ekranında `x/y` ile kalan soru bilgisi
- Uzun içerik ve büyük görselleri pencereye otomatik sığdırma
- MASTER üzerinden eklenen kurum logosunu çakışmadan gösterme

## Supabase ve multi-tenant veri yapısı

Yeni SQL tablosu, kolon veya RLS değişikliği gerekmez. Mevcut `app_data`
anahtar/değer yapısı kullanılmaya devam eder. Her kurum için aşağıdaki kayıtlar
birbirinden ayrıdır:

```text
quizler_<KURUM_KODU>
ayarlar_<KURUM_KODU>
soru_havuzu_<KURUM_KODU>
soru_havuzu_meta_<KURUM_KODU>
```

`soru_havuzu_<KURUM_KODU>` kaydı sürümlü bir JSON nesnesidir:

```json
{
  "versiyon": 1,
  "sorular": {
    "pool_xxx": {
      "id": "pool_xxx",
      "soru": "Örnek soru",
      "gorsel": null,
      "secenekler": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "dogruCevap": "C",
      "konu": "Genel",
      "zorluk": "Orta",
      "kaynak": "manuel"
    }
  },
  "sira": ["pool_xxx"]
}
```

Sunucu havuz verisini yalnızca admin/havuz işlemlerinde okur. Yarışmacı girişi,
ana ekran ve canlı soru akışı önceki sürümdeki gibi sadece gerekli quiz ve ayar
kayıtlarını okur; bu nedenle canlı akışa gereksiz Supabase gecikmesi eklenmez.

## Mevcut soruların kayıpsız geçişi

Bir kurumun admini 1.2.0 sürümüne ilk kez giriş yaptığında sunucu mevcut quiz
sorularını otomatik olarak o kurumun havuzuna aktarır.

- Quizlerin içeriği, sırası ve soru kimlikleri değiştirilmez.
- Aynı tam içeriğe sahip sorular havuzda tek kayıt olarak tutulur.
- Quiz sorularına yalnızca kaynak bilgisini taşıyan `kaynakSoruId` eklenir.
- İşlem tamamlanınca `soru_havuzu_meta_<KURUM_KODU>` kaydına işaret yazılır ve
  sonraki girişlerde geçiş yeniden çalışmaz.
- Aynı kuruma eşzamanlı iki admin girişi olursa geçiş kurum bazında kilitlenir.

İçerik eşitliği; soru metni, dört seçenek, doğru cevap ve görsel bağlantısının
tamamı üzerinden hesaplanır. Benzer fakat farklı sorular birleştirilmez.

## Render kurulumu

Mevcut Render servisinde yeni ortam değişkeni gerekmez. Var olan değişkenler
korunur:

```text
ADMIN_SIFRE
API_KEY
GEMINI_MODEL
MASTER_SIFRE
NODE_VERSION
STORAGE_PROVIDER
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL
```

Kurulumdan sonra Render'ın `npm install` ve `npm start` akışını çalıştırması
yeterlidir. `package-lock.json`, Socket.IO parser için güvenlik düzeltmesini de
sabitler.

## Yerel doğrulama

Node.js bağımlılıklarını kurup tüm kontrolleri çalıştırın:

```bash
npm install
npm test
npm audit --omit=dev
```

Test paketi şunları doğrular:

- Sunucu ve istemci JavaScript söz dizimi
- Bağımsız derin kopya ve iki yönlü izolasyon
- Havuz silinince quiz kopyasının korunması
- Eski soruların kayıpsız ve tekilleştirilmiş geçişi
- Eksik, yabancı veya tekrarlı sıra dizilerinin reddedilmesi
- Yukarı/aşağı taşıma sınırları
- Gerçek Express + Socket.IO üzerinde havuz, kopyalama, düzenleme, silme,
  toplu kopyalama, sıralama ve canlı soru akışı
- Doğru cevabın normal soru paketinde yarışmacıya erken gönderilmemesi
- `x/y`, cevap yansıtma, ekran sığdırma ve kurum logosu sözleşmeleri

## Güncellenen dosyalar

```text
server.js
soru-havuzu.js
public/admin.html
package.json
package-lock.json
test/contract.test.js
test/havuz.test.js
test/integration.test.js
README.md
README_SORU_HAVUZU_V120.md
```

`public/ekran.html` ve `public/index.html` 1.1.2 sürümündeki cevap yansıtma,
soru numarası, otomatik sığdırma ve kurum logosu düzeltmeleriyle aynen korunur.

## Canlıya alma sonrası hızlı kontrol

1. Bir kurumun admin paneline girin; mevcut quiz sorularının havuzda göründüğünü
   doğrulayın.
2. Havuzdan kullanılmamış bir soruyu quiz sonuna sürükleyin; havuz adedinin
   değişmediğini ve quiz adedinin bir arttığını kontrol edin.
3. Quiz kopyasını düzenleyip havuzdaki kaynak metnin değişmediğini kontrol edin.
4. Havuz kaydını silip quiz kopyasının kaldığını doğrulayın.
5. Quiz sırasını değiştirin, canlıya alın ve ilk sorunun yeni sıraya uyduğunu
   kontrol edin.
6. Ana ekran ve yarışmacı ekranında cevap yansıtma, `x/y`, logo ve pencereye
   sığdırma davranışını kontrol edin.

Bu sürüm Supabase şemasını değiştirmez; yine de üretim güncellemelerinden önce
mevcut `app_data` içeriğinin düzenli yedeğini tutmak iyi işletim uygulamasıdır.
