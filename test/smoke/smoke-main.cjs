// Electron 冒烟测试启动器：隐藏窗口 + SwiftShader 软渲染 WebGL2，
// 根据页面 document.title（SMOKE_PASS / SMOKE_FAIL）决定进程退出码。
const { app, BrowserWindow } = require('electron');
const path = require('path');

// 无独显/CI 环境下用 SwiftShader 提供 WebGL2
app.commandLine.appendSwitch('use-gl', 'angle');
app.commandLine.appendSwitch('use-angle', 'swiftshader');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
app.commandLine.appendSwitch('no-sandbox');

let finished = false;
function finish(code, msg) {
  if (finished) return;
  finished = true;
  console.log(msg);
  // 给日志一点时间刷出
  setTimeout(() => app.exit(code), 300);
}

app.whenReady().then(() => {
  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  const timer = setTimeout(() => finish(1, 'SMOKE_TIMEOUT: 30s 内未得到结果'), 30000);

  win.webContents.on('page-title-updated', (e, title) => {
    e.preventDefault();
    if (title === 'SMOKE_PASS') {
      clearTimeout(timer);
      finish(0, title);
    } else if (title.startsWith('SMOKE_FAIL')) {
      clearTimeout(timer);
      finish(1, title);
    }
  });
  win.webContents.on('console-message', (_e, _level, message) => {
    console.log('[page]', message);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    clearTimeout(timer);
    finish(1, `SMOKE_CRASH: ${details.reason}`);
  });

  win.loadFile(path.join(__dirname, 'smoke.html')).catch((err) => finish(1, `loadFile failed: ${err}`));
});
