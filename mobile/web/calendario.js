'use strict';

// ---------- Calendário no celular ----------
//
// O mês do PC (células altas com as capas empilhadas) não cabe numa tela de
// celular. Aqui o calendário tem a cara de um app: uma barra fixa no alto (←,
// título), o mês numa grade de capas pequenas, e embaixo a watchlist de hoje
// numa fileira e o diário do mês em lista. A página do dia também é própria
// do celular: uma lista, no lugar dos cartões largos do PC. Os cliques usam os
// mesmos data-c, tratados pelo app.js.

function barraCalHTML({ voltar, titulo, acao = '' }) {
  return `
    <header class="cbar">
      <button class="cbar-voltar" data-c="${voltar}" aria-label="Voltar">${icone('ArrowLeft')}</button>
      <h1>${esc(titulo)}</h1>
      ${acao}
    </header>`;
}

const capaCalHTML = (f) => (srcCapa(f) ? `<img src="${esc(srcCapa(f))}" alt="" loading="lazy">` : `<span class="ccal-sem-capa">${esc(f.titulo)}</span>`);

// eslint-disable-next-line no-func-assign
mesHTML = function mesHTMLCelular(mes) {
  const [ano, m] = mes.split('-').map(Number);
  const deslocamento = new Date(ano, m - 1, 1).getDay();
  const diasNoMes = new Date(ano, m, 0).getDate();
  const porDia = vistosPorDia();
  const diaHoje = hoje();
  const mesAtual = diaHoje.slice(0, 7);
  const doMes = filmeDoMes(mes);
  const diasDoMes = [...porDia.entries()].filter(([d]) => d.startsWith(mes)).sort((a, b) => b[0].localeCompare(a[0]));
  const noMes = diasDoMes.reduce((n, [, fs]) => n + fs.length, 0);
  const wlHoje = idsWatchlist(diaHoje).map(porId).filter(Boolean);

  let celulas = '';
  for (let i = 0; i < deslocamento; i++) celulas += '<span class="ccal-dia ccal-branco" aria-hidden="true"></span>';
  for (let d = 1; d <= diasNoMes; d++) {
    const dia = `${mes}-${String(d).padStart(2, '0')}`;
    let vistos = porDia.get(dia) || [];
    const temDoMes = Boolean(doMes && vistos.includes(doMes));
    if (temDoMes) vistos = [doMes, ...vistos.filter((f) => f !== doMes)];
    const wl = idsWatchlist(dia).length;
    const classes = ['ccal-dia'];
    if (vistos.length) classes.push('com-vistos');
    if (vistos.length > 1) classes.push('varios');
    if (temDoMes) classes.push('do-mes');
    if (dia === diaHoje) classes.push('hoje');
    if (dia > diaHoje) classes.push('futuro');
    const src = vistos.length ? srcCapa(vistos[0]) : '';
    celulas += `
      <button class="${classes.join(' ')}" data-c="dia" data-dia="${dia}" aria-label="${esc(`${diaLegivel(dia)}${vistos.length ? `: ${vistos.length} visto${vistos.length === 1 ? '' : 's'}` : ''}`)}">
        ${src ? `<img src="${esc(src)}" alt="">` : ''}
        <span class="ccal-num">${d}</span>
        ${vistos.length > 1 ? `<span class="ccal-mais">${vistos.length}</span>` : ''}
        ${temDoMes ? `<span class="ccal-trofeu">${icone('Trophy')}</span>` : ''}
        ${wl && !vistos.length ? '<span class="ccal-ponto" aria-hidden="true"></span>' : ''}
      </button>`;
  }

  const anterior = mesVizinho(mes, -1);
  const proximo = mesVizinho(mes, 1);
  const linhaDiario = (f) => `
    <button class="ccal-linha" data-c="detalhes" data-id="${f.id}">
      <span class="ccal-capa">${capaCalHTML(f)}</span>
      <span class="ccal-info">
        <strong>${esc(f.titulo)}</strong>
        <small>${esc([f.ano, f.diretor].filter(Boolean).join(' · '))}</small>
        ${f.minhaNota ? notaFixaHTML(f.minhaNota) : ''}
      </span>
      ${doMes === f ? `<span class="ccal-linha-trofeu" title="Filme do mês">${icone('Trophy')}</span>` : temPagina(f) ? `<span class="ccal-linha-pagina" title="Tem página">${icone('NotebookPen')}</span>` : ''}
    </button>`;
  const grupoDiario = ([dia, fs]) => {
    const dt = new Date(`${dia}T12:00:00`);
    const semana = dt.toLocaleDateString('pt-BR', { weekday: 'long' });
    return `
      <div class="ccal-grupo">
        <button class="ccal-grupo-dia" data-c="dia" data-dia="${dia}">
          <b>${dt.getDate()}</b><span>${esc(dia === diaHoje ? 'hoje' : semana)}</span>${icone('ChevronRight')}
        </button>
        ${fs.map(linhaDiario).join('')}
      </div>`;
  };

  return `
    ${barraCalHTML({ voltar: 'fechar', titulo: 'Calendário' })}
    <div class="cal-topo ccal-topo">
      <div class="cal-navegacao">
        <h2>${esc(MESES[m - 1])} <span class="cal-ano">${ano}</span></h2>
        <div class="cal-setas">
          <button class="ccal-seta" data-c="mes" data-mes="${anterior}" ${anterior < primeiroMes() ? 'disabled' : ''} aria-label="Mês anterior">${icone('ChevronLeft')}</button>
          <button class="ccal-seta" data-c="mes" data-mes="${proximo}" ${proximo > mesVizinho(mesAtual, 1) ? 'disabled' : ''} aria-label="Próximo mês">${icone('ChevronRight')}</button>
        </div>
      </div>
      <p class="ccal-resumo">
        <span>${noMes ? `<b>${noMes}</b> ${noMes === 1 ? 'filme visto' : 'filmes vistos'}` : 'Nada visto ainda'}</span>
        ${mes !== mesAtual ? `<button class="ccal-hoje-btn" data-c="mes" data-mes="${mesAtual}">Voltar para hoje</button>` : ''}
      </p>
    </div>
    <div class="ccal-semana" aria-hidden="true">${DIAS_SEMANA.map((d) => `<span>${d.slice(0, 1)}</span>`).join('')}</div>
    <div class="cal-grade ccal-grade">${celulas}</div>
    ${doMes
      ? `<button class="ccal-do-mes" data-c="filme-do-mes" data-mes="${mes}">
          <span class="ccal-do-mes-capa">${capaCalHTML(doMes)}</span>
          <span class="ccal-do-mes-texto"><small>${icone('Trophy')} Filme de ${esc(MESES[m - 1])}</small><strong>${esc(doMes.titulo)}</strong></span>
          ${icone('ChevronRight')}
        </button>`
      : noMes ? `<button class="ccal-do-mes vazio" data-c="filme-do-mes" data-mes="${mes}">
          <span class="ccal-do-mes-icone">${icone('Trophy')}</span>
          <span class="ccal-do-mes-texto"><strong>Escolher o filme do mês</strong><small>O melhor que você viu em ${esc(MESES[m - 1])}</small></span>
          ${icone('ChevronRight')}
        </button>` : ''}
    ${mes === mesAtual ? `
      <section class="ccal-secao">
        <header>
          <h3>Para ver hoje</h3>
          <button class="ccal-acao" data-c="dia" data-dia="${diaHoje}">Ver o dia ${icone('ChevronRight')}</button>
        </header>
        <div class="ccal-trilho">
          ${wlHoje.map((f) => `<button class="ccal-wl" data-c="detalhes" data-id="${f.id}" aria-label="${esc(f.titulo)}">${capaCalHTML(f)}</button>`).join('')}
          <button class="ccal-wl ccal-wl-sortear" data-c="sortear-hoje">${icone('Dices')}<span>Sortear um filme</span></button>
        </div>
      </section>` : ''}
    <section class="ccal-secao">
      <header><h3>Diário de ${esc(MESES[m - 1])}</h3></header>
      ${diasDoMes.length
        ? `<div class="ccal-diario">${diasDoMes.map(grupoDiario).join('')}</div>`
        : `<p class="ccal-vazio">Nenhum filme visto em ${esc(MESES[m - 1])}.</p>`}
    </section>`;
};

