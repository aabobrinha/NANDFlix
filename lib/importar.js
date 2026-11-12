// Importar filmes vistos, notas e watchlist de outros apps (PC e celular).
//
// Cada fonte vira uma lista de itens no mesmo formato:
//   { titulo, ano, imdbID, tmdbId, datas: ['AAAA-MM-DD', …], visto, nota (½ a 5), watchlist }
// e `aplicar` junta os itens na lista do NANDFlix.
//
// Fontes:
// - Letterboxd: o export de dados (diary.csv, watched.csv, ratings.csv, watchlist.csv).
// - IMDb: os CSVs de "Suas avaliações" e da Watchlist (ou de qualquer lista).
// - Stremio: a biblioteca da conta (stremio.js).
// - Outros (Rotten Tomatoes e afins): qualquer CSV com o título e o ano; serve o
//   formato de importação do Letterboxd, que os exportadores do Rotten Tomatoes geram.
const letterboxd = require('./letterboxd');
const { normalizar, novoFilme, mesmoFilme } = require('./filmes');

const { lerCsv } = letterboxd;
const ehData = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const anoDe = (v) => (String(v || '').match(/\b(18|19|20)\d{2}\b/) || [''])[0];
const meiaEstrela = (n) => Math.min(5, Math.max(0.5, Math.round(n * 2) / 2));

// ---------- IMDb ----------

// O CSV de avaliações tem "Your Rating"; o da watchlist (e das listas) tem "Position".
// Só filmes: séries e episódios ficam de fora.
const TIPOS_FILME_IMDB = new Set(['movie', 'tvmovie', 'tv movie', 'video', 'short', 'tvshort', 'tv short', 'tvspecial', 'tv special', '']);

function lerImdb(nome, linhas) {
  const ehWatchlist = /watchlist/i.test(nome) || ('Position' in (linhas[0] || {}) && !linhas.some((r) => Number(r['Your Rating'])));
  const itens = [];
  for (const r of linhas) {
    const tipo = String(r['Title Type'] || '').toLowerCase();
    if (!TIPOS_FILME_IMDB.has(tipo)) continue;
    const imdbID = /^tt\d+$/.test(r.Const) ? r.Const : '';
    const titulo = r.Title || r['Original Title'] || '';
    if (!titulo && !imdbID) continue;
    const nota = Number(r['Your Rating']);
    // IMDb dá de 1 a 10; aqui é de ½ a 5 estrelas.
    itens.push({ titulo, ano: anoDe(r.Year || r['Release Date']), imdbID, tmdbId: '', datas: [], visto: Boolean(nota), nota: nota ? meiaEstrela(nota / 2) : 0, watchlist: ehWatchlist && !nota });
  }
  return itens;
}

// ---------- CSV de qualquer lugar ----------

// Os nomes de coluna mais comuns (inclusive os do formato de importação do Letterboxd).
const COLUNAS = {
  titulo: ['title', 'name', 'titulo', 'título', 'film', 'movie', 'filme'],
  ano: ['year', 'ano', 'release year', 'release date', 'released'],
  imdb: ['imdbid', 'imdb id', 'imdb', 'const', 'imdb_id', 'tconst'],
  tmdb: ['tmdbid', 'tmdb id', 'tmdb', 'tmdb_id'],
  nota: ['rating', 'nota', 'your rating', 'my rating', 'score', 'stars', 'estrelas', 'rating10'],
  data: ['watcheddate', 'watched date', 'watched', 'date watched', 'data', 'visto em', 'date'],
  watchlist: ['watchlist', 'want to see', 'wanttosee', 'want_to_see', 'quero ver'],
};

function coluna(cabecalhos, tipo) {
  const norm = (h) => normalizar(h).replace(/[_-]+/g, ' ').trim();
  const lista = cabecalhos.map((h) => [h, norm(h)]);
  for (const nome of COLUNAS[tipo]) { const achou = lista.find(([, n]) => n === nome); if (achou) return achou[0]; }
  return null;
}

// Nota em qualquer escala → ½ a 5 estrelas ("4/5", "8", "80%", "3.5").
function notaDe(valor, escala) {
  const s = String(valor || '').trim();
  if (!s) return 0;
  const fracao = s.match(/^([\d.,]+)\s*\/\s*([\d.,]+)$/);
  if (fracao) return meiaEstrela((parseFloat(fracao[1].replace(',', '.')) / parseFloat(fracao[2].replace(',', '.'))) * 5);
  const n = parseFloat(s.replace(',', '.').replace('%', ''));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return meiaEstrela((n / escala) * 5);
}

