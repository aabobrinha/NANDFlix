// Sincronia com a nuvem (Supabase): login por e-mail e senha, envio e
// recebimento das mudanças, aviso em tempo real e as imagens que não vêm do TMDB.
//
// Como funciona (o esquema do banco está em supabase/esquema.sql):
// - Cada filme e cada pedaço das configurações é um registro com `marcas`
//   (quando cada campo mudou, ver lib/marcas.js).
// - Enviar: manda só os registros que têm alguma marca mais nova do que a que a
//   nuvem tem. A função mesclar_registros junta campo a campo e devolve como
//   ficou, e o que voltou é aplicado aqui (pode ter algo mais novo de lá).
// - Receber: busca os registros mudados desde a última vez (pela hora do
//   servidor) e aplica campo a campo: a marca mais nova vence.
// - Página do filme mudada nos dois aparelhos antes de sincronizar: a daqui
//   fica guardada em `paginaOutra`, e a tela da página pergunta qual fica.
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { pedacosConfig, camposFilme } = require('./marcas');

const POR_LOTE = 100;
const POR_PAGINA = 1000;
const RE_FOTO = /capa:\/\/foto\/([\w.-]+)/g;

const maior = (m) => Math.max(0, ...Object.values(m || {}).map(Number).filter(Number.isFinite));

// Põe um pedaço das configurações de volta no objeto (o contrário de pedacosConfig).
function aplicarPedaco(config, p, existe, v) {
  const barra = p.indexOf('/');
  if (p === 'tierlists:ordem') {
    if (existe) config._ordemTierlists = v;
    return;
  }
  if (barra > 0) {
    const base = p.slice(0, barra);
    const sub = p.slice(barra + 1);
    if (base === 'tierlists') {
      const lista = Array.isArray(config.tierlists) ? config.tierlists.slice() : [];
      const i = lista.findIndex((l) => l && l.id === sub);
      if (existe) { if (i >= 0) lista[i] = v; else lista.push(v); } else if (i >= 0) lista.splice(i, 1);
      config.tierlists = lista;
    } else {
      const obj = { ...(config[base] && typeof config[base] === 'object' ? config[base] : {}) };
      if (existe) obj[sub] = v; else delete obj[sub];
      config[base] = obj;
    }
    return;
  }
  if (existe) config[p] = v; else delete config[p];
}

class Nuvem {
  // ctx: { url, chave, pasta, marcas, filmes(), definirFilmes(lista), config(),
  //        gravarFilmes(), gravarConfig(), avisar(canal, dados), configPublica(),
  //        aoReceberFilmes(filmes), cofre: { cifrar, decifrar }, pastas: { capas, imagens } }
  constructor(ctx) {
    this.ctx = ctx;
    this.arqSessao = path.join(ctx.pasta, 'nuvem-sessao.bin');
    this.arqEstado = path.join(ctx.pasta, 'nuvem.json');
    this.estado = this.lerEstado();
    this.sessao = this.lerSessao();
    this.usuario = null;
    this.status = { fase: 'desligada', em: null, erro: null };
    this.rodando = null;
    this.denovo = false;
    this.timer = null;
    this.canal = null;
    this.cliente = ctx.cliente || createClient(ctx.url, ctx.chave, {
      auth: {
        storage: {
          getItem: (k) => this.sessao[k] ?? null,
          setItem: (k, v) => { this.sessao[k] = v; this.gravarSessao(); },
          removeItem: (k) => { delete this.sessao[k]; this.gravarSessao(); },
        },
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    this.cliente.auth.onAuthStateChange((evento, s) => {
      const id = s && s.user ? s.user.id : null;
      const email = s && s.user ? s.user.email : null;
      if (id === (this.usuario && this.usuario.id)) return;
      this.usuario = id ? { id, email } : null;
      if (evento !== 'INITIAL_SESSION') this.avisarStatus();
    });
  }

  // ---- Arquivos ----

  lerEstado() {
    try { return { cursor: null, nuvem: {}, fotos: {}, ...JSON.parse(fs.readFileSync(this.arqEstado, 'utf8')) }; } catch { return { usuario: null, cursor: null, nuvem: {}, fotos: {} }; }
  }
  gravarEstado() {
    const tmp = this.arqEstado + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.estado), 'utf8');
    fs.renameSync(tmp, this.arqEstado);
  }
  // A sessão (o login) fica cifrada pelo Windows: outro usuário do PC não a lê.
  lerSessao() {
    try { return JSON.parse(this.ctx.cofre.decifrar(fs.readFileSync(this.arqSessao))); } catch { return {}; }
  }
  gravarSessao() {
    try { fs.writeFileSync(this.arqSessao, this.ctx.cofre.cifrar(JSON.stringify(this.sessao))); } catch (e) { console.error('sessao', e); }
  }

  // ---- Conta ----

  async iniciar() {
    const { data } = await this.cliente.auth.getSession();
    const u = data.session && data.session.user;
    this.usuario = u ? { id: u.id, email: u.email } : null;
    if (this.usuario) { this.ligarTempoReal(); this.sincronizar(); }
    this.avisarStatus();
    setInterval(() => this.sincronizar(), 5 * 60 * 1000);
  }

  infos() {
    return { conta: this.usuario && this.usuario.email, ...this.status };
  }

  avisarStatus() {
    this.ctx.avisar('nuvem:status', this.infos());
  }

  async entrar(email, senha) {
    const { data, error } = await this.cliente.auth.signInWithPassword({ email, password: senha });
    if (error) return { erro: traduzirErro(error) };
    this.usuario = { id: data.user.id, email: data.user.email };
    this.ligarTempoReal();
    this.sincronizar();
    return this.infos();
  }

  async criarConta(email, senha) {
    const { data, error } = await this.cliente.auth.signUp({ email, password: senha });
    if (error) return { erro: traduzirErro(error) };
    if (!data.session) return { confirmar: true }; // precisa clicar no link do e-mail
    this.usuario = { id: data.user.id, email: data.user.email };
    this.ligarTempoReal();
    this.sincronizar();
    return this.infos();
  }

  async reenviar(email) {
    const { error } = await this.cliente.auth.resend({ type: 'signup', email });
    return error ? { erro: traduzirErro(error) } : { ok: true };
  }

  async sair() {
    if (this.canal) { await this.cliente.removeChannel(this.canal); this.canal = null; }
    await this.cliente.auth.signOut({ scope: 'local' });
    this.usuario = null;
    this.status = { fase: 'desligada', em: null, erro: null };
    this.avisarStatus();
    return this.infos();
  }

  // Outro aparelho mudou algo: busca daqui a pouco (várias mudanças viram uma busca só).
  ligarTempoReal() {
    if (this.canal || !this.usuario) return;
    this.canal = this.cliente
      .channel('registros')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registros', filter: `usuario=eq.${this.usuario.id}` },
        () => this.agendar(1500))
      .subscribe();
  }

