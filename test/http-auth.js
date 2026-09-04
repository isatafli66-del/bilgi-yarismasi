async function adminCookie(adres, kurum = 'ROOF-01', sifre = '123456') {
    const response = await fetch(adres + (kurum === 'tazzy' ? '/tazzy-master' : '/admin'), {
        headers: { Authorization: 'Basic ' + Buffer.from(kurum + ':' + sifre).toString('base64') }
    });
    if(response.status !== 200) throw new Error('Test admin HTTP girişi başarısız: ' + response.status);
    return response.headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
}
module.exports = { adminCookie };
