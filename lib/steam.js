// A Steam no nandplay: a loja (busca, detalhes em pt-BR com preço em reais,
// imagens), a Web API (os jogos da conta com as horas jogadas; precisa da
// chave e do SteamID do usuário), a leitura das pastas da Steam no PC (quais
// jogos estão instalados; só LÊ, nunca grava) e os links que abrem a Steam.
//
// Os links steam:// são montados SÓ aqui e SÓ a partir de um appid numérico
// validado: o processo principal abre um link steam:// apenas se ele for
// exatamente um dos que estas funções montam (ehLinkSteam).
const fs = require('fs');
const path = require('path');

const LOJA = 'https://store.steampowered.com';
const API = 'https://api.steampowered.com';
const IMAGENS = 'https://shared.akamai.steamstatic.com/store_item_assets/';

class ErroSteam extends Error {
  constructor(tipo, mensagem) {
    super(mensagem);
    this.tipo = tipo; // 'chave' | 'perfil' | 'privado' | 'rede'
  }
}

// ---------- appid ----------

// Um appid da Steam: inteiro positivo (até 32 bits), em número ou em texto só
// de dígitos. Qualquer outra coisa ('1;calc', '-5', '12abc', 1.5) vira null.
function appidValido(x) {
  if (typeof x === 'number') return Number.isSafeInteger(x) && x > 0 && x <= 0xFFFFFFFF ? x : null;
  if (typeof x !== 'string' || !/^[1-9]\d{0,9}$/.test(x)) return null;
  const n = Number(x);
  return n <= 0xFFFFFFFF ? n : null;
}

// ---------- Links ----------

// acao → o link. 'jogar' (instalado), 'instalar' (na biblioteca), 'loja' (abre a
// loja dentro da Steam), 'abrir' (sem saber se tem o jogo: a Steam decide) e
// 'web' (a página da loja no navegador: sem Steam no PC, ou no celular).
const MODELOS_LINK = {
  jogar: (id) => `steam://rungameid/${id}`,
  instalar: (id) => `steam://install/${id}`,
  loja: (id) => `steam://store/${id}`,
  abrir: (id) => `steam://run/${id}`,
  web: (id) => `${LOJA}/app/${id}/`,
};

function linkSteam(acao, appid) {
  const id = appidValido(appid);
  const modelo = Object.prototype.hasOwnProperty.call(MODELOS_LINK, acao) ? MODELOS_LINK[acao] : null;
  return id && modelo ? modelo(id) : null;
}
const linkJogar = (appid) => linkSteam('jogar', appid);
const linkInstalar = (appid) => linkSteam('instalar', appid);
const linkLojaSteam = (appid) => linkSteam('loja', appid);
const linkAbrir = (appid) => linkSteam('abrir', appid);
const linkLojaWeb = (appid) => linkSteam('web', appid);

// O link steam:// é exatamente um dos montados por linkSteam? (o resto é recusado)
function ehLinkSteam(url) {
  const m = /^steam:\/\/(rungameid|install|store|run)\/(\d+)$/.exec(String(url || ''));
  if (!m) return false;
  const acao = { rungameid: 'jogar', install: 'instalar', store: 'loja', run: 'abrir' }[m[1]];
  return linkSteam(acao, m[2]) === url;
}

// Uma coleção de appids (Set, lista, Map ou objeto { appid: … }) tem este appid?
function temApp(colecao, id) {
  if (!colecao) return false;
  if (colecao instanceof Set || colecao instanceof Map) return colecao.has(id) || colecao.has(String(id));
  if (Array.isArray(colecao)) return colecao.some((x) => (x && typeof x === 'object' ? Number(x.appid) === id : Number(x) === id));
  return typeof colecao === 'object' && Object.prototype.hasOwnProperty.call(colecao, String(id));
}

// O que o botão da Steam faz para este jogo:
//   no celular ou sem Steam no PC → a loja no navegador (https);
//   instalado → Jogar; na biblioteca (conta) → Instalar; a biblioteca é conhecida
//   e não tem → Ver na loja (dentro da Steam); sem a biblioteca (sem Steam ID) →
//   steam://run (a Steam abre o jogo ou leva para a loja).
// `biblioteca` null/undefined = não sabemos o que a conta tem.
function acaoSteam(appid, { instalados = null, biblioteca = null, steamNoPc = false, celular = false } = {}) {
  const id = appidValido(appid);
  if (!id) return null;
  const com = (acao, link = acao) => ({ acao, url: linkSteam(link, id) });
  if (celular || !steamNoPc) return com('loja', 'web');
  if (temApp(instalados, id)) return com('jogar');
  if (biblioteca) return temApp(biblioteca, id) ? com('instalar') : com('loja');
  return com('abrir');
}

