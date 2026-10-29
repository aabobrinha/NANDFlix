'use strict';

// ---------- Página do filme: o seu texto sobre cada filme visto ----------
//
// Um editor simples (títulos, negrito, itálico, citação, listas e divisor)
// que abre por cima de tudo. O texto fica em `f.pagina` como HTML limpo e é
// salvo sozinho enquanto se escreve. No calendário, o dia em que o filme foi
// visto mostra um trecho da página entre aspas, como uma resenha em destaque.

const paginaFilme = $('#pagina-filme');
let paginaId = null;
let timerPagina = null;

// Só estas tags sobrevivem (o resto vira texto ou é trocado pelo equivalente).
const TAGS_PAGINA = new Set(['H2', 'H3', 'P', 'BR', 'B', 'I', 'U', 'S', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'HR', 'IMG']);
// Imagens só as guardadas pelo app (coladas na página), nunca da internet.
const RE_FOTO = /^capa:\/\/foto\/[\w.-]+$/;
const TROCA_TAG = { STRONG: 'B', EM: 'I', STRIKE: 'S', DEL: 'S', DIV: 'P', H1: 'H2', H4: 'H3', H5: 'H3', H6: 'H3' };

const BLOCOS_PAGINA = new Set(['P', 'H2', 'H3', 'BLOCKQUOTE', 'UL', 'OL', 'HR']);

// O editor às vezes põe blocos dentro de um parágrafo ou título (uma lista
// num <p>, ou parágrafos colados num <h2>): os blocos de dentro sobem para o
// nível de cima, e o texto solto continua no bloco de antes. Move os próprios
// nós, então serve também para arrumar o editor aberto.
function desaninharBlocos(raiz) {
  for (const bloco of [...raiz.querySelectorAll('p, h2, h3')]) {
    if (![...bloco.children].some((c) => BLOCOS_PAGINA.has(c.tagName))) continue;
    const pedacos = [];
    let atual = null;
    for (const no of [...bloco.childNodes]) {
      if (no.nodeType === Node.ELEMENT_NODE && BLOCOS_PAGINA.has(no.tagName)) { pedacos.push(no); atual = null; continue; }
      if (!atual) { atual = document.createElement(bloco.tagName); pedacos.push(atual); }
      atual.append(no);
    }
    bloco.replaceWith(...pedacos);
  }
}

function limparPagina(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html || '';
  const copiar = (origem, destino) => {
    for (const no of [...origem.childNodes]) {
      if (no.nodeType === Node.TEXT_NODE) { destino.append(no.textContent); continue; }
      if (no.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = TROCA_TAG[no.tagName] || no.tagName;
      if (!TAGS_PAGINA.has(tag)) { copiar(no, destino); continue; } // span, font…: fica só o texto
      if (tag === 'IMG' && !RE_FOTO.test(no.getAttribute('src') || '')) continue;
      const el = document.createElement(tag);
      if (tag === 'IMG') { el.src = no.getAttribute('src'); el.alt = ''; }
      else if (tag !== 'HR' && tag !== 'BR') copiar(no, el);
      destino.append(el);
    }
  };
  const saida = document.createElement('div');
  copiar(tpl.content, saida);
  desaninharBlocos(saida);
  // Texto solto no nível de cima vira parágrafo.
  for (const no of [...saida.childNodes]) {
    if (no.nodeType === Node.TEXT_NODE && no.textContent.trim()) { const p = document.createElement('p'); no.replaceWith(p); p.append(no); }
    else if (no.nodeType === Node.TEXT_NODE || (no.nodeType === Node.ELEMENT_NODE && no.tagName === 'BR')) no.remove();
  }
  // Linhas vazias não contam: o espaço entre os blocos já vem do estilo.
  for (const el of [...saida.querySelectorAll('p, h2, h3, li, blockquote')]) {
    if (!el.textContent.trim() && !el.querySelector('hr, img')) el.remove();
  }
  for (const lista of [...saida.querySelectorAll('ul, ol')]) if (!lista.children.length) lista.remove();
  return saida.innerHTML.trim();
}

const textoDaPagina = (html) => {
  const tpl = document.createElement('template');
  tpl.innerHTML = html || '';
  return tpl.content.textContent.replace(/\s+/g, ' ').trim();
};
const temPagina = (f) => Boolean(f && f.pagina && textoDaPagina(f.pagina));
const palavrasDaPagina = (html) => (textoDaPagina(html).match(/\S+/g) || []).length;
const leituraDaPagina = (html) => {
  const min = Math.max(1, Math.round(palavrasDaPagina(html) / 200));
  return `${min} min de leitura`;
};

// O trecho da resenha: o texto corrido (parágrafos, citações e listas), sem os
// títulos, cortado numa palavra inteira.
function trechoDaPagina(html, max = 300) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html || '';
  const partes = [];
  for (const bloco of tpl.content.children) {
    if (/^(H2|H3|HR)$/.test(bloco.tagName)) continue;
    if (/^(UL|OL)$/.test(bloco.tagName)) partes.push(...[...bloco.children].map((li) => li.textContent));
    else partes.push(bloco.textContent);
  }
  // Junta blocos inteiros até ter um trecho que se sustente sozinho; não começa
  // um bloco novo (uma lista, por exemplo) só para cortá-lo no meio.
  let texto = '';
  for (const p of partes.map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean)) {
    if (texto.length >= 140) break;
    texto = texto ? `${texto} ${p}` : p;
  }
  if (!texto) texto = textoDaPagina(html); // só títulos: usa o que tiver
  if (texto.length <= max) return texto;
  const corte = texto.lastIndexOf(' ', max);
  return `${texto.slice(0, corte > max * 0.6 ? corte : max).replace(/[\s.,;:!?…-]+$/, '')}…`;
}

// "Escrito em 22 de outubro" ou "Editado hoje".
function quandoPagina(f) {
  if (!f.paginaEm) return '';
  const dia = diaDe(new Date(f.paginaEm));
  return dia === hoje() ? 'Escrito hoje' : `Escrito em ${diaLegivel(dia)}`;
}

// ---------- A tela da página ----------

