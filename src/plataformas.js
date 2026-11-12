'use strict';

// ---------- Plataformas: nandflix, nandchan, nandplay e nandhub ----------
//
// O app é um "hub" de plataformas. Cada uma mostra uma parte da lista (filmes,
// animes…) com o seu nome, ícone, vocabulário e cor; o hub (nandhub) junta as
// plataformas habilitadas. Para criar uma plataforma nova (jogos, séries…),
// basta acrescentar uma entrada em PLATAFORMAS: o menu da marca, a tela de
// início, a escolha de sistemas e as Configurações são gerados daqui (o tema
// de cor novo, se houver, vai no CSS: html[data-tema="…"]).
//
// Os pontos de contato com o resto do app estão marcados com "Plataformas".

// O que é anime. Ficava em anime.js; veio para cá porque as plataformas
// (carregadas antes) precisam saber.
const ehSerie = (f) => Boolean(f) && f.tipo === 'serie';
const ehAnime = (f) => Boolean(f) && (f.anime === true || ehSerie(f));
// Jogo (nandplay): um item com tipo 'jogo' na mesma lista (contrato em lib/igdb.js, lerDetalhes).
const ehJogo = (f) => Boolean(f) && f.tipo === 'jogo';

// rotulos: o vocabulário de cada plataforma (use pelo voc(), abaixo).
//   item/itens: "filme"/"filmes"; todos: o título da lista inteira;
//   nenhum: "Nenhum filme"/"Nada"; artigo e genero ('m'|'f') para montar frases;
//   de/deste/um/este: "do filme", "deste filme", "um filme", "este filme";
//   adicionar/sortear: o texto do botão ("Adicionar filme", "Sortear um anime").
// recursos: telas que só existem em certas plataformas (plataformaTem).
// doMes: onde fica guardado o "item do mês" do calendário (config da conta, uma chave por
// plataforma, que também entra em CONFIG_SINC e nas permitidas) e como se chama.
// tema: o nome do tema de cor (CSS html[data-tema]); hub: junta as habilitadas.
const PLATAFORMAS = [
  {
    id: 'nandflix', nome: 'nandflix', imagem: 'icone.png', emoji: '🎬',
    descricao: 'Seus filmes: watchlist, notas, calendário e tierlists.',
    pertence: (f) => !ehAnime(f) && !ehJogo(f),
    rotulos: { item: 'filme', itens: 'filmes', todos: 'Todos os filmes', nenhum: 'Nenhum filme', artigo: 'o', genero: 'm', de: 'do filme', deste: 'deste filme', um: 'um filme', este: 'este filme', adicionar: 'Adicionar filme', sortear: 'Sortear um filme' },
    recursos: ['premios', 'retrospectiva'], // telas só de filme (a retrospectiva em stories é de filmes)
    doMes: { chave: 'filmesDoMes', rotulo: 'Filme do mês' },
    tema: 'roxo',
  },
  {
    // Aparece como "nandchan"; o id continua 'nandanimes' (é o que fica gravado nas configurações).
    id: 'nandanimes', nome: 'nandchan', emoji: '🍣',
    descricao: 'Seus animes: episódios, temporadas e o próximo episódio.',
    pertence: ehAnime,
    rotulos: { item: 'anime', itens: 'animes', todos: 'Todos os animes', nenhum: 'Nenhum anime', artigo: 'o', genero: 'm', de: 'do anime', deste: 'deste anime', um: 'um anime', este: 'este anime', adicionar: 'Adicionar anime', sortear: 'Sortear um anime' },
    doMes: { chave: 'animesDoMes', rotulo: 'Anime do mês' },
    recursos: ['retrospectiva'], // a retrospectiva em stories (de animes: episódios, horas, anime do mês)
    porEpisodio: true, // o que se registra num dia é episódio assistido (epDias), não "vi o filme"
    tema: 'laranja',
  },
  {
    id: 'nandplay', nome: 'nandplay', emoji: '🎮',
    descricao: 'Seus jogos: o que jogar, o que já zerou e a Steam a um clique.',
    pertence: ehJogo,
    rotulos: { item: 'jogo', itens: 'jogos', todos: 'Todos os jogos', nenhum: 'Nenhum jogo', artigo: 'o', genero: 'm', de: 'do jogo', deste: 'deste jogo', um: 'um jogo', este: 'este jogo', adicionar: 'Adicionar jogo', sortear: 'Sortear um jogo' },
    doMes: { chave: 'jogosDoMes', rotulo: 'Jogo do mês' },
    recursos: ['premios'], // The Game Awards e BAFTA Games
    tema: 'verde',
  },
  {
    id: 'nandhub', nome: 'nandhub', emoji: '🍿', hub: true,
    descricao: 'Tudo junto, numa lista só.', // o texto de verdade vem de descricaoPlataforma()
    rotulos: { item: 'título', itens: 'títulos', todos: 'Todos', nenhum: 'Nada', artigo: 'o', genero: 'm', de: 'do título', deste: 'deste título', um: 'um título', este: 'este título', adicionar: 'Adicionar à lista', sortear: 'Sortear um título' },
    tema: 'mistura', // roxo + laranja: o acento é a mistura das cores das plataformas que junta
  },
];

