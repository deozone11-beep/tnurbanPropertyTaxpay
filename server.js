const http = require('http');
const https = require('https');
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${PORT}`;

const sessionStore = {};

function makeRequest(method, path, postData, headers, rawResponse = false) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'tnurbanepay.tn.gov.in',
      port: 443,
      path,
      method,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        ...headers
      }
    };

    if (postData)
      options.headers['Content-Length'] = Buffer.byteLength(postData);

    const req = https.request(options, res => {
      const chunks = [];

      res.on('data', c => chunks.push(c));

      res.on('end', async () => {
        const buffer = Buffer.concat(chunks);

        // AUTO FOLLOW REDIRECTS
        if (
          [301, 302, 303, 307, 308].includes(res.statusCode) &&
          res.headers.location
        ) {
          try {
            const redirectResult = await makeRequest(
              'GET',
              res.headers.location,
              null,
              headers,
              rawResponse
            );
            return resolve(redirectResult);
          } catch (e) {
            return reject(e);
          }
        }

        resolve({
          data: rawResponse ? buffer : buffer.toString('utf8'),
          headers: res.headers,
          status: res.statusCode
        });
      });
    });

    req.on('error', reject);

    if (postData) req.write(postData);

    req.end();
  });
}

function ef(html, id) {
  for (const pat of [
    new RegExp(`id=["']${id}["'][^>]*value=["']([^"']*)["']`, 'i'),
    new RegExp(`name=["']${id}["'][^>]*value=["']([^"']*)["']`, 'i'),
  ]) { const m = html.match(pat); if (m) return m[1]; }
  return '';
}
function es(html, id) {
  const m = html.match(new RegExp(`id=["']${id}["'][^>]*>([^<]*)`, 'i'));
  return m ? m[1].trim() : '';
}

function parseAjaxFields(ajax) {
  const segments = [];
  const re = /(\d+)\|(hiddenField|updatePanel|scriptBlock|pageTitle|asyncPostBackControlIDs|postBackControlIDs|updatePanelIDs|asyncPostBackTimeout|formAction|focus|pageRedirect|error)\|([^|]*)\|/g;
  let m;
  while ((m = re.exec(ajax)) !== null) {
    const len = parseInt(m[1]);
    const type = m[2];
    const id = m[3];
    const contentStart = m.index + m[0].length;
    segments.push({ type, id, content: ajax.substring(contentStart, contentStart + len) });
  }
  const fields = {};
  segments.forEach(s => { if (s.type === 'hiddenField') fields[s.id] = s.content; });
  return { segments, fields };
}

async function getSession() {
  const r = await makeRequest('GET', '/PT_CPPaymentDetails.aspx', null, {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none', 'Upgrade-Insecure-Requests': '1'
  });
  const setCookie = r.headers['set-cookie'] || [];
  const cookieStr = setCookie.map(c => c.split(';')[0]).join('; ');
  const sessionId = (cookieStr.match(/ASP\.NET_SessionId=([^;]+)/) || [])[1] || '';
  const antiXsrf  = (cookieStr.match(/__AntiXsrfToken=([^;]+)/)   || [])[1] || '';
  return {
    sessionId, antiXsrf, cookieStr,
    viewstate:       ef(r.data, '__VIEWSTATE'),
    viewstateGen:    ef(r.data, '__VIEWSTATEGENERATOR') || 'A4D7941B',
    eventValidation: ef(r.data, '__EVENTVALIDATION'),
  };
}

async function postSearch(ref, session) {
  console.log('Search:', ref);
  const p = new URLSearchParams();
  p.set('ctl00$ctl31', 'ctl00$PageContent$UpdatePanel4|ctl00$PageContent$btnGetDetails');
  p.set('ctl00$alert_msg', ''); p.set('ctl00$PageContent$hdnref', '');
  p.set('ctl00$PageContent$totamt_value', ''); p.set('ctl00$PageContent$HdPropertyTypeID', '');
  p.set('ctl00$PageContent$rdbulb', '0'); p.set('ctl00$PageContent$txtRefNumber', ref);
  p.set('ctl00$PageContent$txt_OldNo', ''); p.set('ctl00$PageContent$TextBox1', '');
  p.set('ctl00$PageContent$txt_RemittersName', ''); p.set('ctl00$PageContent$txtTransactionAmount', '');
  p.set('__EVENTTARGET', ''); p.set('__EVENTARGUMENT', ''); p.set('__LASTFOCUS', '');
  p.set('__VIEWSTATE', session.viewstate); p.set('__VIEWSTATEGENERATOR', session.viewstateGen);
  p.set('__VIEWSTATEENCRYPTED', ''); p.set('__EVENTVALIDATION', session.eventValidation);
  p.set('__ASYNCPOST', 'true'); p.set('ctl00$PageContent$btnGetDetails', 'Search');
  const r = await makeRequest('POST', '/PT_CPPaymentDetails.aspx', p.toString(), {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-MicrosoftAjax': 'Delta=true', 'X-Requested-With': 'XMLHttpRequest',
    'Origin': 'https://tnurbanepay.tn.gov.in',
    'Referer': 'https://tnurbanepay.tn.gov.in/PT_CPPaymentDetails.aspx',
    'Cookie': session.cookieStr,
    'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin', 'Accept': '*/*'
  });
  console.log(`Search: status=${r.status} len=${r.data.length}`);
  const { segments, fields } = parseAjaxFields(r.data);
  const htmlContent = segments.filter(s => s.type === 'updatePanel').map(s => s.content).join('\n') + '\n' + r.data;
  const hdnref     = ef(htmlContent, 'PageContent_hdnref');
  const totamt     = ef(htmlContent, 'PageContent_totamt_value');
  const propTypeId = ef(htmlContent, 'PageContent_HdPropertyTypeID') || '1';
  const newVS  = fields['__VIEWSTATE']          || session.viewstate;
  const newVSG = fields['__VIEWSTATEGENERATOR'] || session.viewstateGen;
  const newEV  = fields['__EVENTVALIDATION']    || session.eventValidation;
  console.log(`hdnref="${hdnref}" totamt="${totamt}"`);
  return { html: htmlContent, hdnref, totamt, propTypeId, newVS, newVSG, newEV };
}

