'use strict';

// ---------- Prêmios: o Oscar (e, depois, outros) ----------
//
// Os dados vêm de lib/premios.js (api.premios): cada cerimônia com as categorias
// e os indicados, e cada filme indicado com o código do IMDb e o id do TMDB.
// A tela tem a lista de prêmios, uma aba por cerimônia (a mais recente com
// indicados primeiro) e, em cada categoria, a sua cédula: os indicados que você
// já viu (marcados sozinhos se o filme está na sua lista como visto) e o seu
// palpite de vencedor. Depois da cerimônia, o vencedor aparece e o app conta os
// acertos. As cédulas ficam em config.premios['oscar-98'] e vão para a nuvem.
//
// Os prêmios também viram filtros: na barra da lista ("Filtros"), no sorteio e
// na tierlist; e os detalhes do filme mostram as indicações dele.

const LISTA_PREMIOS = ['oscar'];
const NOMES_PREMIOS = { oscar: 'Oscar' };
const premiosDados = {}; // id → { nome, cerimonias, filmes }
let indicePremios = null;
const cachePremiosFilme = new Map();
const premiosTela = $('#premios');
const vista = { premio: 'oscar', numero: null, soFalta: false };

// ---- Dados ----

let carregandoPremios = null;
function carregarPremios() {
  if (!carregandoPremios) {
    carregandoPremios = (async () => {
      for (const id of LISTA_PREMIOS) premiosDados[id] = await api.premios(id);
      indicePremios = null;
      cachePremiosFilme.clear();
      agendarRender();
    })();
  }
  return carregandoPremios;
}

// Busca as cerimônias recentes (no máximo a cada 3 h na temporada, 1 vez por dia fora dela).
async function atualizarPremios({ forcar = false } = {}) {
  await carregarPremios();
  for (const id of LISTA_PREMIOS) {
    const r = await api.atualizarPremios(id, { forcar });
    if (!r || !r.ok) { if (forcar) aviso(`Não deu para atualizar o ${NOMES_PREMIOS[id]}: ${r && r.erro ? r.erro.mensagem : 'sem internet'}.`, { tipo: 'erro' }); continue; }
    premiosDados[id] = await api.premios(id);
    indicePremios = null;
    cachePremiosFilme.clear();
    if (!premiosTela.hidden) renderPremios();
    agendarRender();
  }
}

const idsDoIndicado = (premio, x) => (x.wiki && premiosDados[premio] && premiosDados[premio].filmes[x.wiki]) || {};

// Cada indicação, achável pelo IMDb, pelo TMDB ou (sem nenhum dos dois) pelo título.
function indice() {
  if (indicePremios) return indicePremios;
  const porImdb = new Map();
  const porTmdb = new Map();
  const porTitulo = new Map();
  const add = (m, k, r) => { if (!k) return; const l = m.get(k); if (l) l.push(r); else m.set(k, [r]); };
  for (const premio of LISTA_PREMIOS) {
    const d = premiosDados[premio];
    if (!d) continue;
    for (const c of d.cerimonias) {
      for (const k of c.categorias) {
        for (const x of k.indicados) {
          const ids = idsDoIndicado(premio, x);
          const r = { premio, numero: c.numero, ano: c.ano, chave: k.chave, nome: k.nome, pessoa: x.pessoa, venceu: x.venceu };
          add(porImdb, ids.imdb, r);
          add(porTmdb, ids.tmdb && String(ids.tmdb), r);
          if (!ids.imdb && !ids.tmdb) add(porTitulo, normalizar(x.titulo), r);
        }
      }
    }
  }
  indicePremios = { porImdb, porTmdb, porTitulo };
  return indicePremios;
}

