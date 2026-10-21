#!/usr/bin/env node
// Importa a planilha pela linha de comando:
//   npm run import -- caminho/arquivo.xlsx [--substituir | --juntar]
// Grava no mesmo arquivo que o app usa. Feche o app antes de rodar.
const fs = require('fs');
const path = require('path');
const armazem = require('../lib/armazem');
const { lerPlanilha } = require('../lib/planilha');
const { juntar, resumo } = require('../lib/filmes');

const args = process.argv.slice(2);
const arquivo = args.find((a) => !a.startsWith('--'));
const modo = args.includes('--juntar') ? 'juntar' : args.includes('--substituir') ? 'substituir' : null;

if (!arquivo) {
  console.error('Uso: npm run import -- caminho/arquivo.xlsx [--substituir | --juntar]');
  process.exit(1);
}
if (!fs.existsSync(arquivo)) {
  console.error(`Arquivo não encontrado: ${arquivo}`);
  process.exit(1);
}

const pasta = armazem.pastaDadosPadrao();
const existentes = armazem.lerFilmes(pasta);
if (existentes.length && !modo) {
  console.error(`Já existem ${existentes.length} filmes salvos em ${pasta}.`);
  console.error('Rode de novo com --substituir (troca tudo) ou --juntar (mantém os dados do app para filmes repetidos).');
  process.exit(1);
}

let importados;
try {
  importados = lerPlanilha(fs.readFileSync(arquivo));
} catch (e) {
  console.error(`Não consegui ler a planilha: ${e.message}`);
  process.exit(1);
}

armazem.fazerBackup(pasta);
let filmes = importados;
let extra = '';
if (modo === 'juntar') {
  const r = juntar(existentes, importados);
  filmes = r.filmes;
  extra = `  (${r.adicionados} novos, ${r.repetidos} repetidos ignorados)`;
}
armazem.gravarFilmes(pasta, filmes);

const r = resumo(filmes);
console.log(`Planilha: ${path.basename(arquivo)}`);
console.log(`Importados: ${r.total} filmes${extra}`);
console.log(`Vistos: ${r.vistos}`);
console.log(`Favoritos: ${r.favoritos}`);
console.log(`Com capa: ${r.comCapa}`);
console.log(`Salvo em: ${armazem.caminhos(pasta).filmes}`);
if (r.comCapa < r.total) console.log('As capas que faltam serão buscadas no OMDb quando o app abrir.');
