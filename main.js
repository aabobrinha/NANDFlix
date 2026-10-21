const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, screen, session, webFrameMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const armazem = require('./lib/armazem');
const planilha = require('./lib/planilha');
const omdb = require('./lib/omdb');
const trailer = require('./lib/trailer');
const wikidata = require('./lib/wikidata');
const { novoFilme, juntar, resumo, acharRepetido } = require('./lib/filmes');

app.setName(armazem.NOME_APP);
// FILMES_LEGAIS_DADOS: outra pasta de dados (para testar sem mexer na lista de verdade).
app.setPath('userData', process.env.FILMES_LEGAIS_DADOS || armazem.migrarPastaAntiga(app.getPath('appData')));
// O trailer pode ser desmutado sem precisar de um clique dentro do vídeo.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const PASTA = app.getPath('userData');
const C = armazem.caminhos(PASTA);

const CONFIG_PADRAO = {
  omdbKey: 'ebd62c99',
  stremio: 'app', // 'app' | 'web'
  visualizacao: 'grade',
  ordenacao: 'ordem',
  janela: null,
  limiteAtingidoEm: null,
};

let config = { ...CONFIG_PADRAO, ...armazem.lerJSON(C.config, {}) };
let filmes = [];
let janela = null;
let planilhaPendente = null;

// ---------- Gravação ----------

let timerGravar = null;
function gravarDepois() {
  clearTimeout(timerGravar);
  timerGravar = setTimeout(gravarAgora, 300);
}
function gravarAgora() {
  clearTimeout(timerGravar);
  timerGravar = null;
  armazem.gravarFilmes(PASTA, filmes);
}
function gravarConfig() {
  armazem.gravarJSON(C.config, config);
}

function avisar(canal, dados) {
  if (janela && !janela.isDestroyed()) janela.webContents.send(canal, dados);
}

function atualizarFilme(id, mudancas) {
  const filme = filmes.find((f) => f.id === id);
  if (!filme) return null;
  Object.assign(filme, mudancas);
  gravarDepois();
  return filme;
}

// ---------- Duração (Wikidata) ----------

// Busca em segundo plano a duração dos filmes que ainda não têm, sem gastar a
// cota do OMDb. duracaoDe guarda para qual imdbID a busca foi feita: se a capa
// for trocada por outro filme, a duração é procurada de novo.
let buscandoDuracoes = false;
async function buscarDuracoes() {
  if (buscandoDuracoes) return;
  const faltam = filmes.filter((f) => f.imdbID && f.duracaoDe !== f.imdbID);
  if (!faltam.length) return;
  buscandoDuracoes = true;
  try {
    const achadas = await wikidata.duracoes(faltam.map((f) => f.imdbID));
    for (const f of faltam) {
      atualizarFilme(f.id, { duracao: achadas.get(f.imdbID) || 0, duracaoDe: f.imdbID });
      if (achadas.has(f.imdbID)) avisar('filme:mudou', f);
    }
  } catch { /* sem internet ou Wikidata fora do ar: tenta na próxima abertura */ }
  buscandoDuracoes = false;
}

// ---------- Capas ----------

function nomeArquivoCapa(filme) {
  const base = (filme.imdbID || filme.id).replace(/[^\w-]/g, '');
  return `${base}.jpg`;
}

async function baixarCapa(filme) {
  if (!filme.poster) return false;
  const nome = nomeArquivoCapa(filme);
  const destino = path.join(C.capas, nome);
  try {
    const resposta = await fetch(filme.poster, { signal: AbortSignal.timeout(20000) });
    if (!resposta.ok) return false;
    const dados = Buffer.from(await resposta.arrayBuffer());
    fs.mkdirSync(C.capas, { recursive: true });
    fs.writeFileSync(destino, dados);
    // `v` muda a URL da imagem quando a capa é trocada, para não ficar a antiga no cache.
    atualizarFilme(filme.id, { capaLocal: `${nome}?v=${Date.now()}` });
    return true;
  } catch {
    return false;
  }
}

