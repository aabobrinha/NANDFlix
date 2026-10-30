// Export do Letterboxd no celular: o .zip que o site manda (sem descompactar)
// ou os .csv soltos. Devolve os textos dos CSVs que o lib/letterboxd.js lê.
// Do zip, só os arquivos da raiz: as pastas "deleted" e "orphaned" do export
// têm outros diary.csv, de entradas apagadas, que não contam.
import { unzipSync, strFromU8 } from 'fflate';

const ARQUIVOS = ['diary.csv', 'watched.csv', 'ratings.csv', 'watchlist.csv'];

export async function textosDoExport(arquivos) {
  const textos = {};
  for (const a of arquivos) {
    const bytes = new Uint8Array(await a.arrayBuffer());
    const ehZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"
    if (ehZip) {
      const z = unzipSync(bytes, { filter: (f) => ARQUIVOS.includes(f.name) });
      for (const [nome, dados] of Object.entries(z)) textos[nome] = strFromU8(dados);
    } else {
      const nome = String(a.name || '').toLowerCase().split(/[\\/]/).pop();
      if (ARQUIVOS.includes(nome)) textos[nome] = strFromU8(bytes);
    }
  }
  return textos;
}

// O seletor de arquivos do Android (o WebView abre o do sistema).
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