const plataformaPorId = (id) => PLATAFORMAS.find((p) => p.id === id) || null;
// Os "sistemas" que a pessoa habilita (todas menos os hubs).
const sistemasPlataforma = () => PLATAFORMAS.filter((p) => !p.hub);

// ---- Habilitadas (config da CONTA `plataformas`) ----

// Sem a escolha ainda, vem do NANDRoll antigo: animes ligados = as duas.
function plataformasHabilitadas() {
  const c = (estado && estado.config) || {};
  const salvas = Array.isArray(c.plataformas) ? c.plataformas : (c.nandroll ? ['nandflix', 'nandanimes'] : ['nandflix']);
  const ok = sistemasPlataforma().map((p) => p.id).filter((id) => salvas.includes(id));
  return ok.length ? ok : ['nandflix'];
}
const plataformaHabilitada = (id) => plataformasHabilitadas().includes(id);
// A pessoa já escolheu os sistemas alguma vez (senão, pergunta no primeiro uso).
const plataformasEscolhidas = () => Boolean(estado.config && Array.isArray(estado.config.plataformas));

// As que dá para usar agora, na ordem do registro: as habilitadas e, com 2+, o hub.
function plataformasDisponiveis() {
  const h = plataformasHabilitadas();
  return PLATAFORMAS.filter((p) => (p.hub ? h.length >= 2 : h.includes(p.id)));
}

// Grava as habilitadas. `nandroll` vai junto: o processo principal (e o do
// celular) ainda usa essa chave para atualizar os animes em exibição.
async function salvarPlataformas(ids) {
  const lista = sistemasPlataforma().map((p) => p.id).filter((id) => ids.includes(id));
  if (!lista.length) lista.push('nandflix');
  const mudancas = { plataformas: lista, nandroll: lista.includes('nandanimes') };
  // A plataforma de abertura deixou de existir: volta a perguntar.
  const inicial = estado.config.plataformaInicial;
  if (inicial && !PLATAFORMAS.some((p) => p.id === inicial && (p.hub ? lista.length >= 2 : lista.includes(p.id)))) mudancas.plataformaInicial = '';
  estado.config = await api.salvarConfig(mudancas);
}

// ---- A plataforma em uso (estado.plataforma) ----

function plataformaAtual() {
  const d = plataformasDisponiveis();
  return d.find((p) => p.id === estado.plataforma) || d[0];
}

// A plataforma atual mostra os itens da plataforma `id`? (o hub mostra os de todas as habilitadas)
function plataformaInclui(id) {
  const p = plataformaAtual();
  return p.id === id || Boolean(p.hub && plataformaHabilitada(id));
}

// O teste "este item aparece em `p`?", montado uma vez (para filtrar listas longas).
function testeDaPlataforma(p = plataformaAtual()) {
  if (!p.hub) return p.pertence;
  const testes = plataformasHabilitadas().map((id) => plataformaPorId(id).pertence);
  return (f) => testes.some((t) => t(f));
}
const daPlataforma = (f, p) => testeDaPlataforma(p)(f);
// O ponto único da lista visível: tudo o que é desenhado parte daqui.
const itensDaPlataforma = (lista = estado.filmes, p) => lista.filter(testeDaPlataforma(p));