// ---------- Imagens ----------

// As imagens pelo caminho "simples" (sem pedir nada à Steam). Valem para a
// maioria dos jogos, mas os mais novos guardam as imagens num caminho com um
// código (aí estas dão 404): para esses, use imagensLoja, que pergunta à Steam.
function imagensSteam(appid) {
  const id = appidValido(appid);
  if (!id) return null;
  const base = `${IMAGENS}steam/apps/${id}/`;
  return { capa: `${base}library_600x900.jpg`, fundo: `${base}library_hero.jpg`, logo: `${base}logo.png`, cabecalho: `${base}header.jpg` };
}

// ---------- Pedidos ----------

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedirJson(url, { erroRede = 'Sem conexão com a Steam.', tentativa = 0, fetchFn = fetch } = {}) {
  let r;
  try {
    r = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  } catch {
    throw new ErroSteam('rede', erroRede);
  }
  if (r.status === 429 && tentativa < 2) {
    await espera(1500 * (tentativa + 1));
    return pedirJson(url, { erroRede, tentativa: tentativa + 1, fetchFn });
  }
  if (r.status === 401 || r.status === 403) throw new ErroSteam('chave', 'A chave da Steam Web API está errada. Confira em Configurações.');
  if (!r.ok) throw new ErroSteam('rede', `A Steam respondeu com erro ${r.status}.`);
  try { return await r.json(); } catch { throw new ErroSteam('rede', 'A Steam mandou uma resposta que não deu para ler.'); }
}

// ---------- Loja (sem chave) ----------

const PARAMS_LOJA = 'cc=BR&l=portuguese';

// Busca na loja: [{ appid, nome, cabecalho, preco, gratis, metascore, plataformas }].
async function buscarLoja(termo, { fetchFn } = {}) {
  const t = String(termo || '').trim();
  if (!t) return [];
  const json = await pedirJson(`${LOJA}/api/storesearch/?term=${encodeURIComponent(t)}&${PARAMS_LOJA}`, { fetchFn });
  return lerBuscaLoja(json);
}
function lerBuscaLoja(json) {
  return ((json && json.items) || []).filter((i) => i && i.type === 'app' && appidValido(i.id)).map((i) => ({
    appid: i.id,
    nome: i.name || '',
    cabecalho: i.tiny_image || '',
    preco: i.price && Number.isFinite(i.price.final) ? i.price.final / 100 : null,
    gratis: !i.price,
    metascore: Number(i.metascore) || null,
    plataformas: ['windows', 'mac', 'linux'].filter((p) => i.platforms && i.platforms[p]),
  }));
}

