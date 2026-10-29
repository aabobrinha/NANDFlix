'use strict';

// ---------- Story para o Instagram ----------
//
// Um editor simples de imagem 1080×1920: a capa do filme no meio, o fundo feito
// da própria capa, as estrelas da sua nota (no verde do Letterboxd, com ½) e a
// logo do Letterboxd. Capa, estrelas e logo se arrastam e mudam de tamanho
// (roda do mouse ou o controle ao lado). Clicar num espaço vazio cria uma caixa
// de texto no estilo do Instagram. O resultado é salvo em PNG ou copiado.
//
// O palco é HTML (para escrever e arrastar); ao exportar, cada coisa é
// redesenhada num canvas nas mesmas posições, linha por linha nos textos.
// A arrumação de cada filme fica salva nele (`f.story`).

const STORY_L = 1080;
const STORY_A = 1920;
const VERDE_LB = '#00E054';
const CHAVE_PADRAO_STORY = 'nandflix.storyPadrao';
let story = null; // { id, el, estado, sel, escala, imagens, timer }

const ESTILOS_TEXTO = [
  { id: 'preto', rotulo: 'Fundo preto' },
  { id: 'branco', rotulo: 'Fundo branco' },
  { id: 'nenhum', rotulo: 'Sem fundo' },
];

function padraoStory() {
  const base = {
    fundo: 'desfocado',
    capa: { x: 540, y: 860, l: 700 },
    estrelas: { x: 540, y: 1540, a: 84, visivel: true },
    logo: { x: 540, y: 1680, a: 62, visivel: true },
  };
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_PADRAO_STORY) || 'null');
    if (salvo) for (const k of ['capa', 'estrelas', 'logo']) if (salvo[k]) base[k] = { ...base[k], ...salvo[k] };
    if (salvo && salvo.fundo) base.fundo = salvo.fundo;
  } catch { /* sem armazenamento: fica o padrão */ }
  return { ...base, poster: '', textos: [] };
}

// ---------- Desenhos: estrelas e logo, em SVG (servem no palco e no canvas) ----------

const PONTA_ESTRELA = (() => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 21 : 50;
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(50 + r * Math.cos(ang)).toFixed(2)},${(52 + r * Math.sin(ang)).toFixed(2)}`);
  }
  return pts.join(' ');
})();

// "★★★½": estrelas cheias e, se houver meia, o ½ do Letterboxd.
function estrelasStory(nota) {
  const cheias = Math.floor(nota);
  const meia = nota - cheias >= 0.5;
  const passo = 104;
  let x = 0;
  let corpo = '';
  for (let i = 0; i < cheias; i++, x += passo) corpo += `<polygon transform="translate(${x} 0)" points="${PONTA_ESTRELA}" fill="${VERDE_LB}" stroke="${VERDE_LB}" stroke-width="6" stroke-linejoin="round"/>`;
  // ½ desenhado em traços (o SVG como imagem não usa as fontes do app).
  if (meia) {
    corpo += `<g transform="translate(${x + 4} 6)" fill="none" stroke="${VERDE_LB}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 14 L16 6 V42"/>
      <path d="M52 4 L14 92"/>
      <path d="M38 60 C38 49 60 47 61 59 C62 70 38 78 36 92 H63"/>
    </g>`;
    x += 76;
  } else x -= passo - 100;
  const largura = Math.max(x, 1);
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -2 ${largura + 8} 104">${corpo}</svg>`, proporcao: (largura + 8) / 104 };
}

const LOGO_STORY = { svg: LB_PONTOS.replace('<svg class="lb-pontos"', '<svg xmlns="http://www.w3.org/2000/svg"').replace(' aria-hidden="true"', ''), proporcao: 378 / 140 };

const urlSvg = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function carregarImg(src) {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = src;
  });
}

// ---------- Abrir e fechar ----------

