// A biblioteca do Stremio de uma conta, pela API que o próprio app do Stremio usa
// (api.strem.io). Entra com o e-mail e a senha, lê a biblioteca e sai: a senha não
// é guardada, e a sessão aberta para isso é encerrada no fim.
//
// Cada item da biblioteca: { _id: 'tt…', name, type: 'movie' | 'series', removed,
// temp, state: { timesWatched, flaggedWatched, lastWatched, … } }.
// - visto: assistido até o fim (timesWatched) ou marcado como visto (flaggedWatched);
// - watchlist: está na biblioteca (não removido) e ainda não foi visto.
// O item "temp" é só o que foi aberto sem adicionar à biblioteca: entra só se foi visto.

const API = 'https://api.strem.io/api';

async function chamar(metodo, corpo) {
  let r;
  try {
    r = await fetch(`${API}/${metodo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error('Sem conexão com o Stremio.');
  }
  const json = await r.json().catch(() => null);
  if (!json) throw new Error(`O Stremio respondeu com erro ${r.status}.`);
  if (json.error) {
    const e = json.error;
    if (e.wrongEmail) throw new Error('Não existe conta do Stremio com esse e-mail.');
    if (e.wrongPass) throw new Error('A senha do Stremio está errada.');
    throw new Error(e.message ? `Stremio: ${e.message}` : 'O Stremio recusou o pedido.');
  }
  return json.result;
}

async function biblioteca(email, senha) {
  const login = await chamar('login', { type: 'Login', email: String(email || '').trim(), password: String(senha || '') });
  const authKey = login && login.authKey;
  if (!authKey) throw new Error('Não deu para entrar no Stremio.');
  try {
    const itens = await chamar('datastoreGet', { authKey, collection: 'libraryItem', ids: [], all: true });
    return Array.isArray(itens) ? itens : [];
  } finally {
    chamar('logout', { authKey }).catch(() => {});
  }
}

const dia = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) || d.getFullYear() < 2000 ? '' : d.toISOString().slice(0, 10); };

// Itens da biblioteca → itens do importar.js (só filmes).
function converter(lista) {
  const itens = [];
  for (const x of lista) {
    if (!x || x.type !== 'movie' || !/^tt\d+$/.test(String(x._id || ''))) continue;
    const st = x.state || {};
    const visto = Number(st.timesWatched) > 0 || Number(st.flaggedWatched) > 0;
    const naBiblioteca = !x.removed && !x.temp;
    if (!visto && !naBiblioteca) continue;
    // A data em que viu, só quando o Stremio contou uma sessão assistida até o fim.
    const data = Number(st.timesWatched) > 0 ? dia(st.lastWatched) : '';
    const ano = (String(x.year || x.releaseInfo || '').match(/\d{4}/) || [''])[0];
    itens.push({ titulo: x.name || x._id, ano, imdbID: x._id, tmdbId: '', datas: data ? [data] : [], visto, nota: 0, watchlist: !visto });
  }
  return itens;
}

module.exports = { biblioteca, converter };
