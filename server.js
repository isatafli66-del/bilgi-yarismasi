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

// --- ÇOKLU KURUM (MULTI-TENANT) VERİ YÖNETİMİ ---
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

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

// --- ŞİFRE VE LİSANS KORUMASI (Basic Auth) ---
app.use('/admin', (req, res, next) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    
    // login = Kurum Kodu (Örn: ROOF-01), password = Genel Sistem Şifresi
    const gercekSifre = process.env.ADMIN_SIFRE || '123456'; 

    if (login && password === gercekSifre) {
        // Tarayıcıya kurum kodunu tanımla ki admin.html kim olduğunu bilsin
        res.cookie('kurumKodu', login);
        return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Tazzy Yonetici Paneli"');
    res.status(401).send('Geçersiz Kurum Kodu veya Şifre.');
});

app.get('/admin', (req, res) => { res.sendFile(__dirname + '/public/admin.html'); });
app.get('/ekran', (req, res) => { res.sendFile(__dirname + '/public/ekran.html'); });
app.get('/logout', (req, res) => {
    res.status(401).send(`
        <h1 style="text-align:center; font-family:sans-serif; margin-top:50px; color:#46178f;">Oturum Güvenle Kapatıldı! 🔒</h1>
        <div style="text-align:center; margin-top:20px;"><a href="/admin" style="padding:10px 20px; background:#26890c; color:white; text-decoration:none; border-radius:5px; font-family:sans-serif;">Tekrar Giriş Yap</a></div>
        <script>let xhr = new XMLHttpRequest(); xhr.open("GET", "/admin", true, "logout", "logout"); xhr.send();</script>
    `);
});

// --- OYUN MOTORU RAM VERİLERİ ---
const kurumAktifPin = {}; // Örn: { 'ROOF-01': '842915' }
const oyunlar = {};       // Örn: { '842915': { kurumKodu: 'ROOF-01', oyuncular: {}, soruSirasi: -1 ... } }

