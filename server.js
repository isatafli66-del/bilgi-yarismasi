const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const API_KEY = (process.env.API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
const GEMINI_MODEL = (process.env.GEMINI_MODEL || 'gemini-1.5-flash').trim();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// --- ÇOKLU KURUM VERİ VE LİSANS YÖNETİMİ ---
// Render'da deploy sonrası verilerin sıfırlanmaması için kalıcı disk yolu kullanılır.
// Render panelinde Disk Mount Path olarak /var/data verirseniz otomatik buraya yazar.
// İsterseniz Environment'a DATA_DIR=/var/data da ekleyebilirsiniz.
const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/var/data') ? '/var/data' : path.join(__dirname, 'data'));
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const KURUMLAR_DOSYASI = path.join(DATA_DIR, 'kurumlar.json');

function getVarsayilanQuizler() {
    const varsayilanPath = path.join(__dirname, 'quizler.json');
    if (fs.existsSync(varsayilanPath)) {
        try { return JSON.parse(fs.readFileSync(varsayilanPath, 'utf8')); } catch(e) {}
    }
    return { "quiz_1": { id: "quiz_1", ad: "Örnek Teknoloji Quizi", sure: 20, puan: 100, sorular: [] } };
}

function getKurumlar() {
    if(!fs.existsSync(KURUMLAR_DOSYASI)) {
        fs.writeFileSync(KURUMLAR_DOSYASI, JSON.stringify({
            "ROOF-01": { sifre: "123456", bitis: "2030-01-01", aktif: true }
        }, null, 2));
    }
    return JSON.parse(fs.readFileSync(KURUMLAR_DOSYASI, 'utf8'));
}

function loadKurumData(kurum) {
    const qPath = path.join(DATA_DIR, `${kurum}_quizler.json`);
    const aPath = path.join(DATA_DIR, `${kurum}_ayarlar.json`);
    let quizler = getVarsayilanQuizler();
    let ayarlar = { logo: null };
    if(fs.existsSync(qPath)) { try { quizler = JSON.parse(fs.readFileSync(qPath, 'utf8')); } catch(e){} }
    if(fs.existsSync(aPath)) { try { ayarlar = JSON.parse(fs.readFileSync(aPath, 'utf8')); } catch(e){} }
    return { quizler, ayarlar };
}

function saveKurumData(kurum, tur, data) {
    const dPath = path.join(DATA_DIR, `${kurum}_${tur}.json`);
    fs.writeFileSync(dPath, JSON.stringify(data, null, 2));
}

// --- SÜPER ADMİN (MASTER) GİRİŞİ ---
app.use('/tazzy-master', (req, res, next) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    const masterSifre = process.env.MASTER_SIFRE || 'tazzy123'; 
    if (login === 'tazzy' && password === masterSifre) { return next(); }
    res.set('WWW-Authenticate', 'Basic realm="Master Paneli"');
    res.status(401).send('Yetkisiz Erişim!');
});
app.get('/tazzy-master', (req, res) => { res.sendFile(__dirname + '/public/master.html'); });


// --- KURUM YÖNETİCİ GİRİŞİ VE GÜVENLİK ---
app.use('/admin', (req, res, next) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [kurumKodu, kurumSifre] = Buffer.from(b64auth, 'base64').toString().split(':');
    const kurumlar = getKurumlar(); const kurum = kurumlar[kurumKodu];

    if (kurum && kurum.sifre === kurumSifre) {
        if(!kurum.aktif) { res.status(401).send('<h2 style="font-family:sans-serif; text-align:center; margin-top:50px; color:red;">Hesabınız askıya alınmıştır.</h2>'); return; }
        const bugun = new Date(); const bitisTarihi = new Date(kurum.bitis);
        if(bugun > bitisTarihi) { res.status(401).send(`<h2 style="font-family:sans-serif; text-align:center; margin-top:50px; color:red;">Lisans süreniz (${kurum.bitis}) tarihinde dolmuştur.</h2>`); return; }
        
        // ÇÖZÜM: Unuttuğumuz Cookie satırını geri koyduk! Sistem artık kim olduğunu biliyor.
        res.cookie('kurumKodu', kurumKodu); 
        return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Tazzy Kurum Paneli"');
    res.status(401).send('Geçersiz Kurum Kodu veya Şifre.');
});

