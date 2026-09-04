const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const etkinlikSablonlari = require('./etkinlik-sablonlari');
const {
    eskiQuizleriHavuzaAktar,
    havuzaSoruEkle,
    havuzdanSoruSil,
    havuzuNormalizeEt,
    havuzSorusunuKopyala,
    havuzSorusundanQuizKopyasi,
    quizSorusunuTasi,
    quizSorusunuTemizle,
    quizSorulariniSirala,
    soruImzasi,
    yeniId
} = require('./soru-havuzu');
const {
    ayarlariNormalizeEt,
    varsayilanAyarlar,
    gorselBaglantisiGuvenliMi,
    yayinOncesiKontrol,
    oyunuSerilestir,
    oyunuCanlandir
} = require('./canli-oturum');

const API_KEY = (process.env.API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();

// Gemini model adları Google tarafından zamanla kapatılabiliyor/değiştirilebiliyor.
// Bu yüzden tek modele bağlı kalmak yerine güvenli fallback listesi kullanıyoruz.
// Render Environment'da GEMINI_MODEL değerine virgülle birden fazla model yazılabilir.
const DEFAULT_GEMINI_MODELS = [
    'gemini-flash-latest',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash'
];
function normalizeGeminiModelName(model) {
    return String(model || '')
        .trim()
        .replace(/^models\//, '')
        .replace(/^\/+/, '')
        .trim();
}

const GEMINI_QUIZ_RESPONSE_SCHEMA = {
    type: 'ARRAY',
    minItems: 1,
    maxItems: 10,
    items: {
        type: 'OBJECT',
        required: ['soru', 'gorsel_prompt', 'secenekler', 'dogruCevap'],
        properties: {
            soru: { type: 'STRING' },
            gorsel_prompt: { type: 'STRING' },
            secenekler: {
                type: 'OBJECT',
                required: ['A', 'B', 'C', 'D'],
                properties: {
                    A: { type: 'STRING' },
                    B: { type: 'STRING' },
                    C: { type: 'STRING' },
                    D: { type: 'STRING' }
                }
            },
            dogruCevap: { type: 'STRING', enum: ['A', 'B', 'C', 'D'] }
        }
    }
};
function uniqueList(items) {
    return Array.from(new Set(items.filter(Boolean)));
}
const USER_GEMINI_MODELS = String(process.env.GEMINI_MODEL || process.env.GEMINI_MODELS || '')
    .split(',')
    .map(normalizeGeminiModelName);
const GEMINI_MODELS = uniqueList([...USER_GEMINI_MODELS, ...DEFAULT_GEMINI_MODELS]);

const STORAGE_PROVIDER = (process.env.STORAGE_PROVIDER || 'supabase').trim().toLowerCase();
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '').trim();
const APP_DATA_TABLE = 'app_data';
const OTURUM_GIZLI_ANAHTARI = String(process.env.SESSION_SECRET || process.env.MASTER_SIFRE || process.env.ADMIN_SIFRE || '');
const TEST_MODU = false;

if(!OTURUM_GIZLI_ANAHTARI && !TEST_MODU) {
    throw new Error('Güvenli admin oturumu için SESSION_SECRET veya MASTER_SIFRE tanımlanmalıdır.');
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 2 * 1024 * 1024,
    allowRequest(req, callback) {
        try { callback(null, !req.headers.origin || new URL(req.headers.origin).host === req.headers.host); }
        catch (_) { callback(null, false); }
    }
});

app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    let route;
    try { route = decodeURIComponent(req.path).toLowerCase(); } catch (_) { return res.status(400).end(); }
    if(['/admin.html', '/master.html'].includes(route)) return res.status(404).end();
    res.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    next();
});
app.use(express.static(path.join(__dirname, 'public')));

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
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
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
    const gecici = dosya + '.' + crypto.randomUUID() + '.tmp';
    fs.writeFileSync(gecici, JSON.stringify(temizValue, null, 2));
    fs.renameSync(gecici, dosya);
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

const VARSAYILAN_KURUMLAR = STORAGE_PROVIDER === 'supabase' ? {} : {
    "ROOF-01": { sifre: "123456", bitis: "2030-01-01", aktif: true }
};

async function getKurumlar() {
    return await getAppData('kurumlar', VARSAYILAN_KURUMLAR);
}

let yetkiOnbellegi = null;
async function saveKurumlar(kurumlar) {
    await setAppData('kurumlar', kurumlar);
    yetkiOnbellegi = null;
}

async function loadKurumData(kurum, havuzDahil = false) {
    const [quizler, ayarlar] = await Promise.all([
        getAppData(`quizler_${kurum}`, getVarsayilanQuizler()),
        getAppData(`ayarlar_${kurum}`, varsayilanAyarlar())
    ]);
    const guvenliAyarlar = ayarlariNormalizeEt(ayarlar);
    if(!havuzDahil) return { quizler, ayarlar: guvenliAyarlar };

    const [soruHavuzu, havuzMeta] = await Promise.all([
        getAppData(`soru_havuzu_${kurum}`, { versiyon: 1, sorular: {}, sira: [] }),
        getAppData(`soru_havuzu_meta_${kurum}`, { migrasyonV1: false })
    ]);
    return { quizler, ayarlar: guvenliAyarlar, soruHavuzu: havuzuNormalizeEt(soruHavuzu), havuzMeta };
}

async function saveKurumData(kurum, tur, data) {
    await setAppData(`${tur}_${kurum}`, data);
}

async function deleteKurumData(kurum) {
    await Promise.all([
        deleteAppData(`quizler_${kurum}`),
        deleteAppData(`ayarlar_${kurum}`),
        deleteAppData(`soru_havuzu_${kurum}`),
        deleteAppData(`soru_havuzu_meta_${kurum}`),
        deleteAppData(`aktif_oyun_${kurum}`)
    ]);
}

const havuzHazirlamaKilitleri = new Map();

async function kurumHavuzunuHazirla(kurum) {
    if(havuzHazirlamaKilitleri.has(kurum)) return await havuzHazirlamaKilitleri.get(kurum);

    const hazirlamaIslemi = (async () => {
        const veriler = await loadKurumData(kurum, true);
        if(veriler.havuzMeta?.migrasyonV1) return veriler;

        const sonuc = eskiQuizleriHavuzaAktar(veriler.quizler, veriler.soruHavuzu);
        veriler.quizler = sonuc.quizler;
        veriler.soruHavuzu = sonuc.havuz;
        veriler.havuzMeta = {
            migrasyonV1: true,
            tamamlanmaTarihi: new Date().toISOString(),
            eklenenSoruSayisi: sonuc.eklenen,
            baglananQuizSorusuSayisi: sonuc.baglanan
        };
        await Promise.all([
            saveKurumData(kurum, 'quizler', veriler.quizler),
            saveKurumData(kurum, 'soru_havuzu', veriler.soruHavuzu),
            saveKurumData(kurum, 'soru_havuzu_meta', veriler.havuzMeta)
        ]);
        return veriler;
    })();

    havuzHazirlamaKilitleri.set(kurum, hazirlamaIslemi);
    try {
        return await hazirlamaIslemi;
    } finally {
        havuzHazirlamaKilitleri.delete(kurum);
    }
}

function havuzdaAyniSoruVarMi(havuz, hamSoru, haricId = null) {
    const imza = soruImzasi(hamSoru);
    return Object.values(havuz.sorular || {}).some(soru => String(soru.id) !== String(haricId || '') && soruImzasi(soru) === imza);
}

function sistemHatasi(socket, olay, error) {
    console.error(`[${olay}]`, error);
    socket.emit('sistem_hata', /Supabase|fetch failed|abort|timeout/i.test(error.message || '') ? 'Sunucu kayıt bağlantısı tamamlanamadı. Yayın sağlığını kontrol edip yeniden deneyin.' : (error.message || 'İşlem tamamlanamadı.'));
}

const kurumIslemKuyruklari = new Map();
function socketAsync(socket, olay, handler) {
    socket.on(olay, async (...args) => {
        try {
            const anahtar = MASTER_SOCKET_OLAYLARI.has(olay) ? '__master' : ADMIN_SOCKET_OLAYLARI.has(olay) ? socket.adminYetkiKurumu : null;
            if(!anahtar) { await handler(...args); return; }
            const islem = (kurumIslemKuyruklari.get(anahtar) || Promise.resolve()).catch(() => {}).then(() => handler(...args));
            kurumIslemKuyruklari.set(anahtar, islem);
            try { await islem; } finally { if(kurumIslemKuyruklari.get(anahtar) === islem) kurumIslemKuyruklari.delete(anahtar); }
        } catch (error) {
            sistemHatasi(socket, olay, error);
        }
    });
}

const girisDenemeleri = new Map();
const ADMIN_SOCKET_OLAYLARI = new Set([
    'admin_giris', 'ai_soru_uret', 'quiz_ekle_guncelle', 'quiz_sil',
    'havuz_soru_ekle_guncelle', 'havuz_soru_toplu_ekle', 'havuz_soru_toplu_sil', 'havuz_soru_sil', 'havuz_soru_kopyala',
    'havuzdan_quize_kopyala', 'havuzdan_quize_toplu_kopyala', 'quiz_sorulari_sirala', 'quiz_soruyu_tasi',
    'soru_ekle_guncelle', 'soru_sil', 'quiz_baslat', 'prova_baslat', 'soru_yolla', 'cevap_yansit',
    'sure_durdur_devam', 'admin_skor_goster', 'admin_podyum_goster', 'quiz_sonlandir',
    'admin_oyuncu_ekle', 'admin_manuel_cevap_gir', 'admin_puan_duzenle', 'admin_oyuncu_ad_duzenle',
    'admin_oyuncu_sil', 'yayin_oncesi_kontrol', 'sistem_sagligi_iste', 'aktif_oturumu_devam_ettir',
    'sablondan_quiz_olustur', 'kurum_tema_kaydet', 'lobi_sayaci_ayarla'
]);
const MASTER_SOCKET_OLAYLARI = new Set(['master_veri_istek', 'master_kurum_detay_istek', 'master_kurum_ekle_guncelle', 'master_kurum_sil']);