io.on('connection', (socket) => {

    // 1. ADMİN BAĞLANTISI
    socket.on('admin_giris', (kurumKodu) => {
        if(!kurumKodu) return;
        socket.kurumKodu = kurumKodu;
        socket.join(`admin_${kurumKodu}`);
        
        const veriler = loadKurumData(kurumKodu);
        socket.emit('verileri_guncelle', veriler.quizler);
        socket.emit('ayarlar_guncelle', veriler.ayarlar);

        let aktifPin = kurumAktifPin[kurumKodu];
        if(aktifPin && oyunlar[aktifPin]) {
            socket.emit('oturum_basladi', { pin: aktifPin });
            socket.emit('admin_oyuncular_guncelle', oyunlar[aktifPin].oyuncular);
        }
    });

    // 2. EKRAN BAĞLANTISI
    socket.on('ekran_giris', (kurumKodu) => {
        if(!kurumKodu) return;
        socket.join(`ekran_${kurumKodu}`);
        
        const veriler = loadKurumData(kurumKodu);
        socket.emit('ayarlar_guncelle', veriler.ayarlar);

        let aktifPin = kurumAktifPin[kurumKodu];
        if(aktifPin) socket.emit('oturum_basladi', { pin: aktifPin });
    });

    // 3. OYUNCU KATILIMI
    socket.on('oyuncu_katil', (data) => {
        let pin = data.pin.toString().trim();
        let oyun = oyunlar[pin];
        
        if(!oyun) {
            socket.emit('katilma_hatasi', 'Hatalı PIN Girdiniz!');
            return;
        }

        socket.pin = pin;
        socket.join(`pin_${pin}`); // Sadece bu PIN odasına katılır
        oyun.oyuncular[socket.id] = { isim: data.isim, puan: 0 };

        const veriler = loadKurumData(oyun.kurumKodu);
        socket.emit('ayarlar_guncelle', veriler.ayarlar);
        socket.emit('katilma_basarili');

        io.to(`admin_${oyun.kurumKodu}`).emit('admin_oyuncular_guncelle', oyun.oyuncular);
        io.to(`ekran_${oyun.kurumKodu}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
    });

    // --- YAPAY ZEKA ---
    socket.on('ai_soru_uret', async (istek) => {
        try {
            const promptText = `Sen profesyonel bir bilgi yarışması hazırlayıcısın. Konu: "${istek.konu}", Zorluk: "${istek.zorluk}", Sayı: ${istek.sayi}. Her soru için İNGİLİZCE çok kısa bir görsel betimlemesi (gorsel_prompt) yaz. Cevabını SADECE JSON formatında ver: [{"soru": "...", "gorsel_prompt": "...", "secenekler": {"A":"...","B":"...","C":"...","D":"..."}, "dogruCevap": "A"}]`;
            const url = `https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash:generateContent?key=${API_KEY}`;
            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] }) });
            const data = await response.json();
            let text = data.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
            socket.emit('ai_soru_sonuc', JSON.parse(text));
        } catch (error) { socket.emit('ai_hata', 'API Hatası: ' + error.message); }
    });

    // --- AYAR VE VERİ GÜNCELLEMELERİ (Sadece Kendi Kurumuna) ---
    socket.on('admin_logo_guncelle', (logoBase64) => {
        const k = socket.kurumKodu; if(!k) return;
        const veriler = loadKurumData(k);
        veriler.ayarlar.logo = logoBase64;
        saveKurumData(k, 'ayarlar', veriler.ayarlar);
        io.to(`admin_${k}`).emit('ayarlar_guncelle', veriler.ayarlar);
        io.to(`ekran_${k}`).emit('ayarlar_guncelle', veriler.ayarlar);
        let pin = kurumAktifPin[k]; if(pin) io.to(`pin_${pin}`).emit('ayarlar_guncelle', veriler.ayarlar);
    });

    socket.on('quiz_ekle_guncelle', (quizData) => {
        const k = socket.kurumKodu; if(!k) return;
        const veriler = loadKurumData(k);
        if(!quizData.id) quizData.id = "quiz_" + Date.now();
        if(!veriler.quizler[quizData.id]) quizData.sorular = []; else quizData.sorular = veriler.quizler[quizData.id].sorular;
        veriler.quizler[quizData.id] = quizData; 
        saveKurumData(k, 'quizler', veriler.quizler);
        io.to(`admin_${k}`).emit('verileri_guncelle', veriler.quizler);
    });

    socket.on('quiz_sil', (quizId) => { 
        const k = socket.kurumKodu; if(!k) return;
        const veriler = loadKurumData(k);
        delete veriler.quizler[quizId]; saveKurumData(k, 'quizler', veriler.quizler); io.to(`admin_${k}`).emit('verileri_guncelle', veriler.quizler); 
    });
    
    socket.on('soru_ekle_guncelle', (data) => {
        const k = socket.kurumKodu; if(!k) return;
        const veriler = loadKurumData(k); const q = veriler.quizler[data.quizId];
        if(q) {
            if(!data.soru.id) { data.soru.id = Date.now(); q.sorular.push(data.soru); } 
            else { const index = q.sorular.findIndex(s => s.id === data.soru.id); if(index !== -1) q.sorular[index] = data.soru; }
            saveKurumData(k, 'quizler', veriler.quizler); io.to(`admin_${k}`).emit('verileri_guncelle', veriler.quizler);
        }
    });

    socket.on('soru_sil', (data) => { 
        const k = socket.kurumKodu; if(!k) return;
        const veriler = loadKurumData(k); const q = veriler.quizler[data.quizId];
        if(q) { q.sorular = q.sorular.filter(s => s.id !== data.soruId); saveKurumData(k, 'quizler', veriler.quizler); io.to(`admin_${k}`).emit('verileri_guncelle', veriler.quizler); }
    });

    // --- OYUN AKIŞ KONTROLLERİ ---
    socket.on('quiz_baslat', (quizId) => { 
        const k = socket.kurumKodu; if(!k) return;
        
        let eskiPin = kurumAktifPin[k];
        if(eskiPin && oyunlar[eskiPin]) { clearInterval(oyunlar[eskiPin].zamanlayici); delete oyunlar[eskiPin]; }

        let yeniPin = Math.floor(100000 + Math.random() * 900000).toString();
        kurumAktifPin[k] = yeniPin;
        oyunlar[yeniPin] = { kurumKodu: k, quizId: quizId, soruSirasi: -1, oyuncular: {}, zamanlayici: null, soruAktifMi: false, oyunDuraklatildi: false };

        io.to(`admin_${k}`).emit('oturum_basladi', { pin: yeniPin });
        io.to(`ekran_${k}`).emit('oturum_basladi', { pin: yeniPin });
        io.to(`admin_${k}`).emit('admin_oyuncular_guncelle', {});
    });

    socket.on('soru_yolla', () => {
        const k = socket.kurumKodu; if(!k) return;
        let pin = kurumAktifPin[k]; let oyun = oyunlar[pin]; if(!oyun) return;
        const quizler = loadKurumData(k).quizler; const aktifQuiz = quizler[oyun.quizId];

        if(oyun.zamanlayici) clearInterval(oyun.zamanlayici);
        oyun.soruAktifMi = false; oyun.oyunDuraklatildi = false; 
        oyun.soruSirasi++; 
        
        if (oyun.soruSirasi >= aktifQuiz.sorular.length) { 
            io.to(`ekran_${k}`).emit('quiz_bitti_bekle'); 
            io.to(`pin_${pin}`).emit('quiz_bitti_bekle'); 
            return; 
        }

        const siradakiSoru = aktifQuiz.sorular[oyun.soruSirasi]; oyun.soruAktifMi = true;
        io.to(`ekran_${k}`).emit('yeni_soru', siradakiSoru); io.to(`pin_${pin}`).emit('yeni_soru', siradakiSoru);
        
        let kalanSure = aktifQuiz.sure; 
        io.to(`ekran_${k}`).emit('zaman_guncelle', kalanSure); io.to(`pin_${pin}`).emit('zaman_guncelle', kalanSure);
        
        oyun.zamanlayici = setInterval(() => {
            if(!oyun.oyunDuraklatildi) {
                kalanSure--; 
                io.to(`ekran_${k}`).emit('zaman_guncelle', kalanSure); io.to(`pin_${pin}`).emit('zaman_guncelle', kalanSure);
                if (kalanSure <= 0) { 
                    clearInterval(oyun.zamanlayici); oyun.soruAktifMi = false; 
                    io.to(`ekran_${k}`).emit('sure_bitti', siradakiSoru.dogruCevap); io.to(`pin_${pin}`).emit('sure_bitti', siradakiSoru.dogruCevap); 
                }
            }
        }, 1000);
    });

    socket.on('cevap_gonder', (secilenSecenek) => {
        let pin = socket.pin; let oyun = oyunlar[pin]; if(!oyun || !oyun.soruAktifMi) return;
        let oyuncu = oyun.oyuncular[socket.id]; if(!oyuncu) return;

        const quizler = loadKurumData(oyun.kurumKodu).quizler;
        if (secilenSecenek === quizler[oyun.quizId].sorular[oyun.soruSirasi].dogruCevap) { 
            oyuncu.puan += quizler[oyun.quizId].puan; 
        }
        io.to(`admin_${oyun.kurumKodu}`).emit('admin_oyuncular_guncelle', oyun.oyuncular);
        io.to(`ekran_${oyun.kurumKodu}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
    });

    socket.on('sure_durdur_devam', (durum) => { let k = socket.kurumKodu; let pin = kurumAktifPin[k]; if(pin && oyunlar[pin]) oyunlar[pin].oyunDuraklatildi = durum; });
    socket.on('admin_skor_goster', () => { let k = socket.kurumKodu; let pin = kurumAktifPin[k]; if(pin) { io.to(`ekran_${k}`).emit('skor_tablosunu_goster'); io.to(`pin_${pin}`).emit('skor_tablosunu_goster'); } });
    socket.on('admin_podyum_goster', () => { let k = socket.kurumKodu; let pin = kurumAktifPin[k]; if(pin && oyunlar[pin]) { io.to(`ekran_${k}`).emit('quiz_bitti_final', Object.values(oyunlar[pin].oyuncular)); io.to(`pin_${pin}`).emit('quiz_bitti_final'); } });

    // --- ADMİN MANUEL OYUNCU MÜDAHALELERİ ---
    socket.on('admin_oyuncu_ekle', (isim) => {
        let k = socket.kurumKodu; let pin = kurumAktifPin[k]; let oyun = oyunlar[pin]; if(!oyun) return;
        const id = 'manuel_' + Date.now(); oyun.oyuncular[id] = { isim: isim, puan: 0 };
        io.to(`admin_${k}`).emit('admin_oyuncular_guncelle', oyun.oyuncular); io.to(`ekran_${k}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
    });
    socket.on('admin_puan_duzenle', (data) => {
        let k = socket.kurumKodu; let pin = kurumAktifPin[k]; let oyun = oyunlar[pin]; if(!oyun || !oyun.oyuncular[data.id]) return;
        oyun.oyuncular[data.id].puan = parseInt(data.puan) || 0; 
        io.to(`admin_${k}`).emit('admin_oyuncular_guncelle', oyun.oyuncular); io.to(`ekran_${k}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
    });
    socket.on('admin_oyuncu_ad_duzenle', (data) => {
        let k = socket.kurumKodu; let pin = kurumAktifPin[k]; let oyun = oyunlar[pin]; if(!oyun || !oyun.oyuncular[data.id]) return;
        oyun.oyuncular[data.id].isim = data.isim; 
        io.to(`admin_${k}`).emit('admin_oyuncular_guncelle', oyun.oyuncular); io.to(`ekran_${k}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
    });
    socket.on('admin_oyuncu_sil', (id) => {
        let k = socket.kurumKodu; let pin = kurumAktifPin[k]; let oyun = oyunlar[pin]; if(!oyun || !oyun.oyuncular[id]) return;
        delete oyun.oyuncular[id]; 
        io.to(`admin_${k}`).emit('admin_oyuncular_guncelle', oyun.oyuncular); io.to(`ekran_${k}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
    });

    socket.on('disconnect', () => { 
        if (socket.pin && oyunlar[socket.pin]) { 
            let oyun = oyunlar[socket.pin];
            if(oyun.oyuncular[socket.id]) {
                delete oyun.oyuncular[socket.id]; 
                io.to(`admin_${oyun.kurumKodu}`).emit('admin_oyuncular_guncelle', oyun.oyuncular); 
                io.to(`ekran_${oyun.kurumKodu}`).emit('puan_guncelle', Object.values(oyun.oyuncular)); 
            }
        } 
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Sunucu mükemmel çalışıyor! Port: ${PORT}`); });