async function abrirStory(id) {
  const f = porId(id);
  if (!f) return;
  if (story) fecharStory();
  const estado = JSON.parse(JSON.stringify({ ...padraoStory(), ...(f.story || {}) }));
  estado.textos = estado.textos || [];
  const el = document.createElement('div');
  el.className = 'story-tela';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', `Story de ${f.titulo}`);
  el.innerHTML = `
    <div class="story-area">
      <div class="story-envoltorio">
        <div class="story-palco" id="story-palco">
          <canvas class="story-fundo" width="${STORY_L}" height="${STORY_A}"></canvas>
          <img class="st-el st-capa" data-el="capa" alt="" draggable="false">
          <img class="st-el st-estrelas" data-el="estrelas" alt="" draggable="false">
          <img class="st-el st-logo" data-el="logo" alt="" draggable="false">
          <div class="st-guia st-guia-v" hidden></div>
          <div class="st-guia st-guia-h" hidden></div>
        </div>
      </div>
    </div>
    <aside class="story-lado">
      <header class="story-topo">
        <div>
          <span class="story-rotulo">${icone('ImagePlus')} Story</span>
          <h2>${esc(f.titulo)}</h2>
        </div>
        <button class="redondo" data-s="fechar" title="Fechar (Esc)" aria-label="Fechar">${icone('X')}</button>
      </header>
      <div class="story-controles"></div>
      <footer class="story-rodape">
        <button class="btn btn-fantasma" data-s="copiar" title="Copiar a imagem (Ctrl+C)">${icone('Copy')} Copiar</button>
        <button class="btn btn-laranja" data-s="salvar" title="Salvar em PNG (Ctrl+S)">${icone('Download')} Salvar imagem</button>
      </footer>
    </aside>`;
  document.body.append(el);
  story = { id, el, estado, sel: null, escala: 1, imagens: {}, timer: null, capasTmdb: null, mostrarCapas: false };
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  el.addEventListener('click', aoClicarStory);
  el.addEventListener('input', aoDigitarStory);
  el.addEventListener('pointerdown', aoApertarStory);
  el.addEventListener('wheel', aoRodarStory, { passive: false });
  el.addEventListener('focusout', aoSairDoTexto);
  ajustarEscalaStory();
  renderControlesStory();
  for (const t of estado.textos) criarCaixaTexto(t);
  await carregarPosterStory();
  if (!story || story.id !== id) return;
  posicionarTudo();
}

function fecharStory() {
  if (!story) return;
  const { el } = story;
  salvarStory(true);
  story = null;
  el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease-in' }).onfinish = () => el.remove();
}

window.addEventListener('resize', () => { if (story) ajustarEscalaStory(); });

function ajustarEscalaStory() {
  const area = $('.story-area', story.el);
  const r = area.getBoundingClientRect();
  const s = Math.min((r.height - 48) / STORY_A, (r.width - 48) / STORY_L);
  story.escala = Math.max(0.15, s);
  const env = $('.story-envoltorio', story.el);
  env.style.width = `${STORY_L * story.escala}px`;
  env.style.height = `${STORY_A * story.escala}px`;
  $('.story-palco', story.el).style.transform = `scale(${story.escala})`;
}

// ---------- Imagens ----------

async function carregarPosterStory() {
  const f = porId(story.id);
  const src = story.estado.poster || srcCapa(f);
  const meu = story;
  const dados = src ? await api.dadosImagem(src) : null;
  if (story !== meu) return;
  story.imagens.poster = dados ? await carregarImg(dados) : null;
  if (story !== meu) return;
  const capa = $('.st-capa', story.el);
  if (story.imagens.poster) capa.src = story.imagens.poster.src;
  capa.hidden = !story.imagens.poster;
  desenharFundoStory($('.story-fundo', story.el).getContext('2d'));
  posicionarTudo();
}

function corMedia(img, y0, y1) {
  const c = document.createElement('canvas');
  c.width = 12; c.height = 12;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, img.naturalHeight * y0, img.naturalWidth, img.naturalHeight * (y1 - y0), 0, 0, 12, 12);
  const d = ctx.getImageData(0, 0, 12, 12).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4;
  return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
}

function desenharFundoStory(ctx) {
  const img = story.imagens.poster;
  const modo = story.estado.fundo;
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, STORY_L, STORY_A);
  if (img && modo === 'desfocado') {
    // A capa cobrindo tudo, bem desfocada e escurecida.
    const esc = Math.max(STORY_L / img.naturalWidth, STORY_A / img.naturalHeight) * 1.15;
    const w = img.naturalWidth * esc;
    const h = img.naturalHeight * esc;
    ctx.filter = 'blur(60px) saturate(1.25) brightness(.6)';
    ctx.drawImage(img, (STORY_L - w) / 2, (STORY_A - h) / 2, w, h);
    ctx.filter = 'none';
  } else if (img && modo === 'cor') {
    // Como o Instagram faz: um degradê com as cores de cima e de baixo da capa.
    const g = ctx.createLinearGradient(0, 0, 0, STORY_A);
    g.addColorStop(0, corMedia(img, 0, 0.18));
    g.addColorStop(1, corMedia(img, 0.82, 1));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, STORY_L, STORY_A);
  }
  ctx.restore();
}