function lerGenerico(nome, linhas) {
  if (!linhas.length) return [];
  const cab = Object.keys(linhas[0]);
  const c = Object.fromEntries(Object.keys(COLUNAS).map((t) => [t, coluna(cab, t)]));
  if (!c.titulo && !c.imdb) return [];
  // A escala da nota: a maior nota do arquivo diz se é de 5, 10 ou 100.
  const notas = c.nota ? linhas.map((r) => parseFloat(String(r[c.nota]).replace(',', '.').replace('%', ''))).filter(Number.isFinite) : [];
  const maior = notas.length ? Math.max(...notas) : 5;
  const escala = c.nota && /rating10/i.test(c.nota) ? 10 : maior > 10 ? 100 : maior > 5 ? 10 : 5;
  const arquivoDeWatchlist = /watchlist|want|quero/i.test(nome);
  const sim = (v) => /^(1|true|yes|sim|x|y)$/i.test(String(v || '').trim());
  return linhas.map((r) => {
    const nota = c.nota ? notaDe(r[c.nota], escala) : 0;
    const data = c.data && ehData(String(r[c.data]).slice(0, 10)) ? String(r[c.data]).slice(0, 10) : '';
    const watchlist = arquivoDeWatchlist || (c.watchlist && sim(r[c.watchlist]));
    const imdbID = c.imdb && /^tt\d+$/.test(r[c.imdb]) ? r[c.imdb] : '';
    return {
      titulo: c.titulo ? r[c.titulo] : '',
      ano: c.ano ? anoDe(r[c.ano]) : '',
      imdbID,
      tmdbId: c.tmdb && /^\d+$/.test(r[c.tmdb]) ? r[c.tmdb] : '',
      // Uma data só se a coluna é de "quando viu" (não a data em que a linha foi criada).
      datas: data && c.data && !/^date$/i.test(c.data) ? [data] : [],
      visto: !watchlist,
      nota: watchlist ? 0 : nota,
      watchlist: Boolean(watchlist),
    };
  }).filter((x) => x.titulo || x.imdbID);
}

// ---------- Arquivos escolhidos (.csv soltos ou um .zip) ----------

// [{ nome, bytes: Uint8Array }] → { 'nome.csv': texto }. Do .zip, só os .csv da raiz:
// o export do Letterboxd tem pastas ("deleted", "orphaned") com outros diary.csv, de
// entradas apagadas, que não contam.
function textosDosArquivos(arquivos) {
  const { unzipSync, strFromU8 } = require('fflate');
  const textos = {};
  for (const { nome, bytes } of arquivos) {
    const ehZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"
    if (ehZip) {
      const z = unzipSync(bytes, { filter: (f) => /\.csv$/i.test(f.name) && !f.name.includes('/') });
      for (const [n, dados] of Object.entries(z)) textos[n] = strFromU8(dados);
    } else if (/\.csv$/i.test(nome) || !/\.\w+$/.test(nome)) {
      textos[String(nome).split(/[\\/]/).pop()] = strFromU8(bytes);
    }
  }
  return textos;
}

// ---------- Descobrir de onde veio ----------

// textos: { 'nome.csv': 'conteúdo', … } → { fonte: 'letterboxd' | 'imdb' | 'csv', itens }
function lerArquivos(textos) {
  const nomes = Object.keys(textos);
  const base = (n) => n.split(/[\\/]/).pop().toLowerCase();
  // O export do Letterboxd: os arquivos com esses nomes e a coluna "Letterboxd URI".
  const doLetterboxd = nomes.filter((n) => letterboxd.ARQUIVOS.includes(base(n)) && /Letterboxd URI/.test(String(textos[n]).slice(0, 400)));
  if (doLetterboxd.length) {
    const t = {};
    for (const n of doLetterboxd) t[base(n)] = textos[n];
    return { fonte: 'letterboxd', itens: letterboxd.lerTextos(t).map((x) => ({ imdbID: '', tmdbId: '', ...x })) };
  }
  let fonte = 'csv';
  const itens = [];
  for (const n of nomes) {
    const linhas = lerCsv(String(textos[n]).replace(/^﻿/, ''));
    if (!linhas.length) continue;
    if ('Const' in linhas[0]) { fonte = 'imdb'; itens.push(...lerImdb(base(n), linhas)); } else itens.push(...lerGenerico(base(n), linhas));
  }
  if (!itens.length) throw new Error('Não achei filmes nesses arquivos. Escolha os .csv (ou o .zip) exportados do app, com pelo menos o título e o ano.');
  return { fonte, itens: juntarItens(itens) };
}

