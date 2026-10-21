const { contextBridge, ipcRenderer, webUtils } = require('electron');

const chamar = (canal) => (...args) => ipcRenderer.invoke(canal, ...args);
const ouvir = (canal) => (fn) => ipcRenderer.on(canal, (_e, dados) => fn(dados));

contextBridge.exposeInMainWorld('api', {
  plataforma: process.platform,
  carregar: chamar('dados:carregar'),
  salvarConfig: chamar('config:salvar'),
  atualizarFilme: chamar('filme:atualizar'),
  acharRepetido: chamar('filme:repetido'),
  adicionarFilme: chamar('filme:adicionar'),
  excluirFilme: chamar('filme:excluir'),
  trocarCapa: chamar('filme:trocarCapa'),
  baixarCapa: chamar('capa:baixar'),
  baixarTodasCapas: chamar('capas:baixarTodas'),
  usarArquivoCapa: chamar('capa:usarArquivo'),
  // Caminho de um arquivo arrastado para a janela (File.path não existe mais).
  caminhoDoArquivo: (arquivo) => webUtils.getPathForFile(arquivo),
  obterTrailer: chamar('trailer:obter'),
  definirTrailer: chamar('trailer:definir'),
  infoFilme: chamar('filme:info'),
  pesquisarOmdb: chamar('omdb:pesquisar'),
  detalhesOmdb: chamar('omdb:detalhes'),
  buscarCapas: chamar('capas:buscar'),
  abrirStremio: chamar('abrir:stremio'),
  abrirLetterboxd: chamar('abrir:letterboxd'),
  abrirPastaDados: chamar('abrir:pastaDados'),
  lerPlanilha: chamar('planilha:ler'),
  aplicarPlanilha: chamar('planilha:aplicar'),
  exportarPlanilha: chamar('planilha:exportar'),
  exportarBackup: chamar('backup:exportar'),
  importarBackup: chamar('backup:importar'),
  aoMudarFilme: ouvir('filme:mudou'),
  aoProgressoCapas: ouvir('capas:progresso'),
  aoFimCapas: ouvir('capas:fim'),
});