// ---------- Posições ----------

function posicionarTudo() {
  if (!story) return;
  const { estado, el } = story;
  const f = porId(story.id);
  const capa = $('.st-capa', el);
  Object.assign(capa.style, { left: `${estado.capa.x}px`, top: `${estado.capa.y}px`, width: `${estado.capa.l}px` });

  const est = $('.st-estrelas', el);
  const nota = f.minhaNota || 0;
  if (nota) {
    const desenho = estrelasStory(nota);
    if (est.dataset.nota !== String(nota)) { est.src = urlSvg(desenho.svg); est.dataset.nota = String(nota); }
    est.dataset.proporcao = desenho.proporcao;
    Object.assign(est.style, { left: `${estado.estrelas.x}px`, top: `${estado.estrelas.y}px`, height: `${estado.estrelas.a}px`, width: `${estado.estrelas.a * desenho.proporcao}px` });
  }
  est.hidden = !nota || !estado.estrelas.visivel;

  const logo = $('.st-logo', el);
  if (!logo.getAttribute('src')) logo.src = urlSvg(LOGO_STORY.svg);
  Object.assign(logo.style, { left: `${estado.logo.x}px`, top: `${estado.logo.y}px`, height: `${estado.logo.a}px`, width: `${estado.logo.a * LOGO_STORY.proporcao}px` });
  logo.hidden = !estado.logo.visivel;

  for (const t of estado.textos) posicionarTexto(t);
  for (const x of $$('.st-el', el)) x.classList.toggle('selecionado', x.dataset.el === story.sel);
}

function posicionarTexto(t) {
  const caixa = $(`.st-texto[data-el="t-${t.id}"]`, story.el);
  if (!caixa) return;
  Object.assign(caixa.style, { left: `${t.x}px`, top: `${t.y}px`, fontSize: `${t.tam}px`, textAlign: t.alinhamento });
  caixa.dataset.estilo = t.estilo;
}

const textoPorEl = (nome) => story.estado.textos.find((t) => `t-${t.id}` === nome);

function criarCaixaTexto(t) {
  const caixa = document.createElement('div');
  caixa.className = 'st-el st-texto';
  caixa.dataset.el = `t-${t.id}`;
  caixa.innerHTML = '<span class="st-linhas" contenteditable="plaintext-only" spellcheck="false" data-vazio="Escreva aqui"></span>';
  $('.st-linhas', caixa).textContent = t.texto || '';
  $('.st-guia-v', story.el).before(caixa);
  posicionarTexto(t);
  return caixa;
}

function novoTexto({ x = 540, y = 360, texto = '' } = {}) {
  const ultimo = story.estado.textos[story.estado.textos.length - 1];
  const t = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    texto, x, y,
    tam: ultimo ? ultimo.tam : 46,
    alinhamento: ultimo ? ultimo.alinhamento : 'center',
    estilo: ultimo ? ultimo.estilo : 'preto',
  };
  story.estado.textos.push(t);
  const caixa = criarCaixaTexto(t);
  selecionarStory(`t-${t.id}`);
  editarTexto(caixa, { noFim: true });
  salvarStory();
  return t;
}

function editarTexto(caixa, { noFim = false } = {}) {
  const linhas = $('.st-linhas', caixa);
  caixa.classList.add('editando');
  linhas.focus({ preventScroll: true });
  if (noFim) {
    const r = document.createRange();
    r.selectNodeContents(linhas);
    r.collapse(false);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }
}

function removerTexto(nome) {
  const t = textoPorEl(nome);
  if (!t) return;
  story.estado.textos = story.estado.textos.filter((x) => x !== t);
  $(`.st-texto[data-el="${nome}"]`, story.el)?.remove();
  if (story.sel === nome) story.sel = null;
  renderControlesStory();
  posicionarTudo();
  salvarStory();
}

