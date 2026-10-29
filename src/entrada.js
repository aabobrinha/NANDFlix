'use strict';

// ---------- Entrada: criar conta ou entrar, antes de abrir o app ----------
//
// Aparece ao abrir enquanto não houver conta conectada (o login fica guardado,
// então é uma vez só por aparelho). Ao fundo, um mosaico das capas da lista,
// ou um degradê se ainda não houver filmes. "Continuar sem conta" fecha só
// até a próxima vez que o app abrir.

const PULAR_ENTRADA = 'entradaPulada';

// Devolve true se entrou numa conta agora (aí os dados da nuvem estão chegando).
async function mostrarEntradaSePreciso(filmes) {
  const st = await api.statusNuvem();
  if (st.indisponivel || st.conta) return false;
  try { if (sessionStorage.getItem(PULAR_ENTRADA)) return false; } catch { /* segue */ }
  return new Promise((resolve) => abrirEntrada(filmes, resolve));
}

function mosaicoEntradaHTML(filmes) {
  const capas = filmes.filter((f) => f.capaLocal || f.poster);
  if (capas.length < 12) return '';
  // Embaralha e repete até encher as colunas; cada coluna desliza num ritmo.
  const pegar = (n, desde) => Array.from({ length: n }, (_, i) => capas[(desde + i * 7) % capas.length]);
  const colunas = Array.from({ length: 8 }, (_, c) => `
    <div class="entrada-coluna" style="--dur:${90 + (c % 3) * 25}s;--dir:${c % 2 ? 'reverse' : 'normal'}">
      ${[...pegar(8, c * 11), ...pegar(8, c * 11)].map((f) => capaHTML(f)).join('')}
    </div>`).join('');
  return `<div class="entrada-mosaico" aria-hidden="true">${colunas}</div>`;
}

