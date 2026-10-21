'use strict';

// `api` é a ponte global exposta pelo preload.js.
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));
const MAC = api.plataforma === 'darwin';

const estado = {
  filmes: [],
  config: {},
  filtro: 'todos',
  busca: '',
  diretor: '', // "filmes do mesmo diretor", escolhido no painel
  pais: '', // filtro de país, escolhido no cabeçalho do grupo ou no painel
  ordenacao: 'ordem',
  vista: 'grade',
  painelId: null,
  buscandoCapas: false,
  historico: [], // ids sorteados, navegáveis no carrossel do destaque
  indiceDestaque: -1,
  som: false, // trailers começam mudos
};

const principal = $('#principal');
Movimento.iniciar(principal);
const rolarTopo = () => principal.scrollTo({ top: 0 });
const comportamentoRolagem = () => (Movimento.reduzido.matches ? 'auto' : 'smooth');
// Ao pesquisar ou filtrar, leva até "Todos os filmes" (descontando o topo, que flutua por cima).
function rolarParaLista() {
  const alvo = $('#secao-todos').offsetTop - $('#topo').offsetHeight - 8;
  principal.scrollTo({ top: Math.max(alvo, 0), behavior: comportamentoRolagem() });
}

// O topo é transparente sobre o destaque e ganha fundo ao rolar (ou quando não há destaque).
function atualizarTopo() {
  $('#topo').classList.toggle('rolado', principal.scrollTop > 24 || $('#secao-sorteado').hidden);
}
principal.addEventListener('scroll', atualizarTopo, { passive: true });

// Troca de filtro, ordem ou vista: a lista some de leve e volta (sem repetir as revelações).
function cruzarLista() {
  Movimento.animar($('#lista'), [{ opacity: 1 }, { opacity: 0.4, offset: 0.4 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
}


// ---------- Utilidades ----------

function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`´]/g, "'").toLowerCase();
}

function porId(id) {
  return estado.filmes.find((f) => f.id === id);
}

function anoNumero(ano) {
  const m = String(ano).match(/\d{4}/);
  return m ? Number(m[0]) : Infinity;
}

function meta(f) {
  return [f.ano, f.diretor].filter(Boolean).join(' · ');
}

function aviso(texto, { tipo = '', duracao = 3500, acao } = {}) {
  const el = document.createElement('div');
  el.className = `aviso ${tipo}`;
  el.innerHTML = `<span>${esc(texto)}</span>`;
  if (acao) {
    const b = document.createElement('button');
    b.textContent = acao.rotulo;
    b.onclick = () => { el.remove(); acao.fn(); };
    el.append(b);
  }
  $('#avisos').append(el);
  if (duracao) setTimeout(() => el.remove(), duracao);
  return el;
}

// ---------- Capas ----------

function srcCapa(f) {
  if (f.capaLocal) return `capa://img/${f.capaLocal}`;
  return f.poster || '';
}

function capaHTML(f, { tamanho = 'normal' } = {}) {
  const src = srcCapa(f);
  const vazia = `<div class="capa-vazia"><strong>${esc(f.titulo)}</strong><span>${esc(f.ano)}</span></div>`;
  const img = src
    ? `<img src="${esc(src)}" alt="" loading="${tamanho === 'grande' ? 'eager' : 'lazy'}" decoding="async" data-remoto="${esc(f.poster)}" data-titulo="${esc(f.titulo)}" data-ano="${esc(f.ano)}">`
    : vazia;
  return `<div class="capa">${img}</div>`;
}

// Se a capa local sumir, tenta a URL original; se também falhar, mostra o quadro com o título.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.closest('.capa')) return;
  const remoto = img.dataset.remoto;
  if (remoto && img.src !== remoto && navigator.onLine) {
    img.src = remoto;
    return;
  }
  const vazia = document.createElement('div');
  vazia.className = 'capa-vazia';
  vazia.innerHTML = `<strong>${esc(img.dataset.titulo)}</strong><span>${esc(img.dataset.ano)}</span>`;
  img.replaceWith(vazia);
}, true);

// ---------- Países ----------

// O OMDb dá os países em inglês ("United States, Canada"), o principal primeiro.
// Aqui viram português pelo Intl; a tabela cobre o que ele não reconhece.
const PAISES_ESPECIAIS = {
  'Soviet Union': 'União Soviética', 'West Germany': 'Alemanha Ocidental', 'East Germany': 'Alemanha Oriental',
  Czechoslovakia: 'Tchecoslováquia', Yugoslavia: 'Iugoslávia', 'Federal Republic of Yugoslavia': 'Iugoslávia',
  'Serbia and Montenegro': 'Sérvia e Montenegro', 'Hong Kong': 'Hong Kong', Macao: 'Macau', 'Czech Republic': 'Tchéquia',
  'Republic of North Macedonia': 'Macedônia do Norte', UK: 'Reino Unido', USA: 'Estados Unidos',
  'Ivory Coast': 'Costa do Marfim', Burma: 'Mianmar', Korea: 'Coreia do Sul',
};
const codigosPais = (() => {
  const mapa = new Map();
  try {
    const en = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let i = 0; i < 26; i++) {
      for (let j = 0; j < 26; j++) {
        const codigo = String.fromCharCode(65 + i, 65 + j);
        const nome = en.of(codigo);
        if (nome && nome !== codigo) mapa.set(nome.toLowerCase(), codigo);
      }
    }
  } catch { /* sem Intl.DisplayNames: os países ficam em inglês */ }
  return mapa;
})();
const nomesPaisPt = (() => { try { return new Intl.DisplayNames(['pt-BR'], { type: 'region' }); } catch { return null; } })();
const traducoesPais = new Map();
function paisEmPortugues(nome) {
  if (!traducoesPais.has(nome)) {
    const codigo = codigosPais.get(nome.toLowerCase());
    traducoesPais.set(nome, PAISES_ESPECIAIS[nome] || (codigo && nomesPaisPt ? nomesPaisPt.of(codigo) : nome));
  }
  return traducoesPais.get(nome);
}
const paisesDe = (f) => (f.info && f.info.pais
  ? f.info.pais.split(',').map((p) => p.trim()).filter((p) => p && p !== 'N/A').map(paisEmPortugues)
  : []);
const paisPrincipal = (f) => paisesDe(f)[0] || '';
// No painel cada país é um link que filtra a lista por ele.
const paisesHTML = (f) => paisesDe(f).map((p) => `<button class="link-pais" data-p="pais" data-pais="${esc(p)}" title="Ver só os filmes deste país">${esc(p)}</button>`).join(', ');

// ---------- Lista ----------

// "Joel Coen, Ethan Coen" → ['joel coen', 'ethan coen'] (codirigidos contam para os dois).
const diretoresDe = (texto) => normalizar(texto || '').split(/\s*(?:,|;|\/|&|\be\b|\band\b)\s*/).map((d) => d.trim()).filter(Boolean);

function filtrados() {
  const termo = normalizar(estado.busca.trim());
  const palavras = termo.split(/\s+/).filter(Boolean);
  const diretores = diretoresDe(estado.diretor);
  let lista = estado.filmes.filter((f) => {
    if (estado.filtro === 'nao-vistos' && f.visto) return false;
    if (estado.filtro === 'vistos' && !f.visto) return false;
    if (estado.filtro === 'favoritos' && !f.favorito) return false;
    if (diretores.length && !diretoresDe(f.diretor).some((d) => diretores.includes(d))) return false;
    if (estado.pais && !paisesDe(f).includes(estado.pais)) return false;
    if (!palavras.length) return true;
    const alvo = normalizar([f.titulo, f.ano, f.diretor, f.notas, f.buscaCapa, ...paisesDe(f)].join(' '));
    return palavras.every((p) => alvo.includes(p));
  });

  const comparaTitulo = (a, b) => a.titulo.localeCompare(b.titulo, 'pt', { sensitivity: 'base', numeric: true });
  // Agrupados: em ordem alfabética, e quem não tem a informação vai para o fim.
  const comparaGrupo = (x, y) => (x || '￿').localeCompare(y || '￿', 'pt', { sensitivity: 'base' });
  const ordens = {
    ordem: (a, b) => (a.ordem || 0) - (b.ordem || 0),
    titulo: comparaTitulo,
    ano: (a, b) => anoNumero(a.ano) - anoNumero(b.ano) || comparaTitulo(a, b),
    diretor: (a, b) => comparaGrupo((a.diretor || '').trim(), (b.diretor || '').trim()) || anoNumero(a.ano) - anoNumero(b.ano) || comparaTitulo(a, b),
    pais: (a, b) => comparaGrupo(paisPrincipal(a), paisPrincipal(b)) || anoNumero(a.ano) - anoNumero(b.ano) || comparaTitulo(a, b),
    recentes: (a, b) => String(b.adicionadoEm).localeCompare(String(a.adicionadoEm)) || (b.ordem || 0) - (a.ordem || 0),
  };
  return lista.sort(ordens[estado.ordenacao] || ordens.ordem);
}

function filtrarDiretor(diretor) {
  estado.diretor = diretor || '';
  fecharPainel();
  render();
  if (estado.diretor) rolarParaLista();
}

function filtrarPais(pais) {
  estado.pais = pais || '';
  fecharPainel();
  render();
  if (estado.pais) rolarParaLista();
}

// Ordenar por diretor ou por país separa a lista em grupos, cada um com um
// cabeçalho (nome e quantidade); clicar no nome filtra só aquele grupo.
const AGRUPAMENTOS = {
  diretor: { chave: (f) => (f.diretor || '').trim(), semChave: 'Diretor não informado', filtrar: filtrarDiretor, dica: 'Ver só os filmes deste diretor' },
  pais: {
    chave: paisPrincipal, semChave: 'País não informado', semChavePendente: 'País ainda não carregado',
    pendente: (f) => f.imdbID && !f.info, buscar: () => buscarInfos(),
    filtrar: filtrarPais, dica: 'Ver só os filmes deste país',
  },
};

const cacheGrupos = new Map();
function cabecalhoGrupo(chave, fs, ag) {
  const id = `${estado.ordenacao}|${chave}`;
  let el = cacheGrupos.get(id);
  if (!el) {
    el = document.createElement('div');
    el.className = 'grupo-cabecalho';
    if (chave) {
      el.innerHTML = `<button class="grupo-nome" title="${ag.dica}">${esc(chave)}</button><span class="grupo-contagem"></span>`;
      $('.grupo-nome', el).addEventListener('click', () => ag.filtrar(chave));
    }
    cacheGrupos.set(id, el);
  }
  // Grupo sem a informação: se ainda há filmes por buscar no OMDb, diz isso e
  // oferece buscar agora; senão o OMDb simplesmente não informa.
  if (!chave) {
    const pendentes = ag.pendente ? fs.some(ag.pendente) : false;
    if (el.dataset.pendentes !== String(pendentes)) {
      el.dataset.pendentes = String(pendentes);
      el.innerHTML = `<span class="grupo-nome">${pendentes ? ag.semChavePendente : ag.semChave}</span><span class="grupo-contagem"></span>${pendentes ? `<button class="btn btn-fantasma grupo-acao">${icone('RefreshCw')} Buscar agora</button>` : ''}`;
      if (pendentes) $('.grupo-acao', el).addEventListener('click', ag.buscar);
    }
  }
  const quantidade = fs.length;
  const texto = `${quantidade} filme${quantidade === 1 ? '' : 's'}`;
  const contagem = $('.grupo-contagem', el);
  if (contagem.textContent !== texto) contagem.textContent = texto;
  return el;
}

// Cartões da lista, com os cabeçalhos dos grupos quando a ordenação agrupa.
function itensDaLista(visiveis) {
  const ag = AGRUPAMENTOS[estado.ordenacao];
  if (!ag) return visiveis.map((f) => elementoCartao(f));
  const grupos = new Map();
  for (const f of visiveis) {
    const chave = ag.chave(f);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(f);
  }
  const itens = [];
  for (const [chave, fs] of grupos) itens.push(cabecalhoGrupo(chave, fs, ag), ...fs.map((f) => elementoCartao(f)));
  return itens;
}