function capaLocalExiste(filme) {
  if (!filme.capaLocal) return false;
  return fs.existsSync(path.join(C.capas, filme.capaLocal.split('?')[0]));
}

let buscaEmAndamento = null;

// Busca no OMDb as capas que faltam (até 3 consultas ao mesmo tempo) e baixa as imagens.
async function buscarCapasQueFaltam({ incluirNaoEncontradas = false, automatica = false } = {}) {
  if (buscaEmAndamento) return buscaEmAndamento;
  const hoje = new Date().toISOString().slice(0, 10);
  if (automatica && config.limiteAtingidoEm === hoje) return { pulada: 'limite' };

  const semCapa = filmes.filter((f) => !f.poster && !f.capaPersonalizada && (incluirNaoEncontradas || !f.capaNaoEncontrada));
  // `revisarCapa`: capa encontrada por uma regra antiga de busca; é refeita com a
  // regra atual, mantendo a capa atual até a revisão terminar.
  const revisar = filmes.filter((f) => f.poster && f.revisarCapa && !f.capaPersonalizada);
  const semArquivo = filmes.filter((f) => f.poster && !f.capaPersonalizada && !f.revisarCapa && !capaLocalExiste(f));
  const fila = [
    ...semCapa.map((f) => ({ f, consultar: true })),
    ...revisar.map((f) => ({ f, consultar: true })),
    ...semArquivo.map((f) => ({ f, consultar: false })),
  ];
  if (!fila.length) return { total: 0, encontradas: 0 };

  buscaEmAndamento = (async () => {
    const total = fila.length;
    let feitos = 0;
    let encontradas = 0;
    let erro = null;
    avisar('capas:progresso', { feitos, total });

    const trabalhar = async () => {
      while (fila.length && !erro) {
        const { f, consultar } = fila.shift();
        try {
          let baixar = !consultar;
          if (consultar && f.revisarCapa) {
            const achado = await omdb.acharCapa(config.omdbKey, f);
            if (achado && achado.poster) {
              if (achado.imdbID !== f.imdbID) {
                atualizarFilme(f.id, { imdbID: achado.imdbID, poster: achado.poster, capaLocal: '', info: null });
                baixar = true;
              }
            } else {
              // A regra atual não reconhece nem de longe a capa antiga: era de outro filme.
              atualizarFilme(f.id, { imdbID: (achado && achado.imdbID) || '', poster: '', capaLocal: '', capaNaoEncontrada: true });
            }
            atualizarFilme(f.id, { revisarCapa: false });
          } else if (consultar) {
            const achado = await omdb.acharCapa(config.omdbKey, f);
            if (achado && achado.poster) {
              atualizarFilme(f.id, { imdbID: achado.imdbID, poster: achado.poster, capaNaoEncontrada: false });
              encontradas++;
              baixar = true;
            } else {
              atualizarFilme(f.id, { imdbID: (achado && achado.imdbID) || f.imdbID, capaNaoEncontrada: true });
            }
          }
          if (baixar && f.poster) await baixarCapa(f);
          avisar('filme:mudou', f);
        } catch (e) {
          if (e instanceof omdb.ErroOmdb && (e.tipo === 'limite' || e.tipo === 'chave')) {
            erro = e;
            if (e.tipo === 'limite') {
              config.limiteAtingidoEm = hoje;
              gravarConfig();
            }
          } else if (e instanceof omdb.ErroOmdb && e.tipo === 'rede') {
            erro = e;
          }
        }
        feitos++;
        avisar('capas:progresso', { feitos, total });
      }
    };
    await Promise.all([trabalhar(), trabalhar(), trabalhar()]);
    gravarAgora();
    const resultado = { total: feitos, encontradas, erro: erro ? { tipo: erro.tipo, mensagem: erro.message } : null };
    avisar('capas:fim', resultado);
    buscarDuracoes();
    return resultado;
  })();

  try {
    return await buscaEmAndamento;
  } finally {
    buscaEmAndamento = null;
  }
}

