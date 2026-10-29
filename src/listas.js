'use strict';

// ---------- Listas suas ("Ciclo Kurosawa", "Ver com alguém", "Rever"…) ----------
//
// Cada filme guarda os nomes das listas em que está (`f.listas`); a ordem e as
// listas ainda vazias ficam em `config.listas`. Nos detalhes, o filme mostra as
// listas dele e um botão para pôr ou tirar; na barra da lista, "Listas" filtra a
// tela por uma delas (e permite renomear ou apagar). O sorteio e a tierlist
// também filtram por lista.

const listasDe = (f) => (Array.isArray(f.listas) ? f.listas : []);

function todasListas() {
  const ordem = Array.isArray(estado.config.listas) ? estado.config.listas : [];
  const usadas = new Set(estado.filmes.flatMap(listasDe));
  return [...new Set([...ordem, ...[...usadas].sort((a, b) => a.localeCompare(b, 'pt', { sensitivity: 'base' }))])];
}
const qtdNaLista = (nome) => estado.filmes.filter((f) => listasDe(f).includes(nome)).length;

function salvarOrdemListas(nomes) {
  estado.config.listas = nomes;
  api.salvarConfig({ listas: nomes });
}

async function definirListasDoFilme(f, listas) {
  f.listas = listas;
  await api.atualizarFilme(f.id, { listas });
  aposMudarListas(f.id);
}

// Tudo o que mostra listas se atualiza.
function aposMudarListas(id) {
  if (estado.lista && !todasListas().includes(estado.lista)) estado.lista = '';
  render();
  if (id && estado.painelId === id) {
    const el = $('#painel .painel-listas');
    if (el) el.innerHTML = listasDoFilmeHTML(porId(id));
  }
}

function listasDoFilmeHTML(f) {
  const minhas = listasDe(f);
  return `${minhas.map((n) => `<button class="lista-chip" data-p="ver-lista" data-lista="${esc(n)}" title="Ver os filmes desta lista">${icone('Tag')}${esc(n)}</button>`).join('')}
    <button class="lista-chip lista-chip-mais" data-p="listas" aria-haspopup="menu">${icone(minhas.length ? 'Pencil' : 'ListPlus')}${minhas.length ? 'Listas' : 'Pôr numa lista'}</button>`;
}

// ---- Menu flutuante (perto do botão que o abriu) ----

let flutuante = null;
function fecharFlutuante() {
  if (!flutuante) return;
  flutuante.el.remove();
  flutuante = null;
}
function abrirFlutuante(botao, html, classe = '') {
  const mesmo = flutuante && flutuante.botao === botao;
  fecharFlutuante();
  if (mesmo) return null;
  const el = document.createElement('div');
  el.className = `tl-menu flutuante ${classe}`;
  el.innerHTML = html;
  document.body.append(el);
  const rb = botao.getBoundingClientRect();
  const alto = el.offsetHeight;
  const cabeEmbaixo = rb.bottom + 8 + alto < innerHeight - 12;
  el.style.top = `${cabeEmbaixo ? rb.bottom + 8 : Math.max(12, rb.top - 8 - alto)}px`;
  el.style.left = `${Math.max(12, Math.min(rb.left, innerWidth - el.offsetWidth - 12))}px`;
  Movimento.animar(el, [{ opacity: 0, transform: `translateY(${cabeEmbaixo ? -6 : 6}px)` }, { opacity: 1, transform: 'none' }], { duration: 160 });
  flutuante = { el, botao };
  return el;
}
document.addEventListener('pointerdown', (e) => {
  if (flutuante && !flutuante.el.contains(e.target) && !flutuante.botao.contains(e.target)) fecharFlutuante();
}, true);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !flutuante) return;
  e.stopImmediatePropagation();
  const botao = flutuante.botao;
  fecharFlutuante();
  botao.focus?.({ preventScroll: true });
}, true);
window.addEventListener('resize', fecharFlutuante);

// ---- Nos detalhes: em quais listas o filme está ----

function abrirListasDoFilme(botao, id) {
  const f = porId(id);
  if (!f) return;
  const desenhar = () => {
    const minhas = listasDe(f);
    return `
      <div class="tl-menu-itens" role="menu">${todasListas().map((n) => `
        <button class="tl-menu-item" role="menuitemcheckbox" aria-checked="${minhas.includes(n)}" data-lista="${esc(n)}">
          <span class="tl-menu-check">${minhas.includes(n) ? icone('Check') : ''}</span><span class="tl-menu-nome">${esc(n)}</span><span class="tl-menu-qtd">${qtdNaLista(n)}</span>
        </button>`).join('') || '<p class="listas-vazio">Você ainda não tem listas. Crie a primeira:</p>'}</div>
      <div class="tl-menu-sep"></div>
      <form class="listas-nova"><input placeholder="Nova lista…" maxlength="40" spellcheck="false" aria-label="Nome da nova lista"><button class="btn btn-icone" aria-label="Criar lista">${icone('Plus')}</button></form>`;
  };
  const menu = abrirFlutuante(botao, desenhar(), 'listas-menu');
  if (!menu) return;
  const redesenhar = () => { menu.innerHTML = desenhar(); ligar(); };
  const ligar = () => {
    $('.listas-nova', menu).addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = $('.listas-nova input', menu).value.trim().replace(/\s+/g, ' ');
      if (!nome) return;
      const existente = todasListas().find((n) => normalizar(n) === normalizar(nome)) || nome;
      if (!todasListas().includes(existente)) salvarOrdemListas([...todasListas(), existente]);
      if (!listasDe(f).includes(existente)) await definirListasDoFilme(f, [...listasDe(f), existente]);
      redesenhar();
      $('.listas-nova input', menu).focus();
    });
  };
  menu.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-lista]');
    if (!b) return;
    const nome = b.dataset.lista;
    const minhas = listasDe(f);
    await definirListasDoFilme(f, minhas.includes(nome) ? minhas.filter((n) => n !== nome) : [...minhas, nome]);
    redesenhar();
  });
  ligar();
  $('.listas-nova input', menu).focus();
}