const semHtml = (t) => String(t || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

// Detalhes da loja (pt-BR, preço em reais), ou null se o app não existe/não está à venda no Brasil.
async function detalhesLoja(appid, { fetchFn } = {}) {
  const id = appidValido(appid);
  if (!id) return null;
  const json = await pedirJson(`${LOJA}/api/appdetails?appids=${id}&${PARAMS_LOJA}`, { fetchFn });
  return lerDetalhesLoja(json, id);
}
function lerDetalhesLoja(json, id) {
  const r = json && json[String(id)];
  if (!r || !r.success || !r.data) return null;
  const d = r.data;
  const preco = d.price_overview || null;
  return {
    appid: Number(d.steam_appid) || id,
    tipo: d.type || '', // 'game' | 'dlc' | …
    nome: d.name || '',
    sinopse: semHtml(d.short_description),
    gratis: Boolean(d.is_free),
    preco: preco ? { final: preco.final / 100, inicial: preco.initial / 100, desconto: preco.discount_percent || 0, texto: preco.final_formatted || '' } : null,
    desenvolvedores: Array.isArray(d.developers) ? d.developers : [],
    publicadoras: Array.isArray(d.publishers) ? d.publishers : [],
    generos: (d.genres || []).map((g) => g.description).filter(Boolean),
    lancamento: d.release_date ? { embreve: Boolean(d.release_date.coming_soon), data: d.release_date.date || '' } : null,
    plataformas: ['windows', 'mac', 'linux'].filter((p) => d.platforms && d.platforms[p]),
    metacritic: d.metacritic ? { nota: d.metacritic.score, url: d.metacritic.url || '' } : null,
    cabecalho: d.header_image || '',
    site: /^https?:\/\//i.test(d.website || '') ? d.website : '',
    capturas: (d.screenshots || []).map((s) => s.path_full).filter(Boolean),
  };
}

// As imagens certas de cada app (com o código no caminho), de uma vez para
// vários: { appid: { capa, fundo, cabecalho, logo } }. A logo não vem nessa
// resposta: fica a do caminho simples (pode não existir nos jogos mais novos).
async function imagensLoja(appids, { fetchFn } = {}) {
  const ids = [...new Set((appids || []).map(appidValido).filter(Boolean))];
  if (!ids.length) return {};
  const entrada = { ids: ids.map((appid) => ({ appid })), context: { language: 'brazilian', country_code: 'BR' }, data_request: { include_assets: true } };
  const json = await pedirJson(`${API}/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(entrada))}`, { fetchFn });
  return lerImagensLoja(json);
}
function lerImagensLoja(json) {
  const r = {};
  for (const i of (json && json.response && json.response.store_items) || []) {
    const id = appidValido(i.appid);
    const a = i.assets;
    if (!id || !a) continue;
    const formato = a.asset_url_format || `steam/apps/${id}/\${FILENAME}`;
    const url = (arq) => (arq ? IMAGENS + formato.replace('${FILENAME}', arq) : '');
    const simples = imagensSteam(id);
    r[id] = {
      capa: url(a.library_capsule_2x || a.library_capsule) || simples.capa,
      fundo: url(a.library_hero_2x || a.library_hero) || simples.fundo,
      cabecalho: url(a.header) || simples.cabecalho,
      logo: simples.logo,
    };
  }
  return r;
}

// Sem as chaves da IGDB, a busca do nandplay cai para a loja da Steam: estes dois
// põem o resultado e os detalhes da loja no mesmo formato da IGDB (lib/igdb.js).
const anoDoTexto = (t) => { const m = /\b(19[7-9]\d|20\d\d)\b/.exec(String(t || '')); return m ? m[1] : ''; };
const ABREV_LOJA = { windows: 'PC', mac: 'Mac', linux: 'Linux' };
// A busca da loja traz trilhas sonoras e artbooks como "app": fora da lista de jogos.
const ehJogoDaLoja = (l) => !/\b(soundtrack|original score|artbook|wallpapers?|ost)\b/i.test(l.nome || '');
function resultadoDaLoja(l) {
  const img = imagensSteam(l.appid);
  return {
    igdb: null, igdbSlug: '', steam: l.appid, titulo: l.nome, ano: '',
    capa: img.capa, capaAlternativa: l.cabecalho || img.cabecalho,
    plataformas: l.plataformas.map((p) => ABREV_LOJA[p] || p),
  };
}
// Detalhes da loja → item de jogo (contrato). `imagens`: o que imagensLoja devolve para o appid (ou nada).
function itemDeLoja(det, imagens) {
  if (!det) return null;
  const img = { ...imagensSteam(det.appid), ...(imagens || {}) };
  return {
    tipo: 'jogo', igdb: null, igdbSlug: '', steam: det.appid, titulo: det.nome,
    ano: anoDoTexto(det.lancamento && det.lancamento.data),
    lancamento: '', capa: img.capa, fundo: img.fundo, logo: img.logo, cabecalho: det.cabecalho || img.cabecalho,
    artes: [], capturas: (det.capturas || []).slice(0, 12), sinopse: det.sinopse, generos: det.generos, modos: [],
    plataformasJogo: det.plataformas.map((p) => ({ id: p, nome: p === 'windows' ? 'PC (Microsoft Windows)' : p === 'mac' ? 'Mac' : 'Linux', abrev: ABREV_LOJA[p] || p })),
    desenvolvedores: det.desenvolvedores.map((nome) => ({ id: null, nome })), publicadoras: det.publicadoras.map((nome) => ({ id: null, nome })),
    lojas: [{ loja: 'steam', url: `${LOJA}/app/${det.appid}/` }], site: det.site, trailer: '',
    nota: det.metacritic ? det.metacritic.nota : null, tempoZerar: null, tempoZerarRapido: null, tempoZerarCompleto: null,
  };
}

// ---------- Web API (chave + SteamID64 do usuário) ----------

const STEAMID = /^7656119\d{10}$/;

// Aceita o SteamID64, o nome do perfil (vanity) ou a URL do perfil
// (steamcommunity.com/profiles/<id> ou /id/<nome>). Devolve o SteamID64.
function lerPerfil(texto) {
  const t = String(texto || '').trim().replace(/\/+$/, '');
  if (STEAMID.test(t)) return { steamid: t };
  const m = /steamcommunity\.com\/(profiles|id)\/([^/?#\s]+)/i.exec(t);
  if (m) return m[1].toLowerCase() === 'profiles' ? (STEAMID.test(m[2]) ? { steamid: m[2] } : { invalido: true }) : { vanity: decodeURIComponent(m[2]) };
  if (/^[\w-]{2,32}$/.test(t)) return { vanity: t };
  return { invalido: true };
}

async function resolverPerfil(chave, texto, { fetchFn } = {}) {
  const p = lerPerfil(texto);
  if (p.steamid) return p.steamid;
  if (p.invalido) throw new ErroSteam('perfil', 'Não reconheci esse perfil da Steam. Use o número (SteamID64), o nome do perfil ou o link dele.');
  chave = String(chave || '').trim();
  if (!chave) throw new ErroSteam('chave', 'Coloque a chave da Steam Web API em Configurações.');
  const json = await pedirJson(`${API}/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(chave)}&vanityurl=${encodeURIComponent(p.vanity)}`, { fetchFn });
  const r = json && json.response;
  if (r && r.success === 1 && STEAMID.test(String(r.steamid))) return String(r.steamid);
  throw new ErroSteam('perfil', `Não achei o perfil “${p.vanity}” na Steam.`);
}

// Os jogos da conta: [{ appid, nome, minutos, minutos2Semanas, ultimaVez }].
// Perfil ou "detalhes de jogos" privados: a Steam responde vazio, sem erro.
async function jogosDaConta(chave, perfil, { fetchFn } = {}) {
  chave = String(chave || '').trim();
  if (!chave) throw new ErroSteam('chave', 'Coloque a chave da Steam Web API em Configurações.');
  const steamid = await resolverPerfil(chave, perfil, { fetchFn });
  const json = await pedirJson(`${API}/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(chave)}&steamid=${steamid}&include_appinfo=1&include_played_free_games=1&format=json`, { fetchFn });
  return { steamid, jogos: lerJogosDaConta(json) };
}
function lerJogosDaConta(json) {
  const r = json && json.response;
  if (!r || !Array.isArray(r.games)) throw new ErroSteam('privado', 'A Steam não mostrou os seus jogos. Deixe o perfil e os “detalhes de jogos” como públicos nas configurações de privacidade da Steam.');
  return r.games.filter((g) => appidValido(g.appid)).map((g) => ({
    appid: g.appid,
    nome: g.name || '',
    minutos: Number(g.playtime_forever) || 0,
    minutos2Semanas: Number(g.playtime_2weeks) || 0,
    ultimaVez: g.rtime_last_played ? new Date(g.rtime_last_played * 1000).toISOString() : '',
  }));
}

// ---------- Pastas da Steam no PC (só leitura) ----------

// VDF (KeyValues da Valve): "chave" "valor" e "chave" { … }. Tolerante: aceita
// comentários //, escapes \\ \" \n \t, chaves sem aspas, e um arquivo cortado
// no meio (fecha o que ficou aberto). Devolve objetos aninhados.
function lerVdf(texto) {
  const s = String(texto || '').replace(/^\uFEFF/, '');
  let i = 0;
  const raiz = {};
  const pilha = [raiz];
  let chave = null;
  const pular = () => {
    for (;;) {
      while (i < s.length && /\s/.test(s[i])) i++;
      if (s[i] === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
      return;
    }
  };
  const lerTexto = () => {
    if (s[i] === '"') {
      i++;
      let t = '';
      while (i < s.length && s[i] !== '"') {
        if (s[i] === '\\' && i + 1 < s.length) {
          const c = s[i + 1];
          t += c === 'n' ? '\n' : c === 't' ? '\t' : c;
          i += 2;
        } else t += s[i++];
      }
      i++; // a aspa do fim (ou o fim do arquivo)
      return t;
    }
    let t = '';
    while (i < s.length && !/[\s{}"]/.test(s[i])) t += s[i++];
    return t;
  };
  for (;;) {
    pular();
    if (i >= s.length) break;
    const c = s[i];
    if (c === '{') {
      i++;
      const novo = {};
      pilha[pilha.length - 1][chave === null ? '' : chave] = novo;
      pilha.push(novo);
      chave = null;
    } else if (c === '}') {
      i++;
      if (pilha.length > 1) pilha.pop();
      chave = null;
    } else {
      const t = lerTexto();
      if (chave === null) chave = t;
      else { pilha[pilha.length - 1][chave] = t; chave = null; }
    }
  }
  return raiz;
}

// A saída de `reg query HKCU\Software\Valve\Steam /v SteamPath` → a pasta.
function pastaDoRegistro(saida) {
  const m = /SteamPath\s+REG_\w+\s+(.+)/i.exec(String(saida || ''));
  return m ? path.normalize(m[1].trim()) : '';
}

// As pastas onde a Steam procura (padrão quando o registro não diz nada).
function pastasPadrao(plataforma = process.platform, casa = '') {
  if (plataforma === 'win32') return ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam'];
  if (plataforma === 'darwin') return [path.join(casa, 'Library', 'Application Support', 'Steam')];
  return [path.join(casa, '.steam', 'steam'), path.join(casa, '.local', 'share', 'Steam')];
}

// As bibliotecas (pastas com steamapps) listadas em libraryfolders.vdf. A
// pasta da própria Steam sempre entra (arquivo antigo, ausente ou estragado).
function bibliotecasSteam(pastaSteam, fsMod = fs) {
  const pastas = [pastaSteam];
  try {
    const vdf = lerVdf(fsMod.readFileSync(path.join(pastaSteam, 'steamapps', 'libraryfolders.vdf'), 'utf8'));
    const lista = vdf.libraryfolders || vdf.LibraryFolders || {};
    for (const [k, v] of Object.entries(lista)) {
      if (!/^\d+$/.test(k)) continue;
      const p = typeof v === 'string' ? v : v && v.path; // formato antigo: "1" "D:\\Jogos"
      if (p) pastas.push(path.normalize(p));
    }
  } catch { /* sem o arquivo: só a pasta da Steam */ }
  const vistos = new Set();
  return pastas.filter((p) => { const k = p.toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true; });
}

// Coisas da Steam que não são jogos (aparecem como "instaladas").
const NAO_JOGO = /^(Steamworks Common Redistributables|Steam Linux Runtime|Proton\b|Steam Audio|SteamVR\b)/i;

// Os jogos instalados: [{ appid, nome, pasta, completo, tamanho }]. `completo`
// = StateFlags com o bit 4 (instalado por inteiro, não baixando/atualizando).
function jogosInstalados(pastaSteam, fsMod = fs) {
  const r = new Map();
  for (const biblioteca of bibliotecasSteam(pastaSteam, fsMod)) {
    const apps = path.join(biblioteca, 'steamapps');
    let nomes;
    try { nomes = fsMod.readdirSync(apps); } catch { continue; }
    for (const n of nomes) {
      const m = /^appmanifest_(\d+)\.acf$/i.exec(n);
      if (!m) continue;
      let estado;
      try { estado = lerVdf(fsMod.readFileSync(path.join(apps, n), 'utf8')).AppState; } catch { continue; }
      const appid = appidValido((estado && estado.appid) || m[1]);
      if (!estado || !appid || r.has(appid)) continue;
      const nome = String(estado.name || '').trim();
      if (NAO_JOGO.test(nome)) continue;
      const flags = Number(estado.StateFlags) || 0;
      r.set(appid, {
        appid,
        nome,
        pasta: estado.installdir ? path.join(apps, 'common', estado.installdir) : '',
        completo: (flags & 4) === 4,
        tamanho: Number(estado.SizeOnDisk) || 0,
      });
    }
  }
  return [...r.values()];
}

// A Steam está nesta pasta? (tem steamapps)
function ehPastaSteam(pasta, fsMod = fs) {
  try { return Boolean(pasta) && fsMod.statSync(path.join(pasta, 'steamapps')).isDirectory(); } catch { return false; }
}

module.exports = {
  ErroSteam,
  appidValido, linkSteam, linkJogar, linkInstalar, linkLojaSteam, linkAbrir, linkLojaWeb, ehLinkSteam, acaoSteam, temApp,
  imagensSteam, imagensLoja, lerImagensLoja,
  buscarLoja, lerBuscaLoja, detalhesLoja, lerDetalhesLoja, resultadoDaLoja, itemDeLoja, ehJogoDaLoja,
  lerPerfil, resolverPerfil, jogosDaConta, lerJogosDaConta,
  lerVdf, pastaDoRegistro, pastasPadrao, bibliotecasSteam, jogosInstalados, ehPastaSteam,
};
