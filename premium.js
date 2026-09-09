const crypto = require('node:crypto');

const SECENEK_HARFLERI = ['A', 'B', 'C', 'D', 'E', 'F'];
const SORU_TIPLERI = Object.freeze({
    'coktan-secmeli': { ad: 'Çoktan Seçmeli', min: 2, max: 6, cevap: 'tek', puanli: true },
    'dogru-yanlis': { ad: 'Doğru / Yanlış', min: 2, max: 2, cevap: 'tek', puanli: true },
    'coklu-secim': { ad: 'Birden Fazla Doğru', min: 2, max: 6, cevap: 'coklu', puanli: true },
    'siralama': { ad: 'Sıralama', min: 3, max: 6, cevap: 'siralama', puanli: true },
    'anket': { ad: 'Anket', min: 2, max: 6, cevap: 'tek', puanli: false },
    'puanlama': { ad: '1–5 Puanlama', min: 5, max: 5, cevap: 'tek', puanli: false },
    'acik-uclu': { ad: 'Açık Uçlu', min: 0, max: 0, cevap: 'metin', puanli: true },
    'tahmin': { ad: 'Sayısal Tahmin', min: 0, max: 0, cevap: 'sayi', puanli: true }
});

function sinirliMetin(deger, limit = 240) {
    return String(deger ?? '').trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, limit);
}

function soruTipi(ham) {
    const tip = sinirliMetin(ham?.tip || ham?.soruTipi || 'coktan-secmeli', 40).toLowerCase();
    return SORU_TIPLERI[tip] ? tip : 'coktan-secmeli';
}

function cevapDizisi(deger) {
    const liste = Array.isArray(deger) ? deger : String(deger ?? '').split(',');
    return liste.map(x => sinirliMetin(x, 120).toUpperCase()).filter(Boolean);
}

function normalizeQuestionContent(hamSoru = {}) {
    const tip = soruTipi(hamSoru);
    const tanim = SORU_TIPLERI[tip];
    const soru = sinirliMetin(hamSoru.soru, 1000);
    if(!soru) throw new Error('Soru metni boş olamaz.');

    let secenekler = {};
    if(tip === 'dogru-yanlis') {
        secenekler = { A: sinirliMetin(hamSoru.secenekler?.A, 300) || 'Doğru', B: sinirliMetin(hamSoru.secenekler?.B, 300) || 'Yanlış' };
    } else if(tip === 'puanlama') {
        secenekler = Object.fromEntries(SECENEK_HARFLERI.slice(0, 5).map((harf, index) => [harf, String(index + 1)]));
    } else if(tanim.max > 0) {
        for(const harf of SECENEK_HARFLERI) {
            const metin = sinirliMetin(hamSoru.secenekler?.[harf], 300);
            if(metin) secenekler[harf] = metin;
        }
        const adet = Object.keys(secenekler).length;
        if(adet < tanim.min || adet > tanim.max) throw new Error(`${tanim.ad} soru türünde ${tanim.min}–${tanim.max} seçenek olmalıdır.`);
    }

    let dogruCevap = null;
    let dogruCevaplar = [];
    let dogruMetin = null;
    let tolerans = 0;
    if(tip === 'acik-uclu') {
        dogruMetin = sinirliMetin(hamSoru.dogruMetin ?? hamSoru.dogruCevap, 240);
        if(!dogruMetin) throw new Error('Açık uçlu soru için kabul edilecek cevap yazılmalıdır.');
        dogruCevap = dogruMetin;
    } else if(tip === 'tahmin') {
        const sayi = Number(hamSoru.dogruSayi ?? hamSoru.dogruCevap);
        if(!Number.isFinite(sayi)) throw new Error('Tahmin sorusu için geçerli bir sayısal cevap yazılmalıdır.');
        tolerans = Math.max(0, Math.min(1_000_000_000, Number(hamSoru.tolerans) || 0));
        dogruCevap = String(sayi);
    } else if(tanim.puanli) {
        dogruCevaplar = cevapDizisi(hamSoru.dogruCevaplar?.length ? hamSoru.dogruCevaplar : hamSoru.dogruCevap);
        if(tanim.cevap === 'tek') dogruCevaplar = dogruCevaplar.slice(0, 1);
        if(tanim.cevap === 'coklu') dogruCevaplar = [...new Set(dogruCevaplar)].sort();
        const secenekIdleri = Object.keys(secenekler);
        if(!dogruCevaplar.length || dogruCevaplar.some(x => !secenekIdleri.includes(x))) throw new Error('Doğru cevap seçili seçeneklerle eşleşmelidir.');
        if(tanim.cevap === 'siralama' && (dogruCevaplar.length !== secenekIdleri.length || new Set(dogruCevaplar).size !== secenekIdleri.length)) throw new Error('Sıralama cevabı tüm seçenekleri yalnızca bir kez içermelidir.');
        dogruCevap = dogruCevaplar.join(',');
    }

    const aciklama = sinirliMetin(hamSoru.aciklama, 700) || null;
    const kaynak = sinirliMetin(hamSoru.kaynakAciklamasi, 300) || null;
    return {
        soru,
        tip,
        gorsel: sinirliMetin(hamSoru.gorsel, 700000) || null,
        secenekler,
        dogruCevap,
        dogruCevaplar,
        dogruMetin,
        tolerans,
        aciklama,
        kaynakAciklamasi: kaynak,
        puanCarpani: Math.max(0, Math.min(10, Number(hamSoru.puanCarpani) || 1))
    };
}

