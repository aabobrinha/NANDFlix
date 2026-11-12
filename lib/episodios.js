// A lista de episódios de uma temporada (título, sinopse, imagem e duração),
// do TMDB. Fica num cache à parte (episodios.json), NÃO dentro do registro do
// anime: a lista é grande e não precisa ir para a sincronização.
const tmdb = require('./tmdb');

const HORA = 3600 * 1000;
const DIA = 24 * HORA;

class Episodios {
  // `chave()`: a chave do TMDB; `lerCache()` / `gravarCache(obj)`: o arquivo de cache.
  constructor({ chave, lerCache, gravarCache }) {
    this.chave = chave;
    this.gravarCache = gravarCache;
    this.disco = null; // { "<serie>": { estrutura: {em, dados}, "<n>": {em, dados} } }
    this.lerCache = lerCache;
    this.pendentes = new Map(); // consultas em andamento (várias iguais viram uma)
  }

  carregar() {
    if (!this.disco) this.disco = this.lerCache() || {};
    return this.disco;
  }

  guardar(serie, quem, dados) {
    const d = this.carregar();
    d[serie] = { ...(d[serie] || {}), [quem]: { em: Date.now(), dados } };
    try { this.gravarCache(d); } catch { /* sem cache em disco: só não lembra */ }
  }

  // Devolve do cache se ainda vale, senão consulta e guarda.
  async lembrar(serie, quem, validade, buscar) {
    const guardado = (this.carregar()[serie] || {})[quem];
    if (guardado && Date.now() - guardado.em < validade(guardado.dados)) return guardado.dados;
    const k = `${serie}/${quem}`;
    if (!this.pendentes.has(k)) {
      this.pendentes.set(k, buscar()
        .then((dados) => { if (dados) this.guardar(serie, quem, dados); return dados; })
        .finally(() => this.pendentes.delete(k)));
    }
    try {
      return await this.pendentes.get(k);
    } catch (e) {
      if (guardado) return guardado.dados; // sem internet: o cache velho serve
      throw e;
    }
  }

  estrutura(tvId) {
    return this.lembrar(tvId, 'estrutura', () => 12 * HORA, () => tmdb.temporadasDaSerie(this.chave(), tvId));
  }

  // Uma temporada já terminada quase não muda (30 dias); uma em exibição, sim (12 horas).
  temporada(tvId, n) {
    const emExibicao = (eps) => eps.some((e) => !e.data || Date.parse(e.data) > Date.now() - 2 * DIA);
    return this.lembrar(tvId, String(n), (eps) => (emExibicao(eps) ? 12 * HORA : 30 * DIA), () => tmdb.episodiosTemporada(this.chave(), tvId, n));
  }

  // Os episódios da entrada `indice` de `f.temporadas`, numerados como o app
  // numera (1, 2, 3 dentro da entrada). Devolve { ok: true, episodios } ou
  // { ok: false, motivo: 'chave' | 'serie' | 'sem-dados' | 'filme' }.
  async daTemporada(f, indice) {
    if (!String(this.chave() || '').trim()) return { ok: false, motivo: 'chave' };
    if (!f.tmdbTvId) return { ok: false, motivo: 'serie' };
    const ts = Array.isArray(f.temporadas) ? f.temporadas : [];
    const alvo = ts.length ? ts[indice] : { episodios: f.episodios };
    if (!alvo || alvo.formato === 'MOVIE') return { ok: false, motivo: 'filme' };
    const entradas = ts.length ? ts.filter((t) => t.formato !== 'MOVIE') : [alvo];
    const posicao = entradas.indexOf(alvo);
    const estrutura = await this.estrutura(f.tmdbTvId);
    if (!estrutura || !estrutura.length) return { ok: false, motivo: 'sem-dados' };
    const mapa = tmdb.mapearTemporadas(estrutura, entradas.map((t) => Number(t.episodios) || 0))[posicao];
    if (!mapa) return { ok: false, motivo: 'sem-dados' };
    const precisa = new Set();
    for (let k = mapa.de; k <= mapa.ate; k++) precisa.add(tmdb.localizarEpisodio(estrutura, k).temporada);
    const porTemporada = new Map();
    await Promise.all([...precisa].map(async (n) => porTemporada.set(n, (await this.temporada(f.tmdbTvId, n)) || [])));
    const episodios = [];
    for (let k = mapa.de; k <= mapa.ate; k++) {
      const { temporada, episodio } = tmdb.localizarEpisodio(estrutura, k);
      const e = (porTemporada.get(temporada) || []).find((x) => x.n === episodio);
      episodios.push({ ...(e || { titulo: '', sinopse: '', imagem: '', duracao: 0, data: '' }), n: k - mapa.de + 1 });
    }
    if (!episodios.some((e) => e.titulo || e.sinopse || e.imagem)) return { ok: false, motivo: 'sem-dados' };
    return { ok: true, episodios };
  }
}

module.exports = { Episodios };
