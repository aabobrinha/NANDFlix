'use strict';

// ---------- Stories da retrospectiva (do mês, do ano ou de tudo) ----------
//
// Nas estatísticas, "Criar stories da retrospectiva" monta algumas imagens
// 1080×1920 prontas para postar: a capa com o total, as maiores notas, os
// números do período, o filme do mês (ou os do ano) e o mosaico de tudo que
// foi visto. Cada uma se copia ou salva; "Salvar todas" grava numa pasta.

const RETRO_L = 1080;
const RETRO_A = 1920;
const RETRO_COR = { fundo: '#07080B', texto: '#F2F3F5', apagado: '#9C9FA3', acento: '#B08FF3', verde: '#00E054', dourado: '#F5B301' };
const RETRO_FONTE = getComputedStyle(document.documentElement).getPropertyValue('--display').trim() || 'system-ui, sans-serif';
let retro = null; // { el, periodo, imagens: [dataUrl], geracao }

const cacheRetroImg = new Map();
async function imagemRetro(f) {
  const src = srcCapa(f);
  if (!src) return null;
  if (!cacheRetroImg.has(src)) {
    cacheRetroImg.set(src, (async () => {
      const dados = await api.dadosImagem(src);
      return dados ? carregarImg(dados) : null;
    })());
  }
  return cacheRetroImg.get(src);
}

// ---- Desenho ----

const fonteRetro = (peso, tam) => `${peso} ${tam}px ${RETRO_FONTE}`;

function quebrarLinhas(ctx, texto, largura) {
  const linhas = [];
  for (const paragrafo of String(texto).split('\n')) {
    let atual = '';
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (ctx.measureText(tentativa).width <= largura || !atual) atual = tentativa;
      else { linhas.push(atual); atual = palavra; }
    }
    linhas.push(atual);
  }
  return linhas;
}

// Escreve com quebra; devolve o y depois do último texto.
function escrever(ctx, texto, x, y, { peso = 700, tam = 48, cor = RETRO_COR.texto, largura = 920, altura = 1.15, alinhar = 'left', maxLinhas = 99 } = {}) {
  ctx.font = fonteRetro(peso, tam);
  ctx.fillStyle = cor;
  ctx.textAlign = alinhar;
  ctx.textBaseline = 'alphabetic';
  let linhas = quebrarLinhas(ctx, texto, largura);
  if (linhas.length > maxLinhas) {
    linhas = linhas.slice(0, maxLinhas);
    let ultima = linhas[maxLinhas - 1];
    while (ultima && ctx.measureText(`${ultima}…`).width > largura) ultima = ultima.slice(0, -1);
    linhas[maxLinhas - 1] = `${ultima.trim()}…`;
  }
  for (const l of linhas) { y += tam * altura; ctx.fillText(l, x, y - tam * (altura - 1) / 2); }
  ctx.textAlign = 'left';
  return y;
}

function capaNoCanvas(ctx, img, x, y, w, h, { raio = 12, sombra = true } = {}) {
  ctx.save();
  if (sombra) {
    ctx.shadowColor = 'rgba(0, 0, 0, .55)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 14;
  }
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, raio);
  ctx.fillStyle = '#1b1d21';
  ctx.fill();
  ctx.restore();
  if (!img) return;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, raio);
  ctx.clip();
  // object-fit: cover
  const esc = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const iw = img.naturalWidth * esc;
  const ih = img.naturalHeight * esc;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  ctx.restore();
}

async function estrelasRetro(ctx, nota, x, y, altura, alinhar = 'left') {
  if (!nota) return 0;
  const d = estrelasStory(nota);
  const img = await carregarImg(urlSvg(d.svg));
  const w = altura * d.proporcao;
  if (img) ctx.drawImage(img, alinhar === 'center' ? x - w / 2 : x, y, w, altura);
  return w;
}