function cartaoHTML(f) {
  const tituloVisto = f.visto ? 'Desmarcar visto' : 'Marcar como visto';
  const tituloFav = f.favorito ? 'Tirar dos favoritos' : 'Favoritar';
  return `
    <article class="cartao${f.visto ? ' visto' : ''}" data-id="${f.id}" tabindex="0" aria-label="${esc(f.titulo)}${f.ano ? ` (${esc(f.ano)})` : ''}">
      <div class="capa-area">
        ${capaHTML(f)}
        ${f.visto ? `<span class="selo-visto" title="Visto">${icone('Check')}</span>` : ''}
        ${f.favorito ? `<span class="selo-fav" title="Favorito">${icone('Star', { preenchido: true })}</span>` : ''}
      </div>
      <div class="info">
        <h3 title="${esc(f.titulo)}"><span>${esc(f.titulo)}</span></h3>
        <p class="info-meta">${esc(meta(f))}</p>
        <span class="info-ano">${esc(f.ano)}</span>
        ${f.diretor ? `<button class="info-diretor" data-acao="diretor" title="Ver os filmes deste diretor na sua lista">${esc(f.diretor)}</button>` : ''}
      </div>
      <div class="acoes">
        <button class="acao${f.visto ? ' visto-on' : ''}" data-acao="visto" title="${tituloVisto}" aria-label="${tituloVisto}">${icone('Check')}</button>
        <button class="acao${f.favorito ? ' fav-on' : ''}" data-acao="favorito" title="${tituloFav}" aria-label="${tituloFav}">${icone('Star', { preenchido: f.favorito })}</button>
        <button class="acao acao-stremio" data-acao="stremio" title="Abrir no Stremio" aria-label="Abrir no Stremio">${icone('Play')}</button>
        <button class="acao acao-lb" data-acao="letterboxd" title="Abrir no Letterboxd" aria-label="Abrir no Letterboxd">${LB_PONTOS}</button>
      </div>
    </article>`;
}

// Reaproveita os elementos já criados: ao filtrar ou ordenar, só muda a ordem,
// e as capas já carregadas não piscam. A fileira de favoritos tem o próprio
// cache, porque um elemento não pode estar em dois lugares.
const cacheCartoes = new Map();
const cacheFileira = new Map();
// Visto e favorito ficam fora da assinatura: mudam o cartão no lugar (ver
// atualizarCartao), sem recriar o elemento. Recriar tirava da página o botão
// que acabou de ser clicado e, com ele focado, o Chromium rolava a página.
function assinatura(f) {
  return [f.titulo, f.ano, f.diretor, f.capaLocal, f.poster].join('\u0001');
}

function atualizarCartao(el, f) {
  el.classList.toggle('visto', Boolean(f.visto));
  const area = $('.capa-area', el);
  $('.selo-visto', area)?.remove();
  $('.selo-fav', area)?.remove();
  if (f.visto) area.insertAdjacentHTML('beforeend', `<span class="selo-visto" title="Visto">${icone('Check')}</span>`);
  if (f.favorito) area.insertAdjacentHTML('beforeend', `<span class="selo-fav" title="Favorito">${icone('Star', { preenchido: true })}</span>`);
  const visto = $('.acao[data-acao="visto"]', el);
  const tituloVisto = f.visto ? 'Desmarcar visto' : 'Marcar como visto';
  visto.classList.toggle('visto-on', Boolean(f.visto));
  visto.title = tituloVisto;
  visto.setAttribute('aria-label', tituloVisto);
  const fav = $('.acao[data-acao="favorito"]', el);
  const tituloFav = f.favorito ? 'Tirar dos favoritos' : 'Favoritar';
  fav.classList.toggle('fav-on', Boolean(f.favorito));
  fav.title = tituloFav;
  fav.setAttribute('aria-label', tituloFav);
  fav.innerHTML = icone('Star', { preenchido: f.favorito });
}

function elementoCartao(f, cache = cacheCartoes) {
  const sig = assinatura(f);
  const c = cache.get(f.id);
  if (c && c.sig === sig) {
    if (c.visto !== Boolean(f.visto) || c.favorito !== Boolean(f.favorito)) {
      atualizarCartao(c.el, f);
      c.visto = Boolean(f.visto);
      c.favorito = Boolean(f.favorito);
    }
    return c.el;
  }
  const tpl = document.createElement('template');
  tpl.innerHTML = cartaoHTML(f).trim();
  const el = tpl.content.firstElementChild;
  cache.set(f.id, { el, sig, visto: Boolean(f.visto), favorito: Boolean(f.favorito) });
  return el;
}

// Põe os cartões no contêiner só se algo mudou. Tirar da página o botão que
// está com foco (o que acabou de ser clicado) faz o Chromium rolar a página
// para outro lugar; por isso, se a lista mudar, o foco sai antes, sem rolar.
function trocarFilhos(conteiner, novos) {
  const atuais = conteiner.children;
  if (atuais.length === novos.length && novos.every((el, i) => atuais[i] === el)) return;
  const focado = document.activeElement;
  if (focado && conteiner.contains(focado)) {
    const cartao = focado.closest('.cartao');
    focado.blur();
    conteiner.replaceChildren(...novos);
    if (cartao && cartao.isConnected) focado.focus({ preventScroll: true });
    return;
  }
  conteiner.replaceChildren(...novos);
}

function renderFileira() {
  const fileira = $('#fileira');
  const favoritos = estado.filmes.filter((f) => f.favorito).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  $('#secao-favoritos').hidden = favoritos.length === 0;
  const vistosFav = favoritos.filter((f) => f.visto).length;
  $('#kicker-favoritos').textContent = `${favoritos.length} favorito${favoritos.length === 1 ? '' : 's'} · ${vistosFav} de ${favoritos.length} vistos`;
  trocarFilhos(fileira, favoritos.map((f) => elementoCartao(f, cacheFileira)));
  atualizarSetasFileira();
  Movimento.observar(fileira.children, 'fileira');
}

function atualizarSetasFileira() {
  const f = $('#fileira');
  $('#fileira-esq').disabled = f.scrollLeft <= 2;
  $('#fileira-dir').disabled = f.scrollLeft + f.clientWidth >= f.scrollWidth - 2;
}

// Rolagem fluida: a fileira desliza até o alvo desacelerando aos poucos. As
// setas andam uma "página" por vez, como na Netflix; o trackpad (ou Shift +
// roda do mouse) move o alvo e a fileira acompanha.
let alvoFileira = null;
function deslizarFileira(alvo) {
  const f = $('#fileira');
  const max = f.scrollWidth - f.clientWidth;
  const animando = alvoFileira !== null;
  alvoFileira = Math.max(0, Math.min(max, alvo));
  if (animando) return;
  let pos = f.scrollLeft;
  const passo = () => {
    const falta = alvoFileira - pos;
    if (Math.abs(falta) < 0.5) { f.scrollLeft = alvoFileira; alvoFileira = null; return; }
    pos += falta * 0.12;
    f.scrollLeft = pos;
    requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}
function rolarFileira(direcao) {
  const f = $('#fileira');
  deslizarFileira((alvoFileira ?? f.scrollLeft) + direcao * (f.clientWidth - 160));
}
$('#fileira-esq').addEventListener('click', () => rolarFileira(-1));
$('#fileira-dir').addEventListener('click', () => rolarFileira(1));
$('#fileira').addEventListener('wheel', (e) => {
  const dx = e.shiftKey ? e.deltaY || e.deltaX : e.deltaX;
  if (!dx || Math.abs(dx) < Math.abs(e.shiftKey ? 0 : e.deltaY)) return;
  e.preventDefault();
  const f = $('#fileira');
  deslizarFileira((alvoFileira ?? f.scrollLeft) + dx * 2);
}, { passive: false });
$('#fileira').addEventListener('scroll', () => {
  atualizarSetasFileira();
  clearTimeout(timerPrevia);
  fecharPrevia();
}, { passive: true });
window.addEventListener('resize', atualizarSetasFileira);

let renderAgendado = false;
function agendarRender() {
  if (renderAgendado) return;
  renderAgendado = true;
  requestAnimationFrame(() => { renderAgendado = false; render(); });
}

function render() {
  const lista = $('#lista');
  const vazio = estado.filmes.length === 0;
  const vazioAntes = !$('#vazio').hidden;
  const semResultadosAntes = !$('#sem-resultados').hidden;
  $('#vazio').hidden = !vazio;
  $('#titulo-todos').hidden = vazio;
  $('#barra-ferramentas').hidden = vazio;
  $('#chip-diretor').hidden = !estado.diretor;
  $('#chip-diretor').innerHTML = `${icone('Film')}<span>${esc(estado.diretor)}</span>${icone('X')}`;
  $('#chip-pais').hidden = !estado.pais;
  $('#chip-pais').innerHTML = `${icone('Globe')}<span>${esc(estado.pais)}</span>${icone('X')}`;
  if (vazio) $('#secao-sorteado').hidden = true;
  atualizarTopo();
  renderFileira();
  const visiveis = vazio ? [] : filtrados();
  $('#sem-resultados').hidden = vazio || visiveis.length > 0;
  lista.className = `lista ${estado.vista === 'lista' ? 'compacta' : 'grade'}`;
  trocarFilhos(lista, itensDaLista(visiveis));

  const total = estado.filmes.length;
  $('#contagem').textContent = vazio ? '' : (visiveis.length === total ? `${total} filmes` : `${visiveis.length} de ${total} filmes`);
  $('#sem-contagem').textContent = $('#contagem').textContent;
  atualizarEstatisticas();

  // Estados que acabaram de aparecer entram em sequência; as capas se revelam ao rolar.
  if (vazio && !vazioAntes) {
    const v = $('#vazio');
    Movimento.sequencia([$('.vazio-rotulo', v), $('h2', v), $('.regua', v), $('.vazio-acoes', v)], { y: 12, duracao: 520, passo: 70 });
  }
  if (!$('#sem-resultados').hidden && !semResultadosAntes) {
    Movimento.animar($('#sem-resultados'), [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 220 });
  }
  Movimento.observar(lista.children, estado.vista === 'lista' ? 'lista' : 'grade');
}

function atualizarEstatisticas() {
  const total = estado.filmes.length;
  const vistos = estado.filmes.filter((f) => f.visto).length;
  const favs = estado.filmes.filter((f) => f.favorito).length;
  const pct = total ? Math.round((vistos / total) * 100) : 0;
  $('#est-vistos-texto').textContent = `${vistos} de ${total} vistos (${pct}%)`;
  $('#est-barra').style.width = `${total ? (vistos / total) * 100 : 0}%`;
  $('#est-fav').textContent = `${favs} favorito${favs === 1 ? '' : 's'}`;

  const semCapa = estado.filmes.filter((f) => !f.poster && !f.capaPersonalizada).length;
  const btn = $('#btn-capas-faltam');
  btn.hidden = !semCapa || estado.buscandoCapas;
  btn.innerHTML = `${icone('ImagePlus')}<span>Buscar capas que faltam (${semCapa})</span>`;
}

// ---------- Ações sobre filmes ----------

async function alternar(id, campo, valor) {
  const f = porId(id);
  if (!f) return;
  f[campo] = valor ?? !f[campo];
  agendarRender();
  if (estado.painelId === id) renderPainel();
  await api.atualizarFilme(id, { [campo]: f[campo] });
}

async function abrirStremio(id) {
  const r = await api.abrirStremio(id);
  if (r.semApp) {
    const escolha = await perguntar({
      titulo: 'Stremio não encontrado',
      texto: 'Não encontrei o app do Stremio instalado neste computador. Quer abrir o filme no Stremio Web?',
      botoes: [
        { rotulo: 'Cancelar', valor: null, classe: 'btn-fantasma' },
        { rotulo: 'Sempre usar o Stremio Web', valor: 'sempre' },
        { rotulo: 'Abrir no Stremio Web', valor: 'web', classe: 'btn-laranja' },
      ],
    });
    if (escolha === 'sempre') {
      estado.config = await api.salvarConfig({ stremio: 'web' });
      aviso('Pronto: o ▶ Stremio vai abrir a versão web. Dá para mudar em Configurações.', { tipo: 'ok' });
    }
    if (escolha) await api.abrirStremio(id, true);
  }
}

function abrirLetterboxd(id) {
  return api.abrirLetterboxd(id);
}

// ---------- Painel de detalhes ----------

function abrirPainel(id) {
  fecharPrevia();
  const jaAberto = Boolean(estado.painelId);
  estado.painelId = id;
  renderPainel();
  const painel = $('#painel');
  painel.classList.add('aberto');
  painel.setAttribute('aria-hidden', 'false');
  $('#painel-fundo').classList.add('aberto');
  painel.scrollTop = 0;
  if (jaAberto) {
    // Trocou de filme com o painel aberto: só cruza o conteúdo.
    Movimento.animar($('#painel-conteudo'), [{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
  } else {
    Movimento.animar($('.painel-capa', painel), [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }],
      { duration: 450, delay: 120, fill: 'backwards' });
  }
  $('[data-p="fechar"]', painel).focus({ preventScroll: true });
}

// Tab e Shift+Tab ficam dentro do painel enquanto ele está aberto.
$('#painel').addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || !estado.painelId) return;
  const focaveis = $$('button:not([disabled]), input, textarea, [tabindex]:not([tabindex="-1"])', $('#painel'));
  if (!focaveis.length) return;
  const primeiro = focaveis[0];
  const ultimo = focaveis[focaveis.length - 1];
  if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
  else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
});

function fecharPainel() {
  if (!estado.painelId) return;
  const id = estado.painelId;
  estado.painelId = null;
  pararTrailerPainel();
  $('#painel').classList.remove('aberto');
  $('#painel').setAttribute('aria-hidden', 'true');
  $('#painel-fundo').classList.remove('aberto');
  const cartao = $(`.cartao[data-id="${id}"]`);
  if (cartao) cartao.focus({ preventScroll: true });
}

