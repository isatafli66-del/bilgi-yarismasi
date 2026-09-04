(() => {
    'use strict';
    window.tazzyOnay = message => new Promise(resolve => {
        const dialog = document.createElement('dialog'); dialog.className='t140-dialog';
        const title = document.createElement('h2'); title.textContent='İşlemi onayla';
        const text = document.createElement('p');text.textContent=message;
        const actions=document.createElement('div');actions.className='t140-actions';
        const finish=value=>{dialog.close();dialog.remove();resolve(value);};
        for(const [label,value] of [['Vazgeç',false],['Onayla ve Devam Et',true]]) {const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',()=>finish(value));actions.append(b);}
        dialog.append(title,text,actions);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false);});document.body.append(dialog);dialog.showModal();
    });
    const stage = Boolean(document.getElementById('devEkraniPin'));
    const player = Boolean(document.getElementById('girisAlani'));
    const admin = Boolean(document.getElementById('sekmeHazirlik'));
    const state = window.Tazzy140 = { settings: {}, health: {}, connected: socket.connected };
    state.safeImage = url => {
        if(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url) && url.length <= 600000) return true;
        try { const u = new URL(url); return u.protocol === 'https:' && !u.username && !u.password && !/^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/i.test(u.hostname); } catch (_) { return false; }
    };
    if(stage) document.body.classList.add('tazzy-stage');
    if(player) document.body.classList.add('tazzy-player');
    const health = document.createElement('div');
    health.className = 't140-health' + (stage ? ' t140-floating' : '');
    health.setAttribute('role', 'status'); health.textContent = 'Bağlantı kuruluyor';
    if(admin) document.querySelector('.header').appendChild(health); else document.body.appendChild(health);
    const banner = document.createElement('div');
    banner.className = 't140-banner t140-reconnect'; banner.hidden = true; banner.setAttribute('role', 'status');
    document.body.appendChild(banner);
    let recovered = false;
    function connection(ok, text) {
        state.connected = ok; health.classList.toggle('offline', !ok);
        health.textContent = text || (ok ? 'Bağlı' : 'Yeniden bağlanıyor…');
        if(!ok) { banner.hidden = false; banner.textContent = 'Bağlantı yeniden kuruluyor. Bu pencereyi açık tutun; kayıtlı puan ve cevaplarınız korunur.'; }
        else if(!recovered) banner.hidden = true;
    }
    socket.on('connect', () => connection(true));
    socket.on('disconnect', () => connection(false));
    socket.on('connect_error', () => connection(false));
    socket.on('yetki_hatasi', text => { connection(false, 'Giriş yenilenmeli'); banner.hidden = false; banner.textContent = text; });
    socket.on('oturum_kurtarildi', data => { recovered = true; banner.hidden = false; banner.textContent = data.mesaj; });
    socket.on('oturum_devam_ediyor', () => { recovered = false; banner.hidden = true; });
    socket.on('quiz_sonlandirildi', () => { recovered = false; banner.hidden = true; });
    socket.on('oturum_bitti', () => { recovered = false; banner.hidden = true; });
    socket.on('sistem_sagligi', data => { state.health = data; });
    connection(socket.connected);
    setInterval(() => {
        if(!socket.connected) return;
        const start = performance.now();
        socket.timeout(5000).emit('tazzy_ping', (error) => {
            if(error) { health.textContent = 'Bağlantı yavaş'; health.classList.add('offline'); return; }
            const ms = Math.round(performance.now() - start);
            connection(true, ms > 1000 ? `Bağlantı yavaş · ${ms} ms` : `Bağlı · ${ms} ms`);
        });
    }, 10000);

    let preferences = {};
    try { preferences = JSON.parse(localStorage.getItem('tazzyTercihler') || '{}'); } catch (_) {}
    const savePreferences = () => { try { localStorage.setItem('tazzyTercihler', JSON.stringify(preferences)); } catch (_) {} };
    if(typeof window.konfetiPatlat === 'function') {
        const originalConfetti = window.konfetiPatlat;
        window.konfetiPatlat = () => {
            if(preferences.motion !== false && state.settings.animasyonlar !== false && !matchMedia('(prefers-reduced-motion: reduce)').matches) originalConfetti();
        };
    }
    function applyPreferences() {
        if(typeof sesAktif !== 'undefined' && preferences.sound !== undefined) sesAktif = Boolean(preferences.sound);
        document.body.classList.toggle('t140-reduced', preferences.motion === false || state.settings.animasyonlar === false);
    }
    socket.on('ayarlar_guncelle', settings => {
        state.settings = settings || {};
        if(stage && !document.getElementById('baslangicBekleme').classList.contains('gizli')) document.getElementById('baslangicMesaj').textContent = settings?.etkinlikAdi || 'Yeni yarışma bekleniyor…';
        for(const [key, variable] of [['anaRenk','--tazzy-primary'], ['vurguRengi','--tazzy-accent'], ['arkaPlanRengi','--tazzy-back']]) {
            if(/^#[0-9a-f]{6}$/i.test(settings?.[key] || '')) document.documentElement.style.setProperty(variable, settings[key]);
        }
        document.querySelectorAll('[data-t140-event]').forEach(el => el.textContent = settings?.etkinlikAdi || 'Tazzy Quiz');
        document.querySelectorAll('[data-t140-welcome]').forEach(el => el.textContent = settings?.karsilamaMesaji || 'Yarışmaya hoş geldiniz.');
        if(preferences.sound === undefined && typeof sesAktif !== 'undefined' && settings?.sesVarsayilan === false) sesAktif = false;
        applyPreferences();
    });

    if(stage) {
        const lobby = document.getElementById('qrBeklemeEkrani');
        const title = document.createElement('h2'); title.className = 't140-event-title'; title.dataset.t140Event = ''; title.textContent = 'Tazzy Quiz';
        const subtitle = document.createElement('p'); subtitle.className = 't140-event-subtitle'; subtitle.dataset.t140Welcome = ''; subtitle.textContent = 'Bilginizi gösterin, eğlenceye katılın!';
        lobby.prepend(subtitle); lobby.prepend(title);
        const count = document.createElement('div'); count.className = 't140-lobby-count'; count.textContent = '0 yarışmacı hazır'; lobby.appendChild(count);
        const countdown = document.createElement('div'); countdown.className = 't140-countdown'; countdown.hidden = true; lobby.appendChild(countdown);
        let startAt = null; let clockOffset = 0;
        const drawCountdown = () => { countdown.hidden = !startAt; if(startAt) { const left = Math.max(0,Math.ceil((startAt - Date.now() - clockOffset)/1000)); countdown.textContent = left ? `Başlangıca ${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}` : 'Birazdan başlıyor…'; } };
        setInterval(drawCountdown, 500);
        socket.on('bekleme_bilgisi', data => { startAt = data.baslamaZamani; clockOffset = (data.sunucuZamani || Date.now())-Date.now(); drawCountdown(); count.textContent = `${data.prova ? 'PROVA · ' : ''}${data.toplamOyuncu || 0} yarışmacı · ${data.bagliOyuncu || 0} bağlı`; });
        socket.on('oturum_basladi', data => { count.textContent = data.prova ? 'PROVA · gerçek yarışmacı kabul edilmez' : 'Yarışmacılar bekleniyor'; });
        const welcome = document.createElement('p'); welcome.className = 't140-event-subtitle'; welcome.dataset.t140Welcome = ''; document.getElementById('baslangicBekleme').appendChild(welcome);
        socket.on('quiz_sonlandirildi', () => { document.getElementById('baslangicMesaj').textContent = state.settings.etkinlikAdi || 'Yeni yarışma bekleniyor…'; welcome.textContent = state.settings.kapanisMesaji || 'Katıldığınız için teşekkürler.'; });
    }

    if(player) {
        const menu = document.querySelector('.oyun-menu-karti');
        const settings = document.createElement('fieldset'); settings.className = 't140-settings';
        const legend = document.createElement('legend'); legend.textContent = 'Ekran ve bildirim tercihleri'; settings.appendChild(legend);
        for(const [key, label, checked] of [['sound','Ses efektleri',preferences.sound !== false], ['vibrate','Titreşim',preferences.vibrate !== false], ['motion','Yumuşak geçişler',preferences.motion !== false]]) {
            const row = document.createElement('label'); row.className = 't140-switch';
            const input = document.createElement('input'); input.type = 'checkbox'; input.checked = checked;
            row.append(input, document.createTextNode(label)); settings.appendChild(row);
            input.addEventListener('change', () => { preferences[key] = input.checked; savePreferences(); applyPreferences(); if(key === 'sound' && input.checked && typeof sesContext !== 'undefined') sesContext.resume().catch(() => {}); });
        }
        menu.appendChild(settings);
        const vibrate = pattern => { if(preferences.vibrate !== false && navigator.vibrate) navigator.vibrate(pattern); };
        let pending = null; let ackTimer = null;
        function sent(data) {
            if(!aktifOturumVar || document.getElementById('oyunAlani').classList.contains('gizli') || !aktifSoru || (data?.soruNo && aktifSoru.soruNo !== data.soruNo)) return;
            clearTimeout(ackTimer); pending = null;
            gosterMesaj(`✓ ${data?.secim || ''} cevabın sunucuya kaydedildi. Sonraki aşama bekleniyor.`);
            vibrate(30);
        }
        window.cevapVer = secim => {
            if(!socket.connected) { gosterMesaj('Bağlantı kurulmadan cevap gönderilemez. Yeniden bağlanılıyor…'); return; }
            const soruNo = aktifSoru?.soruNo;
            document.querySelectorAll('#cevapButonlari .btn').forEach(button => button.disabled = true);
            pending = { secim, soruNo };
            gosterMesaj('Cevabın gönderiliyor…');
            socket.emit('cevap_gonder', pending);
            clearTimeout(ackTimer);
            ackTimer = setTimeout(() => {
                if(!pending || aktifSoru?.soruNo !== soruNo) return;
                gosterMesaj('Cevap henüz doğrulanamadı. Bağlantıyı kontrol edip aynı cevabı yeniden gönderebilirsin.');
                const retry = document.createElement('button'); retry.textContent = 'Aynı cevabı yeniden gönder'; retry.style.marginTop = '12px';
                retry.addEventListener('click', () => { if(pending && aktifSoru?.soruNo === soruNo) window.cevapVer(secim); });
                document.getElementById('mesajAlani').appendChild(retry);
            }, 4500);
        };
        socket.on('cevap_alindi', sent);
        socket.on('oyuncu_cevap_durumu', sent);
        socket.on('cevap_reddedildi', () => { clearTimeout(ackTimer); pending = null; });
        socket.on('yeni_soru', data => { clearTimeout(ackTimer); pending = null; applyPreferences(); if(!data.yenidenBaglandi) vibrate([35,45,35]); });
        socket.on('zaman_guncelle', seconds => { if(seconds === 5) vibrate([25,70,25]); });
        socket.on('cevap_yansit', () => { clearTimeout(ackTimer); pending = null; vibrate(50); });
        for(const event of ['sure_bitti','quiz_sonlandirildi','quiz_bitti_final','skor_tablosunu_goster']) socket.on(event, () => { clearTimeout(ackTimer); pending = null; });
        document.getElementById('katilBtn')?.addEventListener('click', applyPreferences);
    }
    applyPreferences();
})();