const BOTOES_PAGINA = [
  { cmd: 'bloco', valor: 'p', icone: 'Pilcrow', rotulo: 'Texto' },
  { cmd: 'bloco', valor: 'h2', icone: 'Heading2', rotulo: 'Título' },
  { cmd: 'bloco', valor: 'h3', icone: 'Heading3', rotulo: 'Subtítulo' },
  null,
  { cmd: 'bold', icone: 'Bold', rotulo: 'Negrito', atalho: 'Ctrl B' },
  { cmd: 'italic', icone: 'Italic', rotulo: 'Itálico', atalho: 'Ctrl I' },
  { cmd: 'underline', icone: 'Underline', rotulo: 'Sublinhado', atalho: 'Ctrl U' },
  { cmd: 'strikeThrough', icone: 'Strikethrough', rotulo: 'Riscado' },
  null,
  { cmd: 'bloco', valor: 'blockquote', icone: 'TextQuote', rotulo: 'Citação' },
  { cmd: 'insertUnorderedList', icone: 'List', rotulo: 'Lista' },
  { cmd: 'insertOrderedList', icone: 'ListOrdered', rotulo: 'Lista numerada' },
  { cmd: 'insertHorizontalRule', icone: 'Minus', rotulo: 'Divisor' },
  null,
  { cmd: 'colarImagem', icone: 'ImagePlus', rotulo: 'Colar a imagem copiada', atalho: 'ou Ctrl V' },
];

function paginaFilmeHTML(f) {
  const meta = [f.ano, duracaoDe(f), f.diretor].filter(Boolean).map(esc).join(' · ');
  const dias = (f.vistoEm || []).slice().sort();
  const vistoEm = dias.length
    ? `Vi em ${dias.map((d) => esc(diaLegivel(d, { comAno: true }))).join(', ')}`
    : '';
  const botoes = BOTOES_PAGINA.map((b) => (b
    ? `<button class="pg-botao" data-cmd="${b.cmd}"${b.valor ? ` data-valor="${b.valor}"` : ''} title="${b.rotulo}${b.atalho ? ` (${b.atalho})` : ''}" aria-label="${b.rotulo}" aria-pressed="false">${icone(b.icone)}</button>`
    : '<span class="pg-sep" aria-hidden="true"></span>')).join('');
  return `
    <header class="pg-topo">
      <div class="pg-fundo" style="${esc(fundoCapa(f))}" aria-hidden="true"></div>
      <button class="redondo pg-fechar" data-pg="fechar" title="Fechar (Esc)" aria-label="Fechar">${icone('X')}</button>
      <div class="pg-identidade">
        <button class="pg-capa" data-pg="detalhes" title="Ver os detalhes do filme" aria-label="Ver os detalhes de ${esc(f.titulo)}">${capaHTML(f, { tamanho: 'grande' })}</button>
        <div class="pg-dados">
          <span class="pg-rotulo">${icone('NotebookPen')} Sua página</span>
          <h2>${esc(f.titulo)}</h2>
          ${meta ? `<p class="pg-meta">${meta}</p>` : ''}
          <div class="pg-linha">
            ${f.minhaNota ? notaFixaHTML(f.minhaNota) : ''}
            ${vistoEm ? `<span class="pg-vistos">${icone('CalendarCheck')} ${vistoEm}</span>` : ''}
          </div>
        </div>
        ${shotHTML(f)}
      </div>
    </header>
    <div class="pg-barra" role="toolbar" aria-label="Formatação do texto">
      <div class="pg-botoes">${botoes}</div>
      <span class="pg-status" id="pg-status" aria-live="polite"></span>
    </div>
    ${conflitoPaginaHTML(f)}
    <div class="pg-folha">
      <div class="pg-editor" id="pagina-editor" contenteditable="true" spellcheck="true"
           role="textbox" aria-multiline="true" aria-label="Sua página sobre ${esc(f.titulo)}"
           data-vazio="Escreva o que achou do filme…"></div>
      <p class="pg-dica">Atalhos: <kbd>#</kbd> título, <kbd>##</kbd> subtítulo, <kbd>&gt;</kbd> citação, <kbd>-</kbd> lista e <kbd>1.</kbd> lista numerada, seguidos de espaço. <kbd>---</kbd> e Enter cria um divisor.</p>
    </div>
    <footer class="pg-rodape">
      <span class="pg-contagem" id="pg-contagem"></span>
      <button class="btn btn-fantasma" data-pg="story" title="Montar uma imagem para os stories do Instagram">${icone('ImagePlus')} Criar story</button>
      <button class="btn btn-fantasma pg-apagar" data-pg="apagar">${icone('Trash2')} Apagar página</button>
    </footer>`;
}

// A página foi mudada aqui e em outro aparelho antes de sincronizar: ficou a
// mais nova, e a outra está em `paginaOutra` até você escolher.
function conflitoPaginaHTML(f) {
  const o = f.paginaOutra;
  if (!o || !o.html) return '';
  const quando = o.em ? new Date(o.em).toLocaleString('pt-BR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
  return `
    <div class="pg-conflito" role="status">
      <p>${icone('GitCompare')} <span>Esta página foi mudada aqui e em outro aparelho ao mesmo tempo. Ficou a versão mais nova; a que estava neste computador${quando ? ` (de ${esc(quando)})` : ''} está guardada.</span></p>
      <details>
        <summary>Ver a versão deste computador</summary>
        <div class="pg-editor pg-outra">${limparPagina(o.html)}</div>
      </details>
      <div class="pg-conflito-botoes">
        <button class="btn btn-fantasma" data-pg="conflito-minha">Usar a deste computador</button>
        <button class="btn btn-laranja" data-pg="conflito-esta">Ficar com esta</button>
      </div>
    </div>`;
}

function resolverConflitoPagina(usarMinha) {
  const f = porId(paginaId);
  if (!f || !f.paginaOutra) return;
  if (usarMinha) {
    $('#pagina-editor').innerHTML = limparPagina(f.paginaOutra.html) || '<p><br></p>';
    salvarPagina(true);
    atualizarRodapePagina();
  }
  f.paginaOutra = null;
  api.atualizarFilme(f.id, { paginaOutra: null });
  $('.pg-conflito')?.remove();
}

function abrirPagina(id) {
  const f = porId(id);
  if (!f) return;
  fecharPrevia(false);
  paginaId = id;
  const caixa = $('#pagina-caixa');
  caixa.innerHTML = paginaFilmeHTML(f);
  paginaFilme.hidden = false;
  const editor = $('#pagina-editor');
  editor.innerHTML = limparPagina(f.pagina) || '<p><br></p>';
  document.execCommand('defaultParagraphSeparator', false, 'p');
  atualizarRodapePagina();
  marcarStatusPagina(f.paginaEm ? quandoPagina(f) : '');
  Movimento.animar(caixa, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 320 });
  Movimento.animar($('.pg-fundo', caixa), [{ opacity: 0, transform: 'scale(1.06)' }, { opacity: 1, transform: 'none' }], { duration: 600, fill: 'backwards' });
  Movimento.sequencia([$('.pg-capa', caixa), $('.pg-dados', caixa)], { y: 12, duracao: 460, passo: 70, atrasoInicial: 80 });
  // Cursor no fim do texto, pronto para continuar escrevendo.
  editor.focus({ preventScroll: true });
  const r = document.createRange();
  r.selectNodeContents(editor);
  r.collapse(false);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
  atualizarBotoesPagina();
}