// Vocabulário da plataforma atual (ou de `p`):
//   voc('itens') → "filmes" | "animes" | "títulos";  voc('Itens') → "Filmes"…
//   voc('todos') → "Todos os filmes" | "Todos os animes" | "Todos";  voc('nenhum') → "Nenhum filme" | "Nada"
//   voc('qtd', 3) → "3 filmes";  voc('qtd', 1) → "1 filme"
function voc(chave, n, p = plataformaAtual()) {
  const r = p.rotulos;
  if (chave === 'qtd') return `${Number(n).toLocaleString('pt-BR')} ${n === 1 ? r.item : r.itens}`;
  const k = chave.charAt(0).toLowerCase() + chave.slice(1);
  const t = r[k] ?? chave;
  return chave !== k ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

// Preenche um modelo com o vocabulário: vocTexto('Adicionar {item}') → "Adicionar anime".
// Vale o mesmo que voc(): {Itens}, {todos}, {um}, {de}…
const vocTexto = (modelo, p = plataformaAtual()) => String(modelo).replace(/\{(\w+)\}/g, (_, k) => voc(k, undefined, p));

// A plataforma "de verdade" de um item (o hub não conta): um anime aberto no
// painel é "anime" mesmo no nandhub. Textos sobre UM item usam estes.
const plataformaDoItem = (f) => plataformaPorId(ehJogo(f) ? 'nandplay' : ehAnime(f) ? 'nandanimes' : 'nandflix');
const vocDe = (f, chave, n) => voc(chave, n, plataformaDoItem(f));
const vocTextoDe = (f, modelo) => vocTexto(modelo, plataformaDoItem(f));

// A plataforma atual tem este recurso (ex.: 'premios')? O hub tem o de qualquer habilitada.
function plataformaTem(recurso) {
  const p = plataformaAtual();
  if (!p.hub) return Boolean(p.recursos && p.recursos.includes(recurso));
  return plataformasHabilitadas().some((id) => (plataformaPorId(id).recursos || []).includes(recurso));
}

// Textos fixos do index.html que mudam com a plataforma:
//   data-voc="modelo" (texto), data-voc-aria, data-voc-dica, data-voc-placeholder, data-voc-titulo.
//   data-recurso="premios": some onde a plataforma não tem o recurso.
const ATRIBUTOS_VOC = { vocAria: 'aria-label', vocDica: 'data-dica', vocPlaceholder: 'placeholder', vocTitulo: 'title' };
function aplicarVocabularioEstatico(raiz = document) {
  for (const el of raiz.querySelectorAll('[data-voc]')) el.textContent = vocTexto(el.dataset.voc);
  for (const [chave, atributo] of Object.entries(ATRIBUTOS_VOC)) {
    const seletor = '[data-' + chave.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) + ']';
    for (const el of raiz.querySelectorAll(seletor)) el.setAttribute(atributo, vocTexto(el.dataset[chave]));
  }
  for (const el of raiz.querySelectorAll('[data-recurso]')) el.hidden = !plataformaTem(el.dataset.recurso);
}

// As plataformas que o hub junta (as habilitadas, na ordem do registro).
const plataformasDoHub = () => plataformasHabilitadas().map(plataformaPorId);
// "nandflix + nandchan": os nomes das incluídas, para o texto miúdo do hub.
const nomesDoHub = (sep = ' + ') => plataformasDoHub().map((q) => q.nome).join(sep);
// "filmes e animes", "filmes, animes e jogos".
function listaComE(textos) {
  return textos.length < 2 ? (textos[0] || '') : `${textos.slice(0, -1).join(', ')} e ${textos.at(-1)}`;
}
// A descrição de uma plataforma. A do hub diz o que ele inclui: "Filmes e animes juntos".
function descricaoPlataforma(p) {
  if (!p.hub) return p.descricao;
  const t = listaComE(plataformasDoHub().map((q) => voc('itens', undefined, q)));
  return `${t.charAt(0).toUpperCase()}${t.slice(1)} juntos, numa lista só.`;
}
// Muda quando o ícone muda (o do hub depende das habilitadas): para não redesenhar à toa.
const chaveIconePlataforma = (p) => (p.hub ? `${p.id}:${plataformasHabilitadas().join()}` : p.id);

