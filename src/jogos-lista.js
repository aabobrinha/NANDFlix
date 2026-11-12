'use strict';

// ---------- nandplay: adicionar, cartões, filtros e lista ----------
//
// A parte de jogos da tela principal. Carregado por último (depois de busca.js): em vez de
// espalhar `if (ehJogo(f))` pelo app.js, aqui as funções da lista são envolvidas (a original
// continua valendo para filmes e animes) e os filtros entram pelos ganchos que já existem
// (passaFiltroAnime, SECOES_FILTRO, aplicarNandroll). O que o app.js chama daqui:
// textosBuscaAdicionar, buscarJogosBusca, escolherJogoNaBusca, adicionarJogoSemBuscar e
// extraBuscaJogo. Contrato do item de jogo: lib/filmes.js (novoJogo) e CONTEXTO-jogos.md.

const ehPlataformaJogos = () => plataformaAtual().id === 'nandplay';

// ---- Status e tags ----

const STATUS_DO_JOGO = [
  { id: 'quero', rotulo: 'Quero jogar', curto: 'Quero jogar' },
  { id: 'jogando', rotulo: 'Jogando', curto: 'Jogando' },
  { id: 'pausado', rotulo: 'Pausado', curto: 'Pausado' },
  { id: 'zerado', rotulo: 'Zerei', curto: 'Zerei' },
  { id: 'cem', rotulo: '100%', curto: '100%' },
  { id: 'larguei', rotulo: 'Larguei', curto: 'Larguei' },
];
const statusDoJogo = (f) => (STATUS_DO_JOGO.some((s) => s.id === f.status) ? f.status : 'quero');
const rotuloStatusJogo = (id) => (STATUS_DO_JOGO.find((s) => s.id === id) || STATUS_DO_JOGO[0]).curto;
const tagsDoJogo = (f) => (Array.isArray(f.tags) ? f.tags.filter(Boolean) : []);

// Os nomes das plataformas (consoles) do jogo, abreviados: ["PC", "PS5", "NSW"].
const consolesDoJogo = (f) => (Array.isArray(f.plataformasJogo) ? f.plataformasJogo : []).map((p) => p.abrev || p.nome).filter(Boolean);
// Horas para zerar, legível: 12,5 → "12,5 h".
const horasLegiveis = (h) => (Number(h) > 0 ? `${Number(h).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h` : '');
const desenvolvedoresDoJogo = (f) => (Array.isArray(f.desenvolvedores) ? f.desenvolvedores : []).map((d) => d.nome).filter(Boolean);

function seloStatusJogoHTML(f) {
  const s = statusDoJogo(f);
  return `<span class="selo-status-jogo st-${s}">${esc(rotuloStatusJogo(s))}</span>`;
}
function tagsJogoHTML(f, max = 2) {
  const t = tagsDoJogo(f);
  if (!t.length) return '';
  const resto = t.length - max;
  return t.slice(0, max).map((x) => `<span class="tag-jogo">${esc(x)}</span>`).join('') + (resto > 0 ? `<span class="tag-jogo tag-resto" title="${esc(t.slice(max).join(', '))}">+${resto}</span>` : '');
}

// ---- A Steam do jogo (instalados e biblioteca) ----
//
// O que a Steam diz fica numa cópia aqui: instalados (arquivos da Steam no PC, sem chave) e a
// biblioteca da conta (só com chave e perfil). Serve aos filtros e ao botão da Steam.
const steamDaLista = { local: null, biblioteca: null };

function appidsInstalados() {
  return new Set(((steamDaLista.local && steamDaLista.local.instalados) || []).filter((i) => i.completo).map((i) => Number(i.appid)));
}
function appidsNaBiblioteca() {
  return steamDaLista.biblioteca ? new Set(steamDaLista.biblioteca.jogos.map((j) => Number(j.appid))) : null;
}
const temBibliotecaSteam = () => Boolean(steamDaLista.biblioteca);

let carregandoSteamLista = null;
function carregarSteamDaLista({ forcar = false } = {}) {
  if (carregandoSteamLista) return carregandoSteamLista;
  carregandoSteamLista = (async () => {
    try {
      steamDaLista.local = await api.steamLocal(forcar ? { forcar: true } : {});
      const r = await api.steamBiblioteca({});
      steamDaLista.biblioteca = r && r.ok && r.dados && Array.isArray(r.dados.jogos) ? r.dados : null;
    } catch { /* sem Steam: os filtros dela só não aparecem */ }
  })().finally(() => { carregandoSteamLista = null; });
  return carregandoSteamLista;
}

// O que o botão da Steam faz com este jogo (lib/steam.js, acaoSteam: o link é montado no processo principal).
function acaoSteamDoJogo(f) {
  const id = Number(f.steam);
  if (!id || api.plataforma === 'android' || !(steamDaLista.local && steamDaLista.local.steamNoPc)) return 'web';
  if (appidsInstalados().has(id)) return 'jogar';
  const bib = appidsNaBiblioteca();
  if (bib) return bib.has(id) ? 'instalar' : 'loja';
  return 'abrir';
}
const rotuloAcaoSteam = (acao) => ({ jogar: 'Jogar na Steam', instalar: 'Instalar pela Steam', loja: 'Ver na loja da Steam', abrir: 'Abrir na Steam', web: 'Ver na Steam' }[acao] || 'Steam');
async function abrirSteamDoJogo(id) {
  const f = porId(id);
  if (!f || !f.steam) return;
  await api.abrirSteam(Number(f.steam), acaoSteamDoJogo(f));
}

