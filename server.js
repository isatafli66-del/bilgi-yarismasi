const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const API_KEY = (process.env.API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
const GEMINI_MODEL = (process.env.GEMINI_MODEL || 'gemini-1.5-flash').trim();

const STORAGE_PROVIDER = (process.env.STORAGE_PROVIDER || 'supabase').trim().toLowerCase();
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '').trim();
const APP_DATA_TABLE = 'app_data';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// --- VERİ SAKLAMA KATMANI ---
// Render Free ortamında dosya sistemi kalıcı değildir. Bu yüzden ana kayıt yeri Supabase'tir.
// Bu sürüm @supabase/supabase-js paketini kullanmaz; Node 18'de çalışan Supabase REST API kullanır.
const supabaseHazir = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

if (STORAGE_PROVIDER === 'supabase' && !supabaseHazir) {
    throw new Error('STORAGE_PROVIDER=supabase seçili fakat SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY eksik. Render > Environment bölümünü kontrol edin.');
}

if (STORAGE_PROVIDER === 'supabase' && supabaseHazir) {
    console.log('[BILGI] Supabase REST bağlantısı hazır. Veriler Supabase app_data tablosunda saklanacak.');
}

function supabaseBaseUrl() {
    return SUPABASE_URL.replace(/\/+$/, '');
}

function supabaseHeaders(extra = {}) {
    return {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        ...extra
    };
}

async function supabaseJsonFetch(url, options = {}) {
    const response = await fetch(url, options);
    const bodyText = await response.text();

    if (!response.ok) {
        throw new Error(`Supabase HTTP ${response.status}: ${bodyText || response.statusText}`);
    }

    if (!bodyText) return null;
    try {
        return JSON.parse(bodyText);
    } catch (error) {
        throw new Error(`Supabase JSON parse hatası: ${error.message}`);
    }
}

function klasorYazilabilirMi(klasor) {
    try {
        if (!fs.existsSync(klasor)) fs.mkdirSync(klasor, { recursive: true });
        fs.accessSync(klasor, fs.constants.W_OK);
        return true;
    } catch (e) {
        return false;
    }
}

function fileDataKlasoruBul() {
    const adaylar = [];
    if (process.env.DATA_DIR && process.env.DATA_DIR.trim()) adaylar.push(process.env.DATA_DIR.trim());
    adaylar.push(path.join(__dirname, 'data'));
    adaylar.push(path.join(process.cwd(), 'data'));

    for (const aday of adaylar) {
        if (klasorYazilabilirMi(aday)) return aday;
    }

    const tmp = '/tmp/tazzy-data';
    fs.mkdirSync(tmp, { recursive: true });
    return tmp;
}

const FILE_DATA_DIR = fileDataKlasoruBul();
if (STORAGE_PROVIDER !== 'supabase') {
    console.warn(`[UYARI] Supabase kullanılmıyor. Veriler dosyaya yazılacak: ${FILE_DATA_DIR}`);
    console.warn('[UYARI] Render Free ortamında bu dosyalar deploy/restart sonrası silinebilir.');
}

function derinKopya(data) {
    return JSON.parse(JSON.stringify(data));
}

function keyDosyaAdi(key) {
    return key.replace(/[^a-zA-Z0-9_.-]/g, '_') + '.json';
}

async function getAppData(key, varsayilanDeger) {
    const varsayilan = derinKopya(varsayilanDeger);

    if (STORAGE_PROVIDER === 'supabase') {
        const url = new URL(`${supabaseBaseUrl()}/rest/v1/${APP_DATA_TABLE}`);
        url.searchParams.set('key', `eq.${key}`);
        url.searchParams.set('select', 'value');
        url.searchParams.set('limit', '1');

        const rows = await supabaseJsonFetch(url.toString(), {
            method: 'GET',
            headers: supabaseHeaders({ Accept: 'application/json' })
        });

        if (!Array.isArray(rows) || rows.length === 0) {
            await setAppData(key, varsayilan);
            return varsayilan;
        }

        return rows[0].value ?? varsayilan;
    }

    const dosya = path.join(FILE_DATA_DIR, keyDosyaAdi(key));
    if (!fs.existsSync(dosya)) {
        fs.writeFileSync(dosya, JSON.stringify(varsayilan, null, 2));
        return varsayilan;
    }

    try {
        return JSON.parse(fs.readFileSync(dosya, 'utf8'));
    } catch (e) {
        console.error(`[HATA] JSON okunamadı, varsayılan değer kullanılacak: ${dosya}`, e.message);
        return varsayilan;
    }
}

