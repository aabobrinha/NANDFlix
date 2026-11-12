// Prêmios de cinema: os indicados e vencedores de cada cerimônia (ou festival),
// lidos da página na Wikipédia em inglês ("98th Academy Awards", "2025 Cannes Film
// Festival"…). Nenhum desses prêmios tem API; a Wikipédia é atualizada minutos
// depois de cada anúncio. Há três formatos de página:
//
// - 'cerimonia' (Oscar, Globo de Ouro, Critics Choice, BAFTA, SAG, Gotham):
//     {{Award category|#cor|[[Academy Award for Best Picture|Best Picture]]}}
//     * '''''[[Filme vencedor]]'' – produtores ‡'''
//     ** ''[[Outro indicado]]'' – produtores
//   (`*` é o vencedor quando a categoria tem `**`; antes da cerimônia, todos os
//   indicados ficam no mesmo nível.)
// - 'tabela' (Spirit): o mesmo, mas o nome da categoria vem no cabeçalho da tabela
//   (! [[Independent Spirit Award for Best Film|Best Feature]]).
// - 'festival' (Cannes, Veneza, Berlim): a tabela dos filmes da competição e a lista
//   dos prêmios do júri ("Palme d'Or: ''Filme'' by Diretor"). Cada prêmio vira uma
//   categoria com todos os filmes da competição como indicados, como uma cédula.
//
// Cada filme vira o código do IMDb e o id do TMDB pelo Wikidata, para achar o
// filme na lista da pessoa. O histórico vem pronto em lib/premios-<id>.json
// (npm run premios); o app busca de novo só as cerimônias recentes.

const AGENTE = 'NANDFlix/1.0 (https://github.com/aabobrinha/NANDFlix)';
const cabecalhos = () => ({ 'Api-User-Agent': AGENTE, ...(typeof window === 'undefined' ? { 'User-Agent': AGENTE } : {}) });