// ---- Adicionar ----

// Completa as imagens que a IGDB não tem (a logo e, às vezes, capa e fundo) com as da Steam.
function completarImagensDoJogo(d) {
  const id = Number(d.steam);
  if (!Number.isSafeInteger(id) || id <= 0) return d;
  const base = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/`;
  return { ...d, capa: d.capa || `${base}library_600x900.jpg`, fundo: d.fundo || `${base}library_hero.jpg`, logo: d.logo || `${base}logo.png`, cabecalho: d.cabecalho || `${base}header.jpg` };
}

// Adiciona um jogo à lista. `arg`: o resultado leve da busca ({ igdb, steam, titulo… }) ou só o id
// da IGDB. Busca os detalhes (IGDB, ou a loja da Steam sem as chaves), monta o item do contrato
// com status 'quero' e sem tags e grava como os filmes e animes (api.adicionarFilme).
// Devolve o item; se o jogo já estava na lista, devolve o que já estava (sem duplicar).
async function adicionarJogo(arg) {
  const leve = arg && typeof arg === 'object' ? arg : { igdb: Number(arg) };
  let dados = null;
  if (leve.igdb) {
    const r = await api.detalhesJogo(leve.igdb);
    if (r && r.ok && r.dados) dados = r.dados;
  }
  if (!dados && leve.steam) {
    const r = await api.detalhesJogoSteam(Number(leve.steam));
    if (r && r.ok && r.dados) dados = r.dados;
  }
  // Sem detalhes (sem internet, jogo sem página): fica o que a busca já trouxe.
  if (!dados) {
    if (!leve.titulo) return null;
    dados = { tipo: 'jogo', igdb: leve.igdb || null, steam: leve.steam || null, titulo: leve.titulo, ano: leve.ano || '', capa: leve.capa || '', plataformasJogo: (leve.plataformas || []).map((n) => ({ id: n, nome: n, abrev: n })) };
  }
  if (!dados.steam && leve.steam) dados.steam = leve.steam;
  const item = { ...completarImagensDoJogo(dados), tipo: 'jogo', status: 'quero', tags: [] };
  const repetido = await api.acharRepetido(item);
  if (repetido) return repetido;
  const novo = await api.adicionarFilme(item);
  // No celular a lista da ponte e a da tela são a mesma: não entra duas vezes.
  if (!estado.filmes.some((f) => f.id === novo.id)) estado.filmes.push(novo);
  render();
  return novo;
}

// O jogo da busca já está na lista? (pelo id da IGDB ou o appid da Steam)
function jogoNaLista(r) {
  return estado.filmes.find((f) => ehJogo(f) && ((r.igdb && String(f.igdb) === String(r.igdb)) || (r.steam && String(f.steam) === String(r.steam)))) || null;
}

// Os textos da busca do Adicionar, por fonte ('filme' | 'anime' | 'jogo').
function textosBuscaAdicionar(fonte = fonteAtual()) {
  const hub = plataformaAtual().hub;
  if (fonte === 'jogo') {
    return { placeholder: 'Digite o nome do jogo e tecle Enter', dica: hub ? 'Busque e clique no resultado certo. Filmes vêm do TMDB; animes, da AniList; jogos, da IGDB.' : 'Busque o jogo na IGDB e clique no resultado certo.' };
  }
  if (fonte === 'anime') {
    return { placeholder: 'Digite o nome do anime e tecle Enter', dica: hub ? 'Busque e clique no resultado certo. Filmes vêm do TMDB; animes, da AniList.' : 'Busque o anime na AniList e clique no resultado certo.' };
  }
  return { placeholder: 'Digite o título e tecle Enter', dica: hub ? 'Busque e clique no resultado certo. Filmes vêm do TMDB; animes, da AniList.' : 'Busque o filme no TMDB e clique no resultado certo.' };
}

function resultadosJogosHTML(itens) {
  const sobra = (n) => (n > 0 ? ` +${n}` : '');
  return itens.map((r, i) => {
    const plats = Array.isArray(r.plataformas) ? r.plataformas : [];
    const jaTem = jogoNaLista(r);
    return `
    <button class="resultado resultado-jogo${jaTem ? ' atual' : ''}" data-i="${i}" title="${jaTem ? 'Já está na sua lista' : ''}">
      <div class="capa">${r.capa
    ? `<img src="${esc(r.capa)}" alt="" loading="lazy" data-titulo="${esc(r.titulo)}" data-ano="${esc(r.ano)}"${r.capaAlternativa ? ` data-alt="${esc(r.capaAlternativa)}"` : ''}>`
    : `<div class="capa-vazia"><strong>${esc(r.titulo)}</strong></div>`}${r.steam ? '<span class="selo-steam" title="Está na Steam">Steam</span>' : ''}</div>
      <strong>${esc(r.titulo)}</strong><span>${esc(r.ano)}</span>
      ${plats.length ? `<span class="plats-jogo">${esc(plats.slice(0, 4).join(' · '))}${sobra(plats.length - 4)}</span>` : ''}
    </button>`;
  }).join('');
}

// A busca de jogos do Adicionar: IGDB; sem as chaves, cai para a loja da Steam (sem chave).
// Desenha em `area` e devolve os resultados (os índices dos botões apontam para eles).
async function buscarJogosBusca(termo, area, aindaVale) {
  area.innerHTML = '<p class="mensagem carregando">Buscando jogos</p>';
  let r = await api.buscarJogos(termo);
  let aviso = '';
  if (!r.ok && r.erro && r.erro.tipo === 'chave') {
    r = await api.buscarJogosSteam(termo);
    aviso = '<p class="mensagem aviso-fonte-jogo">Sem as chaves da IGDB, só aparecem jogos da Steam. Para achar jogos de todos os consoles, coloque as chaves em Configurações &gt; nandplay.</p>';
  }
  if (!aindaVale()) return [];
  if (!r.ok) {
    area.innerHTML = `${aviso}<p class="mensagem">${esc(r.erro && r.erro.tipo === 'chave' ? r.erro.mensagem : 'Sem conexão para buscar jogos. Verifique a internet e tente de novo.')}</p>`;
    return [];
  }
  const itens = r.dados || [];
  area.innerHTML = `${aviso}${itens.length
    ? `<div class="resultados resultados-jogos">${resultadosJogosHTML(itens)}</div>`
    : '<p class="mensagem">Nada encontrado. Tente o nome em inglês.</p>'}`;
  return itens;
}

// Clicou num resultado da busca de jogos. O Lote da página do jogo define abrirJogoFora (o jogo
// fora da lista, com o botão de adicionar); sem ele, adiciona direto.
async function escolherJogoNaBusca(escolha, botao) {
  const ja = jogoNaLista(escolha);
  if (ja) { fecharModal(); aviso(`“${ja.titulo}” já está na sua lista.`); abrirPainel(ja.id); return; }
  if (typeof abrirJogoFora === 'function') { fecharModal(); abrirJogoFora(escolha.igdb || null, escolha); return; }
  botao.classList.add('carregando');
  const novo = await adicionarJogo(escolha);
  botao.classList.remove('carregando');
  if (!novo) { aviso('Não consegui adicionar esse jogo agora.', { tipo: 'erro' }); return; }
  fecharModal();
  abrirPainel(novo.id);
  aviso(`“${novo.titulo}” foi adicionado.`, { tipo: 'ok' });
}

// "Adicionar sem buscar", no nandplay: um jogo só com o nome.
async function adicionarJogoSemBuscar(titulo) {
  const novo = await adicionarJogo({ titulo });
  if (!novo) return;
  fecharModal();
  abrirPainel(novo.id);
  aviso(`“${novo.titulo}” foi adicionado.`, { tipo: 'ok' });
}

// O que a pesquisa da lista também procura num jogo: console, tags, desenvolvedor e gênero.
const extraBuscaJogo = (f) => (ehJogo(f) ? [...consolesDoJogo(f), ...tagsDoJogo(f), ...desenvolvedoresDoJogo(f), ...(f.generos || []), rotuloStatusJogo(statusDoJogo(f))] : []);

// ---- Imagens (a capa que falha cai na cabeçalho da Steam) ----
//
// O tratador de erro do app.js lê data-alt: a capa em pé (library_600x900) não existe em jogos
// novos; o cabeçalho (horizontal) sempre existe.
const imagemAlternativaDoJogo = (f) => {
  const id = Number(f.steam);
  return f.cabecalho || (Number.isSafeInteger(id) && id > 0 ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg` : '');
};

