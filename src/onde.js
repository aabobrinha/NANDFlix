'use strict';

// ---------- Onde assistir: streaming, cinema e Stremio ----------
//
// Os dados vêm de lib/extras.js (f.extras): os serviços de streaming do país
// (JustWatch, pelo TMDB), se o filme está nos cinemas e se está no catálogo do
// Stremio. Em Configurações a pessoa escolhe o país e os serviços que assina
// (meusServicos, ids do TMDB): esses aparecem primeiro, destacados, e viram
// filtro na lista, no sorteio e nas fileiras do celular.

const PAISES_ONDE = {
  BR: 'Brasil', PT: 'Portugal', US: 'Estados Unidos', CA: 'Canadá', GB: 'Reino Unido', IE: 'Irlanda',
  ES: 'Espanha', FR: 'França', DE: 'Alemanha', IT: 'Itália', NL: 'Países Baixos', MX: 'México',
  AR: 'Argentina', CL: 'Chile', CO: 'Colômbia', JP: 'Japão', AU: 'Austrália',
};
const GRUPOS_ONDE = [['assinatura', 'Assinatura'], ['gratis', 'Grátis'], ['aluguel', 'Aluguel'], ['compra', 'Compra']];

const paisOnde = () => String(estado.config.pais || 'BR').toUpperCase();
const meusServicos = () => new Set((estado.config.meusServicos || []).map(Number));
const extrasDoPais = (f) => (f && f.extras && f.extras.pais === paisOnde() ? f.extras : null);

// Os serviços em que o filme está por assinatura ou de graça (o que dá para "só dar o play").
function servicosDoFilme(f) {
  const ex = extrasDoPais(f);
  if (!ex || !ex.onde) return [];
  return [...(ex.onde.assinatura || []), ...(ex.onde.gratis || [])];
}

// Filtros de "onde assistir" (lista, sorteio e celular).
const FILTROS_ONDE = {
  meus: { rotulo: 'Nos meus serviços', passa: (f) => { const meus = meusServicos(); return servicosDoFilme(f).some((s) => meus.has(Number(s.id))); } },
  streaming: { rotulo: 'Em algum streaming', passa: (f) => servicosDoFilme(f).length > 0 },
  cinema: { rotulo: 'Nos cinemas', passa: (f) => (extrasDoPais(f) || {}).cinema === 'agora' },
  stremio: { rotulo: 'No Stremio', passa: (f) => (f.extras || {}).stremio === true },
};
const passaOnde = (f, chave) => !FILTROS_ONDE[chave] || FILTROS_ONDE[chave].passa(f);
// Os filtros que fazem sentido agora ("Nos meus serviços" só com serviços escolhidos).
const filtrosOndeDisponiveis = () => Object.keys(FILTROS_ONDE).filter((k) => k !== 'meus' || meusServicos().size);

const dataCurta = (iso) => { const [a, m, d] = String(iso).split('-'); return a && m && d ? `${d}/${m}` : ''; };

function logoServicoHTML(s, link, meus) {
  const meu = meus.has(Number(s.id));
  return `<button type="button" class="servico${meu ? ' meu' : ''}" data-link="${esc(link)}" title="${esc(s.nome)}${meu ? ' (você assina)' : ''}" aria-label="${esc(s.nome)}">
    ${s.logo ? `<img src="${esc(s.logo)}" alt="" loading="lazy">` : `<span>${esc(s.nome.slice(0, 2))}</span>`}
  </button>`;
}