// O ícone de uma plataforma: a imagem dela ou o emoji.
function iconePlataformaHTML(p, classe = 'marca-icone') {
  return p.imagem ? `<img class="${classe}" src="${p.imagem}" alt="">` : `<span class="${classe} plat-emoji" aria-hidden="true">${p.emoji}</span>`;
}

// Mostra a plataforma atual: atributos no <html> (tema e CSS dos próximos
// lotes), título da janela e a marca do topo.
// `noHtml: false` adia os atributos (ver trocarPlataforma).
function aplicarPlataforma({ noHtml = true } = {}) {
  const p = plataformaAtual();
  estado.plataforma = p.id;
  if (noHtml) marcarPlataformaNoHtml();
  document.title = p.nome;
  aplicarVocabularioEstatico();
  const icone = $('#marca-icone');
  const chaveIcone = chaveIconePlataforma(p);
  if (icone && icone.dataset.p !== chaveIcone) { icone.innerHTML = iconePlataformaHTML(p); icone.dataset.p = chaveIcone; }
  const nome = $('#marca-nome');
  if (nome) nome.textContent = p.nome;
  const botao = $('#btn-marca');
  if (botao) {
    const varias = plataformasDisponiveis().length > 1;
    botao.classList.toggle('sozinha', !varias);
    botao.setAttribute('aria-disabled', String(!varias));
    botao.title = varias ? 'Trocar de plataforma' : '';
  }
}

// <html data-plataforma data-tema>: o tema troca as variáveis de cor, o que
// recalcula o estilo da página inteira (uma vez, ~30 ms com 600 capas na tela).
function marcarPlataformaNoHtml() {
  const p = plataformaAtual();
  const raiz = document.documentElement;
  if (raiz.dataset.plataforma !== p.id) raiz.dataset.plataforma = p.id;
  if (raiz.dataset.tema !== p.tema) raiz.dataset.tema = p.tema;
}

// Fecha as telas por cima da lista (detalhes, calendário…): o que estava
// aberto pode não ser da plataforma nova.
function fecharTelasDaPlataforma() {
  const chamar = (nome) => { if (typeof window[nome] === 'function') window[nome](); };
  if (estado.painelId) chamar('fecharPainel');
  if (!$('#foco').hidden) chamar('fecharFoco');
  for (const nome of ['fecharPrevia', 'fecharCalendario', 'fecharTierlist', 'fecharEstatisticas', 'fecharPremios', 'fecharPaginas', 'fecharPagina']) chamar(nome);
}

// O destaque (sorteado) precisa ser da plataforma: senão, sorteia outro.
function ajustarDestaquePlataforma() {
  const atual = filmeNoDestaque();
  const ok = (id) => { const f = porId(id); return Boolean(f) && daPlataforma(f); };
  const antes = estado.historico.length;
  estado.historico = estado.historico.filter(ok);
  if (atual && ok(atual)) {
    estado.indiceDestaque = estado.historico.indexOf(atual);
    if (estado.historico.length !== antes) mostrarDestaque({ rapido: true });
    return;
  }
  estado.indiceDestaque = estado.historico.length - 1;
  proximoSorteio = null;
  sortear({ rolar: false, avisarSeVazio: false });
  if (!filmeNoDestaque()) fecharDestaque();
}