// ---- O cartão do jogo ----

const tituloFilaJogo = (naLista) => (naLista ? 'Tirar da fila de hoje' : 'Quero jogar hoje');

function jogoCartaoHTML(f) {
  const naFila = naWatchlist(f.id);
  const devs = desenvolvedoresDoJogo(f).slice(0, 2).join(', ');
  const consoles = consolesDoJogo(f);
  const tags = tagsJogoHTML(f, 3);
  const meta = [f.ano, consoles.slice(0, 4).join(', ')].filter(Boolean).join(' · ');
  return `
    <article class="cartao cartao-jogo" data-id="${f.id}" tabindex="0" aria-label="${esc(f.titulo)}${f.ano ? ` (${esc(f.ano)})` : ''}">
      <div class="capa-area">
        ${capaHTML(f)}
        <div class="selos-jogo">${seloStatusJogoHTML(f)}${tagsJogoHTML(f, 1)}</div>
        ${f.favorito ? `<span class="selo-fav" title="Favorito">${icone('Star', { preenchido: true })}</span>` : ''}
        ${naFila ? seloHojeHTML() : ''}
      </div>
      <div class="info">
        <h3 title="${esc(f.titulo)}"><span>${esc(f.titulo)}</span></h3>
        <p class="info-meta">${esc(meta)}</p>
        <span class="info-ano">${esc(f.ano)}</span>
        <span class="info-diretor info-dev" title="${esc(devs)}">${esc(devs)}</span>
        <span class="info-status-jogo">${seloStatusJogoHTML(f)}${tags}</span>
      </div>
      <div class="acoes">
        <button class="acao${f.favorito ? ' fav-on' : ''}" data-acao="favorito" title="${f.favorito ? 'Tirar dos favoritos' : 'Favoritar'}" aria-label="${f.favorito ? 'Tirar dos favoritos' : 'Favoritar'}">${icone('Star', { preenchido: f.favorito })}</button>
        <button class="acao${naFila ? ' hoje-on' : ''}" data-acao="hoje" title="${tituloFilaJogo(naFila)}" aria-label="${tituloFilaJogo(naFila)}">${icone('CalendarClock')}</button>
        ${f.steam ? `<button class="acao acao-steam" data-acao="steam" title="${rotuloAcaoSteam(acaoSteamDoJogo(f))}" aria-label="${rotuloAcaoSteam(acaoSteamDoJogo(f))}">${icone('Gamepad2')}</button>` : ''}
      </div>
    </article>`;
}

