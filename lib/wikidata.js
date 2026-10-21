// Duração dos filmes pelo Wikidata (gratuito, sem chave e sem limite diário),
// procurando pelo código do IMDb. Usado para não depender da cota do OMDb.

const URL_SPARQL = 'https://query.wikidata.org/sparql';
const POR_CONSULTA = 120;

async function consultar(ids) {
  const q = `SELECT ?imdb (MAX(?d) AS ?dur) WHERE {
    VALUES ?imdb { ${ids.map((i) => `"${i}"`).join(' ')} }
    ?f wdt:P345 ?imdb ; wdt:P2047 ?d .
  } GROUP BY ?imdb`;
  const r = await fetch(`${URL_SPARQL}?format=json&query=${encodeURIComponent(q)}`, {
    headers: { 'User-Agent': 'FilmesLegais/1.0 (app pessoal de lista de filmes)', Accept: 'application/sparql-results+json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`Wikidata respondeu ${r.status}`);
  const j = await r.json();
  const duracoes = new Map();
  for (const b of j.results.bindings) {
    const min = Math.round(Number(b.dur && b.dur.value));
    if (min > 0) duracoes.set(b.imdb.value, min);
  }
  return duracoes;
}

// imdbIDs → Map(imdbID → minutos). Os que o Wikidata não conhece ficam de fora.
async function duracoes(imdbIDs) {
  const unicos = [...new Set(imdbIDs.filter((i) => /^tt\d+$/.test(i)))];
  const todas = new Map();
  for (let i = 0; i < unicos.length; i += POR_CONSULTA) {
    for (const [id, min] of await consultar(unicos.slice(i, i + POR_CONSULTA))) todas.set(id, min);
  }
  return todas;
}

module.exports = { duracoes };
