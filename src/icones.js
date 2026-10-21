'use strict';

// Ícones do Lucide (node_modules/lucide), montados como SVG em linha.
// icone('Play') → '<svg …>'; elementos com data-icone="Nome" são preenchidos ao carregar.
function icone(nome, { preenchido = false, classe = '' } = {}) {
  const no = window.lucide && window.lucide.icons && window.lucide.icons[nome];
  if (!no) return '';
  const attrs = (o) => Object.entries(o).map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ');
  const filhos = no.map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join('');
  return `<svg class="ico${preenchido ? ' ico-cheio' : ''}${classe ? ` ${classe}` : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${filhos}</svg>`;
}

function preencherIcones(raiz = document) {
  for (const el of raiz.querySelectorAll('[data-icone]')) {
    if (el.dataset.iconePronto) continue;
    el.innerHTML = icone(el.dataset.icone, { preenchido: 'preenchido' in el.dataset });
    el.dataset.iconePronto = '1';
  }
}

preencherIcones();