// O que muda no cartão do jogo sem recriá-lo (as capas não piscam).
function atualizarCartaoJogo(el, f) {
  const area = $('.capa-area', el);
  $('.selo-fav', area)?.remove();
  $('.selo-hoje', area)?.remove();
  if (f.favorito) area.insertAdjacentHTML('beforeend', `<span class="selo-fav" title="Favorito">${icone('Star', { preenchido: true })}</span>`);
  const naFila = naWatchlist(f.id);
  if (naFila) area.insertAdjacentHTML('beforeend', seloHojeHTML());
  const fav = $('.acao[data-acao="favorito"]', el);
  fav.classList.toggle('fav-on', Boolean(f.favorito));
  fav.title = f.favorito ? 'Tirar dos favoritos' : 'Favoritar';
  fav.setAttribute('aria-label', fav.title);
  fav.innerHTML = icone('Star', { preenchido: f.favorito });
  const hojeB = $('.acao[data-acao="hoje"]', el);
  hojeB.classList.toggle('hoje-on', naFila);
  hojeB.title = tituloFilaJogo(naFila);
  hojeB.setAttribute('aria-label', hojeB.title);
  const steamB = $('.acao[data-acao="steam"]', el);
  if (steamB) { steamB.title = rotuloAcaoSteam(acaoSteamDoJogo(f)); steamB.setAttribute('aria-label', steamB.title); }
}

// Quem recria o cartão do jogo: o status e as tags (selos), o resto (ano, plataformas…). Favorito e fila de
// hoje mudam no lugar (estadoCartao, do app.js, já os enxerga).
const cartaoHTMLFilme = cartaoHTML;
cartaoHTML = (f) => (ehJogo(f) ? jogoCartaoHTML(f) : cartaoHTMLFilme(f));
const assinaturaFilme = assinatura;
assinatura = (f) => (ehJogo(f)
  ? [assinaturaFilme(f), statusDoJogo(f), tagsDoJogo(f).join('\u0002'), consolesDoJogo(f).join(','), desenvolvedoresDoJogo(f).join(',')].join('\u0001')
  : assinaturaFilme(f));
const atualizarCartaoFilme = atualizarCartao;
atualizarCartao = (el, f) => (ehJogo(f) ? atualizarCartaoJogo(el, f) : atualizarCartaoFilme(el, f));

// A capa do jogo: a da IGDB/Steam fica em poster (e capa); sem ela, o quadro com o título.
const srcCapaFilme = srcCapa;
srcCapa = (f) => (ehJogo(f) && !f.capaLocal ? (f.poster || f.capa || '') : srcCapaFilme(f));
const capaHTMLFilme = capaHTML;
capaHTML = (f, opcoes) => {
  const html = capaHTMLFilme(f, opcoes);
  const alt = ehJogo(f) ? imagemAlternativaDoJogo(f) : '';
  return alt ? html.replace('<img ', `<img data-alt="${esc(alt)}" `) : html;
};