function fecharPagina() {
  if (paginaFilme.hidden) return;
  salvarPagina(true);
  const id = paginaId;
  paginaId = null;
  paginaFilme.hidden = true;
  $('#pagina-caixa').innerHTML = '';
  // O que mostra a página (calendário e detalhes) passa a mostrar o texto novo.
  if (!calendario.hidden) renderCalendario();
  if (!paginasTela.hidden) renderListaPaginas();
  if (estado.painelId === id) renderPainel();
}

function marcarStatusPagina(texto) {
  const s = $('#pg-status');
  if (s) s.textContent = texto;
}

function atualizarRodapePagina() {
  const editor = $('#pagina-editor');
  if (!editor) return;
  const html = editor.innerHTML;
  const n = palavrasDaPagina(html);
  $('#pg-contagem').textContent = n ? `${n} palavra${n === 1 ? '' : 's'} · ${leituraDaPagina(html)}` : '';
  editor.classList.toggle('vazio', !textoDaPagina(html) && !editor.querySelector('hr, li, img'));
  $('[data-pg="apagar"]').hidden = !n;
}

// Salva sozinho: 700 ms depois de parar de escrever, e na hora ao fechar.
function agendarSalvarPagina() {
  clearTimeout(timerPagina);
  marcarStatusPagina('Salvando…');
  timerPagina = setTimeout(() => salvarPagina(), 700);
}

function salvarPagina(agora = false) {
  clearTimeout(timerPagina);
  const editor = $('#pagina-editor');
  const f = porId(paginaId);
  if (!editor || !f) return;
  let html = limparPagina(editor.innerHTML);
  if (!textoDaPagina(html) && !/<hr|<li|<img/.test(html)) html = '';
  if (html === (f.pagina || '')) { if (!agora) marcarStatusPagina(f.paginaEm ? 'Salvo' : ''); return; }
  f.pagina = html;
  f.paginaEm = html ? new Date().toISOString() : '';
  api.atualizarFilme(f.id, { pagina: f.pagina, paginaEm: f.paginaEm });
  marcarStatusPagina(html ? 'Salvo' : '');
}

async function apagarPagina() {
  const f = porId(paginaId);
  if (!f) return;
  const ok = await perguntar({
    titulo: 'Apagar página',
    texto: `Apagar tudo o que você escreveu sobre “${f.titulo}”? Isso não pode ser desfeito.`,
    botoes: [
      { rotulo: 'Cancelar', valor: false, classe: 'btn-fantasma' },
      { rotulo: 'Apagar', valor: true, classe: 'btn-perigo' },
    ],
  });
  if (!ok) return;
  $('#pagina-editor').innerHTML = '<p><br></p>';
  salvarPagina(true);
  fecharPagina();
  aviso(`A página de “${f.titulo}” foi apagada.`);
}

// ---------- Editor ----------

// O bloco (parágrafo, título, item…) onde está o cursor.
function blocoDoCursor() {
  const sel = getSelection();
  const editor = $('#pagina-editor');
  if (!sel.rangeCount || !editor) return null;
  let no = sel.anchorNode;
  if (!no || !editor.contains(no)) return null;
  if (no.nodeType === Node.TEXT_NODE) no = no.parentElement;
  return no.closest('p, h2, h3, li, blockquote, div:not(.pg-editor)');
}

function aplicarComando(cmd, valor) {
  const editor = $('#pagina-editor');
  editor.focus({ preventScroll: true });
  if (cmd === 'colarImagem') { inserirImagens(); return; }
  if (cmd === 'bloco') {
    // Clicar no estilo que já está aplicado volta para texto normal.
    const atual = (document.queryCommandValue('formatBlock') || '').toLowerCase();
    document.execCommand('formatBlock', false, atual === valor ? 'p' : valor);
  } else if (cmd === 'insertHorizontalRule') {
    document.execCommand('insertHorizontalRule');
    // Depois do divisor, sempre um parágrafo para continuar escrevendo.
    const hr = [...editor.querySelectorAll('hr')].find((h) => !h.nextElementSibling || h.nextElementSibling.tagName === 'HR');
    if (hr) {
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      hr.after(p);
      cursorEm(p);
    }
  } else {
    document.execCommand(cmd);
  }
  atualizarBotoesPagina();
  atualizarRodapePagina();
  agendarSalvarPagina();
}

function cursorEm(el) {
  const r = document.createRange();
  r.setStart(el, 0);
  r.collapse(true);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
}

function atualizarBotoesPagina() {
  if (paginaFilme.hidden) return;
  const bloco = (document.queryCommandValue('formatBlock') || 'p').toLowerCase();
  for (const b of $$('#pagina-caixa .pg-botao')) {
    let on = false;
    if (b.dataset.cmd === 'bloco') on = bloco === b.dataset.valor || (b.dataset.valor === 'p' && (bloco === 'div' || bloco === ''));
    else if (b.dataset.cmd !== 'insertHorizontalRule') on = document.queryCommandState(b.dataset.cmd);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  }
}