function cookieOku(header, ad) {
    const parca = String(header || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${ad}=`));
    try { return parca ? decodeURIComponent(parca.slice(ad.length + 1)) : ''; } catch (_) { return ''; }
}

function yetkiDamgasi(kurum) { return crypto.createHmac('sha256', OTURUM_GIZLI_ANAHTARI).update(JSON.stringify([kurum?.sifre, kurum?.aktif, kurum?.bitis])).digest('hex'); }
async function guncelYetkiKurumlari() {
    if(!yetkiOnbellegi || yetkiOnbellegi.son < Date.now()) yetkiOnbellegi = { veri: await getKurumlar(), son: Date.now() + 5000 };
    return yetkiOnbellegi.veri;
}

function guvenliEsit(a, b) {
    const bir = Buffer.from(String(a || ''));
    const iki = Buffer.from(String(b || ''));
    return bir.length === iki.length && crypto.timingSafeEqual(bir, iki);
}

function oturumImzala(payload) {
    const veri = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const imza = crypto.createHmac('sha256', OTURUM_GIZLI_ANAHTARI || 'test').update(veri).digest('base64url');
    return `${veri}.${imza}`;
}

function oturumDogrula(token) {
    try {
        const [veri, imza] = String(token || '').split('.');
        if(!veri || !imza) return null;
        const beklenen = crypto.createHmac('sha256', OTURUM_GIZLI_ANAHTARI || 'test').update(veri).digest('base64url');
        if(!guvenliEsit(imza, beklenen)) return null;
        const payload = JSON.parse(Buffer.from(veri, 'base64url').toString('utf8'));
        if(!payload?.exp || payload.exp < Date.now()) return null;
        return payload;
    } catch (_) {
        return null;
    }
}

function guvenliCookieYaz(req, res, ad, payload) {
    const guvenli = req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
    res.cookie(ad, oturumImzala({ ...payload, exp: Date.now() + 8 * 60 * 60 * 1000 }), {
        httpOnly: true,
        sameSite: 'strict',
        secure: guvenli,
        maxAge: 8 * 60 * 60 * 1000,
        path: '/'
    });
}

function istekAdresi(req) {
    return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'bilinmeyen').split(',')[0].trim().slice(0, 80);
}

function girisSiniri(req, basarili) {
    const anahtar = `${req.path}:${istekAdresi(req)}`;
    const simdi = Date.now();
    const kayit = girisDenemeleri.get(anahtar) || { adet: 0, baslangic: simdi };
    if(simdi - kayit.baslangic > 15 * 60 * 1000) { kayit.adet = 0; kayit.baslangic = simdi; }
    if(basarili) { girisDenemeleri.delete(anahtar); return true; }
    kayit.adet++;
    girisDenemeleri.set(anahtar, kayit);
    return kayit.adet <= 12;
}

app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    next();
});

// --- SÜPER ADMİN (MASTER) GİRİŞİ ---
app.use('/tazzy-master', (req, res, next) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const credentials = Buffer.from(b64auth, 'base64').toString();
    const separator = credentials.indexOf(':');
    const login = credentials.slice(0, separator);
    const password = credentials.slice(separator + 1);
    const masterSifre = process.env.MASTER_SIFRE || '';
    const dogru = Boolean(masterSifre) && login === 'tazzy' && guvenliEsit(password, masterSifre);
    if(!dogru && !girisSiniri(req, false)) return res.status(429).send('Çok fazla başarısız giriş denemesi. 15 dakika sonra tekrar deneyin.');
    if (dogru) { girisSiniri(req, true); guvenliCookieYaz(req, res, 'tazzyYetki', { rol: 'master' }); return next(); }
    res.set('WWW-Authenticate', 'Basic realm="Master Paneli"');
    res.status(401).send('Yetkisiz Erişim!');
});
app.get('/tazzy-master', (req, res) => { res.sendFile(__dirname + '/public/master.html'); });

// --- KURUM YÖNETİCİ GİRİŞİ VE GÜVENLİK ---
app.use('/admin', async (req, res, next) => {
    try {
        const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
        const credentials = Buffer.from(b64auth, 'base64').toString();
        const separator = credentials.indexOf(':');
        const kurumKodu = credentials.slice(0, separator);
        const kurumSifre = credentials.slice(separator + 1);
        const kurumlar = await getKurumlar();
        const kurum = kurumlar[kurumKodu];

        const dogru = kurum && guvenliEsit(kurum.sifre, kurumSifre);
        if(!dogru && !girisSiniri(req, false)) return res.status(429).send('Çok fazla başarısız giriş denemesi. 15 dakika sonra tekrar deneyin.');
        if (dogru) {
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

            girisSiniri(req, true);
            res.cookie('kurumKodu', kurumKodu, { sameSite: 'strict', secure: req.secure || String(req.headers['x-forwarded-proto'] || '').startsWith('https'), maxAge: 8 * 60 * 60 * 1000 });
            guvenliCookieYaz(req, res, 'tazzyYetki', { rol: 'admin', kurum: kurumKodu, damga: yetkiDamgasi(kurum) });
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
app.get('/logout', (req, res) => { res.clearCookie('tazzyYetki', { path: '/' }); res.clearCookie('kurumKodu', { path: '/' }); res.status(401).send(`<script>let xhr = new XMLHttpRequest(); xhr.open("GET", "/admin", true, "logout", "logout"); xhr.send(); window.location.href="/admin";</script>`); });

// --- OYUN MOTORU ---
const kurumAktifPin = {};
const oyunlar = {};
let aktifOyunIndeksi = {};
let aktifOyunlarYuklendi = false;
const oyunKayitZamanlayicilari = new Map();
const katilmaSinirlari = new Map();
let kaliciYazmaKuyrugu = Promise.resolve();

const CEVAP_HARFLERI = ['A', 'B', 'C', 'D'];

function oyunIndeksiniTemizle() {
    const simdi = Date.now();
    Object.entries(aktifOyunIndeksi || {}).forEach(([pin, kayit]) => {
        if(!kayit?.kurumKodu || Number(kayit.sonaErme) <= simdi) delete aktifOyunIndeksi[pin];
    });
}

async function aktifOyunlariYukle() {
    if(aktifOyunlarYuklendi || TEST_MODU) { aktifOyunlarYuklendi = true; return; }
    aktifOyunIndeksi = await getAppData('aktif_oyun_indeksi', {});
    for(const [pin, bilgi] of Object.entries(aktifOyunIndeksi)) {
        const kayit = await getAppData(`aktif_oyun_${bilgi.kurumKodu}`, null);
        const oyun = oyunuCanlandir(kayit);
        if(!oyun || oyun.pin !== pin) {
            delete aktifOyunIndeksi[pin];
            await deleteAppData(`aktif_oyun_${bilgi.kurumKodu}`);
            continue;
        }
        oyunlar[pin] = oyun;
        kurumAktifPin[oyun.kurumKodu] = pin;
        console.log(`[BILGI] ${oyun.kurumKodu} kurumunun ${pin} PIN'li canlı oturumu güvenli duraklatılmış olarak kurtarıldı.`);
    }
    await setAppData('aktif_oyun_indeksi', aktifOyunIndeksi);
    aktifOyunlarYuklendi = true;
}

async function aktifOyunKaydet(oyun) {
    if(!oyun || oyun.prova || TEST_MODU || !oyunlar[oyun.pin]) return;
    const kayit = JSON.parse(JSON.stringify(oyunuSerilestir(oyun)));
    const islem = kaliciYazmaKuyrugu.catch(() => {}).then(async () => {
        if(oyunlar[oyun.pin] !== oyun) return;
        await setAppData(`aktif_oyun_${oyun.kurumKodu}`, kayit);
        aktifOyunIndeksi[oyun.pin] = { kurumKodu: oyun.kurumKodu, sonaErme: new Date(kayit.sonaErmeZamani).getTime() };
        await setAppData('aktif_oyun_indeksi', aktifOyunIndeksi);
        oyun.sonYedekZamani = Date.now();
        oyun.yedekHatasi = false;
    }).catch(error => { oyun.yedekHatasi = true; throw error; });
    kaliciYazmaKuyrugu = islem;
    await islem;
}

function aktifOyunKaydetPlanla(oyun, gecikme = 650) {
    if(!oyun || oyun.prova || TEST_MODU) return;
    clearTimeout(oyunKayitZamanlayicilari.get(oyun.pin));
    oyunKayitZamanlayicilari.set(oyun.pin, setTimeout(() => {
        oyunKayitZamanlayicilari.delete(oyun.pin);
        aktifOyunKaydet(oyun).catch(error => console.error('[aktif oyun yedeği]', error.message));
    }, gecikme));
}

async function aktifOyunKaydiniSil(oyun) {
    if(!oyun) return;
    clearTimeout(oyunKayitZamanlayicilari.get(oyun.pin));
    oyunKayitZamanlayicilari.delete(oyun.pin);
    if(oyun.prova) return;
    const islem = kaliciYazmaKuyrugu.catch(() => {}).then(async () => {
        await setAppData(`aktif_oyun_${oyun.kurumKodu}`, { sonaErmeZamani: new Date(0).toISOString(), oyun: null });
        delete aktifOyunIndeksi[oyun.pin];
        await setAppData('aktif_oyun_indeksi', aktifOyunIndeksi);
        await deleteAppData(`aktif_oyun_${oyun.kurumKodu}`);
    });
    kaliciYazmaKuyrugu = islem;
    await islem;
}

function katilmaIzniVarMi(socket) {
    const adres = socket.id;
    const simdi = Date.now();
    const kayit = katilmaSinirlari.get(adres) || { adet: 0, baslangic: simdi };
    if(simdi - kayit.baslangic > 60_000) { kayit.adet = 0; kayit.baslangic = simdi; }
    kayit.adet++;
    katilmaSinirlari.set(adres, kayit);
    return kayit.adet <= 20;
}