function renderPainel() {
  const f = porId(estado.painelId);
  if (!f) { fecharPainel(); return; }
  // Ao marcar visto/favorito o painel é redesenhado; o foco volta ao mesmo botão.
  const ativo = document.activeElement;
  const focoAntes = ativo && ativo.closest && ativo.closest('#painel [data-p]') ? ativo.dataset.p : null;
  queueMicrotask(() => {
    if (focoAntes && estado.painelId === f.id) $(`#painel [data-p="${focoAntes}"]`)?.focus({ preventScroll: true });
  });

  // O topo (trailer, capa e título) só é montado ao abrir outro filme: assim o
  // trailer não recomeça quando a pessoa marca visto ou favorito.
  const topo = $('#painel .painel-capa');
  if (topo && topo.dataset.id === f.id) {
    atualizarBotoesPainel(f);
  } else {
    $('#painel-conteudo').innerHTML = `
      <button class="redondo painel-fechar" data-p="fechar" aria-label="Fechar" title="Fechar (Esc)">${icone('X')}</button>
      <div class="painel-capa" data-id="${f.id}">
        <div class="painel-fundo-video"><div class="destaque-fundo-capa"></div></div>
        <div class="painel-sombra"></div>
        <button class="btn-redondo painel-som" data-p="som" title="${tituloSom()}" aria-label="${tituloSom()}" hidden>${iconeSom()}</button>
        <div class="painel-cabecalho">
          <div class="destaque-identidade">
            <div class="destaque-poster" data-p="trocar" title="Trocar capa (ou arraste uma imagem para cá)">${capaHTML(f, { tamanho: 'grande' })}</div>
            <div class="destaque-titulo"><h2>${esc(f.titulo)}</h2></div>
          </div>
          <div class="painel-botoes">
            <button class="btn btn-assistir" data-p="stremio">${ICONE_PLAY} Assistir</button>
            <button class="redondo" data-p="visto">${icone('Check')}</button>
            <button class="redondo" data-p="favorito"></button>
            <button class="redondo" data-p="letterboxd" title="Abrir no Letterboxd" aria-label="Abrir no Letterboxd">${LB_PONTOS}</button>
            <button class="redondo" data-p="trailer" title="Ver o trailer em tela cheia" aria-label="Ver o trailer em tela cheia">${icone('Maximize')}</button>
          </div>
        </div>
      </div>
      <div id="painel-resto"></div>`;
    fundoDesfocado($('.painel-capa'), f);
    atualizarBotoesPainel(f);
    carregarTrailerPainel(f);
  }

  const sinopse = f.info && f.info.sinopse ? f.info.sinopse : '';
  const elenco = f.info && f.info.elenco ? f.info.elenco.split(',').slice(0, 4).map((n) => n.trim()).join(', ') : '';
  const campo = (nome, rotulo, extra = '') =>
    `<div class="campo"><label for="c-${nome}">${rotulo}</label><input id="c-${nome}" data-campo="${nome}" value="${esc(f[nome])}" ${extra}></div>`;
  $('#painel-resto').innerHTML = `
    <div class="painel-corpo">
      <div>
        <p class="painel-meta" data-info="meta-painel">${painelMetaHTML(f)}</p>
        <div class="notas-linha">${notasHTML(f.info)}</div>
        <p class="painel-sinopse" data-info="sinopse-painel"${sinopse ? '' : ' hidden'}>${esc(sinopse)}</p>
      </div>
      <div class="painel-fichas">
        ${f.diretor ? `<p class="painel-ficha"><b>Direção:</b> <span>${esc(f.diretor)}</span></p>` : ''}
        <p class="painel-ficha" data-info="pais-painel"${paisesDe(f).length ? '' : ' hidden'}><b>País:</b> <span>${paisesHTML(f)}</span></p>
        <p class="painel-ficha" data-info="elenco-painel"${elenco ? '' : ' hidden'}><b>Elenco:</b> <span>${esc(elenco)}</span></p>
        <p class="painel-ficha" data-info="generos-painel"${generos(f.info).length ? '' : ' hidden'}><b>Gêneros:</b> <span>${esc(generos(f.info).join(', '))}</span></p>
        ${f.notas ? `<p class="painel-ficha"><b>Suas notas:</b> <span>${esc(f.notas)}</span></p>` : ''}
      </div>
    </div>
    <div class="capa-acoes">
      <button class="btn btn-fantasma" data-p="baixar" title="Salvar a imagem da capa no computador">${icone('Download')} Baixar capa</button>
      <button class="btn btn-fantasma" data-p="arquivo" title="Usar uma imagem sua como capa (ou arraste a imagem para a capa)">${icone('FolderOpen')} Usar imagem minha</button>
    </div>
    <div class="painel-campos">
    ${campo('titulo', 'Título')}
    ${campo('ano', 'Ano')}
    <div class="campo">
      <label for="c-diretor">Diretor</label>
      <div class="campo-com-botoes">
        <input id="c-diretor" data-campo="diretor" value="${esc(f.diretor)}">
        <button class="btn btn-icone" data-p="mesmo-diretor" title="Ver os filmes deste diretor na sua lista" aria-label="Ver os filmes deste diretor na sua lista"${f.diretor ? '' : ' disabled'}>${icone('Search')}</button>
        <button class="btn btn-icone" data-p="diretor-letterboxd" title="Ver todos os filmes do diretor no Letterboxd" aria-label="Ver todos os filmes do diretor no Letterboxd"${f.diretor ? '' : ' disabled'}>${LB_PONTOS}</button>
      </div>
    </div>
    <div class="campo"><label for="c-notas">Notas</label><textarea id="c-notas" data-campo="notas">${esc(f.notas)}</textarea></div>
    ${campo('linkLetterboxd', 'Link do Letterboxd', 'placeholder="https://letterboxd.com/film/…" spellcheck="false"')}
    <div class="campo">
      <label for="c-buscaCapa">Busca da capa</label>
      <input id="c-buscaCapa" data-campo="buscaCapa" value="${esc(f.buscaCapa)}" placeholder="Título em inglês ou código tt…" spellcheck="false">
      <span class="ajuda">${f.imdbID ? `IMDb: ${esc(f.imdbID)}` : 'Sem código do IMDb ainda.'}${f.capaPersonalizada ? ' · Capa escolhida por você.' : f.capaNaoEncontrada && !f.poster ? ' · Capa não encontrada no OMDb.' : ''}</span>
    </div>
    <div class="campo">
      <label for="c-trailer">Trailer (link do YouTube)</label>
      <input id="c-trailer" data-trailer value="${f.trailerId && f.trailerId !== 'nenhum' ? `https://youtu.be/${esc(f.trailerId)}` : ''}" placeholder="Achado automaticamente; cole outro link para trocar" spellcheck="false">
    </div>
    </div>
    <div class="salvo" id="salvo"></div>
    <div class="painel-rodape">
      <button class="btn" data-p="trocar">${icone('Image')} Trocar capa</button>
      <button class="btn btn-perigo" data-p="excluir">${icone('Trash2')} Excluir</button>
    </div>`;

  if (!f.info) {
    const id = f.id;
    carregarInfo(f).then((info) => {
      if (!info || estado.painelId !== id) return;
      $('[data-info="meta-painel"]').innerHTML = painelMetaHTML(f);
      const p = $('[data-info="sinopse-painel"]');
      if (p && info.sinopse) { p.textContent = info.sinopse; p.hidden = false; }
      const pais = $('[data-info="pais-painel"]');
      if (pais && paisesDe(f).length) { $('span', pais).innerHTML = paisesHTML(f); pais.hidden = false; }
      const e = $('[data-info="elenco-painel"]');
      if (e && info.elenco) { $('span', e).textContent = info.elenco.split(',').slice(0, 4).map((n) => n.trim()).join(', '); e.hidden = false; }
      const g = $('[data-info="generos-painel"]');
      const lista = generos(info);
      if (g && lista.length) { $('span', g).textContent = lista.join(', '); g.hidden = false; }
      const notas = $('#painel .notas-linha');
      if (notas) notas.innerHTML = notasHTML(info);
    });
  }
}

// "2001  1h 56m  [PG-13]", como a linha de dados do modal da Netflix.
function painelMetaHTML(f) {
  const info = f.info || {};
  const partes = [f.ano, duracaoDe(f)].filter(Boolean).map((p) => `<span>${esc(p)}</span>`);
  if (info.classificacao && info.classificacao !== 'N/A') partes.push(`<span class="classificacao">${esc(info.classificacao)}</span>`);
  return partes.join('') || '&nbsp;';
}

function atualizarBotoesPainel(f) {
  const visto = $('#painel .painel-botoes [data-p="visto"]');
  const fav = $('#painel .painel-botoes [data-p="favorito"]');
  if (!visto || !fav) return;
  const tituloVisto = f.visto ? 'Desmarcar visto' : 'Marcar como visto';
  const tituloFav = f.favorito ? 'Tirar dos favoritos' : 'Favoritar';
  visto.classList.toggle('visto-on', Boolean(f.visto));
  visto.title = tituloVisto;
  visto.setAttribute('aria-label', tituloVisto);
  visto.setAttribute('aria-pressed', String(Boolean(f.visto)));
  fav.classList.toggle('fav-on', Boolean(f.favorito));
  fav.innerHTML = icone('Star', { preenchido: f.favorito });
  fav.title = tituloFav;
  fav.setAttribute('aria-label', tituloFav);
  fav.setAttribute('aria-pressed', String(Boolean(f.favorito)));
}

// Trailer tocando atrás do título, mudo como no destaque.
async function carregarTrailerPainel(f) {
  const id = f.id;
  const videoId = await trailerDe(id);
  const capa = $('#painel .painel-capa');
  if (!videoId || estado.painelId !== id || !capa || capa.dataset.id !== id) return;
  pausarDestaque('painel');
  $('.painel-fundo-video', capa).append(iframeTrailer(videoId, 'painel-video', { mudo: !estado.som }));
  capa.classList.add('com-trailer');
  $('[data-p="som"]', capa).hidden = false;
}

// Tira o trailer do painel ao fechar, para ele não continuar tocando escondido.
function pararTrailerPainel() {
  const capa = $('#painel .painel-capa');
  if (capa) { capa.dataset.id = ''; $('.painel-video', capa)?.remove(); }
  retomarDestaque('painel');
}

const timersCampo = {};
function editarCampo(id, campo, valor) {
  const f = porId(id);
  if (!f) return;
  f[campo] = valor;
  if (campo === 'buscaCapa') f.capaNaoEncontrada = false;
  if (campo === 'diretor') $$('[data-p="mesmo-diretor"], [data-p="diretor-letterboxd"]').forEach((b) => { b.disabled = !valor.trim(); });
  agendarRender();
  clearTimeout(timersCampo[campo]);
  timersCampo[campo] = setTimeout(async () => {
    await api.atualizarFilme(id, { [campo]: valor });
    const salvo = $('#salvo');
    if (salvo && estado.painelId === id) {
      salvo.textContent = 'Salvo';
      clearTimeout(salvo._t);
      salvo._t = setTimeout(() => { salvo.textContent = ''; }, 1500);
    }
    if (estado.painelId === id && (campo === 'titulo' || campo === 'ano')) {
      const titulo = $('#painel .destaque-titulo h2');
      if (titulo) titulo.textContent = f.titulo;
      const linhaMeta = $('[data-info="meta-painel"]');
      if (linhaMeta) linhaMeta.innerHTML = painelMetaHTML(f);
    }
  }, 400);
}

$('#painel').addEventListener('input', (e) => {
  const campo = e.target.dataset.campo;
  if (campo && estado.painelId) editarCampo(estado.painelId, campo, e.target.value);
});

$('#painel').addEventListener('click', async (e) => {
  if (!estado.painelId) return;
  const id = estado.painelId;
  const b = e.target.closest('[data-p]');
  if (!b) {
    // Clicar no trailer (fora do título e dos botões) abre o modo foco.
    const capa = e.target.closest('.painel-capa.com-trailer');
    if (capa && !e.target.closest('.painel-cabecalho')) abrirFoco(id, Number($('.painel-video', capa)?.dataset.tempo) || 0);
    return;
  }
  switch (b.dataset.p) {
    case 'fechar': fecharPainel(); break;
    case 'som': alternarSom(); break;
    case 'visto': alternar(id, 'visto'); break;
    case 'favorito': alternar(id, 'favorito'); break;
    case 'stremio': abrirStremio(id); break;
    case 'letterboxd': abrirLetterboxd(id); break;
    case 'trocar': abrirTrocarCapa(id); break;
    case 'excluir': excluir(id); break;
    case 'baixar': baixarCapa(id); break;
    case 'arquivo': usarArquivoCapa(id); break;
    case 'trailer': abrirTrailer(id); break;
    case 'mesmo-diretor': filtrarDiretor(porId(id).diretor); break;
    case 'pais': filtrarPais(b.dataset.pais); break;
    case 'diretor-letterboxd': {
      // Página do (primeiro) diretor no Letterboxd: letterboxd.com/director/nome-sobrenome/
      const nome = (porId(id).diretor || '').split(/\s*(?:,|;|\/|&)\s*/)[0];
      const slug = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (slug) window.open(`https://letterboxd.com/director/${slug}/`);
      break;
    }
  }
});