// As indicações de um filme (da lista ou de fora): [{ premio, numero, ano, chave, nome, pessoa, venceu }].
function premiosDoFilme(f) {
  if (!f) return [];
  const chave = `${f.id}|${f.imdbID}|${f.tmdbId}|${f.titulo}|${f.ano}`;
  if (cachePremiosFilme.has(chave)) return cachePremiosFilme.get(chave);
  const { porImdb, porTmdb, porTitulo } = indice();
  const achados = new Set([...(porImdb.get(f.imdbID) || []), ...(porTmdb.get(String(f.tmdbId || '')) || [])]);
  // Sem código: pelo título, se o ano bate (a cerimônia é no ano seguinte ao do filme).
  const ano = anoNumero(f.ano);
  for (const r of porTitulo.get(normalizar(f.titulo)) || []) if (Number.isFinite(ano) && Math.abs(r.ano - 1 - ano) <= 1) achados.add(r);
  const lista = [...achados].sort((a, b) => b.numero - a.numero || Number(b.venceu) - Number(a.venceu));
  cachePremiosFilme.set(chave, lista);
  return lista;
}

// O filme da sua lista que é este indicado (ou null).
function filmeDoIndicado(premio, x, cerimonia) {
  const ids = idsDoIndicado(premio, x);
  return estado.filmes.find((f) => (ids.imdb && f.imdbID === ids.imdb) || (ids.tmdb && String(f.tmdbId) === String(ids.tmdb)))
    || (!ids.imdb && !ids.tmdb ? estado.filmes.find((f) => normalizar(f.titulo) === normalizar(x.titulo) && Math.abs(anoNumero(f.ano) - (cerimonia.ano - 1)) <= 1) : null)
    || null;
}

// ---- Filtros (barra da lista, sorteio, tierlist) ----

// 'oscar:indicado', 'oscar:venceu' ou 'oscar:venceu:Best Picture'
function passaPremio(f, filtro) {
  if (!filtro) return true;
  const [premio, tipo, chave] = filtro.split(':');
  return premiosDoFilme(f).some((r) => r.premio === premio && (tipo !== 'venceu' || r.venceu) && (!chave || nomeCategoria(premio, chave) === nomeCategoria(premio, r.chave)));
}

// O nome em português junta as categorias renomeadas (Filme Estrangeiro = Internacional).
function nomeCategoria(premio, chave) {
  for (const c of (premiosDados[premio] || { cerimonias: [] }).cerimonias) {
    const k = c.categorias.find((x) => x.chave === chave);
    if (k) return k.nome;
  }
  return chave;
}

function rotuloFiltroPremio(filtro) {
  const [premio, tipo, chave] = filtro.split(':');
  const nome = NOMES_PREMIOS[premio] || premio;
  return `${tipo === 'venceu' ? `Venceu o ${nome}` : `Indicado ao ${nome}`}${chave ? ` · ${nomeCategoria(premio, chave)}` : ''}`;
}

function filtrarPremio(filtro) {
  estado.premio = filtro || '';
  aplicarFiltroDaBarra();
}

// As categorias de um prêmio que têm algum filme da sua lista (para escolher no filtro).
function categoriasNaLista(premio) {
  const conta = new Map();
  for (const f of estado.filmes) {
    const nomes = new Set();
    for (const r of premiosDoFilme(f)) if (r.premio === premio && !nomes.has(r.nome)) { nomes.add(r.nome); const c = conta.get(r.nome) || { chave: r.chave, n: 0 }; c.n++; conta.set(r.nome, c); }
  }
  return [...conta].sort((a, b) => b[1].n - a[1].n).map(([nome, { chave, n }]) => ({ nome, chave, n }));
}

