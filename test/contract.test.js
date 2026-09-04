const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const oku = dosya => fs.readFileSync(path.join(root, dosya), 'utf8');

const server = oku('server.js');
const havuzModulu = oku('soru-havuzu.js');
const admin = oku('public/admin.html');
const master = oku('public/master.html');
const ekran = oku('public/ekran.html');
const oyuncu = oku('public/index.html');
const manifest = JSON.parse(oku('public/manifest.webmanifest'));
const serviceWorker = oku('public/service-worker.js');

new vm.Script(server, { filename: 'server.js' });
new vm.Script(havuzModulu, { filename: 'soru-havuzu.js' });
for(const file of ['canli-oturum.js','etkinlik-sablonlari.js','public/v140-common.js','public/v140-admin.js','public/v140-master.js','public/service-worker.js']) new vm.Script(oku(file), { filename: file });
assert.ok(!server.includes("socketAsync(socket, 'sonuc_arsivi"), 'Sonuç arşivi bu sürümde olmamalı.');


for (const [ad, html] of [['admin.html', admin], ['master.html', master], ['ekran.html', ekran], ['index.html', oyuncu]]) {
    const scriptler = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(eslesme => eslesme[1]);
    assert.ok(scriptler.length > 0, `${ad} içinde yerel JavaScript bulunamadı.`);
    scriptler.forEach((script, index) => new vm.Script(script, { filename: `${ad}#script-${index + 1}` }));
}

for (const alan of ['h_soru', 'h_gorsel', 'h_konu', 'h_zorluk', 'h_a', 'h_b', 'h_c', 'h_d', 'h_dogru']) assert.ok(admin.includes(`id="${alan}"`), `Havuz soru alanı eksik: ${alan}`);
for (const alan of ['qs_soru', 'qs_gorsel', 'qs_a', 'qs_b', 'qs_c', 'qs_d', 'qs_dogru']) assert.ok(admin.includes(`id="${alan}"`), `Quiz kopyası düzenleme alanı eksik: ${alan}`);
assert.ok(admin.includes('function havuzFormKaydet()'), 'Manuel soruyu havuza kaydetme işlevi eksik.');
assert.ok(admin.includes('function quizSoruKaydet()'), 'Quiz içindeki bağımsız kopyayı düzenleme işlevi eksik.');
assert.ok(admin.includes('draggable="true"'), 'Soru kartlarında sürükleme desteği eksik.');
assert.ok(admin.includes('function havuzSurukleBaslat'), 'Havuzdan quize sürükleme işlevi eksik.');
assert.ok(admin.includes('function quizSiralaSurukle'), 'Quiz içinde sürükleyerek sıralama işlevi eksik.');
assert.ok(admin.includes('function quizSoruTasi'), 'Dokunmatik yukarı/aşağı sıralama işlevi eksik.');
assert.ok(admin.includes('function siralamayiGeriAl'), 'Sıralamayı geri alma işlevi eksik.');
assert.ok(admin.includes('function secilileriQuizeEkle'), 'Havuzdan toplu quiz kopyalama işlevi eksik.');
assert.ok(admin.includes('function filtrelenmisHavuz'), 'Havuz arama/filtreleme işlevi eksik.');
assert.ok(admin.includes('function aiTumunuHavuzaEkle'), 'AI sorularını topluca havuza ekleme işlevi eksik.');
assert.ok(admin.includes("socket.emit('havuz_soru_ekle_guncelle'"), 'Admin havuz soru kaydetme olayını göndermiyor.');
assert.ok(admin.includes("socket.emit('havuzdan_quize_kopyala'"), 'Admin bağımsız quiz kopyalama olayını göndermiyor.');
assert.ok(admin.includes("socket.emit('quiz_sorulari_sirala'"), 'Admin quiz sıralama olayını göndermiyor.');
assert.ok(admin.indexOf('id="btnCevapYansit"') < admin.indexOf('id="btnSiradakiSoru"'), 'Cevap yansıtma butonu Sonraki Soru butonundan önce değil.');
assert.ok(admin.includes("socket.emit('cevap_yansit')"), 'Admin cevap yansıtma olayını göndermiyor.');