// ---------- Janela ----------

function boundsValidos(b) {
  if (!b) return false;
  return screen.getAllDisplays().some(({ workArea: a }) =>
    b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y);
}

function criarJanela() {
  const salvo = config.janela;
  const opcoes = {
    width: 1280,
    height: 860,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: '#14181C',
    title: 'Filmes legais',
    icon: path.join(__dirname, 'src', 'icone.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
  if (salvo && boundsValidos(salvo.bounds)) Object.assign(opcoes, salvo.bounds);
  janela = new BrowserWindow(opcoes);
  if (salvo && salvo.maximizada) janela.maximize();
  janela.once('ready-to-show', () => janela.show());

  let timer = null;
  const lembrar = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (janela.isDestroyed()) return;
      const maximizada = janela.isMaximized();
      config.janela = { bounds: maximizada ? (config.janela?.bounds || janela.getBounds()) : janela.getBounds(), maximizada };
      gravarConfig();
    }, 400);
  };
  janela.on('resize', lembrar);
  janela.on('move', lembrar);
  janela.on('maximize', lembrar);
  janela.on('unmaximize', lembrar);

  // Links nunca abrem dentro do app.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  janela.webContents.on('will-navigate', (e) => e.preventDefault());

  // Trailers de fundo (destaque e prévia, sem controles): esconde a interface
  // do YouTube por cima do vídeo (título, botões, legendas, "More videos"),
  // para o vídeo aparecer limpo assim que começa a tocar.
  janela.webContents.on('frame-created', (_e, { frame }) => {
    if (frame) frame.on('dom-ready', () => limparTrailer(frame));
  });
  janela.webContents.on('did-frame-finish-load', (_e, principal, processo, rota) => {
    if (!principal) limparTrailer(webFrameMain.fromId(processo, rota));
  });

  janela.loadFile(path.join(__dirname, 'src', 'index.html'));
}

const CSS_TRAILER_LIMPO = `
  body > :not(#player), .html5-video-player > :not(.html5-video-container) { display: none !important; }
  .html5-video-player, body { background: transparent !important; cursor: default !important; }
`;

function limparTrailer(frame) {
  try {
    if (!frame || !/^https:\/\/www\.youtube-nocookie\.com\/embed\/.*[?&]controls=0/.test(frame.url)) return;
    frame.executeJavaScript(`(() => {
      if (document.getElementById('fl-limpo')) return;
      const s = document.createElement('style');
      s.id = 'fl-limpo';
      s.textContent = ${JSON.stringify(CSS_TRAILER_LIMPO)};
      (document.head || document.documentElement).append(s);
    })()`).catch(() => {});
  } catch { /* o quadro pode ter sumido */ }
}

// ---------- Links externos ----------

function stremioInstalado() {
  try {
    return Boolean(app.getApplicationNameForProtocol('stremio://'));
  } catch {
    return false;
  }
}

function linksStremio(filme) {
  if (filme.imdbID) {
    return {
      app: `stremio:///detail/movie/${filme.imdbID}`,
      web: `https://web.stremio.com/#/detail/movie/${filme.imdbID}`,
    };
  }
  const q = encodeURIComponent(filme.titulo);
  return {
    app: `stremio:///search?search=${q}`,
    web: `https://web.stremio.com/#/search?search=${q}`,
  };
}

function linkLetterboxd(filme) {
  if (filme.linkLetterboxd) return filme.linkLetterboxd;
  if (filme.imdbID) return `https://letterboxd.com/imdb/${filme.imdbID}/`;
  return `https://letterboxd.com/search/films/${encodeURIComponent(filme.titulo)}/`;
}

// ---------- IPC ----------

ipcMain.handle('dados:carregar', () => ({ filmes, config: configPublica(), pastaDados: PASTA }));

function configPublica() {
  const { janela: _j, ...resto } = config;
  return resto;
}

