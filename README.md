<p align="center">
  <img src="build/icon.png" width="96" alt="Ícone do NANDFlix: uma claquete">
</p>

<h1 align="center">NANDFlix</h1>

<p align="center">
  Sua lista de filmes com cara de streaming: capas, trailers tocando ao fundo, sorteio do que assistir
  e um clique para abrir o filme no <b>Stremio</b> ou registrar no <b>Letterboxd</b>.
</p>

---

O NANDFlix é um app de desktop para catalogar os filmes que você quer ver. Ele troca a planilha por uma interface no estilo Netflix: o filme sorteado ocupa o topo com o trailer rodando, as capas viram trailers ao passar o mouse e cada filme tem uma página de detalhes com notas, sinopse, elenco e duração. Na hora de assistir, ele abre o filme direto no Stremio.

## Download

| Arquivo | O que é |
|---|---|
| [`NANDFlix.exe`](NANDFlix.exe) | Versão portátil para Windows: é só abrir, não precisa instalar. |
| [`dist/NANDFlix-Setup-1.0.4.exe`](dist/NANDFlix-Setup-1.0.4.exe) | Instalador para Windows (cria atalho no menu Iniciar). |
| [`dist/NANDFlix-1.0.4-portable.exe`](dist/NANDFlix-1.0.4-portable.exe) | O mesmo portátil da raiz, com o número da versão. |

Os mesmos arquivos estão na página de [Releases](../../releases).

> O executável não é assinado digitalmente, então o Windows pode mostrar o aviso do SmartScreen na primeira vez. Clique em **Mais informações → Executar assim mesmo**.

## Funcionalidades

### Filme sorteado (topo da tela)
- O app já abre com um filme sorteado entre os que você ainda não viu.
- O trailer toca ao fundo, sem som, com botão para ligar o áudio.
- Capa pequena com o título ao lado, gênero, ano, duração e classificação, notas do IMDb, Metascore e Rotten Tomatoes, sinopse e botões: **Assistir**, **Mais info**, **Sortear outro**, **Marcar como visto** e **Letterboxd**.
- Os sorteios ficam num carrossel: dá para voltar aos anteriores pelas setas ou pelos pontinhos.
- O sorteio respeita o que está na tela: filtro de favoritos, busca e filtro por diretor.
- Clicar no trailer abre o **modo foco**: o vídeo ocupa quase a tela toda, com som e controles, continuando do ponto em que estava.

### Prévia ao passar o mouse
- Depois de 1 segundo sobre uma capa, ela cresce e vira o trailer, como na Netflix.
- A prévia traz botões para assistir, marcar visto, favoritar, abrir no Letterboxd e ver detalhes, além de ano, duração, gêneros e notas.
- Passar pelos botões redondos de cima da capa não dispara o trailer.

### Página de detalhes
- Janela centralizada, com o trailer tocando atrás da capa e do título.
- Ano, duração, classificação, notas, sinopse, direção, elenco e gêneros.
- Campos editáveis: título, ano, diretor, notas pessoais, link do Letterboxd, busca da capa e link do trailer (para trocar o que foi achado automaticamente).
- A partir do diretor: ver os filmes dele na sua lista ou abrir a página dele no Letterboxd.
- Baixar a capa, trocar por outra do OMDb ou usar uma imagem sua (também dá para arrastar a imagem para cima da capa).

### Listas
- **Filmes na sua lista**: fileira com os favoritos, rolagem suave pelas setas, trackpad ou Shift + roda do mouse, e a contagem de quantos você já viu.
- **Todos os filmes**: grade de capas ou lista compacta, filtros (todos, não vistos, vistos, favoritos), ordenação (ordem original, título, ano, diretor, país, adicionados recentemente) e o progresso de vistos.
- **Agrupar por diretor ou por país**: ordenando por um deles, a lista se separa em grupos com o nome e a quantidade de filmes (ex.: "Brasil · 6 filmes"). Cada filme entra no grupo do seu país principal; os países aparecem em português.
- **Filtrar por diretor ou país**: clicando no nome do grupo, ou no diretor e nos países da página de detalhes. Uma etiqueta mostra o filtro ativo e tira o filtro com um clique.
- Busca por título, ano, diretor, país ou notas, sem diferenciar acentos.

