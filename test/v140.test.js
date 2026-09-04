const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { io } = require('socket.io-client');
const { adminCookie } = require('./http-auth');
const { ayarlariNormalizeEt, gorselBaglantisiGuvenliMi, yayinOncesiKontrol, oyunuSerilestir, oyunuCanlandir } = require('../canli-oturum');
const root = path.resolve(__dirname, '..');
const question = { soru: 'Bir üçgenin iç açılarının toplamı?', secenekler: { A: '90', B: '180', C: '270', D: '360' }, dogruCevap: 'B', gorsel: null };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function event(socket, name, timeout = 6000) {
    return new Promise((resolve, reject) => {
        const listener = data => { clearTimeout(timer); resolve(data); };
        const timer = setTimeout(() => { socket.off(name, listener); reject(new Error('Olay zaman aşımı: ' + name)); }, timeout);
        socket.once(name, listener);
    });
}
async function emitWait(socket, send, data, receive) {
    const promise = event(socket, receive); socket.emit(send, data); return promise;
}
async function start(dir, port) {
    const child = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port), STORAGE_PROVIDER: 'file', DATA_DIR: dir, MASTER_SIFRE: 'test-master-secret-long', API_KEY: '' }, stdio: ['ignore','pipe','pipe'] });
    let logs = '';
    child.stdout.on('data', data => logs += data); child.stderr.on('data', data => logs += data);
    for(let i = 0; i < 160; i++) { if(logs.includes('Sunucu çalışıyor')) return child; if(child.exitCode !== null) throw new Error(logs); await wait(50); }
    child.kill(); throw new Error('Sunucu başlamadı: ' + logs);
}
async function connect(address, cookie) {
    const socket = io(address, { transports: ['websocket'], forceNew: true, reconnection: false, extraHeaders: cookie ? { Cookie: cookie } : {} });
    await event(socket, 'connect'); return socket;
}

test('v1.4 ayarlar, güvenli görsel, kontrol listesi ve süreli yedek', () => {
    const settings = ayarlariNormalizeEt({ anaRenk: 'red;url(x)', paket: 'unknown', sonucArsivModu: 'x' });
    assert.equal(settings.anaRenk, '#46178f'); assert.equal(settings.sonucArsivModu, undefined);
    assert.equal(gorselBaglantisiGuvenliMi('javascript:alert(1)'), false);
    assert.equal(gorselBaglantisiGuvenliMi('data:image/svg+xml;base64,aaaa'), false);
    assert.equal(gorselBaglantisiGuvenliMi('data:image/jpeg;base64,YWJj'), true);
    assert.equal(gorselBaglantisiGuvenliMi('https://example.com/image.png'), true);
    assert.equal(yayinOncesiKontrol({ sorular: [question], sure: 20 }, { ekranBagli: true }).hazir, true);
    assert.equal(yayinOncesiKontrol({ sorular: [{ ...question, dogruCevap: 'E' }] }).hazir, false);
    const saved = oyunuSerilestir({ pin: '123456', kurumKodu: 'ROOF-01', quizId: 'q', durum: 'soru', kalanSure: 17, oyuncular: {}, soruKayitlari: [] }, 1000);
    const restored = oyunuCanlandir(saved, 2000);
    assert.equal(restored.kalanSure, 17); assert.equal(restored.oyunDuraklatildi, true); assert.equal(restored.soruAktifMi, false);
    assert.equal(oyunuCanlandir(saved, 1000 + 13 * 60 * 60 * 1000), null);
});

