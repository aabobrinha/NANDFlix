// node scripts/testar-jogos.js: confere o nandplay (lib/igdb.js e lib/steam.js)
// sem internet: o IGDB, a Twitch e a Steam são simulados com respostas gravadas
// em scripts/fixtures-jogos/ (sem chave nenhuma nelas).
const assert = require('assert');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const igdbLib = require('../lib/igdb');
const steam = require('../lib/steam');

const { Igdb } = igdbLib;
const FIX = path.join(__dirname, 'fixtures-jogos');
const fixture = (nome) => JSON.parse(fs.readFileSync(path.join(FIX, nome), 'utf8'));

// Uma resposta de fetch de mentira.
const resposta = (status, corpo) => ({ status, ok: status >= 200 && status < 300, json: async () => corpo });

// Um fetch falso que anota os pedidos e responde pela função `rota`.
function fetchFalso(rota) {
  const pedidos = [];
  const f = async (url, opcoes = {}) => {
    pedidos.push({ url: String(url), metodo: opcoes.method || 'GET', headers: opcoes.headers || {}, corpo: opcoes.body });
    return rota(String(url), opcoes, pedidos.length);
  };
  f.pedidos = pedidos;
  return f;
}

// Um cliente IGDB com token já guardado (válido) e sem fila de espera.
function cliente(rota, { token = { clientId: 'id-teste', token: 'tok-1', expiraEm: Date.now() + 30 * 86400000 }, agora } = {}) {
  let guardado = token;
  const fetch = fetchFalso(rota);
  const c = new Igdb({
    credenciais: () => ({ clientId: 'id-teste', clientSecret: 'segredo-teste' }),
    lerToken: () => guardado,
    gravarToken: (d) => { guardado = d; },
    fetch,
    intervalo: 0,
    ...(agora ? { agora } : {}),
  });
  return { c, fetch, guardado: () => guardado };
}

// ---------- VDF ----------

test('VDF: lê chaves, valores e blocos aninhados', () => {
  const v = steam.lerVdf('"AppState"\n{\n\t"appid"\t\t"6200"\n\t"name"\t\t"Ghost Master"\n\t"Depots"\n\t{\n\t\t"6201"\n\t\t{\n\t\t\t"size"\t"10"\n\t\t}\n\t}\n}\n');
  assert.deepStrictEqual(v, { AppState: { appid: '6200', name: 'Ghost Master', Depots: { 6201: { size: '10' } } } });
});
test('VDF: escapes, comentários, chaves sem aspas e BOM', () => {
  const v = steam.lerVdf('\uFEFF// comentário\n"libraryfolders" {\n "0" { "path" "C:\\\\Jogos\\\\Steam" // outro\n  label "com \\"aspas\\"" }\n}');
  assert.strictEqual(v.libraryfolders['0'].path, 'C:\\Jogos\\Steam');
  assert.strictEqual(v.libraryfolders['0'].label, 'com "aspas"');
});
test('VDF: arquivo cortado ou estragado não quebra', () => {
  assert.deepStrictEqual(steam.lerVdf('"A"\n{\n\t"b"\t"1"\n\t"c"\n\t{\n'), { A: { b: '1', c: {} } });
  assert.deepStrictEqual(steam.lerVdf(''), {});
  assert.doesNotThrow(() => steam.lerVdf('}}} "x" {{ "'));
  assert.doesNotThrow(() => steam.lerVdf(null));
});
test('registro: acha a pasta da Steam na saída do reg query', () => {
  const saida = '\r\nHKEY_CURRENT_USER\\Software\\Valve\\Steam\r\n    SteamPath    REG_SZ    c:/program files (x86)/steam\r\n\r\n';
  assert.strictEqual(steam.pastaDoRegistro(saida), path.normalize('c:/program files (x86)/steam'));
  assert.strictEqual(steam.pastaDoRegistro('ERRO: chave não encontrada'), '');
});