function escolherCategoriaPremio(premio) {
  const cats = categoriasNaLista(premio);
  let tipo = (estado.premio.split(':')[1]) || 'indicado';
  abrirModal(`${cabecalhoModal(`${NOMES_PREMIOS[premio]} por categoria`)}
    <div class="modal-corpo filtros-sorteio">
      <div class="secao"><h3>Mostrar</h3><div class="chips-linha" data-secao="tipo"></div></div>
      <div class="secao"><h3>Categoria</h3><div class="chips-linha" data-secao="cats">${cats.length ? '' : '<p>Nenhum filme da sua lista foi indicado ainda.</p>'}</div></div>
    </div>`, 'modal-filtros');
  const desenhar = () => {
    $('[data-secao="tipo"]', modal).innerHTML = [['indicado', 'Indicados'], ['venceu', 'Vencedores']]
      .map(([v, r]) => `<button class="chip${tipo === v ? ' ativo' : ''}" data-tipo="${v}" aria-pressed="${tipo === v}">${r}</button>`).join('');
    if (cats.length) {
      $('[data-secao="cats"]', modal).innerHTML = cats.map((c) => {
        const n = estado.filmes.filter((f) => passaPremio(f, `${premio}:${tipo}:${c.chave}`)).length;
        return `<button class="chip" data-cat="${esc(c.chave)}"${n ? '' : ' disabled'}>${esc(c.nome)}<span class="chip-qtd">${n}</span></button>`;
      }).join('');
    }
  };
  $('.filtros-sorteio', modal).addEventListener('click', (e) => {
    const t = e.target.closest('[data-tipo]');
    if (t) { tipo = t.dataset.tipo; desenhar(); return; }
    const c = e.target.closest('[data-cat]');
    if (c) { fecharModal(); filtrarPremio(`${premio}:${tipo}:${c.dataset.cat}`); }
  });
  desenhar();
}

SECOES_FILTRO.push({
  titulo: 'Prêmios',
  ativa: () => Boolean(estado.premio),
  itensHTML: () => LISTA_PREMIOS.map((p) => {
    const nome = NOMES_PREMIOS[p];
    const qtd = (filtro) => estado.filmes.filter((f) => passaPremio(f, filtro)).length;
    return itemMenuHTML(estado.premio === `${p}:indicado`, `data-premio="${p}:indicado"`, `Indicados ao ${nome}`, qtd(`${p}:indicado`))
      + itemMenuHTML(estado.premio === `${p}:venceu`, `data-premio="${p}:venceu"`, `Vencedores do ${nome}`, qtd(`${p}:venceu`))
      + itemMenuHTML(estado.premio.split(':').length === 3 && estado.premio.startsWith(`${p}:`), `data-premio-categoria="${p}"`, `${nome} por categoria…`, '');
  }).join(''),
  aoClicar: (e) => {
    const cat = e.target.closest('[data-premio-categoria]');
    if (cat) { fecharFlutuante(); escolherCategoriaPremio(cat.dataset.premioCategoria); return true; }
    const b = e.target.closest('[data-premio]');
    if (!b) return false;
    filtrarPremio(b.dataset.premio === estado.premio ? '' : b.dataset.premio);
    return true;
  },
  atualizarChip: () => {
    const chip = $('#chip-premio');
    chip.hidden = !estado.premio;
    chip.innerHTML = `${icone('Trophy')}<span>${esc(estado.premio ? rotuloFiltroPremio(estado.premio) : '')}</span>${icone('X')}`;
  },
});
$('#chip-premio').addEventListener('click', () => filtrarPremio(''));

// Sorteio: "Indicados ao Oscar", "Vencedores do Oscar".
const FILTROS_PREMIO_SORTEIO = LISTA_PREMIOS.flatMap((p) => [`${p}:indicado`, `${p}:venceu`]);

// Tierlist: "Indicado ao Oscar" / "Venceu o Oscar".
FILTROS_TL.push({
  chave: 'premios',
  titulo: 'Prêmios',
  valores: (f) => {
    const v = new Set();
    for (const r of premiosDoFilme(f)) { v.add(`Indicado ao ${NOMES_PREMIOS[r.premio]}`); if (r.venceu) v.add(`Venceu o ${NOMES_PREMIOS[r.premio]}`); }
    return [...v];
  },
});

// ---- Nos detalhes do filme ----

