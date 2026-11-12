// Consultas ao IGDB (igdb.com, da Twitch): a fonte dos jogos do nandplay.
// Capa, artes, sinopse, gêneros, plataformas, quem desenvolveu e quem publicou,
// trailer, lojas, o appid da Steam e o tempo para zerar.
//
// Cada pessoa usa as próprias chaves (Client ID e Client Secret de um app em
// dev.twitch.tv/console/apps). Com elas se pede um token (vale semanas), que
// fica guardado com a validade e é renovado quando vence ou quando o IGDB
// responde 401. O limite é de 4 pedidos por segundo: os pedidos passam por
// uma fila própria.
//
// O IGDB não aceita pedidos do navegador (CORS): no PC, só pelo processo
// principal; no celular, a ponte manda pela rede nativa (CapacitorHttp).

const URL_TOKEN = 'https://id.twitch.tv/oauth2/token';
const BASE = 'https://api.igdb.com/v4';
const IMAGEM = 'https://images.igdb.com/igdb/image/upload/';

class ErroIgdb extends Error {
  constructor(tipo, mensagem) {
    super(mensagem);
    this.tipo = tipo; // 'chave' | 'rede'
  }
}

const SEM_CHAVES = 'Coloque o Client ID e o Client Secret do IGDB (Twitch) em Configurações › nandplay.';
const CHAVES_INVALIDAS = 'As chaves do IGDB não funcionaram. Confira o Client ID e o Client Secret em Configurações › nandplay.';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Imagens ----------

// t_cover_big (264×374), t_1080p, t_screenshot_big, t_720p, t_logo_med…
const imagem = (imageId, tamanho = 't_cover_big') => (imageId ? `${IMAGEM}${tamanho}/${imageId}.jpg` : '');

// ---------- Montagem dos pedidos (Apicalypse) ----------

