'use strict';

// ---------- NANDRoll: animes ----------
//
// A parte de animes da interface. Um anime pode ser:
// - série (`tipo: 'serie'`): tem episódios, status e vem da AniList;
// - filme de anime (`anime: true`, sem tipo): é um filme como os outros, e a
//   AniList só acrescenta onde assistir.
// O app.js chama as funções daqui nos pontos marcados com "NANDRoll".

// Plataformas: os animes ficam ligados quando o nandanimes está habilitado
// (Configurações > Plataformas; antes era a chave `nandroll`, que migra sozinha).
// Desabilitado, nada se perde: os animes só não aparecem no nandflix.
const nandrollLigado = () => plataformaHabilitada('nandanimes');

// Plataformas: os filtros de anime só onde fazem sentido. "Animes" só no hub
// (no nandanimes é a própria plataforma); "Assistindo" onde há animes.
function filtroAnimeVisivel(filtro) {
  if (filtro === 'animes') return nandrollLigado() && plataformaAtual().hub === true;
  if (filtro === 'assistindo') return nandrollLigado() && plataformaInclui('nandanimes');
  return true; // os outros filtros valem em todas
}

// Mostra ou esconde o que é só de anime na tela principal.
function aplicarNandroll() {
  const ligado = nandrollLigado() && plataformaInclui('nandanimes');
  for (const c of $$('.chip[data-filtro="animes"], .chip[data-filtro="assistindo"]')) c.hidden = !filtroAnimeVisivel(c.dataset.filtro);
  // O botão da agenda fica ao lado dos filtros.
  let agenda = $('#btn-agenda');
  const assistindo = $('.chip[data-filtro="assistindo"]');
  if (!agenda && assistindo) {
    agenda = document.createElement('button');
    Object.assign(agenda, { id: 'btn-agenda', className: 'chip chip-agenda', type: 'button', title: 'Os próximos episódios dos seus animes' });
    agenda.innerHTML = `${icone('CalendarClock')} Agenda`;
    agenda.addEventListener('click', () => abrirAgenda());
    assistindo.parentElement.after(agenda);
  }
  if (agenda) agenda.hidden = !ligado;
  if ((estado.filtro === 'animes' || estado.filtro === 'assistindo') && !filtroAnimeVisivel(estado.filtro)) {
    estado.filtro = 'todos';
    for (const c of $$('.chip[data-filtro]')) { c.classList.toggle('ativo', c.dataset.filtro === 'todos'); c.setAttribute('aria-checked', String(c.dataset.filtro === 'todos')); }
  }
}

// A seção das Configurações.
function nandrollConfigHTML() {
  return `
      <div class="secao">
        <h3>nandchan (animes)</h3>
        <div class="opcoes-radio nandroll-opcoes">
          <label><input type="checkbox" id="cfg-nandroll-plataformas" ${todasPlataformas() ? 'checked' : ''}> Mostrar plataformas de fora do Brasil</label>
        </div>
        <p>Busca de animes na AniList (sem chave), episódios e status das séries, próximo episódio e onde assistir. O botão Assistir abre sempre o Stremio; as plataformas oficiais ficam em “Onde assistir”, nos detalhes. Os títulos e as sinopses dos episódios vêm do TMDB (com a sua chave). Para usar, habilite o nandchan em Plataformas, acima; desabilitado, os animes já adicionados ficam guardados.</p>
        <div class="busca-linha nandroll-importar">
          <input id="cfg-anilist-usuario" placeholder="Seu usuário da AniList" spellcheck="false" autocomplete="off" aria-label="Usuário da AniList">
          <button class="btn" id="cfg-anilist-importar">${icone('Download')} Importar lista</button>
        </div>
        <p>Traz os animes da sua lista pública da AniList, com episódios vistos, status e notas. O que já está aqui não é duplicado.</p>
      </div>`;
}

function ligarNandrollConfig(raiz) {
  const importar = $('#cfg-anilist-importar', raiz);
  const usuario = $('#cfg-anilist-usuario', raiz);
  if (importar && usuario) {
    const ir = async () => {
      const nome = usuario.value.trim().replace(/^@/, '');
      if (!nome || importar.disabled) return;
      importar.disabled = true;
      importar.classList.add('carregando');
      const r = await api.importarAnilist(nome);
      importar.disabled = false;
      importar.classList.remove('carregando');
      if (!r.ok) { aviso('Sem conexão com a AniList. Tente de novo.', { tipo: 'erro' }); return; }
      const d = r.dados;
      if (d.naoEncontrado) { aviso(`Não achei a lista de “${nome}”. Confira o nome e se a lista é pública.`, { tipo: 'erro' }); return; }
      if (!d.series && !d.filmes) { aviso(d.repetidos ? 'Tudo dessa lista já estava aqui.' : 'Essa lista está vazia.'); return; }
      estado.filmes = d.lista;
      // Plataformas: importar animes habilita o nandanimes.
      if (!nandrollLigado()) {
        await salvarPlataformas([...plataformasHabilitadas(), 'nandanimes']);
        aplicarPlataforma();
        const sec = $('#cfg-plataformas', raiz);
        if (sec) { sec.replaceWith(htmlParaNo(plataformasConfigHTML())); ligarPlataformasConfig(raiz); }
      }
      render();
      if (typeof renderCelular === 'function') renderCelular();
      const partes = [d.series ? `${d.series} série${d.series > 1 ? 's' : ''}` : '', d.filmes ? `${d.filmes} filme${d.filmes > 1 ? 's' : ''}` : ''].filter(Boolean).join(' e ');
      aviso(`Importado: ${partes}. Temporadas e capas chegam aos poucos.`, { tipo: 'ok', duracao: 6000 });
    };
    importar.onclick = ir;
    usuario.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ir(); } });
  }
  const fora = $('#cfg-nandroll-plataformas', raiz);
  if (fora) fora.onchange = async () => {
    estado.config = await api.salvarConfig({ nandrollTodasPlataformas: fora.checked });
    if (estado.painelId) renderPainel();
  };
}

// A fonte da busca do "Adicionar": cada plataforma busca nas suas (nandanimes na
// AniList, nandflix no TMDB); só o hub deixa escolher e lembra a última.
function fonteAtual() {
  const p = plataformaAtual();
  if (!p.hub) return p.id === 'nandanimes' ? 'anime' : 'filme';
  return nandrollLigado() ? fonteBusca : 'filme';
}

// ehSerie e ehAnime: em plataformas.js (Plataformas).

const STATUS_ROTULOS = { planejo: 'Planejo ver', assistindo: 'Assistindo', pausado: 'Pausado', completo: 'Completo', largado: 'Larguei' };

// ---- Temporadas ----
//
// Uma série guarda todas as temporadas no mesmo item (`temporadas`). No painel,
// "Tudo" mostra a soma e a capa principal (TMDB); escolher uma temporada mostra
// os episódios dela e a capa dela (a da AniList, num quadro menor).