app.get('/admin', (req, res) => { res.sendFile(__dirname + '/public/admin.html'); });
app.get('/ekran', (req, res) => { res.sendFile(__dirname + '/public/ekran.html'); });
app.get('/logout', (req, res) => { res.status(401).send(`<script>let xhr = new XMLHttpRequest(); xhr.open("GET", "/admin", true, "logout", "logout"); xhr.send(); window.location.href="/admin";</script>`); });

// --- OYUN MOTORU ---
const kurumAktifPin = {}; 
const oyunlar = {};       

io.on('connection', (socket) => {

    socket.on('master_veri_istek', () => { socket.emit('master_veriler', getKurumlar()); });
    socket.on('master_kurum_detay_istek', (kodu) => { const ayarlar = loadKurumData(kodu).ayarlar; socket.emit('master_kurum_detay_cevap', { kodu: kodu, logo: ayarlar.logo }); });
    socket.on('master_kurum_ekle_guncelle', (data) => {
        let kurumlar = getKurumlar();
        kurumlar[data.kodu] = { sifre: data.sifre, bitis: data.bitis, aktif: data.aktif };
        fs.writeFileSync(KURUMLAR_DOSYASI, JSON.stringify(kurumlar, null, 2));
        if(data.logoBase64 !== undefined) {
            const veriler = loadKurumData(data.kodu); veriler.ayarlar.logo = data.logoBase64; saveKurumData(data.kodu, 'ayarlar', veriler.ayarlar);
            io.to(`admin_${data.kodu}`).emit('ayarlar_guncelle', veriler.ayarlar); io.to(`ekran_${data.kodu}`).emit('ayarlar_guncelle', veriler.ayarlar);
            let pin = kurumAktifPin[data.kodu]; if(pin) io.to(`pin_${pin}`).emit('ayarlar_guncelle', veriler.ayarlar);
        }
        socket.emit('master_veriler', kurumlar);
    });
    socket.on('master_kurum_sil', (kodu) => { let kurumlar = getKurumlar(); if(kurumlar[kodu]) { delete kurumlar[kodu]; fs.writeFileSync(KURUMLAR_DOSYASI, JSON.stringify(kurumlar, null, 2)); } socket.emit('master_veriler', kurumlar); });

    // --- KURUM SOKETLERİ ---
    socket.on('admin_giris', (kurumKodu) => {
        if(!kurumKodu) return; 
        socket.kurumKodu = kurumKodu; 
        socket.join(`admin_${kurumKodu}`);
        const veriler = loadKurumData(kurumKodu); socket.emit('verileri_guncelle', veriler.quizler); socket.emit('ayarlar_guncelle', veriler.ayarlar);
        let pin = kurumAktifPin[kurumKodu]; if(pin && oyunlar[pin]) { socket.emit('oturum_basladi', { pin: pin }); socket.emit('admin_oyuncular_guncelle', oyunlar[pin].oyuncular); }
    });

    socket.on('ekran_giris', (kurumKodu) => {
        if(!kurumKodu) return; 
        socket.kurumKodu = kurumKodu;
        socket.join(`ekran_${kurumKodu}`); 
        const veriler = loadKurumData(kurumKodu); socket.emit('ayarlar_guncelle', veriler.ayarlar);
        let pin = kurumAktifPin[kurumKodu]; if(pin) socket.emit('oturum_basladi', { pin: pin });
    });

    socket.on('oyuncu_katil', (data) => {
        let pin = data.pin.toString().trim(); let oyun = oyunlar[pin];
        if(!oyun) { socket.emit('katilma_hatasi', 'Hatalı PIN Girdiniz!'); return; }
        socket.pin = pin; socket.join(`pin_${pin}`); oyun.oyuncular[socket.id] = { isim: data.isim, puan: 0 };
        const veriler = loadKurumData(oyun.kurumKodu); socket.emit('ayarlar_guncelle', veriler.ayarlar); socket.emit('katilma_basarili');
        io.to(`admin_${oyun.kurumKodu}`).emit('admin_oyuncular_guncelle', oyun.oyuncular);
        io.to(`ekran_${oyun.kurumKodu}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
        io.to(`pin_${pin}`).emit('puan_guncelle', Object.values(oyun.oyuncular)); 
    });

    // --- YAPAY ZEKA GÜNCELLEMESİ ---
    socket.on('ai_soru_uret', async (istek) => {
        try {
            if (!API_KEY) throw new Error("Sunucuda API_KEY bulunamadı. Render > Environment bölümüne geçerli Gemini API anahtarını API_KEY olarak ekleyin.");

            const konu = String(istek?.konu || '').trim().slice(0, 200);
            const zorluk = String(istek?.zorluk || 'Orta').trim().slice(0, 30);
            const sayi = Math.max(1, Math.min(parseInt(istek?.sayi, 10) || 3, 10));
            if (!konu) throw new Error("Konu başlığı boş olamaz.");

            const promptText = `Sen profesyonel bir bilgi yarışması hazırlayıcısın.
Konu: "${konu}"
Zorluk: "${zorluk}"
Soru sayısı: ${sayi}

Kurallar:
- Türkçe, eğlenceli ve net çoktan seçmeli sorular üret.
- Her soruda A, B, C, D seçenekleri eksiksiz olsun.
- dogruCevap sadece A, B, C veya D olsun.
- Her soru için İngilizce, kısa, güvenli bir gorsel_prompt yaz.
- Markdown, açıklama veya kod bloğu yazma.
- Cevabı yalnızca geçerli JSON dizisi olarak döndür.

Format:
[{"soru":"...","gorsel_prompt":"...","secenekler":{"A":"...","B":"...","C":"...","D":"..."},"dogruCevap":"A"}]`;

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(API_KEY)}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: promptText }] }],
                    generationConfig: {
                        temperature: 0.8,
                        responseMimeType: 'application/json'
                    }
                })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const apiMesaj = data.error?.message || `Google API HTTP ${response.status}`;
                throw new Error(`Yapay zeka servis hatası: ${apiMesaj}`);
            }

            const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
            if (!text) throw new Error("Yapay zeka boş cevap döndürdü.");

            let temiz = text.replace(/```json/gi, '').replace(/```/g, '').trim();
            const ilk = temiz.indexOf('[');
            const son = temiz.lastIndexOf(']');
            if (ilk !== -1 && son !== -1) temiz = temiz.slice(ilk, son + 1);

            let sorular;
            try { sorular = JSON.parse(temiz); }
            catch(e) { throw new Error("Yapay zeka cevabı JSON formatında okunamadı. Lütfen tekrar deneyin."); }

            if (!Array.isArray(sorular) || sorular.length === 0) throw new Error("Yapay zeka soru listesi oluşturamadı.");
            const duzeltilmis = sorular.slice(0, sayi).map((s, i) => ({
                soru: String(s.soru || `Soru ${i + 1}`).trim(),
                gorsel_prompt: String(s.gorsel_prompt || `${konu} quiz illustration`).trim(),
                secenekler: {
                    A: String(s.secenekler?.A || '').trim(),
                    B: String(s.secenekler?.B || '').trim(),
                    C: String(s.secenekler?.C || '').trim(),
                    D: String(s.secenekler?.D || '').trim()
                },
                dogruCevap: ['A','B','C','D'].includes(String(s.dogruCevap || '').trim().toUpperCase()) ? String(s.dogruCevap).trim().toUpperCase() : 'A'
            })).filter(s => s.soru && s.secenekler.A && s.secenekler.B && s.secenekler.C && s.secenekler.D);

            if (duzeltilmis.length === 0) throw new Error("Yapay zeka eksiksiz soru oluşturamadı. Lütfen tekrar deneyin.");
            socket.emit('ai_soru_sonuc', duzeltilmis);
        } catch (error) {
            console.error('AI soru üretme hatası:', error);
            socket.emit('ai_hata', error.message || 'Bilinmeyen yapay zeka hatası');
        }
    });

    // Veri Güncellemeleri
    socket.on('quiz_ekle_guncelle', (quizData) => { 
        const k = socket.kurumKodu; if(!k) return;
        const veriler = loadKurumData(k); if(!quizData.id) quizData.id = "quiz_" + Date.now(); if(!veriler.quizler[quizData.id]) quizData.sorular = []; else quizData.sorular = veriler.quizler[quizData.id].sorular; veriler.quizler[quizData.id] = quizData; saveKurumData(k, 'quizler', veriler.quizler); io.to(`admin_${k}`).emit('verileri_guncelle', veriler.quizler); 
    });
    socket.on('quiz_sil', (quizId) => { const k = socket.kurumKodu; if(!k) return; const veriler = loadKurumData(k); delete veriler.quizler[quizId]; saveKurumData(k, 'quizler', veriler.quizler); io.to(`admin_${k}`).emit('verileri_guncelle', veriler.quizler); });
    socket.on('soru_ekle_guncelle', (data) => { const k = socket.kurumKodu; if(!k) return; const veriler = loadKurumData(k); const q = veriler.quizler[data.quizId]; if(q) { if(!data.soru.id) { data.soru.id = Date.now(); q.sorular.push(data.soru); } else { const index = q.sorular.findIndex(s => s.id === data.soru.id); if(index !== -1) q.sorular[index] = data.soru; } saveKurumData(k, 'quizler', veriler.quizler); io.to(`admin_${k}`).emit('verileri_guncelle', veriler.quizler); } });
    socket.on('soru_sil', (data) => { const k = socket.kurumKodu; if(!k) return; const veriler = loadKurumData(k); const q = veriler.quizler[data.quizId]; if(q) { q.sorular = q.sorular.filter(s => s.id !== data.soruId); saveKurumData(k, 'quizler', veriler.quizler); io.to(`admin_${k}`).emit('verileri_guncelle', veriler.quizler); } });

    // Oyun Akışı
    socket.on('quiz_baslat', (quizId) => { 
        const k = socket.kurumKodu; if(!k) return;
        let eskiPin = kurumAktifPin[k]; if(eskiPin && oyunlar[eskiPin]) { clearInterval(oyunlar[eskiPin].zamanlayici); delete oyunlar[eskiPin]; }
        let yeniPin = Math.floor(100000 + Math.random() * 900000).toString();
        kurumAktifPin[k] = yeniPin;
        oyunlar[yeniPin] = { kurumKodu: k, quizId: quizId, soruSirasi: -1, oyuncular: {}, zamanlayici: null, soruAktifMi: false, oyunDuraklatildi: false };
        io.to(`admin_${k}`).emit('oturum_basladi', { pin: yeniPin }); io.to(`ekran_${k}`).emit('oturum_basladi', { pin: yeniPin }); io.to(`admin_${k}`).emit('admin_oyuncular_guncelle', {});
    });

    socket.on('soru_yolla', () => {
        const k = socket.kurumKodu; if(!k) return; let pin = kurumAktifPin[k]; let oyun = oyunlar[pin]; if(!oyun) return;
        const quizler = loadKurumData(k).quizler; const aktifQuiz = quizler[oyun.quizId];
        if(oyun.zamanlayici) clearInterval(oyun.zamanlayici); oyun.soruAktifMi = false; oyun.oyunDuraklatildi = false; oyun.soruSirasi++; 
        if (oyun.soruSirasi >= aktifQuiz.sorular.length) { io.to(`ekran_${k}`).emit('quiz_bitti_bekle'); io.to(`pin_${pin}`).emit('quiz_bitti_bekle'); return; }
        const siradakiSoru = aktifQuiz.sorular[oyun.soruSirasi]; oyun.soruAktifMi = true;
        io.to(`ekran_${k}`).emit('yeni_soru', siradakiSoru); io.to(`pin_${pin}`).emit('yeni_soru', siradakiSoru);
        let kalanSure = aktifQuiz.sure; io.to(`ekran_${k}`).emit('zaman_guncelle', kalanSure); io.to(`pin_${pin}`).emit('zaman_guncelle', kalanSure);
        oyun.zamanlayici = setInterval(() => {
            if(!oyun.oyunDuraklatildi) {
                kalanSure--; io.to(`ekran_${k}`).emit('zaman_guncelle', kalanSure); io.to(`pin_${pin}`).emit('zaman_guncelle', kalanSure);
                if (kalanSure <= 0) { clearInterval(oyun.zamanlayici); oyun.soruAktifMi = false; io.to(`ekran_${k}`).emit('sure_bitti', siradakiSoru.dogruCevap); io.to(`pin_${pin}`).emit('sure_bitti', siradakiSoru.dogruCevap); }
            }
        }, 1000);
    });

    socket.on('cevap_gonder', (secilenSecenek) => {
        let pin = socket.pin; let oyun = oyunlar[pin]; if(!oyun || !oyun.soruAktifMi) return; let oyuncu = oyun.oyuncular[socket.id]; if(!oyuncu) return;
        const quizler = loadKurumData(oyun.kurumKodu).quizler;
        if (secilenSecenek === quizler[oyun.quizId].sorular[oyun.soruSirasi].dogruCevap) { oyuncu.puan += quizler[oyun.quizId].puan; }
        io.to(`admin_${oyun.kurumKodu}`).emit('admin_oyuncular_guncelle', oyun.oyuncular); 
        io.to(`ekran_${oyun.kurumKodu}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
        io.to(`pin_${pin}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
    });

    socket.on('sure_durdur_devam', (durum) => { let k = socket.kurumKodu; let pin = kurumAktifPin[k]; if(pin && oyunlar[pin]) oyunlar[pin].oyunDuraklatildi = durum; });
    socket.on('admin_skor_goster', () => { let k = socket.kurumKodu; let pin = kurumAktifPin[k]; if(pin) { io.to(`ekran_${k}`).emit('skor_tablosunu_goster'); io.to(`pin_${pin}`).emit('skor_tablosunu_goster'); } });
    socket.on('admin_podyum_goster', () => { let k = socket.kurumKodu; let pin = kurumAktifPin[k]; if(pin && oyunlar[pin]) { io.to(`ekran_${k}`).emit('quiz_bitti_final', Object.values(oyunlar[pin].oyuncular)); io.to(`pin_${pin}`).emit('quiz_bitti_final', Object.values(oyunlar[pin].oyuncular)); } });

    socket.on('admin_oyuncu_ekle', (isim) => { let k = socket.kurumKodu; let pin = kurumAktifPin[k]; let oyun = oyunlar[pin]; if(!oyun) return; const id = 'manuel_' + Date.now(); oyun.oyuncular[id] = { isim: isim, puan: 0 }; io.to(`admin_${k}`).emit('admin_oyuncular_guncelle', oyun.oyuncular); io.to(`ekran_${k}`).emit('puan_guncelle', Object.values(oyun.oyuncular)); io.to(`pin_${pin}`).emit('puan_guncelle', Object.values(oyun.oyuncular)); });
    socket.on('admin_puan_duzenle', (data) => { let k = socket.kurumKodu; let pin = kurumAktifPin[k]; let oyun = oyunlar[pin]; if(!oyun || !oyun.oyuncular[data.id]) return; oyun.oyuncular[data.id].puan = parseInt(data.puan) || 0; io.to(`admin_${k}`).emit('admin_oyuncular_guncelle', oyun.oyuncular); io.to(`ekran_${k}`).emit('puan_guncelle', Object.values(oyun.oyuncular)); io.to(`pin_${pin}`).emit('puan_guncelle', Object.values(oyun.oyuncular)); });
    socket.on('admin_oyuncu_ad_duzenle', (data) => { let k = socket.kurumKodu; let pin = kurumAktifPin[k]; let oyun = oyunlar[pin]; if(!oyun || !oyun.oyuncular[data.id]) return; oyun.oyuncular[data.id].isim = data.isim; io.to(`admin_${k}`).emit('admin_oyuncular_guncelle', oyun.oyuncular); io.to(`ekran_${k}`).emit('puan_guncelle', Object.values(oyun.oyuncular)); io.to(`pin_${pin}`).emit('puan_guncelle', Object.values(oyun.oyuncular)); });
    socket.on('admin_oyuncu_sil', (id) => { let k = socket.kurumKodu; let pin = kurumAktifPin[k]; let oyun = oyunlar[pin]; if(!oyun || !oyun.oyuncular[id]) return; delete oyun.oyuncular[id]; io.to(`admin_${k}`).emit('admin_oyuncular_guncelle', oyun.oyuncular); io.to(`ekran_${k}`).emit('puan_guncelle', Object.values(oyun.oyuncular)); io.to(`pin_${pin}`).emit('puan_guncelle', Object.values(oyun.oyuncular)); });

    socket.on('disconnect', () => { if (socket.pin && oyunlar[socket.pin]) { let oyun = oyunlar[socket.pin]; if(oyun.oyuncular[socket.id]) { delete oyun.oyuncular[socket.id]; io.to(`admin_${oyun.kurumKodu}`).emit('admin_oyuncular_guncelle', oyun.oyuncular); io.to(`ekran_${oyun.kurumKodu}`).emit('puan_guncelle', Object.values(oyun.oyuncular)); io.to(`pin_${socket.pin}`).emit('puan_guncelle', Object.values(oyun.oyuncular)); } } });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Sunucu mükemmel çalışıyor! Port: ${PORT}`); });