function normalizeTextAnswer(value) {
    return sinirliMetin(value, 240).toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9çğıöşü]+/gi, ' ').trim();
}

function evaluateAnswer(soru, hamSecim) {
    const tip = soruTipi(soru);
    const tanim = SORU_TIPLERI[tip];
    if(tip === 'anket' || tip === 'puanlama') {
        const secim = cevapDizisi(hamSecim)[0] || null;
        if(!secim || !Object.hasOwn(soru.secenekler || {}, secim)) throw new Error('Geçersiz seçim.');
        return { secim, dogruMu: null, puanli: false };
    }
    if(tip === 'acik-uclu') {
        const secim = sinirliMetin(hamSecim, 240);
        if(!secim) throw new Error('Cevap boş olamaz.');
        return { secim, dogruMu: normalizeTextAnswer(secim) === normalizeTextAnswer(soru.dogruMetin ?? soru.dogruCevap), puanli: true };
    }
    if(tip === 'tahmin') {
        const secim = Number(String(hamSecim ?? '').replace(',', '.'));
        if(!Number.isFinite(secim)) throw new Error('Geçerli bir sayı yazın.');
        const hedef = Number(soru.dogruCevap);
        return { secim: String(secim), dogruMu: Math.abs(secim - hedef) <= (Number(soru.tolerans) || 0), puanli: true, fark: Math.abs(secim - hedef) };
    }
    const secimler = cevapDizisi(hamSecim);
    const izinli = Object.keys(soru.secenekler || {});
    if(!secimler.length || secimler.some(x => !izinli.includes(x))) throw new Error('Geçersiz seçim.');
    const dogrular = cevapDizisi(soru.dogruCevaplar?.length ? soru.dogruCevaplar : soru.dogruCevap);
    if(tanim.cevap === 'tek') return { secim: secimler[0], dogruMu: secimler[0] === dogrular[0], puanli: true };
    if(tanim.cevap === 'coklu') {
        const secim = [...new Set(secimler)].sort();
        const dogru = [...new Set(dogrular)].sort();
        return { secim: secim.join(','), dogruMu: secim.length === dogru.length && secim.every((x, i) => x === dogru[i]), puanli: true };
    }
    return { secim: secimler.join(','), dogruMu: secimler.length === dogrular.length && secimler.every((x, i) => x === dogrular[i]), puanli: true };
}

function normalizeTeams(ham = {}) {
    const enabled = Boolean(ham.takimModu || ham.oyunModu === 'takim');
    const colors = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#8e44ad', '#16a085', '#d35400', '#34495e'];
    const raw = Array.isArray(ham.takimlar) ? ham.takimlar : String(ham.takimlar || '').split(/\r?\n|,/).map(ad => ({ ad }));
    const takimlar = raw.slice(0, 12).map((item, index) => ({
        id: sinirliMetin(item?.id || `takim_${index + 1}`, 50).replace(/[^a-zA-Z0-9_-]/g, '') || `takim_${index + 1}`,
        ad: sinirliMetin(item?.ad ?? item, 50),
        renk: /^#[0-9a-f]{6}$/i.test(String(item?.renk || '')) ? item.renk : colors[index % colors.length]
    })).filter((item, index, all) => item.ad && all.findIndex(x => x.id === item.id) === index);
    return { takimModu: enabled && takimlar.length >= 2, takimlar };
}