function premiosPainelHTML(f) {
  const lista = premiosDoFilme(f);
  if (!lista.length) return '';
  return LISTA_PREMIOS.map((p) => {
    const doPremio = lista.filter((r) => r.premio === p);
    if (!doPremio.length) return '';
    const vitorias = doPremio.filter((r) => r.venceu).length;
    const resumo = [vitorias ? `${vitorias} ${vitorias === 1 ? 'vitória' : 'vitórias'}` : '', `${doPremio.length} ${doPremio.length === 1 ? 'indicação' : 'indicações'}`].filter(Boolean).join(' · ');
    const itens = doPremio.map((r) => `<li${r.venceu ? ' class="venceu"' : ''}>
        <button class="link-premio" data-p="premio" data-premio="${r.premio}" data-numero="${r.numero}" title="Abrir a cédula do ${NOMES_PREMIOS[r.premio]} ${r.ano}">${r.ano}</button>
        <span>${esc(r.nome)}${r.pessoa ? ` <small>${esc(r.pessoa)}</small>` : ''}</span>
        ${r.venceu ? `<b class="selo-venceu">${icone('Trophy')} Venceu</b>` : ''}
      </li>`).join('');
    return `<details class="painel-ficha painel-premios">
      <summary><b>${icone('Trophy')} ${NOMES_PREMIOS[p]}:</b> <span>${resumo}</span></summary>
      <ul>${itens}</ul>
    </details>`;
  }).join('');
}

// ---- A tela ----

const chaveCedula = (premio, numero) => `${premio}-${numero}`;
const cedula = (premio, numero) => ((estado.config.premios || {})[chaveCedula(premio, numero)]) || { palpites: {} };
const chaveIndicado = (x) => `${x.titulo}|${x.pessoa}`;

function salvarCedula(premio, numero, c) {
  const todas = { ...(estado.config.premios || {}), [chaveCedula(premio, numero)]: { ...c, em: new Date().toISOString() } };
  estado.config.premios = todas;
  api.salvarConfig({ premios: todas });
}

function cerimoniaPadrao(premio) {
  const d = premiosDados[premio];
  if (!d || !d.cerimonias.length) return null;
  return (d.cerimonias.find((c) => c.indicados) || d.cerimonias[0]).numero;
}

async function abrirPremios({ premio = vista.premio, numero = null } = {}) {
  fecharPrevia(false);
  fecharPainel();
  premiosTela.hidden = false;
  vista.premio = premio;
  if (!premiosDados[premio]) {
    $('#premios-caixa').innerHTML = `<div class="tl-topo"><h2>Prêmios</h2><button class="redondo tl-fechar" data-pr="fechar" title="Fechar (Esc)" aria-label="Fechar">${icone('X')}</button></div><p class="mensagem">Carregando…</p>`;
    await carregarPremios();
  }
  vista.numero = numero || (vista.numero && premiosDados[premio].cerimonias.some((c) => c.numero === vista.numero) ? vista.numero : cerimoniaPadrao(premio));
  renderPremios();
  Movimento.animar($('#premios-caixa'), [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 260 });
  $('#premios [data-pr="fechar"]')?.focus({ preventScroll: true });
  // As cerimônias recentes podem ter mudado (indicados novos, vencedores).
  atualizarPremios();
}

function fecharPremios() {
  if (premiosTela.hidden) return;
  premiosTela.hidden = true;
  $('#premios-caixa').innerHTML = '';
}

// A capa de um indicado: a sua (se o filme está na lista) ou a do Stremio (Cinemeta), pelo IMDb.
function capaIndicadoHTML(f, ids, titulo) {
  const imdb = ids.imdb || (f && f.imdbID);
  const src = (f && srcCapa(f)) || (imdb ? `https://images.metahub.space/poster/small/${imdb}/img` : '');
  return src
    ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" data-titulo-capa="${esc(titulo)}">`
    : `<span class="pr-capa-vazia">${esc(titulo)}</span>`;
}

// A capa não carregou: fica o título.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.dataset.tituloCapa) return;
  const s = document.createElement('span');
  s.className = 'pr-capa-vazia';
  s.textContent = img.dataset.tituloCapa;
  img.replaceWith(s);
}, true);