// ---------- A página do dia ----------

function itemWatchlistCelHTML(f, dia) {
  const ehHoje = dia === hoje();
  const meta = [f.ano, duracaoDe(f), f.diretor].filter(Boolean).join(' · ');
  return `
    <article class="cal-filme cdia-item" data-id="${f.id}">
      <button class="cdia-capa" data-c="detalhes" data-id="${f.id}" aria-label="Detalhes de ${esc(f.titulo)}">${capaCalHTML(f)}</button>
      <div class="cdia-info">
        <strong>${esc(f.titulo)}</strong>
        <small>${esc(meta)}</small>
        <div class="cdia-botoes">
          ${ehHoje ? `<button class="cdia-assistir" data-c="assistir" data-id="${f.id}">${icone('Play', { preenchido: true })} Assistir</button>
            <button class="cdia-icone" data-c="vi" data-id="${f.id}" aria-label="Marcar como visto hoje">${icone('Check')}</button>` : ''}
          <button class="cdia-icone" data-c="mover" data-id="${f.id}" data-de="${dia}" data-para="${diaSeguinte(dia)}" aria-label="${ehHoje ? 'Passar para amanhã' : 'Passar para o dia seguinte'}">${icone('Forward')}</button>
          <button class="cdia-icone" data-c="tirar" data-id="${f.id}" data-dia="${dia}" aria-label="Tirar da watchlist">${icone('X')}</button>
        </div>
        ${dia > hoje() ? `<button class="cdia-link" data-c="mover" data-id="${f.id}" data-de="${dia}" data-para="${hoje()}">${icone('Undo2')} Trazer para hoje</button>` : ''}
      </div>
    </article>`;
}

