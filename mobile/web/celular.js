'use strict';

// ---------- Ajustes da interface para o celular ----------
//
// Carregado depois dos scripts do app (só na versão de Android). Troca o que
// no PC vem de arquivos locais (capa://) pelos links da nuvem, liga o botão
// Voltar do Android e marca a página para o CSS de celular (celular.css).

document.documentElement.classList.add('celular');

// Capas e logos: o celular não guarda arquivos, usa os links (TMDB ou nuvem).
// eslint-disable-next-line no-unused-vars
function srcCapa(f) {
  if (f.capaPersonalizada && f.capaNuvem) return api.celular.urlCapa(f.capaNuvem) || f.poster || '';
  return f.poster || '';
}
// eslint-disable-next-line no-unused-vars
function srcLogo(f) {
  return f.logo || '';
}

// Imagens das páginas e shots (capa://foto/<nome>): na tela viram o link da
// nuvem (ou a imagem guardada aqui), mas o texto salvo continua com capa://.
const RE_FOTO_CEL = /^capa:\/\/foto\/([\w.-]+)$/;
function trocarFotos(raiz) {
  const imgs = raiz.matches && raiz.matches('img') ? [raiz] : [...(raiz.querySelectorAll ? raiz.querySelectorAll('img') : [])];
  for (const img of imgs) {
    const src = img.getAttribute('src') || '';
    const m = src.match(RE_FOTO_CEL);
    if (!m) continue;
    const url = api.celular.urlFoto(m[1]);
    if (!url) continue;
    img.dataset.foto = src;
    img.setAttribute('src', url);
  }
}
new MutationObserver((mudancas) => {
  for (const m of mudancas) {
    if (m.type === 'attributes') trocarFotos(m.target);
    else for (const n of m.addedNodes) if (n.nodeType === 1) trocarFotos(n);
  }
}).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

// Ao salvar a página, as imagens voltam para o endereço capa://.
const limparPaginaPc = limparPagina;
// eslint-disable-next-line no-func-assign
limparPagina = function limparPaginaCelular(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html || '');
  for (const img of t.content.querySelectorAll('img[data-foto]')) {
    img.setAttribute('src', img.dataset.foto);
    img.removeAttribute('data-foto');
  }
  return limparPaginaPc(t.innerHTML);
};

// Os links das imagens da nuvem chegaram: redesenha as capas.
api.aoLinksImagens(() => {
  cacheCartoes.clear();
  cacheFileira.clear();
  agendarRender();
  trocarFotos(document.body);
});

// Botão Voltar do Android: fecha o que estiver aberto (como o Esc no PC); sem
// nada aberto, manda o app para o fundo.
api.celular.aoVoltar(() => {
  let mudou = false;
  const obs = new MutationObserver(() => { mudou = true; });
  obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open', 'class'] });
  const alvo = document.activeElement && document.activeElement !== document.body ? document.activeElement : document;
  alvo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  setTimeout(() => {
    obs.disconnect();
    if (!mudou) api.celular.minimizar();
  }, 80);
});

// Versão nova da interface baixada: entra na próxima abertura, ou já, pelo aviso.
api.celular.aoAtualizacao(({ id }) => {
  aviso('Atualização do app baixada. Ela entra na próxima vez que você abrir o app.', {
    duracao: 12000,
    acao: { rotulo: 'Reiniciar agora', fn: () => api.celular.reiniciarComAtualizacao(id) },
  });
});
// Sem a prévia de passar o mouse: no toque, a capa abre direto os detalhes.
// eslint-disable-next-line no-func-assign
abrirPrevia = async function abrirPreviaCelular() {};

// O ✕ das telas por cima (calendário, tierlist, estatísticas, páginas) vira ←
// no canto de cima, como nos detalhes do filme.
const SELETOR_FECHAR = '.cal-fechar, .tl-fechar, .pg-fechar';
function trocarFechar(raiz) {
  const botoes = raiz.matches && raiz.matches(SELETOR_FECHAR) ? [raiz] : [...(raiz.querySelectorAll ? raiz.querySelectorAll(SELETOR_FECHAR) : [])];
  for (const b of botoes) {
    if (b.classList.contains('cel-voltar')) continue;
    b.classList.add('cel-voltar');
    b.innerHTML = icone('ArrowLeft');
    b.setAttribute('aria-label', 'Voltar');
    b.title = 'Voltar';
  }
}
new MutationObserver((mudancas) => {
  for (const m of mudancas) for (const n of m.addedNodes) if (n.nodeType === 1) trocarFechar(n);
}).observe(document.body, { childList: true, subtree: true });

// Stories e retrospectiva: no celular, "Salvar" abre o menu de compartilhar do
// Android (Instagram, WhatsApp, salvar no aparelho…), e o "Copiar" sai.
function trocarSalvar(raiz) {
  if (!raiz.querySelectorAll) return;
  for (const b of raiz.querySelectorAll('[data-s="salvar"], [data-r="salvar"], [data-r="todas"]')) {
    if (b.dataset.celCompartilhar) continue;
    b.dataset.celCompartilhar = '1';
    b.innerHTML = `${icone('Share2')} ${b.dataset.r === 'todas' ? 'Compartilhar todas' : 'Compartilhar'}`;
  }
}
new MutationObserver((mudancas) => {
  for (const m of mudancas) for (const n of m.addedNodes) if (n.nodeType === 1) trocarSalvar(n.parentNode || n);
}).observe(document.body, { childList: true, subtree: true });