  // Uma mudança daqui: envia em alguns segundos.
  agendar(ms = 3000) {
    if (!this.usuario) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sincronizar(), ms);
  }

  // ---- Sincronizar ----

  sincronizar() {
    if (!this.usuario) return Promise.resolve(this.infos());
    if (this.rodando) { this.denovo = true; return this.rodando; }
    this.rodando = (async () => {
      this.status = { ...this.status, fase: 'sincronizando', erro: null };
      this.avisarStatus();
      try {
        if (this.estado.usuario !== this.usuario.id) {
          // Outra conta (ou a primeira vez): começa do zero com a nuvem.
          this.estado = { usuario: this.usuario.id, cursor: null, nuvem: {}, fotos: {} };
        }
        await this.receber();
        await this.enviarImagens();
        await this.enviar();
        await this.baixarImagens();
        this.gravarEstado();
        this.status = { fase: 'em-dia', em: new Date().toISOString(), erro: null };
      } catch (e) {
        console.error('nuvem', e);
        this.status = { ...this.status, fase: 'erro', erro: traduzirErro(e) };
      }
      this.avisarStatus();
    })().finally(() => {
      this.rodando = null;
      if (this.denovo) { this.denovo = false; this.agendar(500); }
    });
    return this.rodando;
  }

  async receber() {
    // Volta 10 s: uma gravação que terminou atrasada no servidor não fica para trás.
    const desde = this.estado.cursor ? new Date(Date.parse(this.estado.cursor) - 10000).toISOString() : null;
    for (let de = 0; ; de += POR_PAGINA) {
      let q = this.cliente.from('registros').select('*').order('atualizado_em', { ascending: true }).range(de, de + POR_PAGINA - 1);
      if (desde) q = q.gt('atualizado_em', desde);
      const { data, error } = await q;
      if (error) throw error;
      this.aplicar(data);
      if (data.length) this.estado.cursor = data[data.length - 1].atualizado_em;
      if (data.length < POR_PAGINA) break;
    }
  }

  // O que tem marca mais nova aqui do que na nuvem.
  pendentes() {
    const { marcas } = this.ctx;
    const nuvem = this.estado.nuvem;
    const itens = [];
    for (const f of this.ctx.filmes()) {
      const m = marcas.filmes[f.id] || {};
      const n = nuvem[`filme/${f.id}`] || {};
      if (!Object.entries(m).some(([k, t]) => t > (n[k] || 0))) continue;
      const dados = {};
      for (const k of Object.keys(camposFilme(f))) dados[k] = f[k];
      itens.push({ tipo: 'filme', chave: f.id, dados, marcas: m });
    }
    for (const [id, t] of Object.entries(marcas.apagados)) {
      const n = nuvem[`filme/${id}`];
      if (n && t <= (n.__apagado || 0)) continue;
      itens.push({ tipo: 'filme', chave: id, dados: {}, marcas: {}, apagado_em: t });
    }
    const pedacos = pedacosConfig(this.ctx.config());
    for (const [p, t] of Object.entries(marcas.config)) {
      const n = nuvem[`config/${p}`] || {};
      if (t <= (n.v || 0)) continue;
      itens.push({ tipo: 'config', chave: p, dados: p in pedacos ? { v: pedacos[p] } : {}, marcas: { v: t } });
    }
    return itens;
  }

  async enviar() {
    const itens = this.pendentes();
    for (let i = 0; i < itens.length; i += POR_LOTE) {
      const { data, error } = await this.cliente.rpc('mesclar_registros', { itens: itens.slice(i, i + POR_LOTE) });
      if (error) throw error;
      this.aplicar(data);
      this.status = { ...this.status, fase: 'sincronizando', enviados: Math.min(i + POR_LOTE, itens.length), total: itens.length };
      this.avisarStatus();
    }
  }

  // Aplica registros da nuvem aqui, campo a campo.
  aplicar(linhas) {
    if (!linhas || !linhas.length) return;
    const { marcas } = this.ctx;
    let lista = this.ctx.filmes();
    const config = this.ctx.config();
    const mudados = new Map();
    const removidos = [];
    let mudouConfig = false;

    for (const r of linhas) {
      const chaveNuvem = `${r.tipo}/${r.chave}`;
      const antesNuvem = this.estado.nuvem[chaveNuvem] || {};
      this.estado.nuvem[chaveNuvem] = { ...r.marcas, ...(r.apagado_em ? { __apagado: Number(r.apagado_em) } : {}) };
      marcas.ver(maior(r.marcas), Number(r.apagado_em) || 0);

      if (r.tipo === 'config') {
        const t = Number(r.marcas.v) || 0;
        if (t <= (marcas.config[r.chave] || 0)) continue;
        aplicarPedaco(config, r.chave, 'v' in r.dados, r.dados.v);
        marcas.config[r.chave] = t;
        mudouConfig = true;
        continue;
      }

      const id = r.chave;
      let f = lista.find((x) => x.id === id);
      const mLocal = (f && marcas.filmes[id]) || {};
      const apagado = Math.max(marcas.apagados[id] || 0, Number(r.apagado_em) || 0);
      const vivoAte = Math.max(maior(mLocal), maior(r.marcas));
      if (apagado >= vivoAte) {
        // Apagado (lá ou aqui) depois da última mudança: some daqui também.
        if (f) { lista = lista.filter((x) => x !== f); removidos.push(id); }
        marcas.aceitarRemocao(id, apagado);
        continue;
      }
      const novo = !f;
      if (novo) f = { id };
      let mudou = novo;
      for (const [k, tStr] of Object.entries(r.marcas)) {
        const t = Number(tStr);
        if (t <= (mLocal[k] || 0)) continue;
        const valor = r.dados[k];
        // A página foi mudada aqui sem ter ido para a nuvem, e a de lá é mais nova: guarda a daqui.
        if (k === 'pagina' && !novo && f.pagina && f.pagina !== valor && (mLocal.pagina || 0) > (antesNuvem.pagina || 0)) {
          f.paginaOutra = { html: f.pagina, em: mLocal.pagina };
        }
        if (k in r.dados) f[k] = valor; else delete f[k];
        mLocal[k] = t;
        // Capa ou logo novas: a imagem baixada daqui não serve mais.
        if (k === 'poster' || k === 'capaPersonalizada' || k === 'capaNuvem') f.capaLocal = '';
        if (k === 'logo') f.logoLocal = '';
        mudou = true;
      }
      if (novo) lista.push(f);
      if (mudou) { marcas.filmes[id] = mLocal; delete marcas.apagados[id]; mudados.set(id, f); }
    }

    if (mudados.size || removidos.length) {
      this.ctx.definirFilmes(lista);
      for (const f of mudados.values()) marcas.aceitarFilme(f);
      this.ctx.gravarFilmes();
    }
    if (mudouConfig) {
      if (Array.isArray(config._ordemTierlists) && Array.isArray(config.tierlists)) {
        const ordem = config._ordemTierlists;
        config.tierlists = config.tierlists.slice().sort((a, b) => {
          const ia = ordem.indexOf(a.id); const ib = ordem.indexOf(b.id);
          return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
        });
      }
      delete config._ordemTierlists;
      marcas.aceitarConfig(config);
      this.ctx.gravarConfig();
    }
    marcas.gravar();
    if (mudados.size || removidos.length || mudouConfig) {
      this.ctx.avisar('nuvem:mudou', {
        filmes: [...mudados.values()],
        removidos,
        config: mudouConfig ? this.ctx.configPublica() : null,
      });
      if (mudados.size) this.ctx.aoReceberFilmes([...mudados.values()]);
    }
  }

  // ---- Imagens que não vêm do TMDB ----

  fotosDe(f) {
    const nomes = new Set();
    for (const campo of [f.pagina, f.shots, f.story]) {
      if (!campo) continue;
      for (const m of JSON.stringify(campo).matchAll(RE_FOTO)) nomes.add(m[1]);
    }
    return nomes;
  }

  async subir(caminho, arquivo, tipo) {
    const { error } = await this.cliente.storage.from('imagens').upload(caminho, fs.readFileSync(arquivo), { contentType: tipo, upsert: true });
    if (error) throw error;
  }

  async baixar(caminho, arquivo) {
    const { data, error } = await this.cliente.storage.from('imagens').download(caminho);
    if (error) return false;
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    fs.writeFileSync(arquivo, Buffer.from(await data.arrayBuffer()));
    return true;
  }

  // Sobe as imagens das páginas e shots, e as capas escolhidas por você.
  async enviarImagens() {
    const uid = this.usuario.id;
    const { pastas } = this.ctx;
    for (const f of this.ctx.filmes()) {
      for (const nome of this.fotosDe(f)) {
        if (this.estado.fotos[nome]) continue;
        const arq = path.join(pastas.imagens, nome);
        if (!fs.existsSync(arq)) continue;
        await this.subir(`${uid}/fotos/${nome}`, arq, tipoImagem(nome));
        this.estado.fotos[nome] = true;
      }
      if (f.capaPersonalizada && f.capaLocal) {
        const nome = f.capaLocal.split('?')[0];
        const arq = path.join(pastas.capas, nome);
        if (f.capaNuvem !== nome && fs.existsSync(arq)) {
          await this.subir(`${uid}/capas/${nome}`, arq, tipoImagem(nome));
          f.capaNuvem = nome; // muda o filme: vai junto no envio
          this.ctx.gravarFilmes();
        }
      }
    }
  }

  // Baixa as imagens que chegaram de outro aparelho.
  async baixarImagens() {
    const uid = this.usuario.id;
    const { pastas } = this.ctx;
    const mudados = [];
    for (const f of this.ctx.filmes()) {
      for (const nome of this.fotosDe(f)) {
        const arq = path.join(pastas.imagens, nome);
        if (fs.existsSync(arq)) continue;
        if (await this.baixar(`${uid}/fotos/${nome}`, arq)) this.estado.fotos[nome] = true;
      }
      if (f.capaPersonalizada && f.capaNuvem && !(f.capaLocal && fs.existsSync(path.join(pastas.capas, f.capaLocal.split('?')[0])))) {
        if (await this.baixar(`${uid}/capas/${f.capaNuvem}`, path.join(pastas.capas, f.capaNuvem))) {
          f.capaLocal = `${f.capaNuvem}?v=${Date.now()}`;
          mudados.push(f);
        }
      }
    }
    if (mudados.length) {
      this.ctx.gravarFilmes();
      for (const f of mudados) this.ctx.avisar('filme:mudou', f);
    }
  }
}

function tipoImagem(nome) {
  const ext = path.extname(nome).toLowerCase();
  return { '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }[ext] || 'image/jpeg';
}

function traduzirErro(e) {
  const msg = String((e && (e.message || e.msg)) || e || '');
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha errados.';
  if (/email not confirmed/i.test(msg)) return 'Falta confirmar o e-mail: clique no link que o Supabase mandou e tente de novo.';
  if (/already registered|already been registered/i.test(msg)) return 'Já existe uma conta com esse e-mail. Use "Entrar".';
  if (/password should be at least|weak password/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas seguidas. Espere um pouco e tente de novo.';
  if (/invalid.*email|unable to validate email/i.test(msg)) return 'Esse e-mail não parece válido.';
  if (/fetch failed|network|ENOTFOUND|ECONN|timed? ?out/i.test(msg)) return 'Sem conexão com a nuvem. Tenta de novo sozinho mais tarde.';
  return msg || 'Erro desconhecido na nuvem.';
}

module.exports = { Nuvem, aplicarPedaco };
