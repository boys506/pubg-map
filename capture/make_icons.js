const puppeteer = require('puppeteer-core');
const fs = require('fs');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = 'D:\\dshwork\\pubg测距\\android\\res';

const svg = (size) => `
<div style="width:${size}px;height:${size}px;background:#0b0e12;position:relative;overflow:hidden;border-radius:${size * 0.22}px">
  <svg viewBox="0 0 108 108" width="100%" height="100%">
    <path d="M54,22 C40.7,22 30,32.9 30,46.3 C30,64.6 54,88 54,88 C54,88 78,64.6 78,46.3 C78,32.9 67.3,22 54,22 Z" fill="#f2b134"/>
    <circle cx="54" cy="46" r="9" fill="none" stroke="#0b0e12" stroke-width="2.6"/>
    <path d="M54,32 L54,60 M40,46 L68,46" stroke="#0b0e12" stroke-width="2.6"/>
  </svg>
</div>`;

const dirs = [['mipmap-mdpi', 48], ['mipmap-hdpi', 72], ['mipmap-xhdpi', 96], ['mipmap-xxhdpi', 144], ['mipmap-xxxhdpi', 192]];

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  for (const [dir, size] of dirs) {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(`<body style="margin:0;background:transparent">${svg(size)}</body>`);
    const out = `${ROOT}\\${dir}`;
    fs.mkdirSync(out, { recursive: true });
    await page.screenshot({ path: `${out}\\ic_launcher.png`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log('icon', dir, size);
  }
  await browser.close();
})();
