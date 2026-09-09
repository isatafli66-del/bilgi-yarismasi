const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');
const { adminCookie } = require('./http-auth');
const {
    archiveResult,
    archiveSummaries,
    evaluateAnswer,
    normalizeQuestionContent,
    normalizeTeams,
    rankPlayers,
    teamStandings
} = require('../premium');

const root = path.resolve(__dirname, '..');
const event = (socket, name, timeout = 7000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, done); reject(Error(`Timeout: ${name}`)); }, timeout);
    function done(data) { clearTimeout(timer); resolve(data); }
    socket.once(name, done);
});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('v1.5 soru türleri güvenli biçimde normalize edilir ve değerlendirilir', () => {
    const multi = normalizeQuestionContent({ soru:'İki doğruyu seç', tip:'coklu-secim', secenekler:{A:'Bir',B:'İki',C:'Üç',D:'Dört'}, dogruCevap:'A,C' });
    assert.equal(evaluateAnswer(multi, 'C,A').dogruMu, true);
    assert.equal(evaluateAnswer(multi, 'A').dogruMu, false);
    const order = normalizeQuestionContent({ soru:'Sırala', tip:'siralama', secenekler:{A:'1',B:'2',C:'3'}, dogruCevap:'B,A,C' });
    assert.equal(evaluateAnswer(order, 'B,A,C').dogruMu, true);
    assert.equal(evaluateAnswer(order, 'A,B,C').dogruMu, false);
    const text = normalizeQuestionContent({ soru:'Başkent?', tip:'acik-uclu', dogruCevap:'İstanbul' });
    assert.equal(evaluateAnswer(text, 'istanbul').dogruMu, true);
    const number = normalizeQuestionContent({ soru:'Kaç?', tip:'tahmin', dogruCevap:'100', tolerans:5 });
    assert.equal(evaluateAnswer(number, '104').dogruMu, true);
    assert.equal(evaluateAnswer(number, '106').dogruMu, false);
    const poll = normalizeQuestionContent({ soru:'Memnuniyet', tip:'puanlama' });
    assert.equal(evaluateAnswer(poll, 'E').dogruMu, null);
});

test('v1.5 eşit puanda hızlı doğru cevap sıralaması ve takım puanı uygulanır', () => {
    const players = [
        { isim:'Yavaş', puan:100, takimId:'t1', cevaplar:[{dogruMu:true,cevapSuresiMs:4200}] },
        { isim:'Hızlı', puan:100, takimId:'t2', cevaplar:[{dogruMu:true,cevapSuresiMs:1200}] },
        { isim:'Lider', puan:200, takimId:'t1', cevaplar:[{dogruMu:true,cevapSuresiMs:3000}] }
    ];
    const ranked = rankPlayers(players);
    assert.deepEqual(ranked.map(x => x.isim), ['Lider','Hızlı','Yavaş']);
    assert.deepEqual(ranked.map(x => x.sira), [1,2,3]);
    const teams = teamStandings(players, [{id:'t1',ad:'Kırmızı'},{id:'t2',ad:'Mavi'}]);
    assert.equal(teams[0].ad, 'Kırmızı');
    assert.equal(teams[0].puan, 300);
    assert.equal(normalizeTeams({takimModu:true,takimlar:['Kırmızı','Mavi']}).takimModu, true);
});

test('v1.5 kurum arşivi tekrarları tekilleştirir ve yalnızca son 10 etkinliği tutar', () => {
    let archive = {versiyon:1,sonuclar:[]};
    for(let i=0;i<12;i++) archive = archiveResult({quizAdi:`Quiz ${i}`,pin:String(100000+i),tamamlanmaZamani:new Date(2026,0,i+1).toISOString(),sorular:[],oyuncular:[]}, archive, {etkinlikAdi:'Kurum'});
    assert.equal(archive.sonuclar.length,10);
    assert.equal(archive.sonuclar[0].quizAdi,'Quiz 11');
    archive = archiveResult({quizAdi:'Güncel',pin:'100011',tamamlanmaZamani:new Date().toISOString(),sorular:[],oyuncular:[]}, archive, {etkinlikAdi:'Kurum'});
    assert.equal(archive.sonuclar.length,10);
    assert.equal(archive.sonuclar.filter(x=>x.pin==='100011').length,1);
    assert.equal(archiveSummaries(archive)[0].quizAdi,'Güncel');
    archive = archiveResult({quizAdi:'Gizlilik',pin:'999999',tamamlanmaZamani:new Date().toISOString(),sorular:[],oyuncular:[{id:'gizli-token',isim:'Katılımcı',puan:10,bagli:true,cevaplar:[]}]}, archive, {etkinlikAdi:'Kurum',logo:'data:image/png;base64,'+'a'.repeat(10000)});
    assert.equal(archive.sonuclar[0].oyuncular[0].id,undefined);
    assert.equal(archive.sonuclar[0].oyuncular[0].bagli,undefined);
    assert.equal(archive.sonuclar[0].kurumLogosu,null);
});