const ordinal = (n) => {
  const r = n % 100;
  if (r >= 11 && r <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
};
const meses = (...m) => (data) => m.includes(data.getUTCMonth());

// ---------- Os prêmios ----------
//
// numero: a edição (98ª) ou, quando a página é por ano, o próprio ano.
// primeiro: a primeira edição que o histórico procura.
// temporada: os meses em que os indicados e vencedores saem (o app busca mais vezes).
const PREMIOS = {
  oscar: {
    nome: 'Oscar', indicado: 'Indicado ao Oscar', venceu: 'Venceu o Oscar', quando: 'Os indicados saem no fim de janeiro',
    formato: 'cerimonia', prefixos: ['Academy Award for '],
    pagina: (n) => `${ordinal(n)} Academy Awards`, ano: (n) => 1928 + n, numero: (a) => a - 1928, primeiro: 1,
    temporada: meses(0, 1, 2),
  },
  globo: {
    nome: 'Globo de Ouro', indicado: 'Indicado ao Globo de Ouro', venceu: 'Venceu o Globo de Ouro', quando: 'Os indicados saem no começo de dezembro',
    formato: 'cerimonia', prefixos: ['Golden Globe Award for '],
    pagina: (n) => `${ordinal(n)} Golden Globe Awards`, ano: (n) => 1943 + n, numero: (a) => a - 1943, primeiro: 1,
    temporada: meses(11, 0),
  },
  critics: {
    nome: 'Critics Choice', indicado: 'Indicado ao Critics Choice', venceu: 'Venceu o Critics Choice', quando: 'Os indicados saem em dezembro',
    formato: 'cerimonia', prefixos: ["Critics' Choice Movie Award for ", 'Critics Choice Movie Award for '],
    pagina: (n) => `${ordinal(n)} Critics' Choice Awards`, ano: (n) => 1995 + n, numero: (a) => a - 1995, primeiro: 1,
    temporada: meses(11, 0),
  },
  bafta: {
    nome: 'BAFTA', indicado: 'Indicado ao BAFTA', venceu: 'Venceu o BAFTA', quando: 'Os indicados saem em janeiro',
    formato: 'cerimonia', prefixos: ['BAFTA Award for ', 'BAFTA '],
    pagina: (n) => `${ordinal(n)} British Academy Film Awards`, ano: (n) => 1947 + n, numero: (a) => a - 1947, primeiro: 1,
    anoDaPagina: true, temporada: meses(0, 1),
  },
  sag: {
    nome: 'Actor Awards (SAG)', indicado: 'Indicado ao SAG', venceu: 'Venceu o SAG', quando: 'Os indicados saem em janeiro',
    formato: 'cerimonia', prefixos: ['Actor Award for ', 'Screen Actors Guild Award for '],
    // Até a 31ª, "Screen Actors Guild Awards"; desde 2026, "Actor Awards".
    pagina: (n) => (n <= 31 ? `${ordinal(n)} Screen Actors Guild Awards` : `${ordinal(n)} Actor Awards`), ano: (n) => 1994 + n, numero: (a) => a - 1994, primeiro: 1,
    temporada: meses(0, 1),
  },
  spirit: {
    nome: 'Independent Spirit', indicado: 'Indicado ao Spirit', venceu: 'Venceu o Spirit', quando: 'Os indicados saem em dezembro',
    formato: 'tabela', prefixos: ['Independent Spirit Award for '],
    pagina: (n) => `${ordinal(n)} Independent Spirit Awards`, ano: (n) => 1985 + n, numero: (a) => a - 1985, primeiro: 1,
    temporada: meses(11, 0, 1, 2),
  },
  gotham: {
    nome: 'Gotham', indicado: 'Indicado ao Gotham', venceu: 'Venceu o Gotham', quando: 'Os indicados saem no fim de outubro',
    formato: 'cerimonia', prefixos: ['Gotham Independent Film Award for ', 'Gotham Award for '],
    // A página é por ano ("Gotham Independent Film Awards 2025"); a cerimônia é no fim do ano.
    pagina: (n) => `Gotham Independent Film Awards ${n}`, ano: (n) => n, numero: (a) => a, primeiro: 2005,
    temporada: meses(9, 10, 11),
  },
  cannes: {
    nome: 'Cannes', indicado: 'Na competição de Cannes', venceu: 'Premiado em Cannes', quando: 'A competição é anunciada em abril, e os prêmios saem no fim de maio',
    formato: 'festival', prefixos: ['Cannes Film Festival Award for ', 'Cannes Film Festival '],
    pagina: (n) => `${n} Cannes Film Festival`, ano: (n) => n, numero: (a) => a, primeiro: 1970,
    temporada: meses(3, 4),
    premiosPadrao: ["Palme d'Or", 'Grand Prix', 'Jury Prize', 'Best Director', 'Best Actress', 'Best Actor', 'Best Screenplay'],
  },
  veneza: {
    nome: 'Veneza', indicado: 'Na competição de Veneza', venceu: 'Premiado em Veneza', quando: 'A competição é anunciada em julho, e os prêmios saem no começo de setembro',
    formato: 'festival', prefixos: ['Venice Film Festival Award for ', 'Venice Film Festival '],
    pagina: (n) => `${ordinal(n)} Venice International Film Festival`, ano: (n) => 1943 + n, numero: (a) => a - 1943, primeiro: 27,
    anoDaPagina: true, temporada: meses(6, 7, 8),
    premiosPadrao: ['Golden Lion', 'Grand Jury Prize', 'Silver Lion', 'Special Jury Prize', 'Volpi Cup for Best Actor', 'Volpi Cup for Best Actress', 'Best Screenplay', 'Marcello Mastroianni Award'],
  },
  berlim: {
    nome: 'Berlim', indicado: 'Na competição de Berlim', venceu: 'Premiado em Berlim', quando: 'A competição é anunciada em janeiro, e os prêmios saem em fevereiro',
    formato: 'festival', prefixos: ['Berlin International Film Festival ', 'Berlinale '],
    pagina: (n) => `${ordinal(n)} Berlin International Film Festival`, ano: (n) => 1950 + n, numero: (a) => a - 1950, primeiro: 20,
    temporada: meses(0, 1),
    premiosPadrao: ['Golden Bear', 'Silver Bear Grand Jury Prize', 'Silver Bear Jury Prize', 'Silver Bear for Best Director', 'Silver Bear for Best Leading Performance', 'Silver Bear for Best Supporting Performance', 'Silver Bear for Best Screenplay', 'Silver Bear for Outstanding Artistic Contribution'],
  },
};
for (const [id, p] of Object.entries(PREMIOS)) p.id = id;

// Para a interface: a lista dos prêmios com os textos (sem as funções).
const listaPremios = () => Object.values(PREMIOS).map((p) => ({ id: p.id, nome: p.nome, indicado: p.indicado, venceu: p.venceu, quando: p.quando, festival: p.formato === 'festival' }));

// ---------- Nomes das categorias em português ----------
//
// Pela página da categoria na Wikipédia (sem o prefixo do prêmio), que não muda
// quando o nome oficial muda. As que não estão aqui ficam com o nome em inglês.
const CATEGORIAS_PT = {
  'Best Picture': 'Melhor Filme',
  'Best Director': 'Melhor Direção',
  'Best Direction': 'Melhor Direção',
  'Best Actor': 'Melhor Ator',
  'Best Actress': 'Melhor Atriz',
  'Best Supporting Actor': 'Melhor Ator Coadjuvante',
  'Best Supporting Actress': 'Melhor Atriz Coadjuvante',
  'Best Original Screenplay': 'Melhor Roteiro Original',
  'Best Adapted Screenplay': 'Melhor Roteiro Adaptado',
  'Best Screenplay': 'Melhor Roteiro',
  'Best Writing': 'Melhor Roteiro',
  'Best Story': 'Melhor Argumento',
  'Best Animated Feature': 'Melhor Animação',
  'Best Animated Feature Film': 'Melhor Animação',
  'Best Animated Film': 'Melhor Animação',
  'Best International Feature Film': 'Melhor Filme Internacional',
  'Best Documentary Feature Film': 'Melhor Documentário',
  'Best Documentary Feature': 'Melhor Documentário',
  'Best Documentary': 'Melhor Documentário',
  'Best Documentary Short Film': 'Melhor Documentário em Curta-Metragem',
  'Best Documentary Short Subject': 'Melhor Documentário em Curta-Metragem',
  'Best Live Action Short Film': 'Melhor Curta-Metragem',
  'Best Animated Short Film': 'Melhor Curta de Animação',
  'Best Short Film': 'Melhor Curta-Metragem',
  'Best Short Animation': 'Melhor Curta de Animação',
  'Best Original Score': 'Melhor Trilha Sonora',
  'Best Score': 'Melhor Trilha Sonora',
  'Best Original Music': 'Melhor Trilha Sonora',
  'Best Original Song': 'Melhor Canção Original',
  'Best Song': 'Melhor Canção Original',
  'Best Sound': 'Melhor Som',
  'Best Sound Mixing': 'Melhor Mixagem de Som',
  'Best Sound Editing': 'Melhor Edição de Som',
  'Best Production Design': 'Melhor Design de Produção',
  'Best Art Direction': 'Melhor Direção de Arte',
  'Best Cinematography': 'Melhor Fotografia',
  'Best Makeup and Hairstyling': 'Melhor Maquiagem e Penteados',
  'Best Makeup and Hair': 'Melhor Maquiagem e Penteados',
  'Best Hair and Makeup': 'Melhor Maquiagem e Penteados',
  'Best Makeup': 'Melhor Maquiagem e Penteados',
  'Best Costume Design': 'Melhor Figurino',
  'Best Film Editing': 'Melhor Montagem',
  'Best Editing': 'Melhor Montagem',
  'Best Visual Effects': 'Melhores Efeitos Visuais',
  'Best Special Visual Effects': 'Melhores Efeitos Visuais',
  'Best Casting': 'Melhor Seleção de Elenco',
  'Achievement in Casting': 'Melhor Seleção de Elenco',
  'Best Original Musical or Comedy Score': 'Melhor Trilha Sonora de Musical ou Comédia',
  'Best Original Song Score': 'Melhor Trilha Sonora de Canções',
  'Best Scoring of a Musical Picture': 'Melhor Trilha Sonora de Musical',
  'Best Dance Direction': 'Melhor Coreografia',
  'Best Assistant Director': 'Melhor Assistente de Direção',
  'Best Special Effects': 'Melhores Efeitos Especiais',
  'Best Actor in a Leading Role': 'Melhor Ator',
  'Best Actress in a Leading Role': 'Melhor Atriz',
  'Best Actor in a Supporting Role': 'Melhor Ator Coadjuvante',
  'Best Actress in a Supporting Role': 'Melhor Atriz Coadjuvante',
  // O mesmo prêmio, com o nome antigo: o mesmo nome em português (e o mesmo filtro).
  'Best Foreign Language Film': 'Melhor Filme Internacional',
  'Best Documentary (Short Subject)': 'Melhor Documentário em Curta-Metragem',
  'Best Unique and Artistic Picture': 'Melhor Filme Único e Artístico',
  'Best Writing (Title Writing)': 'Melhor Roteiro (Intertítulos)',
  // Globo de Ouro
  'Best Motion Picture – Drama': 'Melhor Filme – Drama',
  'Best Motion Picture – Musical or Comedy': 'Melhor Filme – Musical ou Comédia',
  'Best Motion Picture – Animated': 'Melhor Animação',
  'Best Motion Picture – Foreign Language': 'Melhor Filme em Língua Não Inglesa',
  'Best Motion Picture – Non-English Language': 'Melhor Filme em Língua Não Inglesa',
  'Best Actor – Motion Picture Drama': 'Melhor Ator – Drama',
  'Best Actress – Motion Picture Drama': 'Melhor Atriz – Drama',
  'Best Actor – Motion Picture Musical or Comedy': 'Melhor Ator – Musical ou Comédia',
  'Best Actress – Motion Picture Musical or Comedy': 'Melhor Atriz – Musical ou Comédia',
  'Best Actor in a Motion Picture – Drama': 'Melhor Ator – Drama',
  'Best Actress in a Motion Picture – Drama': 'Melhor Atriz – Drama',
  'Best Actor in a Motion Picture – Musical or Comedy': 'Melhor Ator – Musical ou Comédia',
  'Best Actress in a Motion Picture – Musical or Comedy': 'Melhor Atriz – Musical ou Comédia',
  'Best Supporting Actor – Motion Picture': 'Melhor Ator Coadjuvante',
  'Best Supporting Actress – Motion Picture': 'Melhor Atriz Coadjuvante',
  'Best Director – Motion Picture': 'Melhor Direção',
  'Best Screenplay – Motion Picture': 'Melhor Roteiro',
  'Best Original Score – Motion Picture': 'Melhor Trilha Sonora',
  'Best Original Song – Motion Picture': 'Melhor Canção Original',
  'Cinematic and Box Office Achievement': 'Conquista Cinematográfica e de Bilheteria',
  // Critics Choice
  'Best Young Performer': 'Melhor Atuação Jovem',
  'Best Young Actor/Actress': 'Melhor Atuação Jovem',
  'Best Acting Ensemble': 'Melhor Elenco',
  'Best Comedy': 'Melhor Comédia',
  'Best Stunt Design': 'Melhor Design de Dublês',
  'Best Action Movie': 'Melhor Filme de Ação',
  'Best Sci-Fi or Horror Movie': 'Melhor Filme de Ficção Científica ou Terror',
  'Best Sci-Fi/Horror Movie': 'Melhor Filme de Ficção Científica ou Terror',
  'Best Comedy Movie': 'Melhor Comédia',
  'Best Composer': 'Melhor Trilha Sonora',
  'Best Family Film': 'Melhor Filme Familiar',
  'Best Writer': 'Melhor Roteiro',
  'Best Actor in a Comedy Movie': 'Melhor Ator em Comédia',
  'Best Actress in a Comedy Movie': 'Melhor Atriz em Comédia',
  'Best Actor in a Comedy': 'Melhor Ator em Comédia',
  'Best Actress in a Comedy': 'Melhor Atriz em Comédia',
  'Best Actor in an Action Movie': 'Melhor Ator em Filme de Ação',
  'Best Actress in an Action Movie': 'Melhor Atriz em Filme de Ação',
  'Best Young Actor': 'Melhor Ator Jovem',
  'Best Young Actress': 'Melhor Atriz Jovem',
  'Best Soundtrack': 'Melhor Trilha Sonora (Canções)',
  'Best Popular Film': 'Melhor Filme Popular',
  'Best Cast': 'Melhor Elenco',
  'Best Casting and Ensemble': 'Melhor Elenco',
  'Best Digital Acting Performance': 'Melhor Atuação Digital',
  // BAFTA
  'Best Film': 'Melhor Filme',
  'Best Film Not in the English Language': 'Melhor Filme em Língua Não Inglesa',
  'Outstanding British Film': 'Melhor Filme Britânico',
  'Outstanding Debut by a British Writer, Director or Producer': 'Melhor Estreia Britânica',
  "Best Children's & Family Film": 'Melhor Filme Infantil e Familiar',
  'Rising Star Award': 'Estrela em Ascensão',
  // SAG / Actor Awards
  'Outstanding Performance by a Male Actor in a Leading Role': 'Melhor Ator',
  'Outstanding Performance by a Female Actor in a Leading Role': 'Melhor Atriz',
  'Outstanding Performance by a Male Actor in a Supporting Role': 'Melhor Ator Coadjuvante',
  'Outstanding Performance by a Female Actor in a Supporting Role': 'Melhor Atriz Coadjuvante',
  'Outstanding Performance by a Cast in a Motion Picture': 'Melhor Elenco',
  'Outstanding Performance by a Stunt Ensemble in a Motion Picture': 'Melhor Equipe de Dublês',
  // Spirit e Gotham
  'Best Feature': 'Melhor Filme',
  'Best Male Lead': 'Melhor Ator',
  'Best Female Lead': 'Melhor Atriz',
  'Best Supporting Male': 'Melhor Ator Coadjuvante',
  'Best Supporting Female': 'Melhor Atriz Coadjuvante',
  'Best First Feature': 'Melhor Primeiro Filme',
  'Best First Screenplay': 'Melhor Primeiro Roteiro',
  'Best Lead Performance': 'Melhor Atuação Principal',
  'Best Supporting Performance': 'Melhor Atuação Coadjuvante',
  'Best Breakthrough Performance': 'Melhor Atuação Revelação',
  'Best International Film': 'Melhor Filme Internacional',
  'John Cassavetes Award': 'Prêmio John Cassavetes',
  'Robert Altman Award': 'Prêmio Robert Altman',
  'Someone to Watch Award': 'Prêmio Alguém para Acompanhar',
  'Truer than Fiction Award': 'Prêmio Mais Real que a Ficção',
  'Producers Award': 'Prêmio de Produção',
  'Best International Feature': 'Melhor Filme Internacional',
  'Breakthrough Director': 'Direção Revelação',
  'Outstanding Lead Performance': 'Melhor Atuação Principal',
  'Outstanding Supporting Performance': 'Melhor Atuação Coadjuvante',
  'Breakthrough Performer': 'Atuação Revelação',
  // Festivais
  "Palme d'Or": 'Palma de Ouro',
  'Grand Prix': 'Grande Prêmio',
  'Grand Prize of the Jury': 'Grande Prêmio',
  'Grand Prix Spécial du Jury': 'Grande Prêmio',
  'Grand Special Jury Prize': 'Grande Prêmio do Júri',
  'Silver Bear – Special Jury Prize': 'Urso de Prata – Grande Prêmio do Júri',
  'Silver Bear Special Jury Prize': 'Urso de Prata – Grande Prêmio do Júri',
  'Silver Bear for Best Film Music': 'Urso de Prata de Melhor Trilha Sonora',
  'Alfred Bauer Prize': 'Prêmio Alfred Bauer',
  'Volpi Cup': 'Copa Volpi',
  'Best Artistic Contribution': 'Melhor Contribuição Artística',
  'Grand Prix du Festival International du Film': 'Grande Prêmio do Festival',
  'Prix du Jury': 'Prêmio do Júri',
  'Jury Special Prize': 'Prêmio Especial do Júri',
  'Best First Work': 'Melhor Primeiro Filme',
  'Special Palme d\'Or': 'Palma de Ouro Especial',
  'Special Mention': 'Menção Especial',
  'Special Mentions': 'Menção Especial',
  'Honorable Mention': 'Menção Honrosa',
  'Honourable Mention': 'Menção Honrosa',
  'Best Music': 'Melhor Trilha Sonora',
  'Silver Lion for Best Director': 'Leão de Prata (Direção)',
  'Golden Osella': 'Osella de Ouro',
  'Golden Osella for Best Cinematography': 'Osella de Ouro de Melhor Fotografia',
  'Golden Osella for Best Screenplay': 'Osella de Ouro de Melhor Roteiro',
  'Golden Osella for Outstanding Technical Contribution': 'Osella de Ouro de Contribuição Técnica',
  'Silver Lion Revelation': 'Leão de Prata Revelação',
  'Volpi Cup for Best Ensemble Cast': 'Copa Volpi de Melhor Elenco',
  'Silver Bear': 'Urso de Prata',
  'Silver Bear for an outstanding single achievement': 'Urso de Prata de Contribuição Artística',
  'Silver Bear for an outstanding artistic contribution': 'Urso de Prata de Contribuição Artística',
  'Silver Bear for an outstanding artistic achievement': 'Urso de Prata de Contribuição Artística',
  'Silver Bear for Outstanding Artistic Achievement': 'Urso de Prata de Contribuição Artística',
  'Outstanding Artistic Contribution': 'Urso de Prata de Contribuição Artística',
  'Alfred-Bauer Prize': 'Prêmio Alfred Bauer',
  'Silver Bear Jury Grand Prix': 'Urso de Prata – Grande Prêmio do Júri',
  'Silver Bear for Jury Grand Prix': 'Urso de Prata – Grande Prêmio do Júri',
  'Silver Bear Grand Prize of the Jury': 'Urso de Prata – Grande Prêmio do Júri',
  'Silver Bear Extraordinary Jury Prize': 'Urso de Prata – Prêmio Extraordinário do Júri',
  'Silver Bear for Best Music': 'Urso de Prata de Melhor Trilha Sonora',
  'Special Recognition': 'Reconhecimento Especial',
  // Globo de Ouro (nomes antigos)
  'Best Actress – Motion Picture Comedy or Musical': 'Melhor Atriz – Musical ou Comédia',
  'Best Actress in a Motion Picture – Comedy or Musical': 'Melhor Atriz – Musical ou Comédia',
  'New Star of the Year – Actor': 'Revelação do Ano – Ator',
  'New Star of the Year – Actress': 'Revelação do Ano – Atriz',
  'New Star of the Year': 'Revelação do Ano',
  'Best English-Language Foreign Film': 'Melhor Filme Estrangeiro em Inglês',
  'Best Documentary Film': 'Melhor Documentário',
  'Best Film Promoting International Understanding': 'Melhor Filme pela Compreensão Internacional',
  'Best Performance by an Actor in a Motion Picture – Drama': 'Melhor Ator – Drama',
  'Best Performance by an Actress in a Motion Picture – Drama': 'Melhor Atriz – Drama',
  'Best Performance by an Actor in a Motion Picture – Musical or Comedy': 'Melhor Ator – Musical ou Comédia',
  'Best Performance by an Actress in a Motion Picture – Musical or Comedy': 'Melhor Atriz – Musical ou Comédia',
  'Best Performance by an Actor in a Supporting Role in a Motion Picture': 'Melhor Ator Coadjuvante',
  'Best Performance by an Actress in a Supporting Role in a Motion Picture': 'Melhor Atriz Coadjuvante',
  // BAFTA (nomes antigos)
  'Most Promising Newcomer to Leading Film Roles': 'Revelação',
  'Best Specialised Film': 'Melhor Filme Especializado',
  'United Nations Award': 'Prêmio das Nações Unidas',
  'Best British Film': 'Melhor Filme Britânico',
  'Best British Screenplay': 'Melhor Roteiro Britânico',
  'Best Foreign Actor': 'Melhor Ator Estrangeiro',
  'Best Foreign Actress': 'Melhor Atriz Estrangeira',
  'Best British Actor': 'Melhor Ator Britânico',
  'Best British Actress': 'Melhor Atriz Britânica',
  // Gotham, SAG, Spirit
  'Audience Award': 'Prêmio do Público',
  'Best Ensemble Cast': 'Melhor Elenco',
  'Best Film Not Playing at a Theater Near You': 'Melhor Filme Fora dos Cinemas',
  'Outstanding Action Performance by a Stunt Ensemble in a Motion Picture': 'Melhor Equipe de Dublês',
  'Best Debut Performance': 'Melhor Atuação de Estreia',
  'Jury Prize': 'Prêmio do Júri',
  'Prix Spécial': 'Prêmio Especial',
  'Special Award': 'Prêmio Especial',
  'Golden Lion': 'Leão de Ouro',
  'Grand Jury Prize': 'Grande Prêmio do Júri',
  'Silver Lion': 'Leão de Prata (Direção)',
  'Special Jury Prize': 'Prêmio Especial do Júri',
  'Volpi Cup for Best Actor': 'Copa Volpi de Melhor Ator',
  'Volpi Cup for Best Actress': 'Copa Volpi de Melhor Atriz',
  'Marcello Mastroianni Award': 'Prêmio Marcello Mastroianni',
  'Golden Bear': 'Urso de Ouro',
  'Silver Bear Grand Jury Prize': 'Urso de Prata – Grande Prêmio do Júri',
  'Silver Bear Jury Prize': 'Urso de Prata – Prêmio do Júri',
  'Silver Bear for Best Director': 'Urso de Prata de Melhor Direção',
  'Silver Bear for Best Leading Performance': 'Urso de Prata de Melhor Atuação Principal',
  'Silver Bear for Best Supporting Performance': 'Urso de Prata de Melhor Atuação Coadjuvante',
  'Silver Bear for Best Screenplay': 'Urso de Prata de Melhor Roteiro',
  'Silver Bear for Outstanding Artistic Contribution': 'Urso de Prata de Contribuição Artística',
  'Silver Bear for Best Actor': 'Urso de Prata de Melhor Ator',
  'Silver Bear for Best Actress': 'Urso de Prata de Melhor Atriz',
};
// Restos de marcação ("Best Original Song}}Best Original Song – Motion Picture") e espaços.
const limparChave = (t) => String(t || '').replace(/^.*\}\}/, '').replace(/\s+/g, ' ').trim();
// Pelo nome exato; depois sem diferença de maiúsculas ("an Outstanding" = "an outstanding").
const CATEGORIAS_PT_MIN = new Map();
const traduzir = (chave, original) => {
  if (!CATEGORIAS_PT_MIN.size) for (const [k, v] of Object.entries(CATEGORIAS_PT)) CATEGORIAS_PT_MIN.set(k.toLowerCase(), v);
  return CATEGORIAS_PT[chave] || CATEGORIAS_PT[original]
    || CATEGORIAS_PT_MIN.get(String(chave).toLowerCase()) || CATEGORIAS_PT_MIN.get(String(original).toLowerCase())
    || original || chave;
};