test('pastas da Steam: bibliotecas do libraryfolders.vdf e jogos instalados (StateFlags 4)', () => {
  // Copia o exemplo para uma pasta temporária e põe os caminhos de verdade no .vdf.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nandplay-'));
  try {
    fs.cpSync(path.join(FIX, 'steam-pc'), tmp, { recursive: true });
    const arq = path.join(tmp, 'steamapps', 'libraryfolders.vdf');
    const esc = (p) => p.replace(/\\/g, '\\\\');
    fs.writeFileSync(arq, fs.readFileSync(arq, 'utf8').replace('PASTA_STEAM', esc(tmp)).replace('PASTA_OUTRA', esc(path.join(tmp, 'outra'))));
    assert.deepStrictEqual(steam.bibliotecasSteam(tmp), [tmp, path.join(tmp, 'outra')]);
    const jogos = steam.jogosInstalados(tmp).sort((a, b) => a.appid - b.appid);
    // A redistribuível da Steam não é jogo; o manifesto estragado é ignorado.
    assert.deepStrictEqual(jogos.map((j) => [j.appid, j.nome, j.completo]), [[292030, 'The Witcher 3: Wild Hunt', false], [367520, 'Hollow Knight', true]]);
    assert.strictEqual(jogos[1].pasta, path.join(tmp, 'steamapps', 'common', 'Hollow Knight'));
    assert.ok(steam.ehPastaSteam(tmp));
    assert.ok(!steam.ehPastaSteam(path.join(tmp, 'nao-existe')));
    // Sem o libraryfolders.vdf: só a pasta da própria Steam.
    fs.unlinkSync(arq);
    assert.deepStrictEqual(steam.jogosInstalados(tmp).map((j) => j.appid), [367520]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------- appid e links ----------

test('appid: aceita só inteiro positivo (número ou texto de dígitos)', () => {
  assert.strictEqual(steam.appidValido(367520), 367520);
  assert.strictEqual(steam.appidValido('367520'), 367520);
  for (const ruim of ['1;calc', '1 && calc', '-5', -5, 0, '0', '012', 'abc', '12abc', '1.5', 1.5, ' 12', '12\n', '', null, undefined, NaN, Infinity, '99999999999', 2 ** 40, {}, [], ['1']]) {
    assert.strictEqual(steam.appidValido(ruim), null, `deveria recusar ${JSON.stringify(ruim)}`);
  }
});
test('links: montados só a partir do appid validado', () => {
  assert.strictEqual(steam.linkJogar(367520), 'steam://rungameid/367520');
  assert.strictEqual(steam.linkInstalar('367520'), 'steam://install/367520');
  assert.strictEqual(steam.linkLojaSteam(367520), 'steam://store/367520');
  assert.strictEqual(steam.linkAbrir(367520), 'steam://run/367520');
  assert.strictEqual(steam.linkLojaWeb(367520), 'https://store.steampowered.com/app/367520/');
  assert.strictEqual(steam.linkSteam('jogar', '1;calc'), null);
  assert.strictEqual(steam.linkSteam('jogar', -1), null);
  assert.strictEqual(steam.linkSteam('apagar', 367520), null);
  assert.strictEqual(steam.linkSteam('constructor', 367520), null);
  assert.strictEqual(steam.linkSteam('__proto__', 367520), null);
});
test('links: o processo principal só deixa passar o steam:// que nós montamos', () => {
  for (const ok of ['steam://rungameid/367520', 'steam://install/1', 'steam://store/6200', 'steam://run/292030']) assert.ok(steam.ehLinkSteam(ok), ok);
  for (const ruim of ['steam://rungameid/1;calc', 'steam://rungameid/-1', 'steam://open/console', 'steam://rungameid/012', 'steam://rungameid/1 -x', 'steam://flushconfig', 'steam://rungameid/1/../../x', 'STEAM://run/1', 'https://store.steampowered.com/app/1/', '', null]) {
    assert.ok(!steam.ehLinkSteam(ruim), String(ruim));
  }
});

test('acaoSteam: todas as combinações', () => {
  const id = 367520;
  const inst = [367520];
  const bib = new Set([367520, 292030]);
  const casos = [
    // [opções, ação, url]
    [{ steamNoPc: true, instalados: inst, biblioteca: bib }, 'jogar', 'steam://rungameid/367520'],
    [{ steamNoPc: true, instalados: inst, biblioteca: null }, 'jogar', 'steam://rungameid/367520'],
    [{ steamNoPc: true, instalados: [], biblioteca: bib }, 'instalar', 'steam://install/367520'],
    [{ steamNoPc: true, instalados: [], biblioteca: new Set([1]) }, 'loja', 'steam://store/367520'],
    [{ steamNoPc: true, instalados: [], biblioteca: [] }, 'loja', 'steam://store/367520'],
    [{ steamNoPc: true, instalados: [], biblioteca: null }, 'abrir', 'steam://run/367520'],
    [{ steamNoPc: true }, 'abrir', 'steam://run/367520'],
    [{ steamNoPc: false, instalados: inst, biblioteca: bib }, 'loja', 'https://store.steampowered.com/app/367520/'],
    [{ steamNoPc: false }, 'loja', 'https://store.steampowered.com/app/367520/'],
    [{ celular: true, steamNoPc: true, instalados: inst, biblioteca: bib }, 'loja', 'https://store.steampowered.com/app/367520/'],
    [{ celular: true }, 'loja', 'https://store.steampowered.com/app/367520/'],
    [undefined, 'loja', 'https://store.steampowered.com/app/367520/'],
  ];
  for (const [opcoes, acao, url] of casos) assert.deepStrictEqual(steam.acaoSteam(id, opcoes), { acao, url }, JSON.stringify(opcoes));
  // Coleções em outros formatos (lista de objetos, texto, Map, objeto).
  assert.strictEqual(steam.acaoSteam('367520', { steamNoPc: true, instalados: [{ appid: 367520 }] }).acao, 'jogar');
  assert.strictEqual(steam.acaoSteam(id, { steamNoPc: true, instalados: ['367520'] }).acao, 'jogar');
  assert.strictEqual(steam.acaoSteam(id, { steamNoPc: true, biblioteca: new Map([[367520, {}]]) }).acao, 'instalar');
  assert.strictEqual(steam.acaoSteam(id, { steamNoPc: true, biblioteca: { 367520: 10 } }).acao, 'instalar');
  // appid inválido: nenhuma ação.
  assert.strictEqual(steam.acaoSteam('1;calc', { steamNoPc: true }), null);
  assert.strictEqual(steam.acaoSteam(-3), null);
  assert.strictEqual(steam.acaoSteam('Hollow Knight'), null);
});

// ---------- Steam: loja, imagens e Web API ----------

test('loja: busca e appdetails (pt-BR, reais)', async () => {
  const busca = steam.lerBuscaLoja(fixture('steam-busca.json'));
  assert.strictEqual(busca[0].appid, 367520);
  assert.strictEqual(busca[0].nome, 'Hollow Knight');
  assert.strictEqual(typeof busca[0].preco, 'number');
  const d = steam.lerDetalhesLoja(fixture('steam-appdetails-367520.json'), 367520);
  assert.deepStrictEqual([d.appid, d.nome, d.desenvolvedores, d.publicadoras], [367520, 'Hollow Knight', ['Team Cherry'], ['Team Cherry']]);
  assert.ok(d.preco.texto.startsWith('R$'));
  assert.ok(d.generos.includes('Aventura'));
  assert.strictEqual(steam.lerDetalhesLoja({ 1: { success: false } }, 1), null);
  // Os pedidos levam cc=BR e l=portuguese, e o termo vai codificado.
  const f = fetchFalso(() => resposta(200, fixture('steam-busca.json')));
  await steam.buscarLoja('hollow & knight', { fetchFn: f });
  assert.match(f.pedidos[0].url, /storesearch\/\?term=hollow%20%26%20knight&cc=BR&l=portuguese$/);
  assert.strictEqual(await steam.detalhesLoja('1;calc', { fetchFn: f }), null);
  assert.strictEqual(f.pedidos.length, 1);
});
test('imagens: caminho simples e o da loja (com o código no caminho)', () => {
  assert.deepStrictEqual(steam.imagensSteam(367520), {
    capa: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/367520/library_600x900.jpg',
    fundo: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/367520/library_hero.jpg',
    logo: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/367520/logo.png',
    cabecalho: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/367520/header.jpg',
  });
  assert.strictEqual(steam.imagensSteam('x'), null);
  const r = steam.lerImagensLoja(fixture('steam-itens.json'));
  assert.match(r[3527290].capa, /^https:\/\/shared\.akamai\.steamstatic\.com\/store_item_assets\/steam\/apps\/3527290\/[0-9a-f]{40}\/library_600x900_2x\.jpg\?t=\d+$/);
  assert.match(r[3527290].fundo, /\/[0-9a-f]{40}\/library_hero_2x\.jpg/);
});
test('Web API: perfil por número, link ou nome (vanity)', async () => {
  assert.deepStrictEqual(steam.lerPerfil('76561197960287930'), { steamid: '76561197960287930' });
  assert.deepStrictEqual(steam.lerPerfil('https://steamcommunity.com/profiles/76561197960287930/'), { steamid: '76561197960287930' });
  assert.deepStrictEqual(steam.lerPerfil('https://steamcommunity.com/id/gabelogannewell'), { vanity: 'gabelogannewell' });
  assert.deepStrictEqual(steam.lerPerfil('gabelogannewell'), { vanity: 'gabelogannewell' });
  assert.ok(steam.lerPerfil('isso não é perfil').invalido);
  assert.ok(steam.lerPerfil('https://steamcommunity.com/profiles/123').invalido);
  const f = fetchFalso((url) => resposta(200, fixture(url.includes('ResolveVanityURL') ? 'steam-vanity.json' : 'steam-donos.json')));
  assert.strictEqual(await steam.resolverPerfil('CHAVE', '76561197960287930', { fetchFn: f }), '76561197960287930');
  assert.strictEqual(f.pedidos.length, 0); // número: não pergunta nada
  const r = await steam.jogosDaConta('CHAVE', 'https://steamcommunity.com/id/gabelogannewell/', { fetchFn: f });
  assert.strictEqual(r.steamid, '76561197960287930');
  assert.match(f.pedidos[0].url, /ResolveVanityURL\/v1\/\?key=CHAVE&vanityurl=gabelogannewell$/);
  assert.match(f.pedidos[1].url, /GetOwnedGames\/v1\/\?key=CHAVE&steamid=76561197960287930&include_appinfo=1&include_played_free_games=1/);
  assert.deepStrictEqual(r.jogos[0], { appid: 367520, nome: 'Hollow Knight', minutos: 2710, minutos2Semanas: 30, ultimaVez: new Date(1762300000 * 1000).toISOString() });
  assert.strictEqual(r.jogos[2].ultimaVez, '');
});
test('Web API: perfil privado, nome que não existe, chave errada e sem chave', async () => {
  await assert.rejects(steam.jogosDaConta('CHAVE', '76561197960287930', { fetchFn: fetchFalso(() => resposta(200, fixture('steam-donos-privado.json'))) }), { tipo: 'privado' });
  await assert.rejects(steam.resolverPerfil('CHAVE', 'ninguem', { fetchFn: fetchFalso(() => resposta(200, fixture('steam-vanity-nao.json'))) }), { tipo: 'perfil' });
  await assert.rejects(steam.jogosDaConta('ERRADA', '76561197960287930', { fetchFn: fetchFalso(() => resposta(403, {})) }), { tipo: 'chave' });
  await assert.rejects(steam.jogosDaConta('', '76561197960287930'), { tipo: 'chave' });
  await assert.rejects(steam.jogosDaConta('x', '', { fetchFn: fetchFalso(() => resposta(200, {})) }), { tipo: 'perfil' });
});

// ---------- IGDB: pedidos ----------

test('IGDB: montagem dos pedidos (Apicalypse)', () => {
  const b = igdbLib.corpoBusca('Hollow "Knight" \\ x\n2');
  assert.ok(b.startsWith('search "Hollow \\"Knight\\" \\\\ x 2"; fields '), b);
  assert.match(b, /where version_parent = null; limit 20;$/);
  for (const campo of ['cover.image_id', 'platforms.abbreviation', 'external_games.uid', 'external_games.external_game_source', 'external_games.category']) assert.ok(b.includes(campo), campo);
  const d = igdbLib.corpoDetalhes('14593');
  assert.match(d, /where id = 14593; limit 1;$/);
  for (const campo of ['involved_companies.developer', 'involved_companies.publisher', 'involved_companies.company.name', 'videos.video_id', 'websites.url', 'artworks.image_id', 'summary']) assert.ok(d.includes(campo), campo);
  assert.throws(() => igdbLib.corpoDetalhes('1; fields *'));
  assert.throws(() => igdbLib.corpoEmpresa(-1));
  assert.strictEqual(igdbLib.corpoTempo(14593), 'fields hastily,normally,completely,count; where game_id = 14593; limit 1;');
  assert.match(igdbLib.corpoJogosPorIds([1, '2', 'x', 3]), /where id = \(1,2,3\); limit 3;$/);
  // Sem os campos "category" antigos (se o IGDB recusar), o resto fica igual.
  const sem = igdbLib.semCamposAntigos(d);
  assert.ok(!/(^|[,.\s])category[,;]/.test(sem), sem);
  assert.ok(sem.includes('websites.type') && sem.includes('external_games.external_game_source') && sem.includes('game_type'));
});

test('IGDB: busca com cabeçalhos certos e resultado leve', async () => {
  const { c, fetch } = cliente(() => resposta(200, fixture('igdb-busca.json')));
  const r = await c.buscarJogos('hollow knight');
  const p = fetch.pedidos[0];
  assert.strictEqual(p.url, 'https://api.igdb.com/v4/games');
  assert.strictEqual(p.metodo, 'POST');
  assert.strictEqual(p.headers['Client-ID'], 'id-teste');
  assert.strictEqual(p.headers.Authorization, 'Bearer tok-1');
  assert.ok(p.corpo.startsWith('search "hollow knight";'));
  assert.deepStrictEqual(r[0], {
    igdb: 14593, igdbSlug: 'hollow-knight', titulo: 'Hollow Knight', ano: '2017',
    capa: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1rgi.jpg',
    plataformas: ['PC', 'Switch', 'PS4'], steam: 367520,
  });
  assert.strictEqual(r[1].steam, 1030300); // formato antigo (category)
  assert.strictEqual(r[2].steam, null);
  assert.deepStrictEqual(await c.buscarJogos('   '), []);
  assert.strictEqual(fetch.pedidos.length, 1);
});

test('IGDB: detalhes (desenvolvedor separado da publicadora, Steam, lojas, trailer, tempo)', async () => {
  const { c, fetch } = cliente((url) => resposta(200, fixture(url.endsWith('/game_time_to_beats') ? 'igdb-tempo.json' : 'igdb-detalhes-novo.json')));
  const d = await c.detalhesJogo(14593);
  assert.deepStrictEqual(fetch.pedidos.map((p) => p.url.split('/').pop()), ['games', 'game_time_to_beats']);
  assert.strictEqual(d.tipo, 'jogo');
  assert.deepStrictEqual(d.desenvolvedores, [{ id: 9091, nome: 'Team Cherry' }]);
  assert.deepStrictEqual(d.publicadoras, [{ id: 9091, nome: 'Team Cherry' }, { id: 70, nome: 'Fangamer' }]);
  assert.strictEqual(d.steam, 367520);
  assert.deepStrictEqual(d.plataformasJogo[1], { id: 130, nome: 'Nintendo Switch', abrev: 'Switch' });
  assert.deepStrictEqual(d.lojas.map((l) => l.loja), ['steam', 'gog', 'nintendo']);
  assert.strictEqual(d.lojas[0].url, 'https://store.steampowered.com/app/367520/');
  assert.strictEqual(d.site, 'https://hollowknight.com');
  assert.strictEqual(d.trailer, 'pFAknD_AHXs'); // o "Launch Trailer", não o primeiro vídeo
  assert.strictEqual(d.fundo, 'https://images.igdb.com/igdb/image/upload/t_1080p/ar5xy.jpg');
  assert.deepStrictEqual(d.generos, ['Platform', 'Adventure', 'Action']);
  assert.deepStrictEqual([d.tempoZerar, d.tempoZerarRapido, d.tempoZerarCompleto], [40.5, 27, 62]);
  assert.strictEqual(d.ano, '2017');
  assert.strictEqual(d.sinopse, 'Forge your own path in Hollow Knight!');
  for (const campo of ['igdb', 'igdbSlug', 'steam', 'titulo', 'ano', 'capa', 'fundo', 'logo', 'sinopse', 'generos', 'plataformasJogo', 'desenvolvedores', 'publicadoras', 'lojas', 'tempoZerar', 'trailer']) assert.ok(campo in d, campo);
});

test('IGDB: detalhes no formato antigo (category) e sem tempo para zerar', async () => {
  const { c } = cliente((url) => (url.endsWith('/game_time_to_beats') ? resposta(200, []) : resposta(200, fixture('igdb-detalhes-antigo.json'))));
  const d = await c.detalhesJogo(1942);
  assert.strictEqual(d.steam, 292030); // pula o external_game de outra fonte (category 5)
  assert.deepStrictEqual(d.desenvolvedores.map((x) => x.nome), ['CD Projekt RED']);
  assert.deepStrictEqual(d.publicadoras.map((x) => x.nome), ['CD Projekt', 'Bandai Namco']);
  assert.deepStrictEqual(d.lojas.map((l) => l.loja), ['steam', 'gog']);
  assert.strictEqual(d.site, 'https://thewitcher.com');
  assert.strictEqual(d.sinopse, 'Geralt procura Ciri.');
  assert.strictEqual(d.tempoZerar, null);
  assert.strictEqual(d.trailer, '');
  // O endpoint de tempo falhando (não existe mais, por exemplo) não derruba os detalhes.
  const { c: c2 } = cliente((url) => (url.endsWith('/game_time_to_beats') ? resposta(404, null) : resposta(200, fixture('igdb-detalhes-antigo.json'))));
  assert.strictEqual((await c2.detalhesJogo(1942)).titulo, 'The Witcher 3: Wild Hunt');
  // Jogo que não existe.
  const { c: c3 } = cliente(() => resposta(200, []));
  assert.strictEqual(await c3.detalhesJogo(1), null);
});

test('IGDB: appid da Steam pelos dois formatos de external_games (e pelo site)', () => {
  assert.strictEqual(igdbLib.appidSteam({ external_games: [{ uid: '367520', external_game_source: 1 }] }), 367520);
  assert.strictEqual(igdbLib.appidSteam({ external_games: [{ uid: '367520', external_game_source: { id: 1 } }] }), 367520);
  assert.strictEqual(igdbLib.appidSteam({ external_games: [{ uid: '292030', category: 1 }] }), 292030);
  assert.strictEqual(igdbLib.appidSteam({ external_games: [{ uid: '292030', category: 5 }] }), null);
  assert.strictEqual(igdbLib.appidSteam({ external_games: [{ uid: 'abc', external_game_source: 1 }] }), null);
  assert.strictEqual(igdbLib.appidSteam({ external_games: [{ uid: 'x', url: 'https://store.steampowered.com/app/620980/Beat_Saber/' }] }), 620980);
  assert.strictEqual(igdbLib.appidSteam({ websites: [{ url: 'https://store.steampowered.com/app/6200' }] }), 6200);
  assert.strictEqual(igdbLib.appidSteam({}), null);
});

test('IGDB: "Mais do desenvolvedor" só com jogos principais, mais relevantes primeiro', async () => {
  const { c, fetch } = cliente((url) => resposta(200, fixture(url.endsWith('/companies') ? 'igdb-empresa.json' : 'igdb-jogos-empresa.json')));
  const r = await c.jogosDoDesenvolvedor(9091, { excluir: 14593 });
  assert.match(fetch.pedidos[0].corpo, /fields name,developed; where id = 9091;/);
  assert.match(fetch.pedidos[1].corpo, /where id = \(115289,5000,5001,5002\);/); // sem o jogo aberto
  assert.deepStrictEqual(r.empresa, { id: 9091, nome: 'Team Cherry' });
  // Sem a DLC (game_type 1) e sem a edição (version_parent); o antigo (category 0) entra.
  assert.deepStrictEqual(r.jogos.map((j) => j.titulo), ['Hollow Knight: Silksong', 'Jogo antigo sem game_type', 'Hungry Knight']);
  assert.strictEqual(r.jogos[0].steam, 1030300);
});

// ---------- IGDB: token ----------

test('token: sem chaves e chaves inválidas dão mensagens claras', async () => {
  const sem = new Igdb({ credenciais: () => ({ clientId: '', clientSecret: '' }), fetch: async () => { throw new Error('não deveria pedir'); } });
  await assert.rejects(sem.buscarJogos('x'), (e) => e.tipo === 'chave' && e.message === igdbLib.SEM_CHAVES);
  const { c } = cliente(() => resposta(403, { message: 'invalid client secret' }), { token: null });
  await assert.rejects(c.buscarJogos('x'), (e) => e.tipo === 'chave' && e.message === igdbLib.CHAVES_INVALIDAS);
  const { c: c2 } = cliente(() => resposta(400, { message: 'invalid client' }), { token: null });
  await assert.rejects(c2.testar(), { tipo: 'chave' });
  const { c: c3 } = cliente(() => { throw new Error('offline'); }, { token: null });
  await assert.rejects(c3.buscarJogos('x'), { tipo: 'rede' });
});

test('token: pedido com client credentials e guardado com a validade', async () => {
  const agora = 1_800_000_000_000;
  const { c, fetch, guardado } = cliente((url) => (url.startsWith('https://id.twitch.tv/')
    ? resposta(200, { access_token: 'novo', expires_in: 5000000, token_type: 'bearer' })
    : resposta(200, [])), { token: null, agora: () => agora });
  await c.buscarJogos('x');
  const t = fetch.pedidos[0];
  assert.strictEqual(t.metodo, 'POST');
  const u = new URL(t.url);
  assert.strictEqual(u.origin + u.pathname, 'https://id.twitch.tv/oauth2/token');
  assert.deepStrictEqual([u.searchParams.get('client_id'), u.searchParams.get('client_secret'), u.searchParams.get('grant_type')], ['id-teste', 'segredo-teste', 'client_credentials']);
  assert.deepStrictEqual(guardado(), { clientId: 'id-teste', token: 'novo', expiraEm: agora + 5000000 * 1000 });
  assert.strictEqual(fetch.pedidos[1].headers.Authorization, 'Bearer novo');
  // O próximo pedido usa o guardado, sem pedir outro token.
  await c.buscarJogos('y');
  assert.strictEqual(fetch.pedidos.filter((p) => p.url.includes('twitch')).length, 1);
});

test('token vencido (ou de outro Client ID) → renova antes de pedir', async () => {
  const agora = 1_800_000_000_000;
  for (const velho of [
    { clientId: 'id-teste', token: 'velho', expiraEm: agora - 1000 },
    { clientId: 'id-teste', token: 'velho', expiraEm: agora + 60 * 1000 }, // vence em 1 minuto: já renova
    { clientId: 'outro-id', token: 'velho', expiraEm: agora + 30 * 86400000 },
  ]) {
    const { c, fetch, guardado } = cliente((url) => (url.includes('twitch') ? resposta(200, { access_token: 'novo', expires_in: 100000 }) : resposta(200, [])), { token: velho, agora: () => agora });
    await c.buscarJogos('x');
    assert.strictEqual(fetch.pedidos[0].url.includes('twitch'), true);
    assert.strictEqual(fetch.pedidos[1].headers.Authorization, 'Bearer novo');
    assert.strictEqual(guardado().token, 'novo');
  }
});

test('token recusado pelo IGDB (401) → renova uma vez e repete o pedido', async () => {
  const { c, fetch, guardado } = cliente((url, opcoes) => {
    if (url.includes('twitch')) return resposta(200, { access_token: 'renovado', expires_in: 100000 });
    return opcoes.headers.Authorization === 'Bearer renovado' ? resposta(200, fixture('igdb-busca.json')) : resposta(401, { message: 'Authorization Failure' });
  });
  const r = await c.buscarJogos('hollow');
  assert.strictEqual(r.length, 3);
  assert.deepStrictEqual(fetch.pedidos.map((p) => (p.url.includes('twitch') ? 'token' : p.headers.Authorization)), ['Bearer tok-1', 'token', 'Bearer renovado']);
  assert.strictEqual(guardado().token, 'renovado');
  // Se nem o token novo serve, as chaves estão erradas (sem ficar em laço).
  const { c: c2, fetch: f2 } = cliente((url) => (url.includes('twitch') ? resposta(200, { access_token: 'outro', expires_in: 100000 }) : resposta(401, {})));
  await assert.rejects(c2.buscarJogos('x'), { tipo: 'chave' });
  assert.strictEqual(f2.pedidos.length, 3);
});

test('IGDB: campo antigo recusado (400) → repete sem os "category"', async () => {
  const { c, fetch } = cliente((url, opcoes) => (/(^|[,.\s])category[,;]/.test(opcoes.body) ? resposta(400, [{ title: 'Invalid Field' }]) : resposta(200, fixture('igdb-busca.json'))));
  assert.strictEqual((await c.buscarJogos('hollow')).length, 3);
  assert.strictEqual(fetch.pedidos.length, 2);
});

test('fila: no máximo ~4 pedidos por segundo', async () => {
  const momentos = [];
  const c = new Igdb({
    credenciais: () => ({ clientId: 'id', clientSecret: 's' }),
    lerToken: () => ({ clientId: 'id', token: 't', expiraEm: Date.now() + 86400000 * 30 }),
    fetch: async () => { momentos.push(Date.now()); return resposta(200, []); },
  });
  await Promise.all([1, 2, 3, 4, 5, 6].map((i) => c.buscarJogos(`j${i}`)));
  // Quaisquer 5 pedidos seguidos ocupam pelo menos ~1 segundo.
  assert.ok(momentos[4] - momentos[0] >= 1000 - 30, `5 pedidos em ${momentos[4] - momentos[0]} ms`);
});

// ---------- Lote 3: o jogo na lista (lib/filmes.js) e a busca sem as chaves da IGDB (lib/steam.js) ----------

const filmesLib = require('../lib/filmes');

test('novoJogo: só o contrato, status "quero", sem tags; capa e trailer também nos campos que a lista lê', () => {
  const j = filmesLib.novoJogo({ igdb: 1942, steam: 367520, titulo: ' Hollow Knight ', ano: 2017, capa: 'https://x/capa.jpg', trailer: 'abcdefghijk', tempoZerar: 27, lixo: 'x', status: 'invalido', tags: ['ferias', ''] }, 7);
  assert.strictEqual(j.tipo, 'jogo');
  assert.strictEqual(j.titulo, 'Hollow Knight');
  assert.strictEqual(j.ano, '2017');
  assert.strictEqual(j.status, 'quero');
  assert.deepStrictEqual(j.tags, ['ferias']);
  assert.strictEqual(j.poster, 'https://x/capa.jpg');
  assert.strictEqual(j.trailerId, 'abcdefghijk');
  assert.strictEqual(j.ordem, 7);
  assert.strictEqual(j.lixo, undefined);
  assert.ok(j.id);
});

test('mesmoFilme: jogo só repete com jogo (IGDB, Steam ou título e ano); filme de mesmo nome é outro item', () => {
  const a = filmesLib.novoJogo({ igdb: 1, steam: 10, titulo: 'Portal', ano: '2007' });
  assert.ok(filmesLib.mesmoFilme(a, filmesLib.novoJogo({ igdb: 1, titulo: 'Outro nome' })));
  assert.ok(filmesLib.mesmoFilme(a, filmesLib.novoJogo({ steam: '10', titulo: 'x' })));
  assert.ok(filmesLib.mesmoFilme(a, filmesLib.novoJogo({ titulo: 'portal', ano: '2007' })));
  assert.ok(!filmesLib.mesmoFilme(a, filmesLib.novoJogo({ igdb: 2, steam: 11, titulo: 'Portal 2', ano: '2011' })));
  assert.ok(!filmesLib.mesmoFilme(a, { titulo: 'Portal', ano: '2007', tmdbId: 5 }));
});

test('busca da loja da Steam → resultado no formato da IGDB; trilhas sonoras ficam de fora', () => {
  const itens = steam.lerBuscaLoja({ items: [
    { type: 'app', id: 367520, name: 'Hollow Knight', tiny_image: 'https://x/h.jpg', platforms: { windows: true, mac: true, linux: false } },
    { type: 'app', id: 1, name: 'Hollow Knight Original Soundtrack' },
    { type: 'sub', id: 2, name: 'Pacote' },
  ] }).filter(steam.ehJogoDaLoja).map(steam.resultadoDaLoja);
  assert.strictEqual(itens.length, 1);
  assert.deepStrictEqual({ igdb: itens[0].igdb, steam: itens[0].steam, plataformas: itens[0].plataformas }, { igdb: null, steam: 367520, plataformas: ['PC', 'Mac'] });
  assert.ok(/library_600x900/.test(itens[0].capa));
  assert.strictEqual(itens[0].capaAlternativa, 'https://x/h.jpg');
});

test('detalhes da loja da Steam → item de jogo do contrato (sem IGDB)', () => {
  const det = steam.lerDetalhesLoja({ 620: { success: true, data: { steam_appid: 620, type: 'game', name: 'Portal 2', short_description: 'Puzzle <b>co-op</b>', developers: ['Valve'], publishers: ['Valve'], genres: [{ description: 'Ação' }], release_date: { coming_soon: false, date: '19 de abr. de 2011' }, platforms: { windows: true, mac: false, linux: true }, header_image: 'https://x/cab.jpg', website: '' } } }, 620);
  const item = steam.itemDeLoja(det, null);
  assert.strictEqual(item.tipo, 'jogo');
  assert.strictEqual(item.steam, 620);
  assert.strictEqual(item.ano, '2011');
  assert.deepStrictEqual(item.desenvolvedores, [{ id: null, nome: 'Valve' }]);
  assert.deepStrictEqual(item.plataformasJogo.map((p) => p.abrev), ['PC', 'Linux']);
  assert.ok(/library_600x900/.test(item.capa) && /logo\.png/.test(item.logo));
  assert.strictEqual(steam.itemDeLoja(null), null);
});
