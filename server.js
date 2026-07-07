const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');

const API_KEY = process.env.API_KEY;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// --- ŞİFRE KORUMASI (Basic Auth) ---
app.use('/admin', (req, res, next) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    
    // Render Environment'tan gelen şifre veya varsayılan: 123456
    const gercekSifre = process.env.ADMIN_SIFRE || '123456'; 

    if (login === 'admin' && password === gercekSifre) {
        return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Yonetici Paneli"');
    res.status(401).send('Yönetici paneline erişim yetkiniz yok.');
});

app.get('/admin', (req, res) => { res.sendFile(__dirname + '/public/admin.html'); });
app.get('/ekran', (req, res) => { res.sendFile(__dirname + '/public/ekran.html'); });

const VERI_DOSYASI = 'quizler.json';
const AYARLAR_DOSYASI = 'ayarlar.json'; 

function veriYukle(dosyaAd, varsayilan) {
    if (fs.existsSync(dosyaAd)) {
        try { return JSON.parse(fs.readFileSync(dosyaAd, 'utf8')); } catch (e) { console.error("Okuma hatası:", e); }
    }
    return varsayilan;
}
function veriKaydet(dosyaAd, data) { fs.writeFileSync(dosyaAd, JSON.stringify(data, null, 2)); }

let quizler = veriYukle(VERI_DOSYASI, { "quiz_1": { id: "quiz_1", ad: "Örnek Teknoloji Quizi", sure: 20, puan: 100, sorular: [] } }); 
let ayarlar = veriYukle(AYARLAR_DOSYASI, { logo: null }); 

let aktifQuizId = null; let aktifSoruSirasi = -1; let oyuncular = {}; let geriSayimSayaci; let soruAktifMi = false;
let oyunDuraklatildi = false; 

io.on('connection', (socket) => {
    socket.emit('verileri_guncelle', quizler);
    socket.emit('admin_oyuncular_guncelle', oyuncular);
    socket.emit('ayarlar_guncelle', ayarlar); // Yeni bağlanan herkese logoyu gönder

    // Logo Güncelleme Olayı
    socket.on('admin_logo_guncelle', (logoBase64) => {
        ayarlar.logo = logoBase64;
        veriKaydet(AYARLAR_DOSYASI, ayarlar);
        io.emit('ayarlar_guncelle', ayarlar);
    });

    socket.on('ai_soru_uret', async (istek) => {
        try {
            const promptText = `Sen profesyonel bir bilgi yarışması hazırlayıcısın. Konu: "${istek.konu}", Zorluk: "${istek.zorluk}", Sayı: ${istek.sayi}. Her soru için İNGİLİZCE çok kısa bir görsel betimlemesi (gorsel_prompt) yaz. Cevabını SADECE JSON formatında ver: [{"soru": "...", "gorsel_prompt": "...", "secenekler": {"A":"...","B":"...","C":"...","D":"..."}, "dogruCevap": "A"}]`;
            const url = `https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash:generateContent?key=${API_KEY}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
            });
            const data = await response.json();
            let text = data.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
            socket.emit('ai_soru_sonuc', JSON.parse(text));
        } catch (error) { socket.emit('ai_hata', 'API Hatası: ' + error.message); }
    });

    socket.on('quiz_ekle_guncelle', (quizData) => {
        if(!quizData.id) quizData.id = "quiz_" + Date.now();
        if(!quizler[quizData.id]) quizData.sorular = []; else quizData.sorular = quizler[quizData.id].sorular;
        quizler[quizData.id] = quizData; 
        veriKaydet(VERI_DOSYASI, quizler); io.emit('verileri_guncelle', quizler);
    });

    socket.on('quiz_sil', (quizId) => { delete quizler[quizId]; veriKaydet(VERI_DOSYASI, quizler); io.emit('verileri_guncelle', quizler); });
    
    socket.on('soru_ekle_guncelle', (data) => {
        const q = quizler[data.quizId];
        if(q) {
            if(!data.soru.id) { data.soru.id = Date.now(); q.sorular.push(data.soru); } 
            else { const index = q.sorular.findIndex(s => s.id === data.soru.id); if(index !== -1) q.sorular[index] = data.soru; }
            veriKaydet(VERI_DOSYASI, quizler); io.emit('verileri_guncelle', quizler);
        }
    });
    socket.on('soru_sil', (data) => { const q = quizler[data.quizId]; if(q) { q.sorular = q.sorular.filter(s => s.id !== data.soruId); veriKaydet(VERI_DOSYASI, quizler); io.emit('verileri_guncelle', quizler); } });

    socket.on('sure_durdur_devam', (durum) => { oyunDuraklatildi = durum; });
    socket.on('admin_skor_goster', () => { io.emit('skor_tablosunu_goster'); });
    socket.on('admin_podyum_goster', () => { io.emit('quiz_bitti_final', Object.values(oyuncular)); });

    socket.on('admin_oyuncu_ekle', (isim) => {
        const id = 'manuel_' + Date.now(); oyuncular[id] = { isim: isim, puan: 0 };
        io.emit('puan_guncelle', Object.values(oyuncular)); io.emit('admin_oyuncular_guncelle', oyuncular);
    });
    socket.on('admin_puan_duzenle', (data) => {
        if(oyuncular[data.id]) { oyuncular[data.id].puan = parseInt(data.puan) || 0; io.emit('puan_guncelle', Object.values(oyuncular)); io.emit('admin_oyuncular_guncelle', oyuncular); }
    });
    socket.on('admin_oyuncu_ad_duzenle', (data) => {
        if(oyuncular[data.id]) { oyuncular[data.id].isim = data.isim; io.emit('puan_guncelle', Object.values(oyuncular)); io.emit('admin_oyuncular_guncelle', oyuncular); }
    });
