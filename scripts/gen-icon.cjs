// 用 Electron(Chromium) 把 build/logo.svg 栅格化为多尺寸 PNG，并拼装 Windows 多分辨率 ICO
// 运行：npx electron scripts/gen-icon.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const ROOT = path.join(__dirname, '..');

function buildIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type=icon
  header.writeUInt16LE(count, 4);
  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  images.forEach((img, i) => {
    const b = i * 16;
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, b + 0);
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, b + 1);
    dir.writeUInt8(0, b + 2); // palette
    dir.writeUInt8(0, b + 3); // reserved
    dir.writeUInt16LE(1, b + 4); // planes
    dir.writeUInt16LE(32, b + 6); // bpp
    dir.writeUInt32LE(img.buf.length, b + 8);
    dir.writeUInt32LE(offset, b + 12);
    offset += img.buf.length;
  });
  return Buffer.concat([header, dir, ...images.map((i) => i.buf)]);
}

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(ROOT, 'build', 'logo.svg'), 'utf8');
  const svgUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
  const page = `<!doctype html><html><body style="margin:0"><script>
    const SIZES=${JSON.stringify(SIZES)};const SVG=${JSON.stringify(svgUrl)};
    window.__ready=(async()=>{
      const img=new Image();
      await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=SVG;});
      const out={};
      for(const s of SIZES){
        const c=document.createElement('canvas');c.width=s;c.height=s;
        const x=c.getContext('2d');x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';
        x.drawImage(img,0,0,s,s);out[s]=c.toDataURL('image/png');
      }
      return out;
    })();
  <\/script></body></html>`;
  await win.loadURL('data:text/html;base64,' + Buffer.from(page).toString('base64'));
  const dataUrls = await win.webContents.executeJavaScript('window.__ready');
  win.destroy();

  const images = SIZES.map((s) => ({
    size: s,
    buf: Buffer.from(dataUrls[String(s)].split(',')[1], 'base64'),
  }));

  const ico = buildIco(images);
  fs.writeFileSync(path.join(ROOT, 'build', 'icon.ico'), ico);
  const png256 = images.find((i) => i.size === 256).buf;
  fs.writeFileSync(path.join(ROOT, 'build', 'icon.png'), png256);
  fs.mkdirSync(path.join(ROOT, 'public'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'public', 'icon.png'), png256);
  fs.mkdirSync(path.join(ROOT, 'src', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'src', 'assets', 'icon.png'), png256);

  console.log('icon.ico bytes=', ico.length);
  images.forEach((i) => console.log('  png', i.size, i.buf.length));
  app.quit();
});
