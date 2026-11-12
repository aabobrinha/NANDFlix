// Acha o trailer de um filme no YouTube sem chave de API: lê os dados que a
// própria página de resultados de busca traz embutidos (ytInitialData).
const AGENTE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const DURACAO_MAXIMA = 5 * 60; // trailers têm poucos minutos; evita pegar o filme inteiro

function segundos(texto) {
  if (!texto) return Infinity;
  return texto.split(':').reduce((t, parte) => t * 60 + Number(parte), 0);
}

function videosDaBusca(html) {
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) return [];
  const videos = [];
  JSON.parse(m[1], (chave, valor) => {
    if (chave === 'videoRenderer' && valor && valor.videoId) {
      videos.push({
        id: valor.videoId,
        titulo: (valor.title && valor.title.runs && valor.title.runs.map((r) => r.text).join('')) || '',
        duracao: segundos(valor.lengthText && valor.lengthText.simpleText),
      });
    }
    return valor;
  });
  return videos;
}

// Os vídeos que o YouTube acha para um termo (id, título e duração em segundos).
async function buscarVideos(termo) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(termo)}&hl=en`;
  const resposta = await fetch(url, {
    headers: { 'User-Agent': AGENTE, 'Accept-Language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(15000),
  });
  if (!resposta.ok) throw new Error(`YouTube respondeu ${resposta.status}`);
  return videosDaBusca(await resposta.text());
}

async function buscarTrailer(filme) {
  const ano = (String(filme.ano).match(/\d{4}/) || [''])[0];
  const nome = /^tt\d+$/.test(filme.buscaCapa || '') ? filme.titulo : (filme.buscaCapa || filme.titulo);
  const termo = `${nome} ${ano} trailer`.replace(/\s+/g, ' ').trim();
  const candidatos = (await buscarVideos(termo)).filter((v) => v.duracao <= DURACAO_MAXIMA);
  const trailer = candidatos.find((v) => /trailer|teaser/i.test(v.titulo)) || candidatos[0];
  return trailer ? trailer.id : null;
}

// As aberturas de um anime: até 4 vídeos curtos cujo título diz "opening" (ou
// abertura, ou OP). Sem nenhum assim, ficam os primeiros curtos que não sejam
// reação, cover, ending ou compilação.
const DURACAO_ABERTURA = 6 * 60;
const E_ABERTURA = /opening|abertura|\bop\s*\d*\b|オープニング/i;
const NAO_E_ABERTURA = /reaction|react\b|cover|piano|guitar|violin|tutorial|karaoke|review|ranking|top\s*\d+|all openings|every opening|compilation|ending|\bed\s*\d+\b/i;
async function buscarAberturas(titulo) {
  const nome = String(titulo || '').replace(/\s+/g, ' ').trim();
  if (!nome) return [];
  const curtos = (await buscarVideos(`${nome} opening`)).filter((v) => v.duracao <= DURACAO_ABERTURA);
  const limpos = curtos.filter((v) => !NAO_E_ABERTURA.test(v.titulo));
  const certos = limpos.filter((v) => E_ABERTURA.test(v.titulo));
  return (certos.length ? certos : limpos).slice(0, 4);
}

// As aberturas do item `f`: as da temporada `indice` (pelo título dela), ou da série.
// Guardadas por título enquanto o app está aberto, para não repetir a busca.
const aberturasGuardadas = new Map();
async function aberturasDe(f, indice) {
  const t = Number.isInteger(indice) && Array.isArray(f.temporadas) ? f.temporadas[indice] : null;
  const titulo = (t && t.titulo) || f.titulo;
  if (!aberturasGuardadas.has(titulo)) {
    aberturasGuardadas.set(titulo, buscarAberturas(titulo).catch((e) => { aberturasGuardadas.delete(titulo); throw e; }));
  }
  return aberturasGuardadas.get(titulo);
}

// Aceita um link do YouTube (watch, youtu.be, shorts, embed) ou só o código.
function idDoLink(texto) {
  const t = String(texto || '').trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  const m = t.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

module.exports = { buscarTrailer, buscarAberturas, aberturasDe, idDoLink };