function itemVistoCelHTML(f, dia) {
  const mes = dia.slice(0, 7);
  const ehDoMes = filmeDoMes(mes)?.id === f.id;
  const meta = [f.ano, f.diretor].filter(Boolean).join(' · ');
  const trofeu = `<button class="cdia-trofeu${ehDoMes ? ' on' : ''}" data-c="alternar-filme-do-mes" data-id="${f.id}" data-mes="${mes}" aria-pressed="${ehDoMes}">
      ${icone('Trophy')} ${ehDoMes ? 'Filme do mês' : 'Filme do mês?'}</button>`;
  const pagina = temPagina(f);
  return `
    <article class="cal-filme cdia-item cdia-visto${pagina ? ' com-pagina' : ''}${ehDoMes ? ' do-mes' : ''}" data-id="${f.id}">
      <button class="cdia-capa" data-c="detalhes" data-id="${f.id}" aria-label="Detalhes de ${esc(f.titulo)}">${capaCalHTML(f)}</button>
      <div class="cdia-info">
        <strong>${esc(f.titulo)}</strong>
        <small>${esc(meta)}</small>
        ${f.minhaNota ? notaFixaHTML(f.minhaNota) : ''}
      </div>
      ${pagina
        ? `<button class="cdia-citacao" data-c="pagina" data-id="${f.id}">
            <span class="cdia-citacao-texto">“${esc(trechoDaPagina(f.pagina, 200))}”</span>
            <span class="cdia-citacao-rodape">${icone('BookOpen')} Ler página · ${esc(leituraDaPagina(f.pagina))}</span>
          </button>`
        : ''}
      <div class="cdia-rodape">
        ${trofeu}
        ${pagina ? '' : `<button class="cdia-escrever" data-c="pagina" data-id="${f.id}">${icone('PenLine')} Escrever sobre o filme</button>`}
      </div>
    </article>`;
}

