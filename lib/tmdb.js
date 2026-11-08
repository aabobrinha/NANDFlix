// Consultas ao TMDB (themoviedb.org): capas, logos, trailers, sinopse, gêneros,
// elenco, direção, duração, países e classificação indicativa. Sem limite diário
// (só um limite por segundo, folgado). Aceita a chave da API (v3, 32 caracteres)
// ou o token de leitura (v4, bem mais longo).
const BASE = 'https://api.themoviedb.org/3';
const IMAGEM = 'https://image.tmdb.org/t/p/';

class ErroTmdb extends Error {
  constructor(tipo, mensagem) {
    super(mensagem);
    this.tipo = tipo; // 'chave' | 'rede'
  }
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function consultar(chave, caminho, params = {}, tentativa = 0) {
  chave = String(chave || '').trim();
  if (!chave) throw new ErroTmdb('chave', 'Coloque a chave do TMDB em Configurações.');
  const token = chave.length > 40;
  const qs = new URLSearchParams(token ? params : { api_key: chave, ...params });
  let resposta;
  try {
    resposta = await fetch(`${BASE}${caminho}?${qs}`, {
      headers: token ? { Authorization: `Bearer ${chave}`, Accept: 'application/json' } : { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ErroTmdb('rede', 'Sem conexão com o TMDB.');
  }
  if (resposta.status === 401) throw new ErroTmdb('chave', 'A chave do TMDB está errada. Confira em Configurações.');
  if (resposta.status === 404) return null;
  // Muitas consultas no mesmo segundo: espera um pouco e tenta de novo.
  if (resposta.status === 429 && tentativa < 4) {
    await espera(1000 * (tentativa + 1));
    return consultar(chave, caminho, params, tentativa + 1);
  }
  if (!resposta.ok) throw new ErroTmdb('rede', `O TMDB respondeu com erro ${resposta.status}.`);
  return resposta.json();
}

const imagem = (caminho, tamanho) => (caminho ? `${IMAGEM}${tamanho}${caminho}` : '');
const anoDe = (data) => (data ? String(data).slice(0, 4) : '');

// Resultado de busca, no mesmo formato da busca antiga do OMDb (mais o tmdbId).
function resultado(m) {
  return { tmdbId: m.id, imdbID: '', titulo: m.title || m.original_title, ano: anoDe(m.release_date), poster: imagem(m.poster_path, 'w342') };
}

async function pesquisar(chave, termo, ano) {
  const params = { query: termo, include_adult: 'false', language: 'en-US' };
  if (ano) params.primary_release_year = ano;
  const json = await consultar(chave, '/search/movie', params);
  return json ? json.results.map(resultado) : [];
}

// Código do IMDb (tt…) → id do TMDB, ou null.
async function idPorImdb(chave, imdbID) {
  const json = await consultar(chave, `/find/${imdbID}`, { external_source: 'imdb_id' });
  const m = json && json.movie_results && json.movie_results[0];
  return m ? m.id : null;
}

const comparavel = (t) => String(t || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/&/g, 'and').replace(/[’‘]/g, "'").replace(/[^a-z0-9]+/g, ' ').trim();

// Acha o filme pelo título e ano (ano ±1, como no OMDb), preferindo o título
// idêntico (o traduzido ou o original). Devolve o id do TMDB ou null.
async function idPorTitulo(chave, titulo, ano) {
  const alvo = comparavel(titulo);
  const tentativas = /^\d{4}$/.test(String(ano).trim()) ? [Number(ano), Number(ano) + 1, Number(ano) - 1, null] : [null];
  for (const a of tentativas) {
    const params = { query: titulo, include_adult: 'false' };
    if (a) params.primary_release_year = a;
    const json = await consultar(chave, '/search/movie', params);
    const lista = (json && json.results) || [];
    const exato = lista.find((m) => comparavel(m.title) === alvo || comparavel(m.original_title) === alvo);
    if (exato) return exato.id;
    if (a === null && lista[0]) return lista[0].id;
  }
  return null;
}

// Imagem preferida: na ordem dos idiomas pedidos; dentro de um idioma, a mais votada.
function escolherImagem(lista, idiomas) {
  for (const idioma of idiomas) {
    const daqui = lista.filter((i) => (i.iso_639_1 || null) === idioma);
    if (daqui.length) return daqui.sort((a, b) => (b.vote_average - a.vote_average) || (b.vote_count - a.vote_count))[0];
  }
  return lista[0] || null;
}

// Trailer oficial no YouTube: inglês primeiro (a versão original costuma estar
// nele), depois português, depois qualquer um; "Trailer" antes de "Teaser".
function escolherTrailer(videos) {
  const doYoutube = (videos || []).filter((v) => v.site === 'YouTube' && /^(Trailer|Teaser)$/.test(v.type));
  const nota = (v) => (v.type === 'Trailer' ? 2 : 0) + (v.official ? 1 : 0) + (v.iso_639_1 === 'en' ? 4 : v.iso_639_1 === 'pt' ? 3 : 0);
  const melhor = doYoutube.sort((a, b) => nota(b) - nota(a))[0];
  return melhor ? melhor.key : '';
}

// Classificação indicativa do Brasil ("L", "10", "12", "14", "16", "18"); se não houver, a dos EUA.
function classificacao(releaseDates) {
  const de = (pais) => {
    const r = ((releaseDates && releaseDates.results) || []).find((x) => x.iso_3166_1 === pais);
    const c = r && r.release_dates.map((d) => d.certification).find(Boolean);
    return c || '';
  };
  return de('BR') || de('US');
}

// Tudo o que o app guarda de um filme. `id` é o do TMDB.
async function detalhes(chave, id) {
  const [d, imagens, en] = await Promise.all([
    consultar(chave, `/movie/${id}`, {
      language: 'pt-BR',
      append_to_response: 'videos,release_dates,credits,external_ids',
      include_video_language: 'en,pt,null',
    }),
    consultar(chave, `/movie/${id}/images`),
    // Em inglês: o título usado na lista (como no Letterboxd) e a sinopse reserva.
    consultar(chave, `/movie/${id}`, { language: 'en-US' }).catch(() => null),
  ]);
  if (!d) return null;
  // Sem sinopse em português: usa a em inglês.
  const sinopse = d.overview || (en && en.overview) || '';
  const original = d.original_language || 'en';
  // Capa: sempre a do idioma original do filme (a capa "de lançamento").
  const poster = escolherImagem((imagens && imagens.posters) || [], [original, 'en', null]);
  // Logo: inglês primeiro (legível para qualquer filme), depois o idioma original.
  const logo = escolherImagem(((imagens && imagens.logos) || []).filter((l) => l.file_path), ['en', original, 'pt', null]);
  const crew = (d.credits && d.credits.crew) || [];
  const diretores = crew.filter((c) => c.job === 'Director').map((c) => c.name);
  return {
    tmdbId: d.id,
    idiomaOriginal: original,
    imdbID: d.imdb_id || (d.external_ids && d.external_ids.imdb_id) || '',
    titulo: (en && en.title) || d.original_title || d.title,
    ano: anoDe(d.release_date),
    diretor: diretores.join(', '),
    poster: imagem((poster && poster.file_path) || d.poster_path, 'w780'),
    logo: imagem(logo && logo.file_path, 'w500'),
    trailerId: escolherTrailer(d.videos && d.videos.results),
    duracao: d.runtime || 0,
    info: {
      duracao: d.runtime ? `${d.runtime} min` : '',
      genero: (d.genres || []).map((g) => g.name).join(', '),
      classificacao: classificacao(d.release_dates),
      sinopse,
      elenco: ((d.credits && d.credits.cast) || []).slice(0, 6).map((c) => c.name).join(', '),
      // Em inglês, como o OMDb dava: o app traduz os nomes dos países.
      pais: (d.production_countries || []).map((p) => p.name).join(', '),
      // A nota do TMDB (de 0 a 10), com pelo menos 10 votos.
      tmdb: d.vote_count >= 10 && d.vote_average ? Number(d.vote_average).toFixed(1) : '',
    },
  };
}

// Todas as capas do filme, para escolher outra: idioma original primeiro.
async function capas(chave, id, original) {
  const imagens = await consultar(chave, `/movie/${id}/images`);
  const lista = ((imagens && imagens.posters) || []).slice();
  const peso = (p) => (p.iso_639_1 === original ? 3 : p.iso_639_1 === 'en' ? 2 : p.iso_639_1 === 'pt' ? 1 : 0);
  lista.sort((a, b) => (peso(b) - peso(a)) || (b.vote_average - a.vote_average));
  return lista.map((p) => ({ poster: imagem(p.file_path, 'w780'), miniatura: imagem(p.file_path, 'w342'), idioma: p.iso_639_1 || '' }));
}

// Para os detalhes: os outros filmes dirigidos por quem dirigiu este (até dois
// diretores, do mais novo para o mais antigo) e as recomendações do TMDB.
async function relacionados(chave, id) {
  const [creditos, recs] = await Promise.all([
    consultar(chave, `/movie/${id}/credits`),
    consultar(chave, `/movie/${id}/recommendations`, { language: 'en-US' }),
  ]);
  const diretores = ((creditos && creditos.crew) || []).filter((c) => c.job === 'Director').slice(0, 2);
  const filmografias = await Promise.all(diretores.map(async (d) => {
    const mc = await consultar(chave, `/person/${d.id}/movie_credits`, { language: 'en-US' });
    const ja = new Set([Number(id)]);
    const filmes = ((mc && mc.crew) || [])
      .filter((c) => c.job === 'Director' && c.release_date && !ja.has(c.id) && ja.add(c.id))
      .sort((a, b) => (b.release_date || '0').localeCompare(a.release_date || '0'))
      .map(resultado);
    return { nome: d.name, filmes };
  }));
  return {
    diretores: filmografias.filter((d) => d.filmes.length),
    recomendacoes: ((recs && recs.results) || []).slice(0, 18).map(resultado),
  };
}

// ---------- Onde assistir e nota do TMDB ----------
//
// Os serviços de streaming vêm do JustWatch, pelo TMDB (o TMDB pede o crédito
// ao JustWatch onde eles aparecem). `pais`: código de duas letras (BR, US…).

const provedor = (p) => ({ id: p.provider_id, nome: p.provider_name, logo: imagem(p.logo_path, 'w92') });
const DIA = 24 * 60 * 60 * 1000;

// Está nos cinemas do país? Estreou (lançamento 2 = limitado, 3 = cinema) há até
// 75 dias e ainda não saiu em digital (4). Estreia nos próximos 30 dias = em breve.
function situacaoCinema(releaseDates, pais, agora = Date.now()) {
  const r = ((releaseDates && releaseDates.results) || []).find((x) => x.iso_3166_1 === pais);
  const datas = (r && r.release_dates) || [];
  const quando = (tipos) => datas.filter((d) => tipos.includes(d.type) && d.release_date).map((d) => Date.parse(d.release_date)).sort((a, b) => a - b);
  const cinema = quando([2, 3]);
  const digital = quando([4]);
  if (!cinema.length) return { cinema: false };
  if (digital.length && digital[0] <= agora) return { cinema: false };
  const estreou = cinema.filter((t) => t <= agora).pop();
  if (estreou && agora - estreou <= 75 * DIA) return { cinema: 'agora', cinemaData: new Date(estreou).toISOString().slice(0, 10) };
  const proxima = cinema.find((t) => t > agora);
  if (proxima && proxima - agora <= 30 * DIA) return { cinema: 'em-breve', cinemaData: new Date(proxima).toISOString().slice(0, 10) };
  return { cinema: false };
}

async function ondeAssistir(chave, id, pais = 'BR') {
  const d = await consultar(chave, `/movie/${id}`, { append_to_response: 'watch/providers,release_dates' });
  if (!d) return null;
  const w = (d['watch/providers'] && d['watch/providers'].results && d['watch/providers'].results[pais]) || {};
  const lista = (x) => (x || []).sort((a, b) => (a.display_priority || 0) - (b.display_priority || 0)).map(provedor);
  return {
    nota: d.vote_count >= 10 && d.vote_average ? Number(d.vote_average).toFixed(1) : '',
    onde: {
      link: w.link || '',
      assinatura: lista(w.flatrate),
      gratis: lista([...(w.free || []), ...(w.ads || [])]),
      aluguel: lista(w.rent),
      compra: lista(w.buy),
    },
    ...situacaoCinema(d.release_dates, pais),
  };
}

// Os ids do TMDB dos filmes em cartaz no país (as 3 primeiras páginas).
async function emCartaz(chave, pais = 'BR') {
  const ids = new Set();
  for (let pagina = 1; pagina <= 3; pagina++) {
    const json = await consultar(chave, '/movie/now_playing', { region: pais, page: pagina });
    for (const m of (json && json.results) || []) ids.add(m.id);
    if (!json || pagina >= (json.total_pages || 1)) break;
  }
  return ids;
}

// Os serviços de streaming do país, para escolher os seus em Configurações.
async function provedores(chave, pais = 'BR') {
  const json = await consultar(chave, '/watch/providers/movie', { watch_region: pais, language: 'pt-BR' });
  return ((json && json.results) || [])
    .sort((a, b) => ((a.display_priorities && a.display_priorities[pais]) || a.display_priority || 99) - ((b.display_priorities && b.display_priorities[pais]) || b.display_priority || 99))
    .map(provedor);
}

module.exports = { ErroTmdb, pesquisar, idPorImdb, idPorTitulo, detalhes, capas, relacionados, ondeAssistir, emCartaz, provedores, situacaoCinema };
