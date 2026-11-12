'use strict';

// ---------- nandplay (jogos) ----------
//
// A plataforma de jogos: os dados vêm do IGDB (lib/igdb.js) e da Steam
// (lib/steam.js), sempre pelo processo principal (api.buscarJogos,
// api.detalhesJogo, api.jogosDoDesenvolvedor, api.steamLocal,
// api.steamBiblioteca, api.abrirSteam). O que é jogo: ehJogo(f), em plataformas.js.
//
// Por enquanto, só a seção das Configurações (as chaves e o "Testar").

// As chaves da conta (sincronizam como a do TMDB). Os segredos ficam como senha.
const CAMPOS_NANDPLAY = [
  { campo: 'igdbClientId', id: 'cfg-igdb-id', rotulo: 'Client ID do IGDB (Twitch)', tipo: 'text', dica: 'Client ID' },
  { campo: 'igdbClientSecret', id: 'cfg-igdb-segredo', rotulo: 'Client Secret do IGDB (Twitch)', tipo: 'password', dica: 'Client Secret' },
  { campo: 'steamKey', id: 'cfg-steam-chave', rotulo: 'Chave da Steam Web API', tipo: 'password', dica: 'Chave da Steam (opcional)' },
  { campo: 'steamId', id: 'cfg-steam-perfil', rotulo: 'Seu perfil da Steam', tipo: 'text', dica: 'SteamID64, nome ou link (opcional)' },
];

function nandplayConfigHTML() {
  const c = estado.config;
  return `
      <div class="secao" id="cfg-nandplay">
        <h3>nandplay (jogos)</h3>
        <p class="cfg-jogos-intro">Os jogos vêm do <b>IGDB</b> (da Twitch), com as suas chaves, que são gratuitas. Com a chave e o perfil da <b>Steam</b> (opcionais), o app sabe quais jogos você tem e quantas horas jogou${api.plataforma === 'android' ? '' : '; os instalados neste computador são lidos da própria Steam, sem chave'}.</p>
        <div class="cfg-jogos-campos">
          ${CAMPOS_NANDPLAY.map((k) => `<label class="cfg-jogos-campo"><span>${k.rotulo}</span>
            <input id="${k.id}" data-campo="${k.campo}" type="${k.tipo}" value="${esc(c[k.campo] || '')}" placeholder="${k.dica}" spellcheck="false" autocomplete="off"></label>`).join('')}
        </div>
        <div class="linha-botoes cfg-jogos-acoes">
          <button class="btn" id="cfg-jogos-testar">${icone('Plug')} Testar</button>
        </div>
        <p class="chave-status cfg-jogos-status" id="cfg-jogos-status" role="status"></p>
        <details class="cfg-jogos-ajuda">
          <summary class="link-chave">Onde criar as chaves</summary>
          <ol>
            <li><b>IGDB</b>: em <button class="link-chave" data-abrir="https://dev.twitch.tv/console/apps">dev.twitch.tv/console/apps</button>, entre com a conta da Twitch (ela exige a <b>verificação em duas etapas</b> ligada) e clique em <b>Register Your Application</b>. Qualquer nome; em <b>OAuth Redirect URLs</b>, ponha <code>http://localhost</code>; categoria <b>Application Integration</b>; cliente <b>Confidential</b>. Depois, em <b>Manage</b>, copie o <b>Client ID</b> e gere um <b>Client Secret</b> (<b>New Secret</b>).</li>
            <li><b>Steam</b> (opcional): pegue a chave em <button class="link-chave" data-abrir="https://steamcommunity.com/dev/apikey">steamcommunity.com/dev/apikey</button> (o domínio pode ser <code>localhost</code>). No perfil, cole o link do seu perfil da Steam, o nome dele ou o número (SteamID64).</li>
            <li>Para a Steam mostrar os seus jogos, deixe o <b>perfil</b> e os <b>detalhes de jogos</b> como <b>públicos</b> nas configurações de privacidade da Steam.</li>
          </ol>
        </details>
      </div>`;
}

// Mensagem do "Testar" para cada serviço (as chaves nunca aparecem).
function textoTesteJogos(nome, r, okTexto) {
  if (!r) return '';
  if (r.ok) return `${nome}: funcionou${okTexto ? ` (${okTexto})` : ''}.`;
  return `${nome}: ${r.mensagem}`;
}

function ligarNandplayConfig(raiz) {
  const secao = $('#cfg-nandplay', raiz);
  if (!secao) return;
  const salvarCampos = async () => {
    const mudancas = {};
    for (const k of CAMPOS_NANDPLAY) {
      const v = $(`#${k.id}`, secao).value.trim();
      if (v !== (estado.config[k.campo] || '')) mudancas[k.campo] = v;
    }
    if (Object.keys(mudancas).length) estado.config = await api.salvarConfig(mudancas);
  };
  // Salva ao sair do campo (como as outras configurações, sem botão "Salvar").
  for (const k of CAMPOS_NANDPLAY) $(`#${k.id}`, secao).addEventListener('change', salvarCampos);
  $$('[data-abrir]', secao).forEach((b) => { b.onclick = () => window.open(b.dataset.abrir); });
  const status = $('#cfg-jogos-status', secao);
  const testar = $('#cfg-jogos-testar', secao);
  testar.onclick = async () => {
    testar.disabled = true;
    status.className = 'chave-status cfg-jogos-status carregando';
    status.textContent = 'Testando';
    await salvarCampos();
    let r;
    try { r = await api.testarJogos(); } catch { r = null; }
    testar.disabled = false;
    if (!r || (!r.igdb && !r.steam)) {
      status.className = 'chave-status cfg-jogos-status erro';
      status.textContent = r ? 'Preencha as chaves acima para testar.' : 'Não deu para testar agora.';
      return;
    }
    const n = r.steam && r.steam.ok ? r.steam.jogos : 0;
    const linhas = [
      textoTesteJogos('IGDB', r.igdb, ''),
      textoTesteJogos('Steam', r.steam, `${n.toLocaleString('pt-BR')} ${n === 1 ? 'jogo' : 'jogos'} na conta`),
    ].filter(Boolean);
    const erro = [r.igdb, r.steam].some((x) => x && !x.ok);
    status.className = `chave-status cfg-jogos-status${erro ? ' erro' : ' ok'}`;
    status.textContent = linhas.join(' ');
  };
}
