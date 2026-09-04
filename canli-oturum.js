const RENK_DESENI = /^#[0-9a-f]{6}$/i;
const CEVAPLAR = ['A', 'B', 'C', 'D'];

function sinirliMetin(deger, enFazla, varsayilan = '') {
    const metin = String(deger ?? '').trim();
    return (metin || varsayilan).slice(0, enFazla);
}

function varsayilanAyarlar() {
    return {
        logo: null,
        etkinlikAdi: 'Tazzy Quiz',
        karsilamaMesaji: 'Bilginizi gösterin, eğlenceye katılın!',
        kapanisMesaji: 'Katıldığınız için teşekkürler.',
        anaRenk: '#46178f',
        vurguRengi: '#16c7d9',
        arkaPlanRengi: '#24114f',
        tema: 'tazzy',
        sesVarsayilan: true,
        animasyonlar: true
    };
}

function ayarlariNormalizeEt(ham = {}) {
    const temel = varsayilanAyarlar();
    return {
        ...temel,
        logo: typeof ham.logo === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/i.test(ham.logo) && ham.logo.length < 1500000 ? ham.logo : null,
        etkinlikAdi: sinirliMetin(ham.etkinlikAdi, 80, temel.etkinlikAdi),
        karsilamaMesaji: sinirliMetin(ham.karsilamaMesaji, 160, temel.karsilamaMesaji),
        kapanisMesaji: sinirliMetin(ham.kapanisMesaji, 160, temel.kapanisMesaji),
        anaRenk: RENK_DESENI.test(String(ham.anaRenk || '')) ? ham.anaRenk : temel.anaRenk,
        vurguRengi: RENK_DESENI.test(String(ham.vurguRengi || '')) ? ham.vurguRengi : temel.vurguRengi,
        arkaPlanRengi: RENK_DESENI.test(String(ham.arkaPlanRengi || '')) ? ham.arkaPlanRengi : temel.arkaPlanRengi,
        tema: ['tazzy', 'gece', 'kurumsal', 'enerjik'].includes(ham.tema) ? ham.tema : temel.tema,
        sesVarsayilan: ham.sesVarsayilan !== false,
        animasyonlar: ham.animasyonlar !== false
    };
}

function gorselBaglantisiGuvenliMi(deger) {
    if(!deger) return true;
    if(typeof deger === 'string' && deger.length <= 600000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(deger)) return true;
    try {
        const url = new URL(String(deger));
        const host = url.hostname.toLowerCase();
        return url.protocol === 'https:' && !url.username && !url.password && !/^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/i.test(host);
    } catch (_) {
        return false;
    }
}

function yayinOncesiKontrol(quiz, ek = {}) {
    const maddeler = [];
    const ekle = (kod, durum, baslik, aciklama) => maddeler.push({ kod, durum, baslik, aciklama });
    if(!quiz) {
        ekle('quiz', 'hata', 'Quiz seçilmedi', 'Yayına almadan önce bir quiz seçin.');
        return { hazir: false, maddeler, soruSayisi: 0, tahminiDakika: 0 };
    }

    const sorular = Array.isArray(quiz.sorular) ? quiz.sorular : [];
    ekle('soru-sayisi', sorular.length ? 'basarili' : 'hata', `${sorular.length} soru`, sorular.length ? 'Quiz içeriği hazır.' : 'Quize en az bir soru ekleyin.');

    let eksik = 0;
    let uzun = 0;
    let gorselSorunu = 0;
    let tekrarSecenek = 0;
    let ustUsteCevap = 1;
    let enUzunSeri = 1;
    sorular.forEach((soru, index) => {
        const secenekler = CEVAPLAR.map(harf => String(soru?.secenekler?.[harf] || '').trim());
        if(!String(soru?.soru || '').trim() || secenekler.some(secenek => !secenek) || !CEVAPLAR.includes(soru?.dogruCevap)) eksik++;
        if(String(soru?.soru || '').length > 220 || secenekler.some(secenek => secenek.length > 120)) uzun++;
        if(!gorselBaglantisiGuvenliMi(soru?.gorsel)) gorselSorunu++;
        if(new Set(secenekler.map(x => x.toLocaleLowerCase('tr-TR'))).size !== secenekler.length) tekrarSecenek++;
        if(index > 0 && sorular[index - 1]?.dogruCevap === soru?.dogruCevap) ustUsteCevap++;
        else ustUsteCevap = 1;
        enUzunSeri = Math.max(enUzunSeri, ustUsteCevap);
    });
    ekle('icerik', eksik ? 'hata' : 'basarili', eksik ? `${eksik} eksik soru` : 'Soru alanları eksiksiz', eksik ? 'Soru, dört seçenek ve doğru cevabı tamamlayın.' : 'Tüm cevap anahtarları geçerli.');
    ekle('gorsel', gorselSorunu ? 'hata' : 'basarili', gorselSorunu ? `${gorselSorunu} güvensiz görsel bağlantısı` : 'Görsel bağlantıları güvenli', gorselSorunu ? 'Yalnızca geçerli HTTPS görsel bağlantıları kullanılabilir.' : 'Bağlantı biçimleri kontrol edildi.');
    if(uzun) ekle('uzunluk', 'uyari', `${uzun} uzun içerik`, 'Projektör ve telefon önizlemesinde kontrol edin.');
    else ekle('uzunluk', 'basarili', 'Metin uzunlukları uygun', 'Otomatik ekran sığdırma için ideal aralıkta.');
    if(tekrarSecenek) ekle('tekrar', 'uyari', `${tekrarSecenek} soruda yinelenen seçenek`, 'Aynı görünen seçenekleri kontrol edin.');
    if(enUzunSeri >= 4) ekle('dagilim', 'uyari', `Aynı doğru cevap ${enUzunSeri} kez art arda`, 'Cevap anahtarı dağılımını kontrol edin.');
    ekle('ekran', ek.ekranBagli ? 'basarili' : 'uyari', ek.ekranBagli ? 'Ana ekran bağlı' : 'Ana ekran bağlı değil', ek.ekranBagli ? 'Yayın ekranı hazır.' : 'Ana ekranı açıp bağlantıyı doğrulayın.');

    if(ek.logo !== undefined) ekle('logo', ek.logo ? 'basarili' : 'uyari', ek.logo ? 'Kurum logosu hazır' : 'Kurum logosu eklenmemiş', 'Kurum kimliği MASTER ekranından yönetilir.');
    if(ek.bagliOyuncu !== undefined) ekle('oyuncu', 'basarili', `${ek.bagliOyuncu} bağlı yarışmacı`, 'Yeni oyun başlatıldığında yeni PIN oluşturulur.');
    const tekrarlar = sorular.length - new Set(sorular.map(s => String(s.soru || '').trim().toLocaleLowerCase('tr-TR'))).size;
    if(tekrarlar) ekle('tekrar-soru', 'uyari', `${tekrarlar} yinelenen soru metni`, 'Quizdeki benzer soruları kontrol edin.');
    const hataVar = maddeler.some(madde => madde.durum === 'hata');
    return {
        hazir: !hataVar,
        maddeler,
        soruSayisi: sorular.length,
        tahminiDakika: Math.max(1, Math.ceil((sorular.length * ((Number(quiz.sure) || 20) + 8)) / 60))
    };
}