$('#painel').addEventListener('change', async (e) => {
  if (!e.target.matches('[data-trailer]') || !estado.painelId) return;
  const id = estado.painelId;
  const r = await api.definirTrailer(id, e.target.value);
  if (r.erro) { aviso(r.erro, { tipo: 'erro' }); return; }
  Object.assign(porId(id), { trailerId: r.filme.trailerId });
  buscasTrailer.delete(id);
  if (r.filme.trailerId) e.target.value = `https://youtu.be/${r.filme.trailerId}`;
  aviso(r.filme.trailerId ? 'Trailer trocado.' : 'Trailer limpo: será buscado de novo.', { tipo: 'ok' });
  if (filmeNoDestaque() === id) mostrarDestaque();
});

$('#painel-fundo').addEventListener('click', fecharPainel);

// ---------- Capa: baixar e usar imagem própria ----------

async function baixarCapa(id) {
  const r = await api.baixarCapa(id);
  if (r.erro) aviso(r.erro, { tipo: 'erro' });
  else if (r.arquivo) aviso(`Capa salva em ${r.arquivo}`, { tipo: 'ok', duracao: 6000 });
}

async function usarArquivoCapa(id, caminho) {
  const r = await api.usarArquivoCapa(id, caminho);
  if (r.cancelado) return;
  if (r.erro) { aviso(r.erro, { tipo: 'erro' }); return; }
  Object.assign(porId(id), r.filme);
  render();
  if (estado.painelId === id) renderPainel();
  if (filmeNoDestaque() === id) mostrarDestaque();
  aviso('Capa trocada pela sua imagem.', { tipo: 'ok' });
}

// Arrastar uma imagem do computador para a capa (no painel ou num cartão) troca a capa.
function alvoDeSoltar(e) {
  const capaPainel = e.target.closest('.painel-capa .capa');
  if (capaPainel && estado.painelId) return { el: capaPainel, id: estado.painelId };
  const cartao = e.target.closest('.cartao');
  return cartao ? { el: cartao, id: cartao.dataset.id } : null;
}
document.addEventListener('dragover', (e) => {
  if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
  e.preventDefault();
  $$('.soltar').forEach((el) => el.classList.remove('soltar'));
  const alvo = alvoDeSoltar(e);
  e.dataTransfer.dropEffect = alvo ? 'copy' : 'none';
  if (alvo) alvo.el.classList.add('soltar');
});
document.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) $$('.soltar').forEach((el) => el.classList.remove('soltar'));
});
document.addEventListener('drop', (e) => {
  e.preventDefault();
  $$('.soltar').forEach((el) => el.classList.remove('soltar'));
  const alvo = alvoDeSoltar(e);
  const arquivo = e.dataTransfer && e.dataTransfer.files[0];
  if (!alvo || !arquivo) return;
  if (!arquivo.type.startsWith('image/')) { aviso('Solte um arquivo de imagem (JPG, PNG ou WEBP).', { tipo: 'erro' }); return; }
  usarArquivoCapa(alvo.id, api.caminhoDoArquivo(arquivo));
});

async function excluir(id) {
  const f = porId(id);
  const ok = await perguntar({
    titulo: 'Excluir filme',
    texto: `Excluir “${f.titulo}” da lista? Isso não pode ser desfeito (mas há backups automáticos).`,
    botoes: [
      { rotulo: 'Cancelar', valor: false, classe: 'btn-fantasma' },
      { rotulo: 'Excluir', valor: true, classe: 'btn-perigo' },
    ],
  });
  if (!ok) return;
  await api.excluirFilme(id);
  estado.filmes = estado.filmes.filter((x) => x.id !== id);
  cacheCartoes.delete(id);
  cacheFileira.delete(id);
  fecharPainel();
  const noDestaque = filmeNoDestaque() === id;
  estado.historico = estado.historico.filter((x) => x !== id);
  estado.indiceDestaque = Math.min(estado.indiceDestaque, estado.historico.length - 1);
  if (noDestaque) mostrarDestaque();
  render();
  aviso(`“${f.titulo}” foi excluído.`);
}

// ---------- Modais ----------

const modal = $('#modal');
let resolverModal = null;
// O evento `close` do <dialog> chega depois (assíncrono). Se o app fecha um
// modal e logo abre outro, esse evento atrasado não pode apagar o novo. Por isso
// os fechamentos feitos pelo app são resolvidos na hora, e o evento só trata o
// Esc nativo.
let fechamentosIgnorados = 0;

function finalizarModal(valor) {
  const resolver = resolverModal;
  resolverModal = null;
  if (resolver) resolver(valor);
}

function fecharModal(valor = null) {
  if (!modal.open) return;
  fechamentosIgnorados++;
  modal.close();
  modal.innerHTML = '';
  finalizarModal(valor);
}

function abrirModal(html, classe = '') {
  fecharModal(null);
  modal.className = `modal ${classe}`;
  modal.innerHTML = html;
  modal.showModal();
  return new Promise((resolve) => { resolverModal = resolve; });
}

modal.addEventListener('close', () => {
  if (fechamentosIgnorados) { fechamentosIgnorados--; return; }
  modal.innerHTML = '';
  finalizarModal(null);
});

// Clicar fora da caixa fecha o modal.
modal.addEventListener('mousedown', (e) => {
  if (e.target !== modal) return;
  const r = modal.getBoundingClientRect();
  const dentro = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  if (!dentro) fecharModal(null);
});

modal.addEventListener('click', (e) => {
  if (e.target.closest('[data-fechar]')) fecharModal(null);
});

function cabecalhoModal(titulo) {
  return `<div class="modal-cabecalho"><h2>${esc(titulo)}</h2><button class="btn btn-fantasma btn-icone" data-fechar aria-label="Fechar">${icone('X')}</button></div>`;
}

function perguntar({ titulo, texto, botoes }) {
  const html = `${cabecalhoModal(titulo)}
    <div class="modal-corpo"><p style="margin:0;color:var(--texto-2)">${esc(texto)}</p></div>
    <div class="modal-rodape">${botoes.map((b, i) => `<button class="btn ${b.classe || ''}" data-i="${i}">${esc(b.rotulo)}</button>`).join('')}</div>`;
  const promessa = abrirModal(html, 'modal-pequeno');
  $$('.modal-rodape button', modal).forEach((el) => {
    el.onclick = () => fecharModal(botoes[Number(el.dataset.i)].valor);
  });
  const principal = $('.modal-rodape button:last-child', modal);
  if (principal) principal.focus();
  return promessa;
}

function resultadosHTML(itens, atualId) {
  return itens.map((r, i) => `
    <button class="resultado${r.imdbID && r.imdbID === atualId ? ' atual' : ''}" data-i="${i}">
      <div class="capa">${r.poster ? `<img src="${esc(r.poster)}" alt="" loading="lazy" data-titulo="${esc(r.titulo)}" data-ano="${esc(r.ano)}">` : `<div class="capa-vazia"><strong>${esc(r.titulo)}</strong></div>`}</div>
      <strong>${esc(r.titulo)}</strong><span>${esc(r.ano)}${r.imdbID ? ` · ${esc(r.imdbID)}` : ''}</span>
    </button>`).join('');
}

function mensagemErroOmdb(erro) {
  if (erro.tipo === 'chave') return `${erro.mensagem}`;
  if (erro.tipo === 'limite') return erro.mensagem;
  return 'Sem conexão com o OMDb. Verifique a internet e tente de novo.';
}

// Caixa de busca no OMDb usada por "Trocar capa" e "Adicionar".
function montarBuscaOmdb({ termoInicial, atualId, aoEscolher }) {
  const input = $('#busca-omdb', modal);
  const area = $('#resultados-omdb', modal);
  let itens = [];
  let geracao = 0;

  async function buscar() {
    const termo = input.value.trim();
    if (!termo) { area.innerHTML = ''; return; }
    const minha = ++geracao;
    area.innerHTML = '<p class="mensagem carregando">Buscando no OMDb</p>';
    let r;
    if (/^tt\d+$/i.test(termo)) {
      r = await api.detalhesOmdb(termo.toLowerCase());
      if (r.ok) r.dados = r.dados ? [r.dados] : [];
    } else {
      r = await api.pesquisarOmdb(termo);
    }
    if (minha !== geracao || !modal.open) return;
    if (!r.ok) { area.innerHTML = `<p class="mensagem">${esc(mensagemErroOmdb(r.erro))}</p>`; return; }
    itens = r.dados;
    area.innerHTML = itens.length
      ? `<div class="resultados">${resultadosHTML(itens, atualId)}</div>`
      : '<p class="mensagem">Nada encontrado. Tente o título em inglês ou o código do IMDb (tt…).</p>';
  }

  input.value = termoInicial || '';
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } });
  $('#btn-busca-omdb', modal).onclick = buscar;
  area.addEventListener('click', (e) => {
    const b = e.target.closest('.resultado');
    if (b) aoEscolher(itens[Number(b.dataset.i)], b);
  });
  input.focus();
  input.select();
  if (termoInicial) buscar();
}

async function abrirTrocarCapa(id) {
  const f = porId(id);
  abrirModal(`${cabecalhoModal(`Trocar capa — ${f.titulo}`)}
    <div class="modal-corpo">
      <div class="busca-linha"><input id="busca-omdb" placeholder="Título (de preferência em inglês) ou código tt…" spellcheck="false"><button class="btn btn-laranja" id="btn-busca-omdb">Buscar</button></div>
      <div id="resultados-omdb"></div>
    </div>
    <div class="modal-rodape"><button class="btn" id="btn-capa-arquivo">${icone('FolderOpen')} Usar imagem minha…</button></div>`);
  $('#btn-capa-arquivo', modal).onclick = () => { fecharModal(); usarArquivoCapa(id); };
  montarBuscaOmdb({
    termoInicial: f.buscaCapa || f.titulo,
    atualId: f.imdbID,
    aoEscolher: async (escolha, botao) => {
      botao.disabled = true;
      const novo = await api.trocarCapa(id, { imdbID: escolha.imdbID, poster: escolha.poster });
      if (novo) Object.assign(f, novo);
      fecharModal();
      render();
      if (estado.painelId === id) renderPainel();
      aviso(escolha.poster ? 'Capa trocada.' : 'Esse resultado não tem capa no OMDb; guardei só o código do IMDb.', { tipo: 'ok' });
    },
  });
}

async function abrirAdicionar() {
  abrirModal(`${cabecalhoModal('Adicionar filme')}
    <div class="modal-corpo">
      <div class="busca-linha"><input id="busca-omdb" placeholder="Digite o título e tecle Enter" spellcheck="false"><button class="btn btn-laranja" id="btn-busca-omdb">Buscar</button></div>
      <div id="resultados-omdb"><p class="mensagem">Busque o filme no OMDb e clique no resultado certo.</p></div>
    </div>
    <div class="modal-rodape"><button class="btn btn-fantasma" id="btn-sem-buscar">Adicionar sem buscar</button></div>`);

  const adicionar = async (dados) => {
    const repetido = await api.acharRepetido(dados);
    if (repetido) {
      const seguir = await perguntar({
        titulo: 'Esse filme já está na lista',
        texto: `“${repetido.titulo}”${repetido.ano ? ` (${repetido.ano})` : ''} já está na sua lista. Adicionar mesmo assim?`,
        botoes: [
          { rotulo: 'Ver o que já está', valor: 'ver', classe: 'btn-fantasma' },
          { rotulo: 'Adicionar mesmo assim', valor: 'sim', classe: 'btn-laranja' },
        ],
      });
      if (seguir === 'ver') { abrirPainel(repetido.id); return; }
      if (seguir !== 'sim') return;
    }
    const novo = await api.adicionarFilme(dados);
    estado.filmes.push(novo);
    fecharModal();
    render();
    abrirPainel(novo.id);
    aviso(`“${novo.titulo}” foi adicionado.`, { tipo: 'ok' });
  };

  $('#btn-sem-buscar', modal).onclick = () => {
    const titulo = $('#busca-omdb', modal).value.trim();
    if (!titulo) { $('#busca-omdb', modal).focus(); aviso('Digite o título primeiro.'); return; }
    adicionar({ titulo });
  };

  montarBuscaOmdb({
    termoInicial: '',
    aoEscolher: async (escolha, botao) => {
      botao.classList.add('carregando');
      const r = await api.detalhesOmdb(escolha.imdbID);
      const d = r.ok && r.dados ? r.dados : null;
      await adicionar({
        titulo: (d && d.titulo) || escolha.titulo,
        ano: (d && d.ano) || escolha.ano || '',
        diretor: (d && d.diretor) || '',
        imdbID: escolha.imdbID,
        poster: (d && d.poster) || escolha.poster || '',
      });
    },
  });
}

