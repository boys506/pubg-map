const puppeteer = require('puppeteer-core');
const fs = require('fs');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36');
  page.on('request', req => {
    if (req.url().includes('apiv1.pubg.plus')) {
      console.log('REQ', req.method(), req.url());
      console.log('  headers:', JSON.stringify(req.headers()));
    }
  });
  await page.goto('https://pubg.plus/zh-CN/map', { waitUntil: 'networkidle2', timeout: 90000 }).catch(e => console.log('goto', e.message));
  await new Promise(r => setTimeout(r, 6000));

  const res = await page.evaluate(async () => {
    const out = {};
    for (const t of ['0', '_secretRooms']) {
      try {
        const r = await fetch('https://apiv1.pubg.plus/map/points?map=Erangel&type=' + t, { credentials: 'include' });
        const txt = await r.text();
        out[t] = { status: r.status, head: txt.slice(0, 300), len: txt.length };
      } catch (e) { out[t] = { err: String(e) }; }
    }
    return out;
  });
  console.log(JSON.stringify(res, null, 2));
  await browser.close();
})();