// Troca de plataforma (menu da marca, tela de início, celular). Com animação:
// View Transitions quando há (Electron e WebView recentes), senão um fade.
function trocarPlataforma(id, { animar = true } = {}) {
  const p = plataformasDisponiveis().find((x) => x.id === id);
  if (!p || p.id === estado.plataforma) return;
  const aplicar = () => {
    estado.plataforma = p.id;
    fecharTelasDaPlataforma();
    aplicarPlataforma({ noHtml: false });
    ajustarDestaquePlataforma();
    // Quem tem estado próprio (a tela do celular) se ajusta antes do render.
    document.dispatchEvent(new CustomEvent('plataforma', { detail: p }));
    render();
    // O tema só depois do render: assim o recálculo de estilo pega só a lista
    // nova (o render lê medidas no meio, e com o tema antes recalcularia a velha também).
    marcarPlataformaNoHtml();
    principal.scrollTo({ top: 0 });
  };
  const movimento = animar && !Movimento.reduzido.matches && document.visibilityState === 'visible';
  if (movimento && document.startViewTransition) {
    // A troca acontece mesmo se a animação for pulada (outra troca no meio, janela escondida).
    const t = document.startViewTransition(aplicar);
    t.ready.catch(() => {});
    t.finished.catch(() => {});
    return;
  }
  aplicar();
  if (movimento) Movimento.animar(principal, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
}

// Mudou a lista de habilitadas (Configurações, importar animes): se a atual
// saiu, cai para outra; redesenha.
function aposMudarPlataformas() {
  const antes = estado.plataforma;
  aplicarPlataforma();
  if (estado.plataforma !== antes) {
    const novo = estado.plataforma;
    estado.plataforma = antes;
    trocarPlataforma(novo);
    return;
  }
  render();
}

// ---- Calendário e estatísticas: qual plataforma mostrar ----
//
// Cada plataforma tem o seu calendário e as suas estatísticas (filmes e animes
// são coisas diferentes: um dia de filme é "vi", um de anime é "vi N episódios").
// Fora do hub, vale a plataforma atual. No hub, um menu no alto da tela escolhe
// entre as habilitadas, e a escolha fica gravada neste aparelho (por tela).
const escopoSalvo = (tela) => { try { return localStorage.getItem(`escopo-${tela}`); } catch { return null; } };
function escopoDe(tela) {
  const atual = plataformaAtual();
  if (!atual.hub) return atual;
  const ids = plataformasHabilitadas();
  const salvo = escopoSalvo(tela);
  return plataformaPorId(ids.includes(salvo) ? salvo : ids[0]);
}
function definirEscopo(tela, id) {
  try { localStorage.setItem(`escopo-${tela}`, id); } catch { /* sem armazenamento: vale só até fechar a tela */ }
}
const escopoCal = () => escopoDe('calendario');
const escopoEst = () => escopoDe('estatisticas');
const chaveDoMes = (p) => (p.doMes && p.doMes.chave) || 'filmesDoMes';
const rotuloDoMes = (p) => (p.doMes && p.doMes.rotulo) || 'Item do mês';
const porEpisodio = (p) => Boolean(p && p.porEpisodio);

// O menu do alto (só no hub), com o visual dos menus do app (.ordenar).
function seletorEscopoHTML(tela) {
  if (!plataformaAtual().hub) return '';
  const atual = escopoDe(tela).id;
  const opcoes = plataformasHabilitadas().map((id) => {
    const p = plataformaPorId(id);
    return `<option value="${p.id}"${p.id === atual ? ' selected' : ''}>${voc('Itens', undefined, p)} · ${p.nome}</option>`;
  }).join('');
  return `<label class="ordenar escopo-seletor">
    <span>Mostrar</span>
    <span class="ordenar-caixa">
      <select data-escopo="${tela}" aria-label="${tela === 'calendario' ? 'Calendário de' : 'Estatísticas de'}">${opcoes}</select>
      <span class="ordenar-seta">${icone('ChevronDown')}</span>
    </span>
  </label>`;
}

// ---- Menu da marca (topo do PC) ----

// Chamado no início do app.js (aqui ainda não existem $ e $$).
function ligarMenuMarca() {
  const caixa = $('#marca-caixa');
  const botao = $('#btn-marca');
  const menu = $('#marca-menu');
  if (!caixa || !botao || !menu) return;
  const abrir = (sim) => {
    if (sim) {
      const atual = plataformaAtual().id;
      // As plataformas em cima; o hub embaixo, separado, como "Tudo junto" com os nomes das incluídas.
      const item = (p) => `
        <button class="menu-topo-item marca-menu-item${p.hub ? ' marca-menu-hub' : ''}" role="menuitemradio" aria-checked="${p.id === atual}" data-plataforma="${p.id}">
          ${iconePlataformaHTML(p, 'marca-menu-icone')}<span class="marca-menu-texto"><b>${p.nome}</b>${p.hub ? `<small>${nomesDoHub()}</small>` : ''}</span>${p.id === atual ? icone('Check') : ''}
        </button>`;
      const disp = plataformasDisponiveis();
      const hub = disp.find((p) => p.hub);
      menu.innerHTML = disp.filter((p) => !p.hub).map(item).join('')
        + (hub ? `<span class="menu-topo-sep" role="separator"></span><span class="marca-menu-rotulo">Tudo junto</span>${item(hub)}` : '');
    }
    caixa.classList.toggle('aberta', sim);
    botao.setAttribute('aria-expanded', String(sim));
  };
  botao.addEventListener('click', () => {
    if (plataformasDisponiveis().length < 2) return;
    abrir(!caixa.classList.contains('aberta'));
  });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-plataforma]');
    if (!b) return;
    abrir(false);
    botao.focus({ preventScroll: true });
    trocarPlataforma(b.dataset.plataforma);
  });
  document.addEventListener('pointerdown', (e) => { if (!caixa.contains(e.target)) abrir(false); });
  caixa.addEventListener('keydown', (e) => {
    const itens = $$('.menu-topo-item', menu);
    const i = itens.indexOf(document.activeElement);
    if (e.key === 'Escape' && caixa.classList.contains('aberta')) {
      e.stopPropagation(); abrir(false); botao.focus();
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && plataformasDisponiveis().length > 1) {
      e.preventDefault();
      if (!caixa.classList.contains('aberta')) abrir(true);
      const lista = $$('.menu-topo-item', menu);
      const n = lista.length;
      lista[e.key === 'ArrowDown' ? (i + 1 + n) % n : (i - 1 + n) % n].focus();
    }
  });
}

