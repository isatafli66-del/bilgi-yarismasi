const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');

const API_KEY = process.env.API_KEY;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.get('/admin', (req, res) => { res.sendFile(__dirname + '/public/admin.html'); });
app.get('/ekran', (req, res) => { res.sendFile(__dirname + '/public/ekran.html'); });

const VERI_DOSYASI = 'quizler.json';

function veriYukle() {
    if (fs.existsSync(VERI_DOSYASI)) {
        try {
            return JSON.parse(fs.readFileSync(VERI_DOSYASI, 'utf8'));
        } catch (e) { console.error("JSON okuma hatası:", e); }
    }
    return { "quiz_1": { id: "quiz_1", ad: "Örnek Teknoloji Quizi", sure: 20, puan: 100, sorular: [] } };
}

function veriKaydet(data) {
    fs.writeFileSync(VERI_DOSYASI, JSON.stringify(data, null, 2));
}

let quizler = veriYukle(); 
let aktifQuizId = null; let aktifSoruSirasi = -1; let oyuncular = {}; let geriSayimSayaci; let soruAktifMi = false;
let oyunDuraklatildi = false; 

io.on('connection', (socket) => {
    socket.emit('verileri_guncelle', quizler);
    socket.emit('admin_oyuncular_guncelle', oyuncular);

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
        veriKaydet(quizler); io.emit('verileri_guncelle', quizler);
    });

    socket.on('quiz_sil', (quizId) => { delete quizler[quizId]; veriKaydet(quizler); io.emit('verileri_guncelle', quizler); });
    
    socket.on('soru_ekle_guncelle', (data) => {
        const q = quizler[data.quizId];
        if(q) {
            if(!data.soru.id) { data.soru.id = Date.now(); q.sorular.push(data.soru); } 
            else { const index = q.sorular.findIndex(s => s.id === data.soru.id); if(index !== -1) q.sorular[index] = data.soru; }
            veriKaydet(quizler); io.emit('verileri_guncelle', quizler);
        }
    });
    socket.on('soru_sil', (data) => { const q = quizler[data.quizId]; if(q) { q.sorular = q.sorular.filter(s => s.id !== data.soruId); veriKaydet(quizler); io.emit('verileri_guncelle', quizler); } });

    // --- ADMİN YAYIN VE OYUNCU KONTROLLERİ ---
    socket.on('sure_durdur_devam', (durum) => { oyunDuraklatildi = durum; });

    socket.on('admin_skor_goster', () => { io.emit('skor_tablosunu_goster'); });
    
    socket.on('admin_podyum_goster', () => { io.emit('quiz_bitti_final', Object.values(oyuncular)); });

    socket.on('admin_oyuncu_ekle', (isim) => {
        const id = 'manuel_' + Date.now();
        oyuncular[id] = { isim: isim, puan: 0 };
        io.emit('puan_guncelle', Object.values(oyuncular));
        io.emit('admin_oyuncular_guncelle', oyuncular);
    });

    socket.on('admin_puan_duzenle', (data) => {
        if(oyuncular[data.id]) {
            oyuncular[data.id].puan = parseInt(data.puan) || 0;
            io.emit('puan_guncelle', Object.values(oyuncular));
            io.emit('admin_oyuncular_guncelle', oyuncular);
        }
    });

    socket.on('admin_oyuncu_ad_duzenle', (data) => {
        if(oyuncular[data.id]) {
            oyuncular[data.id].isim = data.isim;
            io.emit('puan_guncelle', Object.values(oyuncular));
            io.emit('admin_oyuncular_guncelle', oyuncular);
        }
    });

    socket.on('admin_oyuncu_sil', (id) => {
        if(oyuncular[id]) {
            delete oyuncular[id];
            io.emit('puan_guncelle', Object.values(oyuncular));
            io.emit('admin_oyuncular_guncelle', oyuncular);
        }
    });
    // ----------------------------------------

    socket.on('quiz_baslat', (quizId) => { 
        if(geriSayimSayaci) clearInterval(geriSayimSayaci);
        soruAktifMi = false; oyunDuraklatildi = false;
        aktifQuizId = quizId; aktifSoruSirasi = -1; oyuncular = {}; 
        io.emit('yeni_oyun_basladi'); io.emit('puan_guncelle', []); 
        io.emit('admin_oyuncular_guncelle', oyuncular);
    });

    socket.on('yeni_oyuncu', (isim) => { 
        oyuncular[socket.id] = { isim: isim, puan: 0 }; 
        io.emit('puan_guncelle', Object.values(oyuncular)); 
        io.emit('admin_oyuncular_guncelle', oyuncular);
    });

    socket.on('soru_yolla', () => {
        if (!aktifQuizId || !quizler[aktifQuizId] || quizler[aktifQuizId].sorular.length === 0) return;
        if(geriSayimSayaci) clearInterval(geriSayimSayaci);
        soruAktifMi = false; oyunDuraklatildi = false; 
        aktifSoruSirasi++; 
        const aktifQuiz = quizler[aktifQuizId];
        
        if (aktifSoruSirasi >= aktifQuiz.sorular.length) { 
            io.emit('quiz_bitti_bekle'); // Final öncesi bekleme ekranı
            aktifQuizId = null; return; 
        }
        
        const siradakiSoru = aktifQuiz.sorular[aktifSoruSirasi]; 
        soruAktifMi = true;
        io.emit('yeni_soru', siradakiSoru);
        let kalanSure = aktifQuiz.sure; 
        io.emit('zaman_guncelle', kalanSure);
        
        geriSayimSayaci = setInterval(() => {
            if(!oyunDuraklatildi) {
                kalanSure--; 
                io.emit('zaman_guncelle', kalanSure);
                if (kalanSure <= 0) { clearInterval(geriSayimSayaci); soruAktifMi = false; io.emit('sure_bitti', siradakiSoru.dogruCevap); }
            }
        }, 1000);
    });

    socket.on('cevap_gonder', (secilenSecenek) => {
        const oyuncu = oyuncular[socket.id];
        if (oyuncu && soruAktifMi && aktifQuizId) {
            if (secilenSecenek === quizler[aktifQuizId].sorular[aktifSoruSirasi].dogruCevap) { 
                oyuncu.puan += quizler[aktifQuizId].puan; 
            }
            io.emit('puan_guncelle', Object.values(oyuncular));
            io.emit('admin_oyuncular_guncelle', oyuncular);
        }
    });

    socket.on('disconnect', () => { 
        if (oyuncular[socket.id]) { 
            delete oyuncular[socket.id]; 
            io.emit('puan_guncelle', Object.values(oyuncular)); 
            io.emit('admin_oyuncular_guncelle', oyuncular);
        } 
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Sunucu mükemmel çalışıyor! Port: ${PORT}`); });