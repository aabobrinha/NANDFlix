// Gravação dos dados em JSON local, com backups.
const fs = require('fs');
const path = require('path');
const os = require('os');

const NOME_APP = 'Filmes legais';
const NOME_ANTIGO = 'Quintessential Films';
const MAX_BACKUPS = 5;

function pastaAppData() {
  if (process.platform === 'win32') return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support');
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

// O app se chamava "Quintessential Films": se só a pasta antiga existir, ela é
// renomeada para o nome novo, levando filmes, capas e backups junto.
function migrarPastaAntiga(appData = pastaAppData()) {
  const nova = path.join(appData, NOME_APP);
  const antiga = path.join(appData, NOME_ANTIGO);
  if (!fs.existsSync(nova) && fs.existsSync(antiga)) {
    try {
      fs.renameSync(antiga, nova);
    } catch {
      fs.cpSync(antiga, nova, { recursive: true });
    }
  }
  return nova;
}

// Mesmo caminho que app.getPath('userData') usa no Electron, para o script de
// importação pela linha de comando gravar no mesmo lugar que o app.
function pastaDadosPadrao() {
  return migrarPastaAntiga();
}

function caminhos(pasta) {
  return {
    filmes: path.join(pasta, 'filmes.json'),
    config: path.join(pasta, 'config.json'),
    backups: path.join(pasta, 'backups'),
    capas: path.join(pasta, 'capas'),
  };
}

function lerJSON(arquivo, padrao) {
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch {
    return padrao;
  }
}

// Escreve num arquivo temporário e renomeia: um travamento no meio da gravação
// não deixa o JSON pela metade.
function gravarJSON(arquivo, dados) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const tmp = arquivo + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2), 'utf8');
  fs.renameSync(tmp, arquivo);
}

function lerFilmes(pasta) {
  const dados = lerJSON(caminhos(pasta).filmes, null);
  if (!dados) return [];
  return Array.isArray(dados) ? dados : dados.filmes || [];
}

function gravarFilmes(pasta, filmes) {
  gravarJSON(caminhos(pasta).filmes, { versao: 1, salvoEm: new Date().toISOString(), filmes });
}

function fazerBackup(pasta) {
  const c = caminhos(pasta);
  if (!fs.existsSync(c.filmes)) return null;
  fs.mkdirSync(c.backups, { recursive: true });
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  const destino = path.join(c.backups, `filmes-${carimbo}.json`);
  fs.copyFileSync(c.filmes, destino);
  const antigos = fs.readdirSync(c.backups)
    .filter((n) => /^filmes-.*\.json$/.test(n))
    .sort()
    .reverse()
    .slice(MAX_BACKUPS);
  for (const n of antigos) fs.unlinkSync(path.join(c.backups, n));
  return destino;
}

module.exports = { pastaDadosPadrao, migrarPastaAntiga, caminhos, lerJSON, gravarJSON, lerFilmes, gravarFilmes, fazerBackup, NOME_APP };
