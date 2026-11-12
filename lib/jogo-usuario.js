// O que o usuário grava num jogo (nandplay) pela página do jogo: status, tags,
// a data em que zerou e o id do HowLongToBeat. Usado no processo principal e no
// celular, na hora de aceitar as mudanças de filme:atualizar / atualizarFilme.

const STATUS_JOGO = ['quero', 'jogando', 'pausado', 'zerado', 'cem', 'larguei'];
// Zerei e 100% são os que têm a data em que zerou (o calendário marca só ela).
const STATUS_ZERADO = ['zerado', 'cem'];

const MAX_TAGS = 30;
const MAX_TAG = 40;

// Uma tag: sem espaços sobrando, até 40 letras. Repetidas (sem diferença de maiúsculas) saem.
function limparTags(tags) {
  const r = [];
  const vistas = new Set();
  for (const t of Array.isArray(tags) ? tags : []) {
    const tag = String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG).trim();
    const k = tag.toLocaleLowerCase('pt-BR');
    if (!tag || vistas.has(k)) continue;
    vistas.add(k);
    r.push(tag);
    if (r.length >= MAX_TAGS) break;
  }
  return r;
}

const diaValido = (d) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(`${d}T12:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
};

// Só os campos de jogo que valem, já limpos. O que vier errado fica de fora.
function camposDoJogo(mudancas) {
  const m = mudancas || {};
  const r = {};
  if ('status' in m && STATUS_JOGO.includes(m.status)) r.status = m.status;
  if ('zeradoEm' in m) {
    const d = String(m.zeradoEm ?? '');
    if (d === '' || diaValido(d)) r.zeradoEm = d;
  }
  if ('tags' in m && Array.isArray(m.tags)) r.tags = limparTags(m.tags);
  if ('hltb' in m) {
    const h = String(m.hltb ?? '').trim();
    if (h === '') r.hltb = '';
    else if (/^[1-9]\d{0,8}$/.test(h)) r.hltb = Number(h);
  }
  return r;
}

module.exports = { STATUS_JOGO, STATUS_ZERADO, limparTags, camposDoJogo };
