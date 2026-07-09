const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.API_KEY;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// --- ÇOKLU KURUM VERİ VE LİSANS YÖNETİMİ ---
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const KURUMLAR_DOSYASI = path.join(DATA_DIR, 'kurumlar.json');
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
    let quizler = { "quiz_1": { id: "quiz_1", ad: "Örnek Teknoloji Quizi", sure: 20, puan: 100, sorular: [] } };
    let ayarlar = { logo: null };
    if(fs.existsSync(qPath)) { try { quizler = JSON.parse(fs.readFileSync(qPath, 'utf8')); } catch(e){} }
    if(fs.existsSync(aPath)) { try { ayarlar = JSON.parse(fs.readFileSync(aPath, 'utf8')); } catch(e){} }
    return { quizler, ayarlar };
}

function saveKurumData(kurum, tur, data) {
    const dPath = path.join(DATA_DIR, `${kurum}_${tur}.json`);
    fs.writeFileSync(dPath, JSON.stringify(data, null, 2));
}

// --- 1. SÜPER ADMİN (TAZZY MASTER) GİRİŞİ ---
app.use('/tazzy-master', (req, res, next) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    const masterSifre = process.env.MASTER_SIFRE || 'tazzy123'; 
    if (login === 'tazzy' && password === masterSifre) { return next(); }
    res.set('WWW-Authenticate', 'Basic realm="Master Paneli"');
    res.status(401).send('Yetkisiz Erişim!');
});
app.get('/tazzy-master', (req, res) => { res.sendFile(__dirname + '/public/master.html'); });