// O bloco "Onde assistir" dos detalhes.
function ondeAssistirHTML(f) {
  if (f.externo) return '';
  const ex = extrasDoPais(f);
  if (!ex) return f.tmdbId || f.imdbID ? `<p class="onde-carregando">Procurando onde assistir…</p>` : '';
  const meus = meusServicos();
  const link = (ex.onde && ex.onde.link) || (f.tmdbId ? `https://www.themoviedb.org/movie/${f.tmdbId}/watch?locale=${paisOnde()}` : '');
  const selos = [];
  if (ex.cinema === 'agora') selos.push(`<span class="onde-selo onde-cinema">${icone('Clapperboard')} Nos cinemas</span>`);
  if (ex.cinema === 'em-breve') selos.push(`<span class="onde-selo onde-cinema">${icone('Clapperboard')} Nos cinemas a partir de ${dataCurta(ex.cinemaData)}</span>`);
  if (ex.stremio === true) selos.push(`<button type="button" class="onde-selo onde-stremio" data-p="stremio" title="Está no catálogo do Stremio. Se dá para assistir depende dos complementos (add-ons) do seu Stremio.">${icone('Play')} No Stremio</button>`);
  if (ex.stremio === false) selos.push(`<span class="onde-selo onde-fora" title="Não achei ${typeof f !== 'undefined' ? vocDe(f, 'este') : 'o título'} no catálogo do Stremio (Cinemeta).">Fora do catálogo do Stremio</span>`);
  const grupos = GRUPOS_ONDE.map(([chave, rotulo]) => {
    const lista = ((ex.onde && ex.onde[chave]) || []).slice().sort((a, b) => Number(meus.has(Number(b.id))) - Number(meus.has(Number(a.id))));
    if (!lista.length) return '';
    return `<div class="onde-grupo"><span class="onde-rotulo">${rotulo}</span><div class="onde-logos">${lista.map((s) => logoServicoHTML(s, link, meus)).join('')}</div></div>`;
  }).join('');
  const temServico = Boolean(grupos);
  return `<div class="onde-titulo"><h4>Onde assistir</h4><span>${esc(PAISES_ONDE[paisOnde()] || paisOnde())}</span></div>
    ${selos.length ? `<div class="onde-selos">${selos.join('')}</div>` : ''}
    ${temServico ? `<div class="onde-grupos">${grupos}</div>` : `<p class="onde-vazio">Não está em nenhum streaming ${paisOnde() === 'BR' ? 'no Brasil' : `em ${esc(PAISES_ONDE[paisOnde()] || paisOnde())}`} agora.</p>`}
    ${temServico ? '<p class="onde-credito">Dados de streaming: JustWatch</p>' : ''}`;
}

// Logos pequenos (prévia e destaque): os serviços de assinatura, os seus primeiro.
function servicosCurtosHTML(f, max = 4) {
  const meus = meusServicos();
  const lista = servicosDoFilme(f).sort((a, b) => Number(meus.has(Number(b.id))) - Number(meus.has(Number(a.id))));
  const ex = extrasDoPais(f) || {};
  const partes = lista.slice(0, max).map((s) => `<img class="servico-mini${meus.has(Number(s.id)) ? ' meu' : ''}" src="${esc(s.logo)}" alt="${esc(s.nome)}" title="${esc(s.nome)}" loading="lazy">`);
  if (ex.cinema === 'agora') partes.unshift(`<span class="servico-cinema" title="Nos cinemas">${icone('Clapperboard')}</span>`);
  return partes.join('');
}

// ---- O menu "Filtros" da barra da lista ----
//
// Cada parte do app registra uma seção: { titulo, itensHTML(), aoClicar(e) → true
// se tratou, ativa(), atualizarChip() }. Aqui fica "Onde assistir"; os prêmios (premios.js) põem a deles.
const SECOES_FILTRO = [];

function aplicarFiltroDaBarra() {
  fecharFlutuante();
  fecharPainel();
  render();
  rolarParaLista();
}

// Plataformas: seções de recursos que a plataforma não tem (prêmios no nandanimes) somem.
const secoesFiltroVisiveis = () => SECOES_FILTRO.filter((s) => !s.recurso || plataformaTem(s.recurso));

function abrirMenuFiltros(botao) {
  const menu = abrirFlutuante(botao, secoesFiltroVisiveis().map((s) => `
    <div class="tl-menu-titulo">${s.titulo}</div>
    <div class="tl-menu-itens" role="menu">${s.itensHTML()}</div>`).join('<div class="tl-menu-sep"></div>'), 'listas-menu listas-menu-tela menu-filtros');
  if (!menu) return;
  menu.addEventListener('click', (e) => { for (const s of secoesFiltroVisiveis()) if (s.aoClicar(e)) return; });
}

// Os filtros ligados viram chips com ✕ (como o de diretor e o de país).
function atualizarChipsFiltros() {
  for (const s of SECOES_FILTRO) s.atualizarChip();
  $('#btn-filtros').classList.toggle('ativo-leve', secoesFiltroVisiveis().some((s) => s.ativa()));
}

const itemMenuHTML = (atual, attrs, nome, qtd) => `
  <button class="tl-menu-item${atual ? ' atual' : ''}" role="menuitemradio" aria-checked="${atual}" ${attrs}>
    <span class="tl-menu-check">${atual ? icone('Check') : ''}</span><span class="tl-menu-nome">${nome}</span><span class="tl-menu-qtd">${qtd}</span>
  </button>`;