// Atalhos de digitação: "# ", "## ", "> ", "- ", "* " e "1. " no começo de uma
// linha viram título, subtítulo, citação e listas; "---" e Enter, um divisor.
const MARCAS_PAGINA = { '#': ['bloco', 'h2'], '##': ['bloco', 'h3'], '>': ['bloco', 'blockquote'], '-': ['insertUnorderedList'], '*': ['insertUnorderedList'], '1.': ['insertOrderedList'] };

function trocarMarca(bloco, cmd, valor) {
  let novo;
  let alvo;
  if (cmd === 'bloco') {
    novo = document.createElement(valor);
    alvo = novo;
  } else {
    novo = document.createElement(cmd === 'insertOrderedList' ? 'ol' : 'ul');
    alvo = document.createElement('li');
    novo.append(alvo);
  }
  alvo.innerHTML = '<br>';
  bloco.replaceWith(novo);
  cursorEm(alvo);
}

paginaFilme.addEventListener('keydown', (e) => {
  if (!e.target.matches('#pagina-editor')) return;
  const bloco = blocoDoCursor();
  const texto = bloco ? bloco.textContent : '';
  if (e.key === ' ' && bloco && bloco.tagName !== 'LI' && MARCAS_PAGINA[texto]) {
    e.preventDefault();
    const [cmd, valor] = MARCAS_PAGINA[texto];
    trocarMarca(bloco, cmd, valor);
    atualizarBotoesPagina();
    agendarSalvarPagina();
    return;
  }
  if (e.key === 'Enter' && !e.shiftKey && bloco) {
    if (texto.trim() === '---' && bloco.tagName === 'P') {
      e.preventDefault();
      const hr = document.createElement('hr');
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      bloco.replaceWith(hr);
      hr.after(p);
      cursorEm(p);
      atualizarRodapePagina();
      agendarSalvarPagina();
      return;
    }
    // Enter numa linha vazia da citação ou de um título sai dele (volta ao texto).
    const naCitacao = bloco.closest('blockquote');
    if (naCitacao && !texto.trim()) {
      e.preventDefault();
      document.execCommand('formatBlock', false, 'p');
      atualizarBotoesPagina();
      return;
    }
  }
});

paginaFilme.addEventListener('input', (e) => {
  if (!e.target.matches('#pagina-editor')) return;
  atualizarRodapePagina();
  agendarSalvarPagina();
  manterCursorVisivel();
});

// A barra e o rodapé ficam presos na caixa: quem escreve no fim do texto não
// pode ficar com a linha escondida atrás deles.
function manterCursorVisivel() {
  const sel = getSelection();
  if (!sel.rangeCount) return;
  const r = sel.getRangeAt(0).getBoundingClientRect();
  if (!r.height) return;
  const caixa = $('#pagina-caixa');
  const limiteBaixo = $('.pg-rodape', caixa).getBoundingClientRect().top - 24;
  const limiteAlto = $('.pg-barra', caixa).getBoundingClientRect().bottom + 24;
  if (r.bottom > limiteBaixo) caixa.scrollTop += r.bottom - limiteBaixo;
  else if (r.top < limiteAlto) caixa.scrollTop -= limiteAlto - r.top;
}

// Os arquivos de imagem de um colar ou de um arrastar.
const imagensDe = (dados) => [...(dados?.files || [])].filter((a) => /^image\/(png|jpeg|webp|gif)$/.test(a.type));

// Guarda as imagens na pasta do app e devolve os endereços (capa://foto/…).
async function guardarImagens(arquivos) {
  const srcs = [];
  for (const a of arquivos) {
    const r = await api.guardarImagem(new Uint8Array(await a.arrayBuffer()), a.type);
    if (r?.src) srcs.push(r.src);
    else aviso(r?.erro || 'Não consegui guardar a imagem.');
  }
  return srcs;
}

// Põe as imagens onde está o cursor, cada uma na sua linha. Sem arquivos,
// usa a imagem copiada (o botão da barra, sem precisar de Ctrl V).
async function inserirImagens(arquivos) {
  const editor = $('#pagina-editor');
  const sel = getSelection();
  const range = sel.rangeCount && editor.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
  let srcs;
  if (arquivos) srcs = await guardarImagens(arquivos);
  else {
    const r = await api.guardarImagem();
    if (!r?.src) { aviso(r?.erro ? `${r.erro} Copie uma imagem e tente de novo.` : 'Não consegui colar a imagem.'); return; }
    srcs = [r.src];
  }
  if (!srcs.length || paginaFilme.hidden) return;
  editor.focus({ preventScroll: true });
  if (range) { sel.removeAllRanges(); sel.addRange(range); }
  document.execCommand('insertHTML', false, srcs.map((s) => `<img src="${esc(s)}" alt="">`).join(''));
  atualizarRodapePagina();
  agendarSalvarPagina();
}

// Colar: mantém só a formatação que a página conhece (negrito, títulos, listas…).
// Uma imagem colada fora do texto vira um shot favorito.
document.addEventListener('paste', (e) => {
  if (paginaFilme.hidden || visor) return;
  const imagens = imagensDe(e.clipboardData);
  if (!e.target.closest?.('#pagina-editor')) {
    if (e.target.closest?.('input, textarea')) return;
    if (imagens.length) { e.preventDefault(); adicionarShots(imagens); }
    return;
  }
  e.preventDefault();
  if (imagens.length) { inserirImagens(imagens); return; }
  const html = e.clipboardData.getData('text/html');
  if (html) {
    document.execCommand('insertHTML', false, limparPagina(html));
  } else {
    const texto = e.clipboardData.getData('text/plain');
    const blocos = texto.split(/\r?\n\s*\r?\n/).map((b) => `<p>${esc(b).replace(/\r?\n/g, '<br>')}</p>`).join('');
    document.execCommand('insertHTML', false, blocos);
  }
  // Colar parágrafos numa linha de título os põe dentro do <h2>: arruma na hora,
  // mantendo o cursor onde estava.
  const editor = $('#pagina-editor');
  const sel = getSelection();
  const [no, pos] = sel.rangeCount ? [sel.focusNode, sel.focusOffset] : [];
  desaninharBlocos(editor);
  if (no && editor.contains(no)) sel.collapse(no, pos);
  atualizarBotoesPagina();
});

