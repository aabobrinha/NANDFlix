// Prêmios de cinema (por enquanto o Oscar): os indicados e vencedores de cada
// cerimônia, lidos da página da cerimônia na Wikipédia em inglês ("98th Academy
// Awards"). A Academia não tem API; a Wikipédia é atualizada minutos depois do
// anúncio dos indicados e dos vencedores, sempre no mesmo formato:
//
//   {{Award category|#cor|[[Academy Award for Best Picture|Best Picture]]}}
//   * '''''[[Filme vencedor]]'' – produtores ‡'''
//   ** ''[[Outro indicado]]'' – produtores
//
// (`*` é o vencedor quando a categoria tem `**`; antes da cerimônia, todos os
// indicados ficam no mesmo nível.) Cada filme vira o código do IMDb e o id do
// TMDB pelo Wikidata, para achar o filme na lista da pessoa.
//
// O histórico vem pronto em lib/premios-oscar.json (scripts/premios.js); o app
// busca de novo só as cerimônias recentes (ver `paraAtualizar`).

const AGENTE = 'NANDFlix/1.0 (https://github.com/aabobrinha/NANDFlix)';
const cabecalhos = () => ({ 'Api-User-Agent': AGENTE, ...(typeof window === 'undefined' ? { 'User-Agent': AGENTE } : {}) });

// ---------- Os prêmios ----------

const ordinal = (n) => {
  const r = n % 100;
  if (r >= 11 && r <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
};

const PREMIOS = {
  oscar: {
    id: 'oscar',
    nome: 'Oscar',
    // A 1ª cerimônia foi em 1929; desde então, uma por ano (a de 2026 foi a 98ª).
    pagina: (n) => `${ordinal(n)}_Academy_Awards`,
    anoDaCerimonia: (n) => 1928 + n,
    numeroDoAno: (ano) => ano - 1928,
    prefixoCategoria: 'Academy Award for ',
    // Indicados saem no fim de janeiro; a cerimônia é em março.
    temporada: (data) => data.getUTCMonth() <= 2,
  },
};

// As categorias em português (pela página da categoria na Wikipédia, que não
// muda quando o nome oficial muda). As que não estão aqui ficam em inglês.
const CATEGORIAS_PT = {
  'Best Picture': 'Melhor Filme',
  'Best Director': 'Melhor Direção',
  'Best Actor': 'Melhor Ator',
  'Best Actress': 'Melhor Atriz',
  'Best Supporting Actor': 'Melhor Ator Coadjuvante',
  'Best Supporting Actress': 'Melhor Atriz Coadjuvante',
  'Best Original Screenplay': 'Melhor Roteiro Original',
  'Best Adapted Screenplay': 'Melhor Roteiro Adaptado',
  'Best Writing': 'Melhor Roteiro',
  'Best Story': 'Melhor Argumento',
  'Best Animated Feature': 'Melhor Animação',
  'Best International Feature Film': 'Melhor Filme Internacional',
  'Best Documentary Feature Film': 'Melhor Documentário',
  'Best Documentary Feature': 'Melhor Documentário',
  'Best Documentary Short Film': 'Melhor Documentário em Curta-Metragem',
  'Best Documentary Short Subject': 'Melhor Documentário em Curta-Metragem',
  'Best Live Action Short Film': 'Melhor Curta-Metragem',
  'Best Animated Short Film': 'Melhor Curta de Animação',
  'Best Original Score': 'Melhor Trilha Sonora',
  'Best Original Song': 'Melhor Canção Original',
  'Best Sound': 'Melhor Som',
  'Best Sound Mixing': 'Melhor Mixagem de Som',
  'Best Sound Editing': 'Melhor Edição de Som',
  'Best Production Design': 'Melhor Design de Produção',
  'Best Art Direction': 'Melhor Direção de Arte',
  'Best Cinematography': 'Melhor Fotografia',
  'Best Makeup and Hairstyling': 'Melhor Maquiagem e Penteados',
  'Best Costume Design': 'Melhor Figurino',
  'Best Film Editing': 'Melhor Montagem',
  'Best Visual Effects': 'Melhores Efeitos Visuais',
  'Best Casting': 'Melhor Seleção de Elenco',
  'Achievement in Casting': 'Melhor Seleção de Elenco',
  'Best Original Musical or Comedy Score': 'Melhor Trilha Sonora de Musical ou Comédia',
  'Best Original Song Score': 'Melhor Trilha Sonora de Canções',
  'Best Scoring of a Musical Picture': 'Melhor Trilha Sonora de Musical',
  'Best Dance Direction': 'Melhor Coreografia',
  'Best Assistant Director': 'Melhor Assistente de Direção',
  'Best Special Effects': 'Melhores Efeitos Especiais',
  'Best Actor in a Leading Role': 'Melhor Ator',
  'Best Actress in a Leading Role': 'Melhor Atriz',
  // O mesmo prêmio, com o nome antigo: o mesmo nome em português (e o mesmo filtro).
  'Best Foreign Language Film': 'Melhor Filme Internacional',
  'Best Documentary (Short Subject)': 'Melhor Documentário em Curta-Metragem',
  'Best Unique and Artistic Picture': 'Melhor Filme Único e Artístico',
  'Best Writing (Title Writing)': 'Melhor Roteiro (Intertítulos)',
};

// ---------- Ler o wikitext ----------

// Tira a marcação da Wikipédia e deixa o texto: [[a|b]] → b, {{ndash}} → –, <ref>…</ref> some.
function textoLimpo(w) {
  let s = String(w || '');
  s = s.replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  s = s.replace(/\{\{\s*(?:ndash|snd|en dash)\s*\}\}/gi, ' – ').replace(/\{\{\s*(?:mdash|spaced mdash)\s*\}\}/gi, ' — ');
  s = s.replace(/\{\{\s*(?:double[- ]dagger|dagger)[^}]*\}\}/gi, ' ');
  s = s.replace(/\{\{\s*abbr\s*\|([^|}]*)\|[^}]*\}\}/gi, '$1');
  s = s.replace(/\{\{\s*(?:nowrap|lang\|[^|}]*|sortname)\s*\|([^}]*)\}\}/gi, (_, x) => x.replace(/\|/g, ' '));
  s = s.replace(/\{\{[^{}]*\}\}/g, '');
  s = s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1');
  s = s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/'{2,}/g, '');
  return s.replace(/[‡†]/g, '').replace(/\s+/g, ' ').trim();
}

