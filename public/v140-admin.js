(() => {
    'use strict';
    const el = (tag, text, className) => { const node = document.createElement(tag); if(text !== undefined) node.textContent = text; if(className) node.className = className; return node; };
    const button = (text, action, className = '') => { const node = el('button', text, className); node.type = 'button'; node.addEventListener('click', action); return node; };
    const prep = el('section', undefined, 't140-panel'); prep.id = 'yayinKontrolMerkezi';
    prep.append(el('h2', 'Yayın Öncesi Kontrol Merkezi'), el('p', 'Seçili quizin içeriğini, ana ekran bağlantısını ve görsellerini yayına geçmeden kontrol edin.', 't140-muted'));
    const result = el('div', undefined, 't140-grid'); result.id = 'yayinKontrolSonuclari';
    const actions = el('div', undefined, 't140-actions');
    const checkButton = button('✓ Yayın Kontrolünü Çalıştır', check, 'btn-yesil');
    actions.append(checkButton, button('▶ Prova Başlat', async () => {
        const quiz = seciliQuiz(); if(!quiz?.sorular?.length) return bildirim('Önce sorusu bulunan bir quiz seçin.');
        if(await window.tazzyOnay('Prova üç demo oyuncusuyla çalışır. Aktif gerçek yarışma varsa prova başlatılmaz; quiz soruları ve gerçek oyuncular korunur. Devam edilsin mi?')) {
            sonCanliSonuc = null; sonucEkraniniCiz(); sekmeAc('canli'); socket.emit('prova_baslat', seciliQuizId);
        }
    }, 'btn-mor'));
    prep.append(actions, result); document.getElementById('sekmeHazirlik').prepend(prep);
    let checkGeneration = 0;
    function card(status, title, detail) {
        const node = el('div', undefined, `t140-check ${status}`);
        node.append(el('strong', `${status === 'basarili' ? '✓' : status === 'hata' ? '✕' : '⚠'} ${title}`), el('small', detail)); return node;
    }
    function check() {
        if(!seciliQuizId) return bildirim('Önce bir quiz seçin.');
        result.replaceChildren(el('p', 'Kontrol ediliyor…')); checkButton.disabled = true;
        socket.emit('yayin_oncesi_kontrol', seciliQuizId);
        setTimeout(() => { checkButton.disabled = false; }, 10000);
    }
    async function imageInfo(url) {
        return new Promise(resolve => {
            if(!window.Tazzy140?.safeImage(url)) { resolve({ ok: false, reason: 'Güvenli HTTPS veya optimize edilmiş görsel gerekli' }); return; }
            const image = new Image(); let done = false;
            const finish = data => { if(done) return; done = true; clearTimeout(timer); image.onload = image.onerror = null; resolve(data); };
            const timer = setTimeout(() => finish({ ok: false, reason: '8 saniyede yüklenemedi' }), 8000);
            image.onload = () => finish({ ok: true, width: image.naturalWidth, height: image.naturalHeight });
            image.onerror = () => finish({ ok: false, reason: 'Bağlantı yüklenemedi' });
            image.referrerPolicy = 'no-referrer'; image.src = url;
        });
    }
    socket.on('yayin_oncesi_sonuc', async data => {
        if(data.quizId !== seciliQuizId) return;
        const generation = ++checkGeneration;
        result.replaceChildren(...data.maddeler.map(x => card(x.durum, x.baslik, x.aciklama)));
        result.append(card(data.hazir ? 'basarili' : 'hata', data.hazir ? 'İçerik kontrolü tamamlandı' : 'Yayın öncesi düzeltme gerekli', `${data.soruSayisi} soru · tahmini ${data.tahminiDakika} dakika (geçişler dahil)`));
        const questions = (seciliQuiz()?.sorular || []).filter(q => q.gorsel);
        for(let i = 0; i < questions.length; i += 4) {
            const batch = await Promise.all(questions.slice(i, i + 4).map(async q => ({ q, info: await imageInfo(q.gorsel) })));
            if(generation !== checkGeneration || data.quizId !== seciliQuizId) return;
            for(const { q, info } of batch) result.append(card(info.ok ? 'basarili' : 'uyari', info.ok ? `Görsel yüklendi · ${info.width}×${info.height}` : 'Görsel yüklenemedi', String(q.soru).slice(0, 85) + (info.reason ? ` — ${info.reason}` : '')));
        }
        checkButton.disabled = false;
    });

    const live = el('section', undefined, 't140-panel'); live.id = 'yayinSagligi';
    live.append(el('h2', 'Yayın Sağlığı'));
    const metrics = el('div', undefined, 't140-metrics'); live.append(metrics);
    const recovery = el('div', undefined, 't140-banner'); recovery.hidden = true;
    recovery.append(el('p', 'Canlı oturum yedekten kurtarıldı. Ana ekranı ve yarışmacıları kontrol ettikten sonra devam ettirin.'), button('▶ Kurtarılan Oturumu Devam Ettir', () => socket.emit('aktif_oturumu_devam_ettir'), 'btn-yesil'));
    live.append(recovery); document.getElementById('sekmeCanli').prepend(live);
    socket.on('oturum_kurtarildi', () => { recovery.hidden = false; sekmeAc('canli'); });
    socket.on('admin_oyun_durumu', data => {
        recovery.hidden = !data.kurtarildi;
        if(data.prova) document.getElementById('canliDurumMetni').textContent = 'PROVA · ' + document.getElementById('canliDurumMetni').textContent;
    });
    socket.on('sistem_sagligi', data => {
        metrics.replaceChildren();
        const values = [[data.ekranBagli ? 'Bağlı' : 'Kapalı', 'Ana ekran'], [data.bagliOyuncu || 0, 'Çevrimiçi'], [data.kopukOyuncu || 0, 'Yeniden bağlanıyor'], [data.prova ? 'Prova' : data.yedekHatasi ? 'Kontrol gerekli' : data.sonYedekZamani ? new Date(data.sonYedekZamani).toLocaleTimeString('tr-TR') : 'Bekliyor', 'Son güvenli yedek']];
        for(const [value, label] of values) { const metric = el('div', undefined, 't140-metric'); metric.append(el('b', String(value)), el('span', label)); metrics.append(metric); }
    });
    setInterval(() => { if(socket.connected) socket.emit('sistem_sagligi_iste'); }, 5000);
    socket.on('connect', () => setTimeout(() => socket.emit('sistem_sagligi_iste'), 1000));

    const countdown = el('div', undefined, 't140-actions');
    const countdownInput = el('input'); countdownInput.type = 'number'; countdownInput.min = '0'; countdownInput.max = '3600'; countdownInput.value = '60'; countdownInput.style.width = '90px'; countdownInput.setAttribute('aria-label','Başlangıç sayacı saniye');
    countdown.append(el('label','Başlangıç sayacı (saniye)'), countdownInput, button('Sayacı Göster', () => socket.emit('lobi_sayaci_ayarla', Number(countdownInput.value))), button('Sayacı Kapat', () => socket.emit('lobi_sayaci_ayarla', 0), 'btn-gri'), el('small','Süre dolunca sorular otomatik başlamaz.','t140-muted'));
    live.append(countdown);

    const theme = el('details', undefined, 't140-panel'); theme.append(el('summary','Kurum Teması ve Etkinlik Metinleri'));
    const themeGrid = el('div',undefined,'t140-grid'); const themeFields = {};
    for(const [key,title,type] of [['etkinlikAdi','Etkinlik adı','text'],['karsilamaMesaji','Karşılama mesajı','text'],['kapanisMesaji','Kapanış mesajı','text'],['anaRenk','Ana renk','color'],['vurguRengi','Vurgu rengi','color'],['arkaPlanRengi','Arka plan','color']]) {
        const label=el('label',title,'t140-field'); const input=el('input'); input.type=type;input.maxLength=key==='etkinlikAdi'?80:160;input.setAttribute('aria-label',title);label.append(input);themeFields[key]=input;themeGrid.append(label);
    }
    const themeActions=el('div',undefined,'t140-actions');
    for(const [title,colors] of [['Tazzy',['#46178f','#16c7d9','#24114f']],['Gece & Altın',['#17243d','#e3b85a','#080f1d']],['Kurumsal',['#123a63','#41d6b3','#102232']],['Enerjik',['#652078','#f7b731','#281443']]]) themeActions.append(button(title,()=>['anaRenk','vurguRengi','arkaPlanRengi'].forEach((key,i)=>themeFields[key].value=colors[i]),'btn-gri'));
    themeActions.append(button('Temayı Kaydet',()=>socket.emit('kurum_tema_kaydet',Object.fromEntries(Object.entries(themeFields).map(([key,input])=>[key,input.value]))),'btn-yesil'));
    theme.append(themeGrid,themeActions);document.getElementById('sekmeHazirlik').append(theme);
    socket.on('ayarlar_guncelle',data=>Object.entries(themeFields).forEach(([key,input])=>input.value=data[key]||''));

    const templates = el('section', undefined, 't140-panel'); templates.append(el('h2', 'Etkinlik Şablonları'), el('p', 'Beş örnek soruyla bağımsız bir etkinlik taslağı oluşturur. Hazır havuzunuzdan sorular ekleyin ve yayın öncesinde içerikleri kontrol edin.', 't140-muted'));
    const templateGrid = el('div', undefined, 't140-grid');
    for(const [id, title, text] of [['otel','Otelcilik','Misafir deneyimi · 25 saniye'],['takim','Takım Çalışması','İletişim etkinliği · 20 saniye'],['genel','Genel Kültür','Eğlenceli yarışma · 20 saniye'],['oryantasyon','Oryantasyon','İş birliği ve iletişim · 25 saniye']]) {
        const item = el('div', undefined, 't140-template'); item.append(el('h3', title), el('p', text, 't140-muted'), button('Taslak Oluştur', () => socket.emit('sablondan_quiz_olustur', id))); templateGrid.append(item);
    }
    templates.append(templateGrid); document.getElementById('sekmeHazirlik').append(templates);
    socket.on('sablon_olusturuldu', id => { if(typeof quizSec === 'function') quizSec(id); else bildirim('Şablon quiz listesine eklendi.'); });

    for(const id of ['h_gorsel', 'qs_gorsel']) {
        const field = document.getElementById(id); if(!field) continue;
        const tools = el('div', undefined, 't140-actions'); const preview = el('div', undefined, 't140-preview'); preview.hidden = true;
        const show = async () => {
            const url = field.value.trim(); if(!url) { preview.hidden = true; return; }
            preview.hidden = false; preview.replaceChildren(el('p', 'Görsel kontrol ediliyor…'));
            const info = await imageInfo(url);
            preview.replaceChildren();
            if(info.ok) { const image = el('img'); image.src = url; image.alt = 'Soru görseli önizlemesi'; preview.append(image, el('p', `${info.width}×${info.height} piksel · Oran ${Number(info.width / info.height).toFixed(2)}. ${info.width > 2000 || info.height > 1600 ? 'Büyük görsel; dosyadan optimize ederek yükleyebilirsiniz.' : 'Ekrana oranı korunarak sığdırılır.'}`)); }
            else preview.append(el('p', '⚠ Görsel yüklenemedi. Bağlantıyı veya dosyayı kontrol edin.'));
        };
        tools.append(button('Görseli Kontrol Et', show, 'btn-gri'));
        const file = el('input'); file.type = 'file'; file.accept = 'image/jpeg,image/png,image/webp'; file.style.maxWidth = '230px'; file.setAttribute('aria-label', 'Görsel dosyasını seç ve optimize et');
        tools.append(file); field.after(tools); tools.after(preview);
        file.addEventListener('change', async () => {
            const selected = file.files?.[0]; if(!selected) return;
            if(selected.size > 15 * 1024 * 1024 || !['image/jpeg','image/png','image/webp'].includes(selected.type)) return bildirim('PNG, JPEG veya WebP; en fazla 15 MB dosya seçin.');
            const url = URL.createObjectURL(selected);
            try {
                const image = new Image(); image.src = url; await image.decode();
                const scale = Math.min(1, 1200 / image.width, 900 / image.height);
                const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
                const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0,canvas.width,canvas.height);
                let quality = .84; let data = canvas.toDataURL('image/jpeg', quality);
                while(data.length > 600000 && quality > .35) { quality -= .1; data = canvas.toDataURL('image/jpeg', quality); }
                if(data.length > 600000) throw new Error('Görsel çok ayrıntılı; daha küçük bir dosya seçin.');
                field.value = data; await show(); bildirim(`Görsel optimize edildi: yaklaşık ${Math.round(data.length * .75 / 1024)} KB. Soruyu kaydetmeyi unutmayın.`);
            } catch(error) { bildirim(error.message || 'Görsel işlenemedi.'); } finally { URL.revokeObjectURL(url); }
        });
    }

})();
