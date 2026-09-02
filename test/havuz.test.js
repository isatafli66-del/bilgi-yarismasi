const test = require('node:test');
const assert = require('node:assert/strict');
const {
    bosHavuz,
    eskiQuizleriHavuzaAktar,
    havuzaSoruEkle,
    havuzdanSoruSil,
    havuzSorusundanQuizKopyasi,
    quizSorusunuTasi,
    quizSorusunuTemizle,
    quizSorulariniSirala
} = require('../soru-havuzu');

function ornekSoru(ek = {}) {
    return {
        soru: 'RevPAR neyi ölçer?',
        gorsel: 'https://example.com/revpar.png',
        secenekler: { A: 'Personel', B: 'Havlu', C: 'Oda başına gelir', D: 'Yemekhane' },
        dogruCevap: 'C',
        konu: 'Otel Yönetimi',
        zorluk: 'Orta',
        kaynak: 'manuel',
        ...ek
    };
}

test('havuzdan quize eklenen soru bağımsız derin kopyadır', () => {
    const ekleme = havuzaSoruEkle(bosHavuz(), ornekSoru());
    const havuzSorusu = ekleme.soru;
    const quizKopyasi = havuzSorusundanQuizKopyasi(havuzSorusu);

    assert.notEqual(quizKopyasi.id, havuzSorusu.id);
    assert.equal(quizKopyasi.kaynakSoruId, havuzSorusu.id);
    assert.notEqual(quizKopyasi.secenekler, havuzSorusu.secenekler);

    quizKopyasi.soru = 'Quiz içinde değiştirildi';
    quizKopyasi.secenekler.C = 'Quiz cevabı';
    assert.equal(havuzSorusu.soru, 'RevPAR neyi ölçer?');
    assert.equal(havuzSorusu.secenekler.C, 'Oda başına gelir');

    const guncelHavuz = havuzaSoruEkle(ekleme.havuz, { ...havuzSorusu, soru: 'Havuzda değiştirildi' }).havuz;
    assert.equal(quizKopyasi.soru, 'Quiz içinde değiştirildi');
    assert.equal(guncelHavuz.sorular[havuzSorusu.id].soru, 'Havuzda değiştirildi');
});

test('havuz sorusu silinince quiz kopyası aynen kalır', () => {
    const ekleme = havuzaSoruEkle(bosHavuz(), ornekSoru());
    const quizKopyasi = havuzSorusundanQuizKopyasi(ekleme.soru);
    const silinmisHavuz = havuzdanSoruSil(ekleme.havuz, ekleme.soru.id);

    assert.equal(Object.keys(silinmisHavuz.sorular).length, 0);
    assert.equal(quizKopyasi.soru, 'RevPAR neyi ölçer?');
    assert.equal(quizKopyasi.secenekler.C, 'Oda başına gelir');
});

test('quiz sorusu düzenlenirken kaynak kimliği korunur', () => {
    const onceki = { id: 'quiz-1', kaynakSoruId: 'pool-1', ...ornekSoru() };
    const guncel = quizSorusunuTemizle({ ...onceki, soru: 'Yeni quiz metni', kaynakSoruId: '' }, onceki);
    assert.equal(guncel.id, 'quiz-1');
    assert.equal(guncel.kaynakSoruId, 'pool-1');
    assert.equal(guncel.soru, 'Yeni quiz metni');
});

test('eski quiz soruları içerik kaybı olmadan havuza aktarılır ve aynı içerik tekilleştirilir', () => {
    const quizler = {
        q1: { id: 'q1', ad: 'Bir', sorular: [{ id: 1, ...ornekSoru() }] },
        q2: { id: 'q2', ad: 'İki', sorular: [{ id: 2, ...ornekSoru() }] }
    };
    const sonuc = eskiQuizleriHavuzaAktar(quizler, bosHavuz());

    assert.equal(sonuc.eklenen, 1);
    assert.equal(sonuc.baglanan, 2);
    assert.equal(Object.keys(sonuc.havuz.sorular).length, 1);
    assert.equal(sonuc.quizler.q1.sorular[0].soru, 'RevPAR neyi ölçer?');
    assert.equal(sonuc.quizler.q1.sorular[0].kaynakSoruId, sonuc.quizler.q2.sorular[0].kaynakSoruId);
});

test('quiz sırası kimlik dizisine göre değiştirilir ve eksik/tekrarlı sıra reddedilir', () => {
    const sorular = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    assert.deepEqual(quizSorulariniSirala(sorular, ['c', 'a', 'b']).map(s => s.id), ['c', 'a', 'b']);
    assert.throws(() => quizSorulariniSirala(sorular, ['a', 'b']), /eşleşmiyor/);
    assert.throws(() => quizSorulariniSirala(sorular, ['a', 'a', 'c']), /yinelenen/);
    assert.throws(() => quizSorulariniSirala(sorular, ['a', 'b', 'x']), /olmayan/);
});

test('yukarı/aşağı taşıma sınırlar içinde güvenli çalışır', () => {
    const sorular = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    assert.deepEqual(quizSorusunuTasi(sorular, 'c', 0).map(s => s.id), ['c', 'a', 'b']);
    assert.deepEqual(quizSorusunuTasi(sorular, 'a', 99).map(s => s.id), ['b', 'c', 'a']);
    assert.throws(() => quizSorusunuTasi(sorular, 'x', 0), /bulunamadı/);
});
