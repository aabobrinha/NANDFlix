#!/usr/bin/env node
// Monta lib/premios-oscar.json: todas as cerimônias do Oscar já com indicados,
// lidas da Wikipédia, e cada filme com o código do IMDb e o id do TMDB (Wikidata).
//   npm run premios
// O app usa este arquivo como histórico e busca sozinho só as cerimônias recentes;
// rode de novo de vez em quando (depois de cada Oscar) para o histórico ficar em dia.
const fs = require('fs');
const path = require('path');
const premios = require('../lib/premios');

const PREMIO = 'oscar';
const SAIDA = path.join(__dirname, '..', 'lib', `premios-${PREMIO}.json`);

(async () => {
  const p = premios.PREMIOS[PREMIO];
  const ultimo = p.numeroDoAno(new Date().getUTCFullYear() + 1);
  const numeros = Array.from({ length: ultimo }, (_, i) => i + 1);
  const cerimonias = [];
  let filmes = {};
  // Em lotes, para a Wikipédia não reclamar.
  for (let i = 0; i < numeros.length; i += 10) {
    const lote = numeros.slice(i, i + 10);
    const r = await premios.buscarCerimonias(PREMIO, lote, filmes);
    filmes = r.filmes;
    for (const c of r.cerimonias) {
      if (!c.indicados) { console.log(`${c.numero}ª (${c.ano}): ${c.existe ? 'sem indicados ainda' : 'sem página'}`); continue; }
      const ind = c.categorias.flatMap((k) => k.indicados);
      const semVencedor = c.categorias.filter((k) => !k.indicados.some((x) => x.venceu)).map((k) => k.chave);
      console.log(`${c.numero}ª (${c.ano}): ${c.categorias.length} categorias, ${ind.length} indicações${semVencedor.length && c.vencedores ? ` (sem vencedor: ${semVencedor.join(', ')})` : ''}`);
      cerimonias.push(c);
    }
  }
  // Só os filmes que aparecem, no formato compacto (premios.compactar).
  const dados = premios.compactar({ premio: PREMIO, cerimonias, filmes });
  const nFilmes = Object.keys(dados.filmes).length;
  const comImdb = Object.values(dados.filmes).filter((f) => f[0]).length;
  fs.writeFileSync(SAIDA, JSON.stringify(dados));
  console.log(`\n${cerimonias.length} cerimônias, ${nFilmes} filmes (${comImdb} com IMDb) → ${path.relative(process.cwd(), SAIDA)} (${Math.round(fs.statSync(SAIDA).size / 1024)} KB)`);
})().catch((e) => { console.error(e); process.exit(1); });