// Sair de uma caixa vazia apaga a caixa.
function aoSairDoTexto(e) {
  const linhas = e.target.closest && e.target.closest('.st-linhas');
  if (!linhas || !story) return;
  const caixa = linhas.closest('.st-texto');
  caixa.classList.remove('editando');
  if (!linhas.textContent.trim()) {
    const nome = caixa.dataset.el;
    setTimeout(() => { if (story && !caixa.contains(document.activeElement)) removerTexto(nome); }, 0);
  }
}

function aoDigitarStory(e) {
  const caixa = e.target.closest('.st-texto');
  if (!caixa) return;
  const t = textoPorEl(caixa.dataset.el);
  if (!t) return;
  t.texto = $('.st-linhas', caixa).innerText.replace(/\n$/, '');
  salvarStory();
}

function selecionarStory(nome) {
  if (story.sel === nome) return;
  story.sel = nome;
  for (const x of $$('.st-el', story.el)) x.classList.toggle('selecionado', x.dataset.el === nome);
  renderControlesStory();
}

// O tamanho de cada coisa: largura na capa, altura nas estrelas e na logo,
// corpo da letra nos textos.
const LIMITES_TAMANHO = { capa: [240, 1080], estrelas: [30, 220], logo: [24, 220], texto: [22, 140] };
function tamanhoDe(nome) {
  if (nome === 'capa') return { valor: story.estado.capa.l, lim: LIMITES_TAMANHO.capa };
  if (nome === 'estrelas' || nome === 'logo') return { valor: story.estado[nome].a, lim: LIMITES_TAMANHO[nome] };
  const t = textoPorEl(nome);
  return t ? { valor: t.tam, lim: LIMITES_TAMANHO.texto } : null;
}
function mudarTamanho(nome, valor) {
  const atual = tamanhoDe(nome);
  if (!atual) return;
  const v = Math.round(Math.max(atual.lim[0], Math.min(atual.lim[1], valor)));
  if (nome === 'capa') story.estado.capa.l = v;
  else if (nome === 'estrelas' || nome === 'logo') story.estado[nome].a = v;
  else textoPorEl(nome).tam = v;
  posicionarTudo();
  const range = $('#story-tamanho', story.el);
  if (range) range.value = v;
  salvarStory();
}

const alvoDe = (nome) => (nome === 'capa' || nome === 'estrelas' || nome === 'logo' ? story.estado[nome] : textoPorEl(nome));

// ---------- Arrastar, clicar e rolar ----------

function pontoNoPalco(e) {
  const r = $('.story-palco', story.el).getBoundingClientRect();
  return { x: (e.clientX - r.left) / story.escala, y: (e.clientY - r.top) / story.escala };
}

function aoApertarStory(e) {
  if (e.button !== 0) return;
  const palco = e.target.closest('.story-palco');
  if (!palco) return;
  const el = e.target.closest('.st-el');
  // Dentro de uma caixa sendo editada, o mouse serve para o cursor e a seleção.
  if (el && el.classList.contains('editando')) return;
  e.preventDefault();
  if (!el) {
    // Espaço vazio: se estava escrevendo, só termina; senão cria uma caixa ali.
    const escrevendo = document.activeElement && document.activeElement.closest && document.activeElement.closest('.st-linhas');
    if (escrevendo) { escrevendo.blur(); selecionarStory(null); return; }
    const p = pontoNoPalco(e);
    novoTexto({ x: Math.round(p.x), y: Math.round(p.y) });
    return;
  }
  document.activeElement?.blur?.();
  const nome = el.dataset.el;
  selecionarStory(nome);
  const alvo = alvoDe(nome);
  const inicio = pontoNoPalco(e);
  const orig = { x: alvo.x, y: alvo.y };
  let moveu = false;
  const guiaV = $('.st-guia-v', story.el);
  const guiaH = $('.st-guia-h', story.el);
  const mover = (ev) => {
    const p = pontoNoPalco(ev);
    const dx = p.x - inicio.x;
    const dy = p.y - inicio.y;
    if (!moveu && Math.hypot(dx, dy) * story.escala < 4) return;
    moveu = true;
    el.classList.add('arrastando');
    let x = orig.x + dx;
    let y = orig.y + dy;
    // Gruda no meio da imagem, na horizontal e na vertical.
    const grudaX = Math.abs(x - STORY_L / 2) < 12;
    const grudaY = Math.abs(y - STORY_A / 2) < 12;
    if (grudaX) x = STORY_L / 2;
    if (grudaY) y = STORY_A / 2;
    guiaV.hidden = !grudaX;
    guiaH.hidden = !grudaY;
    alvo.x = Math.round(x);
    alvo.y = Math.round(y);
    if (nome.startsWith('t-')) posicionarTexto(alvo);
    else posicionarTudo();
  };
  const soltar = () => {
    window.removeEventListener('pointermove', mover);
    window.removeEventListener('pointerup', soltar);
    window.removeEventListener('pointercancel', soltar);
    el.classList.remove('arrastando');
    guiaV.hidden = true;
    guiaH.hidden = true;
    if (moveu) salvarStory();
    else if (nome.startsWith('t-')) editarTexto(el, { noFim: true });
  };
  window.addEventListener('pointermove', mover);
  window.addEventListener('pointerup', soltar);
  window.addEventListener('pointercancel', soltar);
}