// ---- Na barra da lista: filtrar por uma lista, renomear e apagar ----

function filtrarLista(nome) {
  estado.lista = nome || '';
  fecharFlutuante();
  fecharPainel();
  render();
  if (estado.lista) rolarParaLista();
}

function abrirMenuListasTela(botao) {
  const nomes = todasListas();
  const menu = abrirFlutuante(botao, `
    <div class="tl-menu-itens" role="menu">${nomes.map((n) => `
      <div class="listas-linha">
        <button class="tl-menu-item${estado.lista === n ? ' atual' : ''}" role="menuitemradio" aria-checked="${estado.lista === n}" data-filtrar="${esc(n)}">
          <span class="tl-menu-check">${estado.lista === n ? icone('Check') : ''}</span><span class="tl-menu-nome">${esc(n)}</span><span class="tl-menu-qtd">${qtdNaLista(n)}</span>
        </button>
        <button class="btn btn-icone listas-acao" data-renomear="${esc(n)}" title="Renomear" aria-label="Renomear ${esc(n)}">${icone('Pencil')}</button>
        <button class="btn btn-icone listas-acao perigo" data-apagar="${esc(n)}" title="Apagar a lista" aria-label="Apagar ${esc(n)}">${icone('Trash2')}</button>
      </div>`).join('') || '<p class="listas-vazio">Nenhuma lista ainda. Crie nos detalhes de um filme, em “Pôr numa lista”.</p>'}</div>
    ${estado.lista ? `<div class="tl-menu-sep"></div><button class="tl-menu-item" data-filtrar="">${icone('X')} Mostrar todos</button>` : ''}`, 'listas-menu listas-menu-tela');
  if (!menu) return;
  menu.addEventListener('click', async (e) => {
    const filtrar = e.target.closest('[data-filtrar]');
    if (filtrar) { filtrarLista(filtrar.dataset.filtrar === estado.lista ? '' : filtrar.dataset.filtrar); return; }
    const ren = e.target.closest('[data-renomear]');
    if (ren) { fecharFlutuante(); renomearLista(ren.dataset.renomear); return; }
    const apg = e.target.closest('[data-apagar]');
    if (apg) { fecharFlutuante(); apagarLista(apg.dataset.apagar); }
  });
}

async function trocarNomeEmTodos(de, para) {
  const mudados = estado.filmes.filter((f) => listasDe(f).includes(de));
  for (const f of mudados) {
    const novas = [...new Set(listasDe(f).map((n) => (n === de ? para : n)).filter(Boolean))];
    f.listas = novas;
    await api.atualizarFilme(f.id, { listas: novas });
  }
  return mudados;
}

function renomearLista(nome) {
  abrirModal(`${cabecalhoModal('Renomear lista')}
    <form class="modal-corpo" id="form-renomear-lista">
      <div class="busca-linha" style="margin:0"><input id="novo-nome-lista" value="${esc(nome)}" maxlength="40" spellcheck="false"><button class="btn btn-laranja">Salvar</button></div>
    </form>`, 'modal-pequeno');
  const input = $('#novo-nome-lista', modal);
  input.select();
  $('#form-renomear-lista', modal).addEventListener('submit', async (e) => {
    e.preventDefault();
    const novo = input.value.trim().replace(/\s+/g, ' ');
    if (!novo || novo === nome) { fecharModal(); return; }
    await trocarNomeEmTodos(nome, novo);
    salvarOrdemListas([...new Set(todasListas().map((n) => (n === nome ? novo : n)))].filter((n) => n !== nome || novo === nome));
    if (estado.lista === nome) estado.lista = novo;
    fecharModal();
    aposMudarListas(estado.painelId);
    aviso(`Lista renomeada para “${novo}”.`, { tipo: 'ok' });
  });
}

async function apagarLista(nome) {
  const ids = estado.filmes.filter((f) => listasDe(f).includes(nome)).map((f) => f.id);
  const ordemAntes = todasListas();
  await trocarNomeEmTodos(nome, '');
  salvarOrdemListas(ordemAntes.filter((n) => n !== nome));
  if (estado.lista === nome) estado.lista = '';
  aposMudarListas(estado.painelId);
  aviso(`Lista “${nome}” apagada${ids.length ? ` (${ids.length} ${ids.length === 1 ? 'filme saiu' : 'filmes saíram'} dela)` : ''}.`, {
    duracao: 8000,
    acao: {
      rotulo: 'Desfazer',
      fn: async () => {
        for (const id of ids) { const f = porId(id); if (f) { f.listas = [...listasDe(f), nome]; await api.atualizarFilme(id, { listas: f.listas }); } }
        salvarOrdemListas(ordemAntes);
        aposMudarListas(estado.painelId);
      },
    },
  });
}

$('#btn-listas').addEventListener('click', (e) => abrirMenuListasTela(e.currentTarget));
$('#chip-lista').addEventListener('click', () => filtrarLista(''));
