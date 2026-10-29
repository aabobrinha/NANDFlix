'use strict';

// ---------- Tierlist no celular ----------
//
// No celular a tierlist é uma página só, que rola inteira (sem caixas rolando
// dentro de caixas), com a bandeja "Sem tier" presa embaixo. Para o dedo
// conseguir rolar por cima das capas, arrastar uma capa começa num toque
// longo: segurar um instante, a capa "levanta" (e o celular vibra), e aí é só
// levar para a tier. Depois disso, o arrasto é o mesmo do PC (app.js).

const TOQUE_LONGO_MS = 320;
let toqueLongo = null; // { capa, x0, y0, timer, pronto }

function cancelarToqueLongo() {
  if (!toqueLongo) return;
  clearTimeout(toqueLongo.timer);
  toqueLongo.capa.classList.remove('tl-levantada');
  toqueLongo = null;
}

// Em captura: chega antes do pointerdown do app.js, que começaria o arrasto já.
tierlist.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  const capa = e.target.closest('.tl-capa');
  if (!capa) return;
  e.stopPropagation();
  cancelarToqueLongo();
  const t = { capa, x0: e.clientX, y0: e.clientY, pronto: false };
  t.timer = setTimeout(() => {
    t.pronto = true;
    capa.classList.add('tl-levantada');
    if (navigator.vibrate) navigator.vibrate(12);
    // A partir daqui, o arrasto do app.js segue sozinho com os pointermove.
    arrastoTl = { el: capa, x0: t.x0, y0: t.y0, ativo: false };
  }, TOQUE_LONGO_MS);
  toqueLongo = t;
}, true);

document.addEventListener('pointermove', (e) => {
  if (!toqueLongo || toqueLongo.pronto) return;
  // Mexeu antes da hora: é rolagem, não arrasto.
  if (Math.hypot(e.clientX - toqueLongo.x0, e.clientY - toqueLongo.y0) > 8) cancelarToqueLongo();
});

// Com a capa levantada, o dedo não rola mais a tela: ele leva a capa.
document.addEventListener('touchmove', (e) => {
  if (toqueLongo && toqueLongo.pronto) e.preventDefault();
}, { passive: false });

function soltarToqueLongo() {
  if (!toqueLongo) return;
  const { pronto, capa } = toqueLongo;
  capa.classList.remove('tl-levantada');
  // Segurou e soltou sem arrastar: não abre os detalhes.
  if (pronto && arrastoTl && !arrastoTl.ativo) {
    arrastoTl = null;
    ignorarCliqueTl = true;
    setTimeout(() => { ignorarCliqueTl = false; }, 0);
  }
  clearTimeout(toqueLongo.timer);
  toqueLongo = null;
}
document.addEventListener('pointerup', soltarToqueLongo, true);
document.addEventListener('pointercancel', soltarToqueLongo, true);

// O toque longo não abre o menu do Android nem seleciona texto.
tierlist.addEventListener('contextmenu', (e) => { if (e.target.closest('.tl-capa')) e.preventDefault(); });

// Levando uma capa perto do alto ou do pé da tela, a página rola sozinha.
document.addEventListener('pointermove', (e) => {
  if (!arrastoTl || !arrastoTl.ativo) return;
  const caixa = $('#tierlist-caixa');
  const bandeja = $('.tl-bandeja', caixa);
  const topo = $('.tl-topo', caixa).getBoundingClientRect().bottom;
  const pe = bandeja ? bandeja.getBoundingClientRect().top : innerHeight;
  if (e.clientY < topo + 50) caixa.scrollTop -= 12;
  else if (e.clientY > pe - 50 && e.clientY < pe + 10) caixa.scrollTop += 12;
});