function oyunuSerilestir(oyun, simdi = Date.now()) {
    if(!oyun) return null;
    const oyuncular = {};
    Object.entries(oyun.oyuncular || {}).forEach(([id, oyuncu]) => {
        oyuncular[id] = { ...oyuncu, socketId: null, bagli: Boolean(oyuncu.manuel) };
    });
    return {
        versiyon: 1,
        kayitZamani: new Date(simdi).toISOString(),
        sonaErmeZamani: new Date(simdi + 12 * 60 * 60 * 1000).toISOString(),
        oyun: {
            pin: oyun.pin,
            kurumKodu: oyun.kurumKodu,
            quizId: oyun.quizId,
            quizAnlik: oyun.quizAnlik || null,
            toplamSoru: oyun.toplamSoru,
            soruSirasi: oyun.soruSirasi,
            oyuncular,
            soruKayitlari: oyun.soruKayitlari || [],
            soruAktifMi: Boolean(oyun.soruAktifMi),
            oyunDuraklatildi: Boolean(oyun.oyunDuraklatildi),
            cevapYansitildi: Boolean(oyun.cevapYansitildi),
            durum: (oyun.kurtarildi ? oyun.kurtarmaOncesiDurum : oyun.durum) || 'lobi',
            gorunum: oyun.gorunum || oyun.durum || 'lobi',
            sonSonuc: oyun.sonSonuc || null,
            baslamaZamani: oyun.baslamaZamani || null,
            baslangicZamani: oyun.baslangicZamani || simdi,
            kalanSure: Math.max(0, Number(oyun.kalanSure) || 0),
            prova: Boolean(oyun.prova)
        }
    };
}

function oyunuCanlandir(kayit, simdi = Date.now()) {
    if(!kayit?.oyun || !kayit.sonaErmeZamani || new Date(kayit.sonaErmeZamani).getTime() <= simdi) return null;
    const oyun = kayit.oyun;
    if(!/^\d{6}$/.test(String(oyun.pin || '')) || !oyun.kurumKodu || !oyun.quizId) return null;
    return {
        ...oyun,
        pin: String(oyun.pin),
        oyuncular: oyun.oyuncular && typeof oyun.oyuncular === 'object' ? oyun.oyuncular : {},
        soruKayitlari: Array.isArray(oyun.soruKayitlari) ? oyun.soruKayitlari : [],
        zamanlayici: null,
        soruAktifMi: false,
        oyunDuraklatildi: true,
        kurtarildi: true,
        kurtarmaOncesiDurum: oyun.durum || 'lobi',
        durum: 'kurtarildi'
    };
}


module.exports = {
    CEVAPLAR,
    ayarlariNormalizeEt,
    varsayilanAyarlar,
    gorselBaglantisiGuvenliMi,
    yayinOncesiKontrol,
    oyunuSerilestir,
    oyunuCanlandir
};