ipcMain.handle('config:salvar', (_e, mudancas) => {
  const permitidas = ['omdbKey', 'stremio', 'visualizacao', 'ordenacao'];
  for (const k of permitidas) if (k in mudancas) config[k] = mudancas[k];
  if ('omdbKey' in mudancas) config.limiteAtingidoEm = null;
  gravarConfig();
  return configPublica();
});

ipcMain.handle('filme:atualizar', (_e, id, mudancas) => {
  const permitidas = ['titulo', 'ano', 'diretor', 'visto', 'favorito', 'notas', 'linkLetterboxd', 'buscaCapa'];
  const limpo = {};
  for (const k of permitidas) if (k in mudancas) limpo[k] = mudancas[k];
  // Mudar a busca da capa dá ao filme uma nova chance na busca automática.
  if ('buscaCapa' in limpo) limpo.capaNaoEncontrada = false;
  return atualizarFilme(id, limpo);
});

ipcMain.handle('filme:repetido', (_e, dados, ignorarId) => acharRepetido(filmes, dados, ignorarId));

ipcMain.handle('filme:adicionar', async (_e, dados) => {
  const ordem = filmes.reduce((m, f) => Math.max(m, f.ordem || 0), 0) + 1;
  const filme = novoFilme({
    ordem,
    titulo: String(dados.titulo || '').trim(),
    ano: String(dados.ano || '').trim(),
    diretor: String(dados.diretor || '').trim(),
    imdbID: dados.imdbID || '',
    poster: dados.poster || '',
    capaNaoEncontrada: Boolean(dados.imdbID && !dados.poster),
  });
  filmes.push(filme);
  gravarDepois();
  if (filme.poster) baixarCapa(filme).then(() => avisar('filme:mudou', filme));
  return filme;
});

ipcMain.handle('filme:excluir', (_e, id) => {
  const filme = filmes.find((f) => f.id === id);
  filmes = filmes.filter((f) => f.id !== id);
  gravarDepois();
  if (filme && filme.capaLocal && !filmes.some((f) => f.capaLocal && f.capaLocal.split('?')[0] === filme.capaLocal.split('?')[0])) {
    fs.rm(path.join(C.capas, filme.capaLocal.split('?')[0]), { force: true }, () => {});
  }
  return true;
});

ipcMain.handle('filme:trocarCapa', async (_e, id, escolha) => {
  const filme = atualizarFilme(id, {
    imdbID: escolha.imdbID, poster: escolha.poster || '', capaNaoEncontrada: !escolha.poster,
    capaLocal: '', revisarCapa: false, capaPersonalizada: false, info: null,
  });
  if (filme && filme.poster) await baixarCapa(filme);
  gravarAgora();
  return filme;
});

async function chamarOmdb(fn) {
  try {
    return { ok: true, dados: await fn() };
  } catch (e) {
    return { ok: false, erro: { tipo: e.tipo || 'rede', mensagem: e.message } };
  }
}

ipcMain.handle('omdb:pesquisar', (_e, termo) => chamarOmdb(() => omdb.pesquisar(config.omdbKey, termo)));
ipcMain.handle('omdb:detalhes', (_e, imdbID) => chamarOmdb(() => omdb.detalhes(config.omdbKey, imdbID)));

ipcMain.handle('capas:buscar', (_e, opcoes) => buscarCapasQueFaltam(opcoes || {}));