// ---- Ao abrir o app: escolha de sistemas (primeiro uso) e de plataforma ----

// A plataforma da primeira tela, antes de qualquer escolha: a de abertura
// deste aparelho (config `plataformaInicial`), ou o hub, ou a única.
function prepararPlataforma() {
  const d = plataformasDisponiveis();
  const inicial = d.find((p) => p.id === estado.config.plataformaInicial);
  estado.plataforma = (inicial || d.find((p) => p.hub) || d[0]).id;
  aplicarPlataforma();
}

// Depois da entrada (login): pergunta os sistemas se nunca foram escolhidos e,
// com mais de uma plataforma, onde entrar (a não ser que "sempre abrir em").
function escolherPlataformaAoAbrir() {
  const perguntarSistemas = !plataformasEscolhidas();
  const precisaEscolher = () => plataformasDisponiveis().length > 1
    && !plataformasDisponiveis().some((p) => p.id === estado.config.plataformaInicial);
  if (!perguntarSistemas && !precisaEscolher()) return Promise.resolve();
  return new Promise((resolve) => abrirTelaPlataformas({ perguntarSistemas, precisaEscolher }, resolve));
}

function cartaoPlataformaHTML(p, { alternar = false, ligado = false } = {}) {
  const n = itensDaPlataforma(estado.filmes, p).length;
  const conta = estado.filmes.length ? `<small class="plat-conta">${voc('qtd', n, p)}</small>` : '';
  const atributos = alternar ? `aria-pressed="${ligado}"` : '';
  // O hub é um cartão largo, "Tudo junto", dizendo o que inclui.
  const inclui = p.hub ? `<small class="plat-inclui">Inclui ${nomesDoHub()}</small>` : '';
  return `<button class="plat-opcao${p.hub ? ' plat-hub' : ''}" data-plataforma="${p.id}" data-tema="${p.tema}"${p.hub ? ' data-hub' : ''} ${atributos}>
    ${iconePlataformaHTML(p, 'plat-opcao-icone')}
    <span class="plat-opcao-texto">${p.hub ? '<em class="plat-kicker">Tudo junto</em>' : ''}<b>${p.nome}</b><small>${esc(descricaoPlataforma(p))}</small>${inclui}${alternar ? '' : conta}</span>
    ${alternar ? `<span class="plat-check" aria-hidden="true">${icone('Check')}</span>` : ''}
  </button>`;
}