// Categorias de TV (Globo de Ouro, Critics Choice, SAG, Spirit, Gotham): ficam de fora.
const DE_TV = /television|\btv\b|series|miniseries|podcast|stand-up|talk show|limited|\bshow\b|reality|guest performer|comedy special|bingeworthy/i;

// ---------- Ler o wikitext ----------

const semRefs = (w) => String(w || '').replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '').replace(/<!--[\s\S]*?-->/g, '');

// Tira a marcação da Wikipédia e deixa o texto: [[a|b]] → b, {{ndash}} → –, <ref>…</ref> some.
function textoLimpo(w) {
  let s = semRefs(w);
  s = s.replace(/\{\{\s*(?:ndash|snd|en dash)\s*\}\}/gi, ' – ').replace(/\{\{\s*(?:mdash|spaced mdash)\s*\}\}/gi, ' — ');
  s = s.replace(/\{\{\s*(?:double[- ]dagger|dagger)[^}]*\}\}/gi, ' ');
  s = s.replace(/\{\{\s*abbr\s*\|([^|}]*)\|[^}]*\}\}/gi, '$1');
  s = s.replace(/\{\{\s*(?:nowrap|lang\|[^|}]*|sortname)\s*\|([^}]*)\}\}/gi, (_, x) => x.replace(/\|/g, ' '));
  s = s.replace(/\{\{[^{}]*\}\}/g, '');
  s = s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1');
  s = s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/'{2,}/g, '');
  return s.replace(/[‡†]/g, '').replace(/\s+/g, ' ').trim();
}