### Calendário
Um diário dos filmes que você vê e um planejador do que vai ver, aberto pelo botão de calendário no topo, ao lado da busca.

- **O que você viu, dia a dia**: o mês atual abre com o dia de hoje destacado, e cada dia em que você viu um filme vira um pequeno pôster, com as capas por cima da capa desfocada. As setas trocam de mês (com uma transição deslizando de um mês para o outro).
- Marcar um filme como visto já registra o dia. Para rever, use **Vi de novo hoje** nos detalhes: o filme aparece em todos os dias em que foi visto. Esqueceu de marcar? **Lançar outro dia** escolhe a data, e cada data pode ser apagada.
- **Pensando em ver hoje**: separe os filmes que você está considerando pelo botão de calendário na capa, na prévia ou nos detalhes. Eles ganham um selo roxo e aparecem no dia de hoje; ao marcar um como visto, ele passa para os vistos do dia. A watchlist é do dia: quando o dia vira, ela some.
- **Sortear um filme**: na página de hoje, as capas passam rápido até parar num filme não visto, que entra na watchlist de hoje (com opção de desfazer).
- **Página do dia**: clique num dia para ver as capas grandes, com os vistos centralizados e a watchlist com Assistir, marcar visto ou tirar da lista.
- **Planeje arrastando**: arraste a capa de um filme da watchlist para outro dia. Hoje ou depois, ele vai para a watchlist daquele dia; antes de hoje, fica registrado como visto nele. Segure sobre as setas ‹ › para trocar de mês sem soltar. Sem arrastar: **Passar para amanhã** e **Trazer para hoje** na página do dia.
- **Filme do mês**: escolha o seu favorito entre os filmes vistos em cada mês, pelo botão dourado no topo do mês ou por **Marcar como filme do mês** na página do dia. Ele aparece no topo com um troféu, e a capa dele vai para a frente no dia em que foi visto, com aro dourado.
- O dia vira às 5h da manhã: um filme visto de madrugada conta para a noite anterior.
- Respeita o "reduzir movimento" do sistema: com os efeitos de animação desligados no Windows, o calendário não anima.

### Tierlist
Uma tierlist dos filmes que você já viu, aberta pelo botão de medalha ao lado do calendário.

- Começa com as tiers **S, A, B, C, D e F**; os filmes vistos que ainda não estão em nenhuma ficam na bandeja **Sem tier**, embaixo, com um campo para filtrar.
- **Arraste as capas** para as tiers, entre elas ou de volta para a bandeja. As outras capas abrem espaço deslizando, e a ordem dentro de cada tier fica salva.
- **Clique no nome** de uma tier para renomeá-la; a fonte diminui sozinha para nomes longos caberem.
- **Arraste pela alça ⋮⋮** (ou pelo rótulo) para mudar a tier de posição.
- Cada tier tem uma **paleta de cores** (ou qualquer cor pelo seletor do sistema) e pode ser apagada, com opção de desfazer. **Nova tier** cria quantas você quiser.
- As tiers dividem a altura da janela, então as seis padrão aparecem inteiras; com muitas tiers, a lista passa a rolar.

### Stremio e Letterboxd
- **Assistir** abre o filme no app do Stremio e traz a janela para a frente. Também dá para usar o Stremio Web.
- **Letterboxd** abre a página do filme para registrar que você viu.