// ---------- Trailers (YouTube) ----------

function urlTrailer(videoId, { mudo = true, controles = false, inicio = 0 } = {}) {
  const p = new URLSearchParams({
    autoplay: '1', mute: mudo ? '1' : '0', controls: controles ? '1' : '0',
    loop: '1', playlist: videoId, rel: '0', modestbranding: '1', iv_load_policy: '3',
    playsinline: '1', enablejsapi: '1', cc_load_policy: '0', disablekb: controles ? '0' : '1', fs: controles ? '1' : '0',
  });
  if (inicio > 1) p.set('start', String(Math.floor(inicio)));
  return `https://www.youtube-nocookie.com/embed/${videoId}?${p}`;
}

// Trailers de fundo (destaque e prévia) só aparecem enquanto estão tocando; antes
// disso fica a capa desfocada. A interface do YouTube por cima do vídeo é
// escondida pelo processo principal (limparTrailer em main.js).
const ESTADO_TOCANDO = 1;
const ESTADO_CARREGANDO = 3;

function iframeTrailer(videoId, classe, opcoes = {}) {
  const fr = document.createElement('iframe');
  fr.className = classe;
  fr.src = urlTrailer(videoId, opcoes);
  fr.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  fr.tabIndex = -1;
  fr.title = 'Trailer';
  if (!opcoes.controles) {
    fr.dataset.fundo = '';
    fr.addEventListener('load', () => {
      // Pede ao player que avise as mudanças de estado (API de iframe do YouTube).
      let tentativas = 0;
      const pedir = setInterval(() => {
        if (fr.dataset.ouvindo || ++tentativas > 20 || !fr.isConnected) { clearInterval(pedir); return; }
        if (fr.contentWindow) fr.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
      }, 250);
    }, { once: true });
  }
  return fr;
}

window.addEventListener('message', (e) => {
  if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin) || typeof e.data !== 'string') return;
  let dados;
  try { dados = JSON.parse(e.data); } catch { return; }
  const fr = $$('iframe[data-fundo]').find((f) => f.contentWindow === e.source);
  if (!fr) return;
  fr.dataset.ouvindo = '1';
  // Reforça o autoplay: em alguns casos o player fica parado em "não iniciado".
  if (dados.event === 'onReady') {
    comandoTrailer(fr, 'playVideo');
    if (fr.classList.contains('destaque-video')) aplicarPausaDestaque();
  }
  const info = dados.info;
  // Guarda o ponto do vídeo para o modo foco continuar de onde estava.
  if (info && typeof info.currentTime === 'number') fr.dataset.tempo = String(info.currentTime);
  let estadoPlayer = null;
  if (dados.event === 'onStateChange') estadoPlayer = info;
  else if (dados.event === 'infoDelivery' && info && typeof info.playerState === 'number') estadoPlayer = info.playerState;
  if (estadoPlayer === null || String(estadoPlayer) === fr.dataset.estado) return;
  fr.dataset.estado = String(estadoPlayer);
  // Carregando (3): mantém o último quadro na tela em vez de piscar a capa.
  if (estadoPlayer === ESTADO_CARREGANDO) return;
  fr.classList.toggle('visivel', estadoPlayer === ESTADO_TOCANDO);
  if (estadoPlayer === ESTADO_TOCANDO) {
    // Sem som o YouTube liga as legendas sozinho.
    comandoTrailer(fr, 'unloadModule', ['captions']);
    comandoTrailer(fr, 'unloadModule', ['cc']);
  }
});

// Uma busca por filme, compartilhada: a prévia já começa a procurar o trailer
// quando o mouse chega na capa, antes de abrir.
const buscasTrailer = new Map();
function trailerDe(id) {
  if (!buscasTrailer.has(id)) {
    buscasTrailer.set(id, api.obterTrailer(id).then((videoId) => {
      const f = porId(id);
      if (f && videoId) f.trailerId = videoId;
      return videoId;
    }, () => { buscasTrailer.delete(id); return null; }));
  }
  return buscasTrailer.get(id);
}

function comandoTrailer(iframe, func, args = []) {
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  }
}

const ICONE_MUDO = icone('VolumeX');
const ICONE_SOM = icone('Volume2');
const ICONE_PLAY = icone('Play');
const ICONE_MAIS_INFO = icone('ChevronDown');
// Logo do Letterboxd desenhado como o oficial (letterboxd-decal-dots): três
// círculos sobrepostos, laranja e azul cortados pelo verde, com as interseções
// em branco (versão para fundo escuro).
const LB_PONTOS = `<svg class="lb-pontos" viewBox="0 0 378 140" aria-hidden="true">
  <circle cx="189" cy="70" r="70" fill="#00E054"/>
  <path d="M129.85 33.7A70 70 0 1 0 129.85 106.3Z" fill="#FF8000"/>
  <path d="M248.15 33.56A70 70 0 1 1 248.15 106.44Z" fill="#40BCF4"/>
  <path d="M129.54 107.02C122.81 96.28 118.92 83.58 118.92 69.97S122.81 43.67 129.54 32.92C136.27 43.67 140.16 56.37 140.16 69.97S136.27 96.28 129.54 107.02Z" fill="#FFF"/>
  <path d="M248.46 32.92C255.19 43.67 259.08 56.37 259.08 69.97S255.19 96.28 248.46 107.02C241.73 96.28 237.84 83.58 237.84 69.97S241.73 43.67 248.46 32.92Z" fill="#FFF"/>
</svg>`;
const iconeSom = () => (estado.som ? ICONE_SOM : ICONE_MUDO);
const tituloSom = () => (estado.som ? 'Desligar o som' : 'Ligar o som');

function alternarSom() {
  estado.som = !estado.som;
  for (const fr of $$('iframe[data-fundo]')) comandoTrailer(fr, estado.som ? 'unMute' : 'mute');
  for (const b of $$('[data-d="som"], [data-v="som"], [data-p="som"]')) { b.innerHTML = iconeSom(); b.title = tituloSom(); }
}

// ---------- Trailer em foco: quase a tela toda, com som e controles ----------

const foco = $('#foco');

async function abrirFoco(id, tempo = 0) {
  const f = porId(id);
  if (!f) return;
  fecharPrevia(false);
  pausarDestaque('foco');
  comandoTrailer($('#painel .painel-video'), 'pauseVideo');
  foco.hidden = false;
  $('#foco-caixa').innerHTML = `
    <div class="foco-cabecalho">
      <h2>${esc(f.titulo)}${f.ano ? ` <span style="color:var(--texto-3);font-weight:600">${esc(f.ano)}</span>` : ''}</h2>
      <div style="display:flex;gap:8px">
        <button class="btn btn-assistir" data-f="stremio">${icone('Play')} Assistir</button>
        <button class="btn" data-f="fechar" title="Fechar (Esc)">${icone('X')} Fechar</button>
      </div>
    </div>
    <div class="foco-video"><p class="mensagem carregando">Procurando o trailer</p></div>`;
  foco.dataset.id = id;
  const videoId = await trailerDe(id);
  if (foco.hidden || foco.dataset.id !== id) return;
  const area = $('.foco-video', foco);
  if (!videoId) {
    area.innerHTML = '<p class="mensagem">Não achei o trailer. Cole um link do YouTube no campo “Trailer” do painel.</p>';
    return;
  }
  area.replaceChildren(iframeTrailer(videoId, '', { mudo: false, controles: true, inicio: tempo }));
}

function fecharFoco() {
  if (foco.hidden) return;
  foco.hidden = true;
  foco.dataset.id = '';
  $('#foco-caixa').innerHTML = '';
  retomarDestaque('foco');
  if (estado.painelId) comandoTrailer($('#painel .painel-video'), 'playVideo');
}

foco.addEventListener('click', (e) => {
  if (e.target === foco) { fecharFoco(); return; }
  const b = e.target.closest('[data-f]');
  if (!b) return;
  if (b.dataset.f === 'fechar') fecharFoco();
  if (b.dataset.f === 'stremio') abrirStremio(foco.dataset.id);
});

// Botão de tela cheia do painel: continua de onde o trailer de fundo estava.
function abrirTrailer(id) {
  abrirFoco(id, Number($('#painel .painel-video')?.dataset.tempo) || 0);
}

// ---------- Informações do OMDb (notas, duração, sinopse) ----------

function duracaoLegivel(texto) {
  const min = parseInt(texto, 10);
  if (!min) return '';
  const h = Math.floor(min / 60);
  return h ? `${h}h ${String(min % 60).padStart(2, '0')}m` : `${min}m`;
}

// Duração do Wikidata (f.duracao, em minutos) ou, se não houver, a do OMDb.
const duracaoDe = (f) => duracaoLegivel(f.duracao || (f.info && f.info.duracao) || '');
const generos = (info) => (info && info.genero ? info.genero.split(',').map((g) => g.trim()).filter(Boolean) : []);

// Destaque: "Crime • 1995 • 2h 50m • R", como "Show • Anime • 2026 • 16+" na Netflix.
function metaHTML(f) {
  const info = f.info || {};
  const partes = [];
  const g = generos(info);
  if (g.length) partes.push(esc(g.slice(0, 2).join(', ')));
  if (f.ano) partes.push(esc(f.ano));
  if (duracaoDe(f)) partes.push(esc(duracaoDe(f)));
  let html = partes.map((p) => `<span>${p}</span>`).join('');
  if (info.classificacao) html += ` <span class="classificacao">${esc(info.classificacao)}</span>`;
  if (f.favorito) html += '<span style="color:var(--dourado)">★ Favorito</span>';
  return html;
}

// Prévia: "[R] 1995 2h 50m", com os gêneros na linha de baixo.
function metaCurtaHTML(f) {
  const info = f.info || {};
  let html = '';
  if (info.classificacao) html += `<span class="classificacao">${esc(info.classificacao)}</span> `;
  html += [f.ano, duracaoDe(f)].filter(Boolean).map((p) => `<span>${esc(p)}</span>`).join('');
  if (f.favorito) html += '<span style="color:var(--dourado)">★ Favorito</span>';
  if (f.visto) html += '<span style="color:var(--verde)">✔ Visto</span>';
  return html;
}

function notasHTML(info) {
  if (!info) return '';
  const chips = [];
  if (info.imdb) chips.push(`<span class="nota-chip" title="Nota no IMDb"><span class="marca-imdb">IMDb</span>${esc(info.imdb)}</span>`);
  if (info.metascore) {
    const n = Number(info.metascore);
    const cor = n >= 61 ? '#54a72a' : n >= 40 ? '#d3a400' : '#e8302b';
    chips.push(`<span class="nota-chip" title="Metascore"><span class="marca-meta" style="background:${cor}">${esc(info.metascore)}</span><span class="rotulo-nota">Metascore</span></span>`);
  }
  if (info.rotten) {
    const fresco = parseInt(info.rotten, 10) >= 60;
    chips.push(`<span class="nota-chip" title="Rotten Tomatoes">${fresco ? '🍅' : '🤢'} ${esc(info.rotten)}</span>`);
  }
  return chips.join('');
}

function creditosHTML(f) {
  const partes = [];
  if (f.diretor) partes.push(`<b>Direção:</b> ${esc(f.diretor)}`);
  if (f.info && f.info.elenco) partes.push(`<b>Elenco:</b> ${esc(f.info.elenco.split(',').slice(0, 3).map((n) => n.trim()).join(', '))}`);
  return partes.join(' &nbsp;·&nbsp; ');
}

async function carregarInfo(f) {
  if (f.info || !f.imdbID) return f.info || null;
  const r = await api.infoFilme(f.id);
  if (r.ok && r.info) f.info = r.info;
  return f.info || null;
}

function fundoDesfocado(el, f) {
  const src = srcCapa(f);
  if (src) $('.destaque-fundo-capa', el).style.backgroundImage = `url("${src.replace(/"/g, '%22')}")`;
}

// ---------- Destaque: o sorteado ocupa o topo, como um carrossel ----------

let tokenDestaque = 0;
const origemSorteio = new Map();
const filmeNoDestaque = () => estado.historico[estado.indiceDestaque] || null;
// O próximo sorteio já é escolhido antes, para o trailer dele ir sendo buscado.
let proximoSorteio = null;