// eslint-disable-next-line no-func-assign
paginaDiaHTML = function paginaDiaHTMLCelular(dia) {
  const vistos = vistosPorDia().get(dia) || [];
  const ehHoje = dia === hoje();
  const futuro = dia > hoje();
  const watchlist = idsWatchlist(dia).map(porId).filter(Boolean);
  const dt = new Date(`${dia}T12:00:00`);
  const semana = dt.toLocaleDateString('pt-BR', { weekday: 'long' });
  const nomeSemana = semana.charAt(0).toUpperCase() + semana.slice(1);
  const destaque = vistos.find(temPagina) || vistos[0] || watchlist[0];
  const ordenados = [...vistos.filter(temPagina), ...vistos.filter((f) => !temPagina(f))];
  const contagem = (n) => (n ? `<span class="cdia-n">${n}</span>` : '');
  return `
    ${barraCalHTML({ voltar: 'voltar', titulo: MESES[dt.getMonth()].replace(/^./, (c) => c.toUpperCase()) })}
    <div class="cdia-topo${destaque ? ' com-fundo' : ''}">
      ${destaque ? `<div class="cal-dia-fundo cdia-fundo" style="${esc(fundoCapa(destaque))}" aria-hidden="true"></div>` : ''}
      <div class="cal-dia-titulo cdia-titulo">
        <b>${dt.getDate()}</b>
        <span>${esc(nomeSemana)}${ehHoje ? ' <em>hoje</em>' : ''}<small>${esc(MESES[dt.getMonth()])} de ${dt.getFullYear()}</small></span>
      </div>
    </div>
    ${ehHoje || futuro ? `
      <section class="cal-secao cdia-secao" data-secao="watchlist">
        <header><h3>${ehHoje ? 'Para ver hoje' : 'Para ver neste dia'} ${contagem(watchlist.length)}</h3></header>
        ${ehHoje ? `<div class="cdia-pilulas">
            <button class="cel-pilula" data-c="sortear-hoje">${icone('Dices')} Sortear um filme</button>
            <button class="cel-pilula" data-c="sortear-hoje-filtro">${icone('SlidersHorizontal')} Com filtro</button>
          </div>` : ''}
        ${watchlist.length
          ? `<div class="cdia-lista">${watchlist.map((f) => itemWatchlistCelHTML(f, dia)).join('')}</div>`
          : `<p class="ccal-vazio">${ehHoje
            ? `Nada separado ainda. Sorteie um filme ou toque em ${icone('CalendarClock')} nos detalhes de um filme. A lista vira junto com o dia, às 5h.`
            : 'Nenhum filme planejado para este dia.'}</p>`}
      </section>` : ''}
    ${futuro ? '' : `
      <section class="cal-secao cdia-secao">
        <header><h3>${ehHoje ? 'Vistos hoje' : 'Vistos neste dia'} ${contagem(vistos.length)}</h3></header>
        ${vistos.length
          ? `<div class="cdia-lista">${ordenados.map((f) => itemVistoCelHTML(f, dia)).join('')}</div>`
          : `<p class="ccal-vazio">${ehHoje ? 'Nenhum filme visto hoje ainda.' : 'Nenhum filme visto neste dia.'}</p>`}
      </section>`}`;
};

// Deslizar o dedo de lado na grade troca o mês, como nas setas.
(() => {
  let x0 = null;
  let y0 = null;
  const caixa = document.getElementById('calendario-caixa');
  caixa.addEventListener('touchstart', (e) => {
    const grade = e.target.closest('.ccal-grade');
    if (!grade || e.touches.length !== 1) { x0 = null; return; }
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
  }, { passive: true });
  caixa.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const seta = caixa.querySelectorAll('.ccal-seta')[dx < 0 ? 1 : 0];
    if (seta && !seta.disabled) seta.click();
  }, { passive: true });
})();