const temporadasDe = (f) => (Array.isArray(f.temporadas) ? f.temporadas : []);
const temporadaLancada = (t) => t.exibicao !== 'não lançado';
const temporadaCompleta = (t) => Boolean(t.episodios) && (Number(t.vistos) || 0) >= t.episodios;
// Um filme da ordem para assistir (Temporada 1 → Filme → Temporada 2).
const ehFilmeDaOrdem = (t) => Boolean(t) && t.formato === 'MOVIE';

// Os episódios vistos de uma temporada (como em lib/filmes.js): a `lista`
// quando há avulsos, senão do 1 ao `vistos`.
function marcadosDe(t) {
  if (Array.isArray(t.lista)) return t.lista.map(Number);
  return Array.from({ length: Math.max(0, Number(t.vistos) || 0) }, (_, i) => i + 1);
}
function primeiroQueFalta(t) {
  const vistos = new Set(marcadosDe(t));
  let n = 1;
  while (vistos.has(n)) n++;
  return n;
}

// A temporada escolhida em cada painel (id do item → índice; sem entrada = "Tudo").
const temporadaEscolhida = new Map();
function indiceTemporada(f) {
  const i = temporadaEscolhida.get(f.id);
  return Number.isInteger(i) && temporadasDe(f)[i] ? i : null;
}
// A temporada que o painel mostra: a escolhida no seletor ('tudo' = visão geral)
// ou, sem escolha, a em que a pessoa está (como a Netflix abre na temporada da vez).
// Série de uma temporada só: null (não há o que escolher).
function temporadaVista(f) {
  const ts = temporadasDe(f);
  if (ts.length < 2) return null;
  const e = temporadaEscolhida.get(f.id);
  if (e === 'tudo') return null;
  if (Number.isInteger(e) && ts[e]) return e;
  const c = temporadaCorrente(f);
  return c ? ts.indexOf(c) : null;
}
// A temporada em que a pessoa está: a primeira lançada ainda não terminada (ou a última lançada).
function temporadaCorrente(f) {
  const ts = temporadasDe(f);
  const lancadas = ts.filter(temporadaLancada);
  return lancadas.find((t) => !temporadaCompleta(t)) || lancadas[lancadas.length - 1] || ts[0] || null;
}

// Nome curto da temporada para o chip: o que sobra do título depois do nome da
// série ("SPY x FAMILY Season 2" → "Temporada 2", "… Mugen Train Arc" → "Mugen Train Arc").
function rotuloTemporada(f, t, i) {
  if (ehFilmeDaOrdem(t)) return rotuloFilme(f, t);
  if (i === 0) return 'Temporada 1';
  const limpo = (x) => String(x || '').replace(/[×✕]/g, 'x').trim();
  const raiz = temporadasDe(f)[0] || {};
  let resto = '';
  for (const [titulo, base] of [[t.titulo, raiz.titulo], [t.tituloRomaji, raiz.tituloRomaji], [t.titulo, raiz.tituloRomaji], [t.tituloRomaji, raiz.titulo]]) {
    const a = limpo(titulo); const b = limpo(base);
    if (a && b && a.toLowerCase().startsWith(b.toLowerCase()) && a.length > b.length) { resto = a.slice(b.length).replace(/^[\s:–—-]+/, '').trim(); break; }
  }
  if (!resto) return t.titulo || `Parte ${i + 1}`;
  return resto
    .replace(/\b(\d+)(?:st|nd|rd|th)\s+season\b/i, 'Temporada $1')
    .replace(/\bfinal season\b/i, 'Temporada final')
    .replace(/\bseason\s*(\d+)\b/i, 'Temporada $1')
    .replace(/\b(?:part|cour)\s*(\d+)\b/i, 'Parte $1');
}

// "Filme: Reze Arc" (o que sobra do título do filme depois do nome da série).
function rotuloFilme(f, t) {
  const raiz = temporadasDe(f).find((x) => !ehFilmeDaOrdem(x)) || {};
  const limpo = (x) => String(x || '').replace(/[×✕]/g, 'x').trim();
  let resto = '';
  for (const [titulo, base] of [[t.titulo, raiz.titulo], [t.tituloRomaji, raiz.tituloRomaji], [t.titulo, raiz.tituloRomaji]]) {
    const a = limpo(titulo); const b = limpo(base);
    if (a && b && a.toLowerCase().startsWith(b.toLowerCase()) && a.length > b.length) { resto = a.slice(b.length).replace(/^[\s:–—-]+/, '').trim(); break; }
  }
  resto = resto.replace(/^(?:the\s+)?movie\b[\s:–—-]*/i, '').replace(/^gekijouban\b[\s:–—-]*/i, '').trim();
  return resto ? `Filme: ${resto}` : 'Filme';
}

// "3 / 12 episódios", ou "3 episódios vistos" quando ainda não se sabe o total.
function contaEpisodiosHTML(vistos, total) {
  return total
    ? `<b>${vistos}</b> / ${total} episódio${total > 1 ? 's' : ''}`
    : `<b>${vistos}</b> episódio${vistos === 1 ? '' : 's'} visto${vistos === 1 ? '' : 's'}`;
}

// "Episódio 5 sai sexta-feira, 14 de novembro, às 12:30"
function proximoEpisodioTexto(p) {
  if (!p || !p.em) return '';
  const quando = new Date(p.em);
  if (Number.isNaN(quando.getTime()) || quando.getTime() < Date.now()) return '';
  const dia = quando.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const hora = quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `Episódio ${p.numero} sai ${dia}, às ${hora}`;
}

// Linha de dados do painel de uma série: "2022  4 temporadas  50 eps  24 min/ep  finalizado".
function serieMetaHTML(f) {
  const partes = [f.ano];
  const lancadas = temporadasDe(f).filter(temporadaLancada);
  const n = lancadas.filter((t) => !ehFilmeDaOrdem(t)).length;
  const filmes = lancadas.length - n;
  if (n > 1) partes.push(`${n} temporadas`);
  if (filmes) partes.push(filmes === 1 ? '1 filme' : `${filmes} filmes`);
  const eps = lancadas.length ? (lancadas.every((t) => t.episodios) ? lancadas.filter((t) => !ehFilmeDaOrdem(t)).reduce((s, t) => s + t.episodios, 0) : 0) : Number(f.episodios) || 0;
  if (eps) partes.push(`${eps} ep${eps > 1 ? 's' : ''}`);
  if (f.duracao) partes.push(`${f.duracao} min/ep`);
  if (f.exibicao) partes.push(f.exibicao);
  return partes.filter(Boolean).map((p) => `<span>${esc(p)}</span>`).join('') || '&nbsp;';
}

// ---- Onde assistir ----

// Os serviços que funcionam no Brasil. A AniList lista os links de todos os
// países; por padrão só estes aparecem (Configurações → NANDRoll mostra todos).
const PLATAFORMAS_BR = new Set(['crunchyroll', 'netflix', 'amazon prime video', 'prime video', 'amazon', 'disney plus', 'disney+', 'max', 'hbo max',
  'youtube', 'apple tv', 'apple tv+', 'paramount plus', 'paramount+', 'pluto tv', 'globoplay', 'star+', 'claro video', 'looke', 'anime onegai', 'mubi']);