// Arrastar imagens para o texto também as coloca na página; para o topo, vira o shot.
paginaFilme.addEventListener('dragover', (e) => {
  if (!e.dataTransfer?.types.includes('Files') || !e.target.closest('#pagina-editor, .pg-topo')) return;
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'copy';
});
paginaFilme.addEventListener('drop', (e) => {
  const imagens = imagensDe(e.dataTransfer);
  if (!imagens.length || !e.target.closest('#pagina-editor, .pg-topo')) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.target.closest('.pg-topo')) { adicionarShots(imagens); return; }
  // O cursor vai para onde a imagem foi solta.
  const pos = document.caretPositionFromPoint?.(e.clientX, e.clientY);
  if (pos) getSelection().collapse(pos.offsetNode, pos.offset);
  inserirImagens(imagens);
});

// ---------- Shots favoritos ----------
//
// Até duas cenas por filme, à direita do topo. Com uma, ela aparece grande e
// um "+" discreto (no hover) cola a segunda; com duas, ficam uma sobre a
// outra, na altura da capa. Ficam em `f.shots`.

const MAX_SHOTS = 2;
const shotsDe = (f) => (Array.isArray(f?.shots) ? f.shots.slice(0, MAX_SHOTS) : []);

function shotHTML(f) {
  const shots = shotsDe(f);
  if (!shots.length) {
    return `<button class="pg-shots pg-shot-novo" id="pg-shot" data-pg="colar-shot" title="Clique para colar a imagem que você copiou de uma cena (ou arraste uma imagem aqui)">
        ${icone('Clapperboard')}<span>Colar shot favorito</span>
      </button>`;
  }
  // Com dois, o segundo fica atrás do primeiro (aparece no visor, pelas setas).
  return `<div class="pg-shots n${shots.length}" id="pg-shot">
      ${shots.map((s, i) => `
        <div class="pg-shot">
          <button class="pg-shot-img" data-pg="ver-shot" data-i="${i}" title="${shots.length > 1 ? 'Ver os shots' : 'Ver o shot'}" aria-label="Ver o shot ${i + 1}"${i ? ' tabindex="-1"' : ''}><img src="${esc(s)}" alt="" draggable="false"></button>
          <button class="pg-shot-botao pg-shot-tirar" data-pg="tirar-shot" data-i="${i}" title="Tirar este shot" aria-label="Tirar o shot ${i + 1}">${icone('X')}</button>
          ${shots.length < MAX_SHOTS ? `<button class="pg-shot-botao pg-shot-mais" data-pg="colar-shot" title="Colar um segundo shot (clique para colar a imagem copiada)" aria-label="Colar um segundo shot">${icone('Plus')}</button>` : ''}
        </div>`).join('')}
    </div>`;
}

function renderShot() {
  const f = porId(paginaId);
  const atual = $('#pg-shot');
  if (!f || !atual) return;
  atual.outerHTML = shotHTML(f);
}

function salvarShots(f, shots) {
  f.shots = shots.slice(0, MAX_SHOTS);
  api.atualizarFilme(f.id, { shots: f.shots });
  if (porId(paginaId) === f) renderShot();
}

// Colar ou arrastar: entra enquanto houver lugar.
async function adicionarShots(arquivos) {
  const f = porId(paginaId);
  const livres = MAX_SHOTS - shotsDe(f).length;
  if (!f || livres <= 0) return;
  const srcs = await guardarImagens(arquivos.slice(0, livres));
  if (srcs.length) salvarShots(f, [...shotsDe(f), ...srcs]);
}

// O botão lê a imagem do clipboard direto (não precisa de foco num campo).
async function colarShot() {
  const f = porId(paginaId);
  if (!f || shotsDe(f).length >= MAX_SHOTS) return;
  const r = await api.guardarImagem();
  if (!r?.src) { aviso(r?.erro ? `${r.erro} Copie a imagem de uma cena e tente de novo.` : 'Não consegui colar o shot.'); return; }
  salvarShots(f, [...shotsDe(f), r.src]);
}

function tirarShot(i) {
  const f = porId(paginaId);
  if (!f) return;
  const antes = shotsDe(f);
  salvarShots(f, antes.filter((_, j) => j !== i));
  aviso('Shot tirado.', { duracao: 6000, acao: { rotulo: 'Desfazer', fn: () => salvarShots(f, antes) } });
}

// Os botões da barra não tiram o foco do texto (senão a seleção se perde).
paginaFilme.addEventListener('mousedown', (e) => {
  if (e.target.closest('.pg-botao')) e.preventDefault();
});

paginaFilme.addEventListener('click', (e) => {
  if (e.target === paginaFilme) { fecharPagina(); return; }
  const botao = e.target.closest('.pg-botao');
  if (botao) { aplicarComando(botao.dataset.cmd, botao.dataset.valor); return; }
  // Imagem do texto: abre grande, passando pelas outras imagens da página.
  if (e.target.matches('#pagina-editor img')) {
    const imgs = $$('#pagina-editor img');
    abrirVisor(imgs.map((i) => i.getAttribute('src')), imgs.indexOf(e.target));
    return;
  }
  const alvo = e.target.closest('[data-pg]');
  if (!alvo) return;
  switch (alvo.dataset.pg) {
    case 'ver-shot': {
      const f = porId(paginaId);
      abrirVisor(shotsDe(f), Number(alvo.dataset.i), {
        aoPorNaFrente: (i) => {
          const shots = shotsDe(f);
          salvarShots(f, [shots[i], ...shots.filter((_, j) => j !== i)]);
          return shotsDe(f);
        },
      });
      break;
    }
    case 'tirar-shot': tirarShot(Number(alvo.dataset.i)); break;
    case 'colar-shot': colarShot(); break;
    case 'fechar': fecharPagina(); break;
    case 'apagar': apagarPagina(); break;
    case 'conflito-minha': resolverConflitoPagina(true); break;
    case 'conflito-esta': resolverConflitoPagina(false); break;
    case 'story': salvarPagina(true); abrirStory(paginaId); break;
    case 'detalhes': {
      const id = paginaId;
      fecharPagina();
      abrirPainel(id);
      break;
    }
  }
});

document.addEventListener('selectionchange', () => {
  if (!paginaFilme.hidden && document.activeElement && document.activeElement.id === 'pagina-editor') atualizarBotoesPagina();
});