function aoRodarStory(e) {
  const el = e.target.closest('.st-el');
  if (!el || !e.target.closest('.story-palco')) return;
  e.preventDefault();
  const nome = el.dataset.el;
  selecionarStory(nome);
  const atual = tamanhoDe(nome);
  if (!atual) return;
  const fator = e.deltaY < 0 ? 1.05 : 1 / 1.05;
  mudarTamanho(nome, atual.valor * fator);
}

// ---------- Controles do lado ----------

function paragrafosDaPagina(f) {
  if (!temPagina(f)) return [];
  const tpl = document.createElement('template');
  tpl.innerHTML = limparPagina(f.pagina);
  return [...tpl.content.querySelectorAll('p, h2, h3, blockquote, li')]
    .filter((b) => !b.querySelector('p, li'))
    .map((b) => b.textContent.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function renderControlesStory() {
  if (!story) return;
  const f = porId(story.id);
  const { estado, sel } = story;
  const t = sel && sel.startsWith('t-') ? textoPorEl(sel) : null;
  const tam = sel ? tamanhoDe(sel) : null;
  const nomeSel = { capa: 'Capa', estrelas: 'Estrelas', logo: 'Logo do Letterboxd' }[sel] || (t ? 'Caixa de texto' : '');
  const chip = (dado, valor, rotulo, ativo) => `<button class="chip${ativo ? ' ativo' : ''}" data-s="${dado}" data-valor="${valor}" aria-pressed="${ativo}">${rotulo}</button>`;
  const olho = (nome, rotulo, visivel, desativado = false) => `
    <button class="story-alternar${visivel && !desativado ? ' ligado' : ''}" data-s="mostrar" data-valor="${nome}"${desativado ? ' disabled' : ''} aria-pressed="${visivel && !desativado}">
      ${icone(visivel && !desativado ? 'Eye' : 'EyeOff')}<span>${rotulo}</span>
    </button>`;
  const paragrafos = paragrafosDaPagina(f);
  const capas = story.capasTmdb;

  $('.story-controles', story.el).innerHTML = `
    <section class="story-secao">
      <h3>Fundo</h3>
      <div class="story-chips">
        ${chip('fundo', 'desfocado', 'Capa desfocada', estado.fundo === 'desfocado')}
        ${chip('fundo', 'cor', 'Cores da capa', estado.fundo === 'cor')}
        ${chip('fundo', 'preto', 'Preto', estado.fundo === 'preto')}
      </div>
    </section>

    <section class="story-secao">
      <h3>Capa</h3>
      <button class="btn story-btn-largo" data-s="capas" aria-expanded="${story.mostrarCapas}">${icone('Images')} ${story.mostrarCapas ? 'Esconder as capas' : 'Trocar por outra capa do TMDB'}</button>
      ${story.mostrarCapas ? `<div class="story-capas">${
        capas === null ? '<p class="mensagem carregando">Carregando as capas</p>'
          : capas.erro ? `<p class="mensagem">${esc(capas.erro)}</p>`
            : `<button class="story-capa-opcao${!estado.poster ? ' atual' : ''}" data-s="poster" data-valor="" title="A capa do filme na sua lista"><div class="capa"><img src="${esc(srcCapa(f))}" alt=""></div><span>Da lista</span></button>
               ${capas.map((c) => `<button class="story-capa-opcao${estado.poster === c.original ? ' atual' : ''}" data-s="poster" data-valor="${esc(c.original)}" title="${c.idioma ? `Idioma: ${esc(c.idioma)}` : 'Sem texto'}"><div class="capa"><img src="${esc(c.miniatura)}" alt="" loading="lazy"></div><span>${c.idioma ? esc(c.idioma.toUpperCase()) : 'sem texto'}</span></button>`).join('')}`
      }</div>` : ''}
      <p class="story-ajuda">A troca vale só para o story; a capa do filme na lista continua a mesma.</p>
    </section>

    <section class="story-secao">
      <h3>Na imagem</h3>
      <div class="story-alternadores">
        ${olho('estrelas', f.minhaNota ? `Estrelas · ${notaLegivel(f.minhaNota)}` : 'Estrelas (sem nota)', estado.estrelas.visivel, !f.minhaNota)}
        ${olho('logo', 'Logo do Letterboxd', estado.logo.visivel)}
      </div>
      ${f.minhaNota ? '' : '<p class="story-ajuda">Dê uma nota nos detalhes do filme para as estrelas aparecerem.</p>'}
    </section>

    <section class="story-secao">
      <h3>Texto</h3>
      <button class="btn story-btn-largo" data-s="texto">${icone('Type')} Adicionar caixa de texto</button>
      <p class="story-ajuda">Ou clique num espaço vazio da imagem para escrever ali.</p>
    </section>

    ${sel ? `
    <section class="story-secao story-sel">
      <h3>${esc(nomeSel)}</h3>
      ${t ? `
        <div class="story-chips">${ESTILOS_TEXTO.map((e) => chip('estilo', e.id, e.rotulo, t.estilo === e.id)).join('')}</div>
        <div class="story-alinhar" role="group" aria-label="Alinhamento">
          ${[['left', 'TextAlignStart', 'À esquerda'], ['center', 'TextAlignCenter', 'No centro'], ['right', 'TextAlignEnd', 'À direita']]
            .map(([v, ic, r]) => `<button class="btn btn-icone${t.alinhamento === v ? ' ativo' : ''}" data-s="alinhar" data-valor="${v}" title="${r}" aria-label="${r}" aria-pressed="${t.alinhamento === v}">${icone(ic)}</button>`).join('')}
        </div>` : ''}
      ${tam ? `<label class="story-tamanho"><span>Tamanho</span><input type="range" id="story-tamanho" min="${tam.lim[0]}" max="${tam.lim[1]}" value="${tam.valor}"></label>` : ''}
      <div class="story-sel-acoes">
        <button class="btn btn-fantasma" data-s="centralizar">${icone('AlignCenterHorizontal')} Centralizar</button>
        ${t ? `<button class="btn btn-fantasma story-apagar" data-s="apagar-texto">${icone('Trash2')} Apagar caixa</button>` : ''}
      </div>
      <p class="story-ajuda">Arraste para mudar de lugar; a roda do mouse muda o tamanho.</p>
    </section>` : ''}

    ${paragrafos.length ? `
    <section class="story-secao">
      <h3>Da sua página</h3>
      <p class="story-ajuda">Clique num trecho para colocá-lo numa caixa de texto.</p>
      <div class="story-trechos">${paragrafos.map((p, i) => `<button class="story-trecho" data-s="trecho" data-valor="${i}">${esc(p.length > 160 ? `${p.slice(0, 160).replace(/\s+\S*$/, '')}…` : p)}</button>`).join('')}</div>
    </section>` : ''}

    <section class="story-secao">
      <button class="btn btn-fantasma" data-s="restaurar">${icone('RotateCcw')} Voltar capa, estrelas e logo ao lugar</button>
    </section>`;

  const range = $('#story-tamanho', story.el);
  if (range) range.addEventListener('input', () => mudarTamanho(story.sel, Number(range.value)));
}

async function mostrarCapasStory() {
  story.mostrarCapas = !story.mostrarCapas;
  renderControlesStory();
  if (!story.mostrarCapas || story.capasTmdb) return;
  const f = porId(story.id);
  const meu = story;
  if (!f.tmdbId) { story.capasTmdb = { erro: 'Este filme não foi achado no TMDB.' }; renderControlesStory(); return; }
  const r = await api.capasTmdb(story.id);
  if (story !== meu) return;
  story.capasTmdb = !r.ok ? { erro: mensagemErroTmdb(r.erro) }
    : !r.dados.length ? { erro: 'O TMDB não tem outras capas deste filme.' }
      : r.dados.slice(0, 40).map((c) => ({ ...c, original: c.poster.replace('/w780/', '/original/') }));
  if (Array.isArray(story.capasTmdb)) story.capasTmdb.erro = '';
  renderControlesStory();
}

function aoClicarStory(e) {
  if (!story) return;
  const b = e.target.closest('[data-s]');
  if (!b) return;
  const { estado } = story;
  const v = b.dataset.valor;
  switch (b.dataset.s) {
    case 'fechar': fecharStory(); return;
    case 'salvar': exportarStory('salvar'); return;
    case 'copiar': exportarStory('copiar'); return;
    case 'fundo':
      estado.fundo = v;
      desenharFundoStory($('.story-fundo', story.el).getContext('2d'));
      break;
    case 'capas': mostrarCapasStory(); return;
    case 'poster':
      if (estado.poster === v) return;
      estado.poster = v;
      carregarPosterStory();
      break;
    case 'mostrar': estado[v].visivel = !estado[v].visivel; break;
    case 'texto': novoTexto(); return;
    case 'trecho': {
      const p = paragrafosDaPagina(porId(story.id))[Number(v)];
      if (!p) return;
      const usados = estado.textos.length;
      novoTexto({ y: 300 + (usados % 4) * 160, texto: p });
      $(`.st-texto[data-el="${story.sel}"] .st-linhas`, story.el)?.blur();
      return;
    }
    case 'estilo': textoPorEl(story.sel).estilo = v; break;
    case 'alinhar': textoPorEl(story.sel).alinhamento = v; break;
    case 'centralizar': alvoDe(story.sel).x = STORY_L / 2; break;
    case 'apagar-texto': removerTexto(story.sel); return;
    case 'restaurar': {
      try { localStorage.removeItem(CHAVE_PADRAO_STORY); } catch { /* nada */ }
      const p = padraoStory();
      Object.assign(estado, { capa: p.capa, estrelas: p.estrelas, logo: p.logo });
      break;
    }
    default: return;
  }
  renderControlesStory();
  posicionarTudo();
  salvarStory();
}

// Esc: sai da caixa de texto, ou fecha o editor. Delete apaga a caixa
// selecionada; setas movem; Ctrl+S salva e Ctrl+C copia (fora do texto).
document.addEventListener('keydown', (e) => {
  if (!story || modal.open) return;
  const escrevendo = e.target.closest && e.target.closest('.st-linhas');
  if (e.key === 'Escape') {
    e.stopImmediatePropagation();
    e.preventDefault();
    if (escrevendo) { escrevendo.blur(); return; }
    if (story.sel) { selecionarStory(null); return; }
    fecharStory();
    return;
  }
  if (escrevendo) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); exportarStory('salvar'); return; }
  if (ctrl && e.key.toLowerCase() === 'c' && !getSelection().toString()) { e.preventDefault(); exportarStory('copiar'); return; }
  if (!story.sel || e.target.matches('input, textarea')) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && story.sel.startsWith('t-')) { e.preventDefault(); removerTexto(story.sel); return; }
  const passos = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (passos) {
    e.preventDefault();
    const alvo = alvoDe(story.sel);
    const n = e.shiftKey ? 20 : 4;
    alvo.x += passos[0] * n;
    alvo.y += passos[1] * n;
    posicionarTudo();
    salvarStory();
  }
}, true);

