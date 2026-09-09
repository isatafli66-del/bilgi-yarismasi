// Başlangıç içerikleri kurumun eğitim materyalinin yerine geçmez; tümü bağımsız kopyalanır.
const q = (soru, cevaplar, dogru) => ({ soru, gorsel: null, secenekler: Object.fromEntries(['A','B','C','D'].map((h,i) => [h,cevaplar[i]])), dogruCevap: dogru });
module.exports = {
    otel: { ad: 'Otelcilik ve Misafir Deneyimi', sure: 25, konu: 'Otelcilik', sorular: [
        q('Misafir deneyimi hakkında doğrudan geri bildirim hangisinden alınır?', ['Misafir anketi','Depo sayımı','Elektrik faturası','Otopark krokisi'], 'A'),
        q('Bir misafirin talebini doğru anlamak için ilk adım hangisidir?', ['Sözünü kesmek','Dinleyip talebi doğrulamak','Tahmin ederek işlem yapmak','Konuyu değiştirmek'], 'B'),
        q('Misafire verilen bir sözün takibi için hangi davranış uygundur?', ['Talebi unutmak','Başkasının takip ettiğini varsaymak','Sorumlu kişiye iletip tamamlanmasını kontrol etmek','Talebi belirsiz bırakmak'], 'C'),
        q('Vardiya devrinde hangi bilgi iş sürekliliğini destekler?', ['Yalnız hava durumu','İlgisiz haberler','Kişisel alışveriş listesi','Bekleyen işler ve sorumluları'], 'D'),
        q('Açık ve anlaşılır iletişime örnek hangisidir?', ['Kısa ve net bilgi vermek','Belirsiz ifadeler kullanmak','Aynı anda farklı talimatlar vermek','Karşı tarafı dinlememek'], 'A')
    ] },
    takim: { ad: 'Takım İçi İletişim', sure: 20, konu: 'Takım Çalışması', sorular: [
        q('Aktif dinlemenin örneği hangisidir?', ['Konuşmayı kesmek','Telefonla ilgilenmek','Anladığını kendi sözleriyle doğrulamak','Cevabı önceden varsaymak'], 'C'),
        q('Bir ekip görevinde belirsizliği azaltan bilgi hangisidir?', ['Sorumlu kişi ve bitiş zamanı','Yalnızca görev adı','İlgisiz bir not','Eski bir sohbet'], 'A'),
        q('Yapıcı geri bildirimin özelliği hangisidir?', ['Kişiye etiket yapıştırmak','Somut davranış ve geliştirme önerisi içermek','Herkesi suçlamak','Belirsiz olmak'], 'B'),
        q('Bir toplantının sonunda hangi adım takip edilebilirliği artırır?', ['Kararları silmek','Görevleri gizlemek','Yeni konu açmak','Kararları ve sorumluları özetlemek'], 'D'),
        q('Ortak hedef üzerinde anlaşmak neyi kolaylaştırır?', ['Öncelikleri birlikte belirlemeyi','İletişimi kesmeyi','Görevleri belirsiz bırakmayı','İşi tekrar etmeyi'], 'A')
    ] },
    genel: { ad: 'Genel Kültür Etkinliği', sure: 20, konu: 'Genel Kültür', sorular: [
        q('Düzlemde bir üçgenin iç açılarının toplamı kaç derecedir?', ['90','180','270','360'], 'B'),
        q('Bir saatte kaç dakika vardır?', ['30','45','60','90'], 'C'),
        q('Güneş Sistemi içinde Güneş’e en yakın gezegen hangisidir?', ['Dünya','Mars','Venüs','Merkür'], 'D'),
        q('12 ile 8 sayılarının toplamı kaçtır?', ['20','18','22','24'], 'A'),
        q('Bir haftada kaç gün vardır?', ['5','7','8','10'], 'B')
    ] },
    oryantasyon: { ad: 'Oryantasyon ve İş Birliği', sure: 25, konu: 'Oryantasyon', sorular: [
        q('Yeni bir görevde beklentiler net değilse hangisi uygundur?', ['Rastgele başlamak','Görevi görmezden gelmek','Beklenen sonucu ve teslim zamanını sormak','Soruyu saklamak'], 'C'),
        q('Kurumla ilgili güncel süreç bilgisi için ilk hangi kaynak tercih edilir?', ['Yetkili kişinin paylaştığı güncel doküman','Eski bir söylenti','İlgisiz bir sosyal medya yorumu','Tahmin'], 'A'),
        q('Bir işe ait notları düzenli tutmak ne sağlar?', ['Bilgiyi unutmayı','Takip ve devir kolaylığı','Daha fazla belirsizlik','İletişimin kesilmesini'], 'B'),
        q('Bilmediğin bir konuda doğru yaklaşım hangisidir?', ['Biliyormuş gibi yapmak','Rastgele yanıt vermek','Soruyu atlamak','Uygun kaynağa veya sorumlu kişiye danışmak'], 'D'),
        q('Ekipte yeni bir kişiye destek olmanın örneği hangisidir?', ['Gerekli kaynakları ve iletişim kişilerini tanıtmak','Sorularını görmezden gelmek','Bilgiyi saklamak','Belirsiz görevler vermek'], 'A')
    ] },
    gelir: { ad: 'Otel Gelir Yönetimi Temelleri', sure: 25, konu: 'Gelir Yönetimi', sorular: [
        q('RevPAR hangi iki temel performans unsurunu birlikte yansıtır?', ['Doluluk ve ortalama günlük fiyat','Personel sayısı ve vardiya','Oda büyüklüğü ve kat sayısı','Menü fiyatı ve masa sayısı'], 'A'),
        q('Talebin yüksek olduğu bir tarihte ilk kontrol edilmesi gereken nedir?', ['Güncel doluluk, talep ve fiyat konumu','Yalnız geçen yılın menüsü','Personel üniforması','Otopark çizgileri'], 'A'),
        q('Fiyat kararında sağlıklı yaklaşım hangisidir?', ['Tek bir rakama bakmak','Talep, rakip konumu ve geçmiş veriyi birlikte değerlendirmek','Her gün aynı fiyatı kullanmak','Yalnız tahminle ilerlemek'], 'B'),
        q('İptal ve rezervasyon hızını takip etmek ne sağlar?', ['Talep değişimini erken görmeyi','Oda temizliğini ölçmeyi','Menü hazırlamayı','Vardiya listesini kapatmayı'], 'A'),
        q('Gelir yönetimi kararları ne sıklıkla gözden geçirilmelidir?', ['Pazar ve talep değiştikçe düzenli olarak','Yalnız yıl sonunda','Hiçbir zaman','Sadece bina yenilenince'], 'A')
    ] },
    misafir_kurtarma: { ad: 'Misafir Şikâyeti ve Hizmet Kurtarma', sure: 25, konu: 'Misafir Deneyimi', sorular: [
        q('Şikâyet bildiren misafire ilk yaklaşım hangisidir?', ['Savunmaya geçmek','Sözünü kesmeden dinlemek','Konuyu değiştirmek','Başka misafiri suçlamak'], 'B'),
        q('Sorunu doğru anladığımızı nasıl gösteririz?', ['Talebi kendi sözlerimizle doğrulayarak','Hemen konuşmayı bitirerek','Tahmin ederek','Yanıt vermeyerek'], 'A'),
        q('Çözüm yetki sınırımızı aşıyorsa ne yapılmalıdır?', ['Talebi kaybetmek','Yetkili kişiye net bilgiyle aktarıp takibini yapmak','Misafiri bekletip unutmak','Sorumluluğu reddetmek'], 'B'),
        q('Hizmet kurtarma sonrasında hangi adım değerlidir?', ['Çözümün misafir için tamamlandığını doğrulamak','Kayıtları silmek','İletişimi kesmek','Aynı hatayı tekrarlamak'], 'A'),
        q('Yapıcı özür hangi özelliği taşır?', ['Samimi, kısa ve çözüm odaklıdır','Suçu misafire yükler','Belirsizdir','Yeni sorun üretir'], 'A')
    ] },
    satis: { ad: 'Kurumsal Satış ve İletişim', sure: 20, konu: 'Satış', sorular: [
        q('Müşteri ihtiyacını anlamanın en doğru yolu hangisidir?', ['Açık uçlu sorular sorup dinlemek','Hazır metni kesintisiz okumak','Varsayım yapmak','Fiyatı gizlemek'], 'A'),
        q('Teklif sunarken hangi bilgi önceliklidir?', ['Müşterinin ihtiyacına sağlanan değer','İlgisiz teknik ayrıntılar','Rakip hakkında söylenti','Kişisel yorumlar'], 'A'),
        q('Takip görüşmesinin amacı nedir?', ['Kararı ve açık noktaları netleştirmek','Müşteriyi sıkıştırmak','Bilgiyi azaltmak','İletişimi bitirmek'], 'A'),
        q('İtirazla karşılaşıldığında ilk adım hangisidir?', ['İtirazın nedenini anlamak','Tartışmak','Konuyu kapatmak','Yanıtı ezbere vermek'], 'A'),
        q('Sağlıklı satış kaydı ne içermelidir?', ['Görüşme özeti, sonraki adım ve tarih','Yalnız müşteri adı','İlgisiz notlar','Belirsiz tahminler'], 'A')
    ] },
    is_guvenligi: { ad: 'İş Güvenliği Farkındalığı', sure: 20, konu: 'İş Güvenliği', sorular: [
        q('Güvensiz bir durum fark edildiğinde ne yapılmalıdır?', ['Uygun kanaldan hemen bildirmek','Görmezden gelmek','Saklamak','Başkasının görmesini beklemek'], 'A'),
        q('Acil çıkışların önünde nasıl bir alan bırakılmalıdır?', ['Her zaman açık ve engelsiz','Depolama için dolu','Sadece gündüz açık','Mobilyayla kapalı'], 'A'),
        q('Kişisel koruyucu ekipman nasıl kullanılmalıdır?', ['Göreve ve talimata uygun','İstenildiği gibi','Yalnız denetimde','Hasarlı olsa da'], 'A'),
        q('Bir ramak kala olayının bildirilmesi neden önemlidir?', ['Benzer kazaları önlemeye yardım eder','Gereksizdir','Sadece puan içindir','İşi yavaşlatır'], 'A'),
        q('Acil durumda öncelik nedir?', ['Kurumun güncel acil durum prosedürünü uygulamak','Söylentiye göre hareket etmek','Asansörü kullanmak','Tek başına risk almak'], 'A')
    ] }
};