function sortear({ rolar = true, avisarSeVazio = true } = {}) {
  if (!estado.filmes.length) return;
  const candidatos = filtrados().filter((f) => !f.visto);
  if (!candidatos.length) {
    if (avisarSeVazio) aviso('Você já viu todos! 🎉', { tipo: 'ok' });
    return;
  }
  // Evita repetir os últimos sorteados quando há outras opções.
  const recentes = new Set(estado.historico.slice(-5));
  const opcoes = candidatos.filter((f) => !recentes.has(f.id));
  const lista = opcoes.length ? opcoes : candidatos;
  const aleatorio = (xs) => xs[Math.floor(Math.random() * xs.length)];
  const f = lista.find((x) => x.id === proximoSorteio) || aleatorio(lista);
  const resto = lista.filter((x) => x.id !== f.id);
  proximoSorteio = resto.length ? aleatorio(resto).id : null;
  if (proximoSorteio) trailerDe(proximoSorteio);

  const filtros = [];
  if (estado.filtro === 'favoritos') filtros.push('★ Favoritos');
  if (estado.diretor) filtros.push(estado.diretor);
  if (estado.pais) filtros.push(estado.pais);
  if (estado.busca.trim()) filtros.push(`“${estado.busca.trim()}”`);
  origemSorteio.set(f.id, `Sorteado entre ${candidatos.length} não visto${candidatos.length === 1 ? '' : 's'}${filtros.length ? ` · ${filtros.join(' · ')}` : ''}`);

  estado.historico = estado.historico.filter((id) => id !== f.id);
  estado.historico.push(f.id);
  if (estado.historico.length > 12) estado.historico.shift();
  estado.indiceDestaque = estado.historico.length - 1;
  mostrarDestaque();
  if (rolar) rolarTopo();
}

function mostrarDestaque(opcoes = {}) {
  const el = $('#destaque');
  const f = porId(filmeNoDestaque());
  if (!f) { fecharDestaque(); return; }
  const token = ++tokenDestaque;
  const n = estado.historico.length;
  const i = estado.indiceDestaque;
  $('#secao-sorteado').hidden = false;
  atualizarTopo();
  el.className = 'destaque';
  el.innerHTML = `
    <div class="destaque-fundo"><div class="destaque-fundo-capa"></div></div>
    <div class="destaque-sombra"></div>
    <div class="destaque-controles">
      <button class="btn-redondo" data-d="som" title="${tituloSom()}" aria-label="${tituloSom()}" hidden>${iconeSom()}</button>
    </div>
    <div class="destaque-info">
      <div class="destaque-identidade">
        <div class="destaque-poster" data-d="detalhes" title="Mais informações">${capaHTML(f, { tamanho: 'grande' })}</div>
        <div class="destaque-titulo">
          <h2>${esc(f.titulo)}</h2>
          <div class="meta-linha" data-info="meta">${metaHTML(f)}</div>
        </div>
      </div>
      <div class="destaque-textos">
        <div class="notas-linha" data-info="notas">${notasHTML(f.info)}</div>
        <p class="sinopse" data-info="sinopse"${f.info && f.info.sinopse ? '' : ' hidden'}>${esc(f.info ? f.info.sinopse : '')}</p>
        <p class="creditos" data-info="creditos">${creditosHTML(f)}</p>
        <div class="destaque-botoes">
          <button class="btn btn-assistir" data-d="assistir">${ICONE_PLAY} Assistir</button>
          <button class="btn btn-claro" data-d="detalhes">${icone('Info')} Mais info</button>
          <button class="redondo" data-d="sortear" title="Sortear outro" aria-label="Sortear outro">${icone('Dices')}</button>
          <button class="redondo${f.visto ? ' visto-on' : ''}" data-d="visto" title="${f.visto ? 'Desmarcar visto' : 'Marcar como visto'}" aria-label="Visto" aria-pressed="${f.visto}">${icone('Check')}</button>
          <button class="redondo" data-d="letterboxd" title="Logar no Letterboxd" aria-label="Logar no Letterboxd">${LB_PONTOS}</button>
        </div>
      </div>
    </div>
    <button class="seta seta-esq" data-d="anterior" ${i <= 0 ? 'disabled' : ''} title="Sorteado anterior" aria-label="Sorteado anterior">${icone('ChevronLeft')}</button>
    <button class="seta seta-dir" data-d="proximo" ${i >= n - 1 ? 'disabled' : ''} title="Próximo" aria-label="Próximo sorteado">${icone('ChevronRight')}</button>
    ${n > 1 ? `<div class="pontos">${estado.historico.map((_, k) => `<button data-ir="${k}" class="${k === i ? 'ativo' : ''}" title="Sorteio ${k + 1}" aria-label="Sorteio ${k + 1}"></button>`).join('')}</div>` : ''}
    <span class="dica-foco">Clique no trailer para ver em tela cheia</span>`;
  fundoDesfocado(el, f);
  entradaDestaque(el, opcoes);
  carregarExtrasDestaque(f, token);
}

// O fundo surge e se aproxima; depois rótulo, título, dados, sinopse e botões sobem em sequência.
function entradaDestaque(el, { rapido = false } = {}) {
  if (Movimento.desligado()) { Movimento.cruzar($('.destaque-info', el), 120); return; }
  const fator = rapido ? 0.6 : 1;
  Movimento.animar($('.destaque-fundo', el), [{ opacity: 0, transform: 'scale(1.06)' }, { opacity: 1, transform: 'none' }],
    { duration: 700 * fator, fill: 'backwards' });
  const t = $('.destaque-textos', el);
  Movimento.sequencia([$('.destaque-poster', el), $('.destaque-titulo h2', el), $('.destaque-titulo .meta-linha', el), $('.sinopse', t), $('.destaque-botoes', t)],
    { y: 16, duracao: 500 * fator, passo: 60 * fator, atrasoInicial: 120 * fator });
}

async function carregarExtrasDestaque(f, token) {
  const el = $('#destaque');
  carregarInfo(f).then((info) => {
    if (!info || token !== tokenDestaque) return;
    $('[data-info="meta"]', el).innerHTML = metaHTML(f);
    $('[data-info="notas"]', el).innerHTML = notasHTML(info);
    $('[data-info="creditos"]', el).innerHTML = creditosHTML(f);
    const sinopse = $('[data-info="sinopse"]', el);
    sinopse.textContent = info.sinopse;
    sinopse.hidden = !info.sinopse;
  });
  const videoId = await trailerDe(f.id);
  if (token !== tokenDestaque) return;
  if (!videoId) { el.classList.add('sem-trailer'); return; }
  f.trailerId = videoId;
  const fr = iframeTrailer(videoId, 'destaque-video', { mudo: !estado.som });
  fr.addEventListener('load', () => setTimeout(aplicarPausaDestaque, 800), { once: true });
  $('.destaque-fundo', el).append(fr);
  el.classList.add('com-trailer');
  $('[data-d="som"]', el).hidden = false;
}

function fecharDestaque() {
  tokenDestaque++;
  $('#destaque').innerHTML = '';
  $('#secao-sorteado').hidden = true;
  atualizarTopo();
}

$('#destaque').addEventListener('click', async (e) => {
  const id = filmeNoDestaque();
  if (!id) return;
  const ir = e.target.closest('[data-ir]');
  if (ir) { estado.indiceDestaque = Number(ir.dataset.ir); mostrarDestaque({ rapido: true }); return; }
  const b = e.target.closest('[data-d]');
  if (!b) {
    // Clicar no trailer (fora dos textos e botões) abre o modo foco.
    if (e.target.closest('.destaque-info')) return;
    const el = $('#destaque');
    if (el.classList.contains('com-trailer')) {
      const fr = $('.destaque-video', el);
      abrirFoco(id, Number(fr && fr.dataset.tempo) || 0);
    } else {
      abrirPainel(id);
    }
    return;
  }
  switch (b.dataset.d) {
    case 'assistir': abrirStremio(id); break;
    case 'letterboxd': abrirLetterboxd(id); break;
    case 'sortear': girarDado(b); sortear({ rolar: false }); break;
    case 'detalhes': abrirPainel(id); break;
    case 'som': alternarSom(); break;
    case 'anterior': estado.indiceDestaque--; mostrarDestaque({ rapido: true }); break;
    case 'proximo': estado.indiceDestaque++; mostrarDestaque({ rapido: true }); break;
    case 'visto': {
      const f = porId(id);
      await alternar(id, 'visto');
      b.classList.toggle('visto-on', f.visto);
      b.setAttribute('aria-pressed', String(f.visto));
      b.title = f.visto ? 'Desmarcar visto' : 'Marcar como visto';
      break;
    }
  }
});

// O trailer do destaque pausa quando sai da tela, quando a prévia toca ou
// quando o modo foco está aberto.
const motivosPausa = new Set();
function aplicarPausaDestaque() {
  const fr = $('#destaque .destaque-video');
  if (!fr) return;
  comandoTrailer(fr, motivosPausa.size ? 'pauseVideo' : 'playVideo');
  comandoTrailer(fr, estado.som ? 'unMute' : 'mute');
}
function pausarDestaque(motivo) { motivosPausa.add(motivo); aplicarPausaDestaque(); }
function retomarDestaque(motivo) { motivosPausa.delete(motivo); aplicarPausaDestaque(); }

new IntersectionObserver(([entrada]) => {
  if (entrada.isIntersecting) retomarDestaque('rolagem');
  else pausarDestaque('rolagem');
}, { root: principal, threshold: 0.3 }).observe($('#destaque'));

// ---------- Prévia: 1 s com o mouse sobre a capa e ela "vira" o trailer ----------

const previa = $('#previa');
const ATRASO_PREVIA = 1000;
const LARGURA_PREVIA = 360;
let cartaoSobMouse = null;
let cartaoPrevia = null;
let timerPrevia = null;
let timerFecharPrevia = null;
let tokenPrevia = 0;
let previaId = null;

function agendarFecharPrevia() {
  clearTimeout(timerFecharPrevia);
  timerFecharPrevia = setTimeout(() => fecharPrevia(), 180);
}

function fecharPrevia(animar = true) {
  clearTimeout(timerFecharPrevia);
  if (previa.hidden) return;
  tokenPrevia++;
  const cartao = cartaoPrevia;
  previaId = null;
  cartaoPrevia = null;
  retomarDestaque('previa');
  const esconder = () => { previa.hidden = true; previa.innerHTML = ''; };
  if (!animar || !cartao || !cartao.isConnected) { esconder(); return; }
  // Encolhe de volta para a capa de onde saiu.
  const anim = previa.animate([{ transform: 'none', opacity: 1 }, { ...transformacaoDaCapa(cartao), opacity: 0 }],
    { duration: 160, easing: 'ease-in' });
  anim.onfinish = esconder;
}

function transformacaoDaCapa(cartao) {
  const r = $('.capa', cartao).getBoundingClientRect();
  const p = previa.getBoundingClientRect();
  return { transform: `translate(${r.left - p.left}px, ${r.top - p.top}px) scale(${r.width / p.width}, ${r.height / p.height})` };
}

// A prévia fica centrada sobre a capa (cobrindo-a), sem sair da janela.
function posicionarPrevia(cartao) {
  const r = $('.capa', cartao).getBoundingClientRect();
  const margem = 14;
  const h = previa.offsetHeight;
  const x = Math.min(Math.max(r.left + r.width / 2 - LARGURA_PREVIA / 2, margem), innerWidth - LARGURA_PREVIA - margem - 12);
  const topoMin = $('.topo').getBoundingClientRect().bottom + 8;
  const y = Math.min(Math.max(r.top + r.height / 2 - h / 2, topoMin), innerHeight - h - margem);
  previa.style.left = `${x}px`;
  previa.style.top = `${Math.max(y, topoMin)}px`;
}

function previaHTML(f) {
  return `
    <div class="previa-video" data-v="focar" title="Clique para ver em tela cheia">
      <div class="destaque-fundo-capa"></div>
      <div class="previa-titulo">${esc(f.titulo)}</div>
      <button class="btn-redondo" data-v="som" title="${tituloSom()}" hidden>${iconeSom()}</button>
    </div>
    <div class="previa-corpo">
      <div class="previa-botoes">
        <button class="redondo branco" data-v="stremio" title="Assistir no Stremio">${ICONE_PLAY}</button>
        <button class="redondo${f.visto ? ' visto-on' : ''}" data-v="visto" title="${f.visto ? 'Desmarcar visto' : 'Marcar como visto'}" aria-label="Visto">${icone('Check')}</button>
        <button class="redondo${f.favorito ? ' fav-on' : ''}" data-v="favorito" title="${f.favorito ? 'Tirar dos favoritos' : 'Favoritar'}" aria-label="Favorito">${icone('Star')}</button>
        <button class="redondo" data-v="letterboxd" title="Letterboxd">${LB_PONTOS}</button>
        <span class="espaco"></span>
        <button class="redondo" data-v="detalhes" title="Mais informações">${ICONE_MAIS_INFO}</button>
      </div>
      <div class="meta-linha" data-info="meta">${metaCurtaHTML(f)}</div>
      <div class="generos" data-info="generos">${esc(generos(f.info).slice(0, 3).join(' • '))}</div>
      <div class="notas-linha" data-info="notas">${notasHTML(f.info)}</div>
      ${f.diretor ? `<p class="creditos"><b>Direção:</b> ${esc(f.diretor)}</p>` : ''}
      ${f.notas ? `<p class="notas-pessoais">${esc(f.notas)}</p>` : ''}
    </div>`;
}

