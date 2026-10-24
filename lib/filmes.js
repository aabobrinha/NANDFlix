// Regras sobre a lista de filmes, usadas pelo app e pelo script de importação.
const crypto = require('crypto');

function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`´]/g, "'")
    .toLowerCase()
    .trim();
}

function novoFilme(dados = {}) {
  return {
    id: crypto.randomUUID(),
    ordem: 0,
    titulo: '',
    ano: '',
    diretor: '',
    visto: false,
    favorito: false,
    notas: '',
    linkLetterboxd: '',
    buscaCapa: '',
    imdbID: '',
    tmdbId: '', // id do filme no TMDB (de onde vêm capa, logo, trailer e informações)
    poster: '',
    capaLocal: '',
    capaNaoEncontrada: false,
    capaPersonalizada: false, // imagem escolhida pelo usuário: a busca automática não mexe
    trailerId: '', // código do vídeo no YouTube; 'nenhum' se a busca não achou
    info: null, // notas, duração, gênero e sinopse do OMDb (guardados para não gastar consultas)
    duracao: 0, // minutos, pelo Wikidata (0 se não achou)
    duracaoDe: '', // imdbID para o qual a duração foi buscada
    minhaNota: 0, // nota da pessoa, de 0,5 a 5 estrelas (0 = sem nota)
    vistoEm: [], // dias em que foi visto ('AAAA-MM-DD'), um por vez que foi visto; o dia vira às 5h
    adicionadoEm: new Date().toISOString(),
    ...dados,
  };
}

// Dois filmes são o mesmo se tiverem o mesmo id do TMDB, o mesmo imdbID ou o mesmo título e ano.
function mesmoFilme(a, b) {
  if (a.tmdbId && b.tmdbId && String(a.tmdbId) === String(b.tmdbId)) return true;
  if (a.imdbID && b.imdbID && a.imdbID === b.imdbID) return true;
  return normalizar(a.titulo) === normalizar(b.titulo) && String(a.ano).trim() === String(b.ano).trim();
}

function acharRepetido(lista, filme, ignorarId) {
  return lista.find((f) => f.id !== ignorarId && mesmoFilme(f, filme)) || null;
}

// Junta os filmes importados aos existentes; os dados do app têm prioridade.
function juntar(existentes, importados) {
  const resultado = existentes.slice();
  let proximaOrdem = existentes.reduce((m, f) => Math.max(m, f.ordem || 0), 0) + 1;
  let adicionados = 0;
  let repetidos = 0;
  for (const filme of importados) {
    if (acharRepetido(resultado, filme)) { repetidos++; continue; }
    resultado.push({ ...filme, ordem: proximaOrdem++ });
    adicionados++;
  }
  return { filmes: resultado, adicionados, repetidos };
}

function resumo(filmes) {
  return {
    total: filmes.length,
    vistos: filmes.filter((f) => f.visto).length,
    favoritos: filmes.filter((f) => f.favorito).length,
    comCapa: filmes.filter((f) => f.poster || f.capaLocal).length,
  };
}

module.exports = { normalizar, novoFilme, mesmoFilme, acharRepetido, juntar, resumo };