function playerTiming(oyuncu) {
    const cevaplar = Array.isArray(oyuncu?.cevaplar) ? oyuncu.cevaplar.filter(Boolean) : [];
    const dogruSureler = cevaplar.filter(x => x.dogruMu === true).map(x => Number(x.cevapSuresiMs)).filter(Number.isFinite);
    const tumSureler = cevaplar.map(x => Number(x.cevapSuresiMs)).filter(Number.isFinite);
    return {
        dogruCevapSuresiMs: dogruSureler.reduce((a, b) => a + b, 0),
        toplamCevapSuresiMs: tumSureler.reduce((a, b) => a + b, 0),
        cevaplananSoru: tumSureler.length,
        dogruSayisi: cevaplar.filter(x => x.dogruMu === true).length
    };
}

function rankPlayers(players) {
    const liste = players.map(player => ({ ...player, ...playerTiming(player) }));
    liste.sort((a, b) => (Number(b.puan) || 0) - (Number(a.puan) || 0)
        || a.dogruCevapSuresiMs - b.dogruCevapSuresiMs
        || a.toplamCevapSuresiMs - b.toplamCevapSuresiMs
        || String(a.isim).localeCompare(String(b.isim), 'tr'));
    liste.forEach((player, index) => { player.sira = index + 1; });
    return liste;
}

function teamStandings(players, teams = []) {
    const map = new Map(teams.map(team => [team.id, { ...team, puan: 0, dogruCevapSuresiMs: 0, uyeSayisi: 0, dogruSayisi: 0 }]));
    for(const player of players) {
        if(!player.takimId || !map.has(player.takimId)) continue;
        const team = map.get(player.takimId); const timing = playerTiming(player);
        team.puan += Number(player.puan) || 0; team.dogruCevapSuresiMs += timing.dogruCevapSuresiMs; team.dogruSayisi += timing.dogruSayisi; team.uyeSayisi++;
    }
    return [...map.values()].sort((a, b) => b.puan - a.puan || a.dogruCevapSuresiMs - b.dogruCevapSuresiMs || a.ad.localeCompare(b.ad, 'tr')).map((team, index) => ({ ...team, sira: index + 1 }));
}

function archiveResult(result, existing, settings = {}) {
    const archive = existing && typeof existing === 'object' ? existing : { versiyon: 1, sonuclar: [] };
    const items = Array.isArray(archive.sonuclar) ? archive.sonuclar : [];
    // Canlı sonuçtaki dahili oyuncu kimlikleri rapor için gerekli değildir. Bunları
    // arşive taşımamak kişisel veri yüzeyini küçültür. Kurum logosu da her etkinlikte
    // tekrar kopyalanmaz; rapor indirilirken güncel kurum kimliği kullanılır.
    const guvenliOyuncular = (Array.isArray(result?.oyuncular) ? result.oyuncular : []).map(oyuncu => {
        const { id, bagli, ...raporOyuncusu } = oyuncu || {};
        return raporOyuncusu;
    });
    const record = JSON.parse(JSON.stringify({
        ...result,
        oyuncular: guvenliOyuncular,
        arsivId: result.arsivId || `event_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        kurumAdi: sinirliMetin(settings.etkinlikAdi || 'Tazzy Quiz', 80),
        kurumLogosu: null,
        tema: { anaRenk: settings.anaRenk, vurguRengi: settings.vurguRengi, arkaPlanRengi: settings.arkaPlanRengi }
    }));
    const withoutDuplicate = items.filter(item => item.pin !== record.pin && item.arsivId !== record.arsivId);
    return { versiyon: 1, sonuclar: [record, ...withoutDuplicate].slice(0, 10) };
}

function archiveSummaries(archive) {
    return (archive?.sonuclar || []).map(result => ({
        arsivId: result.arsivId,
        quizAdi: result.quizAdi,
        pin: result.pin,
        tamamlanmaZamani: result.tamamlanmaZamani,
        oyuncuSayisi: result.oyuncular?.length || 0,
        soruSayisi: result.sorular?.length || 0,
        kazanan: result.oyuncular?.[0]?.isim || '—',
        takimModu: Boolean(result.takimModu)
    }));
}

module.exports = {
    SECENEK_HARFLERI,
    SORU_TIPLERI,
    archiveResult,
    archiveSummaries,
    cevapDizisi,
    evaluateAnswer,
    normalizeQuestionContent,
    normalizeTeams,
    playerTiming,
    rankPlayers,
    soruTipi,
    teamStandings
};