// ---------- Guardar ----------

function salvarStory(agora = false) {
  if (!story) return;
  clearTimeout(story.timer);
  const { id, estado } = story;
  const gravar = () => {
    const dados = JSON.parse(JSON.stringify({ ...estado, textos: estado.textos.filter((t) => t.texto.trim()) }));
    const f = porId(id);
    if (f) f.story = dados;
    api.atualizarFilme(id, { story: dados });
    // O lugar da capa, das estrelas e da logo vira o padrão dos próximos stories.
    try { localStorage.setItem(CHAVE_PADRAO_STORY, JSON.stringify({ fundo: dados.fundo, capa: dados.capa, estrelas: dados.estrelas, logo: dados.logo })); } catch { /* nada */ }
  };
  if (agora) gravar();
  else story.timer = setTimeout(gravar, 600);
}

// ---------- Exportar ----------

async function desenharStory() {
  const { el, estado } = story;
  const canvas = document.createElement('canvas');
  canvas.width = STORY_L;
  canvas.height = STORY_A;
  const ctx = canvas.getContext('2d');
  desenharFundoStory(ctx);

  const capa = $('.st-capa', el);
  if (story.imagens.poster && !capa.hidden) {
    const img = story.imagens.poster;
    const w = estado.capa.l;
    const h = (w * img.naturalHeight) / img.naturalWidth;
    const x = estado.capa.x - w / 2;
    const y = estado.capa.y - h / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, .55)';
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 18;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 14);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 14);
    ctx.clip();
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  }

  for (const nome of ['estrelas', 'logo']) {
    const img = $(`.st-${nome}`, el);
    if (img.hidden || !img.complete) continue;
    const a = estado[nome].a;
    const w = a * (nome === 'logo' ? LOGO_STORY.proporcao : Number(img.dataset.proporcao));
    ctx.drawImage(img, estado[nome].x - w / 2, estado[nome].y - a / 2, w, a);
  }

  // Textos: as linhas e o fundo de cada uma saem das posições do próprio palco.
  const palco = $('.story-palco', el).getBoundingClientRect();
  const s = story.escala;
  const local = (r) => ({ x: (r.left - palco.left) / s, y: (r.top - palco.top) / s, w: r.width / s, h: r.height / s });
  for (const caixa of $$('.st-texto', el)) {
    const t = textoPorEl(caixa.dataset.el);
    const linhas = $('.st-linhas', caixa);
    if (!t || !linhas.textContent.trim()) continue;
    const cs = getComputedStyle(linhas);
    const fonte = `${cs.fontWeight} ${t.tam}px ${cs.fontFamily}`;
    await document.fonts.load(fonte).catch(() => {});
    if (t.estilo !== 'nenhum') {
      ctx.fillStyle = cs.backgroundColor;
      const raio = t.tam * 0.28;
      for (const r of linhas.getClientRects()) {
        const q = local(r);
        if (q.w < 1) continue;
        ctx.beginPath();
        ctx.roundRect(q.x, q.y, q.w, q.h, raio);
        ctx.fill();
      }
    }
    ctx.save();
    ctx.font = fonte;
    ctx.fillStyle = cs.color;
    ctx.textBaseline = 'alphabetic';
    if (t.estilo === 'nenhum') { ctx.shadowColor = 'rgba(0, 0, 0, .6)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 2; }
    const ascent = ctx.measureText('Hg').fontBoundingBoxAscent;
    for (const l of linhasDoTexto(linhas)) {
      const q = local(l.rect);
      ctx.fillText(l.texto.replace(/\s+$/, ''), q.x, q.y + ascent);
    }
    ctx.restore();
  }
  return canvas.toDataURL('image/png');
}

