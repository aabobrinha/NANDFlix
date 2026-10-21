// Consultas ao OMDb. A busca por título exato (&t=) está quebrada no OMDb e
// devolve "Incorrect IMDb ID", então só usamos &s= (busca geral) e &i= (código).
const BASE = 'https://www.omdbapi.com/';

class ErroOmdb extends Error {
  constructor(tipo, mensagem) {
    super(mensagem);
    this.tipo = tipo; // 'limite' | 'chave' | 'rede'
  }
}

async function consultar(chave, params) {
  if (!chave) throw new ErroOmdb('chave', 'Configure a chave do OMDb em Configurações.');
  const url = BASE + '?' + new URLSearchParams({ apikey: chave, ...params });
  let resposta;
  try {
    resposta = await fetch(url, { signal: AbortSignal.timeout(15000) });
  } catch {
    throw new ErroOmdb('rede', 'Sem conexão com o OMDb.');
  }
  let json;
  try {
    json = await resposta.json();
  } catch {
    if (resposta.status === 401) throw new ErroOmdb('chave', 'Chave do OMDb inválida.');
    throw new ErroOmdb('rede', `O OMDb respondeu com erro ${resposta.status}.`);
  }
  if (json.Response === 'False' && json.Error) {
    const erro = json.Error.toLowerCase();
    if (erro.includes('limit')) {
      throw new ErroOmdb('limite', 'O limite diário do OMDb (1.000 consultas) acabou. Tente de novo amanhã.');
    }
    if (erro.includes('invalid api key') || erro.includes('no api key')) {
      throw new ErroOmdb('chave', 'A chave do OMDb está errada. Confira em Configurações.');
    }
  }
  return json;
}

const posterValido = (p) => (p && p !== 'N/A' ? p : '');
const anoUnico = (ano) => /^\d{4}$/.test(String(ano).trim());

function pegarResultado(item) {
  return item ? { imdbID: item.imdbID || '', poster: posterValido(item.Poster), titulo: item.Title, ano: item.Year } : null;
}

async function pesquisar(chave, termo, ano) {
  const params = { type: 'movie', s: termo };
  if (ano) params.y = ano;
  const json = await consultar(chave, params);
  return json.Response === 'True' ? (json.Search || []).map(pegarResultado) : [];
}

const valor = (v) => (v && v !== 'N/A' ? v : '');

async function detalhes(chave, imdbID) {
  const json = await consultar(chave, { i: imdbID });
  if (json.Response !== 'True') return null;
  const nota = (fonte) => valor(((json.Ratings || []).find((r) => r.Source === fonte) || {}).Value);
  return {
    imdbID: json.imdbID,
    titulo: json.Title,
    ano: json.Year,
    diretor: valor(json.Director),
    poster: posterValido(json.Poster),
    info: {
      imdb: valor(json.imdbRating),
      metascore: valor(json.Metascore),
      rotten: nota('Rotten Tomatoes'),
      duracao: valor(json.Runtime),
      genero: valor(json.Genre),
      classificacao: valor(json.Rated),
      sinopse: valor(json.Plot),
      elenco: valor(json.Actors),
      pais: valor(json.Country),
      atualizadoEm: new Date().toISOString(),
    },
  };
}

const comparavel = (t) => String(t || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

// O primeiro resultado do OMDb muitas vezes é um making-of ou episódio de
// podcast com o mesmo nome. Prefere o título idêntico; senão, um resultado
// com capa que contenha o título buscado.
function melhorResultado(resultados, termo) {
  const alvo = comparavel(termo);
  const exatos = resultados.filter((r) => comparavel(r.titulo) === alvo);
  return {
    exatoComCapa: exatos.find((r) => r.poster) || null,
    exato: exatos[0] || null,
    contem: resultados.find((r) => r.poster && comparavel(r.titulo).includes(alvo)) || null,
  };
}

// Encontra imdbID e capa de um filme. Devolve null se nada for encontrado.
async function acharCapa(chave, filme) {
  const busca = (filme.buscaCapa || '').trim();
  if (/^tt\d+$/.test(busca)) {
    const d = await detalhes(chave, busca);
    return d ? { imdbID: d.imdbID, poster: d.poster } : null;
  }
  // O OMDb não encontra títulos com apóstrofo tipográfico (I’m → I'm).
  const termo = (busca || filme.titulo).replace(/[’‘]/g, "'");
  // O OMDb costuma usar o ano de lançamento nos EUA, por isso ANO±1.
  const tentativas = [];
  if (anoUnico(filme.ano)) {
    const ano = Number(filme.ano);
    tentativas.push(ano, ano + 1, ano - 1);
  }
  tentativas.push(null);
  let exatoSemCapa = null;
  let aproximado = null;
  for (const ano of tentativas) {
    const r = melhorResultado(await pesquisar(chave, termo, ano), termo);
    if (r.exatoComCapa) return { imdbID: r.exatoComCapa.imdbID, poster: r.exatoComCapa.poster };
    // Título idêntico sem capa só vale se veio de uma busca com o ano certo:
    // sem o ano, pode ser outro filme com o mesmo nome.
    if (r.exato && ano !== null && !exatoSemCapa) exatoSemCapa = r.exato;
    if (r.contem && !aproximado) aproximado = r.contem;
  }
  const escolhido = exatoSemCapa || aproximado;
  return escolhido ? { imdbID: escolhido.imdbID, poster: escolhido.poster } : null;
}

module.exports = { ErroOmdb, consultar, pesquisar, detalhes, acharCapa };