// O primeiro [[link]] de um trecho: { alvo, texto }.
function primeiroLink(w) {
  const m = String(w).match(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/);
  return m ? { alvo: m[1].trim().replace(/_/g, ' '), texto: textoLimpo(m[2] || m[1]) } : null;
}

// Negrito fora, itálico fica: ''''' vira '' e ''' some. O itálico dentro do link
// ([[Filme (2025 film)|''Filme'']]) passa para fora (''[[Filme (2025 film)|Filme]]'').
const soItalico = (w) => String(w).replace(/'{5}/g, "''").replace(/'''/g, '')
  .replace(/\[\[([^\]|]+)\|''([^'\]]+)''\]\]/g, "''[[$1|$2]]''").replace(/\[\[''([^'\]]+)''\]\]/g, "''[[$1]]''");

// O primeiro filme (em itálico) de um trecho: { titulo, wiki, inicio, fim } ou null.
function primeiroFilme(w, links) {
  const it = w.match(/''(.+?)''/);
  if (!it) return null;
  const link = primeiroLink(it[1]);
  const titulo = link ? link.texto : textoLimpo(it[1]);
  if (!titulo) return null;
  return { titulo, wiki: link ? link.alvo : (links.get(titulo) || null), inicio: it.index, fim: it.index + it[0].length };
}