test('v1.4 gerçek HTTP yetki, kurum izolasyonu, yeniden başlatma, prova ve kalıcı sonuç kaydı olmaması', { timeout: 60000 }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tazzy-v140-'));
    const port = 43129; const address = `http://127.0.0.1:${port}`;
    let child; const sockets = [];
    const add = async cookie => { const s = await connect(address, cookie); sockets.push(s); return s; };
    try {
        child = await start(dir, port);
        assert.equal((await fetch(address + '/admin.html')).status, 404);
        assert.equal((await fetch(address + '/master.html')).status, 404);
        assert.equal((await fetch(address + '/%61dmin.html')).status, 404);
        assert.equal((await fetch(address + '/admin', { headers: { Cookie: 'tazzyYetki=%ZZ' } })).status, 401);
        const admin = await add(await adminCookie(address));
        await emitWait(admin, 'admin_giris', 'ROOF-01', 'verileri_guncelle');
        const rogue = await add();
        assert.match(await emitWait(rogue, 'master_veri_istek', null, 'yetki_hatasi'), /oturum/i);
        await emitWait(rogue, 'ekran_giris', 'ROOF-01', 'ayarlar_guncelle');
        assert.match(await emitWait(rogue, 'quiz_sil', 'quiz_1', 'yetki_hatasi'), /oturum/i);
        assert.match(await emitWait(admin, 'admin_giris', 'OTHER', 'yetki_hatasi'), /yetki/i);
        const master = await add(await adminCookie(address, 'tazzy', 'test-master-secret-long'));
        await emitWait(master, 'master_kurum_ekle_guncelle', { kodu: 'OTHER', sifre: 'other-password', aktif: true, bitis: '2030-01-01' }, 'master_veriler');
        const other = await add(await adminCookie(address, 'OTHER', 'other-password'));
        await emitWait(other, 'admin_giris', 'OTHER', 'verileri_guncelle');
        await emitWait(admin, 'quiz_ekle_guncelle', { id: 'recovery', ad: 'Kurtarma Testi', sure: 60, puan: 100 }, 'verileri_guncelle');
        await emitWait(admin, 'soru_ekle_guncelle', { quizId: 'recovery', soru: question }, 'verileri_guncelle');
        const check = await emitWait(admin, 'yayin_oncesi_kontrol', 'recovery', 'yayin_oncesi_sonuc'); assert.equal(check.hazir, true);
        const themeUpdate = event(admin, 'ayarlar_guncelle');
        admin.emit('kurum_tema_kaydet', { tema: 'gece', anaRenk: '#123456', logo: 'not-allowed', sonucArsivModu: 'full' });
        const theme = await themeUpdate; assert.equal(theme.anaRenk, '#123456'); assert.equal(theme.logo, null); assert.equal(theme.sonucArsivModu, undefined);
        await emitWait(other, 'admin_giris', 'OTHER', 'verileri_guncelle');
        const otherSettings = await emitWait(rogue, 'ekran_giris', 'OTHER', 'ayarlar_guncelle');
        assert.equal(otherSettings.anaRenk, '#46178f');
        const { pin } = await emitWait(admin, 'quiz_baslat', 'recovery', 'oturum_basladi');
        assert.match(await emitWait(admin, 'prova_baslat', 'recovery', 'sistem_hata'), /Gerçek oturum korunuyor/);
        const player = await add();
        await emitWait(player, 'oyuncu_katil', { isim: '<img src=x onerror=alert(1)>', pin, oyuncuToken: 'private-player-secret-123' }, 'katilma_basarili');
        const qPromise = event(player, 'yeni_soru'); admin.emit('soru_yolla'); const q = await qPromise; assert.equal(q.dogruCevap, undefined);
        assert.match(await emitWait(player, 'cevap_gonder', { secim: 'B', soruNo: 99 }, 'cevap_reddedildi'), /önceki/);
        const accepted = event(player, 'cevap_alindi'); const rejected = event(player, 'cevap_reddedildi');
        player.emit('cevap_gonder', { secim: 'B', soruNo: 1 }); player.emit('cevap_gonder', { secim: 'B', soruNo: 1 });
        await Promise.all([accepted, rejected]);
        const snapshotPath = path.join(dir, 'aktif_oyun_ROOF-01.json');
        let snapshot;
        for(let i = 0; i < 100; i++) { try { snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')); if(Object.values(snapshot.oyun.oyuncular).some(p => p.puan === 100)) break; } catch (_) {} await wait(40); }
        assert.equal(Object.values(snapshot.oyun.oyuncular)[0].puan, 100);
        assert.ok(snapshot.oyun.quizAnlik);
        sockets.forEach(s => s.disconnect());
        const stopped = once(child, 'exit'); child.kill(); await stopped;
        child = await start(dir, port);
        const admin2 = await add(await adminCookie(address));
        const recovery = event(admin2, 'oturum_kurtarildi'); await emitWait(admin2, 'admin_giris', 'ROOF-01', 'verileri_guncelle'); assert.equal((await recovery).pin, pin);
        const player2 = await add();
        const savedAnswer = event(player2, 'oyuncu_cevap_durumu');
        await emitWait(player2, 'oyuncu_katil', { isim: 'Ayşe', pin, oyuncuToken: 'private-player-secret-123' }, 'katilma_basarili');
        assert.equal((await savedAnswer).secim, 'B');
        const denied = await emitWait(player2, 'cevap_gonder', 'A', 'cevap_reddedildi'); assert.match(denied, /kapalı/);
        const resumed = event(player2, 'oturum_devam_ediyor'); admin2.emit('aktif_oturumu_devam_ettir'); await resumed;
        const personal = event(player2, 'oyuncu_sonuc');
        const results = await emitWait(admin2, 'admin_podyum_goster', null, 'admin_sonuclar_guncelle');
        assert.equal((await personal).oyuncu.puan, 100); assert.equal(results.oyuncular.length, 1);
        assert.equal(fs.existsSync(path.join(dir, 'sonuc_arsivi_ROOF-01.json')), false);
        await emitWait(admin2, 'quiz_sonlandir', null, 'oturum_bitti');
        for(let i = 0; i < 50 && fs.existsSync(snapshotPath); i++) await wait(30);
        assert.equal(fs.existsSync(snapshotPath), false);
        assert.match(await emitWait(player2, 'oyuncu_katil', { isim: 'Eski PIN', pin, oyuncuToken: 'old-pin-test' }, 'katilma_hatasi'), /Hatalı PIN/);
        const rehearsal = await emitWait(admin2, 'prova_baslat', 'recovery', 'oturum_basladi'); assert.equal(rehearsal.prova, true);
        assert.match(await emitWait(player2, 'oyuncu_katil', { isim: 'Gerçek Oyuncu', pin: rehearsal.pin }, 'katilma_hatasi'), /prova/i);
        admin2.emit('soru_yolla'); await wait(1500);
        const rehearsalResult = await emitWait(admin2, 'admin_podyum_goster', null, 'admin_sonuclar_guncelle');
        assert.equal(rehearsalResult.oyuncular.length, 3); assert.ok(rehearsalResult.oyuncular.some(p => p.puan === 100));
        assert.equal(fs.existsSync(snapshotPath), false);
        await emitWait(admin2, 'quiz_sonlandir', null, 'oturum_bitti');
        const freshMaster = await add(await adminCookie(address, 'tazzy', 'test-master-secret-long'));
        const otherCookie = await adminCookie(address, 'OTHER', 'other-password');
        const revoked = await add(otherCookie);
        await emitWait(revoked, 'admin_giris', 'OTHER', 'verileri_guncelle');
        await emitWait(freshMaster, 'master_kurum_ekle_guncelle', { kodu:'OTHER', sifre:'changed:test-password', aktif:true, bitis:'2030-01-01' }, 'master_veriler');
        assert.match(await emitWait(revoked, 'quiz_sil', 'quiz_1', 'yetki_hatasi'), /giriş|yetki|oturum/i);
        assert.ok(await adminCookie(address, 'OTHER', 'changed:test-password'));
    } finally {
        sockets.forEach(s => s.disconnect());
        if(child && child.exitCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped; }
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('v1.4 her yayın aşaması doğru görünümle duraklatılmış kurtarılır', { timeout: 45000 }, async () => {
    for(const [durum,gorunum,expected] of [
        ['lobi','lobi','oturum_basladi'],['soru','soru','yeni_soru'],
        ['sure_bitti','sure_bitti','sure_bitti'],['cevap','cevap','cevap_yansit'],
        ['soru','skor','skor_tablosunu_goster'],['tamamlandi','tamamlandi','quiz_bitti_bekle'],
        ['podyum','podyum','quiz_bitti_final']
    ]) {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(),'tazzy-stage-'));
        let child, screen, admin;
        try {
            const quiz = { id:'stage', ad:'Aşama testi', sure:20, puan:100, sorular:[question] };
            const saved = oyunuSerilestir({ pin:'765432',kurumKodu:'ROOF-01',quizId:'stage',quizAnlik:quiz,toplamSoru:1,soruSirasi:durum==='lobi'?-1:0,durum,gorunum,kalanSure:13,cevapYansitildi:durum==='cevap',oyuncular:{},soruKayitlari:[question],sonSonuc:durum==='podyum'?{quizAdi:'Aşama testi',oyuncular:[],sorular:[]}:null });
            fs.writeFileSync(path.join(dir,'aktif_oyun_ROOF-01.json'),JSON.stringify(saved));
            fs.writeFileSync(path.join(dir,'aktif_oyun_indeksi.json'),JSON.stringify({'765432':{kurumKodu:'ROOF-01',sonaErme:Date.now()+3600000}}));
            child = await start(dir,43130);
            screen = await connect('http://127.0.0.1:43130');
            const stage = event(screen,expected); const paused = event(screen,'oturum_kurtarildi');
            screen.emit('ekran_giris','ROOF-01'); await stage; await paused;
            admin = await connect('http://127.0.0.1:43130',await adminCookie('http://127.0.0.1:43130'));
            await emitWait(admin,'admin_giris','ROOF-01','verileri_guncelle');
            await emitWait(admin,'quiz_sonlandir',null,'oturum_bitti');
            assert.equal(fs.existsSync(path.join(dir,'aktif_oyun_ROOF-01.json')),false);
        } finally {
            screen?.disconnect();admin?.disconnect();
            if(child && child.exitCode===null){const stopped=once(child,'exit');child.kill();await stopped;}
            fs.rmSync(dir,{recursive:true,force:true});
        }
    }
});