async function abrirPrevia(cartao) {
  if (modal.open || estado.painelId || !foco.hidden || !cartao.isConnected) return;
  const f = porId(cartao.dataset.id);
  if (!f) return;
  const token = ++tokenPrevia;
  previaId = f.id;
  cartaoPrevia = cartao;
  previa.innerHTML = previaHTML(f);
  fundoDesfocado(previa, f);
  previa.hidden = false;
  posicionarPrevia(cartao);
  // Cresce a partir da capa, como na Netflix.
  previa.animate([{ ...transformacaoDaCapa(cartao), opacity: 0.5 }, { transform: 'none', opacity: 1 }],
    { duration: 230, easing: 'cubic-bezier(.2, .75, .25, 1)' });
  pausarDestaque('previa');

  carregarInfo(f).then((info) => {
    if (token !== tokenPrevia || !info) return;
    $('[data-info="meta"]', previa).innerHTML = metaCurtaHTML(f);
    $('[data-info="generos"]', previa).textContent = generos(info).slice(0, 3).join(' • ');
    $('[data-info="notas"]', previa).innerHTML = notasHTML(info);
  });
  const videoId = await trailerDe(f.id);
  if (token !== tokenPrevia) return;
  const area = $('.previa-video', previa);
  if (!videoId) {
    area.insertAdjacentHTML('beforeend', '<div class="sem-trailer">Trailer não encontrado</div>');
    return;
  }
  f.trailerId = videoId;
  area.insertBefore(iframeTrailer(videoId, '', { mudo: !estado.som }), $('.previa-titulo', area));
  $('[data-v="som"]', area).hidden = false;
}

// Cartões da grade e da fileira de favoritos abrem a prévia.
// mousemove (e não mouseover) para que, depois de uma rolagem, a prévia volte a
// ser agendada assim que o mouse se mexer sobre a capa.
principal.addEventListener('mousemove', (e) => {
  // Mirando os botões redondos da capa: nada de trailer, só o clique que a pessoa quer.
  if (e.target.closest('.acoes')) {
    cartaoSobMouse = null;
    clearTimeout(timerPrevia);
    if (previaId) fecharPrevia(false);
    return;
  }
  const cartao = e.target.closest('.lista.grade .cartao, .fileira .cartao');
  if (!cartao || cartao === cartaoSobMouse) return;
  cartaoSobMouse = cartao;
  trailerDe(cartao.dataset.id);
  clearTimeout(timerPrevia);
  if (previaId) fecharPrevia(false);
  timerPrevia = setTimeout(() => abrirPrevia(cartao), ATRASO_PREVIA);
});

principal.addEventListener('mouseover', (e) => {
  if (!e.target.closest('.acoes')) return;
  cartaoSobMouse = null;
  clearTimeout(timerPrevia);
  if (previaId) fecharPrevia(false);
});

principal.addEventListener('mouseout', (e) => {
  const cartao = e.target.closest('.cartao');
  if (!cartao || (e.relatedTarget && cartao.contains(e.relatedTarget))) return;
  cartaoSobMouse = null;
  clearTimeout(timerPrevia);
});

previa.addEventListener('mouseenter', () => clearTimeout(timerFecharPrevia));
previa.addEventListener('mouseleave', () => {
  cartaoSobMouse = null;
  agendarFecharPrevia();
});

previa.addEventListener('click', async (e) => {
  if (!previaId) return;
  const id = previaId;
  const f = porId(id);
  const b = e.target.closest('[data-v]');
  if (!b) return;
  switch (b.dataset.v) {
    case 'som': e.stopPropagation(); alternarSom(); break;
    case 'focar': {
      const fr = $('.previa-video iframe', previa);
      abrirFoco(id, Number(fr && fr.dataset.tempo) || 0);
      break;
    }
    case 'stremio': abrirStremio(id); break;
    case 'letterboxd': abrirLetterboxd(id); break;
    case 'detalhes': fecharPrevia(false); abrirPainel(id); break;
    case 'visto':
    case 'favorito': {
      const campo = b.dataset.v;
      await alternar(id, campo);
      b.classList.toggle(campo === 'visto' ? 'visto-on' : 'fav-on', f[campo]);
      $('[data-info="meta"]', previa).innerHTML = metaCurtaHTML(f);
      break;
    }
  }
});

principal.addEventListener('scroll', () => {
  clearTimeout(timerPrevia);
  cartaoSobMouse = null;
  fecharPrevia(false);
}, { passive: true });
window.addEventListener('blur', () => { clearTimeout(timerPrevia); fecharPrevia(false); });

// ---------- Configurações, importação e exportação ----------

// ---------- Chave do OMDb ----------

// Confere a chave no OMDb e salva. Sem internet (ou com o limite do dia
// esgotado) não dá para conferir, mas a chave é salva assim mesmo.
async function salvarChaveOmdb(chave) {
  chave = chave.trim();
  if (!chave) return { ok: false, mensagem: 'Cole a chave que chegou no seu e-mail.' };
  const r = await api.testarChave(chave);
  if (!r.ok && r.erro.tipo === 'chave') {
    return { ok: false, mensagem: 'Essa chave não funcionou. Confira se copiou certinho e se já clicou no link de ativação do e-mail.' };
  }
  estado.config = await api.salvarConfig({ omdbKey: chave });
  return { ok: true, conferida: r.ok || r.erro.tipo === 'limite' };
}

// Abre ao iniciar enquanto não houver chave salva; também dá para abrir pelo aviso de "configure a chave".
function pedirChaveOmdb() {
  abrirModal(`${cabecalhoModal('Chave do OMDb')}
    <div class="modal-corpo chave-omdb">
      <p>O nandflix usa o <b>OMDb</b> para buscar as capas, notas e sinopses dos filmes. Para isso, cada pessoa precisa da própria chave, que é <b>gratuita</b> (1.000 consultas por dia).</p>
      <ol>
        <li>Abra a página de cadastro do OMDb: <button class="link-chave" id="chave-site">omdbapi.com/apikey.aspx</button></li>
        <li>Escolha o plano <b>FREE</b>, preencha seu e-mail e o resto do formulário e clique em <b>Submit</b>.</li>
        <li>Abra o e-mail que o OMDb mandou e clique no <b>link de ativação</b>. Sem isso a chave não funciona.</li>
        <li>Copie a chave que veio no mesmo e-mail (8 letras e números, como <code>1a2b3c4d</code>) e cole aqui:</li>
      </ol>
      <div class="busca-linha">
        <input id="chave-campo" placeholder="Sua chave do OMDb" spellcheck="false" autocomplete="off">
        <button class="btn btn-primario" id="chave-salvar">Salvar chave</button>
      </div>
      <p class="chave-status" id="chave-status" role="status"></p>
    </div>
    <div class="modal-rodape"><button class="btn btn-fantasma" data-fechar>Agora não</button></div>`, 'modal-pequeno modal-chave');

  const campo = $('#chave-campo', modal);
  const status = $('#chave-status', modal);
  const botao = $('#chave-salvar', modal);
  $('#chave-site', modal).onclick = () => window.open('https://www.omdbapi.com/apikey.aspx');
  const salvar = async () => {
    botao.disabled = true;
    status.className = 'chave-status carregando';
    status.textContent = 'Conferindo a chave';
    const r = await salvarChaveOmdb(campo.value);
    botao.disabled = false;
    if (!r.ok) {
      status.className = 'chave-status erro';
      status.textContent = r.mensagem;
      campo.focus();
      return;
    }
    fecharModal();
    aviso(r.conferida ? 'Chave salva. As capas vão começar a aparecer.' : 'Chave salva (não deu para conferir agora: sem conexão com o OMDb).', { tipo: 'ok', duracao: 5000 });
    if (estado.filmes.length) buscarCapas({ automatica: true });
  };
  botao.onclick = salvar;
  campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') salvar(); });
  campo.focus();
}

function abrirConfiguracoes() {
  const c = estado.config;
  const semCapa = estado.filmes.filter((f) => !f.poster).length;
  const naoEncontradas = estado.filmes.filter((f) => !f.poster && f.capaNaoEncontrada).length;
  const mod = MAC ? '⌘' : 'Ctrl';
  abrirModal(`${cabecalhoModal('Configurações')}
    <div class="modal-corpo">
      <div class="secao">
        <h3>OMDb (capas e dados dos filmes)</h3>
        <div class="busca-linha" style="margin:0">
          <input id="cfg-chave" value="${esc(c.omdbKey)}" placeholder="Chave da API" spellcheck="false">
          <button class="btn btn-laranja" id="cfg-salvar-chave">Salvar chave</button>
        </div>
        <p>Chave gratuita (1.000 consultas por dia). <button class="link-chave" id="cfg-como-chave">Como pegar a minha chave</button></p>
      </div>
      <div class="secao">
        <h3>Abrir Stremio pelo</h3>
        <div class="opcoes-radio">
          <label><input type="radio" name="stremio" value="app" ${c.stremio !== 'web' ? 'checked' : ''}> App instalado</label>
          <label><input type="radio" name="stremio" value="web" ${c.stremio === 'web' ? 'checked' : ''}> Stremio Web</label>
        </div>
      </div>
      <div class="secao">
        <h3>Capas e informações</h3>
        <div class="linha-botoes">
          <button class="btn" id="cfg-capas" ${semCapa ? '' : 'disabled'}>${icone('ImagePlus')} Buscar capas que faltam (${semCapa})</button>
          <button class="btn" id="cfg-infos" ${semInformacoes() ? '' : 'disabled'} title="País, notas, gêneros e sinopse dos filmes que ainda não têm">${icone('RefreshCw')} Buscar informações que faltam (${semInformacoes()})</button>
        </div>
        <p>${naoEncontradas ? `${naoEncontradas} filme(s) não foram encontrados no OMDb e ficam fora da busca automática. Use “Trocar capa” ou preencha “Busca da capa” com o título em inglês.` : 'A busca automática roda ao abrir o app.'}</p>
      </div>
      <div class="secao">
        <h3>Planilha e backup</h3>
        <div class="linha-botoes">
          <button class="btn" id="cfg-importar">Importar planilha</button>
          <button class="btn" id="cfg-exportar">Exportar para Excel</button>
          <button class="btn" id="cfg-backup-exp">Exportar backup</button>
          <button class="btn" id="cfg-backup-imp">Importar backup</button>
          <button class="btn" id="cfg-capas-todas">${icone('Download')} Baixar todas as capas</button>
          <button class="btn btn-fantasma" id="cfg-pasta">Abrir pasta de dados</button>
        </div>
        <p>Tudo é salvo automaticamente. Um backup é guardado cada vez que o app abre (os 5 últimos).</p>
      </div>
      <div class="secao">
        <h3>Atalhos</h3>
        <div class="atalhos">
          <kbd>${mod} F</kbd><span>Pesquisar</span>
          <kbd>${mod} N</kbd><span>Adicionar filme</span>
          <kbd>R</kbd><span>Sortear</span>
          <kbd>Esc</kbd><span>Fechar painel ou janela</span>
        </div>
      </div>
    </div>`);

  $('#cfg-salvar-chave', modal).onclick = async () => {
    const r = await salvarChaveOmdb($('#cfg-chave', modal).value);
    if (!r.ok) { aviso(r.mensagem, { tipo: 'erro', duracao: 7000 }); return; }
    aviso(r.conferida ? 'Chave salva e conferida.' : 'Chave salva (não deu para conferir agora: sem conexão com o OMDb).', { tipo: 'ok' });
  };
  $('#cfg-como-chave', modal).onclick = pedirChaveOmdb;
  $$('input[name="stremio"]', modal).forEach((r) => {
    r.onchange = async () => { estado.config = await api.salvarConfig({ stremio: r.value }); };
  });
  $('#cfg-capas', modal).onclick = () => { fecharModal(); buscarCapas({ incluirNaoEncontradas: true }); };
  $('#cfg-infos', modal).onclick = () => { fecharModal(); buscarInfos(); };
  $('#cfg-importar', modal).onclick = () => { fecharModal(); importarPlanilha(); };
  $('#cfg-exportar', modal).onclick = exportarPlanilha;
  $('#cfg-backup-exp', modal).onclick = async () => {
    const r = await api.exportarBackup();
    if (r.arquivo) aviso(`Backup salvo em ${r.arquivo}`, { tipo: 'ok', duracao: 6000 });
  };
  $('#cfg-backup-imp', modal).onclick = importarBackup;
  $('#cfg-pasta', modal).onclick = () => api.abrirPastaDados();
  $('#cfg-capas-todas', modal).onclick = async () => {
    const r = await api.baixarTodasCapas();
    if (r.pasta) aviso(`${r.salvas} capas salvas em ${r.pasta}`, { tipo: 'ok', duracao: 6000 });
  };
}

async function exportarPlanilha() {
  const r = await api.exportarPlanilha();
  if (r.arquivo) aviso(`Planilha salva em ${r.arquivo}`, { tipo: 'ok', duracao: 6000 });
}

