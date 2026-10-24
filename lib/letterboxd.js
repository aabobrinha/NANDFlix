// Lê a pasta do export de dados do Letterboxd (Settings → Import & Export →
// Export your data, descompactado): diary.csv (cada vez que viu, com data e
// nota), watched.csv (vistos), ratings.csv (notas) e watchlist.csv.
const fs = require('fs');
const path = require('path');
const { normalizar } = require('./filmes');

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

function lerArquivo(pasta, nome) {
  const arquivo = path.join(pasta, nome);
  return fs.existsSync(arquivo) ? lerCsv(fs.readFileSync(arquivo, 'utf8').replace(/^﻿/, '')) : [];
}

// Um item por filme: { titulo, ano, datas: ['AAAA-MM-DD', …], visto, nota, watchlist }.
function ler(pasta) {
  const diario = lerArquivo(pasta, 'diary.csv');
  const vistos = lerArquivo(pasta, 'watched.csv');
  const notas = lerArquivo(pasta, 'ratings.csv');
  const watchlist = lerArquivo(pasta, 'watchlist.csv');
  if (!diario.length && !vistos.length && !notas.length && !watchlist.length) {
    throw new Error('Essa pasta não parece um export do Letterboxd (faltam diary.csv, watched.csv e watchlist.csv).');
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

module.exports = { ler, lerCsv };