function oyuncuKimligi(oyuncuToken, socketId) {
    const temizToken = String(oyuncuToken || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    return temizToken.length >= 8 ? `istemci_${temizToken}` : socketId;
}

function oyuncuYayinVerisi(id, oyuncu) {
    return {
        id,
        isim: oyuncu.isim,
        puan: Number(oyuncu.puan) || 0,
        manuel: Boolean(oyuncu.manuel),
        bagli: oyuncu.manuel ? true : oyuncu.bagli !== false
    };
}

function puanlariYayinla(oyun) {
    if(!oyun) return;
    const liste = Object.values(oyun.oyuncular).map(oyuncu => ({ isim: oyuncu.isim, puan: Number(oyuncu.puan) || 0 }));
    io.to(`ekran_${oyun.kurumKodu}`).emit('puan_guncelle', liste);
    io.to(`pin_${oyun.pin}`).emit('puan_guncelle', liste);
}

function adminOyunculariGonder(oyun) {
    if(!oyun) return;
    const soruIndex = oyun.soruSirasi;
    const oyuncular = {};
    Object.entries(oyun.oyuncular).forEach(([id, oyuncu]) => {
        const yanit = soruIndex >= 0 ? oyuncu.cevaplar?.[soruIndex] : null;
        oyuncular[id] = {
            ...oyuncuYayinVerisi(id, oyuncu),
            mevcutYanit: yanit ? { yanitladi: true, secim: yanit.secim, dogruMu: Boolean(yanit.dogruMu) } : { yanitladi: false }
        };
    });
    io.to(`admin_${oyun.kurumKodu}`).emit('admin_oyuncular_guncelle', oyuncular);
    yayinSagliginiGonder(oyun);
    aktifOyunKaydetPlanla(oyun);
}

function adminOyunDurumuGonder(oyun, ek = {}) {
    if(!oyun) return;
    io.to(`admin_${oyun.kurumKodu}`).emit('admin_oyun_durumu', {
        aktif: true,
        pin: oyun.pin,
        quizId: oyun.quizId,
        soruNo: Math.max(oyun.soruSirasi + 1, 0),
        toplamSoru: Number(oyun.toplamSoru) || 0,
        durum: oyun.durum || 'lobi',
        kalanSure: Math.max(0, Number(oyun.kalanSure) || 0),
        prova: Boolean(oyun.prova),
        kurtarildi: Boolean(oyun.kurtarildi),
        ...ek
    });
}

function yayinSagliginiGonder(oyun) {
    if(!oyun) return;
    const ekranBagli = (io.sockets.adapter.rooms.get(`ekran_${oyun.kurumKodu}`)?.size || 0) > 0;
    const oyuncular = Object.values(oyun.oyuncular || {});
    const bagliOyuncu = oyuncular.filter(oyuncu => oyuncu.manuel || oyuncu.bagli !== false).length;
    const veri = {
        pin: oyun.pin,
        ekranBagli,
        toplamOyuncu: oyuncular.length,
        bagliOyuncu,
        kopukOyuncu: Math.max(0, oyuncular.length - bagliOyuncu),
        sunucuZamani: Date.now(),
        baslamaZamani: oyun.baslamaZamani || null,
        prova: Boolean(oyun.prova)
        ,sonYedekZamani: oyun.sonYedekZamani || null, yedekHatasi: Boolean(oyun.yedekHatasi)
    };
    io.to(`admin_${oyun.kurumKodu}`).emit('sistem_sagligi', veri);
    io.to(`ekran_${oyun.kurumKodu}`).emit('bekleme_bilgisi', veri);
}

async function guncelOyunGorunumunuGonder(socket, oyun, hedef) {
    if(!oyun) return;
    const gorunenDurum = oyun.kurtarildi ? oyun.kurtarmaOncesiDurum : oyun.durum;
    const veriler = await loadKurumData(oyun.kurumKodu);
    const quiz = oyun.quizAnlik || veriler.quizler[oyun.quizId];
    const soru = quiz?.sorular?.[oyun.soruSirasi];
    if(soru && oyun.soruSirasi >= 0) {
        const { dogruCevap, ...guvenliSoru } = soru;
        socket.emit('yeni_soru', {
            ...guvenliSoru,
            soruNo: oyun.soruSirasi + 1,
            toplamSoru: quiz.sorular.length,
            kalanSoru: Math.max(quiz.sorular.length - oyun.soruSirasi - 1, 0),
            yenidenBaglandi: true
        });
        socket.emit('zaman_guncelle', Math.max(0, Number(oyun.kalanSure) || 0));
        if(oyun.cevapYansitildi || gorunenDurum === 'cevap') socket.emit('cevap_yansit', {
            dogruCevap,
            soruNo: oyun.soruSirasi + 1,
            toplamSoru: quiz.sorular.length,
            kalanSoru: Math.max(quiz.sorular.length - oyun.soruSirasi - 1, 0)
        });
    }
    if(gorunenDurum === 'sure_bitti') socket.emit('sure_bitti');
    if(oyun.gorunum === 'skor') socket.emit('skor_tablosunu_goster');
    const yanit = hedef === 'oyuncu' ? oyun.oyuncular[socket.oyuncuId]?.cevaplar?.[oyun.soruSirasi] : null;
    if(yanit && !oyun.cevapYansitildi) socket.emit('oyuncu_cevap_durumu', { secim: yanit.secim });
    if(gorunenDurum === 'tamamlandi') socket.emit('quiz_bitti_bekle');
    if(gorunenDurum === 'podyum' && oyun.sonSonuc) {
        socket.emit('quiz_bitti_final', oyun.sonSonuc.oyuncular.map(({ isim, puan }) => ({ isim, puan })));
        if(hedef === 'oyuncu' && socket.oyuncuId) socket.emit('oyuncu_sonuc', kisiselSonucuHazirla(oyun.sonSonuc, socket.oyuncuId));
    }
        if(oyun.kurtarildi) socket.emit('oturum_kurtarildi', {
        pin: oyun.pin,
        mesaj: 'Canlı oturum güvenli yedekten kurtarıldı. Yönetici devam ettirene kadar süre duraklatıldı.'
    });
}

function oyunSayaciniBaslat(oyun) {
    if(!oyun) return;
    if(oyun.zamanlayici) clearInterval(oyun.zamanlayici);
    oyun.zamanlayici = setInterval(() => {
        if(oyun.oyunDuraklatildi) return;
        oyun.kalanSure = Math.max(0, (Number(oyun.kalanSure) || 0) - 1);
        io.to(`ekran_${oyun.kurumKodu}`).emit('zaman_guncelle', oyun.kalanSure);
        io.to(`pin_${oyun.pin}`).emit('zaman_guncelle', oyun.kalanSure);
        if(oyun.kalanSure % 5 === 0) aktifOyunKaydetPlanla(oyun, 50);
        if(oyun.kalanSure <= 0) {
            clearInterval(oyun.zamanlayici);
            oyun.zamanlayici = null;
            oyun.soruAktifMi = false;
            oyun.durum = 'sure_bitti';
            io.to(`ekran_${oyun.kurumKodu}`).emit('sure_bitti');
            io.to(`pin_${oyun.pin}`).emit('sure_bitti');
            adminOyunculariGonder(oyun);
            adminOyunDurumuGonder(oyun);
            aktifOyunKaydetPlanla(oyun, 50);
        }
    }, 1000);
}

async function provaCevaplariniUygula(oyun) {
    if(!oyun?.prova || !oyun.soruAktifMi) return;
    const quiz = oyun.quizAnlik || (await loadKurumData(oyun.kurumKodu)).quizler[oyun.quizId];
    const soru = quiz?.sorular?.[oyun.soruSirasi];
    if(!soru) return;
    const yanlis = CEVAP_HARFLERI.find(harf => harf !== soru.dogruCevap) || 'A';
    const cevaplar = [['prova_dogru', soru.dogruCevap], ['prova_karma', oyun.soruSirasi % 2 ? yanlis : soru.dogruCevap]];
    const provaSoruSirasi = oyun.soruSirasi;
    cevaplar.forEach(([id, secim], index) => setTimeout(() => {
        if(!oyunlar[oyun.pin] || !oyun.soruAktifMi || oyun.soruSirasi !== provaSoruSirasi || oyun.oyuncular[id]?.cevaplar?.[oyun.soruSirasi]) return;
        const oyuncu = oyun.oyuncular[id];
        const dogruMu = secim === soru.dogruCevap;
        oyuncu.cevaplar[oyun.soruSirasi] = { secim, dogruMu, cevapZamani: Date.now(), prova: true };
        if(dogruMu) oyuncu.puan += Number(quiz.puan) || 0;
        adminOyunculariGonder(oyun);
        puanlariYayinla(oyun);
    }, 700 + index * 550));
}

async function yeniOyunBaslat(socket, istek, provaZorla = false) {
    const k = socket.kurumKodu;
    if(!k) return;
    const quizId = typeof istek === 'object' ? istek?.quizId : istek;
    const prova = provaZorla || Boolean(typeof istek === 'object' && istek?.prova);
    const veriler = await loadKurumData(k);
    const aktifQuiz = veriler.quizler[quizId];
    const kontrol = yayinOncesiKontrol(aktifQuiz, { ekranBagli: (io.sockets.adapter.rooms.get(`ekran_${k}`)?.size || 0) > 0 });
    if(!aktifQuiz || !Array.isArray(aktifQuiz.sorular) || aktifQuiz.sorular.length === 0 || !kontrol.hazir) {
        socket.emit('sistem_hata', 'Canlıya almak için soruları ve cevap anahtarı eksiksiz geçerli bir quiz seçin.');
        return;
    }
    const eskiPin = kurumAktifPin[k];
    if(eskiPin && oyunlar[eskiPin] && prova && !oyunlar[eskiPin].prova) {
        socket.emit('sistem_hata', 'Aktif gerçek yarışma varken prova başlatılamaz. Gerçek oturum korunuyor; önce onu bitirin.');
        return;
    }
    if(eskiPin && oyunlar[eskiPin]) {
        io.to(`pin_${eskiPin}`).emit('quiz_sonlandirildi', { mesaj: 'Yeni bir quiz oturumu başlatıldı.' });
        await oyunOdasiniKapat(oyunlar[eskiPin]);
    }
    let yeniPin;
    do { yeniPin = crypto.randomInt(100000, 1000000).toString(); } while(oyunlar[yeniPin]);
    kurumAktifPin[k] = yeniPin;
    const oyuncular = prova ? {
        prova_dogru: { isim: 'Demo Doğru', puan: 0, manuel: true, bagli: true, cevaplar: [], prova: true },
        prova_karma: { isim: 'Demo Karma', puan: 0, manuel: true, bagli: true, cevaplar: [], prova: true },
        prova_bos: { isim: 'Demo Boş', puan: 0, manuel: true, bagli: true, cevaplar: [], prova: true }
    } : {};
    oyunlar[yeniPin] = {
        pin: yeniPin,
        kurumKodu: k,
        quizId,
        quizAnlik: derinKopya(aktifQuiz),
        toplamSoru: aktifQuiz.sorular.length,
        soruSirasi: -1,
        oyuncular,
        soruKayitlari: [],
        zamanlayici: null,
        kalanSure: Number(aktifQuiz.sure) || 20,
        soruAktifMi: false,
        oyunDuraklatildi: false,
        cevapYansitildi: false,
        durum: 'lobi',
        sonSonuc: null,
        baslangicZamani: Date.now(),
        prova,
        kurtarildi: false
    };
    io.to(`admin_${k}`).emit('oturum_basladi', { pin: yeniPin, prova });
    io.to(`ekran_${k}`).emit('oturum_basladi', { pin: yeniPin, prova, etkinlikAdi: veriler.ayarlar.etkinlikAdi });
    adminOyunculariGonder(oyunlar[yeniPin]);
    adminOyunDurumuGonder(oyunlar[yeniPin]);
    await aktifOyunKaydet(oyunlar[yeniPin]);
}

function oyunSonucunuHazirla(oyun, aktifQuiz) {
    const sorular = oyun.soruKayitlari
        .map((soru, index) => soru ? {
            index,
            soruNo: index + 1,
            soru: soru.soru,
            secenekler: soru.secenekler,
            dogruCevap: soru.dogruCevap
        } : null)
        .filter(Boolean);
    const oyuncular = Object.entries(oyun.oyuncular).map(([id, oyuncu]) => ({
        ...oyuncuYayinVerisi(id, oyuncu),
        cevaplar: sorular.map(soru => {
            const yanit = oyuncu.cevaplar?.[soru.index];
            return {
                soruNo: soru.soruNo,
                secim: yanit?.secim || null,
                dogruMu: Boolean(yanit?.dogruMu),
                dogruCevap: soru.dogruCevap
            };
        })
    })).sort((a, b) => b.puan - a.puan || a.isim.localeCompare(b.isim, 'tr'));
    return {
        quizId: oyun.quizId,
        quizAdi: aktifQuiz?.ad || 'Quiz',
        pin: oyun.pin,
        tamamlanmaZamani: new Date().toISOString(),
        sorular,
        oyuncular
    };
}

function kisiselSonucuHazirla(tamSonuc, oyuncuId) {
    const oyuncu = tamSonuc.oyuncular.find(kayit => kayit.id === oyuncuId);
    if(!oyuncu) return null;
    return {
        quizAdi: tamSonuc.quizAdi,
        oyuncu: { isim: oyuncu.isim, puan: oyuncu.puan },
        cevaplar: tamSonuc.sorular.map(soru => {
            const yanit = oyuncu.cevaplar.find(cevap => cevap.soruNo === soru.soruNo);
            return {
                soruNo: soru.soruNo,
                soru: soru.soru,
                secenekler: soru.secenekler,
                secim: yanit?.secim || null,
                dogruCevap: soru.dogruCevap,
                dogruMu: Boolean(yanit?.dogruMu)
            };
        })
    };
}

async function oyunOdasiniKapat(oyun) {
    if(!oyun) return;
    if(oyun.zamanlayici) clearInterval(oyun.zamanlayici);
    oyun.zamanlayici = null;
    oyun.soruAktifMi = false;
    await aktifOyunKaydiniSil(oyun);
    if(kurumAktifPin[oyun.kurumKodu] === oyun.pin) delete kurumAktifPin[oyun.kurumKodu];
    delete oyunlar[oyun.pin];
}

async function listAvailableGeminiModels() {
    if (!API_KEY) return [];
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(API_KEY)}`;
        const response = await fetch(url);
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(data.models)) return [];

        const disallowed = ['image', 'tts', 'audio', 'live', 'embedding', 'veo', 'imagen'];
        return data.models
            .filter(m => {
                const methods = m.supportedGenerationMethods || m.supportedActions || [];
                const name = normalizeGeminiModelName(m.name);
                const lower = name.toLowerCase();
                return methods.includes('generateContent')
                    && lower.includes('gemini')
                    && !disallowed.some(x => lower.includes(x));
            })
            .map(m => normalizeGeminiModelName(m.name))
            .sort((a, b) => {
                const score = (name) => {
                    const n = name.toLowerCase();
                    if (n.includes('flash') && !n.includes('lite')) return 0;
                    if (n.includes('flash-lite')) return 1;
                    if (n.includes('pro')) return 2;
                    return 3;
                };
                return score(a) - score(b);
            });
    } catch (e) {
        console.warn('[UYARI] Gemini model listesi alınamadı:', e.message);
        return [];
    }
}

async function callGeminiModel(modelName, promptText, useJsonMime = true, useSchema = true) {
    const model = normalizeGeminiModelName(modelName);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(API_KEY)}`;
    const generationConfig = {
        temperature: 0.35,
        topP: 0.9,
        maxOutputTokens: 8192
    };

    if (useJsonMime) {
        generationConfig.responseMimeType = 'application/json';
        if (useSchema) generationConfig.responseSchema = GEMINI_QUIZ_RESPONSE_SCHEMA;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig
        })
    });

    const rawBody = await response.text();
    let data = {};
    try { data = rawBody ? JSON.parse(rawBody) : {}; } catch (_) {}

    if (!response.ok) {
        const apiMesaj = data.error?.message || rawBody || `Google API HTTP ${response.status}`;
        const err = new Error(apiMesaj);
        err.status = response.status;
        err.model = model;
        throw err;
    }

    const finishReason = data.candidates?.[0]?.finishReason;
    const text = data.candidates?.[0]?.content?.parts?.map(p => {
        if (typeof p.text === 'string') return p.text;
        if (p.inlineData || p.functionCall || p.executableCode || p.codeExecutionResult) return '';
        return '';
    }).join('').trim();

    if (!text) {
        const err = new Error(`${model} boş cevap döndürdü.${finishReason ? ' finishReason=' + finishReason : ''}`);
        err.model = model;
        throw err;
    }

    return { text, model, finishReason };
}