function renderPremios() {
  const caixa = $('#premios-caixa');
  const premio = vista.premio;
  const d = premiosDados[premio];
  const c = d && d.cerimonias.find((x) => x.numero === vista.numero);
  const ordinalPt = (n) => `${n}º`;
  const abas = d.cerimonias.map((x) => `<button class="chip pr-aba${x.numero === vista.numero ? ' ativo' : ''}" data-pr="cerimonia" data-numero="${x.numero}" role="tab" aria-selected="${x.numero === vista.numero}" title="${ordinalPt(x.numero)} ${d.nome}${x.indicados ? '' : ' (indicados ainda não anunciados)'}">${x.ano}${x.indicados ? '' : ' <small>em breve</small>'}</button>`).join('');

  let corpo = '';
  if (!c) {
    corpo = '<p class="mensagem">Sem cerimônias ainda.</p>';
  } else if (!c.indicados) {
    corpo = `<section class="pr-resumo pr-aguardando">
      <span class="est-kicker">${icone('Hourglass')} ${ordinalPt(c.numero)} ${esc(d.nome)} · ${c.ano}</span>
      <p>Os indicados ainda não foram anunciados. ${premio === 'oscar' ? 'Eles saem no fim de janeiro' : 'Eles saem em breve'} e aparecem aqui sozinhos.</p>
      <button class="btn" data-pr="atualizar">${icone('RefreshCw')} Procurar agora</button>
    </section>`;
  } else {
    const ced = cedula(premio, c.numero);
    // Os filmes indicados (cada um uma vez) e quantos você viu.
    const filmes = new Map();
    for (const k of c.categorias) for (const x of k.indicados) {
      const chave = x.wiki || normalizar(x.titulo);
      if (!filmes.has(chave)) filmes.set(chave, filmeDoIndicado(premio, x, c));
    }
    const vistos = [...filmes.values()].filter((f) => f && f.visto).length;
    const naLista = [...filmes.values()].filter(Boolean).length;
    const palpitados = c.categorias.filter((k) => ced.palpites[k.chave]).length;
    const acertos = c.vencedores ? c.categorias.filter((k) => k.indicados.some((x) => x.venceu && chaveIndicado(x) === ced.palpites[k.chave])).length : 0;
    const pct = filmes.size ? Math.round((vistos / filmes.size) * 100) : 0;
    const nomesRepetidos = new Set(c.categorias.map((k) => k.nome).filter((n, i, l) => l.indexOf(n) !== i));

    const cards = c.categorias.map((k) => {
      const palpite = ced.palpites[k.chave];
      const indicados = k.indicados.map((x, i) => ({ x, i, f: filmeDoIndicado(premio, x, c) }))
        .filter(({ f }) => !vista.soFalta || !(f && f.visto));
      if (vista.soFalta && !indicados.length) return '';
      let status = '';
      if (c.vencedores && palpite) status = k.indicados.some((x) => x.venceu && chaveIndicado(x) === palpite) ? `<span class="pr-status certo">${icone('Check')} Acertou</span>` : `<span class="pr-status errado">${icone('X')} Errou</span>`;
      else if (!c.vencedores) status = palpite ? `<span class="pr-status">${icone('Trophy')} Palpite feito</span>` : '<span class="pr-status vazio">Sem palpite</span>';
      return `<section class="pr-cat" data-chave="${esc(k.chave)}">
        <header>
          <h4>${esc(k.nome)}${nomesRepetidos.has(k.nome) ? ` <small>${esc(k.original)}</small>` : ''}</h4>
          ${status}
        </header>
        <ol class="pr-indicados">${indicados.map(({ x, i, f }) => {
          const ids = idsDoIndicado(premio, x);
          const eu = palpite === chaveIndicado(x);
          const visto = Boolean(f && f.visto);
          const pessoa = x.pessoa && x.pessoa !== x.titulo ? x.pessoa : '';
          return `<li class="pr-ind${x.venceu ? ' venceu' : ''}${eu ? ' palpite' : ''}${visto ? ' visto' : ''}" data-i="${i}">
            <button class="pr-capa" data-pr="abrir" title="Ver os detalhes de ${esc(x.titulo)}">${capaIndicadoHTML(f, ids, x.titulo)}</button>
            <div class="pr-ind-texto">
              <b title="${esc(x.titulo)}">${esc(f ? f.titulo : x.titulo)}</b>
              ${pessoa ? `<span>${esc(pessoa)}</span>` : ''}
              ${x.venceu ? `<em class="selo-venceu">${icone('Trophy')} Venceu</em>` : ''}
            </div>
            <div class="pr-ind-acoes">
              <button class="pr-botao pr-visto${visto ? ' on' : ''}" data-pr="visto" aria-pressed="${visto}" title="${visto ? 'Você já viu (clique para desmarcar)' : f ? 'Marcar como visto' : 'Adicionar à sua lista como visto'}">${icone('Check')}<span>Visto</span></button>
              <button class="pr-botao pr-palpite${eu ? ' on' : ''}" data-pr="palpite" aria-pressed="${eu}" title="${eu ? 'Tirar o palpite' : 'Acho que este vence'}">${icone('Trophy')}<span>Palpite</span></button>
            </div>
          </li>`;
        }).join('')}</ol>
      </section>`;
    }).join('');

    corpo = `<section class="pr-resumo">
        <div class="pr-resumo-titulo">
          <span class="est-kicker">${icone('Trophy')} ${ordinalPt(c.numero)} ${esc(d.nome)} · ${c.ano}</span>
          <h3>Você viu ${vistos} de ${filmes.size} filmes indicados</h3>
          <div class="pr-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
          <p>${naLista - vistos > 0 ? `${naLista - vistos} ${naLista - vistos === 1 ? 'está' : 'estão'} na sua lista para ver. ` : ''}${c.vencedores ? 'Os vencedores já saíram.' : 'Os vencedores saem na cerimônia; faça seus palpites.'}</p>
        </div>
        <div class="pr-numeros">
          <div><b>${palpitados}<small>/${c.categorias.length}</small></b><span>palpites</span></div>
          ${c.vencedores && palpitados ? `<div class="ouro"><b>${acertos}<small>/${palpitados}</small></b><span>acertos</span></div>` : ''}
        </div>
        <div class="pr-acoes">
          <button class="chip${vista.soFalta ? ' ativo' : ''}" data-pr="so-falta" aria-pressed="${vista.soFalta}">${icone('EyeOff')} Só o que falta ver</button>
          ${palpitados ? `<button class="chip" data-pr="limpar-palpites">${icone('Eraser')} Limpar palpites</button>` : ''}
        </div>
      </section>
      <div class="pr-categorias">${cards || '<p class="mensagem">Você já viu todos os indicados. 🎉</p>'}</div>`;
  }

  caixa.innerHTML = `
    <div class="tl-topo pr-topo">
      <h2>Prêmios</h2>
      <div class="chips-linha pr-lista" role="radiogroup" aria-label="Prêmio">
        ${LISTA_PREMIOS.map((p) => `<button class="chip${p === premio ? ' ativo' : ''}" data-pr="premio" data-premio="${p}" role="radio" aria-checked="${p === premio}">${icone('Trophy')} ${esc(NOMES_PREMIOS[p])}</button>`).join('')}
      </div>
      <button class="redondo tl-fechar" data-pr="fechar" title="Fechar (Esc)" aria-label="Fechar">${icone('X')}</button>
    </div>
    <div class="pr-abas" role="tablist" aria-label="Cerimônias">${abas}</div>
    ${corpo}`;
  // A aba escolhida à vista.
  $('.pr-aba.ativo', caixa)?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

// Visto: o filme da lista muda; um filme fora da lista entra nela já como visto
// (sem data: dá para pôr no calendário depois, em "Lançar outro dia").
async function alternarVistoIndicado(premio, c, x) {
  const f = filmeDoIndicado(premio, x, c);
  if (f) {
    if (f.visto) { await alternar(f.id, 'visto', false); }
    else { f.visto = true; aposMudarDia(f.id); await api.atualizarFilme(f.id, { visto: true }); }
    renderPremios();
    return;
  }
  const ids = idsDoIndicado(premio, x);
  const dados = { titulo: x.titulo, ano: String(c.ano - 1), imdbID: ids.imdb || '', tmdbId: ids.tmdb || '' };
  const repetido = await api.acharRepetido(dados);
  if (repetido) {
    const f2 = porId(repetido.id) || repetido;
    f2.visto = true;
    aposMudarDia(f2.id);
    await api.atualizarFilme(f2.id, { visto: true });
  } else {
    const novo = await api.adicionarFilme(dados);
    novo.tmdbId = dados.tmdbId;
    novo.visto = true;
    estado.filmes.push(novo);
    await api.atualizarFilme(novo.id, { visto: true });
    aviso(`“${x.titulo}” entrou na sua lista como visto. Para pôr a data no calendário, use “Lançar outro dia” nos detalhes.`, { tipo: 'ok', duracao: 6000 });
  }
  render();
  renderPremios();
}

premiosTela.addEventListener('click', async (e) => {
  if (e.target === premiosTela) { fecharPremios(); return; }
  const b = e.target.closest('[data-pr]');
  if (!b) return;
  const d = premiosDados[vista.premio];
  const c = d && d.cerimonias.find((x) => x.numero === vista.numero);
  const li = b.closest('.pr-ind');
  const cat = b.closest('.pr-cat');
  const k = c && cat ? c.categorias.find((x) => x.chave === cat.dataset.chave) : null;
  const x = k && li ? k.indicados[Number(li.dataset.i)] : null;
  switch (b.dataset.pr) {
    case 'fechar': fecharPremios(); break;
    case 'premio': vista.premio = b.dataset.premio; vista.numero = cerimoniaPadrao(vista.premio); renderPremios(); break;
    case 'cerimonia': vista.numero = Number(b.dataset.numero); renderPremios(); $('#premios-caixa').scrollTo({ top: 0 }); break;
    case 'so-falta': vista.soFalta = !vista.soFalta; renderPremios(); break;
    case 'atualizar': b.disabled = true; await atualizarPremios({ forcar: true }); renderPremios(); break;
    case 'limpar-palpites': salvarCedula(vista.premio, c.numero, { ...cedula(vista.premio, c.numero), palpites: {} }); renderPremios(); break;
    case 'palpite': {
      if (!x) return;
      const ced = cedula(vista.premio, c.numero);
      const palpites = { ...ced.palpites };
      if (palpites[k.chave] === chaveIndicado(x)) delete palpites[k.chave]; else palpites[k.chave] = chaveIndicado(x);
      salvarCedula(vista.premio, c.numero, { ...ced, palpites });
      renderPremios();
      break;
    }
    case 'visto': if (x) { b.disabled = true; await alternarVistoIndicado(vista.premio, c, x); } break;
    case 'abrir': {
      if (!x) return;
      const f = filmeDoIndicado(vista.premio, x, c);
      const ids = idsDoIndicado(vista.premio, x);
      if (f) abrirPainel(f.id);
      else if (ids.tmdb) abrirFilmeExterno(ids.tmdb);
      else aviso('Não achei esse filme no TMDB.');
      break;
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.open && !premiosTela.hidden && !estado.painelId) { e.preventDefault(); fecharPremios(); }
});

// A roda do mouse rola as abas dos anos de lado.
premiosTela.addEventListener('wheel', (e) => {
  const abas = e.target.closest('.pr-abas');
  if (!abas || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
  e.preventDefault();
  abas.scrollLeft += e.deltaY;
}, { passive: false });

// Nos detalhes: o ano de uma indicação abre a cédula daquela cerimônia.
document.addEventListener('click', (e) => {
  const b = e.target.closest('#painel [data-p="premio"]');
  if (!b) return;
  e.stopPropagation();
  abrirPremios({ premio: b.dataset.premio, numero: Number(b.dataset.numero) });
}, true);

$('#btn-premios').addEventListener('click', () => abrirPremios());

carregarPremios().then(() => setTimeout(() => atualizarPremios(), 8000));
