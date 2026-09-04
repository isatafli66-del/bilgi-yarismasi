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
    ] }
};