// O primeiro [[link]] de um trecho: { alvo, texto }.
function primeiroLink(w) {
  const m = String(w).match(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/);
  return m ? { alvo: m[1].trim().replace(/_/g, ' '), texto: textoLimpo(m[2] || m[1]) } : null;
}

// "* '''''[[Filme]]'' – produtores ‡'''" → { nivel, venceu, filme: { titulo, wiki }, pessoa, extra }
function lerIndicacao(linha, links) {
  const nivel = (linha.match(/^\*+/) || [''])[0].length;
  let corpo = linha.slice(nivel);
  const comAdaga = /‡|\{\{\s*double[- ]dagger/i.test(corpo);
  // Negrito fora, itálico fica: ''''' vira '' e ''' some.
  corpo = corpo.replace(/'{5}/g, "''").replace(/'''/g, '');
  corpo = corpo.replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  const it = corpo.match(/''(.+?)''/);
  if (!it) {
    const texto = textoLimpo(corpo);
    return texto ? { nivel, comAdaga, filme: null, pessoa: texto, extra: '' } : null;
  }
  const link = primeiroLink(it[1]);
  const titulo = link ? link.texto : textoLimpo(it[1]);
  if (!titulo) return null;
  const wiki = link ? link.alvo : (links.get(titulo) || null);
  const antes = textoLimpo(corpo.slice(0, it.index)).replace(/\s*[–—-]\s*$/, '').replace(/\s+from$/i, '').trim();
  const depois = textoLimpo(corpo.slice(it.index + it[0].length)).replace(/^\s*[–—-]\s*/, '').trim();
  return { nivel, comAdaga, filme: { titulo, wiki }, pessoa: antes, extra: antes ? '' : depois };
}

// O wikitext da página → [{ chave, nome, indicados: [{ titulo, wiki, pessoa, extra, venceu }] }]
function lerCategorias(wikitext, prefixo = 'Academy Award for ') {
  // As referências (<ref>…</ref>) podem ocupar várias linhas e ter listas com "*" dentro.
  wikitext = String(wikitext).replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  const linhas = wikitext.split('\n');
  // Filmes já citados com link: as próximas vezes vêm só em itálico.
  const links = new Map();
  for (const m of String(wikitext).matchAll(/''\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]''/g)) {
    const texto = textoLimpo(m[2] || m[1]);
    if (!links.has(texto)) links.set(texto, m[1].trim());
  }
  const categorias = [];
  let atual = null;
  for (const linha of linhas) {
    // {{Award category|…}} ou {{AwardCategory|…}} (algumas páginas antigas)
    const cab = linha.match(/\{\{\s*Award ?category\s*\|[^|]*\|(.*?\]\]|[^}]*)\s*\}\}/i);
    if (cab) {
      const link = primeiroLink(cab[1]);
      const pagina = link ? link.alvo : '';
      const chave = (pagina.startsWith(prefixo) ? pagina.slice(prefixo.length) : (link ? link.texto : textoLimpo(cab[1]))).trim();
      atual = { chave, nome: CATEGORIAS_PT[chave] || (link ? link.texto : textoLimpo(cab[1])), original: link ? link.texto : textoLimpo(cab[1]), linhas: [] };
      categorias.push(atual);
      continue;
    }
    if (!atual) continue;
    if (/^\s*(\|\}|==)/.test(linha)) { atual = null; continue; }
    if (/^\*/.test(linha)) {
      const ind = lerIndicacao(linha.trim(), links);
      if (ind) atual.linhas.push(ind);
    }
  }
  return categorias
    .map((c) => {
      // Vencedor: o `*` quando a categoria tem `**` (ou a ‡ na linha).
      const temSegundoNivel = c.linhas.some((l) => l.nivel >= 2);
      const indicados = c.linhas
        .filter((l) => l.filme || l.pessoa)
        .map((l) => ({
          titulo: l.filme ? l.filme.titulo : '',
          wiki: l.filme ? l.filme.wiki : null,
          pessoa: l.pessoa || '',
          extra: (l.extra || '').slice(0, 160),
          venceu: (temSegundoNivel && l.nivel === 1) || l.comAdaga,
        }));
      return { chave: c.chave, nome: c.nome, original: c.original, indicados };
    })
    .filter((c) => c.indicados.length);
}