### Capas, trailers e informações
- Capas e notas vêm do [OMDb](https://www.omdbapi.com/). As capas ficam salvas no computador e funcionam sem internet.
- **Buscar capas que faltam** procura em segundo plano, até 3 por vez, e avisa quando o limite diário do OMDb acaba (continua no dia seguinte).
- País, notas, gêneros e sinopse de todos os filmes também são buscados em segundo plano ao abrir o app (uma consulta por filme). Para forçar na hora, use **Configurações → Buscar informações que faltam** ou **Buscar agora** no grupo "País ainda não carregado"; uma barra no topo mostra o progresso.
- Trailers vêm do YouTube, achados automaticamente pelo título e ano.
- A duração vem do [Wikidata](https://www.wikidata.org/), que não tem limite de consultas.

### Planilha e backups
- Importa a lista de uma planilha `.xlsx`, substituindo a atual ou juntando as duas (filmes repetidos são reconhecidos).
- Exporta a lista para `.xlsx`.
- Faz um backup automático a cada abertura (guarda os 5 últimos) e permite exportar e importar backups.

### Atalhos

| Atalho | Ação |
|---|---|
| `Ctrl + F` | Pesquisar |
| `Ctrl + N` | Adicionar filme |
| `R` | Sortear |
| `Esc` | Fechar janela, prévia ou pesquisa |

## Primeiro uso

1. Abra o `NANDFlix.exe`.
2. Cole a sua chave do OMDb na tela que aparece (veja abaixo como conseguir uma).
3. Clique em **Importar planilha** e escolha o seu `.xlsx`, ou adicione filmes pelo **+**.
4. As capas começam a ser buscadas sozinhas.

## Como conseguir a sua chave do OMDb

As capas, notas e sinopses vêm do [OMDb](https://www.omdbapi.com/), que pede uma chave por pessoa. Ela é gratuita e dá direito a 1.000 consultas por dia, o bastante para buscar as capas de uma lista grande em um ou dois dias.

1. Entre em [omdbapi.com/apikey.aspx](https://www.omdbapi.com/apikey.aspx).
2. Marque o plano **FREE (1,000 daily limit)**, preencha seu e-mail, nome, sobrenome e o campo **Use** (pode ser algo como "catálogo pessoal de filmes") e clique em **Submit**.
3. Abra o e-mail que o OMDb mandou. Ele traz a sua chave (8 letras e números, como `1a2b3c4d`) e um **link de ativação**. Clique no link: sem ativar, a chave não funciona.
4. Abra o NANDFlix e cole a chave na tela **Chave do OMDb**.

Enquanto não houver chave salva, essa tela aparece toda vez que o app abre; dá para fechar em **Agora não** e usar o app sem capas novas. A chave pode ser trocada depois em **Configurações**, e o app confere se ela funciona antes de salvar.

## Onde ficam os dados

Tudo fica no seu computador, em `%APPDATA%\Filmes legais` (Windows):

- `filmes.json`: a lista, salva a cada mudança.
- `capas/`: as imagens baixadas.
- `backups/`: os 5 últimos backups.
- `config.json`: a sua chave do OMDb, preferências e posição da janela.

**Configurações → Abrir pasta de dados** leva direto a ela.

## Desenvolvimento

Precisa do [Node.js](https://nodejs.org) (versão LTS).

```bash
npm install        # instala as dependências
npm start          # abre o app em modo de desenvolvimento
npm run build      # gera o portátil e o instalador em dist/
npm run import -- "minha-lista.xlsx"   # importa uma planilha pela linha de comando
```

Para importar pela linha de comando com filmes já salvos, acrescente `--substituir` ou `--juntar` (com o app fechado).

O `build` foi testado no Windows. A configuração para Mac (`.dmg`) e Linux (`.AppImage`) existe, mas cada sistema precisa gerar o próprio executável.

### Estrutura

```
NANDFlix/
├── NANDFlix.exe        versão portátil pronta
├── dist/               executáveis gerados pelo build
├── main.js             processo principal do Electron: janela, dados, capas, trailers, Stremio
├── preload.js          ponte segura entre a interface e o processo principal
├── lib/
│   ├── armazem.js      leitura e gravação dos dados e backups
│   ├── filmes.js       modelo do filme, repetidos e junção de listas
│   ├── omdb.js         busca de capas e informações no OMDb
│   ├── planilha.js     importação e exportação de .xlsx
│   ├── trailer.js      busca do trailer no YouTube
│   └── wikidata.js     duração dos filmes pelo Wikidata
├── src/                interface (HTML, CSS e JavaScript puros)
├── scripts/import.js   importação pela linha de comando
└── build/              ícone do app
```

### Tecnologias

- [Electron](https://www.electronjs.org/), com HTML, CSS e JavaScript puros, sem framework.
- [SheetJS](https://sheetjs.com/) para as planilhas e [Lucide](https://lucide.dev/) para os ícones.
- APIs: OMDb (capas e notas), YouTube (trailers, pelo player sem cookies) e Wikidata (duração).
- Fonte [Montserrat](https://fonts.google.com/specimen/Montserrat) (licença OFL), pelo pacote `@fontsource/montserrat`.