// O destaque e a prévia do jogo.
const metaHTMLFilme = metaHTML;
metaHTML = (f) => {
  if (!ehJogo(f)) return metaHTMLFilme(f);
  const partes = [(f.generos || []).slice(0, 2).join(', '), f.ano, consolesDoJogo(f).slice(0, 4).join(' · '), horasLegiveis(f.tempoZerar) && `${horasLegiveis(f.tempoZerar)} para zerar`].filter(Boolean);
  return partes.map((p) => `<span>${esc(p)}</span>`).join('') + (f.favorito ? '<span style="color:var(--dourado)">★ Favorito</span>' : '');
};
const metaCurtaHTMLFilme = metaCurtaHTML;
metaCurtaHTML = (f) => {
  if (!ehJogo(f)) return metaCurtaHTMLFilme(f);
  return [f.ano, horasLegiveis(f.tempoZerar)].filter(Boolean).map((p) => `<span>${esc(p)}</span>`).join('') + seloStatusJogoHTML(f);
};
const creditosHTMLFilme = creditosHTML;
creditosHTML = (f) => {
  if (!ehJogo(f)) return creditosHTMLFilme(f);
  const devs = desenvolvedoresDoJogo(f).slice(0, 3).join(', ');
  return devs ? `<b>Desenvolvedor:</b> ${esc(devs)}` : '';
};
// Nota do jogo (a média da IGDB, 0 a 100), no lugar dos selos de filme.
const notasHTMLFilme = notasHTML;
notasHTML = (info, f = {}) => {
  if (!ehJogo(f)) return notasHTMLFilme(info, f);
  return Number.isFinite(f.nota) && f.nota > 0 ? `<span class="nota-chip" title="Nota média na IGDB"><span class="marca-anilist">IGDB</span>${f.nota}</span>` : '';
};
const fundoDesfocadoFilme = fundoDesfocado;
fundoDesfocado = (el, f) => {
  if (!ehJogo(f) || !(f.fundo || f.capa)) { fundoDesfocadoFilme(el, f); return; }
  // O fundo do jogo (arte da IGDB ou o fundo da Steam) é horizontal: serve de fundo do destaque.
  $('.destaque-fundo-capa', el).style.backgroundImage = `url("${String(f.fundo || f.capa).replace(/"/g, '%22')}")`;
};

// Destaque: no jogo, o botão grande abre a Steam, e sem "visto" nem Letterboxd.
const mostrarDestaqueFilme = mostrarDestaque;
mostrarDestaque = (opcoes = {}) => {
  mostrarDestaqueFilme(opcoes);
  const f = porId(filmeNoDestaque());
  if (!f || !ehJogo(f)) return;
  const sinopse = $('#destaque [data-info="sinopse"]'); // a sinopse do jogo está no item (f.sinopse), não em f.info
  if (sinopse && f.sinopse) { sinopse.textContent = f.sinopse; sinopse.hidden = false; }
  const botoes = $('#destaque .destaque-botoes');
  if (!botoes) return;
  $('[data-d="letterboxd"]', botoes)?.remove();
  $('[data-d="visto"]', botoes)?.remove();
  const assistir = $('[data-d="assistir"]', botoes);
  if (f.steam) {
    assistir.dataset.d = 'steam';
    assistir.innerHTML = `${icone('Gamepad2')} ${rotuloAcaoSteam(acaoSteamDoJogo(f))}`;
  } else assistir.remove();
};
$('#destaque').addEventListener('click', (e) => {
  const b = e.target.closest('[data-d="steam"]');
  if (b) abrirSteamDoJogo(filmeNoDestaque());
});

const previaHTMLFilme = previaHTML;
previaHTML = (f) => {
  if (!ehJogo(f)) return previaHTMLFilme(f);
  const naFila = naWatchlist(f.id);
  return `
    <div class="previa-video" data-v="focar" title="Clique para ver em tela cheia">
      <div class="destaque-fundo-capa"></div>
      <div class="previa-titulo">${esc(f.titulo)}</div>
      <button class="btn-redondo" data-v="som" title="${tituloSom()}" hidden>${iconeSom()}</button>
    </div>
    <div class="previa-corpo">
      <div class="previa-botoes">
        ${f.steam ? `<button class="redondo branco" data-v="steam" title="${rotuloAcaoSteam(acaoSteamDoJogo(f))}">${icone('Gamepad2')}</button>` : ''}
        <button class="redondo${f.favorito ? ' fav-on' : ''}" data-v="favorito" title="${f.favorito ? 'Tirar dos favoritos' : 'Favoritar'}" aria-label="Favorito">${icone('Star')}</button>
        <button class="redondo${naFila ? ' hoje-on' : ''}" data-v="hoje" title="${tituloFilaJogo(naFila)}" aria-label="${tituloFilaJogo(naFila)}">${icone('CalendarClock')}</button>
        <span class="espaco"></span>
        <button class="redondo" data-v="detalhes" title="Mais informações">${ICONE_MAIS_INFO}</button>
      </div>
      <div class="meta-linha" data-info="meta">${metaCurtaHTML(f)}</div>
      <div class="generos" data-info="generos">${esc((f.generos || []).slice(0, 3).join(' • '))}</div>
      <div class="notas-linha" data-info="notas">${notasHTML(f.info, f)}</div>
      ${desenvolvedoresDoJogo(f).length ? `<p class="creditos">${creditosHTML(f)}</p>` : ''}
      ${tagsDoJogo(f).length ? `<div class="tags-jogo-linha">${tagsJogoHTML(f, 4)}</div>` : ''}
    </div>`;
};
$('#previa').addEventListener('click', (e) => {
  const b = e.target.closest('[data-v="steam"]');
  if (b && previaId) abrirSteamDoJogo(previaId);
});

// Os botões do cartão que não existem nos filmes.
principal.addEventListener('click', (e) => {
  const botao = e.target.closest('.cartao-jogo [data-acao="steam"]');
  if (botao) abrirSteamDoJogo(botao.closest('.cartao').dataset.id);
});

