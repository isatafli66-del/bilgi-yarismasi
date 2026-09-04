(() => {
    'use strict';
    const form = document.querySelector('.form-panel');
    const panel = document.createElement('fieldset'); panel.className = 't140-settings'; panel.style.marginBottom = '20px';
    const legend = document.createElement('legend'); legend.textContent = 'Kurum Teması ve Etkinlik Kimliği'; panel.appendChild(legend);
    const fields = {};
    const definitions = [
        ['etkinlikAdi','Etkinlik / kurum başlığı','text','Tazzy Quiz'],
        ['karsilamaMesaji','Karşılama mesajı','text','Bilginizi gösterin, eğlenceye katılın!'],
        ['kapanisMesaji','Kapanış mesajı','text','Katıldığınız için teşekkürler.'],
        ['anaRenk','Ana renk','color','#46178f'], ['vurguRengi','Vurgu rengi','color','#16c7d9'], ['arkaPlanRengi','Arka plan rengi','color','#24114f'],
        ['animasyonlar','Ekran geçişleri','select','true',[['true','Yumuşak geçişler'],['false','Hareket azaltılmış']]],
        ['sesVarsayilan','Varsayılan ses tercihi','select','true',[['true','Kullanıcı etkinleştirebilir'],['false','Kapalı']]]
    ];
    for(const [key,title,type,value,options] of definitions) {
        const label = document.createElement('label'); label.className = 't140-field'; label.textContent = title;
        const input = document.createElement(type === 'select' ? 'select' : 'input');
        if(type !== 'select') input.type = type;
        if(options) for(const [val,text] of options) { const option = document.createElement('option'); option.value=val;option.textContent=text;input.appendChild(option); }
        input.value=value; input.id=`t140_${key}`; input.style.color='#e7edf8'; input.style.background='#0f172a';
        if(type==='number'){input.min='0';input.max='10000';}
        if(type==='text') input.maxLength = key === 'etkinlikAdi' ? 80 : 160;
        label.appendChild(input);panel.appendChild(label);fields[key]=input;
    }
    const presets = document.createElement('div');presets.className='t140-actions';
    for(const [title,colors] of [['Tazzy',['#46178f','#16c7d9','#24114f']],['Gece & Altın',['#17243d','#e3b85a','#080f1d']],['Kurumsal',['#123a63','#41d6b3','#102232']]]){
        const button=document.createElement('button');button.type='button';button.textContent=title;
        button.addEventListener('click',()=>['anaRenk','vurguRengi','arkaPlanRengi'].forEach((key,i)=>fields[key].value=colors[i]));presets.appendChild(button);
    }
    panel.prepend(presets);
    const note=document.createElement('p');note.textContent='Seçilen tema, karşılama ve kapanış metinleri kurumun ana ekranına ve yarışmacı ekranlarına uygulanır. Sonuç arşivi veya ödeme özelliği yoktur.';note.className='t140-muted';panel.appendChild(note);
    form.querySelector('button[onclick="kurumKaydet()"]').before(panel);
    const originalEmit=socket.emit.bind(socket);
    socket.emit=function(event,...args){
        if(event==='master_kurum_ekle_guncelle' && args[0]) {
            const settings=Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,input.value]));
            settings.animasyonlar=settings.animasyonlar==='true';settings.sesVarsayilan=settings.sesVarsayilan==='true';
            args[0]={...args[0],ayarlar:settings};
            for(const [key,,,fallback] of definitions) fields[key].value=String(fallback);
        }
        return originalEmit(event,...args);
    };
    socket.on('master_kurum_detay_cevap',data=>{for(const [key,, ,fallback] of definitions) fields[key].value=String(data[key] ?? fallback);});
    socket.on('yetki_hatasi',message=>alert(message));
})();