const todasPlataformas = () => Boolean(estado.config && estado.config.nandrollTodasPlataformas);
const plataformaVisivel = (l) => todasPlataformas() || PLATAFORMAS_BR.has(String(l.site || '').toLowerCase().trim());

// Os links das plataformas oficiais, para séries (da temporada `t`) e filmes de anime.
function ondeAssistirAnimeHTML(f, t = null, indice = null) {
  const todos = Array.isArray((t || f).ondeAssistir) ? (t || f).ondeAssistir : [];
  const links = todos.map((l, i) => ({ ...l, i })).filter(plataformaVisivel);
  const id = (t && t.anilistId) || f.anilistId;
  if (!links.length && !id) return '';
  const dt = indice === null ? '' : ` data-t="${indice}"`;
  const botoes = links.map((l) => `<button class="chip chip-plataforma" data-serie="plataforma" data-i="${l.i}" data-site="${esc(l.site)}"${dt} title="Abrir em ${esc(l.site)}">${icone('Play')} ${esc(l.site)}</button>`).join('')
    + (ehSerie(f) ? `<button class="chip chip-plataforma chip-anilist" data-serie="stremio" title="Abrir no Stremio">Stremio</button>` : '');
  const anilist = id ? `<button class="chip chip-plataforma chip-anilist" data-serie="anilist"${dt} title="Abrir a página na AniList">AniList</button>` : '';
  const escondidos = todos.length - links.length;
  const nota = escondidos && !links.length ? `<span class="onde-nota">Só em plataformas de fora do Brasil (${escondidos}).</span>` : '';
  return `<div class="onde-assistir"><b>${links.length ? 'Onde assistir' : 'Mais sobre'}</b><div class="chips-linha">${botoes}${anilist}</div>${nota}</div>`;
}

// ---- O bloco do painel ----

// O seletor de temporadas, como o da Netflix: um botão com o nome da temporada
// em vista que abre a lista de todas (com os filmes da franquia na ordem de
// assistir e o progresso de cada uma). Cabe em qualquer quantidade de temporadas,
// no PC e no toque, sem encher o painel de chips.
function seletorTemporadasHTML(f, vista) {
  const ts = temporadasDe(f);
  if (ts.length < 2) return '';
  const textoLado = (t) => {
    if (!temporadaLancada(t)) return 'em breve';
    if (ehFilmeDaOrdem(t)) return Number(t.vistos) ? 'visto' : 'filme';
    return t.episodios ? `${Number(t.vistos) || 0}/${t.episodios}` : `${Number(t.vistos) || 0} eps`;
  };
  const opcao = (i, icones, nome, lado, titulo = '') => {
    const ativa = vista === i;
    return `<button class="temp-opcao${ativa ? ' ativa' : ''}${i !== null && !temporadaLancada(ts[i]) ? ' nao-lancada' : ''}" role="option" aria-selected="${ativa}" data-serie="temporada" data-t="${i === null ? '' : i}"${titulo ? ` title="${esc(titulo)}"` : ''}>
      <span class="temp-icone">${icones}</span><span class="temp-nome">${esc(nome)}</span><span class="temp-lado">${esc(lado)}</span></button>`;
  };
  const atual = vista === null ? 'Todas as temporadas' : rotuloTemporada(f, ts[vista], vista);
  const ladoAtual = vista === null ? '' : textoLado(ts[vista]);
  return `<div class="temp-seletor" data-temp-seletor>
    <button class="temp-botao" data-serie="temp-menu" aria-haspopup="listbox" aria-expanded="false" title="Trocar de temporada">
      ${vista !== null && ehFilmeDaOrdem(ts[vista]) ? icone('Clapperboard') : ''}<span class="temp-nome">${esc(atual)}</span>${ladoAtual ? `<span class="temp-lado">${esc(ladoAtual)}</span>` : ''}${icone('ChevronDown')}
    </button>
    <div class="temp-menu" role="listbox" aria-label="Temporadas" hidden>
      ${opcao(null, icone('LayoutList'), 'Todas as temporadas', '')}
      ${ts.map((t, i) => opcao(i, temporadaCompleta(t) ? icone('Check') : ehFilmeDaOrdem(t) ? icone('Clapperboard') : '', rotuloTemporada(f, t, i), textoLado(t), `${t.titulo}${t.ano ? ` (${t.ano})` : ''}`)).join('')}
    </div>
  </div>`;
}

// Contador de episódios, status, próximo episódio e onde assistir.
// O "Remover da lista" fica à mão no próprio bloco do anime (o do rodapé do painel é fácil de não ver).
// É o mesmo data-p="excluir": o app.js remove na hora, com "Desfazer" no aviso.
const removerAnimeHTML = () => `<div class="serie-remover-linha"><button class="btn btn-perigo serie-remover" data-p="excluir">${icone('Trash2')} Remover da lista</button></div>`;

