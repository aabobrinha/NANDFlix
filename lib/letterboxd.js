// Lê o export de dados do Letterboxd (Settings → Import & Export → Export your
// data): diary.csv (cada vez que viu, com data e nota), watched.csv (vistos),
// ratings.csv (notas) e watchlist.csv. No PC vem a pasta descompactada; no
// celular, os textos tirados do .zip.
const fs = require('fs');
const path = require('path');
const { normalizar, novoFilme, mesmoFilme } = require('./filmes');

const ARQUIVOS = ['diary.csv', 'watched.csv', 'ratings.csv', 'watchlist.csv'];

// CSV com aspas, vírgulas e quebras de linha dentro dos campos (as resenhas têm).
function lerCsv(texto) {
  const linhas = [];
  let linha = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some((x) => x !== '')) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x !== '')) linhas.push(linha);
  const [cabecalho = [], ...resto] = linhas;
  return resto.map((l) => Object.fromEntries(cabecalho.map((h, i) => [h.trim(), (l[i] || '').trim()])));
}

// A pasta descompactada (PC).
function ler(pasta) {
  const textos = {};
  for (const nome of ARQUIVOS) {
    const arquivo = path.join(pasta, nome);
    if (fs.existsSync(arquivo)) textos[nome] = fs.readFileSync(arquivo, 'utf8');
  }
  return lerTextos(textos);
}

// Um item por filme: { titulo, ano, datas: ['AAAA-MM-DD', …], visto, nota, watchlist }.
// textos: { 'diary.csv': '…', 'watchlist.csv': '…' } (os que houver).
function lerTextos(textos) {
  const csv = (nome) => (textos[nome] ? lerCsv(String(textos[nome]).replace(/^﻿/, '')) : []);
  const diario = csv('diary.csv');
  const vistos = csv('watched.csv');
  const notas = csv('ratings.csv');
  const watchlist = csv('watchlist.csv');
  if (!diario.length && !vistos.length && !notas.length && !watchlist.length) {
    throw new Error('Isso não parece um export do Letterboxd (faltam diary.csv, watched.csv e watchlist.csv).');
  }
  const filmes = new Map();
  const item = (r) => {
    const chave = `${normalizar(r.Name)}|${r.Year}`;
    if (!filmes.has(chave)) filmes.set(chave, { titulo: r.Name, ano: r.Year, datas: [], visto: false, nota: 0, watchlist: false });
    return filmes.get(chave);
  };
  for (const r of diario) {
    const f = item(r);
    f.visto = true;
    if (/^\d{4}-\d{2}-\d{2}$/.test(r['Watched Date'])) f.datas.push(r['Watched Date']);
    if (Number(r.Rating)) f.nota = Number(r.Rating);
  }
  for (const r of vistos) item(r).visto = true;
  for (const r of notas) if (Number(r.Rating)) item(r).nota = Number(r.Rating);
  for (const r of watchlist) item(r).watchlist = true;
  for (const f of filmes.values()) f.datas.sort();
  return [...filmes.values()];
}

// Aplica o export na lista: os vistos são marcados, com as datas do diário de
// antes do primeiro dia já registrado aqui (para não repetir o calendário); as
// notas preenchem "Sua nota" onde está vazia; a watchlist entra como filmes
// novos. Filmes que não estão na lista são procurados no TMDB antes, para não
// duplicar por diferença de título. Muda a lista recebida e devolve o resumo.
async function aplicar(itens, filmes, { idPorTitulo = null } = {}) {
  const limite = filmes.flatMap((f) => f.vistoEm || []).sort()[0] || null;
  let ordem = filmes.reduce((m, f) => Math.max(m, f.ordem || 0), 0);
  const res = { novosWatchlist: 0, novosVistos: 0, marcadosVistos: 0, datas: 0, notas: 0, primeiroDia: null };
  for (const item of itens) {
    let f = filmes.find((x) => mesmoFilme(x, { titulo: item.titulo, ano: item.ano }));
    let tmdbId = null;
    if (!f && idPorTitulo) {
      tmdbId = await idPorTitulo(item.titulo, item.ano).catch(() => null);
      if (tmdbId) f = filmes.find((x) => String(x.tmdbId) === String(tmdbId));
    }
    const novo = !f;
    if (!f) {
      if (!item.visto && !item.watchlist) continue;
      f = novoFilme({ ordem: ++ordem, titulo: item.titulo, ano: item.ano, tmdbId: tmdbId || '' });
      filmes.push(f);
      if (item.visto) res.novosVistos++; else res.novosWatchlist++;
    }
    if (item.visto) {
      if (!f.visto && !novo) res.marcadosVistos++;
      f.visto = true;
      const dias = [...(f.vistoEm || [])];
      for (const d of item.datas) {
        if (limite && d >= limite) continue;
        if (!dias.includes(d)) { dias.push(d); res.datas++; }
      }
      f.vistoEm = dias.sort();
    }
    if (item.nota && !f.minhaNota) { f.minhaNota = item.nota; res.notas++; }
  }
  res.primeiroDia = filmes.flatMap((f) => f.vistoEm || []).sort()[0] || null;
  return res;
}

module.exports = { ARQUIVOS, ler, lerTextos, lerCsv, aplicar };