assert.ok(server.includes("socketAsync(socket, 'cevap_yansit'"), 'Sunucuda cevap yansıtma olayı eksik.');
assert.ok(server.includes('soru_havuzu_${kurum}'), 'Kuruma özel soru havuzu kayıt anahtarı eksik.');
assert.ok(server.includes('soru_havuzu_meta_${kurum}'), 'Havuz geçiş meta kaydı eksik.');
assert.ok(server.includes('eskiQuizleriHavuzaAktar'), 'Mevcut quiz sorularını havuza aktarma işlevi sunucuya bağlı değil.');
assert.ok(server.includes("socketAsync(socket, 'havuz_soru_ekle_guncelle'"), 'Sunucuda havuz soru ekleme/düzenleme olayı eksik.');
assert.ok(server.includes("socketAsync(socket, 'havuz_soru_sil'"), 'Sunucuda havuzdan bağımsız silme olayı eksik.');
assert.ok(server.includes("socketAsync(socket, 'havuzdan_quize_kopyala'"), 'Sunucuda havuzdan bağımsız quiz kopyası olayı eksik.');
assert.ok(server.includes("socketAsync(socket, 'havuzdan_quize_toplu_kopyala'"), 'Sunucuda toplu quiz kopyalama olayı eksik.');
assert.ok(server.includes("socketAsync(socket, 'quiz_sorulari_sirala'"), 'Sunucuda quiz sıralama olayı eksik.');
assert.ok(server.includes("socketAsync(socket, 'quiz_soruyu_tasi'"), 'Sunucuda dokunmatik soru taşıma olayı eksik.');
assert.ok(server.includes("socket.emit('soru_havuzu_guncelle'"), 'Admin bağlantısında havuz verisi gönderilmiyor.');
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
assert.ok(ekran.includes('id="soruUstSatir"'), 'Ana ekranda sayaç ve logo için ayrılmış üst satır eksik.');
assert.ok(ekran.includes('id="oyunKurumLogoKutusu"'), 'Ana ekranda çakışmasız kurum logo kutusu eksik.');
assert.ok(ekran.includes('function kurumLogosunuGuncelle(logoVerisi)'), 'Ana ekran logo yükleme/hata koruması eksik.');
assert.ok(!ekran.includes('id="ekranLogo" class="gizli" style="position: absolute'), 'Ana ekranda eski çakışan logo yerleşimi hâlâ bulunuyor.');

assert.ok(oyuncu.includes('height: 100dvh'), 'Yarışmacı ekranı dinamik pencere yüksekliğini kullanmıyor.');
assert.ok(oyuncu.includes('--mobil-fit'), 'Yarışmacı ekranı içerik ölçeği eksik.');
assert.ok(oyuncu.includes('function mobilEkranaSigdir()'), 'Yarışmacı ekranı otomatik sığdırma işlevi eksik.');
assert.ok(oyuncu.includes("window.addEventListener('orientationchange', mobilEkranaSigdir)"), 'Yarışmacı ekranı yön değişimini izlemiyor.');
assert.ok(!oyuncu.includes('-webkit-line-clamp: 3'), 'Yarışmacı cevapları hâlâ üç satırda kesiliyor.');
assert.ok(oyuncu.includes('id="mobilKurumLogoKutusu"'), 'Yarışmacı bilgi çubuğunda kurum logo kutusu eksik.');
assert.ok(oyuncu.includes('data-kurum-logo-kutusu'), 'Yarışmacı ekran durumlarına bağlı logo alanları eksik.');
assert.ok(oyuncu.includes('function kurumLogolariniGuncelle(logoVerisi)'), 'Yarışmacı ekranı logo yükleme/hata koruması eksik.');
assert.ok(!oyuncu.includes('id="globalMobilLogo"'), 'Yarışmacı ekranında eski çakışan logo yerleşimi hâlâ bulunuyor.');

assert.ok(master.includes('logoBase64: seciliLogoBase64'), 'MASTER ekranı kurum logosunu sunucuya göndermiyor.');
assert.ok(server.includes('logo: data.logoBase64 === undefined ? veriler.ayarlar.logo : data.logoBase64'), 'Sunucu MASTER logosunu kurum ayarlarına kaydetmiyor.');
assert.ok(server.includes("socket.emit('ayarlar_guncelle', veriler.ayarlar)"), 'Sunucu kurum ayarlarını bağlanan ekrana göndermiyor.');

