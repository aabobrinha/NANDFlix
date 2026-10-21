// Leitura e escrita de planilhas .xlsx com SheetJS.
const XLSX = require('xlsx');
const { novoFilme, normalizar } = require('./filmes');

// As colunas são localizadas pelo texto do cabeçalho, assim a importação aceita
// tanto a planilha original quanto o arquivo gerado por "Exportar para Excel".
const CABECALHOS = {
  visto: ['visto', 'visto (✔)'],
  titulo: ['filme', 'titulo'],
  ano: ['ano'],
  diretor: ['diretor'],
  favorito: ['★', 'favorito'],
  notas: ['notas'],
  linkLetterboxd: ['link letterboxd (opcional)', 'link letterboxd'],
  buscaCapa: ['busca da capa (opcional)', 'busca da capa'],
  omdb: ['omdb'],
  imdbID: ['imdb'],
  poster: ['capa (url)'],
};

function texto(valor) {
  if (valor === undefined || valor === null) return '';
  return String(valor).trim();
}

function marcado(valor, simbolos) {
  const t = texto(valor);
  return simbolos.includes(t) || t.toLowerCase() === 'true';
}

function acharCabecalho(linhas) {
  for (let i = 0; i < Math.min(linhas.length, 30); i++) {
    const nomes = (linhas[i] || []).map((c) => normalizar(c));
    if (nomes.includes('filme')) {
      const colunas = {};
      for (const [campo, opcoes] of Object.entries(CABECALHOS)) {
        const idx = nomes.findIndex((n) => opcoes.map(normalizar).includes(n));
        if (idx >= 0) colunas[campo] = idx;
      }
      return { linha: i, colunas };
    }
  }
  return null;
}

function lerPlanilha(buffer) {
  // cellFormula: false → só os valores calculados guardados no arquivo.
  const wb = XLSX.read(buffer, { type: 'buffer', cellFormula: false, cellHTML: false });
  const nomeAba = wb.SheetNames.find((n) => normalizar(n) === 'filmes') || wb.SheetNames[0];
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], { header: 1, raw: true, defval: '' });
  const cab = acharCabecalho(linhas);
  if (!cab || cab.colunas.titulo === undefined) {
    throw new Error('Não encontrei o cabeçalho "Filme" na aba Filmes.');
  }
  const c = cab.colunas;
  const pegar = (linha, campo) => (c[campo] === undefined ? '' : linha[c[campo]]);

  const filmes = [];
  const agora = new Date().toISOString();
  for (let i = cab.linha + 1; i < linhas.length; i++) {
    const linha = linhas[i] || [];
    const titulo = texto(pegar(linha, 'titulo'));
    if (!titulo) continue;

    let imdbID = texto(pegar(linha, 'imdbID'));
    let poster = texto(pegar(linha, 'poster'));
    // Coluna M: "urlDaCapa|códigoIMDb", em qualquer ordem.
    const omdb = texto(pegar(linha, 'omdb'));
    if (omdb) {
      const tt = omdb.match(/tt\d+/);
      const url = omdb.match(/https?:\/\/[^|]+/);
      if (tt) imdbID = tt[0];
      if (url && !/N\/A/.test(url[0])) poster = url[0];
    }

    filmes.push(novoFilme({
      ordem: filmes.length + 1,
      titulo,
      ano: texto(pegar(linha, 'ano')),
      diretor: texto(pegar(linha, 'diretor')),
      visto: marcado(pegar(linha, 'visto'), ['✔', '✓', '✅', 'x', 'X']),
      favorito: marcado(pegar(linha, 'favorito'), ['★', '⭐', '☆']),
      notas: texto(pegar(linha, 'notas')),
      linkLetterboxd: texto(pegar(linha, 'linkLetterboxd')),
      buscaCapa: texto(pegar(linha, 'buscaCapa')),
      imdbID,
      poster,
      adicionadoEm: agora,
    }));
  }
  return filmes;
}

function gerarPlanilha(filmes) {
  const ordenados = filmes.slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const linhas = ordenados.map((f, i) => ({
    'Nº': i + 1,
    'Visto (✔)': f.visto ? '✔' : '',
    Filme: f.titulo,
    Ano: /^\d{4}$/.test(f.ano) ? Number(f.ano) : f.ano,
    Diretor: f.diretor,
    '★': f.favorito ? '★' : '',
    Notas: f.notas,
    'Link Letterboxd': f.linkLetterboxd,
    IMDb: f.imdbID,
    'Capa (URL)': f.poster,
  }));
  const ws = XLSX.utils.json_to_sheet(linhas);
  ws['!cols'] = [6, 10, 40, 11, 30, 5, 40, 40, 12, 50].map((wch) => ({ wch }));
  ws['!autofilter'] = { ref: ws['!ref'] };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Filmes');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { lerPlanilha, gerarPlanilha };