// Texto entre aspas no Apicalypse: escapa a barra e as aspas; tira quebras de linha.
const textoApi = (t) => `"${String(t || '').replace(/[\r\n]+/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"').trim()}"`;
const idApi = (x) => {
  const n = Number(x);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

// A Steam nos external_games: o campo novo é external_game_source (1 = Steam);
// o antigo, category (1 = Steam). Aceita os dois.
const FONTE_STEAM = 1;
const CAMPOS_STEAM = 'external_games.uid,external_games.url,external_games.category,external_games.external_game_source';

const CAMPOS_BUSCA = [
  'name', 'slug', 'first_release_date', 'cover.image_id',
  'platforms.name', 'platforms.abbreviation',
  'game_type', 'category', 'version_parent',
  CAMPOS_STEAM,
].join(',');

const CAMPOS_DETALHES = [
  'name', 'slug', 'first_release_date', 'summary', 'storyline',
  'cover.image_id', 'artworks.image_id', 'screenshots.image_id',
  'genres.name', 'themes.name', 'game_modes.name',
  'platforms.name', 'platforms.abbreviation',
  'involved_companies.company.name', 'involved_companies.developer', 'involved_companies.publisher',
  'videos.video_id', 'videos.name',
  'websites.url', 'websites.category', 'websites.type',
  'total_rating', 'total_rating_count', 'aggregated_rating',
  'game_type', 'category', 'version_parent', 'parent_game',
  CAMPOS_STEAM,
].join(',');

function corpoBusca(termo, limite = 20) {
  return `search ${textoApi(termo)}; fields ${CAMPOS_BUSCA}; where version_parent = null; limit ${limite};`;
}
function corpoDetalhes(id) {
  const n = idApi(id);
  if (!n) throw new ErroIgdb('rede', 'Jogo inválido.');
  return `fields ${CAMPOS_DETALHES}; where id = ${n}; limit 1;`;
}
function corpoTempo(id) {
  return `fields hastily,normally,completely,count; where game_id = ${idApi(id)}; limit 1;`;
}
function corpoEmpresa(empresaId) {
  const n = idApi(empresaId);
  if (!n) throw new ErroIgdb('rede', 'Empresa inválida.');
  return `fields name,developed; where id = ${n}; limit 1;`;
}
// Os jogos de uma lista de ids (até 500 por pedido): o bastante para filtrar e ordenar aqui.
function corpoJogosPorIds(ids) {
  const lista = ids.map(idApi).filter(Boolean);
  return `fields name,slug,first_release_date,cover.image_id,platforms.abbreviation,total_rating_count,hypes,game_type,category,version_parent,${CAMPOS_STEAM}; where id = (${lista.join(',')}); limit ${Math.min(500, Math.max(1, lista.length))};`;
}

// O mesmo pedido sem os campos "category" (antigos; o IGDB avisou que vão sair).
function semCamposAntigos(corpo) {
  return String(corpo).replace(/fields ([^;]+);/, (_, lista) => `fields ${lista.split(',').filter((c) => !/(^|\.)category$/.test(c.trim())).join(',')};`);
}

// ---------- Leitura das respostas ----------

const anoDe = (segundos) => (segundos ? String(new Date(segundos * 1000).getUTCFullYear()) : '');

// O appid da Steam do jogo (número) ou null.
function appidSteam(g) {
  for (const e of (g && g.external_games) || []) {
    const fonte = e.external_game_source !== undefined ? (typeof e.external_game_source === 'object' ? e.external_game_source && e.external_game_source.id : e.external_game_source) : e.category;
    const daUrl = /store\.steampowered\.com\/app\/(\d+)/.exec(e.url || '');
    if (Number(fonte) !== FONTE_STEAM && !daUrl) continue;
    const n = Number(/^\d+$/.test(String(e.uid || '')) ? e.uid : daUrl && daUrl[1]);
    if (Number.isSafeInteger(n) && n > 0) return n;
  }
  for (const w of (g && g.websites) || []) {
    const m = /store\.steampowered\.com\/app\/(\d+)/.exec(w.url || '');
    if (m) return Number(m[1]);
  }
  return null;
}

const plataformas = (g) => ((g && g.platforms) || []).map((p) => ({ id: p.id, nome: p.name || '', abrev: p.abbreviation || p.name || '' }));

// Resultado leve, para a lista da tela Adicionar.
function resultadoBusca(g) {
  return {
    igdb: g.id,
    igdbSlug: g.slug || '',
    titulo: g.name || '',
    ano: anoDe(g.first_release_date),
    capa: imagem(g.cover && g.cover.image_id, 't_cover_big'),
    plataformas: plataformas(g).map((p) => p.abrev),
    steam: appidSteam(g),
  };
}

// As lojas pelo endereço (mais firme que os números de categoria, que mudaram de campo).
const LOJAS = [
  ['steam', /(^|\.)steampowered\.com$|(^|\.)steamcommunity\.com$/],
  ['epic', /(^|\.)epicgames\.com$/],
  ['gog', /(^|\.)gog\.com$/],
  ['itch', /(^|\.)itch\.io$/],
  ['playstation', /(^|\.)playstation\.com$/],
  ['xbox', /(^|\.)xbox\.com$|(^|\.)microsoft\.com$/],
  ['nintendo', /(^|\.)nintendo\.(com|co\.jp|com\.br)$/],
  ['appstore', /^apps\.apple\.com$|^itunes\.apple\.com$/],
  ['googleplay', /^play\.google\.com$/],
];
function lojaDe(url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  for (const [loja, re] of LOJAS) if (re.test(host)) return loja;
  return null;
}
// [{ loja, url }] sem repetir a loja; a Steam primeiro (o app abre o jogo nela).
function lojas(g) {
  const r = new Map();
  const steam = appidSteam(g);
  if (steam) r.set('steam', { loja: 'steam', url: `https://store.steampowered.com/app/${steam}/` });
  for (const w of (g && g.websites) || []) {
    if (!/^https:\/\//i.test(w.url || '')) continue;
    const loja = lojaDe(w.url);
    if (loja && loja !== 'steamcommunity' && !r.has(loja)) r.set(loja, { loja, url: w.url });
  }
  return [...r.values()];
}
// O site oficial (category/type 1), se houver.
function siteOficial(g) {
  const w = ((g && g.websites) || []).find((x) => Number(x.type !== undefined ? (typeof x.type === 'object' ? x.type && x.type.id : x.type) : x.category) === 1);
  return w && /^https?:\/\//i.test(w.url || '') ? w.url : '';
}

// Desenvolvedores separados das publicadoras (a mesma empresa pode estar nos dois).
function empresas(g) {
  const dev = [];
  const pub = [];
  for (const ic of (g && g.involved_companies) || []) {
    const c = ic.company;
    if (!c || !c.id) continue;
    const e = { id: c.id, nome: c.name || '' };
    if (ic.developer && !dev.some((x) => x.id === e.id)) dev.push(e);
    if (ic.publisher && !pub.some((x) => x.id === e.id)) pub.push(e);
  }
  return { desenvolvedores: dev, publicadoras: pub };
}

// O trailer no YouTube: o vídeo chamado "trailer" (o de lançamento antes), ou o primeiro.
function trailerDe(g) {
  const v = ((g && g.videos) || []).filter((x) => /^[\w-]{11}$/.test(x.video_id || ''));
  const nome = (x) => String(x.name || '').toLowerCase();
  const escolhido = v.find((x) => /launch|lançamento/.test(nome(x)) && /trailer/.test(nome(x))) || v.find((x) => /trailer/.test(nome(x))) || v[0];
  return escolhido ? escolhido.video_id : '';
}

// Horas (arredondadas a meia hora) a partir dos segundos.
const horas = (s) => (Number(s) > 0 ? Math.round((Number(s) / 3600) * 2) / 2 : null);

// Tudo do contrato do item de jogo (src/plataformas.js: ehJogo), menos o que é do usuário.
function lerDetalhes(g, tempo = null) {
  if (!g) return null;
  const artes = ((g.artworks || []).map((a) => a.image_id)).filter(Boolean);
  const capturas = ((g.screenshots || []).map((a) => a.image_id)).filter(Boolean);
  const { desenvolvedores, publicadoras } = empresas(g);
  const t = tempo || {};
  return {
    tipo: 'jogo',
    igdb: g.id,
    igdbSlug: g.slug || '',
    steam: appidSteam(g),
    titulo: g.name || '',
    ano: anoDe(g.first_release_date),
    lancamento: g.first_release_date ? new Date(g.first_release_date * 1000).toISOString().slice(0, 10) : '',
    capa: imagem(g.cover && g.cover.image_id, 't_cover_big'),
    fundo: imagem(artes[0] || capturas[0], 't_1080p'),
    logo: '', // o IGDB não tem logos: vem da Steam (lib/steam.js) quando há appid
    artes: artes.map((id) => imagem(id, 't_1080p')),
    capturas: capturas.map((id) => imagem(id, 't_screenshot_big')),
    sinopse: String(g.summary || g.storyline || '').trim(),
    generos: [...(g.genres || []), ...(g.themes || [])].map((x) => x.name).filter(Boolean).filter((n, i, l) => l.indexOf(n) === i),
    modos: (g.game_modes || []).map((x) => x.name).filter(Boolean),
    plataformasJogo: plataformas(g),
    desenvolvedores,
    publicadoras,
    lojas: lojas(g),
    site: siteOficial(g),
    trailer: trailerDe(g),
    nota: Number.isFinite(g.total_rating) ? Math.round(g.total_rating) : null,
    tempoZerar: horas(t.normally) || horas(t.hastily),
    tempoZerarRapido: horas(t.hastily),
    tempoZerarCompleto: horas(t.completely),
  };
}

// Jogo "principal" para a fileira "Mais do desenvolvedor": nada de DLC,
// expansão, pacote, mod, episódio ou edição (version_parent). game_type é o
// campo novo; category, o antigo (mesmos números nos que usamos aqui).
// 0 jogo, 4 expansão independente, 8 remake, 9 remaster, 10 jogo expandido.
const TIPOS_PRINCIPAIS = new Set([0, 4, 8, 9, 10]);
function ehPrincipal(g) {
  if (!g || g.version_parent) return false;
  let tipo = g.game_type !== undefined ? g.game_type : g.category;
  if (tipo && typeof tipo === 'object') tipo = tipo.id;
  return tipo === undefined || tipo === null || TIPOS_PRINCIPAIS.has(Number(tipo));
}
// Mais relevantes primeiro: quantas notas (e o "hype" dos que ainda vão sair), depois o mais novo.
const relevancia = (g) => (Number(g.total_rating_count) || 0) + (Number(g.hypes) || 0);
function ordenarRelevantes(lista) {
  return [...lista].sort((a, b) => relevancia(b) - relevancia(a) || (Number(b.first_release_date) || 0) - (Number(a.first_release_date) || 0));
}

// ---------- O cliente ----------
//
// new Igdb({ credenciais: () => ({ clientId, clientSecret }), lerToken, gravarToken })
//   lerToken() → { clientId, token, expiraEm } | null; gravarToken(dados): o cache em disco.
//   fetch, agora, intervalo: para os testes (sem internet).
class Igdb {
  constructor({ credenciais, lerToken = () => null, gravarToken = () => {}, fetch: fetchFn = null, agora = () => Date.now(), intervalo = 260 } = {}) {
    this.credenciais = credenciais || (() => ({}));
    this.lerToken = lerToken;
    this.gravarToken = gravarToken;
    this.fetchFn = fetchFn;
    this.agora = agora;
    this.intervalo = intervalo; // ms entre um pedido e outro (~4 por segundo)
    this.proximo = 0;
    this.tokenAtual = null;
    this.pedindoToken = null;
  }

  pedir(url, opcoes) {
    const f = this.fetchFn || fetch;
    return f(url, { ...opcoes, signal: AbortSignal.timeout(15000) });
  }

  chaves() {
    const c = this.credenciais() || {};
    const clientId = String(c.clientId || '').trim();
    const clientSecret = String(c.clientSecret || '').trim();
    if (!clientId || !clientSecret) throw new ErroIgdb('chave', SEM_CHAVES);
    return { clientId, clientSecret };
  }

  // O token guardado, se for destas chaves e não estiver para vencer (1 hora de folga).
  tokenValido(clientId) {
    const t = this.tokenAtual || (() => { try { return this.lerToken(); } catch { return null; } })();
    if (t && t.token && t.clientId === clientId && Number(t.expiraEm) > this.agora() + 3600 * 1000) {
      this.tokenAtual = t;
      return t.token;
    }
    return null;
  }

  async token({ renovar = false } = {}) {
    const { clientId, clientSecret } = this.chaves();
    if (!renovar) {
      const t = this.tokenValido(clientId);
      if (t) return t;
    }
    if (this.pedindoToken) return this.pedindoToken;
    this.pedindoToken = (async () => {
      const qs = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' });
      let r;
      try {
        r = await this.pedir(`${URL_TOKEN}?${qs}`, { method: 'POST', headers: { Accept: 'application/json' } });
      } catch {
        throw new ErroIgdb('rede', 'Sem conexão com a Twitch (o IGDB entra por ela).');
      }
      // 400 (client_id errado) ou 403 (secret errado): as chaves não servem.
      if (r.status === 400 || r.status === 401 || r.status === 403) throw new ErroIgdb('chave', CHAVES_INVALIDAS);
      if (!r.ok) throw new ErroIgdb('rede', `A Twitch respondeu com erro ${r.status}.`);
      const j = await r.json().catch(() => null);
      if (!j || !j.access_token) throw new ErroIgdb('rede', 'A Twitch não mandou o token.');
      const dados = { clientId, token: j.access_token, expiraEm: this.agora() + (Number(j.expires_in) || 3600) * 1000 };
      this.tokenAtual = dados;
      try { this.gravarToken(dados); } catch { /* sem disco: vale até fechar */ }
      return dados.token;
    })().finally(() => { this.pedindoToken = null; });
    return this.pedindoToken;
  }

  // A fila: cada pedido reserva o seu horário (intervalo entre eles), sem passar de ~4 por segundo.
  async vez() {
    const agora = this.agora();
    const quando = Math.max(agora, this.proximo);
    this.proximo = quando + this.intervalo;
    if (quando > agora) await espera(quando - agora);
  }

  async consultar(endpoint, corpo, { tentativa = 0, renovado = false, simplificado = false } = {}) {
    const { clientId } = this.chaves();
    const token = await this.token();
    await this.vez();
    let r;
    try {
      r = await this.pedir(`${BASE}/${endpoint}`, {
        method: 'POST',
        headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'text/plain' },
        body: corpo,
      });
    } catch {
      throw new ErroIgdb('rede', 'Sem conexão com o IGDB.');
    }
    // Token vencido ou revogado: pede outro uma vez. Se ainda assim der 401, as chaves não servem.
    if (r.status === 401 || r.status === 403) {
      if (renovado) throw new ErroIgdb('chave', CHAVES_INVALIDAS);
      this.tokenAtual = null;
      await this.token({ renovar: true });
      return this.consultar(endpoint, corpo, { tentativa, renovado: true, simplificado });
    }
    // Campo que não existe mais (os antigos "category", trocados por game_type, external_game_source
    // e type): tenta de novo sem eles, uma vez.
    if (r.status === 400 && !simplificado && corpo !== semCamposAntigos(corpo)) return this.consultar(endpoint, semCamposAntigos(corpo), { tentativa, renovado, simplificado: true });
    if (r.status === 429 && tentativa < 3) {
      await espera(1000 * (tentativa + 1));
      return this.consultar(endpoint, corpo, { tentativa: tentativa + 1, renovado, simplificado });
    }
    if (!r.ok) throw new ErroIgdb('rede', `O IGDB respondeu com erro ${r.status}.`);
    const j = await r.json().catch(() => null);
    return Array.isArray(j) ? j : [];
  }

  // Para o botão "Testar" das Configurações: pede um token novo e faz uma consulta mínima.
  async testar() {
    await this.token({ renovar: true });
    const r = await this.consultar('games', 'fields name; where id = 1942; limit 1;');
    return { ok: true, exemplo: r[0] ? r[0].name : '' };
  }

  async buscarJogos(termo) {
    const t = String(termo || '').trim();
    if (!t) return [];
    return (await this.consultar('games', corpoBusca(t))).map(resultadoBusca);
  }

  async detalhesJogo(id) {
    const [g] = await this.consultar('games', corpoDetalhes(id));
    if (!g) return null;
    // O tempo para zerar (endpoint novo; sem ele, o jogo vem sem tempo).
    let tempo = null;
    try { [tempo] = await this.consultar('game_time_to_beats', corpoTempo(g.id)); } catch (e) { if (e.tipo === 'chave') throw e; }
    return lerDetalhes(g, tempo);
  }

  // "Mais do desenvolvedor": os jogos principais da empresa, mais relevantes primeiro.
  // excluir: igdb id (ou lista) do jogo aberto, para não repetir.
  async jogosDoDesenvolvedor(empresaId, { excluir = [], limite = 20 } = {}) {
    const [empresa] = await this.consultar('companies', corpoEmpresa(empresaId));
    const fora = new Set([].concat(excluir).map(Number));
    const ids = ((empresa && empresa.developed) || []).filter((id) => !fora.has(Number(id)));
    const jogos = [];
    for (let i = 0; i < ids.length && i < 1500; i += 500) jogos.push(...await this.consultar('games', corpoJogosPorIds(ids.slice(i, i + 500))));
    return {
      empresa: empresa ? { id: empresa.id, nome: empresa.name || '' } : null,
      jogos: ordenarRelevantes(jogos.filter(ehPrincipal)).slice(0, limite).map(resultadoBusca),
    };
  }
}

module.exports = {
  Igdb, ErroIgdb, imagem,
  // para os testes (scripts/testar-jogos.js)
  textoApi, semCamposAntigos, corpoBusca, corpoDetalhes, corpoTempo, corpoEmpresa, corpoJogosPorIds,
  appidSteam, resultadoBusca, lerDetalhes, empresas, lojas, trailerDe, ehPrincipal, ordenarRelevantes,
  SEM_CHAVES, CHAVES_INVALIDAS,
};