test('v1.5 takım katılımı, yeni cevap türü, süre eşitliği ve arşiv uçtan uca çalışır', {timeout:30000}, async () => {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tazzy-v150-'));
    fs.writeFileSync(path.join(dir,'kurumlar.json'),JSON.stringify({PREMIUM:{sifre:'premium-test',aktif:true,bitis:'2030-01-01'}}));
    fs.writeFileSync(path.join(dir,'quizler_PREMIUM.json'),JSON.stringify({q1:{id:'q1',ad:'Premium QA',sure:30,puan:100,takimModu:true,oyunModu:'takim',takimlar:[{id:'k',ad:'Kırmızı',renk:'#e21b3c'},{id:'m',ad:'Mavi',renk:'#1368ce'}],sorular:[{id:'s1',soru:'A ve C seç',tip:'coklu-secim',gorsel:null,secenekler:{A:'A',B:'B',C:'C',D:'D'},dogruCevap:'A,C',dogruCevaplar:['A','C'],puanCarpani:1}]}}));
    const base='http://127.0.0.1:43250';
    const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'43250',DATA_DIR:dir,STORAGE_PROVIDER:'file',MASTER_SIFRE:'premium-master-secret',API_KEY:''},stdio:['ignore','pipe','pipe']});
    const sockets=[];
    try {
        await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server timeout')),8000);child.stdout.on('data',x=>{if(String(x).includes('Sunucu çalışıyor')){clearTimeout(timer);resolve();}});child.once('exit',()=>{clearTimeout(timer);reject(Error('Server exited'));});});
        const cookie=await adminCookie(base,'PREMIUM','premium-test');
        const admin=io(base,{transports:['websocket'],forceNew:true,reconnection:false,extraHeaders:{Cookie:cookie}});sockets.push(admin);await event(admin,'connect');
        const initialArchive=event(admin,'etkinlik_arsivi_guncelle');admin.emit('admin_giris','PREMIUM');assert.deepEqual(await initialArchive,[]);
        const started=event(admin,'oturum_basladi');admin.emit('quiz_baslat','q1');const {pin}=await started;
        async function player(token,team){const socket=io(base,{transports:['websocket'],forceNew:true,reconnection:false});sockets.push(socket);await event(socket,'connect');const ok=event(socket,'katilma_basarili');socket.emit('oyuncu_katil',{isim:token,pin,oyuncuToken:`token_${token}`,takimId:team});await ok;return socket;}
        const invalid=io(base,{transports:['websocket'],forceNew:true,reconnection:false});sockets.push(invalid);await event(invalid,'connect');const denied=event(invalid,'katilma_hatasi');invalid.emit('oyuncu_katil',{isim:'Takımsız',pin,oyuncuToken:'token_invalid'});assert.match(await denied,/takım/i);
        const fast=await player('Hızlı','k'),slow=await player('Yavaş','m');
        const qFast=event(fast,'yeni_soru'),qSlow=event(slow,'yeni_soru');admin.emit('soru_yolla');await Promise.all([qFast,qSlow]);
        const ackFast=event(fast,'cevap_alindi');fast.emit('cevap_gonder',{soruNo:1,secim:'C,A'});await ackFast;await wait(80);const ackSlow=event(slow,'cevap_alindi');slow.emit('cevap_gonder',{soruNo:1,secim:'A,C'});await ackSlow;
        admin.emit('soru_yolla');await wait(50);
        const resultPromise=event(admin,'admin_sonuclar_guncelle');const archivePromise=event(admin,'etkinlik_arsivi_guncelle');admin.emit('admin_podyum_goster');const result=await resultPromise;const archived=await archivePromise;
        assert.deepEqual(result.oyuncular.map(x=>x.isim),['Hızlı','Yavaş']);
        assert.ok(result.oyuncular[0].dogruCevapSuresiMs<result.oyuncular[1].dogruCevapSuresiMs);
        assert.equal(result.takimModu,true);assert.equal(result.takimlar.length,2);assert.equal(archived.length,1);
        const detailPromise=event(admin,'etkinlik_arsiv_detay');admin.emit('etkinlik_arsiv_detay_iste',archived[0].arsivId);assert.equal((await detailPromise).pin,pin);
        await wait(100);const disk=JSON.parse(fs.readFileSync(path.join(dir,'etkinlik_arsivi_PREMIUM.json'),'utf8'));assert.equal(disk.sonuclar.length,1);
    } finally {
        sockets.forEach(socket=>socket.disconnect());const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exited;fs.rmSync(dir,{recursive:true,force:true});
    }
});
