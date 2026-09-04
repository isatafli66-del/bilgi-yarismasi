const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');
const { adminCookie } = require('./http-auth');

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
        child.once('exit', kod => { if(kod) { clearTimeout(zaman); reject(new Error(`Test sunucusu ${kod} koduyla kapandı.`)); } });
    });
}

function soru(no, dogruCevap = 'C') {
    return {
        soru: `Canlı test sorusu ${no}`,
        gorsel: null,
        secenekler: { A: `A${no}`, B: `B${no}`, C: `C${no}`, D: `D${no}` },
        dogruCevap
    };
}

test('v1.3 canlı akış: tek cevap, manuel cevap, kişisel sonuç, optik sonuç ve güvenli bitirme', { timeout: 30000 }, async () => {
    const veriKlasoru = fs.mkdtempSync(path.join(os.tmpdir(), 'tazzy-v130-'));
    const port = 43128;
    const root = path.resolve(__dirname, '..');
    const child = spawn(process.execPath, ['server.js'], {
        cwd: root,
        env: { ...process.env, STORAGE_PROVIDER: 'file', DATA_DIR: veriKlasoru, PORT: String(port), API_KEY: '', MASTER_SIFRE: 'test-master-secret-long' },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let admin;
    let ekran;
    let oyuncu;
    let gecKalan;
    try {
        await sunucuyuBekle(child);
        const adres = `http://127.0.0.1:${port}`;
        admin = io(adres, { transports: ['websocket'], forceNew: true, extraHeaders: { Cookie: await adminCookie(adres) } });
        await bekle(admin, 'connect');
        const ilkQuizler = bekle(admin, 'verileri_guncelle');
        admin.emit('admin_giris', 'ROOF-01');
        await ilkQuizler;

        const quizId = 'v130_canli_test';
        const quizSozu = bekle(admin, 'verileri_guncelle');
        admin.emit('quiz_ekle_guncelle', { id: quizId, ad: 'V1.3 Canlı Test', sure: 20, puan: 100 });
        await quizSozu;
        for(const yeniSoru of [soru(1), soru(2, 'A')]) {
            const soruSozu = bekle(admin, 'verileri_guncelle');
            admin.emit('soru_ekle_guncelle', { quizId, soru: yeniSoru });
            await soruSozu;
        }

        ekran = io(adres, { transports: ['websocket'], forceNew: true });
        await bekle(ekran, 'connect');
        ekran.emit('ekran_giris', 'ROOF-01');
        const pinSozu = bekle(admin, 'oturum_basladi');
        admin.emit('quiz_baslat', quizId);
        const { pin } = await pinSozu;

        oyuncu = io(adres, { transports: ['websocket'], forceNew: true });
        await bekle(oyuncu, 'connect');
        const katilma = bekle(oyuncu, 'katilma_basarili');
        oyuncu.emit('oyuncu_katil', { isim: 'Ayşe', pin, oyuncuToken: 'test-ayse-001' });
        await katilma;

        const manuelGuncelleme = bekle(admin, 'admin_oyuncular_guncelle');
        admin.emit('admin_oyuncu_ekle', 'Masa Takımı');
        const manuelOyuncular = await manuelGuncelleme;
        const manuelId = Object.keys(manuelOyuncular).find(id => manuelOyuncular[id].manuel);
        assert.ok(manuelId);

        const yeniSoru = bekle(oyuncu, 'yeni_soru');
        admin.emit('soru_yolla');
        const canliSoru = await yeniSoru;
        assert.equal(canliSoru.dogruCevap, undefined);
        assert.equal(canliSoru.soruNo, 1);

        const cevapAlindi = bekle(oyuncu, 'cevap_alindi');
        oyuncu.emit('cevap_gonder', 'C');
        await cevapAlindi;
        const tekrarReddedildi = bekle(oyuncu, 'cevap_reddedildi');
        oyuncu.emit('cevap_gonder', 'C');
        assert.match(await tekrarReddedildi, /zaten kaydedildi/i);

        const anaSayfaDurumu = bekle(admin, 'admin_oyuncular_guncelle');
        oyuncu.emit('oyuncu_ana_sayfa');
        const anaSayfadakiOyuncular = await anaSayfaDurumu;
        const ayseId = Object.keys(anaSayfadakiOyuncular).find(id => anaSayfadakiOyuncular[id].isim === 'Ayşe');
        assert.equal(anaSayfadakiOyuncular[ayseId].puan, 100);
        assert.equal(anaSayfadakiOyuncular[ayseId].bagli, false);
        const yenidenKatilma = bekle(oyuncu, 'katilma_basarili');
        const yenidenAdminDurumu = bekle(admin, 'admin_oyuncular_guncelle');
        oyuncu.emit('oyuncu_katil', { isim: 'Ayşe', pin, oyuncuToken: 'test-ayse-001' });
        await Promise.all([yenidenKatilma, yenidenAdminDurumu]);

        const manuelCevapDurumu = bekle(admin, 'admin_oyuncular_guncelle');
        admin.emit('admin_manuel_cevap_gir', { id: manuelId, secim: 'A' });
        const cevapliOyuncular = await manuelCevapDurumu;
        assert.equal(cevapliOyuncular[manuelId].mevcutYanit.secim, 'A');
        assert.equal(cevapliOyuncular[manuelId].mevcutYanit.dogruMu, false);

        const kisiselSonucSozu = bekle(oyuncu, 'oyuncu_sonuc');
        const adminSonucSozu = bekle(admin, 'admin_sonuclar_guncelle');
        const podyumSozu = bekle(ekran, 'quiz_bitti_final');
        admin.emit('admin_podyum_goster');
        const [kisiselSonuc, adminSonuc, podyum] = await Promise.all([kisiselSonucSozu, adminSonucSozu, podyumSozu]);
        assert.equal(kisiselSonuc.oyuncu.isim, 'Ayşe');
        assert.equal(kisiselSonuc.oyuncu.puan, 100, 'Aynı cevabı iki kez göndermek puanı çoğaltmamalı.');
        assert.equal(kisiselSonuc.cevaplar[0].secim, 'C');
        assert.equal(kisiselSonuc.cevaplar[0].dogruMu, true);
        assert.equal(kisiselSonuc.cevaplar[0].dogruCevap, 'C');
        assert.equal(adminSonuc.sorular[0].dogruCevap, 'C');
        assert.equal(adminSonuc.oyuncular.length, 2);
        assert.equal(podyum[0].isim, 'Ayşe');

        const ekranBitti = bekle(ekran, 'quiz_sonlandirildi');
        const oyuncuBitti = bekle(oyuncu, 'quiz_sonlandirildi');
        admin.emit('quiz_sonlandir');
        await Promise.all([ekranBitti, oyuncuBitti]);

        gecKalan = io(adres, { transports: ['websocket'], forceNew: true });
        await bekle(gecKalan, 'connect');
        const katilmaHatasi = bekle(gecKalan, 'katilma_hatasi');
        gecKalan.emit('oyuncu_katil', { isim: 'Geç Kalan', pin, oyuncuToken: 'test-gec-001' });
        assert.match(await katilmaHatasi, /Hatalı PIN/i);
    } finally {
        admin?.disconnect();
        ekran?.disconnect();
        oyuncu?.disconnect();
        gecKalan?.disconnect();
        child.kill('SIGTERM');
        fs.rmSync(veriKlasoru, { recursive: true, force: true });
    }
});
