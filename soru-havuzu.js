const { randomUUID } = require('node:crypto');

const HARFLER = ['A', 'B', 'C', 'D'];

function yeniId(onEk) {
    return `${onEk}_${randomUUID()}`;
}

function metin(deger) {
    return String(deger ?? '').trim();
}

function soruIcerigiTemizle(hamSoru = {}) {
    const dogruCevap = metin(hamSoru.dogruCevap).toUpperCase();
    const soru = {
        soru: metin(hamSoru.soru),
        gorsel: metin(hamSoru.gorsel) || null,
        secenekler: Object.fromEntries(HARFLER.map(harf => [harf, metin(hamSoru.secenekler?.[harf])])),
        dogruCevap
    };

    if(!soru.soru || HARFLER.some(harf => !soru.secenekler[harf]) || !HARFLER.includes(dogruCevap)) {
        throw new Error('Soru metni, dört cevap seçeneği ve doğru cevap eksiksiz olmalıdır.');
    }
    return soru;
}

function soruImzasi(hamSoru = {}) {
    const soru = soruIcerigiTemizle(hamSoru);
    return JSON.stringify([
        soru.soru.toLocaleLowerCase('tr-TR'),
        soru.secenekler.A.toLocaleLowerCase('tr-TR'),
        soru.secenekler.B.toLocaleLowerCase('tr-TR'),
        soru.secenekler.C.toLocaleLowerCase('tr-TR'),
        soru.secenekler.D.toLocaleLowerCase('tr-TR'),
        soru.dogruCevap,
        (soru.gorsel || '').toLocaleLowerCase('tr-TR')
    ]);
}

function havuzSorusunuTemizle(hamSoru = {}, mevcut = null) {
    const simdi = new Date().toISOString();
    return {
        id: metin(hamSoru.id) || mevcut?.id || yeniId('pool'),
        ...soruIcerigiTemizle(hamSoru),
        konu: metin(hamSoru.konu) || mevcut?.konu || 'Genel',
        zorluk: ['Kolay', 'Orta', 'Zor'].includes(metin(hamSoru.zorluk)) ? metin(hamSoru.zorluk) : (mevcut?.zorluk || 'Orta'),
        kaynak: ['manuel', 'yapay-zeka', 'aktarim', 'kopya'].includes(metin(hamSoru.kaynak)) ? metin(hamSoru.kaynak) : (mevcut?.kaynak || 'manuel'),
        olusturulmaTarihi: mevcut?.olusturulmaTarihi || metin(hamSoru.olusturulmaTarihi) || simdi,
        guncellenmeTarihi: mevcut === hamSoru && metin(hamSoru.guncellenmeTarihi) ? metin(hamSoru.guncellenmeTarihi) : simdi
    };
}

function bosHavuz() {
    return { versiyon: 1, sorular: {}, sira: [] };
}

function havuzuNormalizeEt(hamHavuz) {
    const sonuc = bosHavuz();
    const hamSorular = hamHavuz?.sorular && typeof hamHavuz.sorular === 'object' ? hamHavuz.sorular : (hamHavuz && typeof hamHavuz === 'object' ? hamHavuz : {});
    for(const [anahtar, hamSoru] of Object.entries(hamSorular)) {
        if(!hamSoru || typeof hamSoru !== 'object' || !hamSoru.soru) continue;
        try {
            const soru = havuzSorusunuTemizle({ ...hamSoru, id: hamSoru.id || anahtar }, hamSoru);
            sonuc.sorular[soru.id] = soru;
        } catch (_) {}
    }

    const verilenSira = Array.isArray(hamHavuz?.sira) ? hamHavuz.sira.map(String) : [];
    sonuc.sira = verilenSira.filter((id, index) => sonuc.sorular[id] && verilenSira.indexOf(id) === index);
    for(const id of Object.keys(sonuc.sorular)) if(!sonuc.sira.includes(id)) sonuc.sira.push(id);
    return sonuc;
}

function havuzaSoruEkle(havuz, hamSoru) {
    const sonuc = havuzuNormalizeEt(havuz);
    const mevcutId = metin(hamSoru?.id);
    const mevcut = mevcutId ? sonuc.sorular[mevcutId] : null;
    if(mevcutId && !mevcut) throw new Error('Düzenlenmek istenen havuz sorusu bulunamadı.');
    const soru = havuzSorusunuTemizle(hamSoru, mevcut);
    sonuc.sorular[soru.id] = soru;
    if(!sonuc.sira.includes(soru.id)) sonuc.sira.push(soru.id);
    return { havuz: sonuc, soru };
}