function abrirTelaPlataformas({ perguntarSistemas, precisaEscolher }, aoTerminar) {
  const hub = PLATAFORMAS.find((p) => p.hub);
  const el = document.createElement('div');
  el.className = 'entrada plat-tela';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'plat-titulo');
  el.innerHTML = `
    ${mosaicoEntradaHTML(estado.filmes)}
    <div class="entrada-veu" aria-hidden="true"></div>
    <section class="entrada-cartao plat-cartao">
      <h1 class="marca entrada-marca">${iconePlataformaHTML(hub)} ${hub.nome}</h1>
      <div class="entrada-passo" data-passo="sistemas" hidden>
        <h2 id="plat-titulo">O que você vai acompanhar?</h2>
        <p class="entrada-sub">Escolha um ou mais. Com mais de um, o ${hub.nome} junta tudo numa lista só. Dá para mudar depois nas Configurações.</p>
        <div class="plat-opcoes" role="group" aria-label="Sistemas">
          ${sistemasPlataforma().map((p) => cartaoPlataformaHTML(p, { alternar: true, ligado: plataformaHabilitada(p.id) })).join('')}
        </div>
        <button class="btn btn-laranja entrada-enviar" data-e="continuar">Continuar</button>
      </div>
      <div class="entrada-passo" data-passo="escolher" hidden>
        <h2>Onde você quer entrar?</h2>
        <p class="entrada-sub">Dá para trocar a qualquer hora pela marca, no alto da tela.</p>
        <div class="plat-opcoes" data-e="opcoes"></div>
        <div class="plat-hub-faixa" data-e="hub"></div>
        <label class="plat-sempre"><input type="checkbox" data-e="sempre"> Sempre abrir direto na que eu escolher <small>(muda nas Configurações)</small></label>
      </div>
    </section>`;
  document.body.append(el);
  document.body.classList.add('com-entrada');
  Movimento.animar($('.entrada-cartao', el), [{ opacity: 0, transform: 'translateY(16px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });

  const mostrarPasso = (passo) => {
    for (const p of $$('.entrada-passo', el)) p.hidden = p.dataset.passo !== passo;
    const visivel = $(`[data-passo="${passo}"]`, el);
    $('h2', visivel).id = 'plat-titulo';
    for (const h of $$('.entrada-passo[hidden] h2', el)) h.removeAttribute('id');
    if (passo === 'escolher') {
      // As plataformas lado a lado e, embaixo, o hub largo: ele é a soma delas, não um terceiro cartão.
      const disp = plataformasDisponiveis();
      const hubDisp = disp.find((p) => p.hub);
      $('[data-e="opcoes"]', el).innerHTML = disp.filter((p) => !p.hub).map((p) => cartaoPlataformaHTML(p)).join('');
      $('[data-e="hub"]', el).innerHTML = hubDisp ? `<div class="plat-ou" aria-hidden="true"><span>ou, tudo junto</span></div>${cartaoPlataformaHTML(hubDisp)}` : '';
    }
    Movimento.animar(visivel, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 260 });
    if (passo === 'escolher') Movimento.sequencia($$('.plat-opcao', visivel), { y: 12, duracao: 380, passo: 60 });
    ($('.plat-opcao', visivel) || visivel).focus({ preventScroll: true });
  };

  const terminar = () => {
    document.removeEventListener('keydown', aoTecla, true);
    document.body.classList.remove('com-entrada');
    const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: Movimento.reduzido.matches ? 1 : 320, easing: 'ease-in' });
    a.onfinish = () => el.remove();
    aoTerminar();
  };

  const marcados = () => $$('[data-passo="sistemas"] .plat-opcao[aria-pressed="true"]', el).map((b) => b.dataset.plataforma);
  const atualizarContinuar = () => { $('[data-e="continuar"]', el).disabled = !marcados().length; };

  el.addEventListener('click', async (e) => {
    const opcao = e.target.closest('.plat-opcao');
    if (opcao && opcao.hasAttribute('aria-pressed')) {
      opcao.setAttribute('aria-pressed', String(opcao.getAttribute('aria-pressed') !== 'true'));
      atualizarContinuar();
      return;
    }
    if (opcao) {
      const id = opcao.dataset.plataforma;
      if ($('[data-e="sempre"]', el).checked) estado.config = await api.salvarConfig({ plataformaInicial: id });
      // Troca já por trás da tela, sem animação: a tela sumindo é a transição.
      trocarPlataforma(id, { animar: false });
      terminar();
      return;
    }
    if (e.target.closest('[data-e="continuar"]')) {
      const b = e.target.closest('[data-e="continuar"]');
      b.disabled = true;
      await salvarPlataformas(marcados());
      aposMudarPlataformas();
      if (precisaEscolher()) mostrarPasso('escolher');
      else terminar();
    }
  });

  // Enquanto a tela estiver aberta, os atalhos do app não valem (como na entrada).
  const aoTecla = (e) => {
    if (e.key === 'Tab') {
      const focaveis = $$('button:not([disabled]), input', el).filter((x) => x.offsetParent);
      const i = focaveis.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); focaveis.at(-1).focus(); }
      else if (!e.shiftKey && i === focaveis.length - 1) { e.preventDefault(); focaveis[0].focus(); }
      return;
    }
    if (!e.target.closest || !e.target.closest('.plat-tela')) { e.stopImmediatePropagation(); e.preventDefault(); return; }
    e.stopImmediatePropagation();
  };
  document.addEventListener('keydown', aoTecla, true);

  if (perguntarSistemas) { mostrarPasso('sistemas'); atualizarContinuar(); } else mostrarPasso('escolher');
}