// O mesmo filme em dois arquivos (avaliações e watchlist, por exemplo) vira um item só.
function juntarItens(itens) {
  const porChave = new Map();
  for (const x of itens) {
    const chave = x.imdbID || `${normalizar(x.titulo)}|${x.ano}`;
    const y = porChave.get(chave);
    if (!y) { porChave.set(chave, { ...x, datas: [...x.datas] }); continue; }
    y.visto = y.visto || x.visto;
    y.nota = y.nota || x.nota;
    y.watchlist = (y.watchlist || x.watchlist) && !y.visto;
    for (const d of x.datas) if (!y.datas.includes(d)) y.datas.push(d);
    y.imdbID = y.imdbID || x.imdbID;
    y.tmdbId = y.tmdbId || x.tmdbId;
  }
  for (const y of porChave.values()) y.datas.sort();
  return [...porChave.values()];
}

// ---------- Juntar na lista ----------

const acharNaLista = (lista, x) => lista.find((f) => (x.imdbID && f.imdbID === x.imdbID) || (x.tmdbId && String(f.tmdbId) === String(x.tmdbId)))
  || lista.find((f) => mesmoFilme(f, { titulo: x.titulo, ano: x.ano }));

// Em duas fases: primeiro procura no TMDB os filmes que não estão na lista (para não
// duplicar por diferença de título), o que pode levar minutos; depois aplica tudo de
// uma vez na lista *daquele momento* (`filmes()`), que pode ter mudado nesse meio-tempo.
// Os vistos são marcados, com as datas de antes do primeiro dia já registrado aqui
// (para não repetir o calendário); as notas preenchem "Sua nota" onde está vazia; a
// watchlist entra como filmes novos. Muda a lista e devolve o resumo.
async function aplicar(itens, filmes, { idPorTitulo = null, idPorImdb = null } = {}) {
  const lista = () => (typeof filmes === 'function' ? filmes() : filmes);
  for (const x of itens) {
    if (acharNaLista(lista(), x) || x.tmdbId) continue;
    if (!x.visto && !x.watchlist) continue;
    if (x.imdbID && idPorImdb) x.tmdbId = (await idPorImdb(x.imdbID).catch(() => null)) || '';
    if (!x.tmdbId && x.titulo && idPorTitulo) x.tmdbId = (await idPorTitulo(x.titulo, x.ano).catch(() => null)) || '';
  }

  const atual = lista();
  const limite = atual.flatMap((f) => f.vistoEm || []).sort()[0] || null;
  let ordem = atual.reduce((m, f) => Math.max(m, f.ordem || 0), 0);
  const res = { novosWatchlist: 0, novosVistos: 0, marcadosVistos: 0, datas: 0, notas: 0, primeiroDia: null, total: itens.length };
  for (const x of itens) {
    let f = acharNaLista(atual, x);
    const novo = !f;
    if (!f) {
      if (!x.visto && !x.watchlist) continue;
      f = novoFilme({ ordem: ++ordem, titulo: x.titulo || x.imdbID, ano: x.ano, imdbID: x.imdbID || '', tmdbId: x.tmdbId || '' });
      atual.push(f);
      if (x.visto) res.novosVistos++; else res.novosWatchlist++;
    } else {
      if (!f.imdbID && x.imdbID) f.imdbID = x.imdbID;
    }
    if (x.visto) {
      if (!f.visto && !novo) res.marcadosVistos++;
      f.visto = true;
      const dias = [...(f.vistoEm || [])];
      for (const d of x.datas || []) {
        if (limite && d >= limite) continue;
        if (!dias.includes(d)) { dias.push(d); res.datas++; }
      }
      f.vistoEm = dias.sort();
    }
    if (x.nota && !f.minhaNota) { f.minhaNota = x.nota; res.notas++; }
  }
  res.primeiroDia = atual.flatMap((f) => f.vistoEm || []).sort()[0] || null;
  return res;
}

module.exports = { lerArquivos, textosDosArquivos, lerImdb, lerGenerico, juntarItens, aplicar, notaDe };