function havuzdanSoruSil(havuz, soruId) {
    const sonuc = havuzuNormalizeEt(havuz);
    const id = metin(soruId);
    if(!sonuc.sorular[id]) throw new Error('Silinmek istenen havuz sorusu bulunamadı.');
    delete sonuc.sorular[id];
    sonuc.sira = sonuc.sira.filter(item => item !== id);
    return sonuc;
}

function havuzSorusunuKopyala(havuz, soruId) {
    const sonuc = havuzuNormalizeEt(havuz);
    const kaynak = sonuc.sorular[metin(soruId)];
    if(!kaynak) throw new Error('Kopyalanmak istenen havuz sorusu bulunamadı.');
    return havuzaSoruEkle(sonuc, {
        ...kaynak,
        id: '',
        soru: `${kaynak.soru} (Kopya)`,
        kaynak: 'kopya',
        olusturulmaTarihi: ''
    });
}

function havuzSorusundanQuizKopyasi(havuzSorusu) {
    const icerik = soruIcerigiTemizle(havuzSorusu);
    return {
        id: yeniId('quiz_soru'),
        kaynakSoruId: metin(havuzSorusu.id) || null,
        ...JSON.parse(JSON.stringify(icerik))
    };
}

function quizSorusunuTemizle(hamSoru = {}, mevcut = null) {
    return {
        id: hamSoru.id ?? mevcut?.id ?? yeniId('quiz_soru'),
        kaynakSoruId: metin(hamSoru.kaynakSoruId) || mevcut?.kaynakSoruId || null,
        ...soruIcerigiTemizle(hamSoru)
    };
}

function quizSorulariniSirala(sorular, soruIdleri) {
    if(!Array.isArray(sorular) || !Array.isArray(soruIdleri) || sorular.length !== soruIdleri.length) {
        throw new Error('Soru sıralaması mevcut quiz içeriğiyle eşleşmiyor.');
    }
    const idler = soruIdleri.map(String);
    if(new Set(idler).size !== idler.length) throw new Error('Soru sıralamasında yinelenen kimlik bulundu.');
    const harita = new Map(sorular.map(soru => [String(soru.id), soru]));
    if(idler.some(id => !harita.has(id))) throw new Error('Soru sıralamasında quize ait olmayan bir kimlik bulundu.');
    return idler.map(id => harita.get(id));
}

function quizSorusunuTasi(sorular, soruId, yeniIndex) {
    const sonuc = [...sorular];
    const eskiIndex = sonuc.findIndex(soru => String(soru.id) === String(soruId));
    if(eskiIndex < 0) throw new Error('Taşınmak istenen quiz sorusu bulunamadı.');
    const hedef = Math.max(0, Math.min(Number(yeniIndex), sonuc.length - 1));
    const [soru] = sonuc.splice(eskiIndex, 1);
    sonuc.splice(hedef, 0, soru);
    return sonuc;
}

function eskiQuizleriHavuzaAktar(quizler, hamHavuz) {
    const havuz = havuzuNormalizeEt(hamHavuz);
    const imzaHaritasi = new Map();
    for(const soru of Object.values(havuz.sorular)) {
        try { imzaHaritasi.set(soruImzasi(soru), soru.id); } catch (_) {}
    }

    let eklenen = 0;
    let baglanan = 0;
    for(const quiz of Object.values(quizler || {})) {
        if(!Array.isArray(quiz?.sorular)) continue;
        quiz.sorular = quiz.sorular.map(hamSoru => {
            let soru;
            try { soru = quizSorusunuTemizle(hamSoru, hamSoru); } catch (_) { return hamSoru; }
            if(soru.kaynakSoruId && havuz.sorular[soru.kaynakSoruId]) return soru;
            const imza = soruImzasi(soru);
            let havuzId = imzaHaritasi.get(imza);
            if(!havuzId) {
                const ekleme = havuzaSoruEkle(havuz, {
                    ...soru,
                    id: '',
                    konu: 'Mevcut Quizlerden Aktarılanlar',
                    zorluk: 'Orta',
                    kaynak: 'aktarim'
                });
                Object.assign(havuz, ekleme.havuz);
                havuzId = ekleme.soru.id;
                imzaHaritasi.set(imza, havuzId);
                eklenen += 1;
            }
            soru.kaynakSoruId = havuzId;
            baglanan += 1;
            return soru;
        });
    }
    return { quizler, havuz, eklenen, baglanan };
}

module.exports = {
    HARFLER,
    bosHavuz,
    eskiQuizleriHavuzaAktar,
    havuzaSoruEkle,
    havuzdanSoruSil,
    havuzuNormalizeEt,
    havuzSorusunuKopyala,
    havuzSorusundanQuizKopyasi,
    quizSorusunuTasi,
    quizSorusunuTemizle,
    quizSorulariniSirala,
    soruIcerigiTemizle,
    soruImzasi,
    yeniId
};
