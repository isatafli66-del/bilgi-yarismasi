# Tazzy Quiz 1.5.1 — Doğrulama Raporu

Tarih: 10 Eylül 2026

## Sonuç

Premium sürümün otomatik testleri, paket güvenlik taraması ve yerel tarayıcı
kontrolleri başarılı tamamlandı.

## Otomatik testler

`npm test` başarılıdır. Aşağıdaki eski ve yeni davranışlar birlikte doğrulandı:

- Soru havuzundan quize bağımsız derin kopya ve sürükle sıralaması
- Havuz/quiz silme ayrımı ve toplu havuz silme güvenliği
- Multi-tenant kurum izolasyonu ve admin/MASTER yetkileri
- Canlı soru, cevap yansıtma, süre, manuel cevap, kişisel ve optik sonuç
- Yedi yayın aşamasında canlı oturum kurtarma ve çift puan engeli
- Prova ile gerçek etkinlik ayrımı
- Mobil Oyuna Gir düğmesi, PWA ve kurum logosu sözleşmeleri
- Sekiz soru/etkileşim türünün normalizasyonu ve cevap değerlendirmesi
- Takım seçimi, takım sıralaması ve süreye göre eşitlik bozma
- Etkinlik arşivinin tekrar tekilleştirmesi ve son 10 kayıt sınırı
- Arşivde oyuncu teknik kimliklerinin ve tekrar eden logo verisinin tutulmaması
- Takım katılımı → yeni cevap türü → podyum → arşiv ayrımının uçtan uca akışı

## Güvenlik taraması

`npm audit --omit=dev` sonucu: **0 bilinen güvenlik açığı**.

Kaynak dosyalarda gerçek Supabase anahtarı, Gemini anahtarı veya OpenAI anahtarı
bulunmadığı desen taramasıyla kontrol edildi. Ortam sırları pakete dahil değildir.

## Tarayıcı ile görsel kontrol

Yerel sunucuda gerçek HTML/CSS/Socket.IO yüklemesiyle şu ekranlar açıldı:

- Yarışmacı giriş ekranı: Oyuna Gir görünür, avatarlar ve PWA düğmesi erişilebilir.
- Ana ekran: kurum bekleme görünümü ve bağlantı göstergesi doğru yerleşti.
- Ana Sayfa: kurum profili, lisans özeti, kullanım kartları ve Marka Stüdyosu doğru yerleşti.
- Hazırlık: takım ayarları, tek prova alanı, yönlendirmeli manuel soru türleri,
  üç adımlı AI asistanı, havuz ve bağımsız quiz içeriği birlikte doğru açıldı.
- Sunucu/Reji: sahne iframe önizlemesi, büyük yayın düğmeleri, PIN/soru/yanıtlayan
  göstergeleri, ana ekran bağlantı durumu ve yarışmacı yönetimi doğru göründü.
- Sonuçlar: canlı/son açılan optik sonuç üstte, son 10 etkinlik arşivi altta açıldı.
- Kullanım Kılavuzu: üst çubuk düğmesinden açıldı, dokuz bölüm gösterildi ve Escape
  tuşuyla kapandı.
- Sekiz soru türünde gerekli alanların görünürlük matrisi doğrulandı. Doğru/Yanlış
  türüne geçip geri dönüldüğünde önceden yazılan seçeneklerin korunduğu görüldü.
- Tarayıcı hata ve uyarı günlüğü boştu.

## Saha doğrulaması gereken noktalar

Bu kontroller fiziksel ortam gerektirdiği için otomatik pakete dahil değildir:

- Gerçek telefonlarda titreşim ve PWA kurulum davranışı
- Projektör/TV overscan ve mekân ses sistemi seviyesi
- Gerçek Gemini API anahtarıyla ücretli belge üretimi
- Çok yüksek eşzamanlı katılımcı yük testi
- Tarayıcı yazdırma penceresinde seçilen yerel PDF yazıcısının sayfa ayarları

Canlı dağıtım sonrasında bir deneme etkinliği tamamlanarak arşivden CSV ve PDF
görünümü bir kez indirilmelidir.