function abrirEntrada(filmes, aoTerminar) {
  const el = document.createElement('div');
  el.className = 'entrada';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'entrada-titulo');
  el.innerHTML = `
    ${mosaicoEntradaHTML(filmes)}
    <div class="entrada-veu" aria-hidden="true"></div>
    <section class="entrada-cartao">
      <h1 class="marca entrada-marca"><img class="marca-icone" src="icone.png" alt=""> nandflix</h1>
      <div class="entrada-passo" data-passo="form">
        <h2 id="entrada-titulo">Sua lista em todo lugar</h2>
        <p class="entrada-sub">Entre para ter os mesmos filmes, notas, páginas e tierlists no computador e no celular.</p>
        <div class="entrada-abas" role="tablist">
          <button role="tab" class="entrada-aba on" data-modo="entrar" aria-selected="true">Entrar</button>
          <button role="tab" class="entrada-aba" data-modo="criar" aria-selected="false">Criar conta</button>
          <span class="entrada-aba-marca" aria-hidden="true"></span>
        </div>
        <form class="entrada-form" novalidate>
          <label class="entrada-campo">
            <span>E-mail</span>
            <input type="email" name="email" autocomplete="username" spellcheck="false" required>
          </label>
          <label class="entrada-campo">
            <span>Senha</span>
            <span class="entrada-senha">
              <input type="password" name="senha" autocomplete="current-password" minlength="6" required>
              <button type="button" class="entrada-olho" data-e="olho" aria-label="Mostrar a senha" title="Mostrar a senha">${icone('Eye')}</button>
            </span>
          </label>
          <label class="entrada-campo" data-so="criar" hidden>
            <span>Repita a senha</span>
            <input type="password" name="senha2" autocomplete="new-password" minlength="6">
          </label>
          <p class="entrada-erro" role="alert"></p>
          <button class="btn btn-laranja entrada-enviar" type="submit">Entrar</button>
        </form>
      </div>
      <div class="entrada-passo" data-passo="confirmar" hidden>
        <div class="entrada-envelope">${icone('MailCheck')}</div>
        <h2>Confirme seu e-mail</h2>
        <p class="entrada-sub">Mandamos um link para <b class="entrada-email"></b>. Clique nele e volte aqui. (A página que abre depois do link pode dar erro: a conta fica confirmada mesmo assim.)</p>
        <p class="entrada-erro" role="alert"></p>
        <button class="btn btn-laranja entrada-enviar" data-e="confirmei">Já confirmei, entrar</button>
        <div class="entrada-links">
          <button class="link-chave" data-e="reenviar">Reenviar o e-mail</button>
          <button class="link-chave" data-e="voltar">Usar outro e-mail</button>
        </div>
      </div>
      <button class="entrada-pular" data-e="pular">Continuar sem conta</button>
    </section>`;
  document.body.append(el);
  document.body.classList.add('com-entrada');
  Movimento.animar($('.entrada-cartao', el), [{ opacity: 0, transform: 'translateY(16px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });

  let modo = 'entrar';
  const form = $('.entrada-form', el);
  const erro = (passo, texto) => { $(`[data-passo="${passo}"] .entrada-erro`, el).textContent = texto || ''; };
  const ocupado = (sim, texto) => {
    for (const b of $$('.entrada-enviar', el)) {
      b.disabled = sim;
      if (texto && b.closest('[data-passo]:not([hidden])')) b.dataset.carregando = sim ? texto : '';
    }
    el.classList.toggle('ocupada', sim);
  };

  const trocarModo = (novo) => {
    modo = novo;
    for (const a of $$('.entrada-aba', el)) {
      a.classList.toggle('on', a.dataset.modo === modo);
      a.setAttribute('aria-selected', a.dataset.modo === modo);
    }
    el.classList.toggle('modo-criar', modo === 'criar');
    $('[data-so="criar"]', el).hidden = modo !== 'criar';
    form.senha.autocomplete = modo === 'criar' ? 'new-password' : 'current-password';
    $('.entrada-enviar', form).textContent = modo === 'criar' ? 'Criar conta' : 'Entrar';
    erro('form', '');
  };

  const mostrarPasso = (passo) => {
    for (const p of $$('.entrada-passo', el)) p.hidden = p.dataset.passo !== passo;
    const visivel = $(`[data-passo="${passo}"]`, el);
    Movimento.animar(visivel, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 260 });
  };

  const terminar = (entrou) => {
    document.removeEventListener('keydown', aoTecla, true);
    document.body.classList.remove('com-entrada');
    const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, easing: 'ease-in' });
    a.onfinish = () => el.remove();
    aoTerminar(entrou);
  };

  const entrar = async (email, senha) => {
    ocupado(true, 'Entrando');
    const r = await api.entrarNuvem(email, senha);
    ocupado(false);
    if (r.erro) return r.erro;
    terminar(true);
    return null;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const senha = form.senha.value;
    if (!/^\S+@\S+\.\S+$/.test(email)) { erro('form', 'Digite um e-mail válido.'); form.email.focus(); return; }
    if (senha.length < 6) { erro('form', 'A senha precisa ter pelo menos 6 caracteres.'); form.senha.focus(); return; }
    if (modo === 'entrar') {
      const falha = await entrar(email, senha);
      if (falha) erro('form', falha);
      return;
    }
    if (senha !== form.senha2.value) { erro('form', 'As duas senhas não são iguais.'); form.senha2.focus(); return; }
    ocupado(true, 'Criando a conta');
    const r = await api.criarContaNuvem(email, senha);
    ocupado(false);
    if (r.erro) { erro('form', r.erro); return; }
    if (r.confirmar) {
      $('.entrada-email', el).textContent = email;
      mostrarPasso('confirmar');
      return;
    }
    terminar(true);
  });

  el.addEventListener('click', async (e) => {
    const aba = e.target.closest('.entrada-aba');
    if (aba) { trocarModo(aba.dataset.modo); form.email.focus(); return; }
    const b = e.target.closest('[data-e]');
    if (!b) return;
    switch (b.dataset.e) {
      case 'olho': {
        const mostrar = form.senha.type === 'password';
        for (const c of [form.senha, form.senha2]) c.type = mostrar ? 'text' : 'password';
        b.innerHTML = icone(mostrar ? 'EyeOff' : 'Eye');
        b.setAttribute('aria-label', mostrar ? 'Esconder a senha' : 'Mostrar a senha');
        break;
      }
      case 'confirmei': {
        erro('confirmar', '');
        const falha = await entrar(form.email.value.trim(), form.senha.value);
        if (falha) erro('confirmar', falha);
        break;
      }
      case 'reenviar': {
        const r = await api.reenviarConfirmacao(form.email.value.trim());
        erro('confirmar', r && r.erro ? r.erro : '');
        if (!r || !r.erro) aviso('E-mail de confirmação reenviado.', { tipo: 'ok' });
        break;
      }
      case 'voltar': trocarModo('criar'); mostrarPasso('form'); form.email.select(); break;
      case 'pular':
        try { sessionStorage.setItem(PULAR_ENTRADA, '1'); } catch { /* fecha mesmo assim */ }
        terminar(false);
        break;
    }
  });

  // Enquanto a entrada estiver aberta, os atalhos do app não valem.
  const aoTecla = (e) => {
    if (e.key === 'Tab') {
      const focaveis = $$('button:not([disabled]), input:not([hidden])', el).filter((x) => x.offsetParent);
      const i = focaveis.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); focaveis.at(-1).focus(); }
      else if (!e.shiftKey && i === focaveis.length - 1) { e.preventDefault(); focaveis[0].focus(); }
      return;
    }
    if (!e.target.closest || !e.target.closest('.entrada')) { e.stopImmediatePropagation(); e.preventDefault(); return; }
    e.stopImmediatePropagation();
  };
  document.addEventListener('keydown', aoTecla, true);
  form.email.focus();
}

// Depois de entrar: espera a primeira sincronia (até 30 s) para os dados da nuvem chegarem.
function esperarSincronia() {
  return new Promise((resolve) => {
    const fim = setTimeout(resolve, 30000);
    const checar = (st) => { if (st && (st.fase === 'em-dia' || st.fase === 'erro')) { clearTimeout(fim); resolve(st); } };
    api.aoStatusNuvem(checar);
    api.statusNuvem().then(checar);
  });
}
