const puppeteer = require('puppeteer-core');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = 'D:\\dshwork\\pubg测距\\capture\\raw';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36');
  const seen = [];
  page.on('response', async (res) => {
    const u = res.url();
    if (!/pubg\.plus/.test(u)) return;
    const ct = res.headers()['content-type'] || '';
    if (!/json/.test(ct)) return;
    try {
      const body = await res.text();
      const name = u.replace(/https?:\/\/[^/]+\//, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
      fs.writeFileSync(`${OUT}\\${seen.length}_${name}.json`, body);
      seen.push({ u, len: body.length });
      console.log('JSON', res.status(), body.length, u);
    } catch (e) { }
  });

  await page.goto('https://pubg.plus/zh-CN/map', { waitUntil: 'networkidle2', timeout: 90000 }).catch(e => console.log('goto', e.message));
  await new Promise(r => setTimeout(r, 8000));
  console.log('title:', await page.title());
  console.log('bodyLen:', (await page.content()).length);
  await page.screenshot({ path: 'D:\\dshwork\\pubg测距\\capture\\shot1.png' });
  fs.writeFileSync('D:\\dshwork\\pubg测距\\capture\\seen.json', JSON.stringify(seen, null, 2));
  await browser.close();
})();