// Quebra o texto nas linhas que o navegador montou, letra por letra.
function linhasDoTexto(raiz) {
  const linhas = [];
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let atual = null;
  for (let no = walker.nextNode(); no; no = walker.nextNode()) {
    const txt = no.textContent;
    for (let i = 0; i < txt.length; i++) {
      if (txt[i] === '\n') { atual = null; continue; }
      range.setStart(no, i);
      range.setEnd(no, i + 1);
      const r = [...range.getClientRects()].find((x) => x.width > 0) || range.getBoundingClientRect();
      if (!r.width && /\s/.test(txt[i])) { if (atual) atual.texto += txt[i]; continue; }
      if (!atual || Math.abs(r.top - atual.rect.top) > r.height / 2) {
        // Espaço que sobrou no fim da linha anterior não começa a próxima.
        if (/\s/.test(txt[i]) && atual) { atual.texto += txt[i]; continue; }
        atual = { rect: r, texto: '' };
        linhas.push(atual);
      }
      atual.texto += txt[i];
    }
  }
  return linhas;
}

async function exportarStory(como) {
  if (!story || story.exportando) return;
  const meu = story;
  meu.exportando = true;
  document.activeElement?.blur?.();
  try {
    const png = await desenharStory();
    const f = porId(meu.id);
    if (como === 'copiar') {
      await api.copiarStory(png);
      aviso('Story copiado. É só colar onde quiser.', { tipo: 'ok' });
    } else {
      const r = await api.salvarStory(png, `${f.titulo} - story`);
      if (r && r.arquivo) aviso('Story salvo.', { tipo: 'ok', acao: { rotulo: 'Mostrar na pasta', fn: () => api.mostrarArquivo(r.arquivo) } });
    }
  } catch (err) {
    aviso(`Não deu para gerar a imagem: ${err.message || err}`, { tipo: 'erro' });
  } finally {
    meu.exportando = false;
  }
}