// ---------- Buscar na Wikipédia e no Wikidata ----------

async function pegarJSON(url) {
  const r = await fetch(url, { headers: cabecalhos(), signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${new URL(url).host} respondeu ${r.status}`);
  return r.json();
}

// O wikitext de várias páginas (até 50 por vez): { título: wikitext | null }.
async function wikitexts(titulos) {
  const res = {};
  for (let i = 0; i < titulos.length; i += 50) {
    const lote = titulos.slice(i, i + 50);
    const qs = new URLSearchParams({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', format: 'json', formatversion: '2', origin: '*', titles: lote.join('|') });
    const json = await pegarJSON(`https://en.wikipedia.org/w/api.php?${qs}`);
    const normal = new Map(((json.query && json.query.normalized) || []).map((n) => [n.to, n.from]));
    for (const p of (json.query && json.query.pages) || []) {
      const conteudo = p.revisions && p.revisions[0] && p.revisions[0].slots && p.revisions[0].slots.main.content;
      res[normal.get(p.title) || p.title] = p.missing ? null : conteudo || null;
    }
  }
  return res;
}

// Títulos de páginas da Wikipédia → { título: { imdb, tmdb } }, pelo Wikidata.
async function idsDosFilmes(titulos) {
  const res = {};
  const unicos = [...new Set(titulos.filter(Boolean))];
  const qid = new Map(); // título pedido → Q…
  for (let i = 0; i < unicos.length; i += 50) {
    const lote = unicos.slice(i, i + 50);
    const qs = new URLSearchParams({ action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1', format: 'json', formatversion: '2', origin: '*', titles: lote.join('|') });
    const json = await pegarJSON(`https://en.wikipedia.org/w/api.php?${qs}`);
    const q = json.query || {};
    // pedido → normalizado → redirecionado → página
    const passo = new Map();
    for (const n of q.normalized || []) passo.set(n.from, n.to);
    for (const r of q.redirects || []) passo.set(r.from, r.to);
    const porTitulo = new Map((q.pages || []).filter((p) => p.pageprops && p.pageprops.wikibase_item).map((p) => [p.title, p.pageprops.wikibase_item]));
    for (const t of lote) {
      let atual = t;
      for (let k = 0; k < 4 && passo.has(atual); k++) atual = passo.get(atual);
      if (porTitulo.has(atual)) qid.set(t, porTitulo.get(atual));
    }
  }
  const qids = [...new Set(qid.values())];
  const porQid = new Map();
  for (let i = 0; i < qids.length; i += 200) {
    const lote = qids.slice(i, i + 200);
    const sparql = `SELECT ?item ?imdb ?tmdb WHERE { VALUES ?item { ${lote.map((q) => `wd:${q}`).join(' ')} } OPTIONAL { ?item wdt:P345 ?imdb } OPTIONAL { ?item wdt:P4947 ?tmdb } }`;
    const json = await pegarJSON(`https://query.wikidata.org/sparql?${new URLSearchParams({ query: sparql, format: 'json' })}`);
    for (const b of json.results.bindings) {
      const q = b.item.value.split('/').pop();
      const atual = porQid.get(q) || {};
      if (b.imdb && /^tt\d+$/.test(b.imdb.value) && !atual.imdb) atual.imdb = b.imdb.value;
      if (b.tmdb && !atual.tmdb) atual.tmdb = b.tmdb.value;
      porQid.set(q, atual);
    }
  }
  for (const [t, q] of qid) res[t] = porQid.get(q) || {};
  return res;
}

// Várias cerimônias de uma vez: [{ premio, numero, ano, categorias, indicados: bool, vencedores: bool, em }].
// `filmes` (opcional) é o cadastro { wiki: { imdb, tmdb } } já conhecido, para não perguntar de novo.
async function buscarCerimonias(premioId, numeros, filmesConhecidos = {}) {
  const p = PREMIOS[premioId];
  const paginas = numeros.map((n) => p.pagina(n).replace(/_/g, ' '));
  const textos = await wikitexts(paginas);
  const cerimonias = numeros.map((n, i) => {
    const w = textos[paginas[i]];
    const categorias = w ? lerCategorias(w, p.prefixoCategoria) : [];
    return {
      premio: premioId,
      numero: n,
      ano: p.anoDaCerimonia(n),
      existe: Boolean(w),
      categorias,
      indicados: categorias.length > 0,
      vencedores: categorias.some((c) => c.indicados.some((x) => x.venceu)),
      em: new Date().toISOString(),
    };
  });
  const faltam = [...new Set(cerimonias.flatMap((c) => c.categorias.flatMap((k) => k.indicados.map((x) => x.wiki))))]
    .filter((w) => w && !(w in filmesConhecidos));
  const novos = faltam.length ? await idsDosFilmes(faltam) : {};
  const filmes = { ...filmesConhecidos, ...novos };
  for (const w of faltam) if (!(w in filmes)) filmes[w] = {};
  return { cerimonias, filmes };
}

// ---------- Formato guardado (compacto) ----------
//
// { premio, geradoEm, filmes: { wiki: [imdb, tmdb] },
//   cerimonias: [[numero, ano, [[chave, original, [[titulo, wiki, pessoa, venceu], …]], …]], …] }
// wiki: 1 = igual ao título, 0 = sem página. O nome em português sai de CATEGORIAS_PT.

function compactar({ premio, cerimonias, filmes }) {
  const usados = new Set(cerimonias.flatMap((c) => c.categorias.flatMap((k) => k.indicados.map((x) => x.wiki))).filter(Boolean));
  const f = {};
  for (const w of [...usados].sort()) { const d = filmes[w] || {}; f[w] = d.tmdb ? [d.imdb || '', d.tmdb] : [d.imdb || '']; }
  return {
    premio,
    geradoEm: new Date().toISOString(),
    filmes: f,
    cerimonias: cerimonias.map((c) => [c.numero, c.ano, c.categorias.map((k) => [k.chave, k.original,
      k.indicados.map((x) => [x.titulo, x.wiki === x.titulo ? 1 : x.wiki || 0, x.pessoa, x.venceu ? 1 : 0])])]),
  };
}

function expandir(d) {
  const filmes = {};
  for (const [w, [imdb, tmdb]] of Object.entries(d.filmes || {})) filmes[w] = { imdb: imdb || '', tmdb: tmdb || '' };
  const em = d.geradoEm;
  const cerimonias = (d.cerimonias || []).map(([numero, ano, cats]) => {
    const categorias = cats.map(([chave, original, ind]) => ({
      chave, original, nome: CATEGORIAS_PT[chave] || original,
      indicados: ind.map(([titulo, wiki, pessoa, venceu]) => ({ titulo, wiki: wiki === 1 ? titulo : wiki || null, pessoa, extra: '', venceu: Boolean(venceu) })),
    }));
    return { premio: d.premio, numero, ano, existe: true, categorias, indicados: categorias.length > 0, vencedores: categorias.some((k) => k.indicados.some((x) => x.venceu)), em };
  });
  return { premio: d.premio, cerimonias, filmes };
}

// ---------- O que atualizar ----------

// As cerimônias que podem mudar: a do ano passado (se ainda não tem vencedores),
// a deste ano e a do ano que vem. Em temporada (jan–mar), a cada 3 horas; fora, uma vez por dia.
function paraAtualizar(premioId, cerimoniasConhecidas, agora = new Date()) {
  const p = PREMIOS[premioId];
  const ano = agora.getUTCFullYear();
  const numeros = [p.numeroDoAno(ano - 1), p.numeroDoAno(ano), p.numeroDoAno(ano + 1)];
  const validade = (p.temporada(agora) ? 3 : 24) * 60 * 60 * 1000;
  return numeros.filter((n) => {
    const c = cerimoniasConhecidas.find((x) => x.numero === n);
    if (!c) return true;
    if (c.vencedores && p.anoDaCerimonia(n) < ano) return false; // já fechada
    return !(agora - Date.parse(c.em) < validade);
  });
}

// ---------- O acervo: histórico + o que foi buscado depois ----------
//
// ctx: { historico: { oscar: <premios-oscar.json> }, lerCache() → obj | null, gravarCache(obj) }
// O cache (premios.json na pasta de dados) guarda as cerimônias buscadas pelo app,
// que valem por cima das do histórico.
class Acervo {
  constructor(ctx) {
    this.ctx = ctx;
    this.base = {};
    this.buscando = {};
    this.cache = (ctx.lerCache && ctx.lerCache()) || {};
  }

  historico(premioId) {
    if (!this.base[premioId]) {
      const h = this.ctx.historico && this.ctx.historico[premioId];
      this.base[premioId] = h ? expandir(h) : { premio: premioId, cerimonias: [], filmes: {} };
    }
    return this.base[premioId];
  }

  // Tudo do prêmio: cerimônias da mais nova para a mais antiga (inclusive as
  // anunciadas sem indicados ainda, para a aba aparecer) e o cadastro de filmes.
  dados(premioId) {
    const p = PREMIOS[premioId];
    if (!p) return null;
    const h = this.historico(premioId);
    const c = this.cache[premioId] || { cerimonias: [], filmes: {} };
    const porNumero = new Map(h.cerimonias.map((x) => [x.numero, x]));
    for (const x of c.cerimonias) if (x.indicados || !porNumero.has(x.numero)) porNumero.set(x.numero, x);
    const cerimonias = [...porNumero.values()].filter((x) => x.indicados || x.existe).sort((a, b) => b.numero - a.numero);
    return { premio: premioId, nome: p.nome, cerimonias, filmes: { ...h.filmes, ...c.filmes } };
  }

  // Busca de novo as cerimônias recentes (as que podem ter mudado). Devolve true se algo mudou.
  atualizar(premioId, { forcar = false } = {}) {
    if (this.buscando[premioId]) return this.buscando[premioId];
    const atual = this.dados(premioId);
    const conhecidas = (this.cache[premioId] || { cerimonias: [] }).cerimonias;
    const numeros = forcar ? paraAtualizar(premioId, []) : paraAtualizar(premioId, conhecidas);
    if (!numeros.length) return Promise.resolve(false);
    this.buscando[premioId] = (async () => {
      const r = await buscarCerimonias(premioId, numeros, atual.filmes);
      const antes = JSON.stringify(conhecidas.filter((x) => numeros.includes(x.numero)).map(({ em, ...x }) => x));
      const c = this.cache[premioId] || { cerimonias: [], filmes: {} };
      c.cerimonias = [...c.cerimonias.filter((x) => !numeros.includes(x.numero)), ...r.cerimonias];
      // Só os filmes que não estão no histórico.
      const h = this.historico(premioId).filmes;
      c.filmes = Object.fromEntries(Object.entries(r.filmes).filter(([w]) => !(w in h)));
      this.cache[premioId] = c;
      if (this.ctx.gravarCache) this.ctx.gravarCache(this.cache);
      return antes !== JSON.stringify(r.cerimonias.map(({ em, ...x }) => x));
    })().finally(() => { delete this.buscando[premioId]; });
    return this.buscando[premioId];
  }
}

module.exports = { Acervo, PREMIOS, CATEGORIAS_PT, lerCategorias, textoLimpo, buscarCerimonias, idsDosFilmes, wikitexts, paraAtualizar, ordinal, compactar, expandir };