function animeNoPainelHTML(f) {
  if (!ehAnime(f)) return '';
  if (!ehSerie(f)) return `<div class="serie" data-anime-bloco>${ondeAssistirAnimeHTML(f)}${removerAnimeHTML()}</div>`;
  const ts = temporadasDe(f);
  const vista = temporadaVista(f);
  const t = vista === null ? null : ts[vista];
  const vistos = t ? Number(t.vistos) || 0 : Number(f.episodiosVistos) || 0;
  const total = t ? Number(t.episodios) || 0 : Number(f.episodios) || 0;
  const status = STATUS_ROTULOS[f.status] ? f.status : 'planejo';
  const corrente = t || temporadaCorrente(f);
  const proximo = proximoEpisodioTexto(t ? t.proximoEpisodio : f.proximoEpisodio);
  // Com todos os episódios mas sem estar completa (o ✓ foi desmarcado), "Vi mais um" completa de novo.
  const cheio = t ? (temporadaCompleta(t) || !temporadaLancada(t)) : (total > 0 && vistos >= total && status === 'completo');
  const nomeDaVez = !t && ts.length > 1 && corrente && status !== 'completo' ? `<p class="serie-da-vez">Você está em: <b>${esc(rotuloTemporada(f, corrente, ts.indexOf(corrente)))}</b></p>` : '';
  const filme = ehFilmeDaOrdem(t);
  const cabecalho = t ? `
      <div class="serie-temporada">
        ${t.poster ? `<img class="serie-capa-temporada" src="${esc(t.poster)}" alt="" loading="lazy">` : ''}
        <p><b>${esc(t.titulo)}</b><span>${[t.ano, filme ? 'filme' : t.episodios ? `${t.episodios} eps` : '', filme && t.duracao ? `${t.duracao} min` : '', t.exibicao].filter(Boolean).map(esc).join(' · ')}</span></p>
      </div>` : '';
  // Os episódios: da temporada em vista, ou da única que houver.
  const iLista = vista !== null ? vista : ts.length === 1 ? 0 : null;
  return `
    <div class="serie" data-anime-bloco>
      ${seletorTemporadasHTML(f, vista)}
      ${cabecalho}${nomeDaVez}
      <div class="serie-linha">
        <button class="redondo serie-menos" data-serie="menos" title="${filme ? 'Desmarcar o filme' : 'Um episódio a menos'}" aria-label="${filme ? 'Desmarcar o filme' : 'Um episódio a menos'}"${vistos ? '' : ' disabled'}>${icone('Minus')}</button>
        ${filme
    ? `<span class="serie-conta">${vistos ? `${icone('Check')} Filme visto` : 'Filme não visto'}</span>`
    : `<button class="serie-conta" data-serie="digitar" aria-live="polite" title="Clique para digitar quantos episódios você já viu">${contaEpisodiosHTML(vistos, total)}</button>`}
        <button class="btn btn-laranja serie-mais" data-serie="mais"${cheio ? ' disabled' : ''}>${icone('Plus')} ${filme ? 'Vi o filme' : 'Vi mais um'}</button>
        <label class="serie-status"><span class="sr-so">Status</span>
          <select data-serie-status aria-label="Status da série">
            ${Object.entries(STATUS_ROTULOS).map(([k, r]) => `<option value="${k}"${k === status ? ' selected' : ''}>${r}</option>`).join('')}
          </select>
        </label>
      </div>
      ${total && !filme ? `<div class="serie-barra" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${vistos}"><span style="width:${Math.round((vistos / total) * 100)}%"></span></div>` : ''}
      ${!filme && faltaTexto(total - vistos, t ? t.duracao : f.duracao, total) ? `<p class="serie-falta">${esc(faltaTexto(total - vistos, t ? t.duracao : f.duracao, total))}</p>` : ''}
      ${!t && episodiosNovos(f) ? `<p class="serie-novos">${icone('Sparkles')} ${episodiosNovos(f) === 1 ? '1 episódio novo' : `${episodiosNovos(f)} episódios novos`} para ver</p>` : ''}
      ${t && !temporadaLancada(t) ? '<p class="serie-proximo">Ainda não lançada.</p>' : ''}
      ${proximo ? `<p class="serie-proximo">${icone('CalendarClock')} ${esc(proximo)}</p>` : ''}
      ${ts.length ? ondeAssistirAnimeHTML(f, corrente, corrente ? ts.indexOf(corrente) : null) : ondeAssistirAnimeHTML(f)}
      ${aberturasHTML(f, vista)}
      ${listaEpisodiosHTML(f, iLista, vista)}
      ${removerAnimeHTML()}
    </div>`;
}

// A capa do painel: a principal em "Tudo"; numa temporada, a capa dela (a da
// AniList) num quadro menor e do formato da própria imagem, sem faixas nem corte.
function ajustarCapaTemporada(f) {
  const lugar = $('#painel .destaque-poster');
  if (!lugar || !f) return;
  const sel = ehSerie(f) ? indiceTemporada(f) : null;
  const t = sel === null ? null : temporadasDe(f)[sel];
  const deTemporada = Boolean(t && t.poster);
  if (!deTemporada && !lugar.classList.contains('de-temporada')) return; // já é a principal
  lugar.classList.toggle('de-temporada', deTemporada);
  lugar.innerHTML = deTemporada
    ? `<div class="capa capa-temporada"><img src="${esc(t.poster)}" alt="" data-titulo="${esc(t.titulo)}" data-ano="${esc(t.ano)}"></div>`
    : capaHTML(f, { tamanho: 'grande' });
}

// ---- Episódios novos e quanto falta ----

// Quantos episódios de uma temporada já saíram. O "próximo episódio" guardado
// pode ter ficado para trás (o app não abriu desde então): se a data passou, ele saiu.
function episodiosNoAr(t) {
  if (!temporadaLancada(t)) return 0;
  const p = t.proximoEpisodio;
  let n = Number(t.episodios) || 0;
  if (p && p.numero) {
    const saiu = new Date(p.em).getTime() <= Date.now() ? p.numero : p.numero - 1;
    n = n ? Math.min(saiu, n) : saiu;
  }
  return Math.max(n, Number(t.vistos) || 0);
}

// Episódios novos: os que já saíram da temporada em exibição e a pessoa ainda
// não viu. Só conta para quem está em dia com as temporadas anteriores (senão
// "novos" seria a série inteira).
function episodiosNovos(f) {
  if (!ehSerie(f) || !nandrollLigado() || !['assistindo', 'pausado'].includes(f.status)) return 0;
  const ts = temporadasDe(f);
  const t = ts.length ? temporadaCorrente(f) : { ...f, vistos: f.episodiosVistos };
  if (!t || t.exibicao !== 'em exibição') return 0;
  const vistos = new Set(marcadosDe(t));
  let novos = 0;
  for (let n = 1; n <= episodiosNoAr(t); n++) if (!vistos.has(n)) novos++;
  return novos;
}

// "Faltam 20 episódios · cerca de 8 h"
function faltaTexto(faltam, minutosPorEp, total) {
  if (!total || faltam <= 0) return '';
  const min = faltam * (Number(minutosPorEp) || 0);
  const tempo = !min ? '' : min < 90 ? ` · cerca de ${min} min` : ` · cerca de ${Math.round(min / 60)} h`;
  return `${faltam === 1 ? 'Falta 1 episódio' : `Faltam ${faltam} episódios`}${tempo}`;
}

// Selo na capa das séries: episódios novos, ou o progresso ("3/12").
function seloSerieTexto(f) {
  if (!ehSerie(f)) return '';
  const novos = episodiosNovos(f);
  if (novos) return novos === 1 ? '1 novo' : `${novos} novos`;
  const vistos = Number(f.episodiosVistos) || 0;
  if (!vistos || f.status === 'completo') return '';
  return f.episodios ? `${vistos}/${f.episodios}` : `ep ${vistos}`;
}
function seloSerieHTML(f) {
  const texto = seloSerieTexto(f);
  return texto ? `<span class="selo-serie${episodiosNovos(f) ? ' novo' : ''}">${esc(texto)}</span>` : '';
}

// O episódio que a pessoa vai ver agora (o número dentro da temporada em que está).
function proximoParaVer(f) {
  const t = temporadasDe(f).length ? temporadaCorrente(f) : null;
  return t ? primeiroQueFalta(t) : (Number(f.episodiosVistos) || 0) + 1;
}
// "Ep. 5", ou "Filme" quando a vez é do filme da ordem.
const vezEhFilme = (f) => ehFilmeDaOrdem(temporadasDe(f).length ? temporadaCorrente(f) : null);
const rotuloDaVez = (f) => (vezEhFilme(f) ? 'Filme' : `Ep. ${proximoParaVer(f)}`);
const textoDaVez = (f) => (vezEhFilme(f) ? 'o filme' : `o episódio ${proximoParaVer(f)}`);

// ---- A lista de episódios ----
//
// Número, título, sinopse, imagem e duração de cada episódio (TMDB), com o ✓ de
// visto de cada um. Vem do processo principal (api.episodiosSerie, com cache em
// disco); aqui só guardamos a resposta enquanto o app está aberto. Sem chave do
// TMDB, sem a série no TMDB ou sem internet, volta a grade de números (abaixo).
const episodiosGuardados = new Map(); // "id:temporada:total" → { ok, episodios } ou { ok: false, motivo, em }
const episodiosPedidos = new Set();
const paginasEpisodios = new Map(); // "id:temporada" → página (temporadas com muitos episódios)
const POR_PAGINA = 20;

function carregarEpisodios(f, indice, chave) {
  if (episodiosPedidos.has(chave)) return;
  episodiosPedidos.add(chave);
  api.episodiosSerie(f.id, indice).then((r) => {
    episodiosGuardados.set(chave, r && r.ok ? r : { ok: false, motivo: (r && r.motivo) || 'rede', em: Date.now() });
  }).catch(() => {
    episodiosGuardados.set(chave, { ok: false, motivo: 'rede', em: Date.now() });
  }).finally(() => {
    episodiosPedidos.delete(chave);
    if (estado.painelId === f.id) renderPainel();
  });
}

const dataEpisodio = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '');
};

function episodioHTML(e, indice, visto, saiu) {
  const meta = [e.duracao ? `${e.duracao} min` : '', e.data ? dataEpisodio(e.data) : ''].filter(Boolean).join(' · ');
  const longa = (e.sinopse || '').length > 130;
  return `<li class="ep-item${visto ? ' visto' : ''}${saiu ? '' : ' futuro'}">
    <div class="ep-imagem">${e.imagem ? `<img src="${esc(e.imagem)}" alt="" loading="lazy">` : `<span>${e.n}</span>`}</div>
    <div class="ep-texto">
      <b class="ep-titulo">${e.n}. ${esc(e.titulo || `Episódio ${e.n}`)}</b>
      ${meta ? `<span class="ep-meta">${esc(meta)}</span>` : ''}
      ${e.sinopse ? `<p class="ep-sinopse">${esc(e.sinopse)}</p>` : ''}
      ${longa ? '<button class="ep-mais" data-serie="ep-mais" aria-expanded="false">mais</button>' : ''}
    </div>
    <button class="ep-check" data-serie="ep" data-t="${indice}" data-n="${e.n}" aria-pressed="${visto}" aria-label="Episódio ${e.n}: ${visto ? 'visto, desmarcar' : 'marcar como visto'}"${saiu || visto ? '' : ' disabled'}>${icone('Check')}</button>
  </li>`;
}

function listaEpisodiosHTML(f, indice, vista) {
  const ts = temporadasDe(f);
  if (!ts.length) return '';
  const t = indice === null ? null : ts[indice];
  // Visão geral, filme ou sem TMDB: a grade de números (ou só o botão para ir à temporada).
  if (!t || ehFilmeDaOrdem(t) || !estado.config.tmdbKey || !f.tmdbTvId) return gradeHTML(f, indice, vista);
  const chave = `${f.id}:${indice}:${t.episodios || 0}`;
  const r = episodiosGuardados.get(chave);
  if (!r) {
    carregarEpisodios(f, indice, chave);
    return '<div class="ep-lista-bloco"><h3 class="ep-titulo-secao">Episódios</h3><p class="ep-carregando">Carregando os episódios…</p></div>';
  }
  if (!r.ok) {
    // Sem internet: tenta de novo na próxima vez (passado meio minuto); os outros motivos não mudam sozinhos.
    if (r.motivo === 'rede' && Date.now() - r.em > 30000) episodiosGuardados.delete(chave);
    return gradeHTML(f, indice, vista);
  }
  const vistos = new Set(marcadosDe(t));
  const noAr = episodiosNoAr(t);
  const saiu = (n) => !['em exibição', 'não lançado'].includes(t.exibicao) || n <= noAr;
  const eps = r.episodios;
  let de = 0;
  let ate = eps.length;
  let navegacao = '';
  if (eps.length > POR_PAGINA + 4) {
    const paginas = Math.ceil(eps.length / POR_PAGINA);
    const guardada = paginasEpisodios.get(`${f.id}:${indice}`);
    const pagina = Math.min(paginas - 1, Math.max(0, guardada !== undefined ? guardada : Math.floor((primeiroQueFalta(t) - 1) / POR_PAGINA)));
    de = pagina * POR_PAGINA;
    ate = Math.min(eps.length, de + POR_PAGINA);
    navegacao = `<div class="ep-paginas">
      <button class="chip" data-serie="ep-pagina" data-d="-1" data-t="${indice}" data-pg="${pagina}"${pagina ? '' : ' disabled'} aria-label="Episódios anteriores">${icone('ChevronLeft')}</button>
      <span>Episódios ${de + 1}–${ate} de ${eps.length}</span>
      <button class="chip" data-serie="ep-pagina" data-d="1" data-t="${indice}" data-pg="${pagina}"${pagina < paginas - 1 ? '' : ' disabled'} aria-label="Próximos episódios">${icone('ChevronRight')}</button>
    </div>`;
  }
  return `<div class="ep-lista-bloco">
    <h3 class="ep-titulo-secao">Episódios</h3>
    <ul class="ep-lista" aria-label="Episódios de ${esc(rotuloTemporada(f, t, indice))}">${eps.slice(de, ate).map((e) => episodioHTML(e, indice, vistos.has(e.n), saiu(e.n))).join('')}</ul>
    ${navegacao}
  </div>`;
}

// ---- Aberturas ----
//
// As aberturas do anime (ou da temporada em vista) vêm do YouTube, achadas como
// os trailers (lib/trailer.js), e tocam no player embutido, sem sair do app.
const aberturasAbertas = new Set(); // ids com a seção aberta
const aberturasGuardadas = new Map(); // "id|título" → { ok, videos }
const aberturasPedidas = new Set();
const aberturaTocando = new Map(); // id → código do vídeo

const tempoVideo = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');

function aberturasHTML(f, vista) {
  if (!ehSerie(f)) return '';
  const aberta = aberturasAbertas.has(f.id);
  const botao = `<button class="chip serie-grade-abrir${aberta ? ' ativo' : ''}" data-serie="aberturas" aria-expanded="${aberta}">${icone('Music')} ${aberta ? 'Fechar aberturas' : 'Aberturas'}</button>`;
  if (!aberta) return `<div class="aberturas">${botao}</div>`;
  const t = vista === null ? null : temporadasDe(f)[vista];
  const chave = `${f.id}|${(t && t.titulo) || f.titulo}`;
  const r = aberturasGuardadas.get(chave);
  let corpo;
  if (!r) {
    if (!aberturasPedidas.has(chave)) {
      aberturasPedidas.add(chave);
      api.aberturasAnime(f.id, vista).then((x) => aberturasGuardadas.set(chave, x && x.ok ? x : { ok: false, em: Date.now() }))
        .catch(() => aberturasGuardadas.set(chave, { ok: false, em: Date.now() }))
        .finally(() => { aberturasPedidas.delete(chave); if (estado.painelId === f.id) renderPainel(); });
    }
    corpo = '<p class="ep-carregando">Procurando as aberturas no YouTube…</p>';
  } else if (!r.ok || !r.videos.length) {
    if (!r.ok && Date.now() - r.em > 30000) aberturasGuardadas.delete(chave);
    corpo = `<p class="ep-carregando">${r.ok ? 'Não achei aberturas deste anime.' : 'Sem conexão com o YouTube. Tente de novo em instantes.'}</p>`;
  } else {
    const tocando = r.videos.find((v) => v.id === aberturaTocando.get(f.id));
    const item = (v) => {
      const ativo = Boolean(tocando && tocando.id === v.id);
      return `<li><button class="ab-item${ativo ? ' ativa' : ''}" data-serie="abertura" data-v="${esc(v.id)}" aria-pressed="${ativo}">
        <span class="ab-capa"><img src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt="" loading="lazy">${icone(ativo ? 'Pause' : 'Play', { preenchido: true })}</span>
        <span class="ab-titulo">${esc(v.titulo)}</span><span class="ab-tempo">${tempoVideo(v.duracao)}</span></button></li>`;
    };
    corpo = `${tocando ? `<div class="ab-player"><iframe src="${urlTrailer(tocando.id, { mudo: false, controles: true })}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="${esc(tocando.titulo)}"></iframe></div>` : ''}
      <ul class="ab-lista">${r.videos.map(item).join('')}</ul>`;
  }
  return `<div class="aberturas aberta">${botao}<div class="ab-corpo">${corpo}</div></div>`;
}

// ---- A grade de episódios ----
//
// Para marcar um episódio avulso (viu o 7 sem ter visto o 5). Fica fechada:
// abre pelo botão "Escolher episódios". Os +1 e -1 continuam funcionando.
const gradesAbertas = new Set();

function gradeHTML(f, indice, sel) {
  const ts = temporadasDe(f);
  if (!ts.length) return '';
  // Na visão geral (todas as temporadas) o botão leva à temporada da vez, com a lista.
  if (indice === null) {
    const c = temporadaCorrente(f);
    if (!c || ehFilmeDaOrdem(c)) return '';
    return `<button class="chip serie-grade-abrir" data-serie="ver-da-vez" data-t="${ts.indexOf(c)}">${icone('List')} Ver os episódios de ${esc(rotuloTemporada(f, c, ts.indexOf(c)))}</button>`;
  }
  const t = ts[indice];
  if (!t || ehFilmeDaOrdem(t)) return '';
  const vistos = new Set(marcadosDe(t));
  const noAr = episodiosNoAr(t);
  const ate = Math.max(Number(t.episodios) || 0, noAr, ...vistos, 0);
  if (!ate) return '';
  const aberta = gradesAbertas.has(f.id);
  const botao = `<button class="chip serie-grade-abrir${aberta ? ' ativo' : ''}" data-serie="grade" aria-expanded="${aberta}">${icone('LayoutGrid')} ${aberta ? 'Fechar episódios' : 'Escolher episódios'}</button>`;
  if (!aberta) return botao;
  // Ainda não saiu: só quando se sabe (temporada em exibição ou não lançada).
  const saiu = (n) => !['em exibição', 'não lançado'].includes(t.exibicao) || n <= noAr;
  const eps = [];
  for (let n = 1; n <= ate; n++) {
    const visto = vistos.has(n);
    eps.push(`<button class="ep${visto ? ' visto' : ''}${saiu(n) ? '' : ' futuro'}" data-serie="ep" data-t="${indice}" data-n="${n}" aria-pressed="${visto}" aria-label="Episódio ${n}${visto ? ', visto' : ''}"${saiu(n) || visto ? '' : ' disabled'}>${n}</button>`);
  }
  return `${botao}<div class="serie-grade" role="group" aria-label="Episódios de ${esc(rotuloTemporada(f, t, indice))}">${eps.join('')}</div>`;
}

async function alternarEp(id, indice, n) {
  const f = porId(id);
  if (!ehSerie(f)) return;
  const antes = f.status;
  const novo = await api.episodioSerie(id, indice, n, hoje());
  if (!novo) return;
  Object.assign(f, novo);
  if (f.status === 'completo' && antes !== 'completo') aviso(`“${f.titulo}” completo!`, { tipo: 'ok' });
  aposMudarDia(id);
}

async function mudarEpisodios(id, delta, indice) {
  const f = porId(id);
  if (!ehSerie(f)) return;
  const antes = f.status;
  const novo = await api.progressoSerie(id, delta, hoje(), indice === undefined ? temporadaVista(f) : indice);
  if (!novo) return;
  Object.assign(f, novo);
  if (f.status === 'completo' && antes !== 'completo') aviso(`“${f.titulo}” completo!`, { tipo: 'ok' });
  aposMudarDia(id);
}

// "+1" fora do painel (agenda, aviso ao abrir o anime): marca o
// próximo episódio na ordem, com um aviso que desfaz.
let avisoEpisodio = null;
async function viMaisUm(id) {
  const f = porId(id);
  if (!ehSerie(f)) return;
  const vez = textoDaVez(f);
  const antes = Number(f.episodiosVistos) || 0;
  await mudarEpisodios(id, 1, null);
  if ((Number(f.episodiosVistos) || 0) === antes) return; // não havia mais o que ver
  if (typeof renderCelular === 'function') renderCelular();
  if (avisoEpisodio) avisoEpisodio.remove(); // um aviso só, mesmo tocando várias vezes seguidas
  avisoEpisodio = null;
  if (f.status !== 'completo') avisoEpisodio = aviso(`${f.titulo}: ${vez} visto`, { tipo: 'ok', acao: { rotulo: 'Desfazer', fn: async () => { await mudarEpisodios(id, -1, null); if (typeof renderCelular === 'function') renderCelular(); } } });
}

// Trocar o contador por um campo para digitar o número (Enter grava, Esc desiste).
function digitarEpisodios(botao, id) {
  const f = porId(id);
  if (!ehSerie(f)) return;
  const sel = temporadaVista(f);
  const t = sel === null ? null : temporadasDe(f)[sel];
  const total = Number(t ? t.episodios : f.episodios) || 0;
  const campo = document.createElement('input');
  Object.assign(campo, { type: 'number', className: 'serie-digitar', min: '0', inputMode: 'numeric', value: String(Number(t ? t.vistos : f.episodiosVistos) || 0) });
  if (total) campo.max = String(total);
  campo.setAttribute('aria-label', 'Episódios vistos');
  botao.replaceWith(campo);
  campo.focus();
  campo.select();
  let feito = false;
  const gravar = async () => {
    if (feito) return;
    feito = true;
    const n = Math.max(0, Math.round(Number(campo.value) || 0));
    const antes = f.status;
    const novo = await api.definirSerie(id, n, hoje(), sel);
    if (novo) Object.assign(f, novo);
    if (f.status === 'completo' && antes !== 'completo') aviso(`“${f.titulo}” completo!`, { tipo: 'ok' });
    aposMudarDia(id);
  };
  campo.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); gravar(); }
    if (e.key === 'Escape') { e.preventDefault(); feito = true; renderPainel(); }
  });
  campo.addEventListener('blur', gravar);
}

// ---- Assistir ----

// O botão Assistir de um anime abre sempre o Stremio (abrirStremio, em app.js),
// como nos filmes: pelo código do IMDb da série (do TMDB) ou, sem ele, pela busca
// do Stremio. As plataformas oficiais ficam em "Onde assistir", no painel.
// Aqui, só a plataforma preferida (a última em que a pessoa clicou), usada na agenda.
function linkParaAssistir(f) {
  const ts = temporadasDe(f);
  const t = ts.length ? temporadaCorrente(f) : null;
  const todos = Array.isArray((t || f).ondeAssistir) ? (t || f).ondeAssistir : [];
  const links = todos.map((l, i) => ({ ...l, i })).filter(plataformaVisivel);
  if (!links.length) return null;
  const preferida = String(estado.config.nandrollPlataforma || '').toLowerCase();
  const l = links.find((x) => String(x.site).toLowerCase() === preferida) || links[0];
  return { ...l, temporada: t ? ts.indexOf(t) : null };
}

async function mudarStatusSerie(id, status) {
  const f = porId(id);
  if (!ehSerie(f)) return;
  const novo = await api.statusSerie(id, status, hoje());
  if (!novo) return;
  Object.assign(f, novo);
  aposMudarDia(id);
}

// Cliques e trocas no bloco de anime do painel (os botões usam data-serie, não
// data-p, para o painel do app.js não tratar).
function ligarAnimeNoPainel() {
  const painel = $('#painel');
  if (!painel || painel.dataset.anime) return;
  painel.dataset.anime = '1';
  painel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-serie]');
    const id = estado.painelId;
    if (!b || !id) return;
    const f = porId(id);
    if (!f) return;
    const t = b.dataset.t === undefined || b.dataset.t === '' ? null : Number(b.dataset.t);
    switch (b.dataset.serie) {
      case 'mais': mudarEpisodios(id, 1); break;
      case 'menos': mudarEpisodios(id, -1); break;
      case 'digitar': digitarEpisodios(b, id); break;
      case 'grade':
        if (gradesAbertas.has(id)) gradesAbertas.delete(id); else gradesAbertas.add(id);
        renderPainel();
        break;
      case 'ver-da-vez':
        temporadaEscolhida.set(id, t);
        renderPainel();
        break;
      case 'temp-menu': {
        const menu = $('.temp-menu', b.parentElement);
        const abrir = menu.hidden;
        fecharMenusTemporada();
        menu.hidden = !abrir;
        b.setAttribute('aria-expanded', String(abrir));
        if (abrir) ($('.temp-opcao.ativa', menu) || $('.temp-opcao', menu)).focus({ preventScroll: true });
        break;
      }
      case 'ep-mais': {
        const item = b.closest('.ep-item');
        const aberta = item.classList.toggle('aberta');
        b.textContent = aberta ? 'menos' : 'mais';
        b.setAttribute('aria-expanded', String(aberta));
        break;
      }
      case 'ep-pagina':
        paginasEpisodios.set(`${id}:${t}`, Number(b.dataset.pg) + Number(b.dataset.d));
        renderPainel();
        break;
      case 'aberturas':
        if (aberturasAbertas.has(id)) { aberturasAbertas.delete(id); aberturaTocando.delete(id); } else aberturasAbertas.add(id);
        renderPainel();
        break;
      case 'abertura':
        // Tocar uma abertura silencia o trailer do alto do painel (dois sons ao mesmo tempo atrapalham).
        if (aberturaTocando.get(id) === b.dataset.v) aberturaTocando.delete(id); else aberturaTocando.set(id, b.dataset.v);
        comandoTrailer($('#painel .painel-video'), 'pauseVideo');
        renderPainel();
        break;
      case 'ep': alternarEp(id, t, Number(b.dataset.n)); break;
      case 'stremio': abrirStremio(id); break;
      case 'temporada':
        temporadaEscolhida.set(id, t === null ? 'tudo' : t);
        renderPainel();
        break;
      case 'plataforma':
        api.abrirPlataforma(id, Number(b.dataset.i), t);
        // A última plataforma escolhida vira a preferida do botão Assistir.
        if (b.dataset.site && b.dataset.site !== estado.config.nandrollPlataforma) api.salvarConfig({ nandrollPlataforma: b.dataset.site }).then((c) => { estado.config = c; });
        break;
      case 'anilist': api.abrirAnilist(id, t); break;
      default:
    }
  });
  painel.addEventListener('change', (e) => {
    if (e.target.matches('[data-serie-status]') && estado.painelId) mudarStatusSerie(estado.painelId, e.target.value);
  });
}

// O menu de temporadas fecha ao clicar fora ou com Esc (o Esc não fecha o painel junto).
function fecharMenusTemporada() {
  for (const m of $$('.temp-menu:not([hidden])')) {
    m.hidden = true;
    $('.temp-botao', m.parentElement)?.setAttribute('aria-expanded', 'false');
  }
}
document.addEventListener('click', (e) => { if (!e.target.closest('[data-temp-seletor]')) fecharMenusTemporada(); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !$('.temp-menu:not([hidden])')) return;
  e.stopPropagation();
  e.preventDefault();
  const botao = $('.temp-menu:not([hidden])').parentElement.querySelector('.temp-botao');
  fecharMenusTemporada();
  if (botao) botao.focus({ preventScroll: true });
}, true);

// ---- Adicionar: buscar entre filmes (TMDB) ou animes (AniList) ----

let fonteBusca = 'filme';
try { fonteBusca = localStorage.getItem('fonteBusca') === 'anime' ? 'anime' : 'filme'; } catch { /* fica filme */ }

function fontesBuscaHTML() {
  if (!nandrollLigado() || !plataformaAtual().hub) return ''; // só o hub tem as duas fontes
  const atual = fonteAtual();
  const chip = (k, r) => `<button class="chip${atual === k ? ' ativo' : ''}" data-fonte="${k}" role="radio" aria-checked="${atual === k}">${r}</button>`;
  return `<div class="chips fontes-busca" role="radiogroup" aria-label="Onde buscar">${chip('filme', 'Filmes')}${chip('anime', 'Animes')}</div>`;
}

// Liga os chips "Filmes | Animes" do modal; `aoTrocar` refaz a busca.
function ligarFontesBusca(raiz, aoTrocar) {
  const grupo = $('.fontes-busca', raiz);
  if (!grupo) return;
  grupo.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fonte]');
    if (!b || b.dataset.fonte === fonteAtual()) return;
    fonteBusca = b.dataset.fonte;
    try { localStorage.setItem('fonteBusca', fonteBusca); } catch { /* só não lembra */ }
    for (const c of $$('[data-fonte]', grupo)) {
      c.classList.toggle('ativo', c === b);
      c.setAttribute('aria-checked', String(c === b));
    }
    aoTrocar();
  });
}

// ---- Filtros da lista ----

// Os filtros "Animes" e "Assistindo" (chips do PC e pílulas do celular).
function passaFiltroAnime(f, filtro) {
  if (!nandrollLigado()) return true;
  if (filtro === 'animes') return ehAnime(f);
  if (filtro === 'assistindo') return ehSerie(f) && f.status === 'assistindo';
  return true;
}

// ---- "+1" da agenda ----

// Antes dos outros cliques (fase de captura), para o botão não abrir o painel junto.
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ep-mais]');
  if (!b) return;
  e.preventDefault();
  e.stopPropagation();
  viMaisUm(b.dataset.epMais);
}, true);

// O que muda num cartão de série sem recriá-lo: o selo da capa (recriar o
// cartão faria as capas piscarem).
const estadoCartaoAnime = (f) => (ehSerie(f) ? `${nandrollLigado()}|${f.status}|${seloSerieTexto(f)}` : '');
function atualizarCartaoAnime(el, f) {
  if (!ehSerie(f)) return;
  for (const capa of $$('.capa', el)) {
    $('.selo-serie', capa)?.remove();
    capa.insertAdjacentHTML('beforeend', seloSerieHTML(f));
  }
}

// ---- Celular: fileiras de animes no início ----

// As séries que a pessoa está vendo: primeiro as com episódio novo, depois as mexidas por último.
function seriesAssistindo() {
  if (!nandrollLigado()) return [];
  return estado.filmes.filter((f) => ehSerie(f) && f.status === 'assistindo' && daPlataforma(f)) // Plataformas
    .sort((a, b) => (episodiosNovos(b) > 0) - (episodiosNovos(a) > 0) || String(b.anilistEm || '').localeCompare(String(a.anilistEm || '')));
}

// ---- Agenda: os próximos episódios ----

function diaDaAgenda(data) {
  const meiaNoite = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((meiaNoite(data) - meiaNoite(new Date())) / 86400000);
  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Amanhã';
  const texto = data.toLocaleDateString('pt-BR', dias < 7 ? { weekday: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function itemAgendaHTML(f, direita, detalhe) {
  const src = srcCapa(f);
  return `<li class="agenda-item">
    <button class="agenda-abrir" data-agenda="${f.id}">
      <span class="agenda-capa">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : ''}</span>
      <span class="agenda-texto"><b>${esc(f.titulo)}</b><small>${esc(detalhe)}</small></span>
    </button>
    ${direita}
  </li>`;
}

function agendaHTML() {
  const series = estado.filmes.filter((f) => ehSerie(f) && f.status !== 'largado');
  // Já no ar e ainda não vistos.
  const novos = series.filter((f) => episodiosNovos(f) > 0);
  // Os que vão sair, por dia.
  const futuros = series.filter((f) => f.proximoEpisodio && new Date(f.proximoEpisodio.em).getTime() > Date.now())
    .sort((a, b) => new Date(a.proximoEpisodio.em) - new Date(b.proximoEpisodio.em));
  if (!novos.length && !futuros.length) {
    return '<p class="mensagem">Nenhum episódio a caminho. Os animes em exibição da sua lista aparecem aqui com o dia e a hora do próximo episódio.</p>';
  }
  const hora = (f) => new Date(f.proximoEpisodio.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const plataforma = (f) => { const l = linkParaAssistir(f); return l ? ` · ${l.site}` : ''; };
  const grupos = new Map();
  for (const f of futuros) {
    const dia = diaDaAgenda(new Date(f.proximoEpisodio.em));
    if (!grupos.has(dia)) grupos.set(dia, []);
    grupos.get(dia).push(f);
  }
  return `
    ${novos.length ? `<h3 class="agenda-dia agenda-dia-novos">${icone('Sparkles')} Já saiu</h3>
    <ul class="agenda-lista">${novos.map((f) => itemAgendaHTML(f,
      `<button class="btn btn-laranja agenda-mais" data-ep-mais="${f.id}">${icone('Plus')} ${rotuloDaVez(f)}</button>`,
      `${episodiosNovos(f) === 1 ? '1 episódio novo' : `${episodiosNovos(f)} episódios novos`}${plataforma(f)}`)).join('')}</ul>` : ''}
    ${[...grupos].map(([dia, lista]) => `<h3 class="agenda-dia">${esc(dia)}</h3>
    <ul class="agenda-lista">${lista.map((f) => itemAgendaHTML(f, `<span class="agenda-hora">${hora(f)}</span>`, `Episódio ${f.proximoEpisodio.numero}${plataforma(f)}`)).join('')}</ul>`).join('')}`;
}

function abrirAgenda() {
  abrirModal(`${cabecalhoModal('Agenda de episódios')}<div class="modal-corpo agenda" id="agenda-corpo">${agendaHTML()}</div>`);
  const corpo = $('#agenda-corpo', modal);
  corpo.addEventListener('click', (e) => {
    const b = e.target.closest('[data-agenda]');
    if (b) { fecharModal(); abrirPainel(b.dataset.agenda); return; }
  });
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-cel="agenda"]')) return;
  if (typeof fecharFolha === 'function') fecharFolha();
  abrirAgenda();
});
// O "+1" dentro da agenda refaz a lista dela.
document.addEventListener('click', (e) => {
  if (e.target.closest('#agenda-corpo [data-ep-mais]')) setTimeout(() => { const c = document.getElementById('agenda-corpo'); if (c) c.innerHTML = agendaHTML(); }, 450);
}, true);

// ---- Trocar a capa de uma série ----

// As capas da série no TMDB e a de cada temporada (AniList), ou uma imagem do computador.
async function abrirTrocarCapaSerie(id) {
  const f = porId(id);
  abrirModal(`${cabecalhoModal(`Trocar capa — ${f.titulo}`)}
    <div class="modal-corpo">
      <div id="outras-capas"><p class="mensagem carregando">Carregando as capas</p></div>
    </div>
    <div class="modal-rodape"><button class="btn" id="btn-capa-arquivo">${icone('FolderOpen')} Usar imagem minha…</button></div>`);
  $('#btn-capa-arquivo', modal).onclick = () => { fecharModal(); usarArquivoCapa(id); };
  const r = await api.capasTmdb(id);
  const area = $('#outras-capas', modal);
  if (!area) return;
  const capas = r.ok ? r.dados.slice(0, 60) : [];
  if (!capas.length) { area.innerHTML = '<p class="mensagem">Não achei outras capas para esta série.</p>'; return; }
  area.innerHTML = `<div class="resultados outras-capas">${capas.map((c, i) => `
    <button class="resultado${c.poster === f.poster ? ' atual' : ''}" data-i="${i}" title="${esc(c.rotulo || (c.idioma ? `Idioma: ${c.idioma}` : 'Sem texto'))}">
      <div class="capa"><img src="${esc(c.miniatura)}" alt="" loading="lazy"></div>
      <span>${esc(c.rotulo ? 'temporada' : c.idioma ? c.idioma.toUpperCase() : 'sem texto')}</span>
    </button>`).join('')}</div>`;
  area.addEventListener('click', async (e) => {
    const b = e.target.closest('.resultado');
    if (!b || b.disabled) return;
    b.disabled = true;
    b.classList.add('carregando');
    const novo = await api.trocarCapa(id, { poster: capas[Number(b.dataset.i)].poster });
    if (!novo || novo.erro) { aviso((novo && novo.erro) || 'Não deu para trocar a capa.', { tipo: 'erro' }); b.disabled = false; b.classList.remove('carregando'); return; }
    Object.assign(f, novo);
    fecharModal();
    render();
    if (estado.painelId === id) renderPainel();
    if (filmeNoDestaque() === id) mostrarDestaque({ rapido: true });
    aviso('Capa trocada.', { tipo: 'ok' });
  });
}