// ---- Filtros e ordenações ----

// Filtros só do jogo (estado.consoleJogo, estado.tagJogo e estado.steamJogo, mais os chips
// 'status:…'). Fora do jogo, nada muda: quem não é jogo some quando um desses está ligado.
Object.assign(estado, { consoleJogo: '', tagJogo: '', steamJogo: '' });

function passaFiltrosJogo(f, filtro) {
  const status = typeof filtro === 'string' && filtro.startsWith('status:') ? filtro.slice(7) : '';
  const ligado = status || estado.consoleJogo || estado.tagJogo || estado.steamJogo;
  if (!ligado) return true;
  if (!ehJogo(f)) return false;
  if (status && statusDoJogo(f) !== status) return false;
  if (estado.consoleJogo && !consolesDoJogo(f).includes(estado.consoleJogo)) return false;
  if (estado.tagJogo && !tagsDoJogo(f).includes(estado.tagJogo)) return false;
  if (estado.steamJogo === 'steam' && !f.steam) return false;
  if (estado.steamJogo === 'instalados' && !appidsInstalados().has(Number(f.steam))) return false;
  if (estado.steamJogo === 'biblioteca') { const bib = appidsNaBiblioteca(); if (bib && !bib.has(Number(f.steam))) return false; }
  return true;
}
const passaFiltroAnimeOriginal = passaFiltroAnime;
passaFiltroAnime = (f, filtro) => passaFiltroAnimeOriginal(f, filtro) && passaFiltrosJogo(f, filtro);

// Ordenações do nandplay (as de filme que fazem sentido, mais o tempo para zerar).
const nota100Jogo = (f) => (Number(f.minhaNota) > 0 ? Number(f.minhaNota) * 20 : (Number.isFinite(f.nota) ? f.nota : -1));
const ORDENS_JOGO = {
  nota: (a, b) => nota100Jogo(b) - nota100Jogo(a) || a.titulo.localeCompare(b.titulo, 'pt', { sensitivity: 'base' }),
  // Os mais curtos primeiro; sem o tempo, no fim.
  tempo: (a, b) => (Number(a.tempoZerar) || 1e9) - (Number(b.tempoZerar) || 1e9) || a.titulo.localeCompare(b.titulo, 'pt', { sensitivity: 'base' }),
};
const OPCOES_ORDEM_JOGO = [['ordem', 'Ordem original'], ['titulo', 'Nome'], ['ano', 'Ano'], ['recentes', 'Adicionados recentemente'], ['nota', 'Nota'], ['tempo', 'Tempo para zerar']];
const filtradosFilme = filtrados;
filtrados = () => {
  const lista = filtradosFilme();
  return ehPlataformaJogos() && ORDENS_JOGO[estado.ordenacao] ? lista.sort(ORDENS_JOGO[estado.ordenacao]) : lista;
};