SECOES_FILTRO.push({
  titulo: 'Onde assistir',
  ativa: () => Boolean(estado.onde),
  atualizarChip: () => {
    if (estado.onde && !filtrosOndeDisponiveis().includes(estado.onde)) estado.onde = '';
    const chip = $('#chip-onde');
    chip.hidden = !estado.onde;
    chip.innerHTML = `${icone('Tv')}<span>${esc(estado.onde ? FILTROS_ONDE[estado.onde].rotulo : '')}</span>${icone('X')}`;
  },
  itensHTML: () => filtrosOndeDisponiveis()
    .map((k) => itemMenuHTML(estado.onde === k, `data-onde="${k}"`, FILTROS_ONDE[k].rotulo, itensDaPlataforma().filter((f) => passaOnde(f, k)).length)).join('')
    + `<button class="tl-menu-item" data-onde-config><span class="tl-menu-check">${icone('Settings')}</span><span class="tl-menu-nome">${meusServicos().size ? 'Meus serviços…' : 'Escolher os streamings que assino…'}</span></button>`,
  aoClicar: (e) => {
    if (e.target.closest('[data-onde-config]')) {
      fecharFlutuante();
      abrirConfiguracoes();
      setTimeout(() => $('#cfg-onde', modal)?.scrollIntoView({ block: 'start' }), 50);
      return true;
    }
    const b = e.target.closest('[data-onde]');
    if (!b) return false;
    filtrarOnde(b.dataset.onde === estado.onde ? '' : b.dataset.onde);
    return true;
  },
});

function filtrarOnde(chave) {
  estado.onde = chave || '';
  aplicarFiltroDaBarra();
}

$('#btn-filtros').addEventListener('click', (e) => abrirMenuFiltros(e.currentTarget));
$('#chip-onde').addEventListener('click', () => filtrarOnde(''));

// ---- Configurações: país e serviços que você assina ----

let provedoresCache = null; // { pais, lista }

async function montarCfgOnde(caixa) {
  const desenhar = (lista, carregando = false) => {
    const meus = meusServicos();
    const ordem = lista.slice().sort((a, b) => Number(meus.has(Number(b.id))) - Number(meus.has(Number(a.id))));
    caixa.innerHTML = `
      <h3>Onde assistir</h3>
      <label class="cfg-pais">País
        <select id="cfg-pais">${Object.entries(PAISES_ONDE).map(([c, n]) => `<option value="${c}"${c === paisOnde() ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
      </label>
      <p>Os streamings que você assina (aparecem primeiro e viram filtro na lista e no sorteio):</p>
      <div class="cfg-servicos">${carregando ? '<span class="onde-carregando">Carregando os serviços…</span>' : ordem.map((s) => `
        <button class="cfg-servico${meus.has(Number(s.id)) ? ' ativo' : ''}" data-servico="${s.id}" aria-pressed="${meus.has(Number(s.id))}" title="${esc(s.nome)}">
          ${s.logo ? `<img src="${esc(s.logo)}" alt="" loading="lazy">` : ''}<span>${esc(s.nome)}</span>
        </button>`).join('') || '<span class="onde-carregando">Coloque a chave do TMDB para ver os serviços.</span>'}</div>
      <p class="onde-credito">Dados de streaming: JustWatch. “No Stremio” quer dizer que ${voc('artigo')} ${voc('item')} está no catálogo do Stremio; se dá para assistir depende dos complementos (add-ons) instalados no seu Stremio.</p>`;
    $('#cfg-pais', caixa).onchange = async (e) => {
      estado.config = await api.salvarConfig({ pais: e.target.value });
      provedoresCache = null;
      montarCfgOnde(caixa);
      render();
    };
    $('.cfg-servicos', caixa).onclick = async (e) => {
      const b = e.target.closest('[data-servico]');
      if (!b) return;
      const id = Number(b.dataset.servico);
      const atual = meusServicos();
      if (atual.has(id)) atual.delete(id); else atual.add(id);
      b.classList.toggle('ativo', atual.has(id));
      b.setAttribute('aria-pressed', atual.has(id));
      estado.config = await api.salvarConfig({ meusServicos: [...atual] });
      render();
    };
  };
  // Os serviços que já apareceram nos seus filmes, enquanto a lista do TMDB não chega.
  const vistos = new Map();
  for (const f of estado.filmes) for (const s of servicosDoFilme(f)) vistos.set(Number(s.id), s);
  if (provedoresCache && provedoresCache.pais === paisOnde()) { desenhar(provedoresCache.lista); return; }
  desenhar([...vistos.values()], !vistos.size);
  const r = await api.provedoresTmdb();
  if (!caixa.isConnected) return;
  if (r && r.ok !== false && Array.isArray(r.dados || r)) {
    const lista = r.dados || r;
    // Os do TMDB, mais algum que só apareceu nos filmes.
    const ids = new Set(lista.map((s) => Number(s.id)));
    provedoresCache = { pais: paisOnde(), lista: [...lista, ...[...vistos.values()].filter((s) => !ids.has(Number(s.id)))] };
    desenhar(provedoresCache.lista);
  } else {
    desenhar([...vistos.values()]);
  }
}
