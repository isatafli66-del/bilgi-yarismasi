const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');
const { adminCookie } = require('./http-auth');
const root = path.resolve(__dirname, '..');
const event = (socket, name) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, done); reject(Error('Timeout: '+name)); }, 6000);
    function done(data) { clearTimeout(timer); resolve(data); }
    socket.once(name, done);
});
async function request(socket, name, data, result) { const p=event(socket,result); socket.emit(name,data); return p; }
const question = n => ({soru:'Toplu silme '+n, secenekler:{A:'Bir',B:'İki',C:'Üç',D:'Dört'},dogruCevap:'B'});

test('v1.4.1 kılavuz, toplu silme ve görünür mobil giriş sözleşmesi', () => {
    const admin=fs.readFileSync(path.join(root,'public/admin.html'),'utf8');
    const player=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
    const css=fs.readFileSync(path.join(root,'public/v140.css'),'utf8');
    assert.match(admin,/id="sekmeBtnKilavuz"/);
    assert.match(admin,/id="sekmeKilavuz"/);
    assert.match(admin,/\['hazirlik','canli','sonuclar','kilavuz'\]/);
    assert.doesNotMatch(admin,/Hazırlık çalışma düzeni|Yayın öncesi kısa kontrol/);
    assert.match(admin,/id="havuzTopluSilBtn"[^>]+disabled/);
    assert.match(admin,/await window.tazzyOnay/);
    assert.match(admin,/mevcut filtrede görünmüyor/);
    assert.match(admin,/else havuzSecimleri.clear\(\)/);
    assert.match(player,/#girisAlani \{[^}]+min-height: 0;[^}]+overflow-y: auto/);
    assert.match(css,/\.tazzy-player #girisAlani \.katil-btn\{background:#ffffff;color:#321166/);
    assert.doesNotMatch(css,/\.katil-btn\{background:var\(--tazzy-primary\)/);
    assert.match(fs.readFileSync(path.join(root,'public/service-worker.js'),'utf8'),/tazzy-quiz-v1.4.1/);
});

test('v1.4.1 toplu silme: yetki, kurum ayrımı, tek kayıt, tekrar, quiz ve canlı kopya korunur', {timeout:30000}, async () => {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tazzy-v141-'));
    for(const code of ['ALFA','BETA']) fs.writeFileSync(path.join(dir,'quizler_'+code+'.json'),'{}');
    fs.writeFileSync(path.join(dir,'kurumlar.json'),JSON.stringify({
        ALFA:{sifre:'test-alfa',aktif:true,bitis:'2030-01-01'},
        BETA:{sifre:'test-beta',aktif:true,bitis:'2030-01-01'}
    }));
    const base='http://127.0.0.1:43241';
    const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'43241',DATA_DIR:dir,STORAGE_PROVIDER:'file',MASTER_SIFRE:'test-v141-master-long',API_KEY:''},stdio:['ignore','pipe','pipe']});
    const sockets=[];
    try {
        await new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>reject(Error('Server timeout')),8000);
            child.stdout.on('data',x=>{if(String(x).includes('Sunucu çalışıyor')){clearTimeout(timer);resolve();}});
            child.once('exit',()=>{clearTimeout(timer);reject(Error('Server exited'));});
        });
        async function connect(code,pass){
            const cookie=code?await adminCookie(base,code,pass):null;
            const s=io(base,{transports:['websocket'],forceNew:true,reconnection:false,extraHeaders:cookie?{Cookie:cookie}:{}});
            sockets.push(s);await event(s,'connect');
            if(code) await request(s,'admin_giris',code,'soru_havuzu_guncelle');
            return s;
        }
        const a=await connect('ALFA','test-alfa'), b=await connect('BETA','test-beta'), rogue=await connect();
        const aPool=await request(a,'havuz_soru_toplu_ekle',{sorular:[question(1),question(2),question(3)]},'soru_havuzu_guncelle');
        const ids=aPool.sira;
        assert.equal(ids.length,3);
        const bPool=await request(b,'havuz_soru_ekle_guncelle',{soru:question('B')},'soru_havuzu_guncelle');
        const bid=bPool.sira[0];
        const bStored=fs.readFileSync(path.join(dir,'soru_havuzu_BETA.json'),'utf8');
        await request(a,'quiz_ekle_guncelle',{id:'quiz141',ad:'QA',sure:60,puan:100},'verileri_guncelle');
        const copied=await request(a,'havuzdan_quize_toplu_kopyala',{quizId:'quiz141',soruIdleri:ids},'verileri_guncelle');
        const before=JSON.stringify(copied.quiz141);
        await request(a,'quiz_baslat','quiz141','oturum_basladi');
        assert.match(await request(rogue,'havuz_soru_toplu_sil',{soruIdleri:ids},'yetki_hatasi'),/oturum|yetki/i);
        for(const bad of [null,[],[null],[{}],[''],Array(10001).fill(ids[0])])
            assert.match(await request(a,'havuz_soru_toplu_sil',{soruIdleri:bad},'sistem_hata'),/geçerli soru/);
        assert.equal((await request(a,'havuz_soru_toplu_sil',{soruIdleri:[ids[0],ids[0],bid],kurumKodu:'BETA'},'havuz_toplu_silindi')).silinenSayi,1);
        assert.equal((await request(a,'havuz_soru_toplu_sil',{soruIdleri:[ids[0]]},'havuz_toplu_silindi')).silinenSayi,0);
        assert.equal((await request(a,'havuz_soru_toplu_sil',{soruIdleri:ids.slice(1)},'havuz_toplu_silindi')).silinenSayi,2);
        const after=await request(a,'admin_giris','ALFA','verileri_guncelle');
        assert.equal(JSON.stringify(after.quiz141),before);
        const aReload=await request(a,'admin_giris','ALFA','soru_havuzu_guncelle');
        assert.deepEqual(aReload.sira,[]);
        assert.deepEqual(Object.keys(aReload.sorular),[]);
        const bReload=await request(b,'admin_giris','BETA','soru_havuzu_guncelle');
        assert.deepEqual(bReload.sira,bPool.sira);
        assert.equal(bReload.sorular[bid].soru,question('B').soru);
        assert.equal(fs.readFileSync(path.join(dir,'soru_havuzu_BETA.json'),'utf8'),bStored);
        const screen=await connect();
        screen.emit('ekran_giris','ALFA');
        const first=event(screen,'yeni_soru');a.emit('soru_yolla');
        assert.equal((await first).soru,question(1).soru);
        await request(a,'quiz_sonlandir',null,'oturum_bitti');
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'soru_havuzu_ALFA.json'),'utf8')).sira,[]);
    } finally {
        sockets.forEach(s=>s.disconnect());
        const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exited;
        fs.rmSync(dir,{recursive:true,force:true});
    }
});
