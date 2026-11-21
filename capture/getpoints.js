const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = 'D:\\dshwork\\pubg测距\\capture\\points_raw';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36');
  await page.goto('https://pubg.plus/zh-CN/map', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(e => console.log('goto', e.message));
  await new Promise(r => setTimeout(r, 7000));

  const result = await page.evaluate(async () => {
    const j = async (u) => {
      const r = await fetch(u, { credentials: 'include' });
      const t = await r.text();
      try { return { status: r.status, json: JSON.parse(t) }; } catch (e) { return { status: r.status, text: t.slice(0, 200) }; }
    };
    const list = await j('https://apiv1.pubg.plus/map/list');
    if (!list.json) return { error: 'list failed', list };
    const data = list.json.data;
    const types = data[3].map(t => ({ key: t[0], zh: t[1], en: t[2], ko: t[3], color: t[4], svg: t[5] }));
    const maps = data[4].map(entry => {
      // entry = [mapName, packed...]
      return { map: entry[0], packed: Array.isArray(entry[1]) ? entry[1] : entry.slice(1) };
    });
    return { types, maps };
  });
  if (result.error) { console.log(JSON.stringify(result).slice(0, 800)); await browser.close(); return; }
  console.log('types:', result.types.length, 'maps:', result.maps.map(m => m.map).join(','));

  const meta = { types: result.types, fetchedAt: new Date().toISOString(), points: {} };

  for (const m of result.maps) {
    const groups = [];
    for (let i = 0; i + 4 < m.packed.length; i += 5) {
      groups.push({ typeKey: result.types[m.packed[i]] ? result.types[m.packed[i]].key : null, count: m.packed[i + 1], tag: m.packed[i + 2] });
    }
    const ok = [];
    for (const g of groups) {
      if (!g.typeKey) continue;
      const r = await page.evaluate(async (u) => {
        const res = await fetch(u, { credentials: 'include' });
        return { status: res.status, text: await res.text() };
      }, `https://apiv1.pubg.plus/map/points?map=${encodeURIComponent(m.map)}&type=${encodeURIComponent(g.typeKey)}`);
      if (r.status === 200) {
        fs.writeFileSync(path.join(OUT, `${m.map}__${g.typeKey}.json`), r.text);
        ok.push(`${g.typeKey}:${g.count}`);
      } else {
        console.log('  skip', m.map, g.typeKey, r.status);
      }
    }
    console.log(m.map, '->', ok.length, 'types ok');
  }

  fs.writeFileSync('D:\\dshwork\\pubg测距\\capture\\meta.json', JSON.stringify(meta, null, 1));
  await browser.close();
})();
