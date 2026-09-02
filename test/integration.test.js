const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');

function bekle(socket, olay, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const zaman = setTimeout(() => { socket.off(olay, handler); reject(new Error(`${olay} olayı zamanında gelmedi.`)); }, timeout);
        function handler(data) { clearTimeout(zaman); resolve(data); }
        socket.once(olay, handler);
    });
}

function sunucuyuBekle(child, timeout = 8000) {
    return new Promise((resolve, reject) => {
        const zaman = setTimeout(() => reject(new Error('Test sunucusu başlamadı.')), timeout);
        child.stdout.on('data', parca => {
            if(String(parca).includes('Sunucu çalışıyor')) { clearTimeout(zaman); resolve(); }
        });
        child.stderr.on('data', parca => {
            const metin = String(parca);
            if(metin.includes('[HATA]')) { clearTimeout(zaman); reject(new Error(metin)); }
        });
        child.once('exit', kod => { if(kod) { clearTimeout(zaman); reject(new Error(`Test sunucusu ${kod} koduyla kapandı.`)); } });
    });
}

function soru(no, ek = {}) {
    return {
        soru: `Entegrasyon sorusu ${no}`,
        gorsel: null,
        secenekler: { A: `A${no}`, B: `B${no}`, C: `C${no}`, D: `D${no}` },
        dogruCevap: 'C', konu: 'Entegrasyon', zorluk: 'Orta', kaynak: 'manuel', ...ek
    };
}

test('sunucu havuz → bağımsız quiz kopyası → sıralama → canlı soru akışını uçtan uca korur', { timeout: 30000 }, async () => {
    const veriKlasoru = fs.mkdtempSync(path.join(os.tmpdir(), 'tazzy-v120-'));
    const port = 43127;
    const root = path.resolve(__dirname, '..');
    const child = spawn(process.execPath, ['server.js'], {
        cwd: root,
        env: { ...process.env, STORAGE_PROVIDER: 'file', DATA_DIR: veriKlasoru, PORT: String(port), API_KEY: '' },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let admin;
    let ekran;
    try {
        await sunucuyuBekle(child);
        admin = io(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true });
        await bekle(admin, 'connect');
        const quizSozu = bekle(admin, 'verileri_guncelle');
        const havuzSozu = bekle(admin, 'soru_havuzu_guncelle');
        admin.emit('admin_giris', 'ROOF-01');
        await quizSozu;
        await havuzSozu;
        const quizId = 'integration_quiz';
        const yeniQuizSozu = bekle(admin, 'verileri_guncelle');
        admin.emit('quiz_ekle_guncelle', { id: quizId, ad: 'Entegrasyon Quizi', sure: 20, puan: 100 });
        await yeniQuizSozu;

        const baslangicSoruSozu = bekle(admin, 'verileri_guncelle');
        admin.emit('soru_ekle_guncelle', { quizId, soru: soru(0) });
        await baslangicSoruSozu;

        const havuz1Sozu = bekle(admin, 'soru_havuzu_guncelle');
        admin.emit('havuz_soru_ekle_guncelle', { soru: soru(1) });
        const havuz1 = await havuz1Sozu;
        const pool1 = Object.values(havuz1.sorular).find(s => s.soru === 'Entegrasyon sorusu 1');
        assert.ok(pool1.id);

        const quiz1Sozu = bekle(admin, 'verileri_guncelle');
        admin.emit('havuzdan_quize_kopyala', { quizId, soruId: pool1.id, hedefIndex: null, tekraraIzinVer: false });
        let quizler = await quiz1Sozu;
        assert.equal(quizler[quizId].sorular.length, 2);
        assert.equal(quizler[quizId].sorular[0].soru, 'Entegrasyon sorusu 0');
        const quizKopyasi = quizler[quizId].sorular[1];
        assert.notEqual(String(quizKopyasi.id), String(pool1.id));
        assert.equal(quizKopyasi.kaynakSoruId, pool1.id);

        const havuzDegisSozu = bekle(admin, 'soru_havuzu_guncelle');
        admin.emit('havuz_soru_ekle_guncelle', { soru: { ...pool1, soru: 'Havuzda değişen metin' } });
        const havuzDegisti = await havuzDegisSozu;
        assert.equal(havuzDegisti.sorular[pool1.id].soru, 'Havuzda değişen metin');
        assert.equal(quizKopyasi.soru, 'Entegrasyon sorusu 1');

        const quizDegisSozu = bekle(admin, 'verileri_guncelle');
        admin.emit('soru_ekle_guncelle', { quizId, soru: { ...quizKopyasi, soru: 'Quiz içinde değişen metin' } });
        quizler = await quizDegisSozu;
        assert.equal(quizler[quizId].sorular.find(s => String(s.id) === String(quizKopyasi.id)).soru, 'Quiz içinde değişen metin');
        assert.equal(havuzDegisti.sorular[pool1.id].soru, 'Havuzda değişen metin');

        const havuzSilSozu = bekle(admin, 'soru_havuzu_guncelle');
        admin.emit('havuz_soru_sil', pool1.id);
        const havuzSilindi = await havuzSilSozu;
        assert.equal(havuzSilindi.sorular[pool1.id], undefined);
        assert.equal(quizler[quizId].sorular.find(s => String(s.id) === String(quizKopyasi.id)).soru, 'Quiz içinde değişen metin');

        const havuzTopluSozu = bekle(admin, 'soru_havuzu_guncelle');
        admin.emit('havuz_soru_toplu_ekle', { sorular: [soru(2), soru(3)] });
        const havuzToplu = await havuzTopluSozu;
        const yeniPoolIdleri = Object.values(havuzToplu.sorular).filter(s => ['Entegrasyon sorusu 2', 'Entegrasyon sorusu 3'].includes(s.soru)).map(s => s.id);
        assert.equal(yeniPoolIdleri.length, 2);

        const topluQuizSozu = bekle(admin, 'verileri_guncelle');
        admin.emit('havuzdan_quize_toplu_kopyala', { quizId, soruIdleri: yeniPoolIdleri });
        quizler = await topluQuizSozu;
        assert.equal(quizler[quizId].sorular.length, 4);

        const oncekiIdler = quizler[quizId].sorular.map(s => String(s.id));
        const tersIdler = [...oncekiIdler].reverse();
        const siraliQuizSozu = bekle(admin, 'verileri_guncelle');
        admin.emit('quiz_sorulari_sirala', { quizId, soruIdleri: tersIdler });
        quizler = await siraliQuizSozu;
        assert.deepEqual(quizler[quizId].sorular.map(s => String(s.id)), tersIdler);

        ekran = io(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true });
        await bekle(ekran, 'connect');
        ekran.emit('ekran_giris', 'ROOF-01');
        const pinSozu = bekle(admin, 'oturum_basladi');
        admin.emit('quiz_baslat', quizId);
        await pinSozu;
        const soruSozu = bekle(ekran, 'yeni_soru');
        admin.emit('soru_yolla');
        const canliSoru = await soruSozu;
        assert.equal(canliSoru.soruNo, 1);
        assert.equal(canliSoru.toplamSoru, 4);
        assert.equal(canliSoru.soru, quizler[quizId].sorular[0].soru);
        assert.equal(canliSoru.dogruCevap, undefined);
    } finally {
        admin?.disconnect();
        ekran?.disconnect();
        child.kill('SIGTERM');
        fs.rmSync(veriKlasoru, { recursive: true, force: true });
    }
});
