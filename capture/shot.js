const puppeteer = require('puppeteer-core');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = 'D:\\dshwork\\pubg测距\\shots';
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', e => console.log('PAGEERR:', e.message));
  await page.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  await page.evaluate(() => {
    const s = window.__app.state;
    s.cx = 0.42; s.cy = 0.55; s.zoom = 3.2;
    window.__app.draw();
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: OUT + '\\01-map.png' });

  // 进入测距模式并标点
  await page.evaluate(() => {
    document.getElementById('btn-mode').click();
    const s = window.__app.state;
    s.measure = [{ x: 0.40, y: 0.50 }, { x: 0.4575, y: 0.50 }];
    window.__app.sync();
    window.__app.draw();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: OUT + '\\02-measure.png' });

  // 迫击炮
  await page.evaluate(() => {
    document.getElementById('m-mortar').click();
    const el = document.getElementById('elev'); el.value = '118';
    el.dispatchEvent(new Event('input'));
  });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: OUT + '\\03-mortar.png' });

  // 点位筛选
  await page.evaluate(() => {
    document.querySelector('#sheet-mortar .sheet-close').click();
    document.getElementById('btn-mode').click();     // 退出测距
    document.getElementById('btn-types').click();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: OUT + '\\04-types.png' });

  // 点位详情 + 网格
  await page.evaluate(() => {
    document.querySelector('#sheet-types .sheet-close').click();
    document.getElementById('btn-grid').click();
    const s = window.__app.state;
    s.zoom = 4.6; s.cx = 0.575; s.cy = 0.605;
    window.__app.draw();
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: OUT + '\\05-zoom.png' });

  console.log('done');
  await browser.close();
})();