// Tab e Shift+Tab ficam dentro da página.
paginaFilme.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || e.target.matches('#pagina-editor')) return;
  const focaveis = $$('button:not([disabled]):not([hidden]), [contenteditable="true"]', paginaFilme);
  const i = focaveis.indexOf(document.activeElement);
  if (i === -1) return;
  e.preventDefault();
  focaveis[(i + (e.shiftKey ? -1 : 1) + focaveis.length) % focaveis.length].focus();
});

// ---------- A página fora do editor ----------

// No calendário, o filme visto com página vira uma resenha em destaque: a arte
// do filme de um lado e, do outro, o seu texto entre aspas.
function resenhaDoDiaHTML(f, { vistoNoMes, trofeu = '' } = {}) {
  const logo = srcLogo(f);
  const titulo = logo
    ? `<img class="cal-resenha-logo" src="${esc(logo)}" alt="" data-nome="${esc(f.titulo)}">`
    : `<span class="cal-resenha-nome">${esc(f.titulo)}</span>`;
  const meta = [f.ano, f.diretor].filter(Boolean).map(esc).join(' · ');
  return `
    <article class="cal-resenha" data-id="${f.id}">
      <button class="cal-resenha-arte" data-c="detalhes" data-id="${f.id}" aria-label="Detalhes de ${esc(f.titulo)}">
        <span class="cal-resenha-fundo" style="${esc(fundoCapa(f))}" aria-hidden="true"></span>
        <span class="cal-resenha-capa">${capaHTML(f)}</span>
        <span class="cal-resenha-titulo">${titulo}</span>
      </button>
      <div class="cal-resenha-texto">
        <span class="cal-resenha-rotulo">${icone('NotebookPen')} Da sua página</span>
        <h4><button class="cal-filme-titulo" data-c="detalhes" data-id="${f.id}">${esc(f.titulo)}</button></h4>
        ${meta ? `<p class="cal-resenha-meta">${meta}</p>` : ''}
        <blockquote class="cal-resenha-citacao"><p>“${esc(trechoDaPagina(f.pagina, 240))}”</p></blockquote>
        <button class="cal-resenha-ler" data-c="pagina" data-id="${f.id}">Ler página inteira ${icone('ArrowRight')}</button>
        <div class="cal-resenha-rodape">
          ${f.minhaNota ? notaFixaHTML(f.minhaNota) : ''}
          <span class="cal-resenha-quando">${esc([quandoPagina(f), leituraDaPagina(f.pagina)].filter(Boolean).join(' · '))}</span>
          ${trofeu}
        </div>
      </div>
    </article>`;
}

// Nos detalhes do filme: o começo da página, ou o convite para escrever.
function paginaNoPainelHTML(f) {
  if (temPagina(f)) {
    return `
      <div class="painel-pagina">
        <span class="painel-pagina-rotulo">${icone('NotebookPen')} Sua página <em>${esc(leituraDaPagina(f.pagina))}</em></span>
        <blockquote>“${esc(trechoDaPagina(f.pagina, 180))}”</blockquote>
        <button class="btn btn-fantasma" data-p="pagina">${icone('BookOpen')} Abrir página</button>
      </div>`;
  }
  return '';
}

// Se a logo do filme não carregar na resenha, fica o nome em texto.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains('cal-resenha-logo')) return;
  const nome = document.createElement('span');
  nome.className = 'cal-resenha-nome';
  nome.textContent = img.dataset.nome;
  img.replaceWith(nome);
}, true);

// ---------- Suas páginas: todas as anotações, fora do calendário ----------
//
// Um diário com tudo o que você escreveu, do mais recente para o mais antigo,
// separado pelo mês em que foi escrito. A busca procura no título, na direção
// e no próprio texto. Clicar na capa ou no título abre a página.

const paginasTela = $('#paginas');
let buscaPaginas = '';

function abrirPaginas() {
  fecharPrevia(false);
  buscaPaginas = '';
  const caixa = $('#paginas-caixa');
  caixa.innerHTML = `
    <div class="cal-topo pgs-topo">
      <div class="pgs-titulo">
        <span class="pg-rotulo">${icone('NotebookPen')} Diário</span>
        <h2>Suas páginas</h2>
      </div>
      <span class="cal-stat" id="pgs-resumo"></span>
      <label class="pgs-busca">${icone('Search')}<input id="paginas-busca" type="search" placeholder="Buscar por filme ou pelo que você escreveu" autocomplete="off" spellcheck="false" aria-label="Buscar nas suas páginas"></label>
      <button class="redondo cal-fechar" data-pp="fechar" title="Fechar (Esc)" aria-label="Fechar">${icone('X')}</button>
    </div>
    <div id="paginas-lista"></div>`;
  paginasTela.hidden = false;
  renderListaPaginas();
  Movimento.animar(caixa, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 260 });
  Movimento.sequencia($$('#paginas .pgs-cartao').slice(0, 6), { y: 12, duracao: 420, passo: 50, atrasoInicial: 80 });
  $('#paginas-busca').focus({ preventScroll: true });
}

function fecharPaginas() {
  if (paginasTela.hidden) return;
  paginasTela.hidden = true;
  $('#paginas-caixa').innerHTML = '';
}

function cartaoPaginaHTML(f) {
  const meta = [f.ano, f.diretor].filter(Boolean).map(esc).join(' · ');
  return `
    <article class="pgs-cartao" data-id="${f.id}">
      <button class="pgs-capa" data-pp="pagina" data-id="${f.id}" aria-label="Abrir sua página sobre ${esc(f.titulo)}">${capaHTML(f)}</button>
      <div class="pgs-texto">
        <h4><button class="cal-filme-titulo" data-pp="pagina" data-id="${f.id}">${esc(f.titulo)}</button></h4>
        ${meta ? `<p class="pgs-meta">${meta}</p>` : ''}
        <blockquote class="pgs-citacao">“${esc(trechoDaPagina(f.pagina, 200))}”</blockquote>
        <div class="pgs-rodape">
          ${f.minhaNota ? notaFixaHTML(f.minhaNota) : ''}
          <span class="pgs-quando">${esc([quandoPagina(f), leituraDaPagina(f.pagina)].filter(Boolean).join(' · '))}</span>
          <button class="pgs-detalhes" data-pp="detalhes" data-id="${f.id}">${icone('Info')} Detalhes</button>
        </div>
      </div>
    </article>`;
}