async function setAppData(key, value) {
    const temizValue = derinKopya(value);

    if (STORAGE_PROVIDER === 'supabase') {
        const url = new URL(`${supabaseBaseUrl()}/rest/v1/${APP_DATA_TABLE}`);
        url.searchParams.set('on_conflict', 'key');

        await supabaseJsonFetch(url.toString(), {
            method: 'POST',
            headers: supabaseHeaders({
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Prefer: 'resolution=merge-duplicates,return=minimal'
            }),
            body: JSON.stringify({
                key,
                value: temizValue,
                updated_at: new Date().toISOString()
            })
        });
        return;
    }

    const dosya = path.join(FILE_DATA_DIR, keyDosyaAdi(key));
    fs.writeFileSync(dosya, JSON.stringify(temizValue, null, 2));
}

async function deleteAppData(key) {
    if (STORAGE_PROVIDER === 'supabase') {
        const url = new URL(`${supabaseBaseUrl()}/rest/v1/${APP_DATA_TABLE}`);
        url.searchParams.set('key', `eq.${key}`);

        await supabaseJsonFetch(url.toString(), {
            method: 'DELETE',
            headers: supabaseHeaders({
                Accept: 'application/json',
                Prefer: 'return=minimal'
            })
        });
        return;
    }

    const dosya = path.join(FILE_DATA_DIR, keyDosyaAdi(key));
    if (fs.existsSync(dosya)) fs.unlinkSync(dosya);
}

function getVarsayilanQuizler() {
    const varsayilanPath = path.join(__dirname, 'quizler.json');
    if (fs.existsSync(varsayilanPath)) {
        try { return JSON.parse(fs.readFileSync(varsayilanPath, 'utf8')); } catch(e) {}
    }
    return { "quiz_1": { id: "quiz_1", ad: "Örnek Teknoloji Quizi", sure: 20, puan: 100, sorular: [] } };
}

const VARSAYILAN_KURUMLAR = {
    "ROOF-01": { sifre: "123456", bitis: "2030-01-01", aktif: true }
};

async function getKurumlar() {
    return await getAppData('kurumlar', VARSAYILAN_KURUMLAR);
}

async function saveKurumlar(kurumlar) {
    await setAppData('kurumlar', kurumlar);
}

async function loadKurumData(kurum) {
    const [quizler, ayarlar] = await Promise.all([
        getAppData(`quizler_${kurum}`, getVarsayilanQuizler()),
        getAppData(`ayarlar_${kurum}`, { logo: null })
    ]);
    return { quizler, ayarlar };
}

async function saveKurumData(kurum, tur, data) {
    await setAppData(`${tur}_${kurum}`, data);
}

async function deleteKurumData(kurum) {
    await Promise.all([
        deleteAppData(`quizler_${kurum}`),
        deleteAppData(`ayarlar_${kurum}`)
    ]);
}

function sistemHatasi(socket, olay, error) {
    console.error(`[${olay}]`, error);
    socket.emit('sistem_hata', error.message || 'Bilinmeyen sistem hatası');
}

