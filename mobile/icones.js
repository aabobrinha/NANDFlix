// npx electron icones.js: gera os ícones do app de Android (res/mipmap-*) a
// partir de ../build/icon.png. Desenha num canvas de uma janela escondida:
// - ic_launcher / ic_launcher_round: o ícone num fundo escuro (Android antigo);
// - ic_launcher_foreground: o ícone no meio da área segura do ícone adaptável
//   (o fundo é a cor de values/ic_launcher_background.xml).
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const RES = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');
const ICONE = fs.readFileSync(path.join(__dirname, '..', 'build', 'icon.png')).toString('base64');
const FUNDO = '#0E1012';
const DENSIDADES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await w.loadURL('data:text/html,<canvas></canvas>');
  const desenhar = (lado, escala, fundo, redondo) => w.webContents.executeJavaScript(`(async () => {
    const img = new Image(); img.src = 'data:image/png;base64,${ICONE}'; await img.decode();
    const c = document.querySelector('canvas'); c.width = c.height = ${lado};
    const x = c.getContext('2d'); x.clearRect(0, 0, ${lado}, ${lado});
    if (${JSON.stringify(fundo)}) {
      x.fillStyle = ${JSON.stringify(fundo)}; x.beginPath();
      if (${redondo}) x.arc(${lado} / 2, ${lado} / 2, ${lado} / 2, 0, Math.PI * 2); else x.roundRect(0, 0, ${lado}, ${lado}, ${lado} * .18);
      x.fill();
    }
    const t = ${lado} * ${escala}; x.imageSmoothingQuality = 'high';
    x.drawImage(img, (${lado} - t) / 2, (${lado} - t) / 2, t, t);
    return c.toDataURL('image/png').split(',')[1];
  })()`);
  for (const [nome, d] of Object.entries(DENSIDADES)) {
    const pasta = path.join(RES, `mipmap-${nome}`);
    fs.mkdirSync(pasta, { recursive: true });
    const grava = (arq, b64) => fs.writeFileSync(path.join(pasta, arq), Buffer.from(b64, 'base64'));
    grava('ic_launcher.png', await desenhar(Math.round(48 * d), 0.7, FUNDO, false));
    grava('ic_launcher_round.png', await desenhar(Math.round(48 * d), 0.66, FUNDO, true));
    grava('ic_launcher_foreground.png', await desenhar(Math.round(108 * d), 0.5, null, false));
  }
  const valores = path.join(RES, 'values', 'ic_launcher_background.xml');
  fs.writeFileSync(valores, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${FUNDO}</color>\n</resources>\n`);
  console.log('ok: ícones gerados');
  app.quit();
});