// Filmes vistos que ainda não têm página: do visto mais recente para o mais antigo.
const ultimoVisto = (f) => (f.vistoEm || []).slice().sort().pop() || '';
const filmesSemPagina = () => estado.filmes.filter((f) => f.visto && !temPagina(f))
  .sort((a, b) => ultimoVisto(b).localeCompare(ultimoVisto(a)) || a.titulo.localeCompare(b.titulo, 'pt'));

function cartaoPendenteHTML(f) {
  const dia = ultimoVisto(f);
  return `
    <article class="pgs-pendente" data-id="${f.id}">
      <button class="pgs-pendente-capa" data-pp="pagina" data-id="${f.id}" aria-label="Escrever sobre ${esc(f.titulo)}" title="${esc(f.titulo)}">${capaHTML(f)}</button>
      <p class="pgs-pendente-dia">${dia ? `Visto em ${esc(diaLegivel(dia))}` : 'Visto'}</p>
      <button class="pgs-escrever" data-pp="pagina" data-id="${f.id}">${icone('PenLine')} Escrever</button>
    </article>`;
}

// Uma fileira só, que rola para o lado: os vistos sem página não tomam a tela.
function fileiraPendentesHTML(lista) {
  return `
    <section class="pgs-pendentes">
      <h3>${icone('PenLine')} Vistos, ainda sem página <span class="cal-contagem">${lista.length}</span></h3>
      <div class="pgs-fileira-caixa">
        <button class="pgs-seta pgs-seta-esq" data-pp="rolar" data-dir="-1" aria-label="Voltar" hidden>${icone('ChevronLeft')}</button>
        <div class="pgs-fileira" id="pgs-fileira">${lista.map(cartaoPendenteHTML).join('')}</div>
        <button class="pgs-seta pgs-seta-dir" data-pp="rolar" data-dir="1" aria-label="Mostrar mais" hidden>${icone('ChevronRight')}</button>
      </div>
    </section>`;
}

function atualizarSetasPendentes() {
  const f = $('#pgs-fileira');
  if (!f) return;
  $('#paginas .pgs-seta-esq').hidden = f.scrollLeft <= 2;
  $('#paginas .pgs-seta-dir').hidden = f.scrollLeft + f.clientWidth >= f.scrollWidth - 2;
}

function renderListaPaginas() {
  const area = $('#paginas-lista');
  if (!area) return;
  const todas = estado.filmes.filter(temPagina)
    .sort((a, b) => String(b.paginaEm || '').localeCompare(String(a.paginaEm || '')));
  const palavras = todas.reduce((n, f) => n + palavrasDaPagina(f.pagina), 0);
  $('#pgs-resumo').innerHTML = todas.length
    ? `<b>${todas.length}</b> ${todas.length === 1 ? 'página' : 'páginas'} · <b>${palavras.toLocaleString('pt-BR')}</b> ${palavras === 1 ? 'palavra' : 'palavras'}`
    : 'Nenhuma página ainda';

  const termo = normalizar(buscaPaginas.trim());
  const pendentes = filmesSemPagina().filter((f) => !termo || normalizar(`${f.titulo} ${f.diretor || ''}`).includes(termo));
  const fileira = pendentes.length ? fileiraPendentesHTML(pendentes) : '';

  if (!todas.length) {
    area.innerHTML = `<p class="cal-vazio pgs-vazio">Você ainda não escreveu sobre nenhum filme.${pendentes.length ? ' Escolha um dos vistos abaixo para começar a primeira página.' : ' Marque um filme como visto e use “Escrever sobre o filme” nos detalhes.'}</p>` + fileira;
    atualizarSetasPendentes();
    return;
  }
  const lista = termo
    ? todas.filter((f) => normalizar(`${f.titulo} ${f.diretor || ''} ${textoDaPagina(f.pagina)}`).includes(termo))
    : todas;
  if (!lista.length) {
    area.innerHTML = `<p class="cal-vazio pgs-vazio">Nenhuma página encontrada para “${esc(buscaPaginas.trim())}”.</p>` + fileira;
    atualizarSetasPendentes();
    return;
  }
  // Separadas pelo mês em que foram escritas.
  const grupos = new Map();
  for (const f of lista) {
    const mes = f.paginaEm ? diaDe(new Date(f.paginaEm)).slice(0, 7) : '';
    if (!grupos.has(mes)) grupos.set(mes, []);
    grupos.get(mes).push(f);
  }
  area.innerHTML = [...grupos.entries()].map(([mes, fs]) => `
    <section class="pgs-grupo">
      <h3>${mes ? esc(mesLegivel(mes).replace(/^./, (c) => c.toUpperCase())) : 'Sem data'} <span class="cal-contagem">${fs.length}</span></h3>
      <div class="pgs-grade">${fs.map(cartaoPaginaHTML).join('')}</div>
    </section>`).join('') + fileira;
  atualizarSetasPendentes();
}

// A fileira rola com as setas, com a roda do mouse e com o trackpad.
paginasTela.addEventListener('scroll', (e) => {
  if (e.target.id === 'pgs-fileira') atualizarSetasPendentes();
}, true);
paginasTela.addEventListener('wheel', (e) => {
  const f = e.target.closest('#pgs-fileira');
  if (!f || Math.abs(e.deltaX) > Math.abs(e.deltaY) || f.scrollWidth <= f.clientWidth) return;
  e.preventDefault();
  f.scrollLeft += e.deltaY;
}, { passive: false });
window.addEventListener('resize', () => { if (!paginasTela.hidden) atualizarSetasPendentes(); });

paginasTela.addEventListener('input', (e) => {
  if (!e.target.matches('#paginas-busca')) return;
  buscaPaginas = e.target.value;
  renderListaPaginas();
});

paginasTela.addEventListener('keydown', (e) => {
  // Esc com texto na busca limpa a busca; com ela vazia, fecha (pelo atalho geral).
  if (e.key === 'Escape' && e.target.matches('#paginas-busca') && e.target.value) {
    e.preventDefault();
    e.stopPropagation();
    e.target.value = '';
    buscaPaginas = '';
    renderListaPaginas();
  }
});