function stripGeminiJsonText(text) {
    let temiz = String(text || '').trim();
    temiz = temiz.replace(/^\uFEFF/, '').trim();
    temiz = temiz.replace(/^```(?:json|javascript|js)?\s*/i, '').replace(/```$/g, '').trim();
    temiz = temiz.replace(/^json\s*[:\-]?\s*/i, '').trim();
    return temiz;
}

function extractBalancedJsonCandidate(text) {
    const temiz = stripGeminiJsonText(text);
    const firstArray = temiz.indexOf('[');
    const firstObject = temiz.indexOf('{');
    let start = -1;
    if (firstArray !== -1 && firstObject !== -1) start = Math.min(firstArray, firstObject);
    else start = firstArray !== -1 ? firstArray : firstObject;
    if (start === -1) return temiz;

    const open = temiz[start];
    const close = open === '[' ? ']' : '}';
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = start; i < temiz.length; i++) {
        const ch = temiz[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === open) depth++;
        else if (ch === close) {
            depth--;
            if (depth === 0) return temiz.slice(start, i + 1);
        }
    }

    return temiz.slice(start);
}

function unwrapQuestionArray(parsed) {
    if (Array.isArray(parsed)) return parsed;
    if (!parsed || typeof parsed !== 'object') return null;

    const adayAlanlar = ['sorular', 'questions', 'quiz', 'items', 'data', 'result', 'results'];
    for (const alan of adayAlanlar) {
        if (Array.isArray(parsed[alan])) return parsed[alan];
        if (parsed[alan] && typeof parsed[alan] === 'object') {
            const alt = unwrapQuestionArray(parsed[alan]);
            if (alt) return alt;
        }
    }
    return null;
}

function parseAiQuestionsFromText(text) {
    const adaylar = uniqueList([
        String(text || '').trim(),
        stripGeminiJsonText(text),
        extractBalancedJsonCandidate(text)
    ]);

    let sonHata = null;
    for (const aday of adaylar) {
        if (!aday) continue;
        try {
            const parsed = JSON.parse(aday);
            const liste = unwrapQuestionArray(parsed);
            if (Array.isArray(liste)) return liste;
        } catch (e) {
            sonHata = e;
        }
    }

    const hata = new Error('Yapay zeka cevabı JSON formatında okunamadı. Sistem otomatik düzeltme deneyecek.');
    hata.cause = sonHata;
    hata.rawText = String(text || '').slice(0, 1500);
    throw hata;
}

function buildAiRepairPrompt(rawText, sayi, konu) {
    return `Aşağıdaki metin bir quiz JSON cevabı olmalıydı ama formatı bozulmuş olabilir.
Görevin: Metni geçerli JSON dizisine dönüştür.

Kurallar:
- Sadece JSON dizisi döndür.
- En fazla ${sayi} soru olsun.
- Türkçe çoktan seçmeli quiz formatı kullan.
- Her elemanda soru, gorsel_prompt, secenekler.A/B/C/D, dogruCevap alanları zorunlu.
- dogruCevap sadece A, B, C veya D olabilir.
- Eksik alan varsa "${konu}" konusuna uygun şekilde tamamla.
- Markdown, açıklama, kod bloğu yazma.

Bozuk metin:
${String(rawText || '').slice(0, 12000)}`;
}

async function parseOrRepairAiQuestions(aiCevap, sayi, konu) {
    try {
        return parseAiQuestionsFromText(aiCevap.text);
    } catch (ilkHata) {
        console.warn('[UYARI] Gemini JSON parse başarısız. Otomatik JSON düzeltme deneniyor:', ilkHata.cause?.message || ilkHata.message);
        const repairPrompt = buildAiRepairPrompt(aiCevap.text, sayi, konu);

        const oncelikliModeller = uniqueList([aiCevap.model, ...GEMINI_MODELS, ...(await listAvailableGeminiModels())]);
        let sonHata = ilkHata;
        for (const model of oncelikliModeller) {
            try {
                const repaired = await callGeminiModel(model, repairPrompt, true, true);
                console.log(`[BILGI] Gemini JSON düzeltme başarılı model: ${repaired.model}`);
                return parseAiQuestionsFromText(repaired.text);
            } catch (e) {
                sonHata = e;
                console.warn(`[UYARI] Gemini JSON düzeltme başarısız: ${model} - ${e.message}`);
            }
        }
        throw new Error(`Yapay zeka cevabı JSON formatında okunamadı. Son hata: ${sonHata.message || sonHata}`);
    }
}

async function generateGeminiQuizJson(promptText) {
    const denenenler = [];
    const dynamicModels = await listAvailableGeminiModels();
    const modelList = uniqueList([...GEMINI_MODELS, ...dynamicModels]);

    for (const model of modelList) {
        try {
            const result = await callGeminiModel(model, promptText, true);
            console.log(`[BILGI] Gemini AI başarılı model: ${result.model}`);
            return result;
        } catch (e) {
            denenenler.push(`${model}: ${e.message}`);
            const msg = String(e.message || '').toLowerCase();

            // Bazı modeller responseSchema desteklemez ama JSON mime destekler.
            if (msg.includes('responseschema') || msg.includes('response_schema') || msg.includes('schema')) {
                try {
                    const result = await callGeminiModel(model, promptText, true, false);
                    console.log(`[BILGI] Gemini AI başarılı model: ${result.model} (schema olmadan)`);
                    return result;
                } catch (eSchema) {
                    denenenler.push(`${model} / schema-yok: ${eSchema.message}`);
                }
            }

            // Bazı eski/preview modeller responseMimeType desteklemeyebilir.
            // Aynı modeli JSON mime olmadan bir kez daha deniyoruz.
            if (msg.includes('responsemime') || msg.includes('response_mime') || msg.includes('generationconfig')) {
                try {
                    const result = await callGeminiModel(model, promptText, false, false);
                    console.log(`[BILGI] Gemini AI başarılı model: ${result.model} (JSON mime olmadan)`);
                    return result;
                } catch (e2) {
                    denenenler.push(`${model} / json-mime-yok: ${e2.message}`);
                }
            }
            console.warn(`[UYARI] Gemini modeli başarısız: ${model} - ${e.message}`);
        }
    }

    const kisaOzet = denenenler.slice(0, 6).join(' | ');
    throw new Error(`Yapay zeka servis hatası: API anahtarınıza uygun çalışan Gemini modeli bulunamadı. Denenenler: ${kisaOzet}`);
}

