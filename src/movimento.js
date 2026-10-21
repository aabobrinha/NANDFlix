'use strict';

// Movimento da interface: entradas e revelações que tocam uma vez só.
// O CSS deixa tudo visível por padrão; só elementos ainda abaixo da área
// visível ganham um estado inicial escondido (uma animação pausada), que é
// liberado quando entram na tela. Com "reduzir movimento", nada anima.
const Movimento = (() => {
  const reduzido = matchMedia('(prefers-reduced-motion: reduce)');
  const SAIDA = 'cubic-bezier(0.16, 1, 0.3, 1)';
  const pendentes = new Map(); // elemento → animação pausada à espera de entrar na tela
  const tocando = new Set(); // animações de entrada desta interface (e só delas)
  let observador = null;
  let raiz = null;

  const QUADROS = {
    // Fileira de favoritos: as capas chegam da direita.
    fileira: { kf: [{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'none' }], duracao: 520 },
    // Grade de capas: crescem levemente no lugar.
    grade: { kf: [{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }], duracao: 450 },
    // Lista compacta: linhas deslizam da esquerda.
    lista: { kf: [{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'none' }], duracao: 450 },
  };

  const desligado = () => reduzido.matches || typeof Element.prototype.animate !== 'function';

  function registrar(anim) {
    tocando.add(anim);
    const sair = () => tocando.delete(anim);
    anim.addEventListener('finish', sair);
    anim.addEventListener('cancel', sair);
    return anim;
  }

  function concluir(el) {
    el.dataset.revelado = '1';
    const anim = pendentes.get(el);
    if (anim) { anim.cancel(); pendentes.delete(el); }
  }

  function aoEntrar(entradas) {
    const visiveis = entradas.filter((e) => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
    let i = 0;
    for (const e of visiveis) {
      const el = e.target;
      observador.unobserve(el);
      el.dataset.revelado = '1';
      const anim = pendentes.get(el);
      pendentes.delete(el);
      if (!anim) continue;
      // Passou direto (rolagem rápida) ou preferência mudou: só mostra.
      if (desligado() || document.visibilityState === 'hidden' || e.boundingClientRect.bottom <= e.rootBounds?.top) {
        anim.cancel();
        continue;
      }
      anim.effect.updateTiming({ delay: Math.min(i * 60, 240) });
      i++;
      registrar(anim);
      anim.play();
    }
  }

  // A janela abre escondida (ready-to-show): nada foi desenhado ainda, então a
  // preparação espera a janela aparecer em vez de dar tudo como revelado.
  const adiados = new Map(); // elemento → tipo

  function iniciar(elementoRaiz) {
    raiz = elementoRaiz;
    if (typeof IntersectionObserver === 'function') {
      observador = new IntersectionObserver(aoEntrar, { root: raiz, threshold: 0, rootMargin: '0px 0px 96px 0px' });
    }
    reduzido.addEventListener('change', () => { if (reduzido.matches) parar(); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !adiados.size) return;
      const porTipo = {};
      for (const [el, tipo] of adiados) (porTipo[tipo] ||= []).push(el);
      adiados.clear();
      requestAnimationFrame(() => { for (const tipo in porTipo) observar(porTipo[tipo], tipo); });
    });
  }

  // Prepara os elementos ainda não revelados. Os que já estão na tela ficam visíveis.
  function observar(elementos, tipo) {
    const q = QUADROS[tipo];
    if (!q) return;
    const limite = raiz ? raiz.getBoundingClientRect().bottom : innerHeight;
    for (const el of elementos) {
      if (el.dataset.revelado === '1' || pendentes.has(el)) continue;
      if (document.visibilityState === 'hidden' && !desligado()) { adiados.set(el, tipo); continue; }
      if (desligado() || !observador || !el.isConnected) { concluir(el); continue; }
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.top < limite) { concluir(el); continue; }
      const anim = el.animate(q.kf, { duration: q.duracao, easing: SAIDA, fill: 'backwards' });
      anim.pause();
      pendentes.set(el, anim);
      observador.observe(el);
    }
  }

  // Sequência de entrada (destaque, estados vazios): cada item sobe com atraso de `passo` ms.
  function sequencia(itens, { y = 16, x = 0, duracao = 500, passo = 60, atrasoInicial = 0 } = {}) {
    if (desligado()) return;
    itens.filter(Boolean).forEach((el, i) => {
      registrar(el.animate(
        [{ opacity: 0, transform: `translate(${x}px, ${y}px)` }, { opacity: 1, transform: 'none' }],
        { duration: duracao, delay: atrasoInicial + Math.min(i * passo, 240), easing: SAIDA, fill: 'backwards' },
      ));
    });
  }

  function animar(el, quadros, opcoes) {
    if (desligado() || !el) return null;
    return registrar(el.animate(quadros, { easing: SAIDA, ...opcoes }));
  }

  // Troca de conteúdo com "reduzir movimento": só um cruzamento curto de opacidade.
  function cruzar(el, duracao = 120) {
    if (!el || typeof el.animate !== 'function') return;
    registrar(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: duracao, easing: 'linear' }));
  }

  // Cancela só as animações desta interface e devolve tudo visível.
  function parar() {
    observador?.disconnect();
    for (const el of adiados.keys()) el.dataset.revelado = '1';
    adiados.clear();
    for (const [el, anim] of pendentes) { anim.cancel(); el.dataset.revelado = '1'; }
    pendentes.clear();
    for (const anim of [...tocando]) anim.finish();
    tocando.clear();
  }

  return { iniciar, observar, sequencia, animar, cruzar, parar, reduzido, desligado };
})();
