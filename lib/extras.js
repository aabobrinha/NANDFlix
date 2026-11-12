// O que muda com o tempo em cada filme, atualizado a cada 7 dias em segundo plano
// (no PC e no celular, com o mesmo código): a nota do TMDB e a média do
// Letterboxd, onde assistir (streaming do país, pelo JustWatch via TMDB), se está
// nos cinemas e se está no catálogo do Stremio.
//
// Fica no filme como `extras` (um campo só, que vai para a nuvem inteiro; a data
// `em` evita que o outro aparelho busque de novo o que um já buscou):
//   { em, pais, tmdb: '7.6', letterboxd: '4.1', letterboxdUrl,
//     onde: { link, assinatura: [{ id, nome, logo }], gratis, aluguel, compra },
//     cinema: 'agora' | 'em-breve' | false, cinemaData: 'AAAA-MM-DD',
//     stremio: true | false | null (não deu para saber) }
//
// As notas do IMDb, Metascore e Rotten Tomatoes continuam vindo do OMDb (info).
const tmdb = require('./tmdb');

const VALIDADE = 7 * 24 * 60 * 60 * 1000;
const ESPERA_LETTERBOXD = 1100; // uma página do Letterboxd por segundo, no máximo
const NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// A média do Letterboxd ("4.10 out of 5") e o endereço da página do filme.
async function notaLetterboxd(imdbID) {
  const r = await fetch(`https://letterboxd.com/imdb/${imdbID}/`, {
    headers: { 'User-Agent': NAVEGADOR, Accept: 'text/html' },
    signal: AbortSignal.timeout(15000),
  });
  if (r.status === 404) return { letterboxd: '', letterboxdUrl: '' };
  if (!r.ok) throw new Error(`Letterboxd ${r.status}`);
  const html = await r.text();
  const media = html.match(/name="twitter:data2" content="([\d.]+) out of 5"/);
  const url = html.match(/property="og:url" content="([^"]+)"/);
  return {
    letterboxd: media ? Number(media[1]).toFixed(1) : '',
    letterboxdUrl: url && /^https:\/\/letterboxd\.com\/film\//.test(url[1]) ? url[1] : '',
  };
}

// Está no catálogo oficial do Stremio (Cinemeta)? Se dá para assistir depende
// dos complementos (add-ons) instalados no Stremio de cada um.
async function noStremio(imdbID) {
  const r = await fetch(`https://v3-cinemeta.strem.io/meta/movie/${imdbID}.json`, { signal: AbortSignal.timeout(15000) });
  if (r.status === 404) return false;
  if (!r.ok) throw new Error(`Cinemeta ${r.status}`);
  const json = await r.json().catch(() => null);
  return Boolean(json && json.meta && json.meta.id);
}

const desatualizado = (f, pais) => !f.extras || f.extras.pais !== pais || !(Date.now() - Date.parse(f.extras.em) < VALIDADE);

class Extras {
  // ctx: { filmes(), config(), atualizarFilme(id, mudancas), avisar(canal, dados), gravarAgora() }
  constructor(ctx) {
    this.ctx = ctx;
    this.fila = [];
    this.rodando = null;
    this.cartaz = null; // { pais, quando, ids }
  }

  pais() { return String(this.ctx.config().pais || 'BR').toUpperCase(); }

  async idsEmCartaz(chave, pais) {
    if (this.cartaz && this.cartaz.pais === pais && Date.now() - this.cartaz.quando < 12 * 60 * 60 * 1000) return this.cartaz.ids;
    const ids = await tmdb.emCartaz(chave, pais).catch(() => null);
    if (ids) this.cartaz = { pais, quando: Date.now(), ids };
    return ids || new Set();
  }

  // Busca tudo de um filme. O que falhar (sem internet, site fora do ar) fica
  // como estava da última vez.
  async buscar(f) {
    const chave = this.ctx.config().tmdbKey;
    const pais = this.pais();
    const antes = (f.extras && f.extras.pais === pais) ? f.extras : {};
    const novo = { ...antes, pais };
    const tarefas = [];
    if (chave && f.tmdbId) {
      tarefas.push(tmdb.ondeAssistir(chave, f.tmdbId, pais).then(async (d) => {
        if (!d) return;
        novo.tmdb = d.nota;
        novo.onde = d.onde;
        novo.cinema = d.cinema;
        novo.cinemaData = d.cinemaData || '';
        if (!novo.cinema && (await this.idsEmCartaz(chave, pais)).has(Number(f.tmdbId))) novo.cinema = 'agora';
      }));
    }
    if (f.imdbID) {
      tarefas.push(noStremio(f.imdbID).then((v) => { novo.stremio = v; }, () => { if (!('stremio' in novo)) novo.stremio = null; }));
      tarefas.push(notaLetterboxd(f.imdbID).then((v) => Object.assign(novo, v), () => {}));
    }
    const resultados = await Promise.allSettled(tarefas);
    // Chave do TMDB errada: não marca como atualizado (tenta de novo depois).
    const erroTmdb = resultados.find((r) => r.status === 'rejected' && r.reason instanceof tmdb.ErroTmdb);
    if (erroTmdb) throw erroTmdb.reason;
    novo.em = new Date().toISOString();
    this.ctx.atualizarFilme(f.id, { extras: novo });
    this.ctx.avisar('filme:mudou', f);
    return novo;
  }

  // Um filme agora (ao abrir os detalhes), se estiver desatualizado.
  async agora(id, { forcar = false } = {}) {
    const f = this.ctx.filmes().find((x) => x.id === id);
    if (!f || (!forcar && !desatualizado(f, this.pais()))) return f ? f.extras || null : null;
    try { return await this.buscar(f); } catch { return f.extras || null; }
  }

  // Os desatualizados, em segundo plano, um por vez: primeiro os não vistos.
  atualizar() {
    if (this.rodando) return this.rodando;
    const pais = this.pais();
    const fila = this.ctx.filmes()
      .filter((f) => (f.tmdbId || f.imdbID) && desatualizado(f, pais))
      .sort((a, b) => Number(Boolean(a.visto)) - Number(Boolean(b.visto)));
    if (!fila.length) return Promise.resolve({ total: 0 });
    this.rodando = (async () => {
      let feitos = 0;
      for (const f of fila) {
        if (!desatualizado(f, this.pais())) continue; // chegou pela nuvem enquanto isso
        const inicio = Date.now();
        try {
          await this.buscar(f);
        } catch {
          break; // chave errada ou sem internet: o resto fica para a próxima
        }
        feitos++;
        if (feitos % 20 === 0) this.ctx.gravarAgora();
        const passou = Date.now() - inicio;
        if (passou < ESPERA_LETTERBOXD) await espera(ESPERA_LETTERBOXD - passou);
      }
      this.ctx.gravarAgora();
      return { total: feitos };
    })().finally(() => { this.rodando = null; });
    return this.rodando;
  }
}

module.exports = { Extras, notaLetterboxd, noStremio, VALIDADE };