function substituirLista(filmes) {
  estado.filmes = filmes;
  cacheCartoes.clear();
  cacheFileira.clear();
  fecharPainel();
  estado.historico = [];
  estado.indiceDestaque = -1;
  fecharDestaque();
  render();
  sortear({ rolar: false, avisarSeVazio: false });
}

function mostrarResumo(titulo, r, extra = '') {
  abrirModal(`${cabecalhoModal(titulo)}
    <div class="modal-corpo">
      <div class="numeros">
        <div class="numero"><b>${r.total}</b><span>filmes</span></div>
        <div class="numero"><b style="color:var(--verde)">${r.vistos}</b><span>vistos</span></div>
        <div class="numero"><b style="color:var(--dourado)">${r.favoritos}</b><span>favoritos</span></div>
        <div class="numero"><b style="color:var(--azul)">${r.comCapa}</b><span>com capa</span></div>
      </div>
      ${extra}
    </div>
    <div class="modal-rodape"><button class="btn btn-laranja" data-fechar>OK</button></div>`);
}

async function importarPlanilha() {
  const r = await api.lerPlanilha();
  if (r.cancelado) return;
  if (r.erro) { aviso(r.erro, { tipo: 'erro', duracao: 7000 }); return; }
  let modo = 'substituir';
  if (r.jaTemFilmes) {
    modo = await perguntar({
      titulo: 'Importar planilha',
      texto: `“${r.arquivo}” tem ${r.total} filmes. Você quer substituir a lista atual ou juntar as duas? Ao juntar, filmes repetidos (mesmo IMDb, ou mesmo título e ano) mantêm os dados do app.`,
      botoes: [
        { rotulo: 'Cancelar', valor: null, classe: 'btn-fantasma' },
        { rotulo: 'Substituir tudo', valor: 'substituir', classe: 'btn-perigo' },
        { rotulo: 'Juntar', valor: 'juntar', classe: 'btn-laranja' },
      ],
    });
    if (!modo) return;
  }
  const res = await api.aplicarPlanilha(modo);
  if (res.erro) { aviso(res.erro, { tipo: 'erro' }); return; }
  substituirLista(res.filmes);
  const extra = modo === 'juntar'
    ? `<p style="margin:0;color:var(--texto-2)">${res.adicionados} filme(s) novos adicionados, ${res.repetidos} repetido(s) ignorados.</p>`
    : `<p style="margin:0;color:var(--texto-2)">${res.adicionados} filmes importados. As capas que faltam serão buscadas em segundo plano.</p>`;
  mostrarResumo('Planilha importada', res, extra);
  buscarCapas({ automatica: true });
}

async function importarBackup() {
  const ok = await perguntar({
    titulo: 'Importar backup',
    texto: 'Importar um backup substitui a lista atual inteira. (A lista atual é guardada antes em backups.) Continuar?',
    botoes: [
      { rotulo: 'Cancelar', valor: false, classe: 'btn-fantasma' },
      { rotulo: 'Escolher arquivo…', valor: true, classe: 'btn-laranja' },
    ],
  });
  if (!ok) return;
  const r = await api.importarBackup();
  if (r.cancelado) return;
  if (r.erro) { aviso(r.erro, { tipo: 'erro', duracao: 6000 }); return; }
  substituirLista(r.filmes);
  mostrarResumo('Backup importado', r);
  buscarCapas({ automatica: true });
}

// ---------- Busca de capas em segundo plano ----------

async function buscarCapas(opcoes) {
  if (!estado.config.omdbKey) {
    aviso('Coloque a sua chave do OMDb para buscar as capas.', { acao: { rotulo: 'Colocar chave', fn: pedirChaveOmdb } });
    return;
  }
  const r = await api.buscarCapas(opcoes);
  if (r && r.pulada === 'limite' && !opcoes.automatica) aviso('O limite diário do OMDb já foi atingido hoje.');
}

// ---------- Busca das informações que faltam (país, notas, gêneros, sinopse) ----------

const semInformacoes = () => estado.filmes.filter((f) => f.imdbID && !f.info).length;

async function buscarInfos() {
  const r = await api.buscarInfos();
  if (r.pulada === 'chave') { pedirChaveOmdb(); return; }
  if (r.emAndamento) { aviso('A busca de informações já está rodando.'); return; }
  if (!r.total) aviso('Todos os filmes já têm as informações do OMDb.', { tipo: 'ok' });
}

api.aoProgressoInfos(({ feitos, total }) => {
  estado.buscandoInfos = true;
  $('#progresso-capas').hidden = false;
  $('#progresso-cheio').style.width = `${total ? (feitos / total) * 100 : 0}%`;
  $('#progresso-texto').textContent = `Buscando países e notas… ${feitos} de ${total}`;
});

api.aoFimInfos(({ total, faltam, erro }) => {
  estado.buscandoInfos = false;
  if (!estado.buscandoCapas) $('#progresso-capas').hidden = true;
  if (erro && erro.tipo === 'limite') {
    aviso(`O limite diário do OMDb acabou. Faltam ${faltam} filme(s); a busca continua amanhã, ao abrir o app.`, { tipo: 'erro', duracao: 9000 });
  } else if (erro) {
    const acao = erro.tipo === 'chave' ? { rotulo: 'Colocar chave', fn: pedirChaveOmdb } : undefined;
    aviso(erro.mensagem, { tipo: 'erro', duracao: 9000, acao });
  } else {
    aviso(`Informações carregadas: ${total - faltam} filme(s).`, { tipo: 'ok' });
  }
});

api.aoProgressoCapas(({ feitos, total }) => {
  estado.buscandoCapas = true;
  $('#progresso-capas').hidden = false;
  $('#progresso-cheio').style.width = `${total ? (feitos / total) * 100 : 0}%`;
  $('#progresso-texto').textContent = `Buscando capas… ${feitos} de ${total}`;
  $('#btn-capas-faltam').hidden = true;
});

api.aoFimCapas((r) => {
  estado.buscandoCapas = false;
  if (!estado.buscandoInfos) $('#progresso-capas').hidden = true;
  atualizarEstatisticas();
  if (r.erro) {
    const acao = r.erro.tipo === 'chave' ? { rotulo: 'Configurações', fn: abrirConfiguracoes } : undefined;
    aviso(r.erro.mensagem, { tipo: 'erro', duracao: 9000, acao });
  } else if (r.total) {
    aviso(`Busca de capas concluída: ${r.encontradas} encontrada(s).`, { tipo: 'ok' });
  }
});

api.aoMudarFilme((novo) => {
  const f = porId(novo.id);
  if (!f) return;
  // Só os campos da capa: o que o usuário está digitando no painel não é sobrescrito.
  for (const k of ['imdbID', 'poster', 'capaLocal', 'capaNaoEncontrada', 'info', 'duracao', 'duracaoDe']) f[k] = novo[k];
  agendarRender();
  if (filmeNoDestaque() === f.id) {
    const capa = $('#destaque .destaque-poster .capa');
    fundoDesfocado($('#destaque'), f);
    if (capa) capa.outerHTML = capaHTML(f, { tamanho: 'grande' });
  }
  if (estado.painelId === f.id) {
    const capa = $('.painel-capa .capa');
    if (capa) capa.outerHTML = capaHTML(f, { tamanho: 'grande' });
  }
});

// ---------- Eventos da página ----------

principal.addEventListener('click', (e) => {
  const cartao = e.target.closest('.lista .cartao, .fileira .cartao');
  if (!cartao) return;
  const id = cartao.dataset.id;
  const botao = e.target.closest('[data-acao]');
  if (!botao) { abrirPainel(id); return; }
  e.stopPropagation();
  switch (botao.dataset.acao) {
    case 'visto': alternar(id, 'visto'); break;
    case 'favorito': alternar(id, 'favorito'); break;
    case 'stremio': abrirStremio(id); break;
    case 'letterboxd': abrirLetterboxd(id); break;
    case 'diretor': filtrarDiretor(porId(id).diretor); break;
  }
});

principal.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.classList.contains('cartao')) abrirPainel(e.target.dataset.id);
});

let timerBusca = null;
$('#pesquisa').addEventListener('input', (e) => {
  clearTimeout(timerBusca);
  timerBusca = setTimeout(() => { estado.busca = e.target.value; render(); rolarParaLista(); }, 80);
});

$$('.chip[data-filtro]').forEach((chip) => {
  chip.addEventListener('click', () => {
    estado.filtro = chip.dataset.filtro;
    $$('.chip[data-filtro]').forEach((c) => {
      c.classList.toggle('ativo', c === chip);
      c.setAttribute('aria-checked', String(c === chip));
    });
    render();
    cruzarLista();
    rolarParaLista();
  });
});

$('#chip-diretor').addEventListener('click', () => filtrarDiretor(''));
$('#chip-pais').addEventListener('click', () => filtrarPais(''));

$('#ordenacao').addEventListener('change', async (e) => {
  estado.ordenacao = e.target.value;
  render();
  cruzarLista();
  estado.config = await api.salvarConfig({ ordenacao: estado.ordenacao });
});

function aplicarVista(vista) {
  estado.vista = vista;
  $$('.alternar-vista .btn').forEach((b) => {
    b.classList.toggle('ativo', b.dataset.vista === vista);
    b.setAttribute('aria-pressed', String(b.dataset.vista === vista));
  });
  render();
}
$$('.alternar-vista .btn').forEach((b) => {
  b.addEventListener('click', async () => {
    aplicarVista(b.dataset.vista);
    cruzarLista();
    estado.config = await api.salvarConfig({ visualizacao: b.dataset.vista });
  });
});

$('#btn-sortear').addEventListener('click', (e) => { girarDado(e.currentTarget); sortear(); });

// Retorno do botão de sortear: o dado dá meia-volta.
function girarDado(botao) {
  Movimento.animar($('.ico', botao), [{ transform: 'rotate(0)' }, { transform: 'rotate(180deg)' }], { duration: 240 });
}

// Pesquisa: só a lupa aparece; a caixa abre ao clicar nela (ou Ctrl/⌘ F).
function abrirPesquisa() {
  $('#pesquisa-caixa').classList.add('aberta');
  $('#pesquisa').tabIndex = 0;
  $('#pesquisa').focus();
  $('#pesquisa').select();
}
$('#btn-lupa').addEventListener('mousedown', (e) => e.preventDefault());
$('#btn-lupa').addEventListener('click', () => {
  if ($('#pesquisa-caixa').classList.contains('aberta') && !$('#pesquisa').value) $('#pesquisa').blur();
  else abrirPesquisa();
});
function fecharPesquisa() {
  $('#pesquisa-caixa').classList.remove('aberta');
  $('#pesquisa').tabIndex = -1;
}
$('#pesquisa').addEventListener('blur', () => {
  if (!$('#pesquisa').value) fecharPesquisa();
});
$('#btn-adicionar').addEventListener('click', abrirAdicionar);
$('#btn-adicionar-vazio').addEventListener('click', abrirAdicionar);
$('#btn-config').addEventListener('click', abrirConfiguracoes);
$('#btn-importar-vazio').addEventListener('click', importarPlanilha);
$('#btn-capas-faltam').addEventListener('click', () => buscarCapas({ incluirNaoEncontradas: true }));

function digitandoEm(el) {
  return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

document.addEventListener('keydown', (e) => {
  const mod = MAC ? e.metaKey : e.ctrlKey;
  if (mod && !e.altKey && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    if (modal.open) fecharModal();
    abrirPesquisa();
    return;
  }
  if (mod && !e.altKey && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    abrirAdicionar();
    return;
  }
  if (e.key === 'Escape' && !foco.hidden) {
    fecharFoco();
    return;
  }
  if (e.key === 'Escape' && !previa.hidden) {
    fecharPrevia();
    return;
  }
  if (e.key === 'Escape' && !modal.open && estado.painelId) {
    fecharPainel();
    return;
  }
  if (e.key === 'Escape' && document.activeElement === $('#pesquisa')) {
    $('#pesquisa').value = '';
    estado.busca = '';
    render();
    $('#pesquisa').blur();
    fecharPesquisa();
    return;
  }
  if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey && !modal.open && foco.hidden && !digitandoEm(document.activeElement)) {
    e.preventDefault();
    sortear();
  }
});

// ---------- Início ----------

(async function iniciar() {
  $('#btn-lupa').dataset.dica = `Pesquisar (${MAC ? '⌘' : 'Ctrl'} F)`;
  const dados = await api.carregar();
  estado.filmes = dados.filmes;
  estado.config = dados.config;
  estado.ordenacao = dados.config.ordenacao || 'ordem';
  $('#ordenacao').value = estado.ordenacao;
  aplicarVista(dados.config.visualizacao === 'lista' ? 'lista' : 'grade');
  // Já começa com um filme sorteado.
  sortear({ rolar: false, avisarSeVazio: false });
  if (!estado.config.omdbKey) pedirChaveOmdb();
  else if (estado.filmes.length) buscarCapas({ automatica: true });
})();