// Fundo: as capas do período, grandes e desfocadas, bem escuras.
function fundoRetro(ctx, imgs, { tom = 0.32 } = {}) {
  ctx.fillStyle = RETRO_COR.fundo;
  ctx.fillRect(0, 0, RETRO_L, RETRO_A);
  const lista = imgs.filter(Boolean).slice(0, 12);
  if (lista.length) {
    ctx.save();
    ctx.globalAlpha = tom;
    ctx.filter = 'blur(38px) saturate(1.3)';
    const cols = 3;
    const w = RETRO_L / cols + 80;
    const h = w * 1.5;
    lista.forEach((img, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      capaNoCanvas(ctx, img, c * (RETRO_L / cols) - 40, r * (h - 60) - 80, w, h, { raio: 0, sombra: false });
    });
    ctx.restore();
  }
  const g = ctx.createLinearGradient(0, 0, 0, RETRO_A);
  g.addColorStop(0, 'rgba(7, 8, 11, .55)');
  g.addColorStop(0.5, 'rgba(7, 8, 11, .78)');
  g.addColorStop(1, 'rgba(7, 8, 11, .96)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, RETRO_L, RETRO_A);
}

function rodapeRetro(ctx, periodo) {
  ctx.font = fonteRetro(800, 34);
  ctx.fillStyle = RETRO_COR.texto;
  ctx.textAlign = 'left';
  ctx.fillText('nandflix', 80, RETRO_A - 90);
  ctx.font = fonteRetro(500, 30);
  ctx.fillStyle = RETRO_COR.apagado;
  ctx.textAlign = 'right';
  ctx.fillText(rotuloRetro(periodo), RETRO_L - 80, RETRO_A - 90);
  ctx.textAlign = 'left';
}

function kickerRetro(ctx, texto, x, y, cor = RETRO_COR.acento) {
  ctx.font = fonteRetro(700, 30);
  ctx.fillStyle = cor;
  ctx.textAlign = 'left';
  ctx.fillText(Array.from(texto.toUpperCase()).join(String.fromCharCode(8202)), x, y);
}

const rotuloRetro = (p) => (p === 'tudo' ? 'Tudo até agora' : p.length === 7 ? mesLegivel(p).replace(/^./, (c) => c.toUpperCase()) : p);
const tituloRetro = (p) => (p === 'tudo' ? 'Tudo o que eu vi' : p.length === 7 ? `Meu ${MESES[Number(p.slice(5)) - 1]}` : `Meu ${p}`);
const novoCanvas = () => { const c = document.createElement('canvas'); c.width = RETRO_L; c.height = RETRO_A; return c; };

// ---- A tierlist da retrospectiva ----
//
// Os ajustes do slide da tierlist (qual tierlist, quais tiers, só os filmes do
// período ou todos, título) ficam guardados neste computador.

const CHAVE_TIER_RETRO = 'retroTierlist';
function cfgTierRetro() {
  const padrao = { lista: null, ocultas: {}, todos: false, titulo: '' };
  try { return { ...padrao, ...JSON.parse(localStorage.getItem(CHAVE_TIER_RETRO) || '{}') }; } catch { return padrao; }
}
function salvarCfgTierRetro(cfg) {
  try { localStorage.setItem(CHAVE_TIER_RETRO, JSON.stringify(cfg)); } catch { /* fica só nesta sessão */ }
}

// A tierlist escolhida; sem escolha, a que tem mais filmes do período (num
// empate, a que está aberta na tela da tierlist).
function tierlistRetro(d) {
  const listas = listasTl();
  const escolhida = listas.find((l) => l.id === cfgTierRetro().lista);
  if (escolhida) return escolhida;
  const ids = new Set(d.lista.map((f) => f.id));
  const qtd = (l) => l.tiers.reduce((n, t) => n + t.filmes.filter((id) => ids.has(id)).length, 0);
  const ativa = listaAtiva();
  return [ativa, ...listas.filter((l) => l !== ativa)].reduce((m, l) => (qtd(l) > qtd(m) ? l : m));
}

// id do filme → { t: índice da tier (0 = a mais alta), p: posição dentro dela, tier }.
function posicoesTier(l) {
  const m = new Map();
  l.tiers.forEach((tier, t) => tier.filmes.forEach((id, p) => { if (!m.has(id)) m.set(id, { t, p, tier }); }));
  return m;
}

// O ranking do período: primeiro quem está na tierlist, das tiers mais altas
// para as mais baixas (e na ordem dentro de cada tier); depois os outros, pela
// nota. Na retrospectiva de um mês, o filme do mês é sempre o número 1.
function topFilmes(d, periodo, { soComNota = false } = {}) {
  const pos = posicoesTier(tierlistRetro(d));
  const candidatos = soComNota ? d.lista.filter((f) => f.minhaNota || pos.has(f.id)) : d.lista;
  const ordenados = [...candidatos].sort((a, b) => {
    const pa = pos.get(a.id);
    const pb = pos.get(b.id);
    if (pa && pb) return pa.t - pb.t || pa.p - pb.p;
    if (pa || pb) return pa ? -1 : 1;
    return (b.minhaNota || 0) - (a.minhaNota || 0) || a.titulo.localeCompare(b.titulo);
  });
  const doMes = periodo.length === 7 && filmeDoMes(periodo);
  return doMes ? [doMes, ...ordenados.filter((f) => f !== doMes)] : ordenados;
}

// Uma etiqueta com a cor e o nome da tier; devolve a largura.
function etiquetaTier(ctx, tier, x, y, altura) {
  ctx.font = fonteRetro(800, Math.round(altura * 0.58));
  const w = Math.max(altura, ctx.measureText(tier.nome).width + altura * 0.7);
  ctx.fillStyle = tier.cor || '#8A8F98';
  ctx.beginPath();
  ctx.roundRect(x, y, w, altura, 10);
  ctx.fill();
  ctx.fillStyle = '#111317';
  ctx.textAlign = 'center';
  ctx.fillText(tier.nome, x + w / 2, y + altura * 0.72);
  ctx.textAlign = 'left';
  return w;
}

// ---- Os slides ----

async function slideCapa(d, periodo, imgs) {
  const c = novoCanvas();
  const ctx = c.getContext('2d');
  fundoRetro(ctx, imgs, { tom: 0.45 });
  kickerRetro(ctx, 'Retrospectiva', 80, 250);
  let y = escrever(ctx, tituloRetro(periodo), 80, 270, { peso: 800, tam: 128, altura: 1.02, maxLinhas: 2 });
  y = escrever(ctx, 'em filmes', 80, y, { peso: 800, tam: 128, altura: 1.02, cor: RETRO_COR.apagado });

  ctx.font = fonteRetro(800, 300);
  ctx.fillStyle = RETRO_COR.texto;
  ctx.fillText(d.lista.length.toLocaleString('pt-BR'), 64, y + 320);
  const horas = Math.round(d.minutos / 60);
  escrever(ctx, `${d.lista.length === 1 ? 'filme' : 'filmes'}${horas ? ` · ${horas.toLocaleString('pt-BR')} ${horas === 1 ? 'hora' : 'horas'}` : ''}${d.dias.length ? ` · ${d.dias.length} ${d.dias.length === 1 ? 'dia' : 'dias'} com filme` : ''}`, 80, y + 340, { peso: 500, tam: 40, cor: RETRO_COR.apagado });

  // Três capas em leque: as maiores notas (ou as últimas vistas).
  const tres = topFilmes(d, periodo).slice(0, 3);
  const capas = await Promise.all(tres.map(imagemRetro));
  const w = 300;
  const h = 450;
  const base = 1240;
  // A melhor no meio, por cima; a 2ª à esquerda e a 3ª à direita, inclinadas.
  const lugares = [[0, 0], [-1, -9], [1, 9]];
  for (let i = tres.length - 1; i >= 0; i--) {
    const [lado, ang] = lugares[i];
    ctx.save();
    ctx.translate(RETRO_L / 2 + lado * 230, base + h / 2 + Math.abs(lado) * 30);
    ctx.rotate((ang * Math.PI) / 180);
    capaNoCanvas(ctx, capas[i], -w / 2, -h / 2, w, h, { raio: 14 });
    ctx.restore();
  }
  rodapeRetro(ctx, periodo);
  return c.toDataURL('image/png');
}

async function slideNotas(d, periodo, imgs) {
  const top = topFilmes(d, periodo, { soComNota: true }).slice(0, 5);
  if (!top.length) return null;
  const pos = posicoesTier(tierlistRetro(d));
  const comTier = top.some((f) => pos.has(f.id));
  const c = novoCanvas();
  const ctx = c.getContext('2d');
  fundoRetro(ctx, imgs);
  kickerRetro(ctx, rotuloRetro(periodo), 80, 210);
  const yTitulo = escrever(ctx, comTier ? `Meu top ${top.length}` : 'Minhas maiores notas', 80, 230, { peso: 800, tam: 84, altura: 1.05, maxLinhas: 2 });
  const capas = await Promise.all(top.map(imagemRetro));
  const linha = 256;
  let y = yTitulo + 60;
  for (const [i, f] of top.entries()) {
    capaNoCanvas(ctx, capas[i], 80, y, 150, 225, { raio: 10 });
    ctx.font = fonteRetro(800, 44);
    ctx.fillStyle = RETRO_COR.apagado;
    ctx.fillText(String(i + 1), 280, y + 58);
    let ty = escrever(ctx, f.titulo, 340, y + 4, { peso: 700, tam: 46, largura: 660, maxLinhas: 2, altura: 1.12 });
    ty = escrever(ctx, [f.ano, nomesDiretores(f.diretor)[0]].filter(Boolean).join(' · '), 340, ty + 2, { peso: 500, tam: 30, cor: RETRO_COR.apagado, largura: 660, maxLinhas: 1 });
    const we = await estrelasRetro(ctx, f.minhaNota, 340, ty + 16, 46);
    const p = pos.get(f.id);
    if (p) etiquetaTier(ctx, p.tier, 340 + (we ? we + 22 : 0), ty + 15, 48);
    y += linha;
  }
  rodapeRetro(ctx, periodo);
  return c.toDataURL('image/png');
}

async function slideNumeros(d, periodo, imgs) {
  const c = novoCanvas();
  const ctx = c.getContext('2d');
  fundoRetro(ctx, imgs);
  kickerRetro(ctx, rotuloRetro(periodo), 80, 210);
  escrever(ctx, 'Em números', 80, 230, { peso: 800, tam: 96 });
  const horas = Math.round(d.minutos / 60);
  const tiles = [
    ['Filmes', d.lista.length],
    ['Horas', horas],
    ['Dias com filme', d.dias.length],
    ['Maior sequência', d.sequencia > 1 ? `${d.sequencia} dias` : '—'],
    ['Nota média', d.media ? `★ ${notaLegivel(Math.round(d.media * 10) / 10)}` : '—'],
    ['Revistos', d.revistos.length],
  ];
  const tw = 440;
  const th = 210;
  tiles.forEach(([rot, val], i) => {
    const x = 80 + (i % 2) * (tw + 40);
    const y = 420 + Math.floor(i / 2) * (th + 30);
    ctx.fillStyle = 'rgba(232, 235, 240, .07)';
    ctx.beginPath();
    ctx.roundRect(x, y, tw, th, 24);
    ctx.fill();
    ctx.font = fonteRetro(500, 30);
    ctx.fillStyle = RETRO_COR.apagado;
    ctx.fillText(rot, x + 36, y + 62);
    ctx.font = fonteRetro(800, typeof val === 'number' ? 92 : 68);
    ctx.fillStyle = String(val).startsWith('★') ? RETRO_COR.verde : RETRO_COR.texto;
    ctx.fillText(typeof val === 'number' ? val.toLocaleString('pt-BR') : val, x + 34, y + 170);
  });
  const diretor = ranking(d.lista.flatMap((f) => nomesDiretores(f.diretor)), 1)[0];
  const genero = ranking(d.lista.flatMap((f) => generos(f.info)), 1)[0];
  const pais = ranking(d.lista.map(paisPrincipal), 1)[0];
  let y = 420 + 3 * (th + 30) + 40;
  for (const [rot, item] of [['Diretor mais visto', diretor], ['Gênero', genero], ['País', pais]]) {
    if (!item) continue;
    ctx.font = fonteRetro(500, 32);
    ctx.fillStyle = RETRO_COR.apagado;
    ctx.fillText(rot, 80, y + 36);
    y = escrever(ctx, `${item[0]}${item[1] > 1 ? `  ·  ${item[1]} filmes` : ''}`, 80, y + 44, { peso: 700, tam: 50, maxLinhas: 1 });
    y += 30;
  }
  rodapeRetro(ctx, periodo);
  return c.toDataURL('image/png');
}

async function slideFilmeDoMes(periodo, imgs) {
  const c = novoCanvas();
  const ctx = c.getContext('2d');
  if (periodo.length === 7) {
    const f = filmeDoMes(periodo);
    if (!f) return null;
    const img = await imagemRetro(f);
    fundoRetro(ctx, [img, img, img, img, img, img], { tom: 0.6 });
    kickerRetro(ctx, 'Filme do mês', 80, 220, RETRO_COR.dourado);
    escrever(ctx, mesLegivel(periodo).replace(/^./, (x) => x.toUpperCase()), 80, 240, { peso: 800, tam: 72 });
    const w = 640;
    capaNoCanvas(ctx, img, (RETRO_L - w) / 2, 420, w, w * 1.5, { raio: 18 });
    let y = escrever(ctx, f.titulo, RETRO_L / 2, 420 + w * 1.5 + 40, { peso: 800, tam: 62, alinhar: 'center', maxLinhas: 2, largura: 900 });
    y = escrever(ctx, [f.ano, nomesDiretores(f.diretor)[0]].filter(Boolean).join(' · '), RETRO_L / 2, y, { peso: 500, tam: 34, cor: RETRO_COR.apagado, alinhar: 'center' });
    await estrelasRetro(ctx, f.minhaNota, RETRO_L / 2, y + 26, 64, 'center');
    rodapeRetro(ctx, periodo);
    return c.toDataURL('image/png');
  }
  // Ano (ou tudo): os filmes de cada mês, em grade.
  const meses = Object.keys(estado.config.filmesDoMes || {})
    .filter((m) => periodo === 'tudo' || m.startsWith(periodo)).sort()
    .map((m) => ({ m, f: filmeDoMes(m) })).filter((x) => x.f).slice(-12);
  if (!meses.length) return null;
  fundoRetro(ctx, imgs);
  kickerRetro(ctx, rotuloRetro(periodo), 80, 210, RETRO_COR.dourado);
  // O título pode quebrar em duas linhas: a grade começa logo abaixo dele.
  const yGrade = escrever(ctx, 'Os filmes de cada mês', 80, 230, { peso: 800, tam: 84, maxLinhas: 2 }) + 60;
  const capas = await Promise.all(meses.map((x) => imagemRetro(x.f)));
  const cols = 3;
  const gap = 36;
  const w = (RETRO_L - 160 - gap * (cols - 1)) / cols;
  const h = w * 1.5;
  const linhas = Math.ceil(meses.length / cols);
  const escala = Math.min(1, (RETRO_A - 200 - yGrade) / (linhas * (h + 70)));
  const ws = w * escala;
  const hs = h * escala;
  const x0 = (RETRO_L - (ws * cols + gap * (cols - 1))) / 2;
  meses.forEach(({ m }, i) => {
    const x = x0 + (i % cols) * (ws + gap);
    const y = yGrade + Math.floor(i / cols) * (hs + 70);
    capaNoCanvas(ctx, capas[i], x, y, ws, hs, { raio: 12 });
    ctx.font = fonteRetro(600, 28);
    ctx.fillStyle = RETRO_COR.apagado;
    ctx.textAlign = 'center';
    const [a, mm] = m.split('-');
    ctx.fillText(periodo === 'tudo' ? `${MESES[Number(mm) - 1].slice(0, 3)}/${a.slice(2)}` : MESES[Number(mm) - 1], x + ws / 2, y + hs + 42);
    ctx.textAlign = 'left';
  });
  rodapeRetro(ctx, periodo);
  return c.toDataURL('image/png');
}

async function slideMosaico(d, periodo, imgs) {
  // Na ordem em que foram vistos.
  const primeiraVez = (f) => (f.vistoEm || []).filter((x) => periodo === 'tudo' || x.startsWith(periodo)).sort()[0] || '9999';
  const todos = [...d.lista].sort((a, b) => primeiraVez(a).localeCompare(primeiraVez(b)));
  const max = 60;
  const lista = todos.slice(0, max);
  const c = novoCanvas();
  const ctx = c.getContext('2d');
  fundoRetro(ctx, imgs, { tom: 0.2 });
  kickerRetro(ctx, rotuloRetro(periodo), 80, 210);
  const titulo = periodo === 'tudo' ? 'Tudo o que eu vi' : periodo.length === 7 ? `Tudo o que eu vi em ${MESES[Number(periodo.slice(5)) - 1]}` : `Tudo o que eu vi em ${periodo}`;
  const yTopo = escrever(ctx, titulo, 80, 230, { peso: 800, tam: 80, maxLinhas: 2 }) + 50;
  const area = { l: RETRO_L - 160, a: RETRO_A - yTopo - 200 };
  const gap = 14;
  let cols = 2;
  for (; cols < 12; cols++) {
    const w = (area.l - gap * (cols - 1)) / cols;
    if (Math.ceil(lista.length / cols) * (w * 1.5 + gap) - gap <= area.a) break;
  }
  const w = (area.l - gap * (cols - 1)) / cols;
  const h = w * 1.5;
  const capas = await Promise.all(lista.map(imagemRetro));
  lista.forEach((f, i) => {
    capaNoCanvas(ctx, capas[i], 80 + (i % cols) * (w + gap), yTopo + Math.floor(i / cols) * (h + gap), w, h, { raio: Math.max(4, w * 0.05), sombra: false });
  });
  if (todos.length > max) {
    ctx.font = fonteRetro(700, 34);
    ctx.fillStyle = RETRO_COR.apagado;
    ctx.fillText(`+ ${todos.length - max} filmes`, 80, RETRO_A - 150);
  }
  rodapeRetro(ctx, periodo);
  return c.toDataURL('image/png');
}

// A tierlist: cada tier é uma faixa com a etiqueta colorida e as capas. As
// capas encolhem até tudo caber; tiers sem filme não aparecem.
async function slideTierlist(d, periodo, imgs) {
  if (!listasTl().some((l) => l.tiers.some((t) => t.filmes.length))) return null;
  const l = tierlistRetro(d);
  const cfg = cfgTierRetro();
  const ocultas = new Set(cfg.ocultas[l.id] || []);
  const ids = new Set(d.lista.map((f) => f.id));
  const faixas = l.tiers
    .filter((t) => !ocultas.has(t.id))
    .map((tier) => ({ tier, filmes: tier.filmes.filter((id) => cfg.todos || ids.has(id)).map(porId).filter(Boolean) }))
    .filter((x) => x.filmes.length);

  const c = novoCanvas();
  const ctx = c.getContext('2d');
  fundoRetro(ctx, imgs, { tom: 0.25 });
  kickerRetro(ctx, cfg.todos ? 'Tierlist' : rotuloRetro(periodo), 80, 210);
  const titulo = cfg.titulo.trim() || (l.nome && l.nome !== 'Tierlist' ? l.nome : 'Minha tierlist');
  const yTopo = escrever(ctx, titulo, 80, 230, { peso: 800, tam: 84, maxLinhas: 2 }) + 50;
  if (!faixas.length) {
    escrever(ctx, 'Nenhum filme nestas tiers.', RETRO_L / 2, RETRO_A / 2 - 40, { peso: 600, tam: 44, cor: RETRO_COR.apagado, alinhar: 'center' });
    rodapeRetro(ctx, periodo);
    return c.toDataURL('image/png');
  }

  // Medidas: etiqueta à esquerda, capas à direita, em quantas linhas precisar.
  const xEtiq = 80;
  const wEtiq = 140;
  const xCapas = xEtiq + wEtiq + 14;
  const wCapas = RETRO_L - 80 - xCapas;
  const pad = 12;
  const gap = 10;
  const entreFaixas = 14;
  const alturaDisp = RETRO_A - 190 - yTopo;
  const medir = (w) => {
    const h = w * 1.5;
    const porLinha = Math.max(1, Math.floor((wCapas - pad * 2 + gap) / (w + gap)));
    const alturas = faixas.map((x) => Math.ceil(x.filmes.length / porLinha) * (h + gap) - gap + pad * 2);
    return { h, porLinha, alturas, total: alturas.reduce((a, b) => a + b, 0) + entreFaixas * (faixas.length - 1) };
  };
  let w = 170;
  let m = medir(w);
  while (m.total > alturaDisp && w > 30) { w -= 2; m = medir(w); }

  const capas = await Promise.all(faixas.map((x) => Promise.all(x.filmes.map(imagemRetro))));
  // Se sobrar espaço, a tierlist fica no meio da área.
  let y = yTopo + Math.max(0, (alturaDisp - m.total) / 3);
  faixas.forEach((x, i) => {
    const hf = m.alturas[i];
    ctx.fillStyle = x.tier.cor || '#8A8F98';
    ctx.beginPath();
    ctx.roundRect(xEtiq, y, wEtiq, hf, 14);
    ctx.fill();
    ctx.fillStyle = '#111317';
    ctx.textAlign = 'center';
    const tam = x.tier.nome.length <= 2 ? 64 : x.tier.nome.length <= 5 ? 40 : 30;
    ctx.font = fonteRetro(800, tam);
    const linhas = quebrarLinhas(ctx, x.tier.nome, wEtiq - 20).slice(0, 3);
    linhas.forEach((ln, k) => ctx.fillText(caber(ctx, ln, wEtiq - 20), xEtiq + wEtiq / 2, y + hf / 2 + tam * 0.36 + (k - (linhas.length - 1) / 2) * tam * 1.05));
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(232, 235, 240, .06)';
    ctx.beginPath();
    ctx.roundRect(xCapas, y, wCapas, hf, 14);
    ctx.fill();
    x.filmes.forEach((f, k) => {
      const cx = xCapas + pad + (k % m.porLinha) * (w + gap);
      const cy = y + pad + Math.floor(k / m.porLinha) * (m.h + gap);
      capaNoCanvas(ctx, capas[i][k], cx, cy, w, m.h, { raio: Math.max(4, w * 0.06), sombra: false });
    });
    y += hf + entreFaixas;
  });
  rodapeRetro(ctx, periodo);
  return c.toDataURL('image/png');
}

// Corta o texto com "…" para caber na largura.
function caber(ctx, texto, largura) {
  if (ctx.measureText(texto).width <= largura) return texto;
  let t = texto;
  while (t && ctx.measureText(`${t}…`).width > largura) t = t.slice(0, -1);
  return `${t.trim()}…`;
}

// O "resumão", como o cartão final do Spotify Wrapped: fundo de cor, a capa do
// filme que marcou o período no alto, os rankings lado a lado e os números grandes.
async function slideResumo(d, periodo) {
  const c = novoCanvas();
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, RETRO_L, RETRO_A);
  g.addColorStop(0, '#2A1650');
  g.addColorStop(0.55, '#5B3A9A');
  g.addColorStop(1, '#8A5FD0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, RETRO_L, RETRO_A);
  // Um brilho no canto, para não ficar chapado.
  const brilho = ctx.createRadialGradient(RETRO_L * 0.85, 260, 0, RETRO_L * 0.85, 260, 700);
  brilho.addColorStop(0, 'rgba(0, 224, 84, .22)');
  brilho.addColorStop(1, 'rgba(0, 224, 84, 0)');
  ctx.fillStyle = brilho;
  ctx.fillRect(0, 0, RETRO_L, RETRO_A);

  const porNota = topFilmes(d, periodo);
  const destaque = porNota[0];
  const img = await imagemRetro(destaque);
  const pw = 400;
  const ph = 600;
  capaNoCanvas(ctx, img, (RETRO_L - pw) / 2, 150, pw, ph, { raio: 16 });

  const lilas = '#D9C8FF';
  const colunas = [
    ['Top filmes', porNota.slice(0, 5).map((f) => f.titulo)],
    ['Top diretores', ranking(d.lista.flatMap((f) => nomesDiretores(f.diretor)), 5).map(([n]) => n)],
  ];
  const larg = 440;
  colunas.forEach(([rot, itens], ci) => {
    const x = 80 + ci * (larg + 40);
    ctx.font = fonteRetro(600, 32);
    ctx.fillStyle = lilas;
    ctx.fillText(rot, x, 850);
    itens.forEach((nome, i) => {
      const y = 920 + i * 64;
      ctx.font = fonteRetro(800, 36);
      ctx.fillStyle = lilas;
      ctx.fillText(String(i + 1), x, y);
      ctx.font = fonteRetro(700, 38);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(caber(ctx, nome, larg - 48), x + 44, y);
    });
  });

  const horas = Math.round(d.minutos / 60);
  const genero = ranking(d.lista.flatMap((f) => generos(f.info)), 1)[0];
  const blocos = [
    ['Filmes vistos', d.lista.length.toLocaleString('pt-BR'), 120],
    ['Horas de filme', horas.toLocaleString('pt-BR'), 120],
    ['Gênero do período', genero ? genero[0] : '—', 54],
    ['Nota média', d.media ? `★ ${notaLegivel(Math.round(d.media * 10) / 10)}` : '—', 54],
  ];
  blocos.forEach(([rot, val, tam], i) => {
    const x = 80 + (i % 2) * (larg + 40);
    const y = 1310 + Math.floor(i / 2) * 230;
    ctx.font = fonteRetro(600, 32);
    ctx.fillStyle = lilas;
    ctx.fillText(rot, x, y);
    ctx.font = fonteRetro(800, tam);
    ctx.fillStyle = String(val).startsWith('★') ? RETRO_COR.verde : '#FFFFFF';
    ctx.fillText(caber(ctx, val, larg), x - (tam > 100 ? 4 : 0), y + (tam > 100 ? 128 : 74));
  });

  ctx.font = fonteRetro(800, 34);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('nandflix', 80, RETRO_A - 90);
  ctx.font = fonteRetro(600, 30);
  ctx.fillStyle = lilas;
  ctx.textAlign = 'right';
  ctx.fillText(rotuloRetro(periodo), RETRO_L - 80, RETRO_A - 90);
  ctx.textAlign = 'left';
  return c.toDataURL('image/png');
}

// ---- A tela ----

async function abrirRetrospectivaStory(periodo) {
  if (retro) fecharRetro();
  const d = dadosDoPeriodo(periodo);
  if (!d.lista.length) { aviso('Nenhum filme visto neste período.'); return; }
  const el = document.createElement('div');
  el.className = 'retro-tela';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Stories da retrospectiva');
  el.innerHTML = `
    <header class="retro-topo">
      <div>
        <span class="story-rotulo">${icone('Sparkles')} Stories da retrospectiva</span>
        <h2>${esc(rotuloRetro(periodo))}</h2>
      </div>
      <div class="retro-acoes">
        <button class="btn btn-laranja" data-r="todas" disabled>${icone('Download')} Salvar todas</button>
        <button class="redondo" data-r="fechar" title="Fechar (Esc)" aria-label="Fechar">${icone('X')}</button>
      </div>
    </header>
    <div class="retro-fileira"><p class="mensagem carregando">Montando as imagens</p></div>`;
  document.body.append(el);
  const meu = { el, periodo, d, slides: [] };
  retro = meu;
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  el.addEventListener('click', aoClicarRetro);
  el.addEventListener('input', aoMudarAjusteRetro);

  await Promise.all([700, 800].map((p) => document.fonts.load(fonteRetro(p, 40)).catch(() => {})));
  const fundoImgs = await Promise.all(d.lista.slice(0, 12).map(imagemRetro));
  if (retro !== meu) return;
  // Cada slide tem um nome: mexer na tierlist redesenha só os que dependem dela.
  meu.slides = [
    { k: 'capa', fazer: () => slideCapa(d, periodo, fundoImgs) },
    { k: 'notas', fazer: () => slideNotas(d, periodo, fundoImgs) },
    { k: 'tier', fazer: () => slideTierlist(d, periodo, fundoImgs) },
    { k: 'numeros', fazer: () => slideNumeros(d, periodo, fundoImgs) },
    { k: 'mes', fazer: () => slideFilmeDoMes(periodo, fundoImgs) },
    { k: 'mosaico', fazer: () => slideMosaico(d, periodo, fundoImgs) },
    { k: 'resumo', fazer: () => slideResumo(d, periodo) },
  ];
  $('.retro-fileira', el).innerHTML = '';
  for (const s of meu.slides) {
    await desenharSlideRetro(meu, s);
    if (retro !== meu) return;
  }
  $('[data-r="todas"]', el).disabled = !imagensRetro(meu).length;
}

const imagensRetro = (r) => r.slides.filter((s) => s.url).map((s) => s.url);

// Desenha (ou redesenha) um slide e põe o cartão dele no lugar certo da fileira.
async function desenharSlideRetro(meu, s) {
  let url = null;
  try { url = await s.fazer(); } catch (err) { console.error(err); }
  if (retro !== meu) return;
  s.url = url;
  if (!url) { if (s.card) s.card.hidden = true; return; }
  if (!s.card) {
    s.card = document.createElement('figure');
    s.card.className = 'retro-slide';
    s.card.dataset.k = s.k;
    s.card.innerHTML = `<img alt="">
      <figcaption>
        <button class="btn btn-fantasma" data-r="copiar">${icone('Copy')} Copiar</button>
        <button class="btn btn-fantasma" data-r="salvar">${icone('Download')} Salvar</button>
        ${s.k === 'tier' ? `<button class="btn btn-fantasma" data-r="ajustar" title="Escolher a tierlist, as tiers e os filmes deste slide">${icone('SlidersHorizontal')} Ajustar</button>` : ''}
      </figcaption>`;
    const depois = meu.slides.slice(meu.slides.indexOf(s) + 1).find((x) => x.card);
    $('.retro-fileira', meu.el).insertBefore(s.card, depois ? depois.card : null);
    s.card.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
  }
  s.card.hidden = false;
  $('img', s.card).src = url;
  $('img', s.card).alt = `Story ${meu.slides.filter((x) => x.url).indexOf(s) + 1}`;
}

async function redesenharRetro(chaves) {
  const meu = retro;
  if (!meu) return;
  for (const s of meu.slides.filter((x) => chaves.includes(x.k))) {
    await desenharSlideRetro(meu, s);
    if (retro !== meu) return;
  }
  $('[data-r="todas"]', meu.el).disabled = !imagensRetro(meu).length;
}

// ---- Ajustes do slide da tierlist ----

function ajustesTierHTML() {
  const { d, periodo } = retro;
  const cfg = cfgTierRetro();
  const listas = listasTl();
  const l = tierlistRetro(d);
  const ocultas = new Set(cfg.ocultas[l.id] || []);
  const ids = new Set(d.lista.map((f) => f.id));
  const qtd = (t) => t.filmes.filter((id) => cfg.todos || ids.has(id)).length;
  const chip = (ativo, attrs, texto, extra = '') => `<button class="chip${ativo ? ' ativo' : ''}" ${attrs} aria-pressed="${ativo}">${extra}${texto}</button>`;
  return `
    <header class="ra-topo">
      <h3>Slide da tierlist</h3>
      <button class="redondo" data-r="fechar-ajustes" title="Fechar" aria-label="Fechar os ajustes">${icone('X')}</button>
    </header>
    <label class="ra-grupo">
      <span class="ra-rotulo">Título</span>
      <input class="ra-campo" data-a="titulo" maxlength="60" value="${esc(cfg.titulo)}" placeholder="${esc(l.nome && l.nome !== 'Tierlist' ? l.nome : 'Minha tierlist')}">
    </label>
    ${listas.length > 1 ? `
      <div class="ra-grupo">
        <span class="ra-rotulo">Tierlist</span>
        <div class="ra-chips">${listas.map((x) => chip(x === l, `data-r="tl-lista" data-id="${esc(x.id)}"`, esc(x.nome || 'Tierlist'))).join('')}</div>
      </div>` : ''}
    <div class="ra-grupo">
      <span class="ra-rotulo">Tiers que aparecem</span>
      <div class="ra-chips">${l.tiers.map((t) => chip(!ocultas.has(t.id), `data-r="tl-tier" data-id="${esc(t.id)}"`,
        `${esc(t.nome)} <em>${qtd(t)}</em>`, `<i class="ra-cor" style="background:${esc(t.cor || '#8A8F98')}"></i>`)).join('')}</div>
    </div>
    <div class="ra-grupo">
      <span class="ra-rotulo">Filmes</span>
      <div class="ra-chips">
        ${chip(!cfg.todos, 'data-r="tl-todos" data-v="0"', `Vistos em ${esc(rotuloRetro(periodo).toLowerCase())}`)}
        ${chip(cfg.todos, 'data-r="tl-todos" data-v="1"', 'Todos da tierlist')}
      </div>
    </div>
    <p class="ra-nota">${icone('Trophy')} A ordem desta tierlist também decide o ranking da retrospectiva: as tiers mais altas vêm primeiro, depois os filmes sem tier, pela nota.</p>`;
}

function abrirAjustesTier() {
  if (!retro) return;
  let painel = $('.retro-ajustes', retro.el);
  if (painel) { fecharAjustesTier(); return; }
  painel = document.createElement('aside');
  painel.className = 'retro-ajustes';
  painel.setAttribute('aria-label', 'Ajustes do slide da tierlist');
  painel.innerHTML = ajustesTierHTML();
  retro.el.append(painel);
  retro.el.classList.add('com-ajustes');
  painel.animate([{ opacity: 0, transform: 'translateX(16px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'ease-out' });
  const card = retro.slides.find((s) => s.k === 'tier')?.card;
  if (card) card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}

function fecharAjustesTier() {
  if (!retro) return false;
  const painel = $('.retro-ajustes', retro.el);
  if (!painel) return false;
  painel.remove();
  retro.el.classList.remove('com-ajustes');
  return true;
}

// Muda um ajuste, redesenha o painel e os slides afetados (trocar de tierlist
// muda também o ranking: capa, top e resumão).
function mudarAjusteTier(mudar, { ranking = false } = {}) {
  const cfg = cfgTierRetro();
  mudar(cfg);
  salvarCfgTierRetro(cfg);
  const painel = retro && $('.retro-ajustes', retro.el);
  if (painel) {
    const foco = document.activeElement?.dataset?.a;
    painel.innerHTML = ajustesTierHTML();
    if (foco) { const campo = $(`[data-a="${foco}"]`, painel); campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length); }
  }
  redesenharRetro(ranking ? ['capa', 'notas', 'tier', 'resumo'] : ['tier']);
}

let timerTituloRetro = null;
function aoMudarAjusteRetro(e) {
  if (e.target.dataset.a !== 'titulo') return;
  const valor = e.target.value;
  clearTimeout(timerTituloRetro);
  timerTituloRetro = setTimeout(() => {
    const cfg = cfgTierRetro();
    cfg.titulo = valor;
    salvarCfgTierRetro(cfg);
    redesenharRetro(['tier']);
  }, 400);
}

function fecharRetro() {
  if (!retro) return;
  const { el } = retro;
  retro = null;
  el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease-in' }).onfinish = () => el.remove();
}

async function aoClicarRetro(e) {
  const b = e.target.closest('[data-r]');
  if (!b || !retro) return;
  const nome = `Retrospectiva ${rotuloRetro(retro.periodo)}`;
  const s = retro.slides.find((x) => x.card && x.card.contains(b));
  const n = s ? retro.slides.filter((x) => x.url).indexOf(s) + 1 : 0;
  switch (b.dataset.r) {
    case 'fechar': fecharRetro(); break;
    case 'copiar':
      await api.copiarStory(s.url);
      aviso('Imagem copiada. É só colar onde quiser.', { tipo: 'ok' });
      break;
    case 'salvar': {
      const r = await api.salvarStory(s.url, `${nome} ${n}`);
      if (r && r.arquivo) aviso('Imagem salva.', { tipo: 'ok', acao: { rotulo: 'Mostrar na pasta', fn: () => api.mostrarArquivo(r.arquivo) } });
      break;
    }
    case 'todas': {
      const r = await api.salvarVariosStories(imagensRetro(retro), nome);
      if (r && r.arquivos) aviso(`${r.arquivos.length} imagens salvas.`, { tipo: 'ok', acao: { rotulo: 'Mostrar na pasta', fn: () => api.mostrarArquivo(r.arquivos[0]) } });
      break;
    }
    case 'ajustar': abrirAjustesTier(); break;
    case 'fechar-ajustes': fecharAjustesTier(); break;
    case 'tl-lista': mudarAjusteTier((cfg) => { cfg.lista = b.dataset.id; }, { ranking: true }); break;
    case 'tl-tier': {
      const id = tierlistRetro(retro.d).id;
      mudarAjusteTier((cfg) => {
        const ocultas = new Set(cfg.ocultas[id] || []);
        if (ocultas.has(b.dataset.id)) ocultas.delete(b.dataset.id); else ocultas.add(b.dataset.id);
        cfg.ocultas = { ...cfg.ocultas, [id]: [...ocultas] };
      });
      break;
    }
    case 'tl-todos': mudarAjusteTier((cfg) => { cfg.todos = b.dataset.v === '1'; }); break;
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !retro || modal.open) return;
  e.stopImmediatePropagation();
  if (!fecharAjustesTier()) fecharRetro();
}, true);
