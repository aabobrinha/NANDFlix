// O "celular" no PC: uma janela do Electron do tamanho de um Android (412×915),
// com a interface de mobile/www servida por http (como o WebView faz) e toque
// emulado. Os dados ficam em mobile/.teste-dados, separados do app de PC.
// Abra pelo `npm run testar` (testar.js), não direto.
const { app, BrowserWindow, globalShortcut } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const WWW = path.join(__dirname, 'www');
const PORTA = 8123;
app.setName('NANDFlix celular (teste)');
app.setPath('userData', path.join(__dirname, '.teste-dados'));

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml',
};
const servidor = http.createServer((req, res) => {
  let arq = path.join(WWW, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!arq.startsWith(WWW) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) arq = path.join(WWW, 'index.html');
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream' });
  res.end(fs.readFileSync(arq));
});

app.whenReady().then(() => {
  servidor.listen(PORTA, '127.0.0.1', () => {
    const w = new BrowserWindow({
      width: 412, height: 915, useContentSize: true, resizable: true,
      title: 'NANDFlix celular (teste)', backgroundColor: '#050608', autoHideMenuBar: true,
    });
    w.webContents.setUserAgent('Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36');
    w.loadURL(`http://127.0.0.1:${PORTA}/index.html`);
    // Toque emulado: o mouse vira dedo (arrastar rola a tela, como no celular).
    w.webContents.once('did-finish-load', async () => {
      try {
        w.webContents.debugger.attach('1.3');
        await w.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await w.webContents.debugger.sendCommand('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
      } catch (e) { console.error('toque', e.message); }
    });
    // F12: ferramentas do desenvolvedor. F5: recarregar. Esc no lugar do botão Voltar já funciona.
    globalShortcut.register('F12', () => w.webContents.toggleDevTools());
    globalShortcut.register('F5', () => w.webContents.reload());
  });
});
app.on('window-all-closed', () => app.quit());
