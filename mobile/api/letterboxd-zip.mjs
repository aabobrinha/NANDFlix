// O seletor de arquivos do Android (o WebView abre o do sistema), para escolher
// o que foi exportado de outro app: o .zip do Letterboxd, os .csv do IMDb etc.
// A leitura dos arquivos fica em lib/importar.js (textosDosArquivos).
export function escolherArquivos() {
  return new Promise((ok) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.hidden = true;
    const fim = (lista) => { ok(lista); input.remove(); };
    input.addEventListener('change', () => fim([...input.files]));
    input.addEventListener('cancel', () => fim([]));
    document.body.append(input);
    input.click();
  });
}