// Seções do menu "Filtros": console, tags e Steam (só onde há jogos: o nandplay e o hub com ele).
const itensJogosDaPlataforma = () => itensDaPlataforma().filter(ehJogo);
function contagens(extrair) {
  const m = new Map();
  for (const f of itensJogosDaPlataforma()) for (const c of new Set(extrair(f))) m.set(c, (m.get(c) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt'));
}

// O chip com ✕ de um filtro ligado, criado quando precisa (como o de diretor e o de país).
function chipFiltroJogo(id, nomeIcone, texto, ligado, desligar) {
  let chip = $(`#${id}`);
  if (!chip) {
    chip = document.createElement('button');
    Object.assign(chip, { id, className: 'chip chip-diretor', type: 'button', hidden: true });
    chip.addEventListener('click', desligar);
    $('#btn-listas').before(chip);
  }
  chip.hidden = !ligado;
  if (ligado) chip.innerHTML = `${icone(nomeIcone)}<span>${esc(texto)}</span>${icone('X')}`;
}
function ligarFiltroJogo(campo, valor) {
  estado[campo] = estado[campo] === valor ? '' : valor;
  aplicarFiltroDaBarra();
}

SECOES_FILTRO.push({
  titulo: 'Console',
  recurso: 'jogos',
  ativa: () => Boolean(estado.consoleJogo),
  atualizarChip: () => chipFiltroJogo('chip-console', 'Gamepad2', estado.consoleJogo, Boolean(estado.consoleJogo) && plataformaTem('jogos'), () => ligarFiltroJogo('consoleJogo', estado.consoleJogo)),
  itensHTML: () => contagens(consolesDoJogo).map(([c, n]) => itemMenuHTML(estado.consoleJogo === c, `data-console-jogo="${esc(c)}"`, esc(c), n)).join('') || '<p class="tl-menu-vazio">Nenhum console ainda.</p>',
  aoClicar: (e) => {
    const b = e.target.closest('[data-console-jogo]');
    if (!b) return false;
    ligarFiltroJogo('consoleJogo', b.dataset.consoleJogo);
    return true;
  },
});
SECOES_FILTRO.push({
  titulo: 'Tags',
  recurso: 'jogos',
  ativa: () => Boolean(estado.tagJogo),
  atualizarChip: () => chipFiltroJogo('chip-tag-jogo', 'Tag', estado.tagJogo, Boolean(estado.tagJogo) && plataformaTem('jogos'), () => ligarFiltroJogo('tagJogo', estado.tagJogo)),
  itensHTML: () => contagens(tagsDoJogo).map(([t, n]) => itemMenuHTML(estado.tagJogo === t, `data-tag-jogo="${esc(t)}"`, esc(t), n)).join('') || '<p class="tl-menu-vazio">Você ainda não criou tags.</p>',
  aoClicar: (e) => {
    const b = e.target.closest('[data-tag-jogo]');
    if (!b) return false;
    ligarFiltroJogo('tagJogo', b.dataset.tagJogo);
    return true;
  },
});
const ROTULOS_STEAM_JOGO = { steam: 'Na Steam', instalados: 'Instalados', biblioteca: 'Na biblioteca' };
SECOES_FILTRO.push({
  titulo: 'Steam',
  recurso: 'jogos',
  ativa: () => Boolean(estado.steamJogo),
  atualizarChip: () => chipFiltroJogo('chip-steam-jogo', 'Gamepad2', ROTULOS_STEAM_JOGO[estado.steamJogo], Boolean(estado.steamJogo) && plataformaTem('jogos'), () => ligarFiltroJogo('steamJogo', estado.steamJogo)),
  itensHTML: () => {
    const jogos = itensJogosDaPlataforma();
    const bib = appidsNaBiblioteca();
    const instalados = appidsInstalados();
    const linhas = [['steam', jogos.filter((f) => f.steam).length]];
    if (steamDaLista.local && steamDaLista.local.steamNoPc) linhas.push(['instalados', jogos.filter((f) => instalados.has(Number(f.steam))).length]);
    if (bib) linhas.push(['biblioteca', jogos.filter((f) => bib.has(Number(f.steam))).length]); // só com a chave e o perfil da Steam
    return linhas.map(([k, n]) => itemMenuHTML(estado.steamJogo === k, `data-steam-jogo="${k}"`, ROTULOS_STEAM_JOGO[k], n)).join('');
  },
  aoClicar: (e) => {
    const b = e.target.closest('[data-steam-jogo]');
    if (!b) return false;
    ligarFiltroJogo('steamJogo', b.dataset.steamJogo);
    return true;
  },
});
// Os filtros de jogo não valem onde não há jogos (outra plataforma): desligam.
function limparFiltrosJogoSeForaDoLugar() {
  if (plataformaTem('jogos')) return;
  Object.assign(estado, { consoleJogo: '', tagJogo: '', steamJogo: '' });
}

// ---- A tela principal no nandplay: chips, ordenação, textos e estado vazio ----

let opcoesOrdemPadrao = null;
let ordemDeFora = null; // a ordenação escolhida fora do nandplay, para voltar a ela
let ultimaVezNoNandplay = false;

function aplicarJogosLista() {
  const jogos = ehPlataformaJogos();
  limparFiltrosJogoSeForaDoLugar();

  // Chips do filtro: no nandplay, "Zerados" e os status; sem os de filme e anime.
  for (const c of $$('.chip[data-filtro]')) {
    const f = c.dataset.filtro;
    if (c.dataset.soJogos !== undefined) c.hidden = !jogos;
    else if (jogos && (f === 'animes' || f === 'assistindo')) c.hidden = true;
    if (f === 'vistos' || f === 'nao-vistos') {
      if (c.dataset.rotuloPadrao === undefined) c.dataset.rotuloPadrao = c.textContent;
      c.textContent = jogos ? (f === 'vistos' ? 'Zerados' : 'Não zerados') : c.dataset.rotuloPadrao;
    }
  }
  if (!jogos && String(estado.filtro).startsWith('status:')) {
    estado.filtro = 'todos';
    for (const c of $$('.chip[data-filtro]')) { c.classList.toggle('ativo', c.dataset.filtro === 'todos'); c.setAttribute('aria-checked', String(c.dataset.filtro === 'todos')); }
  }
  const agenda = $('#btn-agenda');
  if (agenda && jogos) agenda.hidden = true;

  // Ordenação: no nandplay, a lista própria (nome, nota, tempo para zerar…).
  const sel = $('#ordenacao');
  if (opcoesOrdemPadrao === null) opcoesOrdemPadrao = sel.innerHTML;
  if (jogos !== (sel.dataset.opcoes === 'jogos')) {
    sel.innerHTML = jogos ? OPCOES_ORDEM_JOGO.map(([v, t]) => `<option value="${v}">${t}</option>`).join('') : opcoesOrdemPadrao;
    sel.dataset.opcoes = jogos ? 'jogos' : 'padrao';
    if (jogos) {
      ordemDeFora = estado.ordenacao;
      if (!OPCOES_ORDEM_JOGO.some(([v]) => v === estado.ordenacao)) estado.ordenacao = 'ordem';
    } else if (ultimaVezNoNandplay && ordemDeFora) {
      estado.ordenacao = ordemDeFora;
    }
    sel.value = estado.ordenacao;
  }
  ultimaVezNoNandplay = jogos;

  $('#pesquisa').placeholder = jogos ? 'Nome, ano, console ou tag' : 'Título, ano, diretor ou notas';
  const dicaSem = $('#sem-resultados .sem-rodape span');
  if (dicaSem) dicaSem.textContent = jogos ? 'Busque por nome, ano, console, desenvolvedor ou tag.' : 'Busque por título, ano, diretor ou notas.';
  aplicarVazioDaPlataforma();
  pedirSteamDaLista();
}

// A lista da plataforma está vazia (mesmo que as outras tenham itens): convida a adicionar.
function aplicarVazioDaPlataforma() {
  const caixa = $('#vazio');
  if (!caixa) return;
  const originalFilmes = !estado.filmes.length && plataformaAtual().id === 'nandflix'; // a lista toda vazia: importar planilha
  const titulo = $('h2', caixa);
  if (titulo.dataset.original === undefined) titulo.dataset.original = titulo.textContent;
  $('#btn-importar-vazio').hidden = !originalFilmes;
  $('#btn-importar-app-vazio').hidden = !originalFilmes;
  const dica = $('.vazio-dir p', caixa);
  if (dica.dataset.original === undefined) dica.dataset.original = dica.textContent;
  const adicionar = $('#btn-adicionar-vazio');
  $('.vazio-acoes', caixa).classList.toggle('so-adicionar', !originalFilmes);
  adicionar.classList.toggle('btn-primario', !originalFilmes);
  adicionar.classList.toggle('btn-grande', !originalFilmes);
  adicionar.classList.toggle('link-forte', originalFilmes);
  if (originalFilmes) {
    titulo.textContent = titulo.dataset.original;
    dica.textContent = dica.dataset.original;
    adicionar.textContent = vocTexto('ou adicione {um}');
    return;
  }
  titulo.textContent = `${voc('nenhum')} ainda`;
  dica.textContent = ehPlataformaJogos()
    ? 'Busque o jogo e adicione: ele entra como “Quero jogar”. Depois é só mudar o status.'
    : vocTexto('Busque e adicione {itens} para começar.');
  adicionar.innerHTML = `${icone('Plus')} ${esc(voc('Adicionar'))}`;
}

const aplicarNandrollOriginal = aplicarNandroll;
aplicarNandroll = () => { aplicarNandrollOriginal(); aplicarJogosLista(); };

// Contagem de zerados (no lugar de "vistos") e sem o "Buscar capas que faltam" do TMDB.
const atualizarEstatisticasOriginal = atualizarEstatisticas;
atualizarEstatisticas = () => {
  atualizarEstatisticasOriginal();
  if (!ehPlataformaJogos()) {
    // Jogo não tem capa no TMDB: o botão conta só filmes e animes.
    const semCapa = estado.filmes.filter((f) => !ehJogo(f) && !f.poster && !f.capaPersonalizada).length;
    const btn = $('#btn-capas-faltam');
    btn.hidden = !semCapa || estado.buscandoCapas;
    btn.innerHTML = `${icone('ImagePlus')}<span>Buscar capas que faltam (${semCapa})</span>`;
    return;
  }
  const lista = itensDaPlataforma();
  const zerados = lista.filter((f) => f.visto).length;
  $('#est-vistos-texto').textContent = `${zerados} de ${lista.length} zerados (${lista.length ? Math.round((zerados / lista.length) * 100) : 0}%)`;
  $('#btn-capas-faltam').hidden = true;
};
const renderFileiraOriginal = renderFileira;
renderFileira = () => {
  renderFileiraOriginal();
  if (ehPlataformaJogos()) { const k = $('#kicker-favoritos'); k.textContent = k.textContent.replace(/ vistos?$/, ' zerados'); }
};

// O que a Steam diz (instalados, biblioteca) é lido na primeira vez que a tela mostra jogos; depois,
// quando a biblioteca atualiza e ao voltar para o app (o que está instalado muda fora dele).
let steamDaListaPedida = false;
function pedirSteamDaLista() {
  if (steamDaListaPedida || !plataformaTem('jogos')) return;
  steamDaListaPedida = true;
  carregarSteamDaLista().then(() => render());
  if (api.aoBibliotecaSteam) api.aoBibliotecaSteam(() => carregarSteamDaLista().then(() => render()));
  let ultimoFoco = Date.now();
  window.addEventListener('focus', () => {
    if (!plataformaTem('jogos') || Date.now() - ultimoFoco < 20000) return;
    ultimoFoco = Date.now();
    carregarSteamDaLista({ forcar: true }).then(() => render());
  });
}

// Um jogo abre a página do jogo (abrirPainelJogo, do lote da página); sem ela, o painel de sempre.
const abrirPainelFilme = abrirPainel;
let abrindoPainelJogo = false;
abrirPainel = (id, opcoes) => {
  const f = porId(id);
  if (ehJogo(f) && typeof abrirPainelJogo === 'function' && !abrindoPainelJogo) {
    abrindoPainelJogo = true;
    try { return abrirPainelJogo(f, opcoes); } finally { abrindoPainelJogo = false; }
  }
  return abrirPainelFilme(id, opcoes);
};