// --- 2. KURUM YÖNETİCİ GİRİŞİ (LİSANS KONTROLLÜ) ---
app.use('/admin', (req, res, next) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [kurumKodu, kurumSifre] = Buffer.from(b64auth, 'base64').toString().split(':');
    const kurumlar = getKurumlar(); const kurum = kurumlar[kurumKodu];

    if (kurum && kurum.sifre === kurumSifre) {
        if(!kurum.aktif) { res.status(401).send('<h2 style="font-family:sans-serif; text-align:center; margin-top:50px; color:red;">Hesabınız askıya alınmıştır.</h2>'); return; }
        const bugun = new Date(); const bitisTarihi = new Date(kurum.bitis);
        if(bugun > bitisTarihi) { res.status(401).send(`<h2 style="font-family:sans-serif; text-align:center; margin-top:50px; color:red;">Lisans süreniz (${kurum.bitis}) tarihinde dolmuştur.</h2>`); return; }
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

    // --- MASTER SOKETLERİ ---
    socket.on('master_veri_istek', () => { socket.emit('master_veriler', getKurumlar()); });
    
    socket.on('master_kurum_detay_istek', (kodu) => {
        const ayarlar = loadKurumData(kodu).ayarlar;
        socket.emit('master_kurum_detay_cevap', { kodu: kodu, logo: ayarlar.logo });
    });

    socket.on('master_kurum_ekle_guncelle', (data) => {
        let kurumlar = getKurumlar();
        kurumlar[data.kodu] = { sifre: data.sifre, bitis: data.bitis, aktif: data.aktif };
        fs.writeFileSync(KURUMLAR_DOSYASI, JSON.stringify(kurumlar, null, 2));
        
        // Master logo yüklediyse kaydet ve tüm odalara güncelleme at
        if(data.logoBase64 !== undefined) {
            const veriler = loadKurumData(data.kodu);
            veriler.ayarlar.logo = data.logoBase64;
            saveKurumData(data.kodu, 'ayarlar', veriler.ayarlar);
            io.to(`admin_${data.kodu}`).emit('ayarlar_guncelle', veriler.ayarlar);
            io.to(`ekran_${data.kodu}`).emit('ayarlar_guncelle', veriler.ayarlar);
            let pin = kurumAktifPin[data.kodu]; if(pin) io.to(`pin_${pin}`).emit('ayarlar_guncelle', veriler.ayarlar);
        }
        socket.emit('master_veriler', kurumlar);
    });

    socket.on('master_kurum_sil', (kodu) => { let kurumlar = getKurumlar(); if(kurumlar[kodu]) { delete kurumlar[kodu]; fs.writeFileSync(KURUMLAR_DOSYASI, JSON.stringify(kurumlar, null, 2)); } socket.emit('master_veriler', kurumlar); });


    // --- KURUM SOKETLERİ ---
    socket.on('admin_giris', (kurumKodu) => {
        if(!kurumKodu) return; socket.kurumKodu = kurumKodu; socket.join(`admin_${kurumKodu}`);
        const veriler = loadKurumData(kurumKodu); socket.emit('verileri_guncelle', veriler.quizler); socket.emit('ayarlar_guncelle', veriler.ayarlar);
        let pin = kurumAktifPin[kurumKodu]; if(pin && oyunlar[pin]) { socket.emit('oturum_basladi', { pin: pin }); socket.emit('admin_oyuncular_guncelle', oyunlar[pin].oyuncular); }
    });

    socket.on('ekran_giris', (kurumKodu) => {
        if(!kurumKodu) return; socket.join(`ekran_${kurumKodu}`); const veriler = loadKurumData(kurumKodu); socket.emit('ayarlar_guncelle', veriler.ayarlar);
        let pin = kurumAktifPin[kurumKodu]; if(pin) socket.emit('oturum_basladi', { pin: pin });
    });

    socket.on('oyuncu_katil', (data) => {
        let pin = data.pin.toString().trim(); let oyun = oyunlar[pin];
        if(!oyun) { socket.emit('katilma_hatasi', 'Hatalı PIN Girdiniz!'); return; }
        socket.pin = pin; socket.join(`pin_${pin}`); oyun.oyuncular[socket.id] = { isim: data.isim, puan: 0 };
        const veriler = loadKurumData(oyun.kurumKodu); socket.emit('ayarlar_guncelle', veriler.ayarlar); socket.emit('katilma_basarili');
        io.to(`admin_${oyun.kurumKodu}`).emit('admin_oyuncular_guncelle', oyun.oyuncular);
        
        // Puanları ekrana ve oyunculara anlık yansıt
        io.to(`ekran_${oyun.kurumKodu}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
        io.to(`pin_${pin}`).emit('puan_guncelle', Object.values(oyun.oyuncular)); 
    });

    // --- YAPAY ZEKA ---
    socket.on('ai_soru_uret', async (istek) => {
        try {
            // 1. API KEY Kontrolü
            if (!API_KEY) {
                throw new Error("Sunucuda API_KEY bulunamadı! Lütfen Render ayarlarını kontrol et.");
            }

            const promptText = `Sen profesyonel bir bilgi yarışması hazırlayıcısın. Konu: "${istek.konu}", Zorluk: "${istek.zorluk}", Sayı: ${istek.sayi}. Her soru için İNGİLİZCE çok kısa bir görsel betimlemesi (gorsel_prompt) yaz. Cevabını SADECE JSON formatında ver: [{"soru": "...", "gorsel_prompt": "...", "secenekler": {"A":"...","B":"...","C":"...","D":"..."}, "dogruCevap": "A"}]`;
            
            // 2. En güncel ve stabil model olan gemini-1.5-flash sürümüne güncelledik
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
            
            const response = await fetch(url, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] }) 
            });
            
            const data = await response.json();
            
            // 3. Google'dan hata dönerse sistemi çökertmek yerine hatayı ekrana basıyoruz
            if (data.error) {
                throw new Error("Google API Reddedildi: " + data.error.message);
            }
            
            // 4. Güvenlik filtresine takılma durumunda kontrol
            if (!data.candidates || data.candidates.length === 0) {
                throw new Error("Yapay zeka cevap veremedi. (Güvenlik filtresine takılmış olabilir).");
            }

            let text = data.candidates[0].content.parts[0].text;
            
            // Markdown json formatını temizle
            text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
            
            socket.emit('ai_soru_sonuc', JSON.parse(text));
        } catch (error) { 
            console.error("AI Hatası:", error);
            socket.emit('ai_hata', 'Detaylı Hata: ' + error.message); 
        }
    });
    
    // Oyun Akış
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
        let pin = socket.pin; let oyun = oyunlar[pin]; if(!oyun || !oyun.soruAktifMi) return;
        let oyuncu = oyun.oyuncular[socket.id]; if(!oyuncu) return;
        const quizler = loadKurumData(oyun.kurumKodu).quizler;
        if (secilenSecenek === quizler[oyun.quizId].sorular[oyun.soruSirasi].dogruCevap) { oyuncu.puan += quizler[oyun.quizId].puan; }
        io.to(`admin_${oyun.kurumKodu}`).emit('admin_oyuncular_guncelle', oyun.oyuncular); 
        io.to(`ekran_${oyun.kurumKodu}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
        io.to(`pin_${pin}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
    });

    socket.on('sure_durdur_devam', (durum) => { let k = socket.kurumKodu; let pin = kurumAktifPin[k]; if(pin && oyunlar[pin]) oyunlar[pin].oyunDuraklatildi = durum; });
    socket.on('admin_skor_goster', () => { let k = socket.kurumKodu; let pin = kurumAktifPin[k]; if(pin) { io.to(`ekran_${k}`).emit('skor_tablosunu_goster'); io.to(`pin_${pin}`).emit('skor_tablosunu_goster'); } });
    socket.on('admin_podyum_goster', () => { let k = socket.kurumKodu; let pin = kurumAktifPin[k]; if(pin && oyunlar[pin]) { 
        io.to(`ekran_${k}`).emit('quiz_bitti_final', Object.values(oyunlar[pin].oyuncular)); 
        io.to(`pin_${pin}`).emit('quiz_bitti_final', Object.values(oyunlar[pin].oyuncular)); // Oyunculara da listeyi gönder
    } });

    // Manuel Puan Müdahalelerinde Telefonları da Güncelle
    socket.on('admin_oyuncu_ekle', (isim) => { let k = socket.kurumKodu; let pin = kurumAktifPin[k]; let oyun = oyunlar[pin]; if(!oyun) return; const id = 'manuel_' + Date.now(); oyun.oyuncular[id] = { isim: isim, puan: 0 }; io.to(`admin_${k}`).emit('admin_oyuncular_guncelle', oyun.oyuncular); io.to(`ekran_${k}`).emit('puan_guncelle', Object.values(oyun.oyuncular)); io.to(`pin_${pin}`).emit('puan_guncelle', Object.values(oyun.oyuncular)); });
    socket.on('admin_puan_duzenle', (data) => { let k = socket.kurumKodu; let pin = kurumAktifPin[k]; let oyun = oyunlar[pin]; if(!oyun || !oyun.oyuncular[data.id]) return; oyun.oyuncular[data.id].puan = parseInt(data.puan) || 0; io.to(`admin_${k}`).emit('admin_oyuncular_guncelle', oyun.oyuncular); io.to(`ekran_${k}`).emit('puan_guncelle', Object.values(oyun.oyuncular)); io.to(`pin_${pin}`).emit('puan_guncelle', Object.values(oyun.oyuncular)); });
    socket.on('admin_oyuncu_ad_duzenle', (data) => { let k = socket.kurumKodu; let pin = kurumAktifPin[k]; let oyun = oyunlar[pin]; if(!oyun || !oyun.oyuncular[data.id]) return; oyun.oyuncular[data.id].isim = data.isim; io.to(`admin_${k}`).emit('admin_oyuncular_guncelle', oyun.oyuncular); io.to(`ekran_${k}`).emit('puan_guncelle', Object.values(oyun.oyuncular)); io.to(`pin_${pin}`).emit('puan_guncelle', Object.values(oyun.oyuncular)); });
    socket.on('admin_oyuncu_sil', (id) => { let k = socket.kurumKodu; let pin = kurumAktifPin[k]; let oyun = oyunlar[pin]; if(!oyun || !oyun.oyuncular[id]) return; delete oyun.oyuncular[id]; io.to(`admin_${k}`).emit('admin_oyuncular_guncelle', oyun.oyuncular); io.to(`ekran_${k}`).emit('puan_guncelle', Object.values(oyun.oyuncular)); io.to(`pin_${pin}`).emit('puan_guncelle', Object.values(oyun.oyuncular)); });

    socket.on('disconnect', () => { if (socket.pin && oyunlar[socket.pin]) { let oyun = oyunlar[socket.pin]; if(oyun.oyuncular[socket.id]) { delete oyun.oyuncular[socket.id]; io.to(`admin_${oyun.kurumKodu}`).emit('admin_oyuncular_guncelle', oyun.oyuncular); io.to(`ekran_${oyun.kurumKodu}`).emit('puan_guncelle', Object.values(oyun.oyuncular)); io.to(`pin_${socket.pin}`).emit('puan_guncelle', Object.values(oyun.oyuncular)); } } });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Sunucu mükemmel çalışıyor! Port: ${PORT}`); });
