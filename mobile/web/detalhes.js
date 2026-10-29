'use strict';

// ---------- Detalhes do filme no celular ----------
//
// O painel é o mesmo do PC (renderPainel); depois de desenhado, as peças são
// rearrumadas na ordem de um app de streaming no celular:
//   barra com ← | trailer | logo | ano · classificação · duração |
//   Assistir | Escrever sobre o filme | sinopse e fichas | ícones com nome |
//   sua nota, listas, vistos… | abas "Do diretor" e "Mais como este".

const ROTULOS_ICONES = {
  story: 'Story', visto: 'Visto', favorito: 'Favorito', hoje: 'Hoje', letterboxd: 'Letterboxd', trailer: 'Trailer',
};

function rearrumarPainel() {
  const painel = $('#painel');
  const cab = $('.painel-cabecalho', painel);
  if (!cab) return;

  // ← no lugar do ✕
  const fechar = $('.painel-fechar', painel);
  if (fechar && !fechar.dataset.cel) { fechar.innerHTML = icone('ArrowLeft'); fechar.dataset.cel = '1'; }

  // Ano · classificação · duração logo abaixo do título
  const identidade = $('.destaque-identidade', cab);
  const meta = $('.painel-corpo .painel-meta', painel);
  $('.cel-det-meta', cab)?.remove();
  if (meta && identidade) {
    meta.classList.add('cel-det-meta');
    identidade.after(meta);
  }

  // Os ícones redondos saem da fileira dos botões grandes e ganham nome
  const botoes = $('.painel-botoes', cab);
  let acoes = $('.cel-det-acoes', cab);
  if (!acoes && botoes) {
    acoes = document.createElement('div');
    acoes.className = 'cel-det-acoes';
    for (const b of $$('.redondo', botoes)) {
      const nome = ROTULOS_ICONES[b.dataset.p];
      if (nome) b.dataset.rotulo = nome; // nome pelo CSS (::after): o app troca o conteúdo do botão
      acoes.append(b);
    }
    botoes.after(acoes);
  }

  // Sinopse e fichas entre os botões grandes e os ícones
  $('.cel-det-texto', cab)?.remove();
  const texto = document.createElement('div');
  texto.className = 'cel-det-texto';
  const sinopse = $('.painel-corpo .painel-sinopse', painel);
  const fichas = $('.painel-corpo .painel-fichas', painel);
  if (sinopse) texto.append(sinopse);
  if (fichas) texto.append(fichas);
  if (botoes) botoes.after(texto);
}

// eslint-disable-next-line no-func-assign
const renderPainelPc = renderPainel;
// eslint-disable-next-line no-func-assign
renderPainel = function renderPainelCelular() {
  renderPainelPc();
  if (estado.painelId) rearrumarPainel();
};

// "Do diretor" e "Mais como este" viram abas, cada uma com uma grade de capas.
const prepararSetasPc = prepararSetasRelacionados;
// eslint-disable-next-line no-func-assign
prepararSetasRelacionados = function prepararAbasRelacionados() {
  prepararSetasPc();
  const area = $('#painel-relacionados');
  const secoes = area ? $$('.relacionados', area) : [];
  if (!secoes.length || $('.cel-abas', area)) return;
  const nomeAba = (h3) => h3.textContent.replace(/^Outros filmes de /, 'Mais de ');
  const abas = document.createElement('div');
  abas.className = 'cel-abas';
  abas.setAttribute('role', 'tablist');
  abas.innerHTML = secoes.map((s, i) => `<button role="tab" class="cel-aba${i ? '' : ' ativa'}" data-aba="${i}" aria-selected="${!i}">${esc(nomeAba($('h3', s)))}</button>`).join('');
  area.prepend(abas);
  secoes.forEach((s, i) => { s.hidden = i > 0; });
  abas.addEventListener('click', (e) => {
    const b = e.target.closest('.cel-aba');
    if (!b) return;
    for (const a of $$('.cel-aba', abas)) { a.classList.toggle('ativa', a === b); a.setAttribute('aria-selected', a === b); }
    secoes.forEach((s, i) => { s.hidden = String(i) !== b.dataset.aba; });
  });
};