async function postSubmit(ref, amount, session, sd) {
  if (!sd.hdnref) throw new Error(`hdnref empty for ${ref}`);
  console.log(`Submit: ref=${ref} amount=${amount}`);
  const p = new URLSearchParams();
  p.set('ctl00$ctl31', 'ctl00$PageContent$UpdatePanel1|ctl00$PageContent$btnSubmit');
  p.set('ctl00$alert_msg', ''); p.set('ctl00$PageContent$hdnref', sd.hdnref);
  p.set('ctl00$PageContent$totamt_value', sd.totamt); p.set('ctl00$PageContent$HdPropertyTypeID', sd.propTypeId);
  p.set('ctl00$PageContent$rdbulb', '0'); p.set('ctl00$PageContent$txtRefNumber', ref);
  p.set('ctl00$PageContent$txt_OldNo', ''); p.set('ctl00$PageContent$TextBox1', '');
  p.set('ctl00$PageContent$txt_RemittersName', ''); p.set('ctl00$PageContent$txtTransactionAmount', String(amount));
  p.set('__EVENTTARGET', ''); p.set('__EVENTARGUMENT', ''); p.set('__LASTFOCUS', '');
  p.set('__VIEWSTATE', sd.newVS); p.set('__VIEWSTATEGENERATOR', sd.newVSG);
  p.set('__VIEWSTATEENCRYPTED', ''); p.set('__EVENTVALIDATION', sd.newEV);
  p.set('__ASYNCPOST', 'true'); p.set('ctl00$PageContent$btnSubmit', 'Submit');
  const r = await makeRequest('POST', '/PT_CPPaymentDetails.aspx', p.toString(), {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-MicrosoftAjax': 'Delta=true', 'X-Requested-With': 'XMLHttpRequest',
    'Origin': 'https://tnurbanepay.tn.gov.in',
    'Referer': 'https://tnurbanepay.tn.gov.in/PT_CPPaymentDetails.aspx',
    'Cookie': session.cookieStr,
    'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin', 'Accept': '*/*'
  });
  console.log(`Submit: status=${r.status} snippet=${r.data.substring(0,150)}`);
  const { segments, fields } = parseAjaxFields(r.data);
  const redirect = segments.find(s => s.type === 'pageRedirect');
  if (redirect) console.log('pageRedirect:', redirect.content);
  return { segments, fields };
}

function parsePageData(html, ref) {
  const payments = [];
  const payTbl = html.match(/<table[^>]*id="PageContent_gvLastPaymentDet"[^>]*>([\s\S]*?)<\/table>/i);
  if (payTbl) {
    (payTbl[1].match(/<tr(?!.*Gridcolor)[^>]*>([\s\S]*?)<\/tr>/gi)||[]).forEach(row => {
      const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi)||[]).map(c=>c.replace(/<[^>]+>/g,'').replace(/&nbsp;/g,'').trim());
      if (cells.length >= 8 && cells[1]) payments.push({ sno:cells[0], receipt:cells[1], assessmentNo:cells[2], oldAssessmentNo:cells[3], receiptDate:cells[4], amount:cells[5], usage:cells[6], status:cells[7] });
    });
  }
  const sp = id => es(html, id);
  const a = {
    assessmentNo:sp('PageContent_alblAssesmentnoText'), oldAssessmentNo:sp('PageContent_alblOldAssesmentnoText'),
    ownerName:sp('PageContent_alblOwner'), ownerNameTamil:sp('PageContent_alblOwnerintamil'),
    doorNo:sp('PageContent_alblDoorNo'), street:sp('PageContent_alblStreet1'),
    city:sp('PageContent_alborganization'), pincode:sp('PageContent_alblPincode'),
    doorNoTamil:sp('PageContent_alblDoorNot'), streetTamil:sp('PageContent_alblStreet1ll'),
    cityTamil:sp('PageContent_alborganizationLL'), pincodeTamil:sp('PageContent_alblPincodell'),
    assessmentType:sp('PageContent_lblasstype'), zone:sp('PageContent_lblZoneText'),
    ward:sp('PageContent_lblWardText'), annualRentalValue:sp('PageContent_albl_netannualvalue'),
    halfYearlyTax:sp('PageContent_albl_halfyeartax'), assessmentStatus:sp('PageContent_lblflag'),
    usage:sp('PageContent_lblusage'), totalAreaSqft:sp('PageContent_Label21'),
  };
  const dues = []; let dueTotal = {};
  const dueTbl = html.match(/<table[^>]*id="PageContent_gvpayment"[^>]*>([\s\S]*?)<\/table>/i);
  if (dueTbl) {
    (dueTbl[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)||[]).forEach(row => {
      if (row.includes('Gridcolor')) return;
      const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi)||[]).map(c=>c.replace(/<[^>]+>/g,'').replace(/&nbsp;/g,'').trim());
      if (cells.length >= 12 && cells[1] && cells[1] !== 'Total')
        dues.push({sno:cells[0],period:cells[1],taxDemand:cells[2],penaltyDemand:cells[3],taxCollected:cells[4],penaltyCollected:cells[5],taxBalance:cells[6],balancePenalty:cells[7],totalBalance:cells[8],delayPenalty:cells[9],incentive:cells[10],cumulativeBalance:cells[11]});
      else if (cells[1]==='Total') dueTotal={taxDemand:cells[2],penaltyDemand:cells[3],taxCollected:cells[4],penaltyCollected:cells[5],taxBalance:cells[6],balancePenalty:cells[7],totalBalance:cells[8]};
    });
  }
  return {
    ref, found: a.ownerName !== '' || payments.length > 0,
    payments, assessee:a, dues, dueTotal,
    balanceAmt:sp('PageContent_lbl_balanceamt_view'),
    advanceAmt:sp('PageContent_lbl_advanceamt_view'),
    payableAmt:sp('PageContent_lblpayamt'),
  };
}