// ---- Configurações ----

function plataformasConfigHTML() {
  const hub = PLATAFORMAS.find((p) => p.hub);
  const inicial = estado.config.plataformaInicial || '';
  return `
      <div class="secao" id="cfg-plataformas">
        <h3>Plataformas</h3>
        <div class="chips-linha cfg-plat-lista" role="group" aria-label="Plataformas habilitadas">
          ${sistemasPlataforma().map((p) => `<button class="chip cfg-plat${plataformaHabilitada(p.id) ? ' ativo' : ''}" data-plataforma="${p.id}" aria-pressed="${plataformaHabilitada(p.id)}">${iconePlataformaHTML(p, 'cfg-plat-icone')} ${p.nome}</button>`).join('')}
        </div>
        <p>O que você acompanha. Troque de plataforma pela marca, no alto da tela.</p>
        ${plataformasHabilitadas().length > 1
    ? `<p class="cfg-plat-hub">${iconePlataformaHTML(hub, 'cfg-plat-icone')}<span><b>${hub.nome}</b> junta tudo: ${nomesDoHub()} numa lista só.</span></p>`
    : `<p class="cfg-plat-hub cfg-plat-hub-off"><span>Com mais de uma plataforma, o <b>${hub.nome}</b> junta tudo numa lista só.</span></p>`}
        <label class="ordenar cfg-plat-inicial"><span class="cfg-plat-rotulo">Ao abrir o app</span>
          <span class="ordenar-caixa">
            <select id="cfg-plat-inicial">
              <option value="">Perguntar onde entrar</option>
              ${plataformasDisponiveis().map((p) => `<option value="${p.id}"${p.id === inicial ? ' selected' : ''}>Abrir no ${p.nome}${p.hub ? ` (tudo junto: ${nomesDoHub()})` : ''}</option>`).join('')}
            </select>
            <span class="ordenar-seta">${icone('ChevronDown')}</span>
          </span>
        </label>
      </div>`;
}

function ligarPlataformasConfig(raiz) {
  const secao = $('#cfg-plataformas', raiz);
  if (!secao) return;
  const redesenhar = () => {
    const nova = htmlParaNo(plataformasConfigHTML());
    secao.replaceWith(nova);
    ligarPlataformasConfig(raiz);
  };
  $('.cfg-plat-lista', secao).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-plataforma]');
    if (!b) return;
    const ids = new Set(plataformasHabilitadas());
    if (ids.has(b.dataset.plataforma)) ids.delete(b.dataset.plataforma); else ids.add(b.dataset.plataforma);
    if (!ids.size) { aviso('Deixe pelo menos uma plataforma habilitada.'); return; }
    await salvarPlataformas([...ids]);
    aposMudarPlataformas();
    if (typeof renderCelular === 'function') renderCelular();
    redesenhar();
  });
  $('#cfg-plat-inicial', secao).addEventListener('change', async (e) => {
    estado.config = await api.salvarConfig({ plataformaInicial: e.target.value });
  });
}