// Quando o Stremio já está aberto, ele recebe o link mas fica atrás das outras
// janelas. No Windows, um processo iniciado pela janela em primeiro plano (este
// app) pode trazer outra janela para a frente.
const SCRIPT_FRENTE_WINDOWS = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class Janela {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
}
"@
for ($i = 0; $i -lt 20; $i++) {
  $p = Get-Process stremio-shell-ng, stremio -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if ($p) {
    if ([Janela]::IsIconic($p.MainWindowHandle)) { [Janela]::ShowWindow($p.MainWindowHandle, 9) | Out-Null }
    (New-Object -ComObject WScript.Shell).AppActivate($p.Id) | Out-Null
    [Janela]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
    break
  }
  Start-Sleep -Milliseconds 500
}
`;

function trazerStremioParaFrente() {
  try {
    if (process.platform === 'win32') {
      spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand',
        Buffer.from(SCRIPT_FRENTE_WINDOWS, 'utf16le').toString('base64')], { windowsHide: true, stdio: 'ignore' });
    } else if (process.platform === 'darwin') {
      spawn('open', ['-a', 'Stremio'], { stdio: 'ignore' });
    } else {
      spawn('wmctrl', ['-a', 'Stremio'], { stdio: 'ignore' }).on('error', () => {});
    }
  } catch {
    // Trazer para a frente é só conveniência; o link já foi aberto.
  }
}

ipcMain.handle('abrir:stremio', async (_e, id, forcarWeb) => {
  const filme = filmes.find((f) => f.id === id);
  if (!filme) return { ok: false };
  const links = linksStremio(filme);
  if (forcarWeb || config.stremio === 'web') {
    await shell.openExternal(links.web);
    return { ok: true, url: links.web };
  }
  if (!stremioInstalado()) return { ok: false, semApp: true };
  await shell.openExternal(links.app);
  trazerStremioParaFrente();
  return { ok: true, url: links.app };
});

// ---------- Capas: baixar e usar arquivo próprio ----------

function nomeSeguro(texto) {
  return String(texto).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'capa';
}

function arquivoDaCapa(filme) {
  if (filme.capaLocal) {
    const p = path.join(C.capas, filme.capaLocal.split('?')[0]);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function bytesDaCapa(filme) {
  const local = arquivoDaCapa(filme);
  if (local) return { dados: fs.readFileSync(local), ext: path.extname(local) || '.jpg' };
  if (!filme.poster) return null;
  const r = await fetch(filme.poster, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) return null;
  return { dados: Buffer.from(await r.arrayBuffer()), ext: '.jpg' };
}

ipcMain.handle('capa:baixar', async (_e, id) => {
  const filme = filmes.find((f) => f.id === id);
  if (!filme) return { erro: 'Filme não encontrado.' };
  const capa = await bytesDaCapa(filme).catch(() => null);
  if (!capa) return { erro: 'Esse filme ainda não tem capa para baixar.' };
  const nome = nomeSeguro(`${filme.titulo}${filme.ano ? ` (${filme.ano})` : ''}`) + capa.ext;
  const r = await dialog.showSaveDialog(janela, {
    title: 'Baixar capa',
    defaultPath: path.join(app.getPath('pictures'), nome),
    filters: [{ name: 'Imagem', extensions: [capa.ext.slice(1)] }],
  });
  if (r.canceled || !r.filePath) return { cancelado: true };
  fs.writeFileSync(r.filePath, capa.dados);
  return { arquivo: r.filePath };
});

ipcMain.handle('capas:baixarTodas', async () => {
  const r = await dialog.showOpenDialog(janela, {
    title: 'Escolha a pasta para salvar todas as capas',
    defaultPath: app.getPath('pictures'),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths.length) return { cancelado: true };
  const pasta = r.filePaths[0];
  let salvas = 0;
  for (const filme of filmes.slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0))) {
    const local = arquivoDaCapa(filme);
    if (!local) continue;
    const nome = nomeSeguro(`${String(filme.ordem).padStart(3, '0')} - ${filme.titulo}${filme.ano ? ` (${filme.ano})` : ''}`);
    fs.copyFileSync(local, path.join(pasta, nome + (path.extname(local) || '.jpg')));
    salvas++;
  }
  return { pasta, salvas };
});

const EXTENSOES_IMAGEM = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp'];

ipcMain.handle('capa:usarArquivo', async (_e, id, caminho) => {
  const filme = filmes.find((f) => f.id === id);
  if (!filme) return { erro: 'Filme não encontrado.' };
  let origem = caminho;
  if (!origem) {
    const r = await dialog.showOpenDialog(janela, {
      title: `Escolher capa para “${filme.titulo}”`,
      defaultPath: app.getPath('pictures'),
      filters: [{ name: 'Imagens', extensions: EXTENSOES_IMAGEM }],
      properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths.length) return { cancelado: true };
    origem = r.filePaths[0];
  }
  const ext = path.extname(origem).toLowerCase();
  if (!EXTENSOES_IMAGEM.includes(ext.slice(1))) return { erro: 'Esse arquivo não é uma imagem (use JPG, PNG ou WEBP).' };
  const nome = `${filme.id}-propria${ext}`;
  fs.mkdirSync(C.capas, { recursive: true });
  fs.copyFileSync(origem, path.join(C.capas, nome));
  const atualizado = atualizarFilme(id, {
    capaLocal: `${nome}?v=${Date.now()}`,
    capaPersonalizada: true,
    capaNaoEncontrada: false,
    revisarCapa: false,
  });
  gravarAgora();
  return { filme: atualizado };
});

// ---------- Trailer e detalhes ----------

const trailersEmBusca = new Map();

ipcMain.handle('trailer:obter', async (_e, id) => {
  const filme = filmes.find((f) => f.id === id);
  if (!filme) return null;
  if (filme.trailerId) return filme.trailerId === 'nenhum' ? null : filme.trailerId;
  if (!trailersEmBusca.has(id)) {
    trailersEmBusca.set(id, trailer.buscarTrailer(filme)
      .then((videoId) => {
        atualizarFilme(id, { trailerId: videoId || 'nenhum' });
        return videoId;
      })
      .catch(() => null) // sem internet: tenta de novo da próxima vez
      .finally(() => trailersEmBusca.delete(id)));
  }
  return trailersEmBusca.get(id);
});

ipcMain.handle('trailer:definir', (_e, id, texto) => {
  const t = String(texto || '').trim();
  if (!t) return { filme: atualizarFilme(id, { trailerId: '' }) };
  const videoId = trailer.idDoLink(t);
  if (!videoId) return { erro: 'Não reconheci esse link do YouTube.' };
  return { filme: atualizarFilme(id, { trailerId: videoId }) };
});

ipcMain.handle('filme:info', async (_e, id) => {
  const filme = filmes.find((f) => f.id === id);
  if (!filme) return { ok: false };
  if (filme.info) return { ok: true, info: filme.info };
  if (!filme.imdbID) return { ok: true, info: null };
  try {
    const d = await omdb.detalhes(config.omdbKey, filme.imdbID);
    if (!d) return { ok: true, info: null };
    atualizarFilme(id, { info: d.info, diretor: filme.diretor || d.diretor });
    return { ok: true, info: d.info };
  } catch (e) {
    return { ok: false, erro: { tipo: e.tipo || 'rede', mensagem: e.message } };
  }
});

ipcMain.handle('abrir:letterboxd', async (_e, id) => {
  const filme = filmes.find((f) => f.id === id);
  if (!filme) return { ok: false };
  const url = linkLetterboxd(filme);
  await shell.openExternal(url);
  return { ok: true, url };
});

ipcMain.handle('abrir:pastaDados', () => shell.openPath(PASTA));

// Importação de planilha em duas etapas: escolher/ler o arquivo, depois aplicar
// (substituir ou juntar), para o app perguntar o modo só depois de ler o arquivo.
ipcMain.handle('planilha:ler', async () => {
  const r = await dialog.showOpenDialog(janela, {
    title: 'Importar planilha',
    filters: [{ name: 'Planilha do Excel', extensions: ['xlsx', 'xls', 'xlsm'] }],
    properties: ['openFile'],
  });
  if (r.canceled || !r.filePaths.length) return { cancelado: true };
  try {
    planilhaPendente = planilha.lerPlanilha(fs.readFileSync(r.filePaths[0]));
    return { total: planilhaPendente.length, arquivo: path.basename(r.filePaths[0]), jaTemFilmes: filmes.length > 0 };
  } catch (e) {
    return { erro: `Não consegui ler a planilha: ${e.message}` };
  }
});

ipcMain.handle('planilha:aplicar', (_e, modo) => {
  if (!planilhaPendente) return { erro: 'Nenhuma planilha carregada.' };
  armazem.fazerBackup(PASTA);
  let extra = {};
  if (modo === 'juntar') {
    const r = juntar(filmes, planilhaPendente);
    filmes = r.filmes;
    extra = { adicionados: r.adicionados, repetidos: r.repetidos };
  } else {
    filmes = planilhaPendente;
    extra = { adicionados: filmes.length, repetidos: 0 };
  }
  planilhaPendente = null;
  gravarAgora();
  return { ...resumo(filmes), ...extra, filmes };
});

ipcMain.handle('planilha:exportar', async () => {
  const r = await dialog.showSaveDialog(janela, {
    title: 'Exportar para Excel',
    defaultPath: path.join(app.getPath('documents'), 'Filmes legais.xlsx'),
    filters: [{ name: 'Planilha do Excel', extensions: ['xlsx'] }],
  });
  if (r.canceled || !r.filePath) return { cancelado: true };
  fs.writeFileSync(r.filePath, planilha.gerarPlanilha(filmes));
  return { arquivo: r.filePath };
});

ipcMain.handle('backup:exportar', async () => {
  const data = new Date().toISOString().slice(0, 10);
  const r = await dialog.showSaveDialog(janela, {
    title: 'Exportar backup',
    defaultPath: path.join(app.getPath('documents'), `filmes-legais-backup-${data}.json`),
    filters: [{ name: 'Backup (JSON)', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePath) return { cancelado: true };
  armazem.gravarJSON(r.filePath, { versao: 1, exportadoEm: new Date().toISOString(), filmes });
  return { arquivo: r.filePath };
});

ipcMain.handle('backup:importar', async () => {
  const r = await dialog.showOpenDialog(janela, {
    title: 'Importar backup',
    filters: [{ name: 'Backup (JSON)', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (r.canceled || !r.filePaths.length) return { cancelado: true };
  const dados = armazem.lerJSON(r.filePaths[0], null);
  const lista = Array.isArray(dados) ? dados : dados && dados.filmes;
  if (!Array.isArray(lista) || lista.some((f) => !f || typeof f.titulo !== 'string')) {
    return { erro: 'Esse arquivo não parece um backup do Filmes legais.' };
  }
  armazem.fazerBackup(PASTA);
  filmes = lista.map((f) => novoFilme(f));
  gravarAgora();
  return { ...resumo(filmes), filmes };
});

// ---------- Inicialização ----------

protocol.registerSchemesAsPrivileged([
  { scheme: 'capa', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const travaUnica = app.requestSingleInstanceLock();
if (!travaUnica) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (janela) {
      if (janela.isMinimized()) janela.restore();
      janela.focus();
    }
  });

  app.whenReady().then(() => {
    fs.mkdirSync(C.capas, { recursive: true });
    armazem.fazerBackup(PASTA);
    filmes = armazem.lerFilmes(PASTA);

    // capa://img/<arquivo> → arquivo da pasta de capas (sem sair dela).
    protocol.handle('capa', (req) => {
      const nome = path.basename(decodeURIComponent(new URL(req.url).pathname));
      const arquivo = path.join(C.capas, nome);
      if (!fs.existsSync(arquivo)) return new Response('', { status: 404 });
      return net.fetch(pathToFileURL(arquivo).toString());
    });

    // O player do YouTube recusa tocar (erro 153) quando a página que o embute
    // não manda Referer, que é o caso de páginas file://.
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*'] },
      (detalhes, callback) => {
        detalhes.requestHeaders.Referer = 'https://filmeslegais.app/';
        callback({ requestHeaders: detalhes.requestHeaders });
      },
    );

    criarJanela();
    buscarDuracoes();
  });

  app.on('before-quit', () => {
    if (timerGravar) gravarAgora();
  });
  app.on('window-all-closed', () => {
    if (timerGravar) gravarAgora();
    app.quit();
  });
}