// ── Rewrite HTML to proxy through localhost ───────────────────────────────────
function rewriteHtml(html, token) {
  // 1. Add base tag for relative assets
  html = html.replace(/(<head[^>]*>)/i, '$1<base href="https://tnurbanepay.tn.gov.in/">');

  // 2. Proxy captcha image — replace CaptchaImage.aspx src with our /proxy-img
  //    Match both relative and absolute captcha src
  html = html.replace(
    /src=["']([^"']*CaptchaImage\.aspx[^"']*)["']/gi,
    `src="http://localhost:${PORT}/proxy-img?token=${token}&path=$1"`
  );

  // 3. Rewrite form action → our bridge-confirm
  html = html.replace(
    /(<form[^>]*(?:id=["']form1["']|method=["']post["'])[^>]*action=["'])[^"']*["']/gi,
    `$1http://localhost:${PORT}/bridge-confirm?token=${token}"`
  );

  return html;
}


// ── /view-history ─────────────────────────────────────────────────────────────
async function handleViewHistory(body, res) {
  let ref;
  try { ref = JSON.parse(body).ref; } catch(e) { res.writeHead(400); res.end(JSON.stringify({error:'Bad JSON'})); return; }
  console.log(`\n=== VIEW-HISTORY: ref=${ref} ===`);
  const session = await getSession();
  const p = new URLSearchParams();
  p.set('ctl00$ctl31','ctl00$PageContent$UpdatePanel4|ctl00$PageContent$btnViewPaymentHis');
  p.set('ctl00$alert_msg',''); p.set('ctl00$PageContent$hdnref','');
  p.set('ctl00$PageContent$totamt_value',''); p.set('ctl00$PageContent$HdPropertyTypeID','');
  p.set('ctl00$PageContent$rdbulb','0'); p.set('ctl00$PageContent$txtRefNumber',ref);
  p.set('ctl00$PageContent$txt_OldNo',''); p.set('ctl00$PageContent$TextBox1','');
  p.set('ctl00$PageContent$txt_RemittersName',''); p.set('ctl00$PageContent$txtTransactionAmount','');
  p.set('__EVENTTARGET',''); p.set('__EVENTARGUMENT',''); p.set('__LASTFOCUS','');
  p.set('__VIEWSTATE',session.viewstate); p.set('__VIEWSTATEGENERATOR',session.viewstateGen);
  p.set('__VIEWSTATEENCRYPTED',''); p.set('__EVENTVALIDATION',session.eventValidation);
  p.set('__ASYNCPOST','true'); p.set('ctl00$PageContent$btnViewPaymentHis','View Payment History');
  const r1 = await makeRequest('POST','/PT_CPPaymentDetails.aspx',p.toString(),{
    'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8',
    'X-MicrosoftAjax':'Delta=true','X-Requested-With':'XMLHttpRequest',
    'Origin':'https://tnurbanepay.tn.gov.in',
    'Referer':'https://tnurbanepay.tn.gov.in/PT_CPPaymentDetails.aspx',
    'Cookie':session.cookieStr,'Accept':'*/*'
  });
  const {segments} = parseAjaxFields(r1.data);
  const rSeg = segments.find(s=>s.type==='pageRedirect');
  const rPath = rSeg ? rSeg.content : '/PT_DirectViewPaymentDet.aspx';
  const r2 = await makeRequest('GET',rPath,null,{
    'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer':'https://tnurbanepay.tn.gov.in/PT_CPPaymentDetails.aspx',
    'Cookie':session.cookieStr,
    'Sec-Fetch-Dest':'document','Sec-Fetch-Mode':'navigate',
    'Sec-Fetch-Site':'same-origin','Upgrade-Insecure-Requests':'1'
  });
  const html = r2.data;
  const owner    =(html.match(/id="PageContent_alblOwner"[^>]*>([^<]*)/i)||['',''])[1].trim();
  const assessNo =(html.match(/id="PageContent_alblAssesmentnoText"[^>]*>([^<]*)/i)||['',''])[1].trim();
  const oldNo    =(html.match(/id="PageContent_alblOldAssesmentnoText"[^>]*>([^<]*)/i)||['',''])[1].trim();
  const ownerTml =(html.match(/id="PageContent_alblOwnerintamil"[^>]*>([^<]*)/i)||['',''])[1].trim();
  const org      =(html.match(/id="PageContent_lblorg"[^>]*>([^<]*)/i)||['',''])[1].trim();
  const doorNo   =(html.match(/id="PageContent_alblDoorNo"[^>]*>([^<]*)/i)||['',''])[1].trim();
  const street   =(html.match(/id="PageContent_alblStreet1"[^>]*>([^<]*)/i)||['',''])[1].trim();
  const pincode  =(html.match(/id="PageContent_alblPincode"[^>]*>([^<]*)/i)||['',''])[1].trim();
  const vs  = ef(html,'__VIEWSTATE');
  const vsg = ef(html,'__VIEWSTATEGENERATOR')||'ED1BAC93';
  const ev  = ef(html,'__EVENTVALIDATION');
  const payments = [];
  const tbl = html.match(/<table[^>]*id="PageContent_gdvpaymenthistory"[^>]*>([\s\S]*?)<\/table>/i);
  if (tbl) {
    (tbl[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)||[]).forEach(row=>{
      if (row.includes('Gridcolor')) return;
      const receipt=(row.match(/lblServiceRequestNo[^>]*>([^<]+)/i)||['',''])[1].trim();
      const date   =(row.match(/lblLastPaidDate[^>]*>([^<]+)/i)||['',''])[1].trim();
      const amount =(row.match(/lblLastPaidAmount[^>]*>([^<]+)/i)||['',''])[1].trim();
      const status =(row.match(/lblLastStatus[^>]*>([^<]+)/i)||['',''])[1].trim();
      const btnName=(row.match(/name="([^"]*gdvpaymenthistory[^"]*btnprint[^"]*)"/i)||['',''])[1].trim();
      if (receipt) payments.push({receipt,date,amount,status,btnName});
    });
  }
  const token = Date.now().toString(36)+Math.random().toString(36).slice(2);
  sessionStore[token] = {cookieStr:session.cookieStr, ref, created:Date.now(), vs, vsg, ev};
  const now = Date.now();
  Object.keys(sessionStore).forEach(k=>{if(now-sessionStore[k].created>600000)delete sessionStore[k];});
  console.log(`History: owner="${owner}" payments=${payments.length}`);
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify({success:true,token,ref,org,assessNo,oldNo,owner,ownerTml,doorNo,street,pincode,payments}));
}

// ── /print-receipt ────────────────────────────────────────────────────────────
async function handlePrintReceipt(token, btnName, receipt, res) {
  const sess = sessionStore[token];
  if (!sess) { res.writeHead(400,'text/html'); res.end('<h2>Session expired.</h2>'); return; }
  console.log(`\n=== PRINT: btn=${btnName} ===`);

  // Step 1: POST print button → lands on MiscReceipt page
  const p1 = new URLSearchParams();
  p1.set('__EVENTTARGET',''); p1.set('__EVENTARGUMENT','');
  p1.set('__VIEWSTATE',sess.vs); p1.set('__VIEWSTATEGENERATOR',sess.vsg);
  p1.set('__VIEWSTATEENCRYPTED',''); p1.set('__EVENTVALIDATION',sess.ev);
  p1.set('ctl00$alert_msg',''); p1.set(btnName,'Print');

  // Use https directly to capture Set-Cookie from MiscReceipt page
  const https = require('https');
  const postData = p1.toString();

  const miscResult = await new Promise((resolve,reject)=>{
    const opts = {
      hostname:'tnurbanepay.tn.gov.in', port:443,
      path:'/PT_DirectViewPaymentDet.aspx', method:'POST',
      headers:{
        'Content-Type':'application/x-www-form-urlencoded',
        'Content-Length':Buffer.byteLength(postData),
        'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer':'https://tnurbanepay.tn.gov.in/PT_DirectViewPaymentDet.aspx',
        'Cookie':sess.cookieStr, 'Origin':'https://tnurbanepay.tn.gov.in',
        'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Sec-Fetch-Dest':'document','Sec-Fetch-Mode':'navigate',
        'Sec-Fetch-Site':'same-origin','Upgrade-Insecure-Requests':'1'
      }
    };
    const req2 = https.request(opts, r=>{
      const chunks=[];
      r.on('data',c=>chunks.push(c));
      r.on('end',()=>{
        const data = Buffer.concat(chunks).toString('utf8');
        // Merge new cookies with session cookies
        const newCookies = (r.headers['set-cookie']||[]).map(c=>c.split(';')[0]);
        const cookieMap = {};
        sess.cookieStr.split('; ').forEach(c=>{const[k,v]=c.split('=');if(k)cookieMap[k.trim()]=v||'';});
        newCookies.forEach(c=>{const[k,...vp]=c.split('=');if(k)cookieMap[k.trim()]=vp.join('=');});
        const mergedCookies = Object.entries(cookieMap).map(([k,v])=>`${k}=${v}`).join('; ');
        console.log(`Step1 POST: status=${r.statusCode} hasMisc=${data.includes('MiscReceipt')} newCookies=${newCookies.length}`);
        resolve({data, mergedCookies, status:r.statusCode, location:r.headers.location});
      });
    });
    req2.on('error',reject);
    req2.write(postData); req2.end();
  });

  // Step 2: GET MiscReceipt with merged cookies
  const r2 = await makeRequest('GET','/MiscReceipt.aspx',null,{
    'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer':'https://tnurbanepay.tn.gov.in/PT_DirectViewPaymentDet.aspx',
    'Cookie':miscResult.mergedCookies,
    'Sec-Fetch-Dest':'document','Sec-Fetch-Mode':'navigate',
    'Sec-Fetch-Site':'same-origin','Upgrade-Insecure-Requests':'1'
  });
  console.log(`Step2 GET MiscReceipt: status=${r2.status} len=${r2.data.length}`);


  const miscHtml = r2.data;
  console.log(
  'Has ReportViewer:',
  miscHtml.includes('Reserved.ReportViewerWebControl')
);

console.log(
  'Has AsyncLoadTarget:',
  miscHtml.includes('Reserved_AsyncLoadTarget')
);

console.log(
  'Has SERVICE REQUEST RECEIPT:',
  miscHtml.includes('SERVICE REQUEST RECEIPT')
);
  const miscVS  = ef(miscHtml,'__VIEWSTATE');
  const miscVSG = ef(miscHtml,'__VIEWSTATEGENERATOR')||'B2733501';
  const miscEV  = ef(miscHtml,'__EVENTVALIDATION');
  console.log(`MiscReceipt VS=${miscVS.length} EV=${miscEV.length}`);

const controlMatch =
  miscHtml.match(/ControlID=([A-Za-z0-9]+)/i) ||
  miscHtml.match(/ControlID":"([A-Za-z0-9]+)"/i) ||
  miscHtml.match(/ControlID\\u003d([A-Za-z0-9]+)/i);

const controlId = controlMatch ? controlMatch[1] : '';

console.log('ControlID:', controlId);

const rsMatch =
  miscHtml.match(/ReportSession=([^&"]+)/i);

const reportSession = rsMatch
  ? rsMatch[1]
      .replace(/\\u0026.*$/, '')
      .trim()
  : '';

console.log('ReportSession Extracted:', reportSession);

if (!reportSession) {
  throw new Error('ReportSession not found');
}
const rcMatch = miscHtml.match(/ControlID=([^&"]+)/i);

console.log(
  'ReportSession:',
  rsMatch ? rsMatch[1] : 'NOT FOUND'
);

console.log(
  'ControlID URL:',
  rcMatch ? rcMatch[1] : 'NOT FOUND'
);

const exportUrl =
`/Reserved.ReportViewerWebControl.axd?` +
`ReportSession=${reportSession}` +
`&Culture=16393` +
`&CultureOverrides=True` +
`&UICulture=1033` +
`&UICultureOverrides=True` +
`&ReportStack=1` +
`&ControlID=${controlId}` +
`&OpType=Export` +
`&FileName=CPHalfYearlyPTServiceRequestReceipt` +
`&ContentDisposition=OnlyHtmlInline` +
`&Format=HTML4.0`;

console.log("EXPORT URL:", exportUrl);

const exportResp = await makeRequest(
  'GET',
  exportUrl,
  null,
  {
    Cookie: miscResult.mergedCookies,
    Referer: 'https://tnurbanepay.tn.gov.in/MiscReceipt.aspx'
  }
);
console.log("EXPORT STATUS:", exportResp.status);
console.log("EXPORT LEN:", exportResp.data.length);

res.writeHead(200, {
  'Content-Type': 'text/html; charset=utf-8'
});


let receiptHtml = exportResp.data;

receiptHtml = receiptHtml.replace(
  /<body[^>]*>/i,
  `<body style="
      margin:0;
      display:flex;
      justify-content:center;
      background:#f0f0f0;
      padding:20px;
  ">`
);

res.end(`
<html>
<head>
<style>
*{
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
 
body{
  margin:0;
  text-align:center;
  font-family: Arial, sans-serif;
}
 
#toolbar{
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 14px 20px;
  background: #fff;
  border-top: 2px solid #e0e0e0;
  display: flex;
  justify-content: center;
  gap: 14px;
  box-shadow: 0 -4px 16px rgba(0,0,0,0.10);
  z-index: 9999;
}
 
#toolbar button {
  padding: 10px 28px;
  border: none;
  border-radius: 25px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: transform 0.1s, box-shadow 0.1s;
  box-shadow: 0 3px 8px rgba(0,0,0,0.15);
  letter-spacing: 0.3px;
}
 
#toolbar button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0,0,0,0.18);
}
 
#toolbar button:active {
  transform: translateY(0px);
}
 
#btn-print {
  background: linear-gradient(135deg, #1565c0, #1976d2);
  color: #fff;
}
 
#btn-close {
  background: linear-gradient(135deg, #e53935, #ef5350);
  color: #fff;
}
 
#btn-pdf {
  background: linear-gradient(135deg, #2e7d32, #43a047);
  color: #fff;
}
 
@media print{
  #toolbar{ display:none; }
  body{ padding-bottom: 0; }
}
</style>
</head>
<body>
 
${exportResp.data}
 
<div id="toolbar">
  <button id="btn-print" onclick="window.print()">🖨️ Print</button>
  <button id="btn-pdf"   onclick="savePdf()">📄 Save PDF</button>
  <button id="btn-close" onclick="window.close()">✖ Close</button>
</div>
<script>
function savePdf() {
  document.title = "${(receipt||'Receipt').replace(/[^a-zA-Z0-9_\-]/g,'-')}";
  window.print();
}
</script>
</body>
</html>
`);
return;

console.log(
  exportResp.data.substring(0,1000)
);

if (controlId) {
  const keepAlive = await makeRequest(
    'POST',
    `/Reserved.ReportViewerWebControl.axd?OpType=SessionKeepAlive&ControlID=${controlId}`,
    '',
    {
      Cookie: miscResult.mergedCookies,
      Referer: 'https://tnurbanepay.tn.gov.in/MiscReceipt.aspx',
      Origin: 'https://tnurbanepay.tn.gov.in',
      'X-Requested-With': 'XMLHttpRequest'
    }
  );

  console.log(
    'KeepAlive:',
    keepAlive.status,
    typeof keepAlive.data === 'string'
      ? keepAlive.data.substring(0, 200)
      : keepAlive.data.length
  );
}





  // Step 3: AJAX trigger with MiscReceipt cookies
  const p3 = new URLSearchParams();
  p3.set('ctl00$ctl15','ctl00$ctl15|ctl00$PageContent$ServiceRequestReceipt$ctl09$Reserved_AsyncLoadTarget');
  p3.set('__EVENTTARGET','ctl00$PageContent$ServiceRequestReceipt$ctl09$Reserved_AsyncLoadTarget');
  p3.set('__EVENTARGUMENT','');
  p3.set('__VIEWSTATE',miscVS); p3.set('__VIEWSTATEGENERATOR',miscVSG);
  p3.set('__VIEWSTATEENCRYPTED',''); p3.set('__EVENTVALIDATION',miscEV);
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl03$ctl00','');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl03$ctl01','');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl10','ltr');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl11','standards');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$AsyncWait$HiddenCancelField','False');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ToggleParam$store','');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ToggleParam$collapse','false');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl05$ctl00$CurrentPage','');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl05$ctl03$ctl00','');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl08$ClientClickedId','');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl07$store','');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl07$collapse','false');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl09$VisibilityState$ctl00','None');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl09$ScrollPosition','');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl09$ReportControl$ctl02','');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl09$ReportControl$ctl03','');
  p3.set('ctl00$PageContent$ServiceRequestReceipt$ctl09$ReportControl$ctl04','100');
  p3.set('__ASYNCPOST','true');

  const r3 = await makeRequest('POST','/MiscReceipt.aspx',p3.toString(),{
    'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8',
    'X-MicrosoftAjax':'Delta=true','X-Requested-With':'XMLHttpRequest',
    'Accept':'*/*',
    'Referer':'https://tnurbanepay.tn.gov.in/MiscReceipt.aspx',
    'Cookie':miscResult.mergedCookies,
    'Origin':'https://tnurbanepay.tn.gov.in',
    'Sec-Fetch-Dest':'empty','Sec-Fetch-Mode':'cors',
    'Sec-Fetch-Site':'same-origin','Cache-Control':'no-cache'
  });
  console.log(`Step3 AJAX: status=${r3.status} len=${r3.data.length} hasReceipt=${r3.data.includes('SERVICE REQUEST RECEIPT')}`);
  console.log('AJAX RESPONSE FULL:');
console.log(r3.data);
  // Parse AJAX updatePanel content
  const {segments:ajaxSegs} = parseAjaxFields(r3.data);
let panelHtml = ajaxSegs
  .filter(s => s.type === 'updatePanel')
  .map(s => s.content)
  .join('\n');

if (!panelHtml) {
  panelHtml = miscHtml;
}
  console.log(`Panel content len=${panelHtml.length}`);

  // Build receipt page
  const page = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<base href="https://tnurbanepay.tn.gov.in/">
<title>Service Request Receipt</title>
<style>
  body{font-family:Arial,sans-serif;margin:0;padding:0}
  .bar{background:#1565c0;color:#fff;padding:10px 16px;display:flex;align-items:center;gap:10px;font-size:13px;position:sticky;top:0;z-index:999}
  .bar button{border:none;padding:6px 14px;border-radius:3px;cursor:pointer;font-size:12px;font-weight:bold}
  .pbtn{background:#4caf50;color:#fff}.cbtn{background:#c0392b;color:#fff}
  .content{padding:16px}
  @media print{.bar{display:none!important}.content{padding:0}}
</style>
</head><body>
<div class="bar">
  <span>Service Request Receipt</span>
  <button class="pbtn" onclick="window.print()">Print</button>
  <button class="cbtn" onclick="window.close()">Close</button>
</div>
<div class="content">
${panelHtml || '<p style="color:red;padding:20px">Receipt load aagala. Mara try pannunga.</p>'}
</div>
</body></html>`;

  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  res.end(page);
}

// ── /pay-and-bridge ───────────────────────────────────────────────────────────
async function handlePayAndBridge(body, res) {
  let payload;
  try { payload = JSON.parse(body); } catch(e) { res.writeHead(400); res.end(JSON.stringify({error:'Invalid JSON'})); return; }
  const { ref, amount } = payload;
  if (!ref || !amount) { res.writeHead(400); res.end(JSON.stringify({error:'Need ref and amount'})); return; }

  console.log(`\n=== PAY-AND-BRIDGE: ref=${ref} amount=${amount} ===`);
  const session = await getSession();
  const sd = await postSearch(ref, session);
  if (!sd.hdnref) throw new Error(`Property not found: ${ref}`);
  await postSubmit(ref, amount, session, sd);

  const token = Date.now().toString(36) + Math.random().toString(36).slice(2);
  sessionStore[token] = { sessionId:session.sessionId, antiXsrf:session.antiXsrf, cookieStr:session.cookieStr, ref, amount, created:Date.now() };

  // Cleanup
  const now = Date.now();
  Object.keys(sessionStore).forEach(k => { if (now - sessionStore[k].created > 600000) delete sessionStore[k]; });

  console.log(`✅ token=${token} session=${session.sessionId.substring(0,12)}...`);
  res.writeHead(200, {'Content-Type':'application/json'});
  res.end(JSON.stringify({ success:true, token, bridgeUrl:`${BASE_URL}/bridge?token=${token}` }));
}

// ── /bridge?token ─────────────────────────────────────────────────────────────
async function handleBridge(token, res) {
  const sess = sessionStore[token];
  if (!sess) { res.writeHead(400,'text/html'); res.end('<h2>Session expired. Submit again.</h2>'); return; }

  console.log(`Bridge: fetching ConformationResponce.aspx token=${token}`);
  const r = await makeRequest('GET', '/ConformationResponce.aspx', null, {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': 'https://tnurbanepay.tn.gov.in/PT_CPPaymentDetails.aspx',
    'Cookie': sess.cookieStr,
    'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin', 'Upgrade-Insecure-Requests': '1'
  });
  console.log(`Bridge: status=${r.status} len=${r.data.length}`);

  let html = rewriteHtml(r.data, token);

  // Banner
  html = html.replace(/(<body[^>]*>)/i,
    `$1<div style="background:#1a6fbf;color:#fff;text-align:center;padding:9px 14px;font-size:13px;font-family:Arial;position:sticky;top:0;z-index:9999">
      🔒 Secure Bridge &nbsp;|&nbsp; Ref: <b>${sess.ref}</b> &nbsp;|&nbsp; Amount: <b>₹${sess.amount}</b>
      &nbsp;&nbsp;<small style="opacity:0.8">Captcha enter பண்ணி "I agree" check பண்ணி Confirm பண்ணுங்க</small>
    </div>`);

  res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
  res.end(html);
}

// ── /proxy-img?token=&path= ───────────────────────────────────────────────────
// Fetches captcha image (binary) from govt site using server session, serves to browser
async function handleProxyImg(token, imgPath, res) {
  const sess = sessionStore[token];
  if (!sess) { res.writeHead(400); res.end('Session expired'); return; }

  // imgPath may be relative like /CaptchaImage.aspx?guid=xxx or absolute
  let path = imgPath;
  if (path.startsWith('http')) {
    try { path = new URL(path).pathname + new URL(path).search; } catch(e) {}
  }
  if (!path.startsWith('/')) path = '/' + path;

  console.log(`ProxyImg: fetching ${path} for token=${token}`);
  try {
    const r = await makeRequest('GET', path, null, {
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      'Referer': 'https://tnurbanepay.tn.gov.in/ConformationResponce.aspx',
      'Cookie': sess.cookieStr,
    }, true); // rawResponse=true — get Buffer not string

    const ct = r.headers['content-type'] || 'image/jpeg';
    res.writeHead(200, {'Content-Type': ct, 'Cache-Control': 'no-cache'});
    res.end(r.data);
    console.log(`ProxyImg: served ${r.data.length} bytes ct=${ct}`);
  } catch(e) {
    console.error('ProxyImg error:', e.message);
    res.writeHead(500); res.end('Image fetch failed');
  }
}

// ── /bridge-confirm?token ─────────────────────────────────────────────────────
async function handleBridgeConfirm(token, body, res) {
  const sess = sessionStore[token];
  if (!sess) { res.writeHead(400,'text/html'); res.end('<h2>Session expired. Start again.</h2>'); return; }

  console.log(`BridgeConfirm: POST to ConformationResponce.aspx token=${token}`);
  console.log(`Body: ${body.substring(0,300)}`);

  const r = await makeRequest('POST', '/ConformationResponce.aspx', body, {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Cookie': sess.cookieStr,
    'Referer': 'https://tnurbanepay.tn.gov.in/ConformationResponce.aspx',
    'Origin': 'https://tnurbanepay.tn.gov.in',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin', 'Upgrade-Insecure-Requests': '1'
  });

  console.log(`BridgeConfirm: status=${r.status} len=${r.data.length}`);

  // Redirect → follow
  if ((r.status === 301 || r.status === 302) && r.headers.location) {
    console.log(`BridgeConfirm: redirect → ${r.headers.location}`);
    res.writeHead(302, {'Location': r.headers.location});
    res.end();
    return;
  }

  // Check for DefaultError
  if (r.data.includes('DefaultError') || r.data.includes('could not be processed')) {
    console.log('BridgeConfirm: DefaultError detected — likely wrong captcha');
    // Re-fetch fresh conf page with new captcha
    const freshR = await makeRequest('GET', '/ConformationResponce.aspx', null, {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': 'https://tnurbanepay.tn.gov.in/ConformationResponce.aspx',
      'Cookie': sess.cookieStr,
      'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin', 'Upgrade-Insecure-Requests': '1'
    });
    let html = rewriteHtml(freshR.data, token);
    html = html.replace(/(<body[^>]*>)/i,
      `$1<div style="background:#c0392b;color:#fff;text-align:center;padding:9px;font-size:13px;font-family:Arial">
        ❌ Captcha தப்பு! மறுபடியும் enter பண்ணுங்க | Ref: <b>${sess.ref}</b> | Amount: <b>₹${sess.amount}</b>
      </div>`);
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
    res.end(html);
    return;
  }

  // Success — rewrite and serve
  let html = rewriteHtml(r.data, token);
  html = html.replace(/(<body[^>]*>)/i,
    `$1<div style="background:#27ae60;color:#fff;text-align:center;padding:9px;font-size:13px;font-family:Arial">
      ✅ Confirm successful! Bank payment page வருது...
    </div>`);
  res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
  res.end(html);
}

// ── HTTP SERVER ───────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  let body = '';
  req.on('data', c => body += c);

  // Serve index.html — inject dynamic PROXY URL
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    req.on('end', () => {
      fs.readFile(path.join(__dirname, 'index.html'), 'utf8', (err, data) => {
        if (err) { res.writeHead(404); res.end('index.html not found'); return; }
        data = data.replace("const PROXY = 'http://localhost:3000'", `const PROXY = '${BASE_URL}'`);
        res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
        res.end(data);
      });
    });
    return;
  }

  // Favicon
  if (url.pathname === '/favicon.ico' || url.pathname === '/favicon.png') {
    req.on('end', () => {
      res.writeHead(200, {'Content-Type':'image/png','Cache-Control':'public,max-age=86400'});
      res.end(Buffer.from('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','base64'));
    });
    return;
  }

  // Serve logo.png
  if (req.method === 'GET' && url.pathname === '/logo.png') {
    req.on('end', () => {
      fs.readFile(path.join(__dirname, 'logo.png'), (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, {'Content-Type': 'image/png'});
        res.end(data);
      });
    });
    return;
  }

  // /fetch-property
  if (req.method === 'POST' && url.pathname === '/fetch-property') {
    req.on('end', async () => {
      let ref;
      try { ref = JSON.parse(body).ref; } catch(e) { res.writeHead(400); res.end(JSON.stringify({error:'Bad JSON'})); return; }
      try {
        const session = await getSession();
        const sd = await postSearch(ref, session);
        const result = parsePageData(sd.html, ref);
        result._formData = { hdnref:sd.hdnref, totamt:sd.totamt, propTypeId:sd.propTypeId, viewstate:sd.newVS, viewstateGen:sd.newVSG, eventValidation:sd.newEV, sessionId:session.sessionId, antiXsrf:session.antiXsrf, cookieStr:session.cookieStr };
        console.log(`✓ Owner:"${result.assessee.ownerName}" hdnref:${sd.hdnref}`);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify(result));
      } catch(e) { console.error(e.message); res.writeHead(500); res.end(JSON.stringify({error:e.message})); }
    });

  // /pay-and-bridge
  } else if (req.method === 'POST' && url.pathname === '/pay-and-bridge') {
    req.on('end', async () => {
      try { await handlePayAndBridge(body, res); }
      catch(e) { console.error(e.message); res.writeHead(500,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:e.message})); }
    });

  // /bridge?token=
  } else if (req.method === 'GET' && url.pathname === '/bridge') {
    req.on('end', async () => {
      try { await handleBridge(url.searchParams.get('token'), res); }
      catch(e) { console.error(e.message); res.writeHead(500,'text/html'); res.end(`<h2>Error: ${e.message}</h2>`); }
    });

  // /proxy-img?token=&path=   ← NEW: captcha image proxy
  } else if (req.method === 'GET' && url.pathname === '/proxy-img') {
    req.on('end', async () => {
      const token = url.searchParams.get('token');
      const imgPath = url.searchParams.get('path') || '';
      try { await handleProxyImg(token, imgPath, res); }
      catch(e) { console.error(e.message); res.writeHead(500); res.end('img error'); }
    });

  // /bridge-confirm?token=
  } else if (req.method === 'POST' && url.pathname === '/bridge-confirm') {
    req.on('end', async () => {
      try { await handleBridgeConfirm(url.searchParams.get('token'), body, res); }
      catch(e) { console.error(e.message); res.writeHead(500,'text/html'); res.end(`<h2>Error: ${e.message}</h2>`); }
    });

  // /view-history
  } else if (req.method === 'POST' && url.pathname === '/view-history') {
    req.on('end', async () => {
      try { await handleViewHistory(body, res); }
      catch(e) { console.error(e.message); res.writeHead(500); res.end(JSON.stringify({error:e.message})); }
    });

  // /print-receipt?token=&btn=
  } else if (req.method === 'GET' && url.pathname === '/print-receipt') {
    req.on('end', async () => {
      const token   = url.searchParams.get('token');
      const btn     = url.searchParams.get('btn') || '';
      const receipt = decodeURIComponent(url.searchParams.get('receipt') || '');
      try { await handlePrintReceipt(token, btn, receipt, res); }
      catch(e) { console.error(e.message); res.writeHead(500,'text/html'); res.end('<h2>'+e.message+'</h2>'); }
    });

  // /health
  } else if (req.method === 'GET' && url.pathname === '/health') {
    req.on('end', () => { res.writeHead(200); res.end(JSON.stringify({status:'ok',sessions:Object.keys(sessionStore).length})); });

  } else {
    req.on('end', () => { res.writeHead(404); res.end(JSON.stringify({error:'Unknown endpoint'})); });
  }
});

server.listen(PORT, () => {
  console.log(`\n✅ TN Property Tax Proxy → ${BASE_URL}`);
  console.log(`  POST /fetch-property`);
  console.log(`  POST /pay-and-bridge   ← search+submit+token`);
  console.log(`  GET  /bridge?token=    ← conf page with proxied captcha`);
  console.log(`  GET  /proxy-img?token=&path=  ← captcha image proxy`);
  console.log(`  POST /bridge-confirm?token=   ← proxy confirm POST`);
});