#!/usr/bin/env node
// Monta lib/premios-<id>.json: as cerimônias de cada prêmio já com indicados,
// lidas da Wikipédia, e cada filme com o código do IMDb e o id do TMDB (Wikidata).
//   npm run premios               (todos os prêmios)
//   npm run premios -- oscar globo (só esses)
// O app usa esses arquivos como histórico e busca sozinho só as cerimônias recentes;
// rode de novo de vez em quando (depois de cada temporada) para o histórico ficar em dia.
const fs = require('fs');
const path = require('path');
const premios = require('../lib/premios');

async function gerar(id) {
  const p = premios.PREMIOS[id];
  const ultimo = p.numero(new Date().getUTCFullYear() + 1);
  const numeros = [];
  for (let n = p.primeiro; n <= ultimo; n++) numeros.push(n);
  const cerimonias = [];
  let filmes = {};
  let semPagina = 0;
  // Em lotes, para a Wikipédia não reclamar.
  for (let i = 0; i < numeros.length; i += 10) {
    const r = await premios.buscarCerimonias(id, numeros.slice(i, i + 10), filmes);
    filmes = r.filmes;
    for (const c of r.cerimonias) {
      if (!c.existe) { semPagina++; continue; }
      if (!c.indicados) { console.log(`  ${id} ${c.numero} (${c.ano}): sem indicados`); continue; }
      cerimonias.push(c);
    }
  }
  const dados = premios.compactar({ premio: id, cerimonias, filmes });
  const saida = path.join(__dirname, '..', 'lib', `premios-${id}.json`);
  fs.writeFileSync(saida, JSON.stringify(dados));
  const nFilmes = Object.keys(dados.filmes).length;
  const jogo = premios.ehPremioDeJogo(p);
  // Cinema: [imdb, tmdb]; jogos: [igdbSlug, igdb, steam] (ligado = tem o slug do IGDB ou a Steam).
  const comImdb = Object.values(dados.filmes).filter((f) => (jogo ? f[0] || f[2] : f[0])).length;
  const comIgdb = jogo ? Object.values(dados.filmes).filter((f) => f[0]).length : 0;
  const comSteam = jogo ? Object.values(dados.filmes).filter((f) => f[2]).length : 0;
  const semVencedor = cerimonias.filter((c) => c.vencedores && c.categorias.some((k) => !k.indicados.some((x) => x.venceu))).length;
  // As categorias ainda sem nome em português (para completar CATEGORIAS_PT).
  const semTraducao = new Map();
  for (const c of cerimonias) for (const k of c.categorias) if (k.nome === k.original && /[a-z]/.test(k.nome) && !premios.CATEGORIAS_PT[k.chave] && !(jogo && premios.CATEGORIAS_PT_JOGOS[k.chave])) semTraducao.set(k.chave, (semTraducao.get(k.chave) || 0) + 1);
  console.log(`${p.nome}: ${cerimonias.length} cerimônias (${cerimonias[cerimonias.length - 1]?.ano || '-'}), ${nFilmes} ${jogo ? 'jogos' : 'filmes'} (${jogo ? `${comImdb} ligados: ${comIgdb} com IGDB, ${comSteam} com Steam` : `${comImdb} com IMDb`}), ${semPagina} sem página, ${semVencedor} com categoria sem vencedor → ${path.basename(saida)} (${Math.round(fs.statSync(saida).size / 1024)} KB)`);
  if (semTraducao.size) console.log(`  sem tradução: ${[...semTraducao].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, n]) => `${k} (${n})`).join('; ')}`);
}

(async () => {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  for (const id of ids.length ? ids : Object.keys(premios.PREMIOS)) {
    if (!premios.PREMIOS[id]) { console.error(`Prêmio desconhecido: ${id}`); continue; }
    try {
      await gerar(id);
    } catch (e) {
      console.error(`${premios.PREMIOS[id].nome}: deu erro (${e.message}); o arquivo antigo ficou. Rode de novo só ele: npm run premios -- ${id}`);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