// "* '''''[[Filme]]'' – produtores ‡'''" → { nivel, venceu, filme: { titulo, wiki }, pessoa, extra }
function lerIndicacao(linha, links) {
  const nivel = (linha.match(/^\*+/) || [''])[0].length;
  let corpo = linha.slice(nivel);
  const comAdaga = /‡|\{\{\s*double[- ]dagger/i.test(corpo);
  const negrito = /^\s*'''/.test(corpo);
  corpo = semRefs(soItalico(corpo));
  const f = primeiroFilme(corpo, links);
  if (!f) {
    const texto = textoLimpo(corpo);
    return texto ? { nivel, comAdaga, negrito, filme: null, pessoa: texto, extra: '' } : null;
  }
  const antes = textoLimpo(corpo.slice(0, f.inicio)).replace(/\s*[–—-]\s*$/, '').replace(/\s+from$/i, '').trim();
  const depois = textoLimpo(corpo.slice(f.fim)).replace(/^\s*[–—-]\s*/, '').trim();
  return { nivel, comAdaga, negrito, filme: { titulo: f.titulo, wiki: f.wiki }, pessoa: antes, extra: antes ? '' : depois };
}

// Filmes já citados com link: as próximas vezes vêm só em itálico.
function linksDosFilmes(wikitext) {
  const links = new Map();
  for (const m of soItalico(wikitext).matchAll(/''\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]''/g)) {
    const texto = textoLimpo(m[2] || m[1]);
    if (!links.has(texto)) links.set(texto, m[1].trim());
  }
  return links;
}

// A chave da categoria: a página dela sem o prefixo do prêmio ("Academy Award for ").
function chaveDe(conteudo, prefixos) {
  const link = primeiroLink(conteudo);
  const texto = link ? link.texto : textoLimpo(conteudo);
  let chave = texto;
  if (link) {
    const p = prefixos.find((x) => link.alvo.startsWith(x));
    chave = p ? link.alvo.slice(p.length) : link.texto;
  }
  return { chave: limparChave(chave).replace(/\s*\([^)]*\)\s*$/, '').trim(), original: limparChave(texto) };
}

function fecharCategorias(categorias) {
  return categorias
    .map((c) => {
      // Vencedor: o `*` quando a categoria tem `**`, a ‡ na linha, a linha sem "*" antes
      // da lista ou, sem `**`, o negrito (o único em negrito, ou o único da categoria).
      const temSegundoNivel = c.linhas.some((l) => l.nivel >= 2);
      const algumSemNegrito = c.linhas.some((l) => !l.negrito);
      const indicados = c.linhas
        .filter((l) => l.filme || l.pessoa)
        .map((l) => ({
          titulo: l.filme ? l.filme.titulo : '',
          wiki: l.filme ? l.filme.wiki : null,
          pessoa: l.pessoa || '',
          extra: (l.extra || '').slice(0, 160),
          venceu: l.nivel === 0 || (temSegundoNivel && l.nivel === 1) || l.comAdaga
            || (!temSegundoNivel && l.negrito && (algumSemNegrito || c.linhas.length === 1)),
        }));
      return { chave: c.chave, nome: traduzir(c.chave, c.original), original: c.original, indicados };
    })
    // Só categorias de filme (as de TV ficam de fora) com indicados.
    .filter((c) => c.indicados.length && c.indicados.some((x) => x.titulo) && !DE_TV.test(`${c.chave} ${c.original}`));
}

// Formatos 'cerimonia' e 'tabela': [{ chave, nome, original, indicados: [{ titulo, wiki, pessoa, extra, venceu }] }]
function lerCategorias(wikitext, prefixos = ['Academy Award for '], { tabela = false } = {}) {
  if (typeof prefixos === 'string') prefixos = [prefixos];
  // As referências (<ref>…</ref>) podem ocupar várias linhas e ter listas com "*" dentro.
  wikitext = semRefs(wikitext);
  const links = linksDosFilmes(wikitext);
  const categorias = [];
  let atual = null;
  const fila = []; // cabeçalhos de tabela (Spirit) esperando a célula deles
  for (const linha of wikitext.split('\n')) {
    // {{Award category|…}} ou {{AwardCategory|…}} (algumas páginas antigas)
    const cab = linha.match(/\{\{\s*Award ?category\s*\|[^|]*\|(.*?\]\]|[^}]*)\s*\}\}/i);
    if (cab) {
      atual = { ...chaveDe(cab[1], prefixos), linhas: [] };
      categorias.push(atual);
      continue;
    }
    if (tabela && /^\s*\{\|/.test(linha)) { fila.length = 0; continue; }
    if (tabela && /^\s*!/.test(linha)) {
      // "! style="width:50%"| [[Independent Spirit Award for Best Film|Best Feature]]" (às vezes duas com !!).
      // "!colspan=2|Best Motion Picture" é só o título de um grupo de colunas: não tem célula própria.
      for (const h of linha.replace(/^\s*!/, '').split('!!')) {
        if (/colspan\s*=\s*"?[2-9]/i.test(h)) continue;
        const alvo = h.includes('[[') ? h.slice(h.indexOf('[[')) : h.slice(h.lastIndexOf('|') + 1);
        if (textoLimpo(alvo)) fila.push(alvo);
      }
      continue;
    }
    if (tabela && /^\s*\|(?![-}+])/.test(linha) && fila.length) {
      atual = { ...chaveDe(fila.shift(), prefixos), linhas: [] };
      categorias.push(atual);
      // O que vem na mesma linha da célula (depois dos atributos, como valign="top" |):
      // às vezes é o vencedor (Spirit antigo).
      let conteudo = linha.replace(/^\s*\|/, '');
      const barra = conteudo.indexOf('|');
      if (barra >= 0 && !conteudo.slice(0, barra).includes('[[') && /=/.test(conteudo.slice(0, barra))) conteudo = conteudo.slice(barra + 1);
      conteudo = conteudo.trim();
      if (/^\*/.test(conteudo) || (/^'''/.test(conteudo) && /''.*\[\[|\[\[.*''/.test(conteudo))) {
        const ind = lerIndicacao(conteudo, links);
        if (ind) atual.linhas.push(/^\*/.test(conteudo) ? ind : { ...ind, nivel: 0 });
      }
      continue;
    }
    if (!atual) continue;
    if (/^\s*(\|\}|==)/.test(linha)) { atual = null; fila.length = 0; continue; }
    if (/^\*/.test(linha)) {
      const ind = lerIndicacao(linha.trim(), links);
      if (ind) atual.linhas.push(ind);
    } else if (/^\s*'''/.test(linha) && !atual.linhas.length && /''.*\[\[|\[\[.*''/.test(linha)) {
      // Algumas páginas (Critics Choice antigo) põem o vencedor em negrito, sem "*", antes da lista.
      const ind = lerIndicacao(linha.trim(), links);
      if (ind) atual.linhas.push({ ...ind, nivel: 0 });
    }
  }
  return fecharCategorias(categorias);
}

// ---------- Festivais ----------

// O trecho de uma seção ("== Official Awards ==") até a próxima do mesmo nível.
function secao(w, titulo, nivel = 2, desde = 0) {
  const igual = '='.repeat(nivel);
  const re = new RegExp(`^${igual}\\s*([^=\\n]*?)\\s*${igual}\\s*$`, 'gm');
  re.lastIndex = desde;
  let m;
  while ((m = re.exec(w))) {
    if (titulo.test(textoLimpo(m[1]))) {
      const inicio = m.index + m[0].length;
      const fim = new RegExp(`^={2,${nivel}}[^=]`, 'm').exec(w.slice(inicio));
      return w.slice(inicio, fim ? inicio + fim.index : undefined);
    }
  }
  return '';
}

// Os filmes da competição: da tabela (uma linha por filme) ou de uma lista.
function filmesDaCompeticao(trecho, links) {
  const filmes = [];
  const ja = new Set();
  const add = (texto) => {
    const t = semRefs(soItalico(texto));
    const f = primeiroFilme(t, links);
    if (!f || ja.has(f.titulo)) return;
    ja.add(f.titulo);
    // O diretor: o primeiro link depois do título (fora dos {{lang|…}}).
    const resto = t.slice(f.fim).replace(/\{\{\s*lang\s*\|[^}]*\}\}/gi, '');
    const dir = primeiroLink(resto);
    const porTexto = resto.match(/\bby\s+([^,;\n]+)/i);
    filmes.push({ titulo: f.titulo, wiki: f.wiki, diretor: dir ? dir.texto : porTexto ? textoLimpo(porTexto[1]) : '' });
  };
  if (/\{\|/.test(trecho)) {
    for (const linha of trecho.split(/\n\|-[^\n]*/).slice(1)) add(linha.replace(/\n\|\}[\s\S]*$/, ''));
  }
  for (const linha of trecho.split('\n')) if (/^\*/.test(linha) && /''/.test(linha)) add(linha);
  return filmes;
}

// Os prêmios do júri: [{ chave, original, vencedores: [{ titulo, wiki, pessoa }] }]
function premiosDoJuri(trecho, links, prefixos) {
  const premios = [];
  let atual = null;
  for (const bruta of semRefs(trecho).split('\n')) {
    const linha = soItalico(bruta.trim());
    const nivel = (linha.match(/^\*+/) || [''])[0].length;
    if (!nivel) continue;
    const corpo = linha.slice(nivel).trim();
    // "* [[Palme d'Or]]: ''[[Filme]]'' by [[Diretor]]" ou "* Prêmio:" e os vencedores embaixo (**).
    const doisPontos = corpo.search(/:(?![^[]*\]\])/);
    if (nivel === 1 && doisPontos > 0) {
      atual = { ...chaveDe(corpo.slice(0, doisPontos), prefixos), vencedores: [] };
      premios.push(atual);
      const resto = corpo.slice(doisPontos + 1).trim();
      if (resto) atual.vencedores.push(...vencedoresDe(resto, links));
    } else if (atual && nivel >= 2) {
      atual.vencedores.push(...vencedoresDe(corpo, links));
    }
  }
  return premios.filter((p) => p.vencedores.length);
}

// "''[[Filme]]'' by [[Diretor]]" ou "[[Ator]] for ''[[Filme]]''" → [{ titulo, wiki, pessoa }]
function vencedoresDe(texto, links) {
  const f = primeiroFilme(texto, links);
  if (!f) return [];
  const antes = textoLimpo(texto.slice(0, f.inicio)).replace(/\s*\b(for|in)\s*$/i, '').replace(/[–—:-]\s*$/, '').trim();
  const depois = textoLimpo(texto.slice(f.fim)).replace(/^\s*\(?\s*(by|directed by)\s+/i, '').replace(/\)\s*$/, '').trim();
  return [{ titulo: f.titulo, wiki: f.wiki, pessoa: antes || depois }];
}

const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Formato 'festival': cada prêmio do júri é uma categoria com os filmes da competição.
function lerFestival(wikitext, premio) {
  const w = semRefs(wikitext);
  const links = linksDosFilmes(w);
  const selecao = secao(w, /^Official Selection|^Official Sections|^Selection|^Main Competition|^In Competition|^Films in competition/i, 2)
    || secao(w, /^In Competition|^Main Competition|^Competition/i, 2);
  const competicao = secao(selecao, /In Competition|Main Competition|^Competition/i, 3) || selecao;
  const filmes = filmesDaCompeticao(competicao, links);
  const premiosSec = secao(w, /^Official Awards|^Awards|^Prizes|^Winners/i, 2);
  const doJuri = premiosDoJuri(secao(premiosSec, /In Competition|Main Competition|^Competition|Official Selection/i, 3) || premiosSec.split(/^===/m)[0], links, premio.prefixos);
  if (!filmes.length && !doJuri.length) return [];
  // Sem prêmios e com filmes demais não é uma competição (Cannes 2020, cancelado, só teve o "selo").
  if (!doJuri.length && filmes.length > 30) return [];
  // Antes do júri: os prêmios de sempre, sem vencedor ainda.
  const lista = doJuri.length ? doJuri : (premio.premiosPadrao || []).map((chave) => ({ chave, original: chave, vencedores: [] }));
  return lista.map((p) => {
    const indicados = filmes.map((f) => {
      const v = p.vencedores.find((x) => (x.wiki && x.wiki === f.wiki) || norm(x.titulo) === norm(f.titulo));
      return { titulo: f.titulo, wiki: f.wiki, pessoa: v && v.pessoa ? v.pessoa : f.diretor, extra: '', venceu: Boolean(v) };
    });
    // Um vencedor que não estava na tabela da competição (página incompleta): entra também.
    for (const v of p.vencedores) {
      if (!indicados.some((x) => (v.wiki && x.wiki === v.wiki) || norm(x.titulo) === norm(v.titulo))) indicados.unshift({ titulo: v.titulo, wiki: v.wiki, pessoa: v.pessoa, extra: '', venceu: true });
    }
    return { chave: p.chave, nome: traduzir(p.chave, p.original), original: p.original, indicados };
  }).filter((c) => c.indicados.length);
}

// O ano da cerimônia pela página (o "date" da caixa de informações), quando a conta não serve.
function anoDaPagina(w) {
  // Só o campo da caixa de informações (no começo da linha), não o "date=" das citações.
  const m = String(w).match(/^\s*\|\s*(?:date|dates|ceremony_date)\s*=\s*([^\n]+)/im);
  const a = m && m[1].match(/\b(19|20)\d{2}\b/);
  return a ? Number(a[0]) : null;
}

function lerPagina(premio, wikitext) {
  if (premio.formato === 'festival') return lerFestival(wikitext, premio);
  // Também lê categorias no cabeçalho da tabela (Spirit, Globo de Ouro antigo).
  return lerCategorias(wikitext, premio.prefixos, { tabela: true });
}

// ---------- Buscar na Wikipédia e no Wikidata ----------

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Com "muitos pedidos" (429) ou o serviço ocupado (502, 503, 504), espera e tenta de novo.
async function pegarJSON(url, tentativa = 0) {
  const r = await fetch(url, { headers: cabecalhos(), signal: AbortSignal.timeout(60000) });
  if ([429, 502, 503, 504].includes(r.status) && tentativa < 5) {
    const depois = Number(r.headers.get('retry-after')) || 5 * (tentativa + 1);
    await espera(Math.min(depois, 60) * 1000);
    return pegarJSON(url, tentativa + 1);
  }
  if (!r.ok) throw new Error(`${new URL(url).host} respondeu ${r.status}`);
  return r.json();
}

// O wikitext de várias páginas (até 50 por vez), seguindo redirecionamentos:
// { título pedido: wikitext | null }.
async function wikitexts(titulos) {
  const res = {};
  for (let i = 0; i < titulos.length; i += 50) {
    const lote = titulos.slice(i, i + 50);
    const qs = new URLSearchParams({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', redirects: '1', format: 'json', formatversion: '2', origin: '*', titles: lote.join('|') });
    const json = await pegarJSON(`https://en.wikipedia.org/w/api.php?${qs}`);
    const q = json.query || {};
    const passo = new Map();
    for (const n of q.normalized || []) passo.set(n.from, n.to);
    for (const r of q.redirects || []) passo.set(r.from, r.to);
    const porTitulo = new Map();
    for (const p of q.pages || []) {
      const conteudo = p.revisions && p.revisions[0] && p.revisions[0].slots && p.revisions[0].slots.main.content;
      porTitulo.set(p.title, p.missing ? null : conteudo || null);
    }
    for (const t of lote) {
      let atual = t;
      for (let k = 0; k < 4 && passo.has(atual); k++) atual = passo.get(atual);
      res[t] = porTitulo.has(atual) ? porTitulo.get(atual) : null;
    }
  }
  return res;
}

// Títulos de páginas da Wikipédia → { título: { imdb, tmdb } }, pelo Wikidata.
async function idsDosFilmes(titulos) {
  const res = {};
  const unicos = [...new Set(titulos.filter(Boolean))];
  const qid = new Map(); // título pedido → Q…
  for (let i = 0; i < unicos.length; i += 50) {
    const lote = unicos.slice(i, i + 50);
    const qs = new URLSearchParams({ action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1', format: 'json', formatversion: '2', origin: '*', titles: lote.join('|') });
    const json = await pegarJSON(`https://en.wikipedia.org/w/api.php?${qs}`);
    const q = json.query || {};
    // pedido → normalizado → redirecionado → página
    const passo = new Map();
    for (const n of q.normalized || []) passo.set(n.from, n.to);
    for (const r of q.redirects || []) passo.set(r.from, r.to);
    const porTitulo = new Map((q.pages || []).filter((p) => p.pageprops && p.pageprops.wikibase_item).map((p) => [p.title, p.pageprops.wikibase_item]));
    for (const t of lote) {
      let atual = t;
      for (let k = 0; k < 4 && passo.has(atual); k++) atual = passo.get(atual);
      if (porTitulo.has(atual)) qid.set(t, porTitulo.get(atual));
    }
  }
  const qids = [...new Set(qid.values())];
  const porQid = new Map();
  for (let i = 0; i < qids.length; i += 100) {
    const lote = qids.slice(i, i + 100);
    const sparql = `SELECT ?item ?imdb ?tmdb WHERE { VALUES ?item { ${lote.map((q) => `wd:${q}`).join(' ')} } OPTIONAL { ?item wdt:P345 ?imdb } OPTIONAL { ?item wdt:P4947 ?tmdb } }`;
    const json = await pegarJSON(`https://query.wikidata.org/sparql?${new URLSearchParams({ query: sparql, format: 'json' })}`);
    for (const b of json.results.bindings) {
      const q = b.item.value.split('/').pop();
      const atual = porQid.get(q) || {};
      if (b.imdb && /^tt\d+$/.test(b.imdb.value) && !atual.imdb) atual.imdb = b.imdb.value;
      if (b.tmdb && !atual.tmdb) atual.tmdb = b.tmdb.value;
      porQid.set(q, atual);
    }
  }
  for (const [t, q] of qid) res[t] = porQid.get(q) || {};
  return res;
}

// Várias cerimônias de uma vez: [{ premio, numero, ano, categorias, indicados: bool, vencedores: bool, em }].
// `filmes` (opcional) é o cadastro { wiki: { imdb, tmdb } } já conhecido, para não perguntar de novo.
async function buscarCerimonias(premioId, numeros, filmesConhecidos = {}) {
  const p = PREMIOS[premioId];
  const paginas = numeros.map((n) => p.pagina(n));
  const textos = await wikitexts(paginas);
  const cerimonias = numeros.map((n, i) => {
    const w = textos[paginas[i]];
    const categorias = w ? lerPagina(p, w) : [];
    return {
      premio: premioId,
      numero: n,
      ano: (p.anoDaPagina && w && anoDaPagina(w)) || p.ano(n),
      existe: Boolean(w),
      categorias,
      indicados: categorias.length > 0,
      vencedores: categorias.some((c) => c.indicados.some((x) => x.venceu)),
      em: new Date().toISOString(),
    };
  });
  const faltam = [...new Set(cerimonias.flatMap((c) => c.categorias.flatMap((k) => k.indicados.map((x) => x.wiki))))]
    .filter((w) => w && !(w in filmesConhecidos));
  const novos = faltam.length ? await idsDosFilmes(faltam) : {};
  const filmes = { ...filmesConhecidos, ...novos };
  for (const w of faltam) if (!(w in filmes)) filmes[w] = {};
  return { cerimonias, filmes };
}

// ---------- Formato guardado (compacto) ----------
//
// { premio, geradoEm, filmes: { wiki: [imdb, tmdb] },
//   cerimonias: [[numero, ano, [[chave, original, [[titulo, wiki, pessoa, venceu], …]], …]], …] }
// wiki: 1 = igual ao título, 0 = sem página. O nome em português sai de CATEGORIAS_PT.

function compactar({ premio, cerimonias, filmes }) {
  const usados = new Set(cerimonias.flatMap((c) => c.categorias.flatMap((k) => k.indicados.map((x) => x.wiki))).filter(Boolean));
  const f = {};
  for (const w of [...usados].sort()) { const d = filmes[w] || {}; f[w] = d.tmdb ? [d.imdb || '', d.tmdb] : [d.imdb || '']; }
  return {
    premio,
    geradoEm: new Date().toISOString(),
    filmes: f,
    cerimonias: cerimonias.map((c) => [c.numero, c.ano, c.categorias.map((k) => [k.chave, k.original,
      k.indicados.map((x) => [x.titulo, x.wiki === x.titulo ? 1 : x.wiki || 0, x.pessoa, x.venceu ? 1 : 0])])]),
  };
}

function expandir(d) {
  const filmes = {};
  for (const [w, [imdb, tmdb]] of Object.entries(d.filmes || {})) filmes[w] = { imdb: imdb || '', tmdb: tmdb || '' };
  const em = d.geradoEm;
  const cerimonias = (d.cerimonias || []).map(([numero, ano, cats]) => {
    const categorias = cats
      // O filtro de TV vale também para o histórico já gerado.
      .filter(([chave, original]) => !DE_TV.test(`${chave} ${original}`))
      .map(([chave, original, ind]) => {
        const c = limparChave(chave);
        const o = limparChave(original);
        return {
          chave: c, original: o, nome: traduzir(c, o),
          indicados: ind.map(([titulo, wiki, pessoa, venceu]) => ({ titulo, wiki: wiki === 1 ? titulo : wiki || null, pessoa, extra: '', venceu: Boolean(venceu) })),
        };
      });
    return { premio: d.premio, numero, ano, existe: true, categorias, indicados: categorias.length > 0, vencedores: categorias.some((k) => k.indicados.some((x) => x.venceu)), em };
  });
  return { premio: d.premio, cerimonias, filmes };
}

// ---------- O que atualizar ----------

// As cerimônias que podem mudar: a do ano passado (se ainda não tem vencedores),
// a deste ano e a do ano que vem. Na temporada do prêmio, a cada 3 horas; fora, uma vez por dia.
function paraAtualizar(premioId, cerimoniasConhecidas, agora = new Date()) {
  const p = PREMIOS[premioId];
  const ano = agora.getUTCFullYear();
  const numeros = [...new Set([p.numero(ano - 1), p.numero(ano), p.numero(ano + 1)])].filter((n) => n >= 1);
  const validade = (p.temporada(agora) ? 3 : 24) * 60 * 60 * 1000;
  return numeros.filter((n) => {
    const c = cerimoniasConhecidas.find((x) => x.numero === n);
    if (!c) return true;
    if (c.vencedores && p.ano(n) < ano) return false; // já fechada
    return !(agora - Date.parse(c.em) < validade);
  });
}

// ---------- O acervo: histórico + o que foi buscado depois ----------
//
// ctx: { historico(id) → <premios-<id>.json> | Promise | null, lerCache() → obj | null, gravarCache(obj) }
// O cache (premios.json na pasta de dados) guarda as cerimônias buscadas pelo app,
// que valem por cima das do histórico.
class Acervo {
  constructor(ctx) {
    this.ctx = ctx;
    this.base = {};
    this.buscando = {};
    this.cache = (ctx.lerCache && ctx.lerCache()) || {};
  }

  historico(premioId) {
    if (!this.base[premioId]) {
      this.base[premioId] = (async () => {
        let h = null;
        try { h = await (this.ctx.historico && this.ctx.historico(premioId)); } catch { h = null; }
        return h ? expandir(h) : { premio: premioId, cerimonias: [], filmes: {} };
      })();
    }
    return this.base[premioId];
  }

  // Tudo do prêmio: cerimônias da mais nova para a mais antiga (inclusive as
  // anunciadas sem indicados ainda, para a aba aparecer) e o cadastro de filmes.
  async dados(premioId) {
    const p = PREMIOS[premioId];
    if (!p) return null;
    const h = await this.historico(premioId);
    const c = this.cache[premioId] || { cerimonias: [], filmes: {} };
    const porNumero = new Map(h.cerimonias.map((x) => [x.numero, x]));
    for (const x of c.cerimonias) if (x.indicados || !porNumero.has(x.numero)) porNumero.set(x.numero, x);
    const cerimonias = [...porNumero.values()].filter((x) => x.indicados || x.existe).sort((a, b) => b.numero - a.numero);
    return { premio: premioId, nome: p.nome, cerimonias, filmes: { ...h.filmes, ...c.filmes } };
  }

  // Busca de novo as cerimônias recentes (as que podem ter mudado). Devolve true se algo mudou.
  atualizar(premioId, { forcar = false } = {}) {
    if (this.buscando[premioId]) return this.buscando[premioId];
    const conhecidas = (this.cache[premioId] || { cerimonias: [] }).cerimonias;
    const numeros = forcar ? paraAtualizar(premioId, []) : paraAtualizar(premioId, conhecidas);
    if (!numeros.length) return Promise.resolve(false);
    this.buscando[premioId] = (async () => {
      const atual = await this.dados(premioId);
      const r = await buscarCerimonias(premioId, numeros, atual.filmes);
      const antes = JSON.stringify(conhecidas.filter((x) => numeros.includes(x.numero)).map(({ em, ...x }) => x));
      const c = this.cache[premioId] || { cerimonias: [], filmes: {} };
      c.cerimonias = [...c.cerimonias.filter((x) => !numeros.includes(x.numero)), ...r.cerimonias];
      // Só os filmes que não estão no histórico.
      const h = (await this.historico(premioId)).filmes;
      c.filmes = Object.fromEntries(Object.entries(r.filmes).filter(([w]) => !(w in h)));
      this.cache[premioId] = c;
      if (this.ctx.gravarCache) this.ctx.gravarCache(this.cache);
      return antes !== JSON.stringify(r.cerimonias.map(({ em, ...x }) => x));
    })().finally(() => { delete this.buscando[premioId]; });
    return this.buscando[premioId];
  }
}

module.exports = { Acervo, PREMIOS, listaPremios, CATEGORIAS_PT, traduzir, lerCategorias, lerFestival, lerPagina, textoLimpo, buscarCerimonias, idsDosFilmes, wikitexts, paraAtualizar, ordinal, compactar, expandir };
