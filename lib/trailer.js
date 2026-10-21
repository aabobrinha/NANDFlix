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

async function buscarTrailer(filme) {
  const ano = (String(filme.ano).match(/\d{4}/) || [''])[0];
  const nome = /^tt\d+$/.test(filme.buscaCapa || '') ? filme.titulo : (filme.buscaCapa || filme.titulo);
  const termo = `${nome} ${ano} trailer`.replace(/\s+/g, ' ').trim();
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(termo)}&hl=en`;
  const resposta = await fetch(url, {
    headers: { 'User-Agent': AGENTE, 'Accept-Language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(15000),
  });
  if (!resposta.ok) throw new Error(`YouTube respondeu ${resposta.status}`);
  const candidatos = videosDaBusca(await resposta.text()).filter((v) => v.duracao <= DURACAO_MAXIMA);
  const trailer = candidatos.find((v) => /trailer|teaser/i.test(v.titulo)) || candidatos[0];
  return trailer ? trailer.id : null;
}

// Aceita um link do YouTube (watch, youtu.be, shorts, embed) ou só o código.
function idDoLink(texto) {
  const t = String(texto || '').trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  const m = t.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

module.exports = { buscarTrailer, idDoLink };
