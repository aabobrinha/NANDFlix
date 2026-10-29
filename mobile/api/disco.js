// "Disco" do celular: os arquivos do app (filmes.json, config.json,
// sincronia.json, imagens coladas…) ficam no IndexedDB do app, que é só dele.
//
// Imita o pedaço do `fs` do Node que lib/marcas.js e lib/nuvem.js usam, para
// o mesmo código rodar no PC e no celular. Tudo é lido para a memória ao abrir
// (carregarDisco) e cada gravação vai para o IndexedDB logo depois, em segundo
// plano; ler é sempre imediato.

const BANCO = 'nandflix';
const LOJA = 'arquivos';
const mem = new Map();
const pendentes = new Set();
let banco = null;
let timer = null;

function abrir() {
  return new Promise((ok, falha) => {
    const r = indexedDB.open(BANCO, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(LOJA);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
}

export async function carregarDisco() {
  banco = await abrir();
  await new Promise((ok, falha) => {
    const t = banco.transaction(LOJA, 'readonly');
    const req = t.objectStore(LOJA).openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) { ok(); return; }
      mem.set(c.key, c.value);
      c.continue();
    };
    req.onerror = () => falha(req.error);
  });
}

// Grava em lote o que mudou (várias gravações seguidas viram uma transação).
function agendar(caminho) {
  pendentes.add(caminho);
  if (!timer) timer = setTimeout(descarregar, 200);
}

export function descarregar() {
  clearTimeout(timer);
  timer = null;
  if (!banco || !pendentes.size) return Promise.resolve();
  const t = banco.transaction(LOJA, 'readwrite');
  const loja = t.objectStore(LOJA);
  for (const c of pendentes) {
    if (mem.has(c)) loja.put(mem.get(c), c); else loja.delete(c);
  }
  pendentes.clear();
  return new Promise((ok) => { t.oncomplete = ok; t.onerror = ok; });
}

// Grava o que falta quando o app vai para o fundo (o Android pode fechá-lo).
document.addEventListener('visibilitychange', () => { if (document.hidden) descarregar(); });

const enc = new TextEncoder();
const dec = new TextDecoder();
const normal = (p) => String(p).replace(/\\/g, '/').replace(/\/+/g, '/');

function erroNaoExiste(p) {
  const e = new Error(`ENOENT: ${p}`);
  e.code = 'ENOENT';
  return e;
}

export const fs = {
  existsSync: (p) => {
    p = normal(p);
    if (mem.has(p)) return true;
    const pasta = p.endsWith('/') ? p : `${p}/`;
    for (const k of mem.keys()) if (k.startsWith(pasta)) return true;
    return false;
  },
  readFileSync: (p, opcoes) => {
    p = normal(p);
    if (!mem.has(p)) throw erroNaoExiste(p);
    const v = mem.get(p);
    const comoTexto = opcoes === 'utf8' || (opcoes && opcoes.encoding);
    if (comoTexto) return typeof v === 'string' ? v : dec.decode(v);
    return typeof v === 'string' ? enc.encode(v) : v;
  },
  writeFileSync: (p, dados) => {
    p = normal(p);
    let v = dados;
    if (dados instanceof ArrayBuffer) v = new Uint8Array(dados);
    else if (ArrayBuffer.isView(dados)) v = new Uint8Array(dados.buffer.slice(dados.byteOffset, dados.byteOffset + dados.byteLength));
    else v = String(dados);
    mem.set(p, v);
    agendar(p);
  },
  renameSync: (de, para) => {
    de = normal(de); para = normal(para);
    if (!mem.has(de)) throw erroNaoExiste(de);
    mem.set(para, mem.get(de));
    mem.delete(de);
    agendar(de);
    agendar(para);
  },
  unlinkSync: (p) => { p = normal(p); mem.delete(p); agendar(p); },
  rmSync: (p) => { p = normal(p); mem.delete(p); agendar(p); },
  mkdirSync: () => {},
  readdirSync: (p) => {
    const pasta = `${normal(p).replace(/\/$/, '')}/`;
    const nomes = new Set();
    for (const k of mem.keys()) if (k.startsWith(pasta)) nomes.add(k.slice(pasta.length).split('/')[0]);
    return [...nomes];
  },
};

// O tamanho de cada coisa guardada (para a tela de Configurações).
export function tamanhoDisco() {
  let total = 0;
  for (const v of mem.values()) total += typeof v === 'string' ? v.length : v.byteLength;
  return total;
}

export default fs;