function socketAsync(socket, olay, handler) {
    socket.on(olay, async (...args) => {
        try {
            await handler(...args);
        } catch (error) {
            sistemHatasi(socket, olay, error);
        }
    });
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
app.use('/admin', async (req, res, next) => {
    try {
        const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
        const [kurumKodu, kurumSifre] = Buffer.from(b64auth, 'base64').toString().split(':');
        const kurumlar = await getKurumlar();
        const kurum = kurumlar[kurumKodu];

        if (kurum && kurum.sifre === kurumSifre) {
            if(!kurum.aktif) {
                res.status(401).send('<h2 style="font-family:sans-serif; text-align:center; margin-top:50px; color:red;">Hesabınız askıya alınmıştır.</h2>');
                return;
            }
            const bugun = new Date();
            const bitisTarihi = new Date(kurum.bitis);
            if(bugun > bitisTarihi) {
                res.status(401).send(`<h2 style="font-family:sans-serif; text-align:center; margin-top:50px; color:red;">Lisans süreniz (${kurum.bitis}) tarihinde dolmuştur.</h2>`);
                return;
            }

            res.cookie('kurumKodu', kurumKodu);
            return next();
        }

        res.set('WWW-Authenticate', 'Basic realm="Tazzy Kurum Paneli"');
        res.status(401).send('Geçersiz Kurum Kodu veya Şifre.');
    } catch (error) {
        console.error('[admin auth]', error);
        res.status(500).send('Veritabanı bağlantı hatası. Render Environment ve Supabase ayarlarını kontrol edin.');
    }
});

app.get('/admin', (req, res) => { res.sendFile(__dirname + '/public/admin.html'); });
app.get('/ekran', (req, res) => { res.sendFile(__dirname + '/public/ekran.html'); });
app.get('/logout', (req, res) => { res.status(401).send(`<script>let xhr = new XMLHttpRequest(); xhr.open("GET", "/admin", true, "logout", "logout"); xhr.send(); window.location.href="/admin";</script>`); });

// --- OYUN MOTORU ---
const kurumAktifPin = {};
const oyunlar = {};

io.on('connection', (socket) => {

    socketAsync(socket, 'master_veri_istek', async () => {
        socket.emit('master_veriler', await getKurumlar());
    });

    socketAsync(socket, 'master_kurum_detay_istek', async (kodu) => {
        const ayarlar = (await loadKurumData(kodu)).ayarlar;
        socket.emit('master_kurum_detay_cevap', { kodu: kodu, logo: ayarlar.logo });
    });

    socketAsync(socket, 'master_kurum_ekle_guncelle', async (data) => {
        let kurumlar = await getKurumlar();
        kurumlar[data.kodu] = { sifre: data.sifre, bitis: data.bitis, aktif: data.aktif };
        await saveKurumlar(kurumlar);

        if(data.logoBase64 !== undefined) {
            const veriler = await loadKurumData(data.kodu);
            veriler.ayarlar.logo = data.logoBase64;
            await saveKurumData(data.kodu, 'ayarlar', veriler.ayarlar);
            io.to(`admin_${data.kodu}`).emit('ayarlar_guncelle', veriler.ayarlar);
            io.to(`ekran_${data.kodu}`).emit('ayarlar_guncelle', veriler.ayarlar);
            let pin = kurumAktifPin[data.kodu];
            if(pin) io.to(`pin_${pin}`).emit('ayarlar_guncelle', veriler.ayarlar);
        }

        socket.emit('master_veriler', kurumlar);
    });

    socketAsync(socket, 'master_kurum_sil', async (kodu) => {
        let kurumlar = await getKurumlar();
        if(kurumlar[kodu]) {
            delete kurumlar[kodu];
            await saveKurumlar(kurumlar);
            await deleteKurumData(kodu);
        }
        socket.emit('master_veriler', kurumlar);
    });

    // --- KURUM SOKETLERİ ---
    socketAsync(socket, 'admin_giris', async (kurumKodu) => {
        if(!kurumKodu) return;
        socket.kurumKodu = kurumKodu;
        socket.join(`admin_${kurumKodu}`);
        const veriler = await loadKurumData(kurumKodu);
        socket.emit('verileri_guncelle', veriler.quizler);
        socket.emit('ayarlar_guncelle', veriler.ayarlar);
        let pin = kurumAktifPin[kurumKodu];
        if(pin && oyunlar[pin]) {
            socket.emit('oturum_basladi', { pin: pin });
            socket.emit('admin_oyuncular_guncelle', oyunlar[pin].oyuncular);
        }
    });

    socketAsync(socket, 'ekran_giris', async (kurumKodu) => {
        if(!kurumKodu) return;
        socket.kurumKodu = kurumKodu;
        socket.join(`ekran_${kurumKodu}`);
        const veriler = await loadKurumData(kurumKodu);
        socket.emit('ayarlar_guncelle', veriler.ayarlar);
        let pin = kurumAktifPin[kurumKodu];
        if(pin) socket.emit('oturum_basladi', { pin: pin });
    });

    socketAsync(socket, 'oyuncu_katil', async (data) => {
        let pin = data.pin.toString().trim();
        let oyun = oyunlar[pin];
        if(!oyun) { socket.emit('katilma_hatasi', 'Hatalı PIN Girdiniz!'); return; }
        socket.pin = pin;
        socket.join(`pin_${pin}`);
        oyun.oyuncular[socket.id] = { isim: data.isim, puan: 0 };
        const veriler = await loadKurumData(oyun.kurumKodu);
        socket.emit('ayarlar_guncelle', veriler.ayarlar);
        socket.emit('katilma_basarili');
        io.to(`admin_${oyun.kurumKodu}`).emit('admin_oyuncular_guncelle', oyun.oyuncular);
        io.to(`ekran_${oyun.kurumKodu}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
        io.to(`pin_${pin}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
    });

    // --- YAPAY ZEKA GÜNCELLEMESİ ---
    socket.on('ai_soru_uret', async (istek) => {
        try {
            if (!API_KEY) throw new Error('Sunucuda API_KEY bulunamadı. Render > Environment bölümüne geçerli Gemini API anahtarını API_KEY olarak ekleyin.');

            const konu = String(istek?.konu || '').trim().slice(0, 200);
            const zorluk = String(istek?.zorluk || 'Orta').trim().slice(0, 30);
            const sayi = Math.max(1, Math.min(parseInt(istek?.sayi, 10) || 3, 10));
            if (!konu) throw new Error('Konu başlığı boş olamaz.');

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
            if (!text) throw new Error('Yapay zeka boş cevap döndürdü.');

            let temiz = text.replace(/```json/gi, '').replace(/```/g, '').trim();
            const ilk = temiz.indexOf('[');
            const son = temiz.lastIndexOf(']');
            if (ilk !== -1 && son !== -1) temiz = temiz.slice(ilk, son + 1);

            let sorular;
            try { sorular = JSON.parse(temiz); }
            catch(e) { throw new Error('Yapay zeka cevabı JSON formatında okunamadı. Lütfen tekrar deneyin.'); }

            if (!Array.isArray(sorular) || sorular.length === 0) throw new Error('Yapay zeka soru listesi oluşturamadı.');
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

            if (duzeltilmis.length === 0) throw new Error('Yapay zeka eksiksiz soru oluşturamadı. Lütfen tekrar deneyin.');
            socket.emit('ai_soru_sonuc', duzeltilmis);
        } catch (error) {
            console.error('AI soru üretme hatası:', error);
            socket.emit('ai_hata', error.message || 'Bilinmeyen yapay zeka hatası');
        }
    });

    // Veri Güncellemeleri
    socketAsync(socket, 'quiz_ekle_guncelle', async (quizData) => {
        const k = socket.kurumKodu; if(!k) return;
        const veriler = await loadKurumData(k);
        if(!quizData.id) quizData.id = 'quiz_' + Date.now();
        if(!veriler.quizler[quizData.id]) quizData.sorular = [];
        else quizData.sorular = veriler.quizler[quizData.id].sorular;
        veriler.quizler[quizData.id] = quizData;
        await saveKurumData(k, 'quizler', veriler.quizler);
        io.to(`admin_${k}`).emit('verileri_guncelle', veriler.quizler);
    });

    socketAsync(socket, 'quiz_sil', async (quizId) => {
        const k = socket.kurumKodu; if(!k) return;
        const veriler = await loadKurumData(k);
        delete veriler.quizler[quizId];
        await saveKurumData(k, 'quizler', veriler.quizler);
        io.to(`admin_${k}`).emit('verileri_guncelle', veriler.quizler);
    });

    socketAsync(socket, 'soru_ekle_guncelle', async (data) => {
        const k = socket.kurumKodu; if(!k) return;
        const veriler = await loadKurumData(k);
        const q = veriler.quizler[data.quizId];
        if(q) {
            if(!data.soru.id) {
                data.soru.id = Date.now();
                q.sorular.push(data.soru);
            } else {
                const index = q.sorular.findIndex(s => s.id === data.soru.id);
                if(index !== -1) q.sorular[index] = data.soru;
            }
            await saveKurumData(k, 'quizler', veriler.quizler);
            io.to(`admin_${k}`).emit('verileri_guncelle', veriler.quizler);
        }
    });

    socketAsync(socket, 'soru_sil', async (data) => {
        const k = socket.kurumKodu; if(!k) return;
        const veriler = await loadKurumData(k);
        const q = veriler.quizler[data.quizId];
        if(q) {
            q.sorular = q.sorular.filter(s => s.id !== data.soruId);
            await saveKurumData(k, 'quizler', veriler.quizler);
            io.to(`admin_${k}`).emit('verileri_guncelle', veriler.quizler);
        }
    });

    // Oyun Akışı
    socketAsync(socket, 'quiz_baslat', async (quizId) => {
        const k = socket.kurumKodu; if(!k) return;
        let eskiPin = kurumAktifPin[k];
        if(eskiPin && oyunlar[eskiPin]) {
            clearInterval(oyunlar[eskiPin].zamanlayici);
            delete oyunlar[eskiPin];
        }
        let yeniPin = Math.floor(100000 + Math.random() * 900000).toString();
        kurumAktifPin[k] = yeniPin;
        oyunlar[yeniPin] = { kurumKodu: k, quizId: quizId, soruSirasi: -1, oyuncular: {}, zamanlayici: null, soruAktifMi: false, oyunDuraklatildi: false };
        io.to(`admin_${k}`).emit('oturum_basladi', { pin: yeniPin });
        io.to(`ekran_${k}`).emit('oturum_basladi', { pin: yeniPin });
        io.to(`admin_${k}`).emit('admin_oyuncular_guncelle', {});
    });

    socketAsync(socket, 'soru_yolla', async () => {
        const k = socket.kurumKodu; if(!k) return;
        let pin = kurumAktifPin[k];
        let oyun = oyunlar[pin];
        if(!oyun) return;
        const quizler = (await loadKurumData(k)).quizler;
        const aktifQuiz = quizler[oyun.quizId];
        if(!aktifQuiz) return;
        if(oyun.zamanlayici) clearInterval(oyun.zamanlayici);
        oyun.soruAktifMi = false;
        oyun.oyunDuraklatildi = false;
        oyun.soruSirasi++;
        if (oyun.soruSirasi >= aktifQuiz.sorular.length) {
            io.to(`ekran_${k}`).emit('quiz_bitti_bekle');
            io.to(`pin_${pin}`).emit('quiz_bitti_bekle');
            return;
        }
        const siradakiSoru = aktifQuiz.sorular[oyun.soruSirasi];
        oyun.soruAktifMi = true;
        io.to(`ekran_${k}`).emit('yeni_soru', siradakiSoru);
        io.to(`pin_${pin}`).emit('yeni_soru', siradakiSoru);
        let kalanSure = aktifQuiz.sure;
        io.to(`ekran_${k}`).emit('zaman_guncelle', kalanSure);
        io.to(`pin_${pin}`).emit('zaman_guncelle', kalanSure);
        oyun.zamanlayici = setInterval(() => {
            if(!oyun.oyunDuraklatildi) {
                kalanSure--;
                io.to(`ekran_${k}`).emit('zaman_guncelle', kalanSure);
                io.to(`pin_${pin}`).emit('zaman_guncelle', kalanSure);
                if (kalanSure <= 0) {
                    clearInterval(oyun.zamanlayici);
                    oyun.soruAktifMi = false;
                    io.to(`ekran_${k}`).emit('sure_bitti', siradakiSoru.dogruCevap);
                    io.to(`pin_${pin}`).emit('sure_bitti', siradakiSoru.dogruCevap);
                }
            }
        }, 1000);
    });

    socketAsync(socket, 'cevap_gonder', async (secilenSecenek) => {
        let pin = socket.pin;
        let oyun = oyunlar[pin];
        if(!oyun || !oyun.soruAktifMi) return;
        let oyuncu = oyun.oyuncular[socket.id];
        if(!oyuncu) return;
        const quizler = (await loadKurumData(oyun.kurumKodu)).quizler;
        if (secilenSecenek === quizler[oyun.quizId].sorular[oyun.soruSirasi].dogruCevap) {
            oyuncu.puan += quizler[oyun.quizId].puan;
        }
        io.to(`admin_${oyun.kurumKodu}`).emit('admin_oyuncular_guncelle', oyun.oyuncular);
        io.to(`ekran_${oyun.kurumKodu}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
        io.to(`pin_${pin}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
    });

    socket.on('sure_durdur_devam', (durum) => {
        let k = socket.kurumKodu;
        let pin = kurumAktifPin[k];
        if(pin && oyunlar[pin]) oyunlar[pin].oyunDuraklatildi = durum;
    });

    socket.on('admin_skor_goster', () => {
        let k = socket.kurumKodu;
        let pin = kurumAktifPin[k];
        if(pin) {
            io.to(`ekran_${k}`).emit('skor_tablosunu_goster');
            io.to(`pin_${pin}`).emit('skor_tablosunu_goster');
        }
    });

    socket.on('admin_podyum_goster', () => {
        let k = socket.kurumKodu;
        let pin = kurumAktifPin[k];
        if(pin && oyunlar[pin]) {
            io.to(`ekran_${k}`).emit('quiz_bitti_final', Object.values(oyunlar[pin].oyuncular));
            io.to(`pin_${pin}`).emit('quiz_bitti_final', Object.values(oyunlar[pin].oyuncular));
        }
    });

    socket.on('admin_oyuncu_ekle', (isim) => {
        let k = socket.kurumKodu;
        let pin = kurumAktifPin[k];
        let oyun = oyunlar[pin];
        if(!oyun) return;
        const id = 'manuel_' + Date.now();
        oyun.oyuncular[id] = { isim: isim, puan: 0 };
        io.to(`admin_${k}`).emit('admin_oyuncular_guncelle', oyun.oyuncular);
        io.to(`ekran_${k}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
        io.to(`pin_${pin}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
    });

    socket.on('admin_puan_duzenle', (data) => {
        let k = socket.kurumKodu;
        let pin = kurumAktifPin[k];
        let oyun = oyunlar[pin];
        if(!oyun || !oyun.oyuncular[data.id]) return;
        oyun.oyuncular[data.id].puan = parseInt(data.puan) || 0;
        io.to(`admin_${k}`).emit('admin_oyuncular_guncelle', oyun.oyuncular);
        io.to(`ekran_${k}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
        io.to(`pin_${pin}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
    });

    socket.on('admin_oyuncu_ad_duzenle', (data) => {
        let k = socket.kurumKodu;
        let pin = kurumAktifPin[k];
        let oyun = oyunlar[pin];
        if(!oyun || !oyun.oyuncular[data.id]) return;
        oyun.oyuncular[data.id].isim = data.isim;
        io.to(`admin_${k}`).emit('admin_oyuncular_guncelle', oyun.oyuncular);
        io.to(`ekran_${k}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
        io.to(`pin_${pin}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
    });

    socket.on('admin_oyuncu_sil', (id) => {
        let k = socket.kurumKodu;
        let pin = kurumAktifPin[k];
        let oyun = oyunlar[pin];
        if(!oyun || !oyun.oyuncular[id]) return;
        delete oyun.oyuncular[id];
        io.to(`admin_${k}`).emit('admin_oyuncular_guncelle', oyun.oyuncular);
        io.to(`ekran_${k}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
        io.to(`pin_${pin}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
    });

    socket.on('disconnect', () => {
        if (socket.pin && oyunlar[socket.pin]) {
            let oyun = oyunlar[socket.pin];
            if(oyun.oyuncular[socket.id]) {
                delete oyun.oyuncular[socket.id];
                io.to(`admin_${oyun.kurumKodu}`).emit('admin_oyuncular_guncelle', oyun.oyuncular);
                io.to(`ekran_${oyun.kurumKodu}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
                io.to(`pin_${socket.pin}`).emit('puan_guncelle', Object.values(oyun.oyuncular));
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu çalışıyor. Port: ${PORT}`);
    console.log(`Veri saklama modu: ${STORAGE_PROVIDER}`);
});