paginasTela.addEventListener('click', (e) => {
  if (e.target === paginasTela) { fecharPaginas(); return; }
  const alvo = e.target.closest('[data-pp]');
  if (!alvo) return;
  switch (alvo.dataset.pp) {
    case 'fechar': fecharPaginas(); break;
    case 'pagina': abrirPagina(alvo.dataset.id); break;
    case 'detalhes': abrirPainel(alvo.dataset.id); break;
    case 'rolar': {
      const f = $('#pgs-fileira');
      f.scrollBy({ left: Number(alvo.dataset.dir) * f.clientWidth * 0.8, behavior: Movimento.reduzido.matches ? 'auto' : 'smooth' });
      break;
    }
  }
});

$('#btn-paginas').addEventListener('click', () => abrirPaginas());

// ---------- Visor: qualquer imagem da página (ou shot) em tela cheia ----------
//
// Setas (ou ← →) passam pelas outras imagens; clicar na imagem amplia no
// tamanho real e o mouse passeia por ela; Esc fecha.

let visor = null;

// aoPorNaFrente(i): mostra o botão "Pôr na frente" (os shots); devolve a
// lista na ordem nova.
function abrirVisor(srcs, i = 0, { aoPorNaFrente = null } = {}) {
  if (!srcs.length) return;
  fecharVisor();
  const el = document.createElement('div');
  el.className = 'visor';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Imagem ampliada');
  const varias = srcs.length > 1;
  el.innerHTML = `
    <img class="visor-img" alt="" draggable="false">
    <button class="redondo visor-fechar" data-v="fechar" title="Fechar (Esc)" aria-label="Fechar">${icone('X')}</button>
    ${varias ? `
      <button class="redondo visor-seta visor-ant" data-v="ant" title="Anterior (←)" aria-label="Imagem anterior">${icone('ChevronLeft')}</button>
      <button class="redondo visor-seta visor-prox" data-v="prox" title="Próxima (→)" aria-label="Próxima imagem">${icone('ChevronRight')}</button>
      <span class="visor-conta" aria-live="polite"></span>` : ''}
    ${varias && aoPorNaFrente ? '<button class="visor-acao" data-v="frente"></button>' : ''}
    <span class="visor-dica">Clique na imagem para ver no tamanho real</span>`;
  document.body.append(el);
  visor = { el, srcs: [...srcs], i, aoPorNaFrente, voltarFoco: document.activeElement };
  mostrarNoVisor(i);
  $('.visor-fechar', el).focus({ preventScroll: true });
  Movimento.animar(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 180 });

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (b) {
      if (b.dataset.v === 'fechar') fecharVisor();
      else if (b.dataset.v === 'frente') {
        if (!visor.i) return;
        visor.srcs = visor.aoPorNaFrente(visor.i);
        mostrarNoVisor(0);
      } else mostrarNoVisor(visor.i + (b.dataset.v === 'prox' ? 1 : -1));
      return;
    }
    if (e.target.matches('.visor-img')) { ampliarVisor(e); return; }
    fecharVisor(); // clicar fora da imagem fecha
  });
  el.addEventListener('mousemove', (e) => { if (el.classList.contains('ampliado')) moverAmpliado(e); });
}

function mostrarNoVisor(i) {
  if (!visor) return;
  const n = visor.srcs.length;
  visor.i = (i + n) % n;
  const img = $('.visor-img', visor.el);
  visor.el.classList.remove('ampliado', 'pode-ampliar');
  img.style.transform = '';
  img.onload = () => {
    // Só amplia o que está aparecendo menor que o tamanho real.
    if (visor) visor.el.classList.toggle('pode-ampliar', img.naturalWidth > img.clientWidth * 1.15 || img.naturalHeight > img.clientHeight * 1.15);
  };
  img.src = visor.srcs[visor.i];
  const conta = $('.visor-conta', visor.el);
  if (conta) conta.textContent = `${visor.i + 1} de ${n}`;
  const frente = $('.visor-acao', visor.el);
  if (frente) {
    const ja = visor.i === 0;
    frente.classList.toggle('feito', ja);
    frente.setAttribute('aria-disabled', String(ja));
    frente.innerHTML = ja ? `${icone('Check')} Este fica na frente` : `${icone('BringToFront')} Pôr na frente`;
    frente.title = ja ? 'É o shot que aparece na página' : 'Mostrar este shot na frente, na página';
  }
}

function ampliarVisor(e) {
  const el = visor.el;
  const img = $('.visor-img', el);
  if (el.classList.contains('ampliado')) {
    el.classList.remove('ampliado');
    img.style.transform = '';
    return;
  }
  if (!el.classList.contains('pode-ampliar')) return;
  visor.escala = Math.max(img.naturalWidth / img.clientWidth, img.naturalHeight / img.clientHeight);
  el.classList.add('ampliado');
  moverAmpliado(e);
}

// Ampliada, a imagem acompanha o mouse: a borda da tela mostra a borda da imagem.
function moverAmpliado(e) {
  const img = $('.visor-img', visor.el);
  const x = Math.min(1, Math.max(0, e.clientX / innerWidth));
  const y = Math.min(1, Math.max(0, e.clientY / innerHeight));
  img.style.transformOrigin = `${x * 100}% ${y * 100}%`;
  img.style.transform = `scale(${visor.escala})`;
}

function fecharVisor() {
  if (!visor) return;
  const { el, voltarFoco } = visor;
  visor = null;
  el.remove();
  if (voltarFoco && document.contains(voltarFoco)) voltarFoco.focus({ preventScroll: true });
}

// Na fase de captura: o Esc fecha só o visor, não a página por baixo dele.
window.addEventListener('keydown', (e) => {
  if (!visor) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); fecharVisor(); }
  else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && visor.srcs.length > 1) {
    e.preventDefault(); e.stopImmediatePropagation();
    mostrarNoVisor(visor.i + (e.key === 'ArrowRight' ? 1 : -1));
  } else if (e.key === 'Tab') {
    e.preventDefault(); e.stopImmediatePropagation();
    const botoes = $$('button', visor.el);
    const j = botoes.indexOf(document.activeElement);
    botoes[(j + (e.shiftKey ? -1 : 1) + botoes.length) % botoes.length].focus();
  }
}, true);
