// HowLongToBeat no nandplay. O HLTB não tem API oficial (e a busca interna dele
// exige um token: não usamos). O id do jogo no HLTB vem do Wikidata (P2816),
// achado pelo item que tem o slug do IGDB (P5794) ou o appid da Steam (P1733):
// uma consulta SPARQL pequena. Com o id, o botão abre a página exata do jogo;
// sem ele, a busca do HLTB pelo título.

const WIKIDATA = 'https://query.wikidata.org/sparql';
const HLTB = 'https://howlongtobeat.com';

// Só o que pode entrar na consulta sem escapar nada: slug do IGDB (minúsculas,
// números e hífens) e appid numérico. O resto fica de fora (nada de injeção).
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
function slugValido(s) {
  const t = String(s || '').trim().toLowerCase();
  return SLUG.test(t) ? t : '';
}
function appidValido(x) {
  const t = String(x ?? '').trim();
  if (!/^[1-9]\d{0,9}$/.test(t)) return '';
  return Number(t) <= 0xFFFFFFFF ? t : '';
}
const idHltbValido = (x) => (/^[1-9]\d{0,8}$/.test(String(x ?? '').trim()) ? Number(String(x).trim()) : null);

// A consulta: o item com o slug do IGDB (preferido) ou com o appid da Steam, e o id do HLTB dele.
function consultaWikidata({ igdbSlug, steam } = {}) {
  const partes = [];
  const slug = slugValido(igdbSlug);
  const app = appidValido(steam);
  if (slug) partes.push(`{ ?item wdt:P5794 "${slug}" . BIND(1 AS ?ordem) }`);
  if (app) partes.push(`{ ?item wdt:P1733 "${app}" . BIND(2 AS ?ordem) }`);
  if (!partes.length) return '';
  return `SELECT ?hltb ?ordem WHERE { ${partes.join(' UNION ')} ?item wdt:P2816 ?hltb . } ORDER BY ?ordem LIMIT 5`;
}
const urlWikidata = (consulta) => `${WIKIDATA}?format=json&query=${encodeURIComponent(consulta)}`;

// A resposta do Wikidata → o id do HLTB (número) ou null. O primeiro válido (o do IGDB vem antes).
function lerRespostaWikidata(json) {
  const linhas = (json && json.results && json.results.bindings) || [];
  for (const l of linhas) {
    const id = idHltbValido(l && l.hltb && l.hltb.value);
    if (id) return id;
  }
  return null;
}

// Os links do botão "Ver no HowLongToBeat".
const linkHltb = (id) => { const n = idHltbValido(id); return n ? `${HLTB}/game/${n}` : null; };
const buscaHltb = (titulo) => `${HLTB}/?q=${encodeURIComponent(String(titulo || '').trim())}`;
const linkOuBuscaHltb = (jogo) => linkHltb(jogo && jogo.hltb) || buscaHltb(jogo && jogo.titulo);

// O id do HLTB do jogo (ou null). `cabecalhos`: o User-Agent no processo
// principal (o Wikidata pede um); no celular o navegador põe o dele.
async function acharHltb(jogo, { fetchFn = fetch, cabecalhos = {} } = {}) {
  const consulta = consultaWikidata(jogo || {});
  if (!consulta) return null;
  let r;
  try {
    r = await fetchFn(urlWikidata(consulta), { headers: { Accept: 'application/sparql-results+json', ...cabecalhos }, signal: AbortSignal.timeout(15000) });
  } catch {
    const e = new Error('Sem conexão com o Wikidata.');
    e.tipo = 'rede';
    throw e;
  }
  if (!r.ok) {
    const e = new Error(`O Wikidata respondeu com erro ${r.status}.`);
    e.tipo = 'rede';
    throw e;
  }
  return lerRespostaWikidata(await r.json().catch(() => null));
}

// Cache das respostas (um objeto { chave: { id, em } } guardado pelo chamador):
// o id achado vale 90 dias; "não tem", 14 (o Wikidata vai ganhando ids).
const chaveCacheHltb = ({ igdbSlug, steam } = {}) => `${slugValido(igdbSlug)}|${appidValido(steam)}`;
function doCacheHltb(cache, jogo, agora = Date.now()) {
  const c = cache && cache[chaveCacheHltb(jogo)];
  if (!c || !c.em) return undefined;
  const validade = (c.id ? 90 : 14) * 86400000;
  return agora - Date.parse(c.em) < validade ? (c.id || null) : undefined;
}

module.exports = { consultaWikidata, urlWikidata, lerRespostaWikidata, linkHltb, buscaHltb, linkOuBuscaHltb, acharHltb, chaveCacheHltb, doCacheHltb, idHltbValido };