io.on('connection', (socket) => {
    const yetki = oturumDogrula(cookieOku(socket.handshake.headers.cookie, 'tazzyYetki'));
    socket.masterDogrulandi = TEST_MODU || yetki?.rol === 'master';
    socket.adminYetkiKurumu = TEST_MODU ? '*' : (yetki?.rol === 'admin' ? yetki.kurum : null);
    let olayPenceresi = Date.now(), olayAdet = 0;
    socket.use(async ([olay], sonraki) => {
        if(Date.now() - olayPenceresi > 10000) { olayPenceresi = Date.now(); olayAdet = 0; }
        if(++olayAdet > 160) { socket.emit('sistem_hata', 'Çok hızlı işlem gönderildi; kısa bir süre bekleyin.'); return; }
        if(ADMIN_SOCKET_OLAYLARI.has(olay) && yetki?.rol === 'admin') {
            try {
                const kurum = (await guncelYetkiKurumlari())[yetki.kurum];
                if(!kurum?.aktif || new Date(kurum.bitis).getTime() < Date.now() || !guvenliEsit(yetki.damga, yetkiDamgasi(kurum))) {
                    socket.emit('yetki_hatasi', 'Kurum yetkisi değişti veya süresi doldu. Yeniden giriş yapın.'); return;
                }
            } catch (_) { socket.emit('yetki_hatasi', 'Yetki kontrolü tamamlanamadı; yeniden deneyin.'); return; }
        }
        if((ADMIN_SOCKET_OLAYLARI.has(olay) || MASTER_SOCKET_OLAYLARI.has(olay)) && (!yetki || yetki.exp < Date.now())) {
            socket.emit('yetki_hatasi', 'Yönetici oturumunun süresi doldu. Sayfayı yenileyip giriş yapın.');
            return;
        }
        if(MASTER_SOCKET_OLAYLARI.has(olay) && !socket.masterDogrulandi) {
            socket.emit('yetki_hatasi', 'MASTER oturumunuz doğrulanamadı. Sayfayı yenileyip tekrar giriş yapın.');
            return;
        }
        if(ADMIN_SOCKET_OLAYLARI.has(olay) && olay !== 'admin_giris' && !socket.adminDogrulandi) {
            socket.emit('yetki_hatasi', 'Yönetici oturumunuz doğrulanamadı. Sayfayı yenileyip tekrar giriş yapın.');
            return;
        }
        sonraki();
    });

    socketAsync(socket, 'master_veri_istek', async () => {
        socket.emit('master_veriler', await getKurumlar());
    });

    socketAsync(socket, 'master_kurum_detay_istek', async (kodu) => {
        const ayarlar = (await loadKurumData(kodu)).ayarlar;
        socket.emit('master_kurum_detay_cevap', { kodu: kodu, ...ayarlar });
    });

    socketAsync(socket, 'master_kurum_ekle_guncelle', async (data) => {
        let kurumlar = await getKurumlar();
        const kodu = String(data?.kodu || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
        const sifre = String(data?.sifre || '').trim().slice(0, 100);
        if(!kodu || sifre.length < 6) throw new Error('Kurum kodu geçerli, şifre en az 6 karakter olmalıdır.');
        kurumlar[kodu] = { sifre, bitis: data.bitis, aktif: Boolean(data.aktif) };
        await saveKurumlar(kurumlar);

        {
            const veriler = await loadKurumData(kodu);
            const yeniAyarlar = ayarlariNormalizeEt({
                ...veriler.ayarlar,
                ...data.ayarlar,
                logo: data.logoBase64 === undefined ? veriler.ayarlar.logo : data.logoBase64
            });
            await saveKurumData(kodu, 'ayarlar', yeniAyarlar);
            io.to(`admin_${kodu}`).emit('ayarlar_guncelle', yeniAyarlar);
            io.to(`ekran_${kodu}`).emit('ayarlar_guncelle', yeniAyarlar);
            let pin = kurumAktifPin[kodu];
            if(pin) io.to(`pin_${pin}`).emit('ayarlar_guncelle', yeniAyarlar);
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
        if(!TEST_MODU && socket.adminYetkiKurumu !== kurumKodu) {
            socket.emit('yetki_hatasi', 'Bu kurum için yönetici yetkiniz bulunmuyor.');
            return;
        }
        socket.kurumKodu = kurumKodu;
        socket.adminDogrulandi = true;
        socket.join(`admin_${kurumKodu}`);
        const veriler = await kurumHavuzunuHazirla(kurumKodu);
        socket.emit('verileri_guncelle', veriler.quizler);
        socket.emit('soru_havuzu_guncelle', veriler.soruHavuzu);
        socket.emit('soru_havuzu_migrasyon', veriler.havuzMeta);
        socket.emit('ayarlar_guncelle', veriler.ayarlar);
        let pin = kurumAktifPin[kurumKodu];
        if(pin && oyunlar[pin]) {
            socket.emit('oturum_basladi', { pin: pin, prova: Boolean(oyunlar[pin].prova) });
            adminOyunculariGonder(oyunlar[pin]);
            adminOyunDurumuGonder(oyunlar[pin]);
            if(oyunlar[pin].sonSonuc) socket.emit('admin_sonuclar_guncelle', oyunlar[pin].sonSonuc);
            if(oyunlar[pin].kurtarildi) socket.emit('oturum_kurtarildi', { pin, mesaj: 'Yarım kalan canlı oturum güvenli yedekten getirildi ve süre duraklatıldı.' });
        }
    });

    socketAsync(socket, 'ekran_giris', async (kurumKodu) => {
        if(!kurumKodu) return;
        if(socket.adminDogrulandi) return;
        if(!Object.hasOwn(await getKurumlar(), kurumKodu)) return;
        if(socket.kurumKodu) socket.leave(`ekran_${socket.kurumKodu}`);
        socket.kurumKodu = kurumKodu;
        socket.join(`ekran_${kurumKodu}`);
        const veriler = await loadKurumData(kurumKodu);
        socket.emit('ayarlar_guncelle', veriler.ayarlar);
        let pin = kurumAktifPin[kurumKodu];
        if(pin && oyunlar[pin]) {
            socket.emit('oturum_basladi', { pin: pin });
            await guncelOyunGorunumunuGonder(socket, oyunlar[pin], 'ekran');
            yayinSagliginiGonder(oyunlar[pin]);
        }
    });

    socketAsync(socket, 'oyuncu_katil', async (data) => {
        if(!katilmaIzniVarMi(socket)) { socket.emit('katilma_hatasi', 'Çok fazla katılma denemesi yapıldı. Bir dakika bekleyin.'); return; }
        const pin = String(data?.pin || '').trim();
        const oyun = oyunlar[pin];
        if(!oyun) { socket.emit('katilma_hatasi', 'Hatalı PIN Girdiniz!'); return; }
        if(oyun.prova) { socket.emit('katilma_hatasi', 'Bu PIN yönetici prova oturumuna aittir ve gerçek yarışmacı kabul etmez.'); return; }
        const isim = String(data?.isim || '').trim().slice(0, 60);
        if(!isim) { socket.emit('katilma_hatasi', 'Oyuncu adı boş olamaz.'); return; }
        const id = oyuncuKimligi(data?.oyuncuToken, socket.id);
        const veriler = await loadKurumData(oyun.kurumKodu);
        if(socket.pin && socket.pin !== pin) {
            const eskiOyuncu = oyunlar[socket.pin]?.oyuncular?.[socket.oyuncuId];
            if(eskiOyuncu?.socketId === socket.id) { eskiOyuncu.bagli = false; eskiOyuncu.socketId = null; adminOyunculariGonder(oyunlar[socket.pin]); }
            socket.leave(`pin_${socket.pin}`);
        }
        socket.pin = pin;
        socket.oyuncuId = id;
        socket.join(`pin_${pin}`);
        const mevcut = oyun.oyuncular[id];
        oyun.oyuncular[id] = mevcut ? {
            ...mevcut,
            isim,
            socketId: socket.id,
            bagli: true
        } : {
            isim,
            puan: 0,
            manuel: false,
            bagli: true,
            socketId: socket.id,
            cevaplar: []
        };
        socket.emit('ayarlar_guncelle', veriler.ayarlar);
        socket.emit('katilma_basarili', { yenidenBaglandi: Boolean(mevcut) });
        await guncelOyunGorunumunuGonder(socket, oyun, 'oyuncu');
        adminOyunculariGonder(oyun);
        puanlariYayinla(oyun);
        aktifOyunKaydetPlanla(oyun);
    });

    socket.on('oyuncu_ayril', () => {
        const oyun = oyunlar[socket.pin];
        if(!oyun || !socket.oyuncuId || oyun.oyuncular[socket.oyuncuId]?.socketId !== socket.id) return;
        delete oyun.oyuncular[socket.oyuncuId];
        socket.leave(`pin_${socket.pin}`);
        socket.pin = null;
        socket.oyuncuId = null;
        adminOyunculariGonder(oyun);
        puanlariYayinla(oyun);
        aktifOyunKaydetPlanla(oyun);
    });

    socket.on('oyuncu_ana_sayfa', () => {
        const oyun = oyunlar[socket.pin];
        const oyuncu = oyun?.oyuncular?.[socket.oyuncuId];
        if(!oyun || !oyuncu || oyuncu.manuel || oyuncu.socketId !== socket.id) return;
        oyuncu.bagli = false;
        oyuncu.socketId = null;
        socket.leave(`pin_${socket.pin}`);
        socket.pin = null;
        socket.oyuncuId = null;
        adminOyunculariGonder(oyun);
        aktifOyunKaydetPlanla(oyun);
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

            const aiCevap = await generateGeminiQuizJson(promptText);
            const sorular = await parseOrRepairAiQuestions(aiCevap, sayi, konu);

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

    socketAsync(socket, 'havuz_soru_ekle_guncelle', async (data) => {
        const k = socket.kurumKodu; if(!k) return;
        const veriler = await kurumHavuzunuHazirla(k);
        const hamSoru = data?.soru || {};
        if(!gorselBaglantisiGuvenliMi(hamSoru.gorsel)) throw new Error('Görsel için geçerli bir HTTPS bağlantısı kullanın.');
        if(havuzdaAyniSoruVarMi(veriler.soruHavuzu, hamSoru, hamSoru.id)) {
            socket.emit('sistem_hata', 'Aynı soru metni, seçenekler, doğru cevap ve görselle havuzda zaten bir soru bulunuyor.');
            return;
        }
        const sonuc = havuzaSoruEkle(veriler.soruHavuzu, hamSoru);
        veriler.soruHavuzu = sonuc.havuz;
        await saveKurumData(k, 'soru_havuzu', veriler.soruHavuzu);
        io.to(`admin_${k}`).emit('soru_havuzu_guncelle', veriler.soruHavuzu);
        socket.emit('admin_bildirim', hamSoru.id ? 'Havuz sorusu güncellendi.' : 'Soru havuza kaydedildi.');
    });

    socketAsync(socket, 'havuz_soru_toplu_ekle', async (data) => {
        const k = socket.kurumKodu; if(!k) return;
        const veriler = await kurumHavuzunuHazirla(k);
        const sorular = Array.isArray(data?.sorular) ? data.sorular.slice(0, 100) : [];
        let eklenen = 0;
        let atlanan = 0;
        for(const hamSoru of sorular) {
            try {
                if(!gorselBaglantisiGuvenliMi(hamSoru.gorsel)) throw new Error('Güvensiz görsel bağlantısı');
                if(havuzdaAyniSoruVarMi(veriler.soruHavuzu, hamSoru)) {
                    atlanan += 1;
                    continue;
                }
                const sonuc = havuzaSoruEkle(veriler.soruHavuzu, hamSoru);
                veriler.soruHavuzu = sonuc.havuz;
                eklenen += 1;
            } catch (_) { atlanan += 1; }
        }
        if(eklenen > 0) await saveKurumData(k, 'soru_havuzu', veriler.soruHavuzu);
        io.to(`admin_${k}`).emit('soru_havuzu_guncelle', veriler.soruHavuzu);
        socket.emit('admin_bildirim', `${eklenen} soru havuza eklendi.${atlanan ? ` ${atlanan} eksik veya yinelenen soru atlandı.` : ''}`);
    });

    socketAsync(socket, 'havuz_soru_sil', async (soruId) => {
        const k = socket.kurumKodu; if(!k) return;
        const veriler = await kurumHavuzunuHazirla(k);
        veriler.soruHavuzu = havuzdanSoruSil(veriler.soruHavuzu, soruId);
        await saveKurumData(k, 'soru_havuzu', veriler.soruHavuzu);
        io.to(`admin_${k}`).emit('soru_havuzu_guncelle', veriler.soruHavuzu);
        socket.emit('admin_bildirim', 'Soru yalnızca havuzdan silindi; quiz kopyaları korunuyor.');
    });

    socketAsync(socket, 'havuz_soru_toplu_sil', async (data) => {
        const k = socket.kurumKodu; if(!k) return;
        const ids = data?.soruIdleri;
        if(!Array.isArray(ids) || !ids.length || ids.length > 10000 ||
            ids.some(id => typeof id !== 'string' || !id.trim() || id.length > 160)) {
            throw new Error('Silmek için 1–10000 geçerli soru seçin.');
        }
        const veriler = await kurumHavuzunuHazirla(k);
        const secilenler = new Set(ids);
        const sorular = { ...veriler.soruHavuzu.sorular };
        let silinenSayi = 0;
        for(const id of secilenler) {
            if(Object.hasOwn(sorular, id)) { delete sorular[id]; silinenSayi++; }
        }
        const havuz = { ...veriler.soruHavuzu, sorular,
            sira: veriler.soruHavuzu.sira.filter(id => !secilenler.has(String(id))) };
        // One tenant-scoped write; independent quiz copies and live snapshots are untouched.
        if(silinenSayi) await saveKurumData(k, 'soru_havuzu', havuz);
        io.to(`admin_${k}`).emit('soru_havuzu_guncelle', havuz);
        socket.emit('havuz_toplu_silindi', { silinenSayi });
        socket.emit('admin_bildirim', `${silinenSayi} soru havuzdan silindi. Quiz kopyaları korundu.`);
    });

    socketAsync(socket, 'havuz_soru_kopyala', async (soruId) => {
        const k = socket.kurumKodu; if(!k) return;
        const veriler = await kurumHavuzunuHazirla(k);
        const sonuc = havuzSorusunuKopyala(veriler.soruHavuzu, soruId);
        veriler.soruHavuzu = sonuc.havuz;
        await saveKurumData(k, 'soru_havuzu', veriler.soruHavuzu);
        io.to(`admin_${k}`).emit('soru_havuzu_guncelle', veriler.soruHavuzu);
        socket.emit('admin_bildirim', 'Havuz sorusunun bağımsız bir kopyası oluşturuldu.');
    });

    socketAsync(socket, 'havuzdan_quize_kopyala', async (data) => {
        const k = socket.kurumKodu; if(!k) return;
        const veriler = await kurumHavuzunuHazirla(k);
        const quiz = veriler.quizler[data?.quizId];
        const havuzSorusu = veriler.soruHavuzu.sorular[String(data?.soruId || '')];
        if(!quiz || !havuzSorusu) throw new Error('Quiz veya havuz sorusu bulunamadı.');
        quiz.sorular = Array.isArray(quiz.sorular) ? quiz.sorular : [];
        const zatenVar = quiz.sorular.some(soru => String(soru.kaynakSoruId || '') === String(havuzSorusu.id));
        if(zatenVar && !data?.tekraraIzinVer) {
            socket.emit('sistem_hata', 'Bu havuz sorusu seçili quiz’de zaten bulunuyor. Tekrar eklemek için arayüzde onay verin.');
            return;
        }
        const kopya = havuzSorusundanQuizKopyasi(havuzSorusu);
        const hedefBelirtildi = data?.hedefIndex !== null && data?.hedefIndex !== undefined && data?.hedefIndex !== '';
        const hedefIndex = hedefBelirtildi && Number.isInteger(Number(data.hedefIndex))
            ? Math.max(0, Math.min(Number(data.hedefIndex), quiz.sorular.length))
            : quiz.sorular.length;
        quiz.sorular.splice(hedefIndex, 0, kopya);
        await saveKurumData(k, 'quizler', veriler.quizler);
        io.to(`admin_${k}`).emit('verileri_guncelle', veriler.quizler);
        socket.emit('admin_bildirim', 'Soru havuzdan seçili quiz’e bağımsız kopya olarak eklendi.');
    });

    socketAsync(socket, 'havuzdan_quize_toplu_kopyala', async (data) => {
        const k = socket.kurumKodu; if(!k) return;
        const veriler = await kurumHavuzunuHazirla(k);
        const quiz = veriler.quizler[data?.quizId];
        if(!quiz) throw new Error('Toplu soru eklemek için geçerli bir quiz seçin.');
        quiz.sorular = Array.isArray(quiz.sorular) ? quiz.sorular : [];
        const idler = Array.isArray(data?.soruIdleri) ? [...new Set(data.soruIdleri.map(String))].slice(0, 200) : [];
        let eklenen = 0;
        let atlanan = 0;
        for(const id of idler) {
            const havuzSorusu = veriler.soruHavuzu.sorular[id];
            if(!havuzSorusu) { atlanan += 1; continue; }
            const zatenVar = quiz.sorular.some(soru => String(soru.kaynakSoruId || '') === id);
            if(zatenVar && !data?.tekraraIzinVer) { atlanan += 1; continue; }
            quiz.sorular.push(havuzSorusundanQuizKopyasi(havuzSorusu));
            eklenen += 1;
        }
        if(eklenen > 0) await saveKurumData(k, 'quizler', veriler.quizler);
        io.to(`admin_${k}`).emit('verileri_guncelle', veriler.quizler);
        socket.emit('admin_bildirim', `${eklenen} soru quiz’e bağımsız kopya olarak eklendi.${atlanan ? ` ${atlanan} bulunamayan veya zaten bulunan soru atlandı.` : ''}`);
    });

    socketAsync(socket, 'quiz_sorulari_sirala', async (data) => {
        const k = socket.kurumKodu; if(!k) return;
        const veriler = await loadKurumData(k);
        const quiz = veriler.quizler[data?.quizId];
        if(!quiz) throw new Error('Sıralanmak istenen quiz bulunamadı.');
        quiz.sorular = quizSorulariniSirala(quiz.sorular || [], data?.soruIdleri);
        await saveKurumData(k, 'quizler', veriler.quizler);
        io.to(`admin_${k}`).emit('verileri_guncelle', veriler.quizler);
    });

    socketAsync(socket, 'quiz_soruyu_tasi', async (data) => {
        const k = socket.kurumKodu; if(!k) return;
        const veriler = await loadKurumData(k);
        const quiz = veriler.quizler[data?.quizId];
        if(!quiz) throw new Error('Sorusu taşınmak istenen quiz bulunamadı.');
        quiz.sorular = quizSorusunuTasi(quiz.sorular || [], data?.soruId, data?.yeniIndex);
        await saveKurumData(k, 'quizler', veriler.quizler);
        io.to(`admin_${k}`).emit('verileri_guncelle', veriler.quizler);
    });

    socketAsync(socket, 'soru_ekle_guncelle', async (data) => {
        const k = socket.kurumKodu; if(!k) return;
        const veriler = await loadKurumData(k);
        const q = veriler.quizler[data?.quizId];
        if(q) {
            const hamSoru = data?.soru || {};
            if(!gorselBaglantisiGuvenliMi(hamSoru.gorsel)) throw new Error('Görsel için geçerli bir HTTPS bağlantısı kullanın.');
            const soruIdVar = hamSoru.id !== undefined && hamSoru.id !== null && hamSoru.id !== '';
            if(!soruIdVar) {
                const soru = quizSorusunuTemizle({ ...hamSoru, id: yeniId('quiz_soru') });
                q.sorular.push(soru);
            } else {
                const index = q.sorular.findIndex(s => String(s.id) === String(hamSoru.id));
                if(index === -1) {
                    socket.emit('sistem_hata', 'Düzenlenmek istenen soru bulunamadı. Listeyi yenileyip tekrar deneyin.');
                    return;
                }
                const soru = quizSorusunuTemizle(hamSoru, q.sorular[index]);
                q.sorular[index] = soru;
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
            q.sorular = q.sorular.filter(s => String(s.id) !== String(data.soruId));
            await saveKurumData(k, 'quizler', veriler.quizler);
            io.to(`admin_${k}`).emit('verileri_guncelle', veriler.quizler);
            socket.emit('admin_bildirim', 'Soru yalnızca seçili quiz’den çıkarıldı; havuzdaki kaynak korunuyor.');
        }
    });

    socketAsync(socket, 'yayin_oncesi_kontrol', async (quizId) => {
        const veriler = await loadKurumData(socket.kurumKodu);
        const ekranBagli = (io.sockets.adapter.rooms.get(`ekran_${socket.kurumKodu}`)?.size || 0) > 0;
        socket.emit('yayin_oncesi_sonuc', { quizId, ...yayinOncesiKontrol(veriler.quizler[quizId], { ekranBagli, logo: Boolean(veriler.ayarlar.logo), bagliOyuncu: Object.values(oyunlar[kurumAktifPin[socket.kurumKodu]]?.oyuncular || {}).filter(p => p.bagli || p.manuel).length }) });
    });

    socket.on('sistem_sagligi_iste', () => {
        const oyun = oyunlar[kurumAktifPin[socket.kurumKodu]];
        if(oyun) yayinSagliginiGonder(oyun);
        else socket.emit('sistem_sagligi', { ekranBagli: (io.sockets.adapter.rooms.get(`ekran_${socket.kurumKodu}`)?.size || 0) > 0, toplamOyuncu: 0, bagliOyuncu: 0, kopukOyuncu: 0, sunucuZamani: Date.now() });
    });
    socket.on('tazzy_ping', (ack) => { if(typeof ack === 'function') ack(Date.now()); });

    socketAsync(socket, 'aktif_oturumu_devam_ettir', async () => {
        const oyun = oyunlar[kurumAktifPin[socket.kurumKodu]];
        if(!oyun?.kurtarildi) return;
        const veriler = await loadKurumData(socket.kurumKodu);
        oyun.quizAnlik = oyun.quizAnlik || derinKopya(veriler.quizler[oyun.quizId]);
        if(!oyun.quizAnlik) throw new Error('Kurtarılacak quiz bulunamadı. Oturumu bitirin.');
        oyun.durum = oyun.kurtarmaOncesiDurum || 'lobi';
        oyun.kurtarildi = false;
        oyun.oyunDuraklatildi = false;
        oyun.soruAktifMi = oyun.durum === 'soru' && oyun.kalanSure > 0;
        if(oyun.soruAktifMi) oyunSayaciniBaslat(oyun);
        for(const hedef of await io.in(`ekran_${oyun.kurumKodu}`).fetchSockets()) await guncelOyunGorunumunuGonder(hedef, oyun, 'ekran');
        for(const hedef of await io.in(`pin_${oyun.pin}`).fetchSockets()) await guncelOyunGorunumunuGonder(hedef, oyun, 'oyuncu');
        io.to(`pin_${oyun.pin}`).emit('oturum_devam_ediyor');
        io.to(`ekran_${oyun.kurumKodu}`).emit('oturum_devam_ediyor');
        io.to(`admin_${oyun.kurumKodu}`).emit('oturum_devam_ediyor');
        adminOyunDurumuGonder(oyun);
        await aktifOyunKaydet(oyun);
    });

    socket.on('lobi_sayaci_ayarla', saniye => {
        const oyun = oyunlar[kurumAktifPin[socket.kurumKodu]];
        if(!oyun || oyun.soruSirasi >= 0) return;
        const sure = Math.max(0, Math.min(3600, Number(saniye) || 0));
        oyun.baslamaZamani = sure ? Date.now() + sure * 1000 : null;
        yayinSagliginiGonder(oyun); aktifOyunKaydetPlanla(oyun);
    });

    socketAsync(socket, 'kurum_tema_kaydet', async (data) => {
        const k = socket.kurumKodu;
        const { ayarlar } = await loadKurumData(k);
        const izinli = ['etkinlikAdi','karsilamaMesaji','kapanisMesaji','anaRenk','vurguRengi','arkaPlanRengi','tema','animasyonlar','sesVarsayilan'];
        const yeni = ayarlariNormalizeEt({ ...ayarlar, ...Object.fromEntries(izinli.filter(key => data && Object.hasOwn(data,key)).map(key => [key,data[key]])) });
        await saveKurumData(k, 'ayarlar', yeni);
        io.to(`admin_${k}`).to(`ekran_${k}`).emit('ayarlar_guncelle', yeni);
        const pin = kurumAktifPin[k]; if(pin) io.to(`pin_${pin}`).emit('ayarlar_guncelle', yeni);
        socket.emit('admin_bildirim', 'Kurum teması ve etkinlik metinleri kaydedildi.');
    });

    socketAsync(socket, 'sablondan_quiz_olustur', async (sablon) => {
        const taslak = etkinlikSablonlari[sablon];
        if(!taslak) throw new Error('Şablon bulunamadı.');
        const k = socket.kurumKodu;
        const veriler = await loadKurumData(k);
        const id = yeniId('quiz');
        veriler.quizler[id] = { id, ad: taslak.ad + ' — Taslak', sure: taslak.sure, puan: 100, sorular: taslak.sorular.map(soru => ({ ...derinKopya(soru), id: yeniId('quiz_soru'), konu: taslak.konu })) };
        await saveKurumData(k, 'quizler', veriler.quizler);
        socket.emit('verileri_guncelle', veriler.quizler);
        socket.emit('sablon_olusturuldu', id);
        socket.emit('admin_bildirim', 'Beş sorulu bağımsız etkinlik taslağı oluşturuldu. Yayından önce kurumunuza göre düzenleyin.');
    });

    // Oyun Akışı
    socketAsync(socket, 'quiz_baslat', async (istek) => await yeniOyunBaslat(socket, istek, false));
    socketAsync(socket, 'prova_baslat', async (istek) => await yeniOyunBaslat(socket, istek, true));

    socketAsync(socket, 'soru_yolla', async () => {
        const k = socket.kurumKodu; if(!k) return;
        let pin = kurumAktifPin[k];
        let oyun = oyunlar[pin];
        if(!oyun) return;
        const quizler = (await loadKurumData(k)).quizler;
        const aktifQuiz = oyun.quizAnlik || quizler[oyun.quizId];
        if(!aktifQuiz) return;
        if(oyun.zamanlayici) clearInterval(oyun.zamanlayici);
        oyun.zamanlayici = null;
        oyun.soruAktifMi = false;
        oyun.oyunDuraklatildi = false;
        oyun.cevapYansitildi = false;
        oyun.kurtarildi = false;
        oyun.gorunum = 'soru';
        oyun.baslamaZamani = null;
        oyun.soruSirasi++;
        if (oyun.soruSirasi >= aktifQuiz.sorular.length) {
            oyun.durum = 'tamamlandi';
            io.to(`ekran_${k}`).emit('quiz_bitti_bekle');
            io.to(`pin_${pin}`).emit('quiz_bitti_bekle');
            adminOyunculariGonder(oyun);
            adminOyunDurumuGonder(oyun);
            aktifOyunKaydetPlanla(oyun, 50);
            return;
        }
        const siradakiSoru = aktifQuiz.sorular[oyun.soruSirasi];
        oyun.soruAktifMi = true;
        oyun.durum = 'soru';
        oyun.soruKayitlari[oyun.soruSirasi] = {
            soru: siradakiSoru.soru,
            secenekler: { ...siradakiSoru.secenekler },
            dogruCevap: siradakiSoru.dogruCevap
        };
        const { dogruCevap, ...guvenliSoru } = siradakiSoru;
        const soruBilgisi = {
            ...guvenliSoru,
            soruNo: oyun.soruSirasi + 1,
            toplamSoru: aktifQuiz.sorular.length,
            kalanSoru: Math.max(aktifQuiz.sorular.length - (oyun.soruSirasi + 1), 0)
        };
        io.to(`ekran_${k}`).emit('yeni_soru', soruBilgisi);
        io.to(`pin_${pin}`).emit('yeni_soru', soruBilgisi);
        adminOyunculariGonder(oyun);
        adminOyunDurumuGonder(oyun);
        oyun.kalanSure = Number(aktifQuiz.sure) || 20;
        io.to(`ekran_${k}`).emit('zaman_guncelle', oyun.kalanSure);
        io.to(`pin_${pin}`).emit('zaman_guncelle', oyun.kalanSure);
        oyunSayaciniBaslat(oyun);
        aktifOyunKaydetPlanla(oyun, 50);
        provaCevaplariniUygula(oyun).catch(error => console.error('[prova cevabı]', error.message));
    });

    socketAsync(socket, 'cevap_yansit', async () => {
        const k = socket.kurumKodu; if(!k) return;
        const pin = kurumAktifPin[k];
        const oyun = oyunlar[pin];
        if(!oyun) {
            socket.emit('admin_bildirim', 'Önce bir quiz başlatmalısınız.');
            return;
        }

        const quizler = (await loadKurumData(k)).quizler;
        const aktifQuiz = oyun.quizAnlik || quizler[oyun.quizId];
        const mevcutSoru = aktifQuiz?.sorular?.[oyun.soruSirasi];
        if(!mevcutSoru) {
            socket.emit('admin_bildirim', 'Yansıtılacak aktif bir soru bulunmuyor.');
            return;
        }
        if(oyun.cevapYansitildi) return;

        if(oyun.zamanlayici) clearInterval(oyun.zamanlayici);
        oyun.zamanlayici = null;
        oyun.soruAktifMi = false;
        oyun.oyunDuraklatildi = false;
        oyun.cevapYansitildi = true;
        oyun.durum = 'cevap';
        oyun.gorunum = 'cevap';

        const cevapBilgisi = {
            dogruCevap: mevcutSoru.dogruCevap,
            soruNo: oyun.soruSirasi + 1,
            toplamSoru: aktifQuiz.sorular.length,
            kalanSoru: Math.max(aktifQuiz.sorular.length - (oyun.soruSirasi + 1), 0)
        };
        io.to(`ekran_${k}`).emit('cevap_yansit', cevapBilgisi);
        io.to(`pin_${pin}`).emit('cevap_yansit', cevapBilgisi);
        adminOyunculariGonder(oyun);
        adminOyunDurumuGonder(oyun);
        aktifOyunKaydetPlanla(oyun, 50);
    });

    socketAsync(socket, 'cevap_gonder', async (secilenSecenek) => {
        const pin = socket.pin;
        const oyun = oyunlar[pin];
        if(!oyun || !oyun.soruAktifMi || oyun.oyunDuraklatildi) { socket.emit('cevap_reddedildi', 'Cevap kabulü şu anda kapalı.'); return; }
        const oyuncu = oyun.oyuncular[socket.oyuncuId];
        if(!oyuncu || oyuncu.socketId !== socket.id) return;
        if(typeof secilenSecenek === 'object' && Number(secilenSecenek?.soruNo) !== oyun.soruSirasi + 1) { socket.emit('cevap_reddedildi', 'Bu cevap önceki soruya ait.'); return; }
        const secim = String(typeof secilenSecenek === 'object' ? secilenSecenek?.secim : secilenSecenek || '').trim().toUpperCase();
        if(!CEVAP_HARFLERI.includes(secim)) return;
        oyuncu.cevaplar = Array.isArray(oyuncu.cevaplar) ? oyuncu.cevaplar : [];
        if(oyuncu.cevaplar[oyun.soruSirasi]) {
            socket.emit('cevap_reddedildi', 'Bu soru için cevabın zaten kaydedildi.');
            await aktifOyunKaydet(oyun);
            socket.emit('oyuncu_cevap_durumu', { secim: oyuncu.cevaplar[oyun.soruSirasi].secim, soruNo: oyun.soruSirasi + 1 });
            return;
        }
        const quiz = oyun.quizAnlik;
        if(!quiz?.sorular?.[oyun.soruSirasi]) return;
        const dogruCevap = quiz.sorular[oyun.soruSirasi].dogruCevap;
        const dogruMu = secim === dogruCevap;
        oyuncu.cevaplar[oyun.soruSirasi] = { secim, dogruMu, cevapZamani: Date.now() };
        if (dogruMu) {
            oyuncu.puan += Number(quiz.puan) || 0;
        }
        const cevapSoruNo = oyun.soruSirasi + 1;
        await aktifOyunKaydet(oyun);
        socket.emit('cevap_alindi', { secim, soruNo: cevapSoruNo });
        adminOyunculariGonder(oyun);
        puanlariYayinla(oyun);
        aktifOyunKaydetPlanla(oyun);
    });

    socket.on('sure_durdur_devam', (durum) => {
        let k = socket.kurumKodu;
        let pin = kurumAktifPin[k];
        if(pin && oyunlar[pin] && !oyunlar[pin].kurtarildi) { oyunlar[pin].oyunDuraklatildi = Boolean(durum); aktifOyunKaydetPlanla(oyunlar[pin]); }
    });

    socket.on('admin_skor_goster', () => {
        let k = socket.kurumKodu;
        let pin = kurumAktifPin[k];
        if(pin) {
            oyunlar[pin].gorunum = 'skor';
            aktifOyunKaydetPlanla(oyunlar[pin]);
            io.to(`ekran_${k}`).emit('skor_tablosunu_goster');
            io.to(`pin_${pin}`).emit('skor_tablosunu_goster');
        }
    });

    socketAsync(socket, 'admin_podyum_goster', async () => {
        const k = socket.kurumKodu;
        const pin = kurumAktifPin[k];
        const oyun = oyunlar[pin];
        if(!oyun) return;
        if(oyun.zamanlayici) clearInterval(oyun.zamanlayici);
        oyun.zamanlayici = null;
        oyun.soruAktifMi = false;
        oyun.oyunDuraklatildi = false;
        oyun.durum = 'podyum';
        oyun.gorunum = 'podyum';
        const quizler = (await loadKurumData(k)).quizler;
        const tamSonuc = oyunSonucunuHazirla(oyun, quizler[oyun.quizId]);
        oyun.sonSonuc = tamSonuc;
        const podyum = tamSonuc.oyuncular.map(({ isim, puan }) => ({ isim, puan }));
        io.to(`ekran_${k}`).emit('quiz_bitti_final', podyum);
        io.to(`pin_${pin}`).emit('quiz_bitti_final', podyum);
        Object.entries(oyun.oyuncular).forEach(([id, oyuncu]) => {
            if(!oyuncu.manuel && oyuncu.socketId) {
                io.to(oyuncu.socketId).emit('oyuncu_sonuc', kisiselSonucuHazirla(tamSonuc, id));
            }
        });
        io.to(`admin_${k}`).emit('admin_sonuclar_guncelle', tamSonuc);
        adminOyunculariGonder(oyun);
        adminOyunDurumuGonder(oyun);
        aktifOyunKaydetPlanla(oyun, 50);
    });

    socketAsync(socket, 'quiz_sonlandir', async () => {
        const k = socket.kurumKodu;
        const pin = kurumAktifPin[k];
        const oyun = oyunlar[pin];
        if(!oyun) {
            socket.emit('admin_bildirim', 'Sonlandırılacak aktif bir quiz bulunmuyor.');
            return;
        }
        const quizler = (await loadKurumData(k)).quizler;
        const tamSonuc = oyun.sonSonuc || oyunSonucunuHazirla(oyun, quizler[oyun.quizId]);
        await oyunOdasiniKapat(oyun);
        io.to(`admin_${k}`).emit('admin_sonuclar_guncelle', tamSonuc);
        io.to(`ekran_${k}`).emit('quiz_sonlandirildi', { mesaj: 'Yeni yarışma bekleniyor...' });
        io.to(`pin_${pin}`).emit('quiz_sonlandirildi', { mesaj: 'Quiz sona erdi. Ana sayfaya yönlendirildin.' });
        io.to(`admin_${k}`).emit('oturum_bitti');
        io.to(`admin_${k}`).emit('admin_oyun_durumu', { aktif: false, durum: 'bitti' });
    });

    socket.on('admin_oyuncu_ekle', (isim) => {
        let k = socket.kurumKodu;
        let pin = kurumAktifPin[k];
        let oyun = oyunlar[pin];
        if(!oyun) return;
        if(!String(isim || '').trim()) return;
        const id = 'manuel_' + crypto.randomUUID();
        oyun.oyuncular[id] = { isim: String(isim || '').trim().slice(0, 60), puan: 0, manuel: true, bagli: true, cevaplar: [] };
        adminOyunculariGonder(oyun);
        puanlariYayinla(oyun);
    });

    socketAsync(socket, 'admin_manuel_cevap_gir', async (data) => {
        const k = socket.kurumKodu;
        const pin = kurumAktifPin[k];
        const oyun = oyunlar[pin];
        const oyuncu = oyun?.oyuncular?.[data?.id];
        const secim = String(data?.secim || '').trim().toUpperCase();
        if(!oyun || !oyuncu?.manuel || oyun.durum === 'podyum' || oyun.kurtarildi || oyun.soruSirasi < 0 || !CEVAP_HARFLERI.includes(secim)) return;
        const quizler = (await loadKurumData(k)).quizler;
        const quiz = oyun.quizAnlik || quizler[oyun.quizId];
        const soru = quiz?.sorular?.[oyun.soruSirasi];
        if(!soru) return;
        oyuncu.cevaplar = Array.isArray(oyuncu.cevaplar) ? oyuncu.cevaplar : [];
        const onceki = oyuncu.cevaplar[oyun.soruSirasi];
        if(onceki?.dogruMu) oyuncu.puan = Math.max(0, oyuncu.puan - (Number(quiz.puan) || 0));
        const dogruMu = secim === soru.dogruCevap;
        oyuncu.cevaplar[oyun.soruSirasi] = { secim, dogruMu, cevapZamani: Date.now(), manuel: true };
        if(dogruMu) oyuncu.puan += Number(quiz.puan) || 0;
        adminOyunculariGonder(oyun);
        puanlariYayinla(oyun);
    });

    socket.on('admin_puan_duzenle', (data) => {
        let k = socket.kurumKodu;
        let pin = kurumAktifPin[k];
        let oyun = oyunlar[pin];
        if(!oyun || !oyun.oyuncular[data.id]) return;
        oyun.oyuncular[data.id].puan = parseInt(data.puan) || 0;
        adminOyunculariGonder(oyun);
        puanlariYayinla(oyun);
    });

    socket.on('admin_oyuncu_ad_duzenle', (data) => {
        let k = socket.kurumKodu;
        let pin = kurumAktifPin[k];
        let oyun = oyunlar[pin];
        if(!oyun || !oyun.oyuncular[data.id]) return;
        oyun.oyuncular[data.id].isim = String(data.isim || '').trim().slice(0, 60);
        adminOyunculariGonder(oyun);
        puanlariYayinla(oyun);
    });

    socket.on('admin_oyuncu_sil', (id) => {
        let k = socket.kurumKodu;
        let pin = kurumAktifPin[k];
        let oyun = oyunlar[pin];
        if(!oyun || !oyun.oyuncular[id]) return;
        delete oyun.oyuncular[id];
        adminOyunculariGonder(oyun);
        puanlariYayinla(oyun);
    });

    socket.on('disconnect', () => {
        katilmaSinirlari.delete(socket.id);
        if (socket.pin && socket.oyuncuId && oyunlar[socket.pin]) {
            const oyun = oyunlar[socket.pin];
            const oyuncu = oyun.oyuncular[socket.oyuncuId];
            if(oyuncu && !oyuncu.manuel && oyuncu.socketId === socket.id) {
                oyuncu.bagli = false;
                oyuncu.socketId = null;
                adminOyunculariGonder(oyun);
                aktifOyunKaydetPlanla(oyun);
            }
        }
    });
});

// Kullanılmayan kurtarma kopyaları arşive dönüşmez: son kayıttan 12 saat sonra temizlenir.
let bakimSuruyor = false;
const bakimZamanlayici = setInterval(async () => {
    if(bakimSuruyor || !aktifOyunlarYuklendi) return;
    bakimSuruyor = true;
    try {
        const simdi = Date.now();
        for(const [key, value] of girisDenemeleri) if(simdi - value.baslangic > 15 * 60_000) girisDenemeleri.delete(key);
        for(const [pin, bilgi] of Object.entries(aktifOyunIndeksi)) {
            if(Number(bilgi.sonaErme) > simdi) continue;
            const oyun = oyunlar[pin];
            if(!oyun) continue;
            const k = oyun.kurumKodu;
            const islem = (kurumIslemKuyruklari.get(k) || Promise.resolve()).catch(() => {}).then(async () => {
                if(oyunlar[pin] !== oyun || Number(aktifOyunIndeksi[pin]?.sonaErme) > Date.now()) return;
                await oyunOdasiniKapat(oyun);
                io.to(`ekran_${k}`).to(`pin_${pin}`).emit('quiz_sonlandirildi', { mesaj: 'Uzun süredir kullanılmayan oturum kapatıldı.' });
                io.to(`admin_${k}`).emit('oturum_bitti');
                io.to(`admin_${k}`).emit('admin_oyun_durumu', { aktif: false, durum: 'bitti' });
            });
            kurumIslemKuyruklari.set(k, islem);
            try { await islem; } finally { if(kurumIslemKuyruklari.get(k) === islem) kurumIslemKuyruklari.delete(k); }
        }
    } catch(error) { console.error('[Oturum temizliği]', error.message); }
    finally { bakimSuruyor = false; }
}, 60_000);
bakimZamanlayici.unref();

let kapaniyor = false;
async function guvenliKapanis() {
    if(kapaniyor) return;
    kapaniyor = true;
    clearInterval(bakimZamanlayici);
    server.close();
    const sonSinir = setTimeout(() => process.exit(1), 25000);
    sonSinir.unref();
    try {
        for(const oyun of Object.values(oyunlar)) {
            clearInterval(oyun.zamanlayici);
            clearTimeout(oyunKayitZamanlayicilari.get(oyun.pin));
        }
        io.disconnectSockets(true);
        await Promise.allSettled([...kurumIslemKuyruklari.values()]);
        for(const oyun of Object.values(oyunlar)) await aktifOyunKaydet(oyun);
        await kaliciYazmaKuyrugu;
        process.exit(0);
    } catch(error) { console.error('[Kapanış yedeği başarısız]', error.message); process.exit(1); }
}
process.once('SIGTERM', guvenliKapanis);
process.once('SIGINT', guvenliKapanis);

const PORT = process.env.PORT || 3000;
app.get('/healthz', (req, res) => res.json({ status: 'ok', version: '1.4.1' }));
aktifOyunlariYukle().then(() => server.listen(PORT, () => {
    console.log(`Sunucu çalışıyor. Port: ${PORT}`);
    console.log(`Veri saklama modu: ${STORAGE_PROVIDER}`);
})).catch(error => { console.error('[Başlangıç/kurtarma başarısız]', error.message); process.exitCode = 1; });
