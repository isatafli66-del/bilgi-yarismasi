const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const oku = dosya => fs.readFileSync(path.join(root, dosya), 'utf8');

const server = oku('server.js');
const admin = oku('public/admin.html');
const ekran = oku('public/ekran.html');
const oyuncu = oku('public/index.html');

new vm.Script(server, { filename: 'server.js' });

for (const [ad, html] of [['admin.html', admin], ['ekran.html', ekran], ['index.html', oyuncu]]) {
    const scriptler = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(eslesme => eslesme[1]);
    assert.ok(scriptler.length > 0, `${ad} içinde yerel JavaScript bulunamadı.`);
    scriptler.forEach((script, index) => new vm.Script(script, { filename: `${ad}#script-${index + 1}` }));
}

assert.ok(admin.includes('function soruDuzenle(index)'), 'Admin soru düzenleme işlevi eksik.');
assert.ok(admin.includes('duzenlenenSoruId'), 'Düzenlenen soru kimliği korunmuyor.');
for (const alan of ['m_soru', 'm_gorsel', 'm_a', 'm_b', 'm_c', 'm_d', 'm_dogru']) {
    assert.ok(admin.includes(`id="${alan}"`), `Admin düzenleme alanı eksik: ${alan}`);
}
assert.ok(admin.indexOf('id="btnCevapYansit"') < admin.indexOf('id="btnSiradakiSoru"'), 'Cevap yansıtma butonu Sonraki Soru butonundan önce değil.');
assert.ok(admin.includes("socket.emit('cevap_yansit')"), 'Admin cevap yansıtma olayını göndermiyor.');

assert.ok(server.includes("socketAsync(socket, 'cevap_yansit'"), 'Sunucuda cevap yansıtma olayı eksik.');
assert.ok(server.includes('oyun.soruAktifMi = false;'), 'Cevap yansıtılırken yeni cevaplar kapatılmıyor.');
assert.ok(server.includes('if(oyun.zamanlayici) clearInterval(oyun.zamanlayici);'), 'Cevap yansıtılırken zamanlayıcı güvenli biçimde durdurulmuyor.');
assert.ok(server.includes('const { dogruCevap, ...guvenliSoru } = siradakiSoru;'), 'Doğru cevap normal soru paketinden ayrılmıyor.');
for (const alan of ['soruNo', 'toplamSoru', 'kalanSoru']) {
    assert.ok(server.includes(`${alan}:`), `Sunucu soru sayacı alanını göndermiyor: ${alan}`);
}

for (const [ad, html] of [['ekran.html', ekran], ['index.html', oyuncu]]) {
    assert.ok(html.includes("socket.on('cevap_yansit'"), `${ad} cevap yansıtma olayını dinlemiyor.`);
    assert.ok(html.includes('cevap-dogru'), `${ad} doğru cevap rengini içermiyor.`);
    assert.ok(html.includes('cevap-yanlis'), `${ad} yanlış cevap rengini içermiyor.`);
    assert.ok(html.includes('soruNo'), `${ad} x/y soru numarasını kullanmıyor.`);
    assert.ok(html.includes('kalanSoru'), `${ad} kalan soru bilgisini kullanmıyor.`);
}

assert.ok(ekran.includes('height: 100dvh'), 'Ana ekran dinamik pencere yüksekliğini kullanmıyor.');
assert.ok(ekran.includes('--fit-scale'), 'Ana ekran içerik ölçeği eksik.');
assert.ok(ekran.includes('function anaEkranaSigdir()'), 'Ana ekran otomatik sığdırma işlevi eksik.');
assert.ok(ekran.includes('class="secenek-metin"'), 'Ana ekran uzun seçenek metinlerini bağımsız sığdırmıyor.');
assert.ok(ekran.includes("window.addEventListener('resize', anaEkranaSigdir)"), 'Ana ekran boyut değişimini izlemiyor.');

assert.ok(oyuncu.includes('height: 100dvh'), 'Yarışmacı ekranı dinamik pencere yüksekliğini kullanmıyor.');
assert.ok(oyuncu.includes('--mobil-fit'), 'Yarışmacı ekranı içerik ölçeği eksik.');
assert.ok(oyuncu.includes('function mobilEkranaSigdir()'), 'Yarışmacı ekranı otomatik sığdırma işlevi eksik.');
assert.ok(oyuncu.includes("window.addEventListener('orientationchange', mobilEkranaSigdir)"), 'Yarışmacı ekranı yön değişimini izlemiyor.');
assert.ok(!oyuncu.includes('-webkit-line-clamp: 3'), 'Yarışmacı cevapları hâlâ üç satırda kesiliyor.');

console.log('✓ Sunucu ve üç istemci dosyasının JavaScript sözdizimi geçerli');
console.log('✓ Admin soru düzenleme alanları ve kaydetme sözleşmesi mevcut');
console.log('✓ Cevap yansıtma olayı doğru/yanlış renkleriyle iki ekrana bağlı');
console.log('✓ x/y ve kalan soru alanları sunucu–istemci sözleşmesinde mevcut');
console.log('✓ Normal soru paketinde doğru cevap istemciye gönderilmiyor');
console.log('✓ Ana ekran ve yarışmacı ekranı pencere boyutuna göre dinamik sığdırılıyor');

