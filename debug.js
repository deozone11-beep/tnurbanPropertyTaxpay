// Run this on YOUR machine: node debug.js
// It will show the raw AJAX response so we know exact format
const https = require('https');

function req(method, path, postData, headers) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'tnurbanepay.tn.gov.in', port: 443, path, method,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept-Language': 'en-US,en;q=0.9', ...headers }
    };
    if (postData) options.headers['Content-Length'] = Buffer.byteLength(postData);
    const r = https.request(options, res => {
      const c = []; res.on('data', d => c.push(d));
      res.on('end', () => resolve({ data: Buffer.concat(c).toString('utf8'), headers: res.headers, status: res.statusCode }));
    });
    r.on('error', reject);
    if (postData) r.write(postData);
    r.end();
  });
}

function ef(html, id) {
  const m = html.match(new RegExp(`id=["']${id}["'][^>]*value=["']([^"']*)["']`, 'i'));
  return m ? m[1] : '';
}

async function main() {
  const g = await req('GET', '/PT_CPPaymentDetails.aspx', null, {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'none', 'Upgrade-Insecure-Requests': '1'
  });
  const cookies = (g.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  const vs = ef(g.data, '__VIEWSTATE'), vsg = ef(g.data, '__VIEWSTATEGENERATOR') || 'A4D7941B', ev = ef(g.data, '__EVENTVALIDATION');
  console.log('GET OK. VS:', vs.length, 'EV:', ev.length, 'Cookie:', cookies.substring(0,40));

  const p = new URLSearchParams();
  ['ctl00$ctl31=ctl00$PageContent$UpdatePanel4|ctl00$PageContent$btnGetDetails',
   'ctl00$alert_msg=', 'ctl00$PageContent$hdnref=', 'ctl00$PageContent$totamt_value=',
   'ctl00$PageContent$HdPropertyTypeID=', 'ctl00$PageContent$rdbulb=0',
   'ctl00$PageContent$txtRefNumber=082/001/900540', 'ctl00$PageContent$txt_OldNo=',
   'ctl00$PageContent$TextBox1=', 'ctl00$PageContent$txt_RemittersName=',
   'ctl00$PageContent$txtTransactionAmount=', '__EVENTTARGET=', '__EVENTARGUMENT=', '__LASTFOCUS=',
   '__VIEWSTATEGENERATOR=' + vsg, '__VIEWSTATEENCRYPTED=', '__ASYNCPOST=true',
   'ctl00$PageContent$btnGetDetails=Search'].forEach(s => { const [k,v]=[s.substring(0,s.indexOf('=')),s.substring(s.indexOf('=')+1)]; p.set(k,v); });
  p.set('__VIEWSTATE', vs); p.set('__EVENTVALIDATION', ev);

  const s = await req('POST', '/PT_CPPaymentDetails.aspx', p.toString(), {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-MicrosoftAjax': 'Delta=true', 'X-Requested-With': 'XMLHttpRequest',
    'Origin': 'https://tnurbanepay.tn.gov.in', 'Referer': 'https://tnurbanepay.tn.gov.in/PT_CPPaymentDetails.aspx',
    'Cookie': cookies, 'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin', 'Accept': '*/*'
  });
  console.log('\nSearch status:', s.status, 'len:', s.data.length);

  // Save full response to file for inspection
  require('fs').writeFileSync('/tmp/ajax_response.txt', s.data);
  console.log('\nFull response saved to /tmp/ajax_response.txt');

  // Show first 3000 chars
  console.log('\n=== FIRST 3000 chars ===');
  console.log(JSON.stringify(s.data.substring(0, 3000)));

  // Find key fields
  const hdnref = (s.data.match(/PageContent_hdnref[^>]*value="([^"]*)"/i) || ['',''])[1];
  const hfNames = [...s.data.matchAll(/\|hiddenField\|([^|]+)\|/g)].map(m=>m[1]);
  console.log('\nhdnref:', hdnref);
  console.log('hiddenField names:', hfNames);
}
main().catch(console.error);
