'use strict';

// ---------- Retrospectiva em stories dos jogos (nandplay) ----------
//
// Os slides novos da retrospectiva de jogos; os que são iguais aos dos filmes e animes (capa,
// maiores notas, tierlist, jogo do mês, mosaico e resumão) estão em retro.js e já sabem o que
// mudar para o nandplay (ehRetroJogo: tema verde, marca "nandplay", "zerados" no lugar de
// "vistos"). Os dados vêm de dadosDoPeriodoJogos (jogos-estatisticas.js): d.lista = os zerados
// do período. Horas na Steam só aparecem com a chave e o perfil da Steam.

// Os jogos com mais horas na Steam (só com a biblioteca da conta), com uma barra para comparar.
async function slideMaisJogados(d, periodo, imgs) {
  const top = d.maisJogados.slice(0, 5);
  if (!top.length) return null;
  const maior = top[0][1];
  const c = novoCanvas();
  const ctx = c.getContext('2d');
  fundoRetro(ctx, imgs);
  kickerRetro(ctx, rotuloRetro(periodo), 80, 210);
  const yTitulo = escrever(ctx, 'Os que mais joguei', 80, 230, { peso: 800, tam: 84, altura: 1.05, maxLinhas: 2 });
  const capas = await Promise.all(top.map(([f]) => imagemRetro(f)));
  let y = yTitulo + 60;
  for (const [i, [f, minutos]] of top.entries()) {
    capaNoCanvas(ctx, capas[i], 80, y, 150, 225, { raio: 10 });
    ctx.font = fonteRetro(800, 44);
    ctx.fillStyle = RETRO_COR.apagado;
    ctx.fillText(String(i + 1), 280, y + 58);
    let ty = escrever(ctx, f.titulo, 340, y + 4, { peso: 700, tam: 46, largura: 660, maxLinhas: 2, altura: 1.12 });
    ty = escrever(ctx, `${minutosLegiveis(minutos)} jogadas`, 340, ty + 2, { peso: 600, tam: 32, cor: retroTema.acento, largura: 660, maxLinhas: 1 });
    ctx.fillStyle = 'rgba(232, 235, 240, .1)';
    ctx.beginPath();
    ctx.roundRect(340, ty + 22, 660, 16, 8);
    ctx.fill();
    ctx.fillStyle = retroTema.acento;
    ctx.beginPath();
    ctx.roundRect(340, ty + 22, Math.max(16, 660 * (minutos / maior)), 16, 8);
    ctx.fill();
    y += 256;
  }
  rodapeRetro(ctx, periodo);
  return c.toDataURL('image/png');
}

// Os números: zerados, horas, 100%, dias, nota e o que mais apareceu (as contas das estatísticas).
async function slideNumerosJogos(d, periodo, imgs) {
  const c = novoCanvas();
  const ctx = c.getContext('2d');
  fundoRetro(ctx, imgs);
  kickerRetro(ctx, rotuloRetro(periodo), 80, 210);
  escrever(ctx, 'Em números', 80, 230, { peso: 800, tam: 96 });
  const horas = Math.round(d.horasZerar);
  const horasSteam = d.temSteam && d.minutosJogados ? Math.round(d.minutosJogados / 60) : 0;
  const tiles = [
    ['Jogos zerados', d.lista.length],
    [horasSteam ? 'Horas na Steam' : 'Horas para zerar', horasSteam || horas],
    ['Em 100%', d.cem.length],
    ['Dias com jogo zerado', d.dias.length],
    ['Maior sequência', d.sequencia > 1 ? `${d.sequencia} dias` : '—'],
    ['Nota média', d.media ? `★ ${notaLegivel(Math.round(d.media * 10) / 10)}` : '—'],
  ];
  const tw = 440;
  const th = 210;
  tiles.forEach(([rot, val], i) => {
    const x = 80 + (i % 2) * (tw + 40);
    const y = 420 + Math.floor(i / 2) * (th + 30);
    ctx.fillStyle = 'rgba(232, 235, 240, .07)';
    ctx.beginPath();
    ctx.roundRect(x, y, tw, th, 24);
    ctx.fill();
    ctx.font = fonteRetro(500, 30);
    ctx.fillStyle = RETRO_COR.apagado;
    ctx.fillText(rot, x + 36, y + 62);
    ctx.font = fonteRetro(800, typeof val === 'number' ? 92 : 68);
    ctx.fillStyle = String(val).startsWith('★') ? retroTema.estrelas : RETRO_COR.texto;
    ctx.fillText(typeof val === 'number' ? val.toLocaleString('pt-BR') : val, x + 34, y + 170);
  });
  const dev = ranking(d.lista.flatMap((f) => [...new Set(desenvolvedoresDoJogo(f))]), 1)[0];
  const genero = ranking(d.lista.flatMap((f) => f.generos || []), 1)[0];
  const console_ = ranking(d.lista.flatMap((f) => [...new Set(consolesDoJogo(f))]), 1)[0];
  let y = 420 + 3 * (th + 30) + 40;
  for (const [rot, item] of [['Desenvolvedor mais jogado', dev], ['Gênero', genero], ['Console', console_]]) {
    if (!item) continue;
    ctx.font = fonteRetro(500, 32);
    ctx.fillStyle = RETRO_COR.apagado;
    ctx.fillText(rot, 80, y + 36);
    y = escrever(ctx, `${item[0]}${item[1] > 1 ? `  ·  ${item[1]} jogos` : ''}`, 80, y + 44, { peso: 700, tam: 50, maxLinhas: 1 });
    y += 30;
  }
  rodapeRetro(ctx, periodo);
  return c.toDataURL('image/png');
}

// A ordem dos slides da retrospectiva de jogos (cada um com um nome, como em retro.js: mexer na
// tierlist redesenha só os que dependem dela).
function slidesRetroJogos(d, periodo, fundoImgs, p) {
  return [
    { k: 'capa', fazer: () => slideCapa(d, periodo, fundoImgs) },
    { k: 'notas', fazer: () => slideNotas(d, periodo, fundoImgs) },
    { k: 'horas', fazer: () => slideMaisJogados(d, periodo, fundoImgs) },
    { k: 'tier', fazer: () => slideTierlist(d, periodo, fundoImgs) },
    { k: 'numeros', fazer: () => slideNumerosJogos(d, periodo, fundoImgs) },
    { k: 'mes', fazer: () => slideFilmeDoMes(periodo, fundoImgs, p) },
    { k: 'mosaico', fazer: () => slideMosaico(d, periodo, fundoImgs) },
    { k: 'resumo', fazer: () => slideResumo(d, periodo) },
  ];
}