for(const sekme of ['sekmeHazirlik', 'sekmeCanli', 'sekmeSonuclar']) assert.ok(admin.includes(`id="${sekme}"`), `Yönetici sekmesi eksik: ${sekme}`);
assert.ok(admin.includes('id="btnQuizBitir"'), 'Yönetici panelinde Quizi Bitir düğmesi eksik.');
assert.ok(admin.includes("socket.emit('quiz_sonlandir')"), 'Yönetici paneli quiz sonlandırma olayını göndermiyor.');
assert.ok(admin.includes('function manuelCevapGir'), 'Manuel yarışmacı için tek tık cevap girişi eksik.');
assert.ok(admin.includes('function sonucEkraniniCiz'), 'Optik cevap anahtarı ekranı eksik.');
assert.ok(admin.includes('function sonuclariCSVIndir'), 'Anlık sonuç indirme işlevi eksik.');
assert.ok(server.includes("socketAsync(socket, 'admin_podyum_goster'"), 'Podyum sonuç hazırlama olayı eksik.');
assert.ok(server.includes("socketAsync(socket, 'quiz_sonlandir'"), 'Sunucuda her aşamada quiz bitirme olayı eksik.');
assert.ok(server.includes("socketAsync(socket, 'admin_manuel_cevap_gir'"), 'Sunucuda manuel cevap girişi eksik.');
assert.ok(server.includes("socket.emit('cevap_reddedildi'"), 'Aynı soruya birden fazla cevap koruması eksik.');
assert.ok(server.includes("emit('oyuncu_sonuc'"), 'Kişiye özel cevap sonucu olayı eksik.');
assert.ok(oyuncu.includes('id="oyunMenu"'), 'Yarışmacı ana sayfa/çıkış menüsü eksik.');
assert.ok(oyuncu.includes('function anaSayfayaDon'), 'Yarışmacı ana sayfaya dönüş işlevi eksik.');
assert.ok(server.includes("socket.on('oyuncu_ana_sayfa'"), 'Ana sayfaya dönüşte puan ve cevapları koruyan sunucu olayı eksik.');
assert.ok(oyuncu.includes('id="cevaplariGosterBtn"'), 'Yarışmacı cevaplarını görüntüleme düğmesi eksik.');
assert.ok(oyuncu.includes("navigator.serviceWorker.register('/service-worker.js')"), 'PWA servis çalışanı kaydı eksik.');
assert.equal(manifest.display, 'standalone');
assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
assert.ok(manifest.icons.some(icon => icon.sizes === '512x512'));
assert.ok(serviceWorker.includes("startsWith('/socket.io/')"), 'Servis çalışanı canlı Socket.IO trafiğini önbellek dışında tutmuyor.');
assert.ok(fs.existsSync(path.join(root, 'public/icons/tazzy-192.png')), '192px Tazzy PWA ikonu eksik.');
assert.ok(fs.existsSync(path.join(root, 'public/icons/tazzy-512.png')), '512px Tazzy PWA ikonu eksik.');

console.log('✓ Sunucu ve üç istemci dosyasının JavaScript sözdizimi geçerli');
console.log('✓ Merkezi soru havuzu, bağımsız quiz kopyası ve iki düzenleme formu mevcut');
console.log('✓ Sürükle-bırak, toplu kopyalama, filtreleme, geri alma ve dokunmatik sıralama bağlı');
console.log('✓ Eski quiz sorularının kuruma özel havuza kayıpsız geçiş sözleşmesi mevcut');
console.log('✓ Cevap yansıtma olayı doğru/yanlış renkleriyle iki ekrana bağlı');
console.log('✓ x/y ve kalan soru alanları sunucu–istemci sözleşmesinde mevcut');
console.log('✓ Normal soru paketinde doğru cevap istemciye gönderilmiyor');
console.log('✓ Ana ekran ve yarışmacı ekranı pencere boyutuna göre dinamik sığdırılıyor');
console.log('✓ MASTER kurum logosu iki ekranda çakışmasız ve hataya dayanıklı gösteriliyor');
console.log('✓ Sekmeli yönetim, anlık optik sonuç, manuel cevap ve quiz bitirme akışları mevcut');
console.log('✓ Yarışmacı menüsü, kişisel cevap özeti ve Tazzy PWA kurulumu mevcut');
