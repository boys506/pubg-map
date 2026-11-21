const puppeteer = require('puppeteer-core');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = 'D:\\dshwork\\pubg测距\\docs\\screenshots\\';
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox'] });
  const pg = await b.newPage();
  await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  pg.on('pageerror', e => console.log('ERR', e.message));
  await pg.goto('http://127.0.0.1:8777/index.html', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // 1. 地图总览
  await pg.evaluate(() => {
    const s = window.__app.state;
    s.zoom = 3; s.cx = 0.47; s.cy = 0.56;
    window.__app.draw();
  });
  await new Promise(r => setTimeout(r, 900));
  await pg.screenshot({ path: OUT + '01-map.png' });

  // 2. 点位筛选
  await pg.evaluate(() => document.getElementById('btn-types').click());
  await new Promise(r => setTimeout(r, 700));
  await pg.screenshot({ path: OUT + '03-types.png' });
  await pg.evaluate(() => document.getElementById('sheet-types').classList.remove('on'));

  // 3. 测距
  await pg.evaluate(() => {
    const s = window.__app.state;
    document.getElementById('btn-mode').click();
    s.measure = [{ x: 0.42, y: 0.50 }, { x: 0.48, y: 0.545 }, { x: 0.525, y: 0.60 }];
    window.__app.sync(); window.__app.draw();
  });
  await new Promise(r => setTimeout(r, 900));
  await pg.screenshot({ path: OUT + '02-measure.png' });

  // 4. 迫击炮：460m 水平 / +118m 高差 → 519 密位
  await pg.evaluate(() => {
    const s = window.__app.state;
    s.measure = [{ x: 0.40, y: 0.50 }, { x: 0.4575, y: 0.50 }];
    window.__app.sync(); window.__app.draw();
    document.getElementById('m-mortar').click();
    const el = document.getElementById('elev');
    el.value = '118';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 1000));
  await pg.screenshot({ path: OUT + '04-mortar.png' });

  await b.close();
  console.log('shots done');
})();
