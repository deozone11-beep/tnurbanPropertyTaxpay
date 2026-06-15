const https = require('https');
const fs = require('fs');

function req(method, path, data, headers) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'tnurbanepay.tn.gov.in', port: 443, path, method,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', ...headers }
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const r = https.request(opts, res => {
      const c = []; res.on('data', d => c.push(d));
      res.on('end', () => resolve({ data: Buffer.concat(c).toString('utf8'), headers: res.headers, status: res.statusCode }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function ef(html, id) {
  for (const pat of [
    new RegExp(`id=["']${id}["'][^>]*value=["']([^"']*)["']`, 'i'),
    new RegExp(`name=["']${id}["'][^>]*value=["']([^"']*)["']`, 'i'),
  ]) { const m = html.match(pat); if (m) return m[1]; }
  return '';
}

async function main() {
  const g = await req('GET', '/PT_CPPaymentDetails.aspx', null, {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Upgrade-Insecure-Requests': '1'
  });
  const cookies = (g.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  const vs = ef(g.data, '__VIEWSTATE');
  const vsg = ef(g.data, '__VIEWSTATEGENERATOR') || 'A4D7941B';
  const ev = ef(g.data, '__EVENTVALIDATION');

  const p1 = new URLSearchParams();
  p1.set('ctl00$ctl31', 'ctl00$PageContent$UpdatePanel4|ctl00$PageContent$btnViewPaymentHis');
  p1.set('ctl00$alert_msg', ''); p1.set('ctl00$PageContent$hdnref', '');
  p1.set('ctl00$PageContent$totamt_value', ''); p1.set('ctl00$PageContent$HdPropertyTypeID', '');
  p1.set('ctl00$PageContent$rdbulb', '0'); p1.set('ctl00$PageContent$txtRefNumber', '082/001/900540');
  p1.set('ctl00$PageContent$txt_OldNo', ''); p1.set('ctl00$PageContent$TextBox1', '');
  p1.set('ctl00$PageContent$txt_RemittersName', ''); p1.set('ctl00$PageContent$txtTransactionAmount', '');
  p1.set('__EVENTTARGET', ''); p1.set('__EVENTARGUMENT', ''); p1.set('__LASTFOCUS', '');
  p1.set('__VIEWSTATE', vs); p1.set('__VIEWSTATEGENERATOR', vsg);
  p1.set('__VIEWSTATEENCRYPTED', ''); p1.set('__EVENTVALIDATION', ev);
  p1.set('__ASYNCPOST', 'true'); p1.set('ctl00$PageContent$btnViewPaymentHis', 'View Payment History');

  const r1 = await req('POST', '/PT_CPPaymentDetails.aspx', p1.toString(), {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-MicrosoftAjax': 'Delta=true', 'X-Requested-With': 'XMLHttpRequest',
    'Origin': 'https://tnurbanepay.tn.gov.in', 'Referer': 'https://tnurbanepay.tn.gov.in/PT_CPPaymentDetails.aspx',
    'Cookie': cookies, 'Accept': '*/*'
  });
  const redirMatch = r1.data.match(/\d+\|pageRedirect\|([^|]+)\|/);
  const histPath = redirMatch ? redirMatch[1] : '/PT_DirectViewPaymentDet.aspx';

  const r2 = await req('GET', histPath, null, {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': 'https://tnurbanepay.tn.gov.in/PT_CPPaymentDetails.aspx',
    'Cookie': cookies, 'Upgrade-Insecure-Requests': '1'
  });
  const histVS = ef(r2.data, '__VIEWSTATE');
  const histVSG = ef(r2.data, '__VIEWSTATEGENERATOR') || 'ED1BAC93';
  const histEV = ef(r2.data, '__EVENTVALIDATION');
  const btnName = (r2.data.match(/name="([^"]*gdvpaymenthistory[^"]*ctl02[^"]*btnprint[^"]*)"/i)||['',''])[1];

  // POST print button
  const p2 = new URLSearchParams();
  p2.set('__EVENTTARGET', ''); p2.set('__EVENTARGUMENT', '');
  p2.set('__VIEWSTATE', histVS); p2.set('__VIEWSTATEGENERATOR', histVSG);
  p2.set('__VIEWSTATEENCRYPTED', ''); p2.set('__EVENTVALIDATION', histEV);
  p2.set('ctl00$alert_msg', ''); p2.set(btnName, 'Print');

  const printResult = await new Promise((resolve, reject) => {
    const opts2 = {
      hostname: 'tnurbanepay.tn.gov.in', port: 443,
      path: '/PT_DirectViewPaymentDet.aspx', method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(p2.toString()),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://tnurbanepay.tn.gov.in/PT_DirectViewPaymentDet.aspx',
        'Cookie': cookies, 'Origin': 'https://tnurbanepay.tn.gov.in',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Upgrade-Insecure-Requests': '1'
      }
    };
    const rr = https.request(opts2, res => {
      const c = []; res.on('data', d => c.push(d));
      res.on('end', () => {
        const data = Buffer.concat(c).toString('utf8');
        const newCookies = (res.headers['set-cookie'] || []).map(c => c.split(';')[0]);
        const cookieMap = {};
        cookies.split('; ').forEach(c => { const [k, ...v] = c.split('='); if(k) cookieMap[k.trim()] = v.join('='); });
        newCookies.forEach(c => { const [k, ...v] = c.split('='); if(k) cookieMap[k.trim()] = v.join('='); });
        const merged = Object.entries(cookieMap).map(([k,v])=>`${k}=${v}`).join('; ');
        console.log('Print POST status:', res.statusCode, 'location:', res.headers.location);
        resolve({ data, merged });
      });
    });
    rr.on('error', reject); rr.write(p2.toString()); rr.end();
  });

  // Save misc page locally
  fs.writeFileSync('misc_page.html', printResult.data);
  console.log('Saved misc_page.html (' + printResult.data.length + ' bytes)');

  // GET MiscReceipt
  const r4 = await req('GET', '/MiscReceipt.aspx', null, {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': 'https://tnurbanepay.tn.gov.in/PT_DirectViewPaymentDet.aspx',
    'Cookie': printResult.merged, 'Upgrade-Insecure-Requests': '1'
  });
  const miscVS = ef(r4.data, '__VIEWSTATE');
  const miscVSG = ef(r4.data, '__VIEWSTATEGENERATOR') || 'B2733501';
  const miscEV = ef(r4.data, '__EVENTVALIDATION');
  console.log('MiscReceipt GET:', r4.status, 'len:', r4.data.length, 'VS:', miscVS.length, 'EV:', miscEV.length);

  // AJAX trigger
  const p3 = new URLSearchParams();
  p3.set('ctl00$ctl15', 'ctl00$ctl15|ctl00$PageContent$ServiceRequestReceipt$ctl09$Reserved_AsyncLoadTarget');
  p3.set('__EVENTTARGET', 'ctl00$PageContent$ServiceRequestReceipt$ctl09$Reserved_AsyncLoadTarget');
  p3.set('__EVENTARGUMENT', '');
  p3.set('__VIEWSTATE', miscVS); p3.set('__VIEWSTATEGENERATOR', miscVSG);
  p3.set('__VIEWSTATEENCRYPTED', ''); p3.set('__EVENTVALIDATION', miscEV);
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl03$ctl00', '');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl03$ctl01', '');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl10', 'ltr');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl11', 'standards');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$AsyncWait$HiddenCancelField', 'False');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ToggleParam$store', '');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ToggleParam$collapse', 'false');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl05$ctl00$CurrentPage', '');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl05$ctl03$ctl00', '');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl08$ClientClickedId', '');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl07$store', '');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl07$collapse', 'false');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl09$VisibilityState$ctl00', 'None');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl09$ScrollPosition', '');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl09$ReportControl$ctl02', '');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl09$ReportControl$ctl03', '');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl09$ReportControl$ctl04', '100');
  p3.set('__ASYNCPOST', 'true');

  const r5 = await req('POST', '/MiscReceipt.aspx', p3.toString(), {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-MicrosoftAjax': 'Delta=true', 'X-Requested-With': 'XMLHttpRequest', 'Accept': '*/*',
    'Referer': 'https://tnurbanepay.tn.gov.in/MiscReceipt.aspx',
    'Cookie': printResult.merged, 'Origin': 'https://tnurbanepay.tn.gov.in',
    'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin'
  });
  console.log('\n=== AJAX RESPONSE ===');
  console.log('Status:', r5.status, 'Length:', r5.data.length);
  console.log('Full response:', JSON.stringify(r5.data));
  fs.writeFileSync('ajax_response.txt', r5.data);
  console.log('\nSaved ajax_response.txt');
}

main().catch(console.error);